import {
  ChatMessage,
  ConnectionConfig,
  ProjectFile,
  SupportedLanguage,
  ChatImageAttachment,
  ChatHistoryItem,
  SelectionRange,
  WorkspaceMode,
} from '../types';
import { callGeminiClientDirect } from './geminiClient';
import { readAiStream, StreamProgressUpdate } from './streamReader';
import { safeReadJsonResponse } from '../hooks/useAppConfig';
import {
  chatHistoryToOpenAIMessages,
  buildChatHistoryPayload,
  CHAT_HISTORY_LIMIT,
  normalizeFilePath,
  extractFileNameFromPath,
} from './workspace';
import { computeLineDiff } from './diff';
import { groupIntoHunks } from './hunks';
import { locateTarget } from './codeLocator';

export interface GeminiPlanParams {
  effectiveInstruction: string;
  currentCode: string;
  selectedText?: string;
  scope: 'selection' | 'full';
  language: SupportedLanguage;
  config: ConnectionConfig;
  imagesToSend?: ChatImageAttachment[];
  projectFilesPayload?: Array<{ path: string; language: string; content: string }>;
  activeFilePath?: string;
  chatHistoryPayload?: ChatHistoryItem[];
  signal: AbortSignal;
}

export async function dispatchGeminiPlan(params: GeminiPlanParams): Promise<{ text: string; usedKeyMask?: string }> {
  const {
    effectiveInstruction,
    currentCode,
    selectedText,
    scope,
    language,
    config,
    imagesToSend,
    projectFilesPayload,
    activeFilePath,
    chatHistoryPayload,
    signal,
  } = params;

  try {
    const res = await fetch('/api/ai/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        instruction: effectiveInstruction,
        message: effectiveInstruction,
        code: currentCode,
        selectedText,
        scope,
        language,
        model: config.geminiModel || 'gemini-3.8-flash',
        images: imagesToSend && imagesToSend.length > 0 ? imagesToSend : undefined,
        apiKeys: config.geminiKeys || [],
        geminiKeys: config.geminiKeys || [],
        projectFiles: projectFilesPayload,
        activeFilePath,
        chatHistory: chatHistoryPayload,
      }),
    });

    if (res.status === 404) {
      const fallback = await callGeminiClientDirect({
        instruction: effectiveInstruction,
        code: currentCode,
        selectedText,
        language,
        model: config.geminiModel || 'gemini-3.8-flash',
        keys: config.geminiKeys || [],
        mode: 'plan',
        projectFiles: projectFilesPayload,
        activeFilePath,
        images: imagesToSend && imagesToSend.length > 0 ? imagesToSend : undefined,
        signal,
        chatHistory: chatHistoryPayload,
      });
      return { text: fallback.text };
    }

    const data = await safeReadJsonResponse(res);
    if (!res.ok) {
      throw new Error(data.error || `Erro do servidor: ${res.status}`);
    }
    return {
      text: data.reply || data.text || 'Sem resposta do assistente de planejamento.',
      usedKeyMask: data.usedKeyMask || data.usedKey,
    };
  } catch (apiErr: any) {
    if (apiErr.name === 'AbortError' || signal.aborted) {
      throw apiErr;
    }
    if (config.geminiKeys && config.geminiKeys.length > 0) {
      const fallback = await callGeminiClientDirect({
        instruction: effectiveInstruction,
        code: currentCode,
        selectedText,
        language,
        model: config.geminiModel || 'gemini-3.8-flash',
        keys: config.geminiKeys,
        mode: 'plan',
        projectFiles: projectFilesPayload,
        activeFilePath,
        images: imagesToSend && imagesToSend.length > 0 ? imagesToSend : undefined,
        signal,
        chatHistory: chatHistoryPayload,
      });
      return { text: fallback.text };
    }
    throw apiErr;
  }
}

