import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  ChatMessage,
  InteractionMode,
  AIScopeMode,
  SelectionRange,
  ConnectionConfig,
  ProjectFile,
  WorkspaceMode,
  SupportedLanguage,
  ChatImageAttachment,
  VersionCheckpoint,
  DiagnosticItem,
  AssistantMode,
} from '../types';
import {
  buildProjectContextPrompt,
  PROJECT_CONTEXT_CHAR_LIMIT,
  CHAT_HISTORY_LIMIT,
  buildChatHistoryPayload,
  normalizeFilePath,
  extractFileNameFromPath,
  chatHistoryToOpenAIMessages,
} from '../utils/workspace';
import { fillTemplate } from '../utils/templateEngine';
import { cleanCodeOutput } from '../utils/streamReader';
import { callGeminiClientDirect } from '../utils/geminiClient';
import { locateTarget, locateChangedRegion } from '../utils/codeLocator';
import { computeLineDiff } from '../utils/diff';
import { groupIntoHunks } from '../utils/hunks';
import { safeReadJsonResponse } from './useAppConfig';
import {
  dispatchGeminiPlan,
  dispatchGeminiEdit,
  dispatchColabStream,
  detectSelectionTargetFromHistory,
  requestTeacherExplanation,
} from '../utils/aiDispatchers';

const AUTOFIX_MAX_ATTEMPTS = 3;

export interface UseAiWorkflowOptions {
  code: string;
  setCode: React.Dispatch<React.SetStateAction<string>>;
  language: SupportedLanguage;
  pushHistory: (newCode: string) => void;
  addCheckpoint: (cp: Omit<VersionCheckpoint, 'id' | 'timestamp'>) => void;
  files: ProjectFile[];
  setFiles: React.Dispatch<React.SetStateAction<ProjectFile[]>>;
  activeFileId: string;
  activeFile?: ProjectFile;
  workspaceMode: WorkspaceMode;
  config: ConnectionConfig;
  setConfig: React.Dispatch<React.SetStateAction<ConnectionConfig>>;
  assistantMode: AssistantMode;
  attachedImages: ChatImageAttachment[];
  setAttachedImages: React.Dispatch<React.SetStateAction<ChatImageAttachment[]>>;
  setIsAnalyzingVision: React.Dispatch<React.SetStateAction<boolean>>;
  onOpenSettings?: () => void;
}