export interface GeminiEditParams {
  effectiveInstruction: string;
  currentCode: string;
  selectedText?: string;
  scope: 'selection' | 'full';
  language: SupportedLanguage;
  config: ConnectionConfig;
  imagesToSend?: ChatImageAttachment[];
  projectFilesPayload?: Array<{ path: string; language: string; content: string }>;
  activeFilePath?: string;
  chatHistoryPayload?: ChatHistoryItem[];
  signal: AbortSignal;
}

export async function dispatchGeminiEdit(params: GeminiEditParams): Promise<{ code: string; usedKeyMask?: string }> {
  const {
    effectiveInstruction,
    currentCode,
    selectedText,
    scope,
    language,
    config,
    imagesToSend,
    projectFilesPayload,
    activeFilePath,
    chatHistoryPayload,
    signal,
  } = params;

  try {
    const res = await fetch('/api/ai/edit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        code: currentCode,
        selectedText,
        scope,
        instruction: effectiveInstruction,
        language,
        model: config.geminiModel || 'gemini-3.8-flash',
        images: imagesToSend && imagesToSend.length > 0 ? imagesToSend : undefined,
        apiKeys: config.geminiKeys || [],
        geminiKeys: config.geminiKeys || [],
        projectFiles: projectFilesPayload,
        activeFilePath,
        chatHistory: chatHistoryPayload,
      }),
    });

    if (res.status === 404) {
      const fallback = await callGeminiClientDirect({
        instruction: effectiveInstruction,
        code: currentCode,
        selectedText,
        language,
        model: config.geminiModel || 'gemini-3.8-flash',
        keys: config.geminiKeys || [],
        mode: 'edit',
        projectFiles: projectFilesPayload,
        activeFilePath,
        images: imagesToSend && imagesToSend.length > 0 ? imagesToSend : undefined,
        signal,
        chatHistory: chatHistoryPayload,
      });
      return { code: fallback.text };
    }

    const data = await safeReadJsonResponse(res);
    if (!res.ok) {
      const serverErr: any = new Error(data.error || `Erro do servidor: ${res.status}`);
      if (data.truncated) serverErr.truncated = true;
      throw serverErr;
    }
    return {
      code: data.code,
      usedKeyMask: data.usedKeyMask,
    };
  } catch (apiErr: any) {
    if (apiErr.name === 'AbortError' || signal.aborted || apiErr.truncated) {
      throw apiErr;
    }
    if (config.geminiKeys && config.geminiKeys.length > 0) {
      const fallback = await callGeminiClientDirect({
        instruction: effectiveInstruction,
        code: currentCode,
        selectedText,
        language,
        model: config.geminiModel || 'gemini-3.8-flash',
        keys: config.geminiKeys,
        mode: 'edit',
        projectFiles: projectFilesPayload,
        activeFilePath,
        images: imagesToSend && imagesToSend.length > 0 ? imagesToSend : undefined,
        signal,
        chatHistory: chatHistoryPayload,
      });
      return { code: fallback.text };
    }
    throw apiErr;
  }
}

export interface ColabStreamParams {
  targetUrl: string;
  headers: Record<string, string>;
  promptBody: any;
  useProxy: boolean;
  signal: AbortSignal;
  onProgress: (progress: StreamProgressUpdate) => void;
}

export async function dispatchColabStream(params: ColabStreamParams) {
  const { targetUrl, headers, promptBody, useProxy, signal, onProgress } = params;

  let res: Response;
  if (useProxy) {
    try {
      res = await fetch('/api/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: targetUrl,
          headers,
          body: promptBody,
        }),
        signal,
      });
      if (res.status === 404) {
        const peek = await res.clone().text();
        if (peek.includes('NOT_FOUND') || peek.includes('gru1::') || peek.includes('The page could not be found')) {
          res = await fetch(targetUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(promptBody),
            signal,
          });
        }
      }
    } catch {
      res = await fetch(targetUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(promptBody),
        signal,
      });
    }
  } else {
    res = await fetch(targetUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(promptBody),
      signal,
    });
  }

  return await readAiStream({
    response: res,
    signal,
    onProgress,
  });
}

export interface DetectSelectionParams {
  messages: ChatMessage[];
  workspaceMode: WorkspaceMode;
  files: ProjectFile[];
  activeFileId: string;
  code: string;
  language: SupportedLanguage;
  config: ConnectionConfig;
}

export async function detectSelectionTargetFromHistory(
  params: DetectSelectionParams
): Promise<SelectionRange | null> {
  const { messages, workspaceMode, files, activeFileId, code, language, config } = params;

  const chatHistoryPayload = buildChatHistoryPayload(messages, CHAT_HISTORY_LIMIT);
  const isProjectMode = workspaceMode === 'project' && files.length > 0;
  const activeFileObj = files.find((f) => f.id === activeFileId);
  const activeFilePath = isProjectMode
    ? (activeFileObj?.path || activeFileObj?.name || 'index.html')
    : undefined;

  const projectFilesPayload = isProjectMode
    ? files.map((f) => ({
        path: f.path || f.name,
        language: f.language,
        content: f.id === activeFileId ? code : f.content,
      }))
    : undefined;

  const detectionInstruction =
    'Com base no histórico recente da conversa, avalie se o usuário e o assistente identificaram um único trecho de código claramente identificável — pode ser uma função, um componente, uma classe, um seletor CSS (ex: \'.minha-classe\' ou \'#meu-id\'), um elemento HTML identificável por seu atributo id ou class, ou qualquer outro identificador único e claro que apareça literalmente no código do arquivo.\n' +
    'Responda ESTRITAMENTE com um objeto JSON válido no formato abaixo, sem nenhum texto antes ou depois:\n' +
    '{"encontrado": true, "arquivo": "caminho/do/arquivo.ext", "nome": "nomeDaFuncaoOuComponenteOuClasse"}\n' +
    'Se não houver um alvo único e claro, responda estritamente:\n' +
    '{"encontrado": false, "arquivo": "", "nome": ""}';

  const planProvider = config.planningProvider || 'colab';
  let rawResponseText = '';

  if (planProvider === 'gemini') {
    try {
      const res = await fetch('/api/ai/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instruction: detectionInstruction,
          message: detectionInstruction,
          code,
          language,
          model: config.geminiModel || 'gemini-3.8-flash',
          apiKeys: config.geminiKeys || [],
          geminiKeys: config.geminiKeys || [],
          projectFiles: projectFilesPayload,
          activeFilePath,
          chatHistory: chatHistoryPayload,
        }),
      });

      if (res.status === 404) {
        const fallback = await callGeminiClientDirect({
          instruction: detectionInstruction,
          code,
          language,
          model: config.geminiModel || 'gemini-3.8-flash',
          keys: config.geminiKeys || [],
          mode: 'plan',
          projectFiles: projectFilesPayload,
          activeFilePath,
          chatHistory: chatHistoryPayload,
        });
        rawResponseText = fallback.text;
      } else if (res.ok) {
        const data = await safeReadJsonResponse(res);
        rawResponseText = data.reply || data.text || '';
      }
    } catch {
      if (config.geminiKeys && config.geminiKeys.length > 0) {
        try {
          const fallback = await callGeminiClientDirect({
            instruction: detectionInstruction,
            code,
            language,
            model: config.geminiModel || 'gemini-3.8-flash',
            keys: config.geminiKeys,
            mode: 'plan',
            projectFiles: projectFilesPayload,
            activeFilePath,
            chatHistory: chatHistoryPayload,
          });
          rawResponseText = fallback.text;
        } catch {}
      }
    }
  } else {
    const rawEndpoint = (config.endpointUrl || '').trim();
    if (rawEndpoint) {
      let targetUrl = rawEndpoint;
      if (!targetUrl.includes('/v1/') && !targetUrl.includes('/api/')) {
        targetUrl = targetUrl.replace(/\/+$/, '') + '/v1/chat/completions';
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': '1',
      };
      if (config.authToken) headers['Authorization'] = `Bearer ${config.authToken}`;

      const detected = Array.isArray(config.detectedModels) ? config.detectedModels : [];
      const modeModel = (config.colabPlanningModel || '').trim();
      const colabCfgModel = (config.colabModel || '').trim();
      let modelName = colabCfgModel;
      if (detected.length > 0) {
        if (modeModel && detected.includes(modeModel)) modelName = modeModel;
        else if (colabCfgModel && detected.includes(colabCfgModel)) modelName = colabCfgModel;
        else modelName = detected[0];
      } else if (modeModel && !modeModel.includes('qwen3-vl-30b-a3b-128k')) {
        modelName = modeModel;
      }

      const promptBody = {
        model: modelName || 'default',
        messages: [
          ...chatHistoryToOpenAIMessages(chatHistoryPayload),
          { role: 'user', content: detectionInstruction },
        ],
        temperature: 0.1,
        stream: false,
      };

      try {
        let res: Response;
        if (config.useProxy) {
          try {
            res = await fetch('/api/proxy', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                url: targetUrl,
                headers,
                body: promptBody,
              }),
            });
            if (res.status === 404) {
              res = await fetch(targetUrl, {
                method: 'POST',
                headers,
                body: JSON.stringify(promptBody),
              });
            }
          } catch {
            res = await fetch(targetUrl, {
              method: 'POST',
              headers,
              body: JSON.stringify(promptBody),
            });
          }
        } else {
          res = await fetch(targetUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(promptBody),
          });
        }

        if (res.ok) {
          const data = await safeReadJsonResponse(res);
          rawResponseText =
            data.choices?.[0]?.message?.content ||
            data.response ||
            data.text ||
            '';
        }
      } catch {}
    }
  }

  let parsed: any = null;
  if (rawResponseText) {
    const jsonMatch = rawResponseText.match(/\{[\s\S]*?\}/);
    if (jsonMatch) {
      try {
        parsed = JSON.parse(jsonMatch[0]);
      } catch (parseErr) {
        parsed = parseErr;
      }
    }
  }

  if (parsed && typeof parsed === 'object' && !(parsed instanceof Error)) {
    if (parsed.encontrado === true && parsed.nome) {
      const targetName = String(parsed.nome).trim();
      const targetFileArg = String(parsed.arquivo || '').trim() || (activeFilePath || 'index.html');

      if (!isProjectMode) {
        return locateTarget(code, targetName, targetFileArg);
      } else if (parsed.arquivo) {
        const normalizedReportedPath = normalizeFilePath(String(parsed.arquivo)).toLowerCase();
        const activePath = (activeFilePath || activeFileObj?.path || activeFileObj?.name || 'index.html');
        const normalizedActivePath = normalizeFilePath(activePath).toLowerCase();

        const reportedFileName = extractFileNameFromPath(normalizedReportedPath);
        const activeFileName = extractFileNameFromPath(normalizedActivePath);

        if (
          normalizedReportedPath === normalizedActivePath ||
          reportedFileName === activeFileName
        ) {
          return locateTarget(code, targetName, targetFileArg);
        }
      }
    }
  }
  return null;
}