export function useAiWorkflow(options: UseAiWorkflowOptions) {
  const {
    code,
    setCode,
    language,
    pushHistory,
    addCheckpoint,
    files,
    setFiles,
    activeFileId,
    activeFile,
    workspaceMode,
    config,
    setConfig,
    assistantMode,
    attachedImages,
    setAttachedImages,
    setIsAnalyzingVision,
    onOpenSettings,
  } = options;

  // Selection & AI Scope state
  const [aiScopeMode, setAiScopeMode] = useState<AIScopeMode>('full');
  const [selection, setSelection] = useState<SelectionRange | null>(null);
  const [isDetectingSelectionTarget, setIsDetectingSelectionTarget] = useState<boolean>(false);

  // Auto-Fix state
  const autoFixAttemptsRef = useRef(0);
  const autoFixDebounceRef = useRef<any>(null);
  const autoFixResetTimerRef = useRef<any>(null);
  const [isAutoFixing, setIsAutoFixing] = useState(false);
  const [autoFixGaveUp, setAutoFixGaveUp] = useState(false);
  const autoFixEligibleRef = useRef(false);
  const [pendingManualError, setPendingManualError] = useState<string | null>(null);

  const markManualEdit = useCallback(() => {
    autoFixEligibleRef.current = false;
    if (autoFixDebounceRef.current) {
      clearTimeout(autoFixDebounceRef.current);
      autoFixDebounceRef.current = null;
    }
    setPendingManualError(null);
  }, []);

  const [explainingMsgId, setExplainingMsgId] = useState<string | null>(null);

  // Chat & AI state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [instruction, setInstruction] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [interactionMode, setInteractionMode] = useState<InteractionMode>('plan');

  const [status, setStatus] = useState<'connected' | 'disconnected' | 'testing'>('testing');
  const [statusText, setStatusText] = useState<string>('verificando...');

  // Controller para cancelamento sob demanda pelo usuário
  const activeAbortControllerRef = useRef<AbortController | null>(null);

  const handleCancelInstruction = useCallback(() => {
    if (activeAbortControllerRef.current) {
      try {
        activeAbortControllerRef.current.abort();
      } catch (err) {
        console.warn('Erro ao abortar requisição ativa:', err);
      }
      activeAbortControllerRef.current = null;
    }

    setIsLoading(false);
    setIsAnalyzingVision(false);

    setMessages((prev) => {
      const filtered = prev.filter((m) => !m.streaming);
      const lastMsg = filtered[filtered.length - 1];
      if (lastMsg && (lastMsg.text?.includes('interrompida') || lastMsg.text?.includes('cancelada'))) {
        return filtered;
      }
      return [
        ...filtered,
        {
          id: `cancel-${Date.now()}`,
          type: 'explanation',
          text: '⏹️ Geração interrompida pelo usuário.',
          mode: interactionMode,
          timestamp: Date.now(),
        },
      ];
    });

    setStatus('connected');
    setStatusText('interrompido');
  }, [interactionMode, setIsAnalyzingVision]);

  // Check initial environment health
  useEffect(() => {
    async function checkHealth() {
      try {
        const res = await fetch('/api/health');
        if (res.ok) {
          const data = await res.json();
          if (data.hasGeminiKey) {
            setStatus('connected');
            setStatusText('Gemini conectado');
          } else {
            setStatus('disconnected');
            setStatusText('sem conexão');
          }
        } else {
          setStatus('disconnected');
          setStatusText('sem conexão');
        }
      } catch {
        setStatus('disconnected');
        setStatusText('sem conexão');
      }
    }
    checkHealth();
  }, []);

  // Update status whenever config changes
  useEffect(() => {
    if (config.provider === 'gemini') {
      setStatus('connected');
      setStatusText('Gemini conectado');
    } else {
      if (config.endpointUrl.trim()) {
        setStatus('testing');
        setStatusText('endpoint pronto');
      } else {
        setStatus('disconnected');
        setStatusText('sem endpoint');
      }
    }
  }, [config.provider, config.endpointUrl]);

  // Apply proposed diff
  const handleApplyDiff = useCallback((
    msgId: string,
    newCode: string,
    scopeOverride?: 'full' | 'selection'
  ) => {
    autoFixEligibleRef.current = true;
    setPendingManualError(null);
    const changedSelection = locateChangedRegion(code, newCode);

    setCode(newCode);
    pushHistory(newCode);

    setFiles((prev) =>
      prev.map((f) => (f.id === activeFileId ? { ...f, content: newCode } : f))
    );

    setSelection(changedSelection);

    const targetMsg = messages.find((m) => m.id === msgId);
    const effectiveScopeForCheckpoint = scopeOverride || targetMsg?.scope;
    addCheckpoint({
      description: `Edição IA: ${effectiveScopeForCheckpoint === 'selection' ? 'Trecho Selecionado' : 'Arquivo Completo'}`,
      code: newCode,
      source: 'ai',
      fileId: activeFileId,
      fileName: activeFile?.name,
    });

    setMessages((prev) =>
      prev.map((m) => (m.id === msgId ? { ...m, applied: true, discarded: false } : m))
    );
  }, [code, setCode, pushHistory, setFiles, activeFileId, messages, addCheckpoint, activeFile]);

  // Apply partial diff (hunk-by-hunk)
  const handleApplyPartialDiff = useCallback((_msgId: string, updatedCode: string) => {
    autoFixEligibleRef.current = true;
    setPendingManualError(null);
    setCode(updatedCode);
    pushHistory(updatedCode);

    setFiles((prev) =>
      prev.map((f) => (f.id === activeFileId ? { ...f, content: updatedCode } : f))
    );

    addCheckpoint({
      description: 'Aplicação parcial de hunk de diff',
      code: updatedCode,
      source: 'ai',
      fileId: activeFileId,
      fileName: activeFile?.name,
    });
  }, [setCode, pushHistory, setFiles, activeFileId, addCheckpoint, activeFile]);

  // Discard proposed diff
  const handleDiscardDiff = useCallback((msgId: string) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === msgId ? { ...m, discarded: true } : m))
    );
  }, []);

  // Clear chat log
  const handleClearChat = useCallback(() => {
    setMessages([]);
  }, []);

  const handleExplainChange = useCallback(async (msgId: string) => {
    if (explainingMsgId) return;
    const idx = messages.findIndex((m) => m.id === msgId);
    if (idx === -1) return;
    const proposal = messages[idx];
    if (proposal.oldCode === undefined || proposal.newCode === undefined) return;

    let userRequest = '';
    for (let i = idx - 1; i >= 0; i--) {
      if (messages[i].type === 'instruction') {
        userRequest = messages[i].text || '';
        break;
      }
    }

    setExplainingMsgId(msgId);
    try {
      const explanationText = await requestTeacherExplanation(proposal, userRequest, config);
      setMessages((prev) =>
        prev.map((m) => (m.id === msgId ? { ...m, changeExplanation: explanationText } : m))
      );
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          type: 'error',
          text: `Não consegui gerar a explicação agora. ${err?.message || ''}`.trim(),
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setExplainingMsgId(null);
    }
  }, [explainingMsgId, messages, config]);

  // Send instruction or question to AI
  const handleSendInstruction = useCallback(async (
    overridePrompt?: string,
    forceScope?: AIScopeMode,
    forceMode?: InteractionMode
  ) => {
    const rawText = typeof overridePrompt === 'string' ? overridePrompt : instruction;
    const trimmed = rawText.trim();
    if ((!trimmed && attachedImages.length === 0) || isLoading) return;

    const currentMode = forceMode || interactionMode;
    const effectiveScope = forceScope || aiScopeMode;
    const activeProvider =
      currentMode === 'plan'
        ? config.planningProvider || 'colab'
        : config.executionProvider || 'gemini';

    const resolveColabModel = (modeModel?: string): string => {
      const mode = (modeModel || '').trim();
      const colab = (config.colabModel || '').trim();
      const detected = Array.isArray(config.detectedModels) ? config.detectedModels : [];
      if (detected.length > 0) {
        if (mode && detected.includes(mode)) return mode;
        if (colab && detected.includes(colab)) return colab;
        return detected[0];
      }
      if (mode && !mode.includes('qwen3-vl-30b-a3b-128k')) return mode;
      return colab;
    };

    const activeColabModel =
      currentMode === 'plan'
        ? resolveColabModel(config.colabPlanningModel)
        : resolveColabModel(config.colabExecutionModel);

    if (currentMode === 'execute' && effectiveScope === 'selection') {
      if (!selection || !selection.text.trim()) {
        const infoMsg: ChatMessage = {
          id: `info-${Date.now()}`,
          type: 'error',
          text: 'Modo Seleção Ativo: Nenhum trecho de código foi selecionado. Por favor, selecione com o mouse as linhas desejadas no editor ou mude para o "Modo Completo".',
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, infoMsg]);
        return;
      }
    }

    if (activeProvider === 'colab' && !config.endpointUrl.trim()) {
      if (onOpenSettings) onOpenSettings();
      return;
    }

    const imagesToSend = [...attachedImages];
    setAttachedImages([]);
    const defaultText =
      imagesToSend.length > 0 ? 'Analise a imagem anexada e ajude com o problema exibido.' : '';
    const userPromptText = trimmed || defaultText;

    const activeModelAcceptsVision =
      activeProvider === 'gemini'
        ? true
        : Boolean(
            (activeColabModel && config.modelVisionMap?.[activeColabModel]) ||
            (currentMode === 'plan' ? config.planningAcceptsImages : config.executionAcceptsImages)
          );

    let visionAnalysisText: string | undefined;

    if (imagesToSend.length > 0 && !activeModelAcceptsVision) {
      if (config.visionProvider === 'none') {
        const errMessage: ChatMessage = {
          id: `err-${Date.now()}`,
          type: 'error',
          text: `O modelo ativo (${
            activeProvider === 'gemini' ? 'Gemini' : activeColabModel || 'Colab'
          }) não aceita imagens diretamente e a Visão Auxiliar está desativada nas Configurações. Ative a Visão Auxiliar na aba 'Modos' para transcrever e analisar prints automaticamente.`,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, errMessage]);
        return;
      }

      setIsAnalyzingVision(true);
      const visionAbort = new AbortController();
      activeAbortControllerRef.current = visionAbort;
      try {
        const visionRes = await fetch('/api/ai/vision', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: visionAbort.signal,
          body: JSON.stringify({
            images: imagesToSend,
            prompt: config.visionPrompt || undefined,
            provider: config.visionProvider || 'gemini',
            geminiModel: config.visionModel || 'gemini-3.8-flash',
            colabModel: resolveColabModel(config.colabVisionModel) || undefined,
            endpointUrl: config.endpointUrl,
            apiKeys: config.geminiKeys || [],
            geminiKeys: config.geminiKeys || [],
            authToken: config.authToken,
            useProxy: config.useProxy,
          }),
        });
        const visionData = await safeReadJsonResponse(visionRes);
        if (!visionRes.ok) {
          throw new Error(visionData.error || `Falha na etapa de Visão Auxiliar: HTTP ${visionRes.status}`);
        }
        visionAnalysisText = visionData.analysis;
      } catch (err: any) {
        if (err.name === 'AbortError' || activeAbortControllerRef.current === null) {
          return;
        }
        throw err;
      } finally {
        setIsAnalyzingVision(false);
      }
    }

    const effectiveInstruction = visionAnalysisText
      ? `[ANÁLISE DO MODELO DE VISÃO AUXILIAR SOBRE O PRINT/IMAGEM ANEXADO]:
${visionAnalysisText}

[INSTRUÇÃO DO USUÁRIO]:
${userPromptText}`
      : userPromptText;

    const isSelection = effectiveScope === 'selection' && Boolean(selection);
    const capturedSelection = selection;

    const userMsg: ChatMessage = {
      id: String(Date.now()),
      type: 'instruction',
      text: userPromptText,
      images: imagesToSend.length > 0 ? imagesToSend : undefined,
      imageAnalysis: visionAnalysisText,
      mode: currentMode,
      scope: isSelection ? 'selection' : 'full',
      selectionRange: isSelection && capturedSelection ? capturedSelection : undefined,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInstruction('');
    setIsLoading(true);

    const abortController = new AbortController();
    activeAbortControllerRef.current = abortController;

    const currentCode = code;
    const isProjectMode = workspaceMode === 'project' && files.length > 0;
    const activeFileObj = files.find((f) => f.id === activeFileId);
    const activeFilePath = isProjectMode
      ? (activeFileObj?.path || activeFileObj?.name || 'index.html')
      : undefined;

    const projectFilesPayload = isProjectMode
      ? files.map((f) => ({
          path: f.path || f.name,
          language: f.language,
          content: f.id === activeFileId ? currentCode : f.content,
        }))
      : undefined;

    const chatHistoryPayload = buildChatHistoryPayload(messages, CHAT_HISTORY_LIMIT);
    const multiFileContext = buildProjectContextPrompt(projectFilesPayload, activeFilePath, PROJECT_CONTEXT_CHAR_LIMIT);

    try {
      if (currentMode === 'plan') {
        if (activeProvider === 'gemini') {
          const planResult = await dispatchGeminiPlan({
            effectiveInstruction,
            currentCode,
            selectedText: isSelection && capturedSelection ? capturedSelection.text : undefined,
            scope: isSelection ? 'selection' : 'full',
            language,
            config,
            imagesToSend: activeModelAcceptsVision && imagesToSend.length > 0 ? imagesToSend : undefined,
            projectFilesPayload,
            activeFilePath,
            chatHistoryPayload,
            signal: abortController.signal,
          });

          const planMsg: ChatMessage = {
            id: `plan-${Date.now()}`,
            type: 'explanation',
            text: planResult.text,
            mode: 'plan',
            timestamp: Date.now(),
            provider: `${config.geminiModel || 'Gemini'} (Planejamento)`,
            usedKeyMask: planResult.usedKeyMask,
          };
          setMessages((prev) => [...prev, planMsg]);
          setStatus('connected');
          setStatusText('Gemini pronto');
        } else {
          // Colab planning stream
          const rawEndpoint = (config.endpointUrl || '').trim();
          if (!rawEndpoint) {
            throw new Error(
              'O endpoint do Google Colab / ngrok não foi configurado.\n\n• Para usar a IA agora: altere o provedor de Planejamento para "Gemini" no seletor ou nas Configurações (ícone de engrenagem).\n• Para usar o Colab: abra as Configurações (aba "Google Colab / ngrok") e informe a URL do túnel ngrok do seu notebook.'
            );
          }

          let targetUrl = rawEndpoint;
          if (!targetUrl.includes('/v1/') && !targetUrl.includes('/api/')) {
            targetUrl = targetUrl.replace(/\/+$/, '') + '/v1/chat/completions';
          }

          const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'ngrok-skip-browser-warning': '1',
          };
          if (config.authToken) headers['Authorization'] = `Bearer ${config.authToken}`;

          let modelName = activeColabModel;
          if (!modelName) {
            try {
              const parsed = JSON.parse(config.requestTemplate);
              if (parsed.model && !parsed.model.includes('mistral')) {
                modelName = parsed.model;
              }
            } catch {}
          }

          const basePromptText = multiFileContext.hasMultiFiles
            ? `Você possui visibilidade de todo o projeto aberto pelo usuário no workspace. O usuário está com o arquivo "${activeFilePath || 'ativo'}" aberto no editor no momento.

${multiFileContext.contextText}
${
  isSelection && capturedSelection
    ? `\nTrecho selecionado no arquivo ativo para foco específico:\n\`\`\`${language || ''}\n${capturedSelection.text}\n\`\`\`\n`
    : ''
}
Dúvida ou plano de trabalho do usuário:
${effectiveInstruction}`
            : `Código atual (${language}):\n\`\`\`${language}\n${
                isSelection && capturedSelection ? capturedSelection.text : currentCode
              }\n\`\`\`\n\nDúvida ou plano de trabalho do usuário:\n${effectiveInstruction}`;

          const promptUserContent =
            activeModelAcceptsVision && imagesToSend.length > 0
              ? [
                  {
                    type: 'text',
                    text: basePromptText,
                  },
                  ...imagesToSend.map((img) => ({
                    type: 'image_url',
                    image_url: { url: `data:${img.mimeType};base64,${img.base64}` },
                  })),
                ]
              : basePromptText;

          const promptBody: any = {
            model: modelName || 'default',
            messages: [
              {
                role: 'system',
                content:
                  'Você é um arquiteto de software e mentor sênior, atuando no modo Planejamento deste app. Converse naturalmente com o usuário, no mesmo tom e tamanho da mensagem dele: se for um cumprimento, uma dúvida rápida ou um comentário solto, responda de forma direta e conversacional, sem montar estrutura nenhuma. Só organize a resposta como um plano de ação formal, em Markdown com etapas, quando o usuário pedir isso claramente (ex: "monta um plano", "como você estruturaria isso", "quais os passos pra fazer X"). Nunca altere o código diretamente nem retorne diffs — este modo é só para conversa e planejamento; a edição real do código acontece no modo Execução.',
              },
              ...chatHistoryToOpenAIMessages(chatHistoryPayload),
              {
                role: 'user',
                content: promptUserContent,
              },
            ],
            temperature: 0.4,
            stream: true,
          };

          const planMsgId = `plan-${Date.now()}`;
          const initialPlanMsg: ChatMessage = {
            id: planMsgId,
            type: 'explanation',
            text: '',
            thinking: '',
            mode: 'plan',
            timestamp: Date.now(),
            provider: `Colab / Ollama (${modelName || 'Ativo'})`,
            streaming: true,
          };
          setMessages((prev) => [...prev, initialPlanMsg]);

          const streamResult = await dispatchColabStream({
            targetUrl,
            headers,
            promptBody,
            useProxy: config.useProxy,
            signal: abortController.signal,
            onProgress: (progress) => {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === planMsgId
                    ? {
                        ...m,
                        text: progress.content,
                        thinking: progress.thinking,
                      }
                    : m
                )
              );
            },
          });

          setMessages((prev) =>
            prev.map((m) =>
              m.id === planMsgId
                ? {
                    ...m,
                    text:
                      streamResult.content ||
                      (streamResult.thinking
                        ? '*(Raciocínio concluído sem texto final)*'
                        : 'Sem resposta do assistente de planejamento.'),
                    thinking: streamResult.thinking,
                    streaming: false,
                    warning: streamResult.warning,
                  }
                : m
            )
          );

          setStatus('connected');
          setStatusText('Colab pronto');
        }
      } else {
        // === MODO EXECUÇÃO ===
        if (activeProvider === 'gemini') {
          const editResult = await dispatchGeminiEdit({
            effectiveInstruction,
            currentCode,
            selectedText: isSelection && capturedSelection ? capturedSelection.text : undefined,
            scope: isSelection ? 'selection' : 'full',
            language,
            config,
            imagesToSend: activeModelAcceptsVision && imagesToSend.length > 0 ? imagesToSend : undefined,
            projectFilesPayload,
            activeFilePath,
            chatHistoryPayload,
            signal: abortController.signal,
          });

          const returnedSnippetOrCode = editResult.code;
          if (typeof returnedSnippetOrCode !== 'string' || !returnedSnippetOrCode.trim()) {
            throw new Error('A IA não retornou um formato de código válido.');
          }

          if (isSelection && capturedSelection) {
            const fullUpdatedCode =
              currentCode.slice(0, capturedSelection.from) +
              returnedSnippetOrCode +
              currentCode.slice(capturedSelection.to);

            const proposalMsg: ChatMessage = {
              id: `prop-${Date.now()}`,
              type: 'proposal',
              oldCode: capturedSelection.text,
              newCode: returnedSnippetOrCode,
              fullNewCode: fullUpdatedCode,
              scope: 'selection',
              selectionRange: capturedSelection,
              applied: false,
              discarded: false,
              timestamp: Date.now(),
              provider: `${config.geminiModel || 'Gemini'} (Modo Seleção)`,
              usedKeyMask: editResult.usedKeyMask,
              mode: 'execute',
            };

            setMessages((prev) => [...prev, proposalMsg]);

            if (assistantMode === 'basico') {
              handleApplyDiff(proposalMsg.id, proposalMsg.fullNewCode, proposalMsg.scope);
            }
          } else {
            const proposalMsg: ChatMessage = {
              id: `prop-${Date.now()}`,
              type: 'proposal',
              oldCode: currentCode,
              newCode: returnedSnippetOrCode,
              fullNewCode: returnedSnippetOrCode,
              scope: 'full',
              applied: false,
              discarded: false,
              timestamp: Date.now(),
              provider: `${config.geminiModel || 'Gemini'} (Modo Completo)`,
              usedKeyMask: editResult.usedKeyMask,
              mode: 'execute',
            };

            setMessages((prev) => [...prev, proposalMsg]);

            if (assistantMode === 'basico') {
              handleApplyDiff(proposalMsg.id, proposalMsg.fullNewCode, proposalMsg.scope);
            }
          }

          setStatus('connected');
          setStatusText('Gemini pronto');
        } else {
          // Colab execution mode with streaming
          let body: any;
          const snippetToPrompt =
            isSelection && capturedSelection ? capturedSelection.text : currentCode;

          let effectiveColabInstruction = effectiveInstruction;
          if (multiFileContext.hasMultiFiles) {
            const colabExecContext =
              isSelection && capturedSelection
                ? multiFileContext
                : buildProjectContextPrompt(projectFilesPayload, activeFilePath, PROJECT_CONTEXT_CHAR_LIMIT, { omitActiveFileContent: true });
            effectiveColabInstruction = `[CONTEXTO ARQUITETURAL DE TODO O PROJETO (${projectFilesPayload?.length || files.length} arquivos)]:
${colabExecContext.contextText}

[INSTRUÇÃO DE EDIÇÃO]:
O arquivo que você está editando é o arquivo ativo: "${activeFilePath || 'arquivo ativo'}".
Retorne ESTRITAMENTE o novo código modificado apenas deste arquivo ativo ("${activeFilePath || 'arquivo ativo'}"), mantendo perfeita harmonia e integração com os demais arquivos do projeto.
Instrução do usuário:
${effectiveInstruction}`;
          }

          try {
            const filled = fillTemplate(config.requestTemplate, {
              code: snippetToPrompt,
              instruction: effectiveColabInstruction,
            });
            body = JSON.parse(filled);
            if (Array.isArray(body.messages)) {
              const historyMessages = chatHistoryToOpenAIMessages(chatHistoryPayload);
              if (historyMessages.length > 0) {
                const lastUserIdxForHistory = body.messages.map((m: any) => m.role).lastIndexOf('user');
                const insertAt = lastUserIdxForHistory !== -1 ? lastUserIdxForHistory : body.messages.length;
                body.messages.splice(insertAt, 0, ...historyMessages);
              }
            }
            if (activeColabModel) {
              body.model = activeColabModel;
            } else if (config.colabModel?.trim()) {
              body.model = config.colabModel.trim();
            }

            if (activeModelAcceptsVision && imagesToSend.length > 0 && Array.isArray(body.messages)) {
              const lastUserIdx = body.messages.map((m: any) => m.role).lastIndexOf('user');
              if (lastUserIdx !== -1) {
                const origContent = body.messages[lastUserIdx].content;
                const textContent =
                  typeof origContent === 'string' ? origContent : JSON.stringify(origContent);
                body.messages[lastUserIdx].content = [
                  { type: 'text', text: textContent },
                  ...imagesToSend.map((img) => ({
                    type: 'image_url',
                    image_url: { url: `data:${img.mimeType};base64,${img.base64}` },
                  })),
                ];
              }
            }
          } catch {
            throw new Error(
              'O modelo de requisição nas configurações avançadas não gerou um JSON válido. Verifique em "Conexão > Avançado".'
            );
          }

          body.stream = true;

          const rawExecEndpoint = (config.endpointUrl || '').trim();
          if (!rawExecEndpoint) {
            throw new Error(
              'O endpoint do Google Colab / ngrok não foi configurado.\n\n• Para gerar código com a IA agora: altere o provedor de Execução para "Gemini" no seletor ou nas Configurações (ícone de engrenagem).\n• Para usar o Colab: abra as Configurações (aba "Google Colab / ngrok") e informe a URL do túnel ngrok do seu notebook.'
            );
          }

          const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'ngrok-skip-browser-warning': '1',
          };
          if (config.authToken) headers['Authorization'] = `Bearer ${config.authToken}`;

          let targetUrl = rawExecEndpoint;
          if (!targetUrl.includes('/v1/') && !targetUrl.includes('/api/')) {
            targetUrl = targetUrl.replace(/\/+$/, '') + '/v1/chat/completions';
          }

          const streamMsgId = `stream-${Date.now()}`;
          const initialExecMsg: ChatMessage = {
            id: streamMsgId,
            type: 'explanation',
            text: 'Conectando e iniciando streaming do código...',
            thinking: '',
            mode: 'execute',
            timestamp: Date.now(),
            provider: `Colab / Ollama (${body.model || 'Ativo'})`,
            streaming: true,
          };
          setMessages((prev) => [...prev, initialExecMsg]);

          const streamResult = await dispatchColabStream({
            targetUrl,
            headers,
            promptBody: body,
            useProxy: config.useProxy,
            signal: abortController.signal,
            onProgress: (progress) => {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === streamMsgId
                    ? {
                        ...m,
                        text: progress.content || (progress.thinking ? '🧠 Pensando...' : 'Recebendo código...'),
                        thinking: progress.thinking,
                      }
                    : m
                )
              );
            },
          });

          if (abortController.signal.aborted) {
            const abortErr: any = new Error('Geração cancelada pelo usuário.');
            abortErr.name = 'AbortError';
            throw abortErr;
          }
          if (streamResult.truncated) {
            const cutErr: any = new Error('A resposta do modelo no Colab/Kaggle foi cortada porque atingiu o limite de tokens de saída (num_predict). Nada foi alterado no seu código. Peça uma alteração menor ou aumente o num_predict do modelo.');
            cutErr.truncated = true;
            throw cutErr;
          }
          if (streamResult.interrupted) {
            const dropErr: any = new Error('A conexão com o servidor caiu antes de a resposta terminar. Nada foi alterado no seu código. Tente novamente.');
            dropErr.truncated = true;
            throw dropErr;
          }

          const extractedCode = cleanCodeOutput(streamResult.content);

          if (!extractedCode.trim() && !streamResult.thinking.trim()) {
            throw new Error(
              'A resposta do modelo não continha código nem raciocínio. Verifique o prompt ou o modelo configurado.'
            );
          }

          const codeToUse = extractedCode.trim() || streamResult.content;

          if (isSelection && capturedSelection) {
            const fullUpdatedCode =
              currentCode.slice(0, capturedSelection.from) +
              codeToUse +
              currentCode.slice(capturedSelection.to);

            const proposalMsg: ChatMessage = {
              id: `prop-${Date.now()}`,
              type: 'proposal',
              oldCode: capturedSelection.text,
              newCode: codeToUse,
              fullNewCode: fullUpdatedCode,
              scope: 'selection',
              selectionRange: capturedSelection,
              applied: false,
              discarded: false,
              timestamp: Date.now(),
              provider: `Colab / Ollama (${body.model || 'Ativo'}) (Modo Seleção)`,
              mode: 'execute',
              thinking: streamResult.thinking,
              warning: streamResult.warning,
            };

            setMessages((prev) =>
              prev.map((m) => (m.id === streamMsgId ? proposalMsg : m))
            );

            if (assistantMode === 'basico') {
              handleApplyDiff(proposalMsg.id, proposalMsg.fullNewCode, proposalMsg.scope);
            }
          } else {
            const proposalMsg: ChatMessage = {
              id: `prop-${Date.now()}`,
              type: 'proposal',
              oldCode: currentCode,
              newCode: codeToUse,
              fullNewCode: codeToUse,
              scope: 'full',
              applied: false,
              discarded: false,
              timestamp: Date.now(),
              provider: `Colab / Ollama (${body.model || 'Ativo'}) (Modo Completo)`,
              mode: 'execute',
              thinking: streamResult.thinking,
              warning: streamResult.warning,
            };

            setMessages((prev) =>
              prev.map((m) => (m.id === streamMsgId ? proposalMsg : m))
            );

            if (assistantMode === 'basico') {
              handleApplyDiff(proposalMsg.id, proposalMsg.fullNewCode, proposalMsg.scope);
            }
          }

          setStatus('connected');
          setStatusText('conectado');
        }
      }
    } catch (err: any) {
      console.error('Erro na requisição da IA:', err);
      const isAbort =
        abortController.signal.aborted ||
        err.name === 'AbortError' ||
        err.message?.includes('aborted') ||
        err.message?.includes('cancelad') ||
        err.message?.includes('interrompid');

      setMessages((prev) => prev.filter((m) => !m.streaming));

      if (isAbort) {
        setMessages((prev) => {
          const filtered = prev.filter((m) => !m.streaming);
          const last = filtered[filtered.length - 1];
          if (last && (last.text?.includes('interrompida') || last.text?.includes('cancelada'))) {
            return filtered;
          }
          return [
            ...filtered,
            {
              id: `cancel-${Date.now()}`,
              type: 'explanation',
              text: '⏹️ Geração interrompida pelo usuário.',
              mode: currentMode,
              timestamp: Date.now(),
            },
          ];
        });
        setStatus('connected');
        setStatusText('interrompido');
        return;
      }

      if (err?.truncated) {
        setMessages((prev) => [
          ...prev,
          { id: `err-${Date.now()}`, type: 'error', text: err.message, timestamp: Date.now() },
        ]);
        setStatus('connected');
        setStatusText('resposta cortada');
        return;
      }

      const errMsg = err.message || '';
      const isBackendMissing =
        errMsg.includes('NOT_FOUND') ||
        errMsg.includes('The page could not be found') ||
        errMsg.includes('gru1::') ||
        errMsg.includes('Rota de backend') ||
        errMsg.includes('não está ativo nesta hospedagem') ||
        (errMsg.includes('404') && (errMsg.includes('/api/') || errMsg.includes('proxy')));

      const isColabModelNotFound =
        activeProvider === 'colab' &&
        !isBackendMissing &&
        !errMsg.includes('página HTML') &&
        (errMsg.includes('MODEL_NOT_FOUND') ||
          errMsg.toLowerCase().includes('model not found') ||
          errMsg.toLowerCase().includes('model_not_found') ||
          errMsg.toLowerCase().includes('does not exist'));

      const isColabEndpointIssue =
        activeProvider === 'colab' &&
        !isColabModelNotFound &&
        (errMsg.includes('ENDPOINT_NOT_FOUND') ||
          errMsg.includes('página HTML') ||
          errMsg.includes('não foi configurado') ||
          errMsg.includes('Status 404') ||
          errMsg.includes('HTTP 404') ||
          errMsg.includes('ECONNREFUSED') ||
          errMsg.includes('ENOTFOUND') ||
          errMsg.includes('Tempo limite excedido ao conectar'));

      let userFacingError = errMsg || 'Falha na comunicação. Verifique se o servidor está ativo e com as credenciais corretas.';

      if (isAbort) {
        userFacingError = 'Operação cancelada pelo usuário.';
      } else if (isBackendMissing) {
        userFacingError =
          '⚠️ O servidor backend Node.js (/api/*) não está rodando nesta hospedagem (Erro 404 Vercel / Edge).\n\n' +
          '• Para conectar ao Google Colab / ngrok: abra as Configurações (aba "Google Colab / ngrok" > "Avançado") e desmarque a opção "Usar proxy do servidor" para que seu navegador faça a requisição direta ao ngrok.\n' +
          '• Para utilizar todas as rotas de backend (incluindo Gemini e proxy): execute o projeto localmente com "npm run dev" (na porta 3000) ou faça deploy em uma plataforma Node.js (Render, Railway, Fly.io).';
      } else if (isColabModelNotFound) {
        const detected = Array.isArray(config.detectedModels) && config.detectedModels.length > 0
          ? config.detectedModels
          : [];

        let details = '⚠️ O modelo solicitado não está carregado no servidor Colab / vLLM (Erro 404).\n\n';
        if (detected.length > 0) {
          details += `Modelos disponíveis encontrados no seu servidor:\n${detected.map((m) => `• ${m}`).join('\n')}\n\n`;
          details += '💡 Sugestão: Clique no botão "Configurações" acima e selecione um dos modelos disponíveis ou use a opção "Detectar modelo" para sincronizar.';
        } else {
          details += '💡 Sugestão: Abra as Configurações (aba "Google Colab / ngrok") e clique em "Detectar modelo" para verificar os modelos atualmente carregados no seu endpoint.';
        }
        userFacingError = details;
      } else if (isColabEndpointIssue) {
        userFacingError =
          '⚠️ Não foi possível conectar ao Google Colab / ngrok.\n\n' +
          (errMsg.includes('não foi configurado')
            ? '• O endpoint do Colab não está configurado nas Configurações.\n\n'
            : '• O servidor externo ou túnel ngrok retornou erro (túnel offline ou URL expirada).\n\n') +
          '💡 Dica rápida: Para continuar utilizando o assistente de IA agora, altere o provedor para "Gemini" clicando no seletor ou no botão de Configurações no topo.';
      }

      const errorMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        type: 'error',
        text: userFacingError,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errorMsg]);
      setStatus('disconnected');
      setStatusText('erro na conexão');
    } finally {
      setIsLoading(false);
      setIsAnalyzingVision(false);
      if (activeAbortControllerRef.current === abortController) {
        activeAbortControllerRef.current = null;
      }
    }
  }, [
    instruction,
    attachedImages,
    isLoading,
    interactionMode,
    aiScopeMode,
    config,
    selection,
    onOpenSettings,
    setAttachedImages,
    setIsAnalyzingVision,
    code,
    workspaceMode,
    files,
    activeFileId,
    messages,
    language,
    assistantMode,
    handleApplyDiff,
  ]);

  // Run auto fix loop
  const runAutoFix = useCallback(async (errorMessage: string) => {
    if (assistantMode !== 'basico' || isLoading || isAutoFixing) return;
    if (autoFixAttemptsRef.current >= AUTOFIX_MAX_ATTEMPTS) {
      if (!autoFixGaveUp) {
        setAutoFixGaveUp(true);
        setMessages((prev) => [
          ...prev,
          {
            id: `autofix-giveup-${Date.now()}`,
            type: 'error',
            text: 'Tentei corrigir um erro de execução automaticamente algumas vezes, mas não consegui resolver. Pode descrever o que deveria acontecer, ou tentar pedir a correção de outro jeito?',
            timestamp: Date.now(),
          },
        ]);
      }
      return;
    }

    autoFixAttemptsRef.current += 1;
    const attemptNumber = autoFixAttemptsRef.current;
    setIsAutoFixing(true);

    const statusMsgId = `autofix-status-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      {
        id: statusMsgId,
        type: 'explanation',
        text: `🔧 Detectei um erro ao rodar o código. Tentando corrigir automaticamente (tentativa ${attemptNumber} de ${AUTOFIX_MAX_ATTEMPTS})...`,
        timestamp: Date.now(),
      },
    ]);

    const fixPrompt = `[Autocorreção] O código apresentou o seguinte erro ao ser executado no navegador:\n${errorMessage}\n\nCorrija esse erro, preservando o restante do comportamento e da estrutura do código.`;

    try {
      await handleSendInstruction(fixPrompt, 'full', 'execute');
    } finally {
      setMessages((prev) => prev.filter((m) => m.id !== statusMsgId));
      setIsAutoFixing(false);
      if (autoFixResetTimerRef.current) clearTimeout(autoFixResetTimerRef.current);
      autoFixResetTimerRef.current = setTimeout(() => {
        autoFixAttemptsRef.current = 0;
        setAutoFixGaveUp(false);
      }, 15000);
    }
  }, [assistantMode, isLoading, isAutoFixing, autoFixGaveUp, handleSendInstruction]);

  const runAutoFixRef = useRef(runAutoFix);
  runAutoFixRef.current = runAutoFix;

  const handleRuntimeError = useCallback((errorMessage: string) => {
    if (isLoading || isAutoFixing) return;
    if (autoFixDebounceRef.current) clearTimeout(autoFixDebounceRef.current);
    if (autoFixEligibleRef.current && assistantMode === 'basico') {
      autoFixDebounceRef.current = setTimeout(() => {
        if (!autoFixEligibleRef.current) return;
        runAutoFixRef.current(errorMessage);
      }, 900);
    } else {
      autoFixDebounceRef.current = setTimeout(() => {
        setPendingManualError(errorMessage);
      }, 1200);
    }
  }, [isLoading, isAutoFixing, assistantMode]);

  const handleManualFixRequest = useCallback((errorMessage: string) => {
    setPendingManualError(null);
    const fixPrompt = `[Correção] O código apresentou o seguinte erro ao ser executado no navegador:\n${errorMessage}\n\nCorrija esse erro, preservando o restante do comportamento e da estrutura do código.`;
    handleSendInstruction(fixPrompt, 'full', 'execute');
  }, [handleSendInstruction]);

  // Request Selection Mode with automated AI target detection
  const handleRequestSelectionMode = useCallback(async () => {
    setAiScopeMode('selection');

    if (selection !== null || messages.length === 0) {
      return;
    }

    setIsDetectingSelectionTarget(true);

    try {
      const targetRange = await detectSelectionTargetFromHistory({
        messages,
        workspaceMode,
        files,
        activeFileId,
        code,
        language,
        config,
      });
      if (targetRange) {
        setSelection(targetRange);
      }
    } catch {
      // Falha silenciosa
    } finally {
      setIsDetectingSelectionTarget(false);
    }
  }, [selection, messages, workspaceMode, files, activeFileId, code, language, config]);

  // Explain code via IA
  const handleExplainCode = useCallback(async () => {
    if (isLoading) return;
    setInteractionMode('plan');
    const isSelection = Boolean(selection && selection.text.trim());
    handleSendInstruction(
      isSelection
        ? 'Explique didaticamente e detalhadamente este trecho de código selecionado, sua arquitetura e fluxo de execução.'
        : 'Explique didaticamente e detalhadamente este código, sua arquitetura, funções, fluxo de execução e eventuais melhorias.',
      isSelection ? 'selection' : 'full',
      'plan'
    );
  }, [isLoading, selection, handleSendInstruction]);

  // Auto-Fix syntax diagnostic with 1-click
  const handleAutoFixDiagnostic = useCallback((diagOrList: DiagnosticItem | DiagnosticItem[]) => {
    let fixPrompt = '';
    if (Array.isArray(diagOrList)) {
      if (diagOrList.length === 0) return;
      if (diagOrList.length === 1) {
        fixPrompt = `[Auto-Fix Sintaxe] ${diagOrList[0].suggestedPrompt}`;
      } else {
        const issuesSummary = diagOrList
          .slice(0, 5)
          .map((d) => `• Linha ${d.line}: ${d.message}`)
          .join('\n');
        fixPrompt = `[Auto-Fix Sintaxe Geral] Corrija os seguintes ${diagOrList.length} erros/avisos de sintaxe no código:\n${issuesSummary}\nPreserve a lógica original corrigindo apenas a sintaxe e a estrutura.`;
      }
    } else {
      fixPrompt = `[Auto-Fix Sintaxe] ${diagOrList.suggestedPrompt}`;
    }

    setInstruction(fixPrompt);
    setInteractionMode('execute');
    setTimeout(() => {
      handleSendInstruction(fixPrompt, 'full', 'execute');
    }, 50);
  }, [handleSendInstruction]);

  return {
    messages,
    setMessages,
    instruction,
    setInstruction,
    isLoading,
    interactionMode,
    setInteractionMode,
    aiScopeMode,
    setAiScopeMode,
    selection,
    setSelection,
    isDetectingSelectionTarget,
    isAutoFixing,
    autoFixGaveUp,
    pendingManualError,
    setPendingManualError,
    status,
    setStatus,
    statusText,
    setStatusText,
    markManualEdit,
    handleCancelInstruction,
    handleSendInstruction,
    handleExplainChange,
    handleRuntimeError,
    handleManualFixRequest,
    handleRequestSelectionMode,
    handleApplyDiff,
    handleApplyPartialDiff,
    handleDiscardDiff,
    handleExplainCode,
    handleAutoFixDiagnostic,
    handleClearChat,
  };
}