export async function requestTeacherExplanation(
  proposal: ChatMessage,
  userRequest: string,
  config: ConnectionConfig
): Promise<string> {
  const diffResult = computeLineDiff(proposal.oldCode || '', proposal.newCode || '');
  const hunks = groupIntoHunks(diffResult.lines, 3);
  let diffText = hunks
    .map((h) =>
      h.lines
        .map((l) => (l.type === 'add' ? '+ ' : l.type === 'rem' ? '- ' : '  ') + l.text)
        .join('\n')
    )
    .join('\n...\n');
  if (diffText.length > 12000) {
    diffText = diffText.slice(0, 12000) + '\n... (trecho truncado)';
  }

  const teacherSystemPrompt =
    'Você é uma professora de programação paciente, simpática e didática, explicando para alguém que está começando e não entende de código. ' +
    'Você vai receber o pedido original do usuário e as mudanças feitas no código (linhas com "-" foram removidas, linhas com "+" foram adicionadas, linhas sem sinal são só contexto). ' +
    'Explique, em português do Brasil e com linguagem simples e amigável: 1) o que foi mudado, 2) por que essa mudança atende ao pedido. ' +
    'Se usar algum termo técnico, explique-o em uma frase curta com um exemplo do dia a dia. ' +
    'Seja breve (no máximo 3 parágrafos curtos). Só cite trechos curtos de código entre crases quando ajudar. ' +
    'Não proponha novas mudanças e não reescreva o código.';

  const teacherUserPrompt =
    `Pedido original do usuário:\n${userRequest || '(não informado)'}\n\n` +
    `Mudanças feitas no código:\n${diffText}\n\nExplique essas mudanças para o usuário.`;

  let explanationText = '';
  const rawEndpoint = (config.endpointUrl || '').trim();
  if (rawEndpoint) {
    try {
      let targetUrl = rawEndpoint;
      if (!targetUrl.includes('/v1/') && !targetUrl.includes('/api/')) {
        targetUrl = targetUrl.replace(/\/+$/, '') + '/v1/chat/completions';
      }
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': '1',
      };
      if (config.authToken) headers['Authorization'] = `Bearer ${config.authToken}`;

      const detected = Array.isArray(config.detectedModels) ? config.detectedModels : [];
      const modeModel = (config.colabPlanningModel || '').trim();
      const colabCfgModel = (config.colabModel || '').trim();
      let modelName = colabCfgModel;
      if (detected.length > 0) {
        if (modeModel && detected.includes(modeModel)) modelName = modeModel;
        else if (colabCfgModel && detected.includes(colabCfgModel)) modelName = colabCfgModel;
        else modelName = detected[0];
      } else if (modeModel && !modeModel.includes('qwen3-vl-30b-a3b-128k')) {
        modelName = modeModel;
      }

      const promptBody = {
        model: modelName || 'default',
        messages: [
          { role: 'system', content: teacherSystemPrompt },
          { role: 'user', content: teacherUserPrompt },
        ],
        temperature: 0.4,
        stream: false,
      };

      let res: Response;
      if (config.useProxy) {
        try {
          res = await fetch('/api/proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: targetUrl, headers, body: promptBody }),
          });
          if (res.status === 404) {
            res = await fetch(targetUrl, {
              method: 'POST',
              headers,
              body: JSON.stringify(promptBody),
            });
          }
        } catch {
          res = await fetch(targetUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(promptBody),
          });
        }
      } else {
        res = await fetch(targetUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(promptBody),
        });
      }

      if (res.ok) {
        const data = await safeReadJsonResponse(res);
        explanationText =
          data.choices?.[0]?.message?.content ||
          data.response ||
          data.text ||
          '';
      }
    } catch {}
  }

  if (!explanationText) {
    const geminiModel = config.geminiModel || 'gemini-3.8-flash';
    try {
      const res = await fetch('/api/ai/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instruction: `${teacherSystemPrompt}\n\n${teacherUserPrompt}`,
          message: `${teacherSystemPrompt}\n\n${teacherUserPrompt}`,
          model: geminiModel,
          apiKeys: config.geminiKeys || [],
          geminiKeys: config.geminiKeys || [],
        }),
      });
      if (res.status === 404) {
        const fallback = await callGeminiClientDirect({
          instruction: `${teacherSystemPrompt}\n\n${teacherUserPrompt}`,
          model: geminiModel,
          keys: config.geminiKeys || [],
          mode: 'plan',
        });
        explanationText = fallback.text;
      } else if (res.ok) {
        const data = await safeReadJsonResponse(res);
        explanationText = data.reply || data.text || '';
      }
    } catch {
      if (config.geminiKeys && config.geminiKeys.length > 0) {
        try {
          const fallback = await callGeminiClientDirect({
            instruction: `${teacherSystemPrompt}\n\n${teacherUserPrompt}`,
            model: geminiModel,
            keys: config.geminiKeys,
            mode: 'plan',
          });
          explanationText = fallback.text;
        } catch {}
      }
    }
  }

  explanationText = explanationText.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  if (!explanationText) {
    throw new Error('Nenhuma IA respondeu a tempo. Tente novamente em instantes.');
  }
  return explanationText;
}
