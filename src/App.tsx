import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ConnectionConfig,
  ChatMessage,
  SupportedLanguage,
  CodeTemplate,
  ThemeMode,
  EditorViewMode,
  AIScopeMode,
  SelectionRange,
  WorkspaceMode,
  ProjectFile,
  DiagnosticItem,
  VersionCheckpoint,
  InteractionMode,
  AIProvider,
  ChatImageAttachment,
} from './types';
import { CODE_TEMPLATES } from './utils/templates';
import {
  DEFAULT_PROJECT_FILES,
  detectLanguageFromName,
  normalizeFilePath,
  extractFileNameFromPath,
  buildProjectContextPrompt,
} from './utils/workspace';
import { fillTemplate, getByPath } from './utils/templateEngine';
import { readAiStream, cleanCodeOutput } from './utils/streamReader';
import { formatCode } from './utils/formatter';
import { exportProjectAsZip } from './utils/exportZip';
import { importProjectFromZip } from './utils/importZip';
import { processDroppedData } from './utils/dropHandler';
import { processImageFiles } from './utils/imageResize';
import { getShortModelName } from './utils/modelNames';
import { callGeminiClientDirect, testGeminiKeysDirect } from './utils/geminiClient';
import {
  isFileSystemAccessSupported,
  openLocalFolder,
  readDirectoryRecursive,
  writeFileToFolder,
  saveHandleToIndexedDB,
  loadHandleFromIndexedDB,
  clearHandleFromIndexedDB,
  verifyHandlePermission,
  requestHandlePermission,
} from './utils/localFolder';
import { Header } from './components/Header';
import { CodeEditorPanel } from './components/CodeEditorPanel';
import { SidePanel } from './components/SidePanel';
import { SettingsModal } from './components/SettingsModal';
import { TemplatesModal } from './components/TemplatesModal';
import { VersionHistoryModal } from './components/VersionHistoryModal';
import { ImportConflictModal } from './components/ImportConflictModal';
import { DropzoneOverlay } from './components/DropzoneOverlay';

const DEFAULT_CONFIG: ConnectionConfig = {
  provider: 'gemini',
  geminiModel: 'gemini-3.8-flash',
  geminiKeys: [],
  planningProvider: 'gemini',
  executionProvider: 'gemini',
  endpointUrl: '',
  colabModel: '',
  authToken: '',
  planningAcceptsImages: false,
  executionAcceptsImages: false,
  modelVisionMap: {},
  visionProvider: 'gemini',
  visionModel: 'gemini-3.8-flash',
  colabVisionModel: '',
  visionPrompt:
    'Analise esta imagem (um print de tela ou de erro). 1) Transcreva literalmente TODO o texto visível (mensagens de erro, stack traces, nomes de arquivo, números de linha, valores). 2) Descreva o layout e os elementos de interface relevantes. 3) Aponte anomalias visíveis (elementos cortados, sobrepostos, desalinhados, mensagens de erro), sem propor correções. Responda em português do Brasil.',
  requestTemplate: JSON.stringify(
    {
      model: '',
      messages: [
        {
          role: 'system',
          content:
            'Você é um assistente programador. Retorne APENAS o código modificado puro, sem explicações nem markdown.',
        },
        {
          role: 'user',
          content: '--- CÓDIGO ORIGINAL ---\n{{code}}\n\n--- INSTRUÇÃO ---\n{{instruction}}',
        },
      ],
      temperature: 0.2,
    },
    null,
    2
  ),
  responsePath: 'choices[0].message.content',
  useProxy: true,
};

// Safe JSON parser that provides friendly, actionable error messages if a server or ngrok returns HTML
async function safeReadJsonResponse(res: Response): Promise<any> {
  const contentType = res.headers.get('content-type') || 'desconhecido';
  const text = await res.text();
  if (!text || !text.trim()) return {};

  try {
    return JSON.parse(text);
  } catch {
    const trimmed = text.trim();
    const snippet = trimmed.slice(0, 300);

    // Detecção específica de erro 404 de infraestrutura (ex: Vercel Edge gru1 / CDN estática)
    if (
      trimmed.includes('NOT_FOUND') ||
      trimmed.includes('gru1::') ||
      trimmed.includes('The page could not be found')
    ) {
      throw new Error(
        `O servidor backend (/api/proxy) não está ativo nesta hospedagem (HTTP 404 da Vercel Edge / GRU1).\n\n` +
        `Esta instalação está rodando apenas o frontend estático. Como resolver:\n` +
        `1. Nas configurações do Colab (Avançado), desmarque "Usar proxy do servidor" para conectar diretamente ao ngrok pelo navegador;\n` +
        `2. Ou execute a aplicação com "npm run dev" no seu computador para rodar o backend Node.js completo.`
      );
    }

    if (
      contentType.includes('text/html') ||
      trimmed.startsWith('<') ||
      trimmed.toLowerCase().includes('<!doctype') ||
      trimmed.toLowerCase().includes('<html')
    ) {
      if (
        trimmed.includes('ngrok') ||
        trimmed.includes('Visit Site') ||
        trimmed.includes('ngrok-skip-browser-warning')
      ) {
        throw new Error(
          `O ngrok bloqueou a requisição com tela de aviso (HTTP ${res.status}).\nContent-Type: ${contentType}\nPrimeiros 300 caracteres:\n${snippet}\n\nO header "ngrok-skip-browser-warning": "1" é obrigatório para ignorar esse aviso.`
        );
      }
      if (res.status === 404) {
        throw new Error(`Endpoint não encontrado (HTTP 404).\nContent-Type: ${contentType}\nVerifique se a URL da API está correta.`);
      }
      if (res.status === 502 || res.status === 503 || res.status === 504) {
        throw new Error(
          `O servidor externo está indisponível (HTTP ${res.status}).\nContent-Type: ${contentType}\nPrimeiros 300 caracteres:\n${snippet}\n\nVerifique se seu Colab ou túnel ngrok ainda está ativo.`
        );
      }
      throw new Error(
        `O servidor retornou uma página HTML (HTTP ${res.status}) em vez de JSON.\n` +
        `Content-Type: ${contentType}\n` +
        `Primeiros 300 caracteres recebidos:\n${snippet}\n\nVerifique a URL do endpoint configurado.`
      );
    }
    throw new Error(
      `Resposta com formato inesperado (HTTP ${res.status}).\n` +
      `Content-Type: ${contentType}\n` +
      `Primeiros 300 caracteres recebidos:\n${snippet}`
    );
  }
}

export default function App() {
  // Workspace and Multi-file state (Opcional: Modo Arquivo Único ou Modo Projeto)
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('single');
  const [files, setFiles] = useState<ProjectFile[]>(DEFAULT_PROJECT_FILES);
  const [activeFileId, setActiveFileId] = useState<string>('file-index-html');
  const activeFile = files.find((f) => f.id === activeFileId);

  // Drag and Drop & Import state (Etapas 2 e 3)
  const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);
  const [pendingImportFiles, setPendingImportFiles] = useState<ProjectFile[] | null>(null);
  const [isImportConflictOpen, setIsImportConflictOpen] = useState<boolean>(false);
  const dragCounterRef = useRef<number>(0);

  // Main editor state
  const [code, setCode] = useState<string>(CODE_TEMPLATES[0].code);
  const [language, setLanguage] = useState<SupportedLanguage>('html');

  // Selection & AI Scope state (Opcional: Modo Completo ou Modo Seleção)
  const [aiScopeMode, setAiScopeMode] = useState<AIScopeMode>('full');
  const [selection, setSelection] = useState<SelectionRange | null>(null);

  // History stack for Undo / Redo
  const [history, setHistory] = useState<string[]>([CODE_TEMPLATES[0].code]);
  const [historyIndex, setHistoryIndex] = useState<number>(0);

  // Chat & AI state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [instruction, setInstruction] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [interactionMode, setInteractionMode] = useState<InteractionMode>('plan');

  // Multimodal (Images) state
  const [attachedImages, setAttachedImages] = useState<ChatImageAttachment[]>([]);
  const [isAnalyzingVision, setIsAnalyzingVision] = useState<boolean>(false);

  const handleAddImages = async (newFiles: File[]) => {
    try {
      const result = await processImageFiles(newFiles, attachedImages);
      if (result.added.length > 0) {
        setAttachedImages((prev) => [...prev, ...result.added]);
      }
      if (result.warning) {
        const warnMsg: ChatMessage = {
          id: `warn-${Date.now()}`,
          type: 'error',
          text: result.warning,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, warnMsg]);
      }
    } catch (err: any) {
      const errMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        type: 'error',
        text: `Erro ao processar imagem: ${err.message}`,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errMsg]);
    }
  };

  const handleRemoveImage = (id: string) => {
    setAttachedImages((prev) => prev.filter((img) => img.id !== id));
  };

  // Connection & Settings with localStorage persistence
  const [config, setConfig] = useState<ConnectionConfig>(() => {
    try {
      const saved = localStorage.getItem('ai_connection_config');
      if (saved) {
        const parsed = JSON.parse(saved);
        let loadedTemplate = parsed.requestTemplate || DEFAULT_CONFIG.requestTemplate;
        let colabModel = (parsed.colabModel || '').trim();
        try {
          const parsedTpl = JSON.parse(loadedTemplate);
          // If stored template still has the default mistral, purge it
          if (parsedTpl.model === 'mistralai/mistral-7b-instruct') {
            parsedTpl.model = colabModel;
            loadedTemplate = JSON.stringify(parsedTpl, null, 2);
          } else if (parsedTpl.model && !colabModel) {
            colabModel = parsedTpl.model;
          }
        } catch {}

        const detectedModels: string[] = Array.isArray(parsed.detectedModels) ? parsed.detectedModels : [];
        let colabPlanningModel = (parsed.colabPlanningModel || '').trim();
        let colabExecutionModel = (parsed.colabExecutionModel || '').trim();
        let colabVisionModel = (parsed.colabVisionModel || '').trim();

        // Migração: ao carregar configurações antigas, se o modelo salvo para um modo não existir
        // na lista de modelos detectados no servidor, use o modelo definido na aba Colab.
        if (detectedModels.length > 0) {
          if (!colabPlanningModel || !detectedModels.includes(colabPlanningModel)) {
            colabPlanningModel = (colabModel && detectedModels.includes(colabModel)) ? colabModel : detectedModels[0];
          }
          if (!colabExecutionModel || !detectedModels.includes(colabExecutionModel)) {
            colabExecutionModel = (colabModel && detectedModels.includes(colabModel)) ? colabModel : detectedModels[0];
          }
          if (!colabVisionModel || !detectedModels.includes(colabVisionModel)) {
            const visionMatch = detectedModels.find((m) => parsed.modelVisionMap?.[m]);
            colabVisionModel = visionMatch || colabModel || detectedModels[0];
          }
          if (colabModel && !detectedModels.includes(colabModel)) {
            colabModel = detectedModels[0];
          }
        } else {
          // Sem detectedModels salvos: se os modos contêm o modelo obsoleto 'qwen3-vl-30b-a3b-128k', migre para colabModel
          if (colabPlanningModel.includes('qwen3-vl-30b-a3b-128k')) {
            colabPlanningModel = colabModel;
          }
          if (colabExecutionModel.includes('qwen3-vl-30b-a3b-128k')) {
            colabExecutionModel = colabModel;
          }
          if (colabVisionModel.includes('qwen3-vl-30b-a3b-128k')) {
            colabVisionModel = colabModel;
          }
        }

        let loadedGeminiKeys: string[] = [];
        if (Array.isArray(parsed.geminiKeys)) {
          loadedGeminiKeys = parsed.geminiKeys.filter((k: any) => typeof k === 'string' && k.trim());
        }
        // Migração sem perda de chave única salva anteriormente
        const legacyGeminiKey = (parsed.apiKey || parsed.geminiApiKey || parsed.geminiKey || '').trim();
        if (legacyGeminiKey && !loadedGeminiKeys.includes(legacyGeminiKey)) {
          loadedGeminiKeys.unshift(legacyGeminiKey);
        }

        return {
          ...DEFAULT_CONFIG,
          ...parsed,
          colabModel,
          colabPlanningModel,
          colabExecutionModel,
          colabVisionModel,
          detectedModels,
          requestTemplate: loadedTemplate,
          geminiKeys: loadedGeminiKeys,
          planningProvider: parsed.planningProvider || DEFAULT_CONFIG.planningProvider,
          executionProvider: parsed.executionProvider || DEFAULT_CONFIG.executionProvider,
        };
      }
    } catch {
      // ignore
    }
    return DEFAULT_CONFIG;
  });

  useEffect(() => {
    try {
      localStorage.setItem('ai_connection_config', JSON.stringify(config));
    } catch {
      // ignore
    }
  }, [config]);

  // Active provider according to current interaction mode
  const currentActiveProvider: AIProvider =
    interactionMode === 'plan'
      ? config.planningProvider || 'colab'
      : config.executionProvider || 'gemini';

  const handleToggleActiveProvider = () => {
    const nextProvider: AIProvider = currentActiveProvider === 'gemini' ? 'colab' : 'gemini';
    if (interactionMode === 'plan') {
      setConfig((prev) => ({ ...prev, planningProvider: nextProvider }));
    } else {
      setConfig((prev) => ({ ...prev, executionProvider: nextProvider }));
    }
  };

  const currentActiveModel = React.useMemo(() => {
    if (currentActiveProvider === 'gemini') {
      return config.geminiModel || 'gemini-3.8-flash';
    }
    const detected = Array.isArray(config.detectedModels) ? config.detectedModels : [];
    const modeModel = (
      interactionMode === 'plan' ? config.colabPlanningModel : config.colabExecutionModel || ''
    ).trim();
    const colabModel = (config.colabModel || '').trim();
    if (detected.length > 0) {
      if (modeModel && detected.includes(modeModel)) return modeModel;
      if (colabModel && detected.includes(colabModel)) return colabModel;
      return detected[0];
    }
    if (modeModel && !modeModel.includes('qwen3-vl-30b-a3b-128k')) return modeModel;
    return colabModel;
  }, [currentActiveProvider, interactionMode, config]);

  const activeShortModelName = React.useMemo(() => {
    const customDisplay =
      currentActiveProvider === 'gemini' ? config.geminiDisplayName : config.colabDisplayName;
    return getShortModelName(currentActiveModel, currentActiveProvider, customDisplay);
  }, [currentActiveModel, currentActiveProvider, config.geminiDisplayName, config.colabDisplayName]);

  const activeFullModelInfo = React.useMemo(() => {
    const provName = currentActiveProvider === 'gemini' ? 'Gemini' : 'Colab / Ollama';
    return `${provName} (${currentActiveModel || 'Padrão'})`;
  }, [currentActiveProvider, currentActiveModel]);

  const [status, setStatus] = useState<'connected' | 'disconnected' | 'testing'>('testing');
  const [statusText, setStatusText] = useState<string>('verificando...');

  // Modals & UI preferences
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isTemplatesOpen, setIsTemplatesOpen] = useState<boolean>(false);
  const [isVersionHistoryOpen, setIsVersionHistoryOpen] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<EditorViewMode>('code');
  const [lineWrapping, setLineWrapping] = useState<boolean>(true);
  const [fontSize, setFontSize] = useState<number>(13);
  const [theme, setTheme] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem('editor_theme');
    return saved === 'light' ? 'light' : 'dark';
  });

  // Version History Checkpoints State (Sugestão Extra: Checkpoints)
  const [checkpoints, setCheckpoints] = useState<VersionCheckpoint[]>(() => [
    {
      id: 'cp-init',
      timestamp: Date.now(),
      description: 'Versão inicial do código',
      code: CODE_TEMPLATES[0].code,
      source: 'user',
      fileName: 'index.html',
    },
  ]);

  const addCheckpoint = useCallback(
    (data: Omit<VersionCheckpoint, 'id' | 'timestamp'>) => {
      const newCp: VersionCheckpoint = {
        id: `cp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        timestamp: Date.now(),
        ...data,
      };
      setCheckpoints((prev) => [...prev.slice(-30), newCp]);
    },
    []
  );

  // Sync theme attribute on document root
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('editor_theme', theme);
  }, [theme]);

  const handleToggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  // Controller para cancelamento sob demanda pelo usuário
  const activeAbortControllerRef = useRef<AbortController | null>(null);

  const handleCancelInstruction = useCallback(() => {
    if (activeAbortControllerRef.current) {
      activeAbortControllerRef.current.abort();
      activeAbortControllerRef.current = null;
    }
  }, []);

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

  // History management
  const pushHistory = useCallback(
    (newCode: string) => {
      setHistory((prev) => {
        const sliced = prev.slice(0, historyIndex + 1);
        const updated = [...sliced, newCode];
        if (updated.length > 40) updated.shift();
        return updated;
      });
      setHistoryIndex((prev) => Math.min(prev + 1, 39));
    },
    [historyIndex]
  );

  const handleUndo = () => {
    if (historyIndex > 0) {
      const prevIndex = historyIndex - 1;
      setHistoryIndex(prevIndex);
      const prevCode = history[prevIndex];
      setCode(prevCode);
      // Sync with active file
      setFiles((prev) =>
        prev.map((f) => (f.id === activeFileId ? { ...f, content: prevCode } : f))
      );
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const nextIndex = historyIndex + 1;
      setHistoryIndex(nextIndex);
      const nextCode = history[nextIndex];
      setCode(nextCode);
      // Sync with active file
      setFiles((prev) =>
        prev.map((f) => (f.id === activeFileId ? { ...f, content: nextCode } : f))
      );
    }
  };

  const handleChangeCode = (newVal: string) => {
    setCode(newVal);
    // Keep active file content updated
    setFiles((prev) =>
      prev.map((f) => (f.id === activeFileId ? { ...f, content: newVal } : f))
    );
  };

  // Switch between Single File mode and Project mode
  const handleChangeWorkspaceMode = (newMode: WorkspaceMode) => {
    setWorkspaceMode(newMode);
    if (newMode === 'project') {
      // Find current active file or default
      const current = files.find((f) => f.id === activeFileId) || files[0];
      if (current) {
        setActiveFileId(current.id);
        setCode(current.content);
        setLanguage(current.language);
        setHistory([current.content]);
        setHistoryIndex(0);
      }
    }
  };

  // Select a file from project tabs
  const handleSelectFile = (fileId: string) => {
    // Save current editor content to active file first
    setFiles((prev) =>
      prev.map((f) => (f.id === activeFileId ? { ...f, content: code } : f))
    );

    const target = files.find((f) => f.id === fileId);
    if (target) {
      setActiveFileId(target.id);
      setCode(target.content);
      setLanguage(target.language);
      setHistory([target.content]);
      setHistoryIndex(0);
      setSelection(null);
    }
  };

  // Add new file to project
  const handleAddFile = (pathOrName: string, lang: SupportedLanguage, initialContent = '') => {
    const normPath = normalizeFilePath(pathOrName);
    const fileName = extractFileNameFromPath(normPath);
    const newFile: ProjectFile = {
      id: `file-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      path: normPath,
      name: fileName,
      language: lang,
      content: initialContent,
      history: [initialContent],
      historyIndex: 0,
    };
    setFiles((prev) => [...prev, newFile]);
    setActiveFileId(newFile.id);
    setCode(initialContent);
    setLanguage(lang);
    setHistory([initialContent]);
    setHistoryIndex(0);
    setSelection(null);
  };

  // Delete file from project
  const handleDeleteFile = (fileId: string) => {
    if (files.length <= 1) return;
    const remaining = files.filter((f) => f.id !== fileId);
    setFiles(remaining);

    if (activeFileId === fileId) {
      const nextActive = remaining[0];
      setActiveFileId(nextActive.id);
      setCode(nextActive.content);
      setLanguage(nextActive.language);
      setHistory([nextActive.content]);
      setHistoryIndex(0);
      setSelection(null);
    }
  };

  // Rename file or path in project
  const handleRenameFile = (fileId: string, newPathOrName: string) => {
    const normPath = normalizeFilePath(newPathOrName);
    const fileName = extractFileNameFromPath(normPath);
    const detectedLang = detectLanguageFromName(fileName);
    setFiles((prev) =>
      prev.map((f) =>
        f.id === fileId
          ? {
              ...f,
              path: normPath,
              name: fileName,
              language: detectedLang,
            }
          : f
      )
    );
    if (activeFileId === fileId) {
      setLanguage(detectedLang);
    }
  };

  // ==================== LOCAL FOLDER INTEGRATION ====================
  const [localFolderHandle, setLocalFolderHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [localFolderName, setLocalFolderName] = useState<string | null>(null);
  const [localFolderPermissionNeeded, setLocalFolderPermissionNeeded] = useState<boolean>(false);
  const [saveMode, setSaveMode] = useState<'auto' | 'manual'>(() => {
    try {
      const saved = localStorage.getItem('code_editor_save_mode');
      return saved === 'auto' ? 'auto' : 'manual';
    } catch {
      return 'manual';
    }
  });
  const [isSavingLocal, setIsSavingLocal] = useState<boolean>(false);
  const [localSaveToast, setLocalSaveToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [settingsDefaultTab, setSettingsDefaultTab] = useState<'modes' | 'keys' | 'colab' | 'localFolder'>('modes');
  const toastTimeoutRef = useRef<any>(null);

  const showLocalToast = useCallback(
    (message: string, type: 'success' | 'error' = 'success', duration = 2500) => {
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
      setLocalSaveToast({ message, type });
      toastTimeoutRef.current = setTimeout(() => setLocalSaveToast(null), duration);
    },
    []
  );

  const handleChangeSaveMode = (mode: 'auto' | 'manual') => {
    setSaveMode(mode);
    try {
      localStorage.setItem('code_editor_save_mode', mode);
    } catch {}
    showLocalToast(`Modo de salvamento alterado para ${mode === 'auto' ? 'Automático (Autosave)' : 'Manual'}`);
  };

  // Restore persisted local folder from IndexedDB on startup
  useEffect(() => {
    let isMounted = true;
    async function restoreLastFolder() {
      if (!isFileSystemAccessSupported()) return;
      try {
        const handle = await loadHandleFromIndexedDB();
        if (!handle || !isMounted) return;
        setLocalFolderHandle(handle);
        setLocalFolderName(handle.name);

        const hasPerm = await verifyHandlePermission(handle, true);
        if (hasPerm) {
          const loadedFiles = await readDirectoryRecursive(handle);
          if (!isMounted) return;
          if (loadedFiles.length > 0) {
            setFiles(loadedFiles);
            setWorkspaceMode('project');
            const firstFile = loadedFiles.find((f) => f.path === 'index.html') || loadedFiles[0];
            setActiveFileId(firstFile.id);
            setCode(firstFile.content);
            setLanguage(firstFile.language);
            setHistory([firstFile.content]);
            setHistoryIndex(0);
            setSelection(null);
            showLocalToast(`Pasta "${handle.name}" restaurada do disco`);
          }
        } else {
          if (isMounted) setLocalFolderPermissionNeeded(true);
        }
      } catch (err) {
        console.warn('[LocalFolder] Erro ao carregar pasta anterior do IndexedDB:', err);
      }
    }
    restoreLastFolder();
    return () => {
      isMounted = false;
    };
  }, [showLocalToast]);

  const handleOpenLocalFolder = async () => {
    try {
      const handle = await openLocalFolder();
      if (!handle) return; // cancelado pelo usuário

      setLocalFolderHandle(handle);
      setLocalFolderName(handle.name);
      setLocalFolderPermissionNeeded(false);
      await saveHandleToIndexedDB(handle);

      const loadedFiles = await readDirectoryRecursive(handle);
      if (loadedFiles.length > 0) {
        setFiles(loadedFiles);
        setWorkspaceMode('project');
        const firstFile = loadedFiles.find((f) => f.path === 'index.html') || loadedFiles[0];
        setActiveFileId(firstFile.id);
        setCode(firstFile.content);
        setLanguage(firstFile.language);
        setHistory([firstFile.content]);
        setHistoryIndex(0);
        setSelection(null);
        showLocalToast(`Pasta "${handle.name}" aberta (${loadedFiles.length} arquivos)`);
      } else {
        showLocalToast(`Pasta "${handle.name}" conectada (vazia ou sem arquivos suportados)`);
      }
    } catch (err: any) {
      console.error('[LocalFolder] Erro ao abrir pasta:', err);
      showLocalToast(`Erro ao abrir pasta: ${err?.message || 'Falha de permissão'}`, 'error', 3500);
    }
  };

  const handleReconnectLocalFolder = async () => {
    if (!localFolderHandle) return;
    try {
      const granted = await requestHandlePermission(localFolderHandle, true);
      if (granted) {
        setLocalFolderPermissionNeeded(false);
        const loadedFiles = await readDirectoryRecursive(localFolderHandle);
        if (loadedFiles.length > 0) {
          setFiles(loadedFiles);
          setWorkspaceMode('project');
          const firstFile = loadedFiles.find((f) => f.path === 'index.html') || loadedFiles[0];
          setActiveFileId(firstFile.id);
          setCode(firstFile.content);
          setLanguage(firstFile.language);
          setHistory([firstFile.content]);
          setHistoryIndex(0);
          setSelection(null);
          showLocalToast(`Pasta "${localFolderHandle.name}" reconectada com sucesso!`);
        }
      } else {
        showLocalToast('Permissão de acesso ao disco negada pelo navegador.', 'error', 3500);
      }
    } catch (err: any) {
      console.error('[LocalFolder] Erro ao reconectar pasta:', err);
      showLocalToast(`Erro ao reconectar: ${err?.message || 'Falha de permissão'}`, 'error', 3500);
    }
  };

  const handleDisconnectLocalFolder = async () => {
    const folderName = localFolderName;
    setLocalFolderHandle(null);
    setLocalFolderName(null);
    setLocalFolderPermissionNeeded(false);
    await clearHandleFromIndexedDB();
    showLocalToast(`Pasta "${folderName || 'local'}" desconectada`);
  };

  const handleSaveToLocalFolder = async (fileToSave?: ProjectFile) => {
    if (!localFolderHandle) return;
    const targetFile = fileToSave || files.find((f) => f.id === activeFileId);
    if (!targetFile) return;

    try {
      setIsSavingLocal(true);
      const content = targetFile.id === activeFileId ? code : targetFile.content;
      await writeFileToFolder(localFolderHandle, targetFile.path || targetFile.name, content);
      showLocalToast(`"${targetFile.name}" salvo no disco!`);
    } catch (err: any) {
      console.error('[LocalFolder] Erro ao salvar arquivo:', err);
      if (err?.name === 'NotAllowedError') {
        setLocalFolderPermissionNeeded(true);
        showLocalToast('Permissão de gravação expirada. Reconecte a pasta.', 'error', 4000);
      } else {
        showLocalToast(`Erro ao salvar no disco: ${err?.message || 'Falha'}`, 'error', 3500);
      }
    } finally {
      setIsSavingLocal(false);
    }
  };

  const handleSaveAllToLocalFolder = async () => {
    if (!localFolderHandle) return;
    try {
      setIsSavingLocal(true);
      for (const f of files) {
        const content = f.id === activeFileId ? code : f.content;
        await writeFileToFolder(localFolderHandle, f.path || f.name, content);
      }
      showLocalToast(`Todos os ${files.length} arquivos salvos no disco!`);
    } catch (err: any) {
      console.error('[LocalFolder] Erro ao salvar todos os arquivos:', err);
      if (err?.name === 'NotAllowedError') {
        setLocalFolderPermissionNeeded(true);
        showLocalToast('Permissão de gravação expirada. Reconecte a pasta.', 'error', 4000);
      } else {
        showLocalToast(`Erro ao salvar arquivos: ${err?.message || 'Falha'}`, 'error', 3500);
      }
    } finally {
      setIsSavingLocal(false);
    }
  };

  // Debounced Autosave (1200ms) when saveMode === 'auto'
  const autosaveTimerRef = useRef<any>(null);
  useEffect(() => {
    if (saveMode !== 'auto' || !localFolderHandle || localFolderPermissionNeeded) {
      return;
    }
    const activeFile = files.find((f) => f.id === activeFileId);
    if (!activeFile) return;

    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
    }

    autosaveTimerRef.current = setTimeout(async () => {
      try {
        await writeFileToFolder(localFolderHandle, activeFile.path || activeFile.name, code);
        showLocalToast(`Autosave: "${activeFile.name}" salvo`, 'success', 1500);
      } catch (err: any) {
        console.warn('[LocalFolder] Autosave falhou:', err);
        if (err?.name === 'NotAllowedError') {
          setLocalFolderPermissionNeeded(true);
        }
      }
    }, 1200);

    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
      }
    };
  }, [code, activeFileId, saveMode, localFolderHandle, localFolderPermissionNeeded, files, showLocalToast]);

  // Keyboard shortcut Ctrl+S / Cmd+S (Save active file) & Ctrl+Shift+S (Save all files)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (!localFolderHandle) return;
        if (e.shiftKey) {
          handleSaveAllToLocalFolder();
        } else {
          handleSaveToLocalFolder();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [localFolderHandle, files, activeFileId, code]);

  // Test connection function (used by SettingsModal)
  const handleTestConnection = async (
    cfg: ConnectionConfig,
    targetProvider?: AIProvider
  ): Promise<{ success: boolean; message: string }> => {
    const providerToTest = targetProvider || cfg.provider;

    if (providerToTest === 'gemini') {
      try {
        const keys = cfg.geminiKeys && cfg.geminiKeys.length > 0 ? cfg.geminiKeys : [];
        let results: any[] = [];

        try {
          const res = await fetch('/api/ai/test-keys', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              keys,
              model: cfg.geminiModel || 'gemini-3.8-flash',
            }),
          });
          if (res.ok) {
            const data = await safeReadJsonResponse(res);
            if (data.results && Array.isArray(data.results)) {
              results = data.results;
            }
          }
        } catch {
          // fallback para teste direto
        }

        if (results.length === 0 && keys.length > 0) {
          results = await testGeminiKeysDirect(keys, cfg.geminiModel || 'gemini-3.8-flash');
        }

        if (results.length > 0) {
          const allValid = results.every((r: any) => r.valid);
          const validCount = results.filter((r: any) => r.valid).length;
          const details = results
            .map((r: any) => `${r.keyMask}: ${r.valid ? '✓ Válida' : `✗ ${r.message}`}`)
            .join(' | ');
          return {
            success: allValid || validCount > 0,
            message: `${validCount}/${results.length} chave(s) operacionais. (${details})`,
          };
        }
        return {
          success: false,
          message: 'Nenhuma chave Gemini disponível ou testada.',
        };
      } catch (err: any) {
        return { success: false, message: `Erro ao testar Gemini: ${err.message}` };
      }
    }

    if (!cfg.endpointUrl || !cfg.endpointUrl.trim()) {
      return {
        success: false,
        message: 'Por favor, informe a URL do endpoint (aba Google Colab / ngrok).',
      };
    }

    try {
      const baseUrl = cfg.endpointUrl.trim().replace(/\/+$/, '');
      let testUrl = baseUrl;
      if (!testUrl.includes('/v1/') && !testUrl.includes('/api/')) {
        testUrl = `${baseUrl}/v1/chat/completions`;
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': '1',
      };
      if (cfg.authToken) headers['Authorization'] = `Bearer ${cfg.authToken}`;

      // Check what models the Colab instance actually has
      let detectedModel = '';
      try {
        let pingRes: Response | null = null;
        if (cfg.useProxy) {
          try {
            pingRes = await fetch('/api/proxy', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                url: `${baseUrl}/v1/models`,
                method: 'GET',
                headers,
              }),
            });
          } catch {}
        }

        // Se o proxy não respondeu ou retornou 404 (ex: Vercel sem backend Node)
        if (!pingRes || !pingRes.ok) {
          try {
            pingRes = await fetch(`${baseUrl}/v1/models`, {
              method: 'GET',
              headers,
            });
          } catch {}
        }

        if (pingRes && pingRes.ok) {
          const pingData = await safeReadJsonResponse(pingRes);
          if (pingData.data && Array.isArray(pingData.data) && pingData.data.length > 0) {
            detectedModel = pingData.data[0].id || pingData.data[0].name || '';
          } else if (Array.isArray(pingData) && pingData.length > 0) {
            detectedModel = pingData[0].id || pingData[0].name || '';
          } else if (pingData.models && Array.isArray(pingData.models) && pingData.models.length > 0) {
            detectedModel = pingData.models[0].name || pingData.models[0].id || '';
          }
        }
      } catch {}

      // Resolve model to test:
      let modelName = cfg.colabModel?.trim();
      if (!modelName && detectedModel) {
        modelName = detectedModel;
      }
      if (!modelName) {
        try {
          const parsed = JSON.parse(cfg.requestTemplate);
          if (parsed.model && !parsed.model.includes('mistral')) {
            modelName = parsed.model;
          }
        } catch {}
      }
      if (!modelName) {
        modelName = detectedModel || '';
      }

      const testPayload = {
        model: modelName || 'default',
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 5,
      };

      let res: Response;
      let usedDirectFallback = false;

      if (cfg.useProxy) {
        let proxyOk = false;
        try {
          res = await fetch('/api/proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              url: testUrl,
              headers,
              body: testPayload,
            }),
          });
          // Se retornou 404 de infraestrutura (Vercel Edge gru1 / sem backend)
          if (res.status === 404) {
            const peek = await res.clone().text();
            if (peek.includes('NOT_FOUND') || peek.includes('gru1::') || peek.includes('The page could not be found')) {
              console.warn('[Colab] /api/proxy inexistente nesta hospedagem estática. Tentando conexão direta...');
              res = await fetch(testUrl, {
                method: 'POST',
                headers,
                body: JSON.stringify(testPayload),
              });
              usedDirectFallback = true;
            } else {
              proxyOk = true;
            }
          } else {
            proxyOk = true;
          }
        } catch (proxyErr) {
          // Erro de rede no proxy -> tenta direto
          res = await fetch(testUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(testPayload),
          });
          usedDirectFallback = true;
        }
      } else {
        res = await fetch(testUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(testPayload),
        });
      }

      const data = await safeReadJsonResponse(res);

      if (res.ok) {
        return {
          success: true,
          message: detectedModel
            ? `Conexão com Colab/ngrok realizada com sucesso! Modelo ativo detectado: "${detectedModel}"`
            : modelName
            ? `Conexão com Colab/ngrok realizada com sucesso! Testado com modelo "${modelName}".`
            : 'Conexão com endpoint Colab/ngrok realizada com sucesso!',
        };
      }

      // If 404 or 405 on /v1/chat/completions, but models endpoint replied
      if (detectedModel) {
        return {
          success: true,
          message: `Servidor Colab ativo e acessível via ngrok! Modelo detectado: "${detectedModel}".`,
        };
      }

      const errDetail =
        data.error || data.detail || data.message || `Endpoint respondeu com status ${res.status}.`;
      let userMsg = typeof errDetail === 'object' ? JSON.stringify(errDetail) : String(errDetail);
      if (userMsg.includes('not found') && userMsg.includes('model')) {
        userMsg += detectedModel
          ? ` Sugestão: Selecione o modelo "${detectedModel}" nas Configurações do Colab.`
          : ` Dica: Acesse Configurações ⚙️ > aba Google Colab / ngrok e defina o nome exato do modelo carregado no seu Colab (vLLM).`;
      }
      return {
        success: false,
        message: userMsg,
      };
    } catch (err: any) {
      return {
        success: false,
        message: `Falha ao conectar: ${err.message}. Certifique-se de que a sessão do Colab está rodando e o ngrok está ativo.`,
      };
    }
  };

  // Send instruction or question to AI (supports Planning Mode vs Execution Mode, and Full Mode vs Selection Mode)
  const handleSendInstruction = async (
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

    // Check Selection Mode constraints
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

    // If Colab mode without URL, open settings
    if (activeProvider === 'colab' && !config.endpointUrl.trim()) {
      setIsSettingsOpen(true);
      return;
    }

    // Capture attachments and reset composer state
    const imagesToSend = [...attachedImages];
    setAttachedImages([]);
    const defaultText =
      imagesToSend.length > 0 ? 'Analise a imagem anexada e ajude com o problema exibido.' : '';
    const userPromptText = trimmed || defaultText;

    // Check if the current model natively supports vision
    const activeModelAcceptsVision =
      activeProvider === 'gemini'
        ? true
        : Boolean(
            (activeColabModel && config.modelVisionMap?.[activeColabModel]) ||
            (currentMode === 'plan' ? config.planningAcceptsImages : config.executionAcceptsImages)
          );

    let visionAnalysisText: string | undefined;

    // If user attached images but the main model is text-only (e.g. Qwen3.6):
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

    const currentCode = code;

    // Quando workspaceMode === 'project', enviamos todos os arquivos do projeto e o path do arquivo ativo
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

    const multiFileContext = buildProjectContextPrompt(projectFilesPayload, activeFilePath, 60000);

    try {
      if (currentMode === 'plan') {
        // === MODO PLANEJAMENTO (Apenas conversa/mentoria, sem alteração de código) ===
        if (activeProvider === 'gemini') {
          let planText = '';
          let usedKeyMask: string | undefined;

          try {
            const res = await fetch('/api/ai/plan', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                instruction: effectiveInstruction,
                message: effectiveInstruction,
                code: currentCode,
                selectedText: isSelection && capturedSelection ? capturedSelection.text : undefined,
                scope: isSelection ? 'selection' : 'full',
                language,
                model: config.geminiModel || 'gemini-3.8-flash',
                images: activeModelAcceptsVision && imagesToSend.length > 0 ? imagesToSend : undefined,
                apiKeys: config.geminiKeys || [],
                geminiKeys: config.geminiKeys || [],
                projectFiles: projectFilesPayload,
                activeFilePath,
              }),
            });

            if (res.status === 404) {
              const fallback = await callGeminiClientDirect({
                instruction: effectiveInstruction,
                code: currentCode,
                selectedText: isSelection && capturedSelection ? capturedSelection.text : undefined,
                language,
                model: config.geminiModel || 'gemini-3.8-flash',
                keys: config.geminiKeys || [],
                mode: 'plan',
                projectFiles: projectFilesPayload,
                activeFilePath,
                images: activeModelAcceptsVision && imagesToSend.length > 0 ? imagesToSend : undefined,
              });
              planText = fallback.text;
            } else {
              const data = await safeReadJsonResponse(res);
              if (!res.ok) {
                throw new Error(data.error || `Erro do servidor: ${res.status}`);
              }
              planText = data.reply || data.text || 'Sem resposta do assistente de planejamento.';
              usedKeyMask = data.usedKeyMask || data.usedKey;
            }
          } catch (apiErr: any) {
            if (config.geminiKeys && config.geminiKeys.length > 0) {
              const fallback = await callGeminiClientDirect({
                instruction: effectiveInstruction,
                code: currentCode,
                selectedText: isSelection && capturedSelection ? capturedSelection.text : undefined,
                language,
                model: config.geminiModel || 'gemini-3.8-flash',
                keys: config.geminiKeys,
                mode: 'plan',
                projectFiles: projectFilesPayload,
                activeFilePath,
                images: activeModelAcceptsVision && imagesToSend.length > 0 ? imagesToSend : undefined,
              });
              planText = fallback.text;
            } else {
              throw apiErr;
            }
          }

          const planMsg: ChatMessage = {
            id: `plan-${Date.now()}`,
            type: 'explanation',
            text: planText || 'Sem resposta do assistente de planejamento.',
            mode: 'plan',
            timestamp: Date.now(),
            provider: `${config.geminiModel || 'Gemini'} (Planejamento)`,
            usedKeyMask,
          };
          setMessages((prev) => [...prev, planMsg]);
          setStatus('connected');
          setStatusText('Gemini pronto');
        } else {
          // Colab (ngrok) planning mode with streaming
          let targetUrl = config.endpointUrl.trim();
          if (!targetUrl.includes('/v1/') && !targetUrl.includes('/api/')) {
            targetUrl = targetUrl.replace(/\/+$/, '') + '/v1/chat/completions';
          }

          const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'ngrok-skip-browser-warning': '1',
          };
          if (config.authToken) headers['Authorization'] = `Bearer ${config.authToken}`;

          // Resolve model for Colab
          let modelName = activeColabModel;
          if (!modelName) {
            try {
              const parsed = JSON.parse(config.requestTemplate);
              if (parsed.model && !parsed.model.includes('mistral')) {
                modelName = parsed.model;
              }
            } catch {}
          }

          // If still empty, try quick automatic discovery from /v1/models
          if (!modelName) {
            try {
              const baseUrl = config.endpointUrl.trim().replace(/\/+$/, '');
              const modelCheckRes = await fetch(config.useProxy ? '/api/proxy' : `${baseUrl}/v1/models`, {
                method: config.useProxy ? 'POST' : 'GET',
                headers,
                body: config.useProxy
                  ? JSON.stringify({
                      url: `${baseUrl}/v1/models`,
                      method: 'GET',
                      headers: { 'ngrok-skip-browser-warning': '1' },
                    })
                  : undefined,
              });
              const modelData = await safeReadJsonResponse(modelCheckRes);
              if (modelData.data && Array.isArray(modelData.data) && modelData.data.length > 0) {
                modelName = modelData.data[0].id || modelData.data[0].name;
                if (modelName) {
                  setConfig((prev) => ({ ...prev, colabModel: modelName! }));
                }
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

          const abortController = new AbortController();
          activeAbortControllerRef.current = abortController;

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
                signal: abortController.signal,
              });
              if (res.status === 404) {
                const peek = await res.clone().text();
                if (peek.includes('NOT_FOUND') || peek.includes('gru1::') || peek.includes('The page could not be found')) {
                  console.warn('[Colab Plan] /api/proxy não disponível nesta hospedagem estática. Conectando diretamente ao ngrok...');
                  res = await fetch(targetUrl, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(promptBody),
                    signal: abortController.signal,
                  });
                }
              }
            } catch (proxyErr) {
              res = await fetch(targetUrl, {
                method: 'POST',
                headers,
                body: JSON.stringify(promptBody),
                signal: abortController.signal,
              });
            }
          } else {
            res = await fetch(targetUrl, {
              method: 'POST',
              headers,
              body: JSON.stringify(promptBody),
              signal: abortController.signal,
            });
          }

          const streamResult = await readAiStream({
            response: res,
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
        // === MODO EXECUÇÃO (Gera proposta de edição e diff para aprovação) ===
        if (activeProvider === 'gemini') {
          let returnedSnippetOrCode = '';
          let usedKeyMask: string | undefined;

          try {
            const res = await fetch('/api/ai/edit', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                code: currentCode,
                selectedText: isSelection && capturedSelection ? capturedSelection.text : undefined,
                scope: isSelection ? 'selection' : 'full',
                instruction: effectiveInstruction,
                language,
                model: config.geminiModel || 'gemini-3.8-flash',
                images: activeModelAcceptsVision && imagesToSend.length > 0 ? imagesToSend : undefined,
                apiKeys: config.geminiKeys || [],
                geminiKeys: config.geminiKeys || [],
                projectFiles: projectFilesPayload,
                activeFilePath,
              }),
            });

            if (res.status === 404) {
              const fallback = await callGeminiClientDirect({
                instruction: effectiveInstruction,
                code: currentCode,
                selectedText: isSelection && capturedSelection ? capturedSelection.text : undefined,
                language,
                model: config.geminiModel || 'gemini-3.8-flash',
                keys: config.geminiKeys || [],
                mode: 'edit',
                projectFiles: projectFilesPayload,
                activeFilePath,
                images: activeModelAcceptsVision && imagesToSend.length > 0 ? imagesToSend : undefined,
              });
              returnedSnippetOrCode = fallback.text;
            } else {
              const data = await safeReadJsonResponse(res);
              if (!res.ok) {
                throw new Error(data.error || `Erro do servidor: ${res.status}`);
              }
              returnedSnippetOrCode = data.code;
              usedKeyMask = data.usedKeyMask;
            }
          } catch (apiErr: any) {
            if (config.geminiKeys && config.geminiKeys.length > 0) {
              const fallback = await callGeminiClientDirect({
                instruction: effectiveInstruction,
                code: currentCode,
                selectedText: isSelection && capturedSelection ? capturedSelection.text : undefined,
                language,
                model: config.geminiModel || 'gemini-3.8-flash',
                keys: config.geminiKeys,
                mode: 'edit',
                projectFiles: projectFilesPayload,
                activeFilePath,
                images: activeModelAcceptsVision && imagesToSend.length > 0 ? imagesToSend : undefined,
              });
              returnedSnippetOrCode = fallback.text;
            } else {
              throw apiErr;
            }
          }

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
              usedKeyMask,
              mode: 'execute',
            };

            setMessages((prev) => [...prev, proposalMsg]);
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
              usedKeyMask,
              mode: 'execute',
            };

            setMessages((prev) => [...prev, proposalMsg]);
          }

          setStatus('connected');
          setStatusText('Gemini pronto');
        } else {
          // Colab (ngrok) execution mode with streaming
          let body: any;
          const snippetToPrompt =
            isSelection && capturedSelection ? capturedSelection.text : currentCode;

          let effectiveColabInstruction = effectiveInstruction;
          if (multiFileContext.hasMultiFiles) {
            effectiveColabInstruction = `[CONTEXTO ARQUITETURAL DE TODO O PROJETO (${projectFilesPayload?.length || files.length} arquivos)]:
${multiFileContext.contextText}

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
            // If activeColabModel is configured, ensure body.model matches it
            if (activeColabModel) {
              body.model = activeColabModel;
            } else if (config.colabModel?.trim()) {
              body.model = config.colabModel.trim();
            } else if (!body.model || body.model.includes('mistral')) {
              // Attempt quick auto-discovery from /v1/models
              try {
                const baseUrl = config.endpointUrl.trim().replace(/\/+$/, '');
                const modelCheckRes = await fetch(config.useProxy ? '/api/proxy' : `${baseUrl}/v1/models`, {
                  method: config.useProxy ? 'POST' : 'GET',
                  headers: {
                    'Content-Type': 'application/json',
                    'ngrok-skip-browser-warning': '1',
                  },
                  body: config.useProxy
                    ? JSON.stringify({
                        url: `${baseUrl}/v1/models`,
                        method: 'GET',
                        headers: { 'ngrok-skip-browser-warning': '1' },
                      })
                    : undefined,
                });
                const modelData = await safeReadJsonResponse(modelCheckRes);
                if (modelData.data && Array.isArray(modelData.data) && modelData.data.length > 0) {
                  const autoModel = modelData.data[0].id || modelData.data[0].name;
                  if (autoModel) {
                    body.model = autoModel;
                    setConfig((prev) => ({ ...prev, colabModel: autoModel }));
                  }
                }
              } catch {}
            }

            // If active model supports vision natively, attach images to the user message in body.messages
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
          } catch (e: any) {
            throw new Error(
              'O modelo de requisição nas configurações avançadas não gerou um JSON válido. Verifique em "Conexão > Avançado".'
            );
          }

          // Ativa streaming no payload para manter transferência constante de chunks (evita timeout HTTP do ngrok)
          body.stream = true;

          const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'ngrok-skip-browser-warning': '1',
          };
          if (config.authToken) headers['Authorization'] = `Bearer ${config.authToken}`;

          let targetUrl = config.endpointUrl.trim();
          if (!targetUrl.includes('/v1/') && !targetUrl.includes('/api/')) {
            targetUrl = targetUrl.replace(/\/+$/, '') + '/v1/chat/completions';
          }

          // Cria mensagem temporária de progresso na UI
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

          const abortController = new AbortController();
          activeAbortControllerRef.current = abortController;

          let res: Response;
          if (config.useProxy) {
            try {
              res = await fetch('/api/proxy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  url: targetUrl,
                  headers,
                  body,
                }),
                signal: abortController.signal,
              });
              if (res.status === 404) {
                const peek = await res.clone().text();
                if (peek.includes('NOT_FOUND') || peek.includes('gru1::') || peek.includes('The page could not be found')) {
                  console.warn('[Colab Exec] /api/proxy não disponível nesta hospedagem estática. Conectando diretamente ao ngrok...');
                  res = await fetch(targetUrl, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(body),
                    signal: abortController.signal,
                  });
                }
              }
            } catch (proxyErr) {
              res = await fetch(targetUrl, {
                method: 'POST',
                headers,
                body: JSON.stringify(body),
                signal: abortController.signal,
              });
            }
          } else {
            res = await fetch(targetUrl, {
              method: 'POST',
              headers,
              body: JSON.stringify(body),
              signal: abortController.signal,
            });
          }

          const streamResult = await readAiStream({
            response: res,
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

          // Extrai o código limpo, removendo raciocínio e blocos markdown
          const extractedCode = cleanCodeOutput(streamResult.content);

          if (!extractedCode.trim() && !streamResult.thinking.trim()) {
            throw new Error(
              'A resposta do modelo não continha código nem raciocínio. Verifique o prompt ou o modelo configurado.'
            );
          }

          // Se o stream foi interrompido ou contém código limpo, preserva o resultado
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
          }

          setStatus('connected');
          setStatusText('conectado');
        }
      }
    } catch (err: any) {
      console.error('Erro na requisição da IA:', err);
      const isAbort = err.name === 'AbortError' || err.message?.includes('aborted') || err.message?.includes('cancelad');
      setMessages((prev) => prev.filter((m) => !m.streaming));

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
        (errMsg.includes('MODEL_NOT_FOUND') ||
        errMsg.toLowerCase().includes('model not found') ||
        errMsg.toLowerCase().includes('model_not_found') ||
        errMsg.toLowerCase().includes('does not exist') ||
        (errMsg.includes('404') && !errMsg.includes('HTTP 404')));

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
      }

      const errorMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        type: 'error',
        text: userFacingError,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errorMsg]);
      if (!isAbort) {
        setStatus('disconnected');
        setStatusText('erro na conexão');
      }
    } finally {
      setIsLoading(false);
      activeAbortControllerRef.current = null;
    }
  };

  // Apply proposed diff
  const handleApplyDiff = (msgId: string, newCode: string) => {
    setCode(newCode);
    pushHistory(newCode);

    // Sync with active project file
    setFiles((prev) =>
      prev.map((f) => (f.id === activeFileId ? { ...f, content: newCode } : f))
    );

    // Clear active selection to avoid stale highlights
    setSelection(null);

    const targetMsg = messages.find((m) => m.id === msgId);
    addCheckpoint({
      description: `Edição IA: ${targetMsg?.scope === 'selection' ? 'Trecho Selecionado' : 'Arquivo Completo'}`,
      code: newCode,
      source: 'ai',
      fileId: activeFileId,
      fileName: activeFile?.name,
    });

    setMessages((prev) =>
      prev.map((m) => (m.id === msgId ? { ...m, applied: true, discarded: false } : m))
    );
  };

  // Sugestão 3: Apply partial diff (hunk-by-hunk) without discarding the proposal completely
  const handleApplyPartialDiff = (msgId: string, updatedCode: string) => {
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
  };

  // Sugestão Extra: Formatação automática de código
  const handleFormatCode = () => {
    const formatted = formatCode(code, language);
    if (formatted !== code) {
      setCode(formatted);
      pushHistory(formatted);
      setFiles((prev) =>
        prev.map((f) => (f.id === activeFileId ? { ...f, content: formatted } : f))
      );
      addCheckpoint({
        description: 'Formatação automática de código',
        code: formatted,
        source: 'format',
        fileId: activeFileId,
        fileName: activeFile?.name,
      });
    }
  };

  // Sugestão Extra: Exportar projeto como ZIP (Etapa 4)
  const handleExportZip = async () => {
    try {
      await exportProjectAsZip(files, workspaceMode, code, language);
    } catch (err: any) {
      console.error('Erro ao exportar ZIP:', err);
    }
  };

  // Aplica os arquivos importados (substituindo ou mesclando)
  const applyImportedFiles = useCallback(
    (incoming: ProjectFile[], mode: 'replace' | 'merge') => {
      if (mode === 'replace') {
        setFiles(incoming);
        setWorkspaceMode('project');
        const first = incoming[0];
        if (first) {
          setActiveFileId(first.id);
          setCode(first.content);
          setLanguage(first.language);
          setHistory([first.content]);
          setHistoryIndex(0);
          setSelection(null);
        }
      } else {
        // Mesclagem com arquivos existentes: arquivos com o mesmo path devem ser sobrescritos
        const incomingPathMap = new Map<string, ProjectFile>();
        incoming.forEach((f) => {
          incomingPathMap.set(normalizeFilePath(f.path || f.name).toLowerCase(), f);
        });

        const merged: ProjectFile[] = [];
        files.forEach((existing) => {
          const norm = normalizeFilePath(existing.path || existing.name).toLowerCase();
          if (!incomingPathMap.has(norm)) {
            merged.push(existing);
          }
        });
        merged.push(...incoming);

        setFiles(merged);
        setWorkspaceMode('project');
        const stillActive = merged.find((f) => f.id === activeFileId);
        if (stillActive) {
          setCode(stillActive.content);
          setLanguage(stillActive.language);
        } else {
          const first = incoming[0] || merged[0];
          if (first) {
            setActiveFileId(first.id);
            setCode(first.content);
            setLanguage(first.language);
            setHistory([first.content]);
            setHistoryIndex(0);
            setSelection(null);
          }
        }
      }
      setIsImportConflictOpen(false);
      setPendingImportFiles(null);
    },
    [files, activeFileId]
  );

  // Processa arquivos recebidos por .zip ou drag & drop
  const handleProcessIncomingFiles = useCallback(
    (incoming: ProjectFile[]) => {
      if (incoming.length === 0) return;
      // Se o workspace estiver vazio ou com arquivo inicial sem edição
      const isWorkspaceEmpty =
        files.length === 0 ||
        (files.length === 1 && (!files[0].content || files[0].content.trim() === ''));

      if (isWorkspaceEmpty) {
        applyImportedFiles(incoming, 'replace');
      } else {
        setPendingImportFiles(incoming);
        setIsImportConflictOpen(true);
      }
    },
    [files, applyImportedFiles]
  );

  // Importa projeto a partir de um arquivo .zip (Etapa 2)
  const handleImportZip = useCallback(
    async (file: File) => {
      try {
        const imported = await importProjectFromZip(file);
        if (imported.length === 0) {
          alert('Nenhum arquivo de código/texto suportado foi localizado no arquivo .zip.');
          return;
        }
        handleProcessIncomingFiles(imported);
      } catch (err: any) {
        console.error('Erro ao importar ZIP:', err);
        alert(`Erro ao processar o arquivo .zip: ${err?.message || 'Arquivo corrompido ou formato inválido'}`);
      }
    },
    [handleProcessIncomingFiles]
  );

  // Handlers de Drag & Drop (Etapa 3)
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current += 1;
    if (e.dataTransfer && e.dataTransfer.types.includes('Files')) {
      setIsDraggingOver(true);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setIsDraggingOver(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDraggingOver(false);

    try {
      const droppedFiles = await processDroppedData(e.dataTransfer);
      if (droppedFiles.length > 0) {
        handleProcessIncomingFiles(droppedFiles);
      }
    } catch (err: any) {
      console.error('Erro ao soltar arquivos:', err);
    }
  };

  // Sugestão Extra: Restaurar versão de checkpoint
  const handleRestoreCheckpoint = (cp: VersionCheckpoint) => {
    setCode(cp.code);
    pushHistory(cp.code);
    setFiles((prev) =>
      prev.map((f) => (f.id === activeFileId ? { ...f, content: cp.code } : f))
    );
    setSelection(null);
    addCheckpoint({
      description: `Restaurado de: ${cp.description}`,
      code: cp.code,
      source: 'user',
      fileId: activeFileId,
      fileName: activeFile?.name,
    });
  };

  // Sugestão Extra: Explicar código via IA (intent === 'explain' no modo Planejamento)
  const handleExplainCode = async () => {
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
  };

  // Sugestão 4: Auto-Fix syntax diagnostic with 1-click
  const handleAutoFixDiagnostic = (diagOrList: DiagnosticItem | DiagnosticItem[]) => {
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
    // Submit immediately with full scope to repair the whole code
    setTimeout(() => {
      handleSendInstruction(fixPrompt, 'full', 'execute');
    }, 50);
  };

  // Discard proposed diff
  const handleDiscardDiff = (msgId: string) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === msgId ? { ...m, discarded: true } : m))
    );
  };

  // Clear chat log
  const handleClearChat = () => {
    setMessages([]);
  };

  // Copy code
  const handleCopyCode = () => {
    navigator.clipboard.writeText(code);
  };

  // Download file
  const handleDownloadCode = () => {
    const extMap: Record<SupportedLanguage, string> = {
      html: 'html',
      javascript: 'js',
      typescript: 'ts',
      css: 'css',
      python: 'py',
      json: 'json',
      markdown: 'md',
    };
    const extension = extMap[language] || 'txt';
    const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const currentFileName =
      workspaceMode === 'project'
        ? files.find((f) => f.id === activeFileId)?.name || `arquivo.${extension}`
        : `codigo_${Date.now()}.${extension}`;
    a.download = currentFileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Clear code in editor
  const handleClearCode = () => {
    setCode('');
    pushHistory('');
    setFiles((prev) =>
      prev.map((f) => (f.id === activeFileId ? { ...f, content: '' } : f))
    );
    setSelection(null);
  };

  // Select template
  const handleSelectTemplate = (template: CodeTemplate) => {
    setCode(template.code);
    setLanguage(template.language);
    pushHistory(template.code);
    setFiles((prev) =>
      prev.map((f) =>
        f.id === activeFileId
          ? { ...f, content: template.code, language: template.language }
          : f
      )
    );
    setSelection(null);
  };

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="relative flex flex-col h-screen w-screen overflow-hidden bg-[var(--bg)] text-[var(--text)]"
    >
      {/* Drag & Drop Visual Overlay (Etapa 3) */}
      <DropzoneOverlay isVisible={isDraggingOver} />

      {/* Header Bar */}
      <Header
        status={status}
        statusText={statusText}
        config={config}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        canUndo={historyIndex > 0}
        canRedo={historyIndex < history.length - 1}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onCopy={handleCopyCode}
        onDownload={handleDownloadCode}
        onExportZip={handleExportZip}
        onImportZip={handleImportZip}
        onOpenSettings={() => {
          setSettingsDefaultTab('modes');
          setIsSettingsOpen(true);
        }}
        onOpenTemplates={() => setIsTemplatesOpen(true)}
        localFolderConnected={Boolean(localFolderHandle && !localFolderPermissionNeeded)}
        localFolderName={localFolderName}
        saveMode={saveMode}
        isSavingLocal={isSavingLocal}
        onSaveLocalFolder={() => handleSaveToLocalFolder()}
        onOpenLocalFolderSettings={() => {
          setSettingsDefaultTab('localFolder');
          setIsSettingsOpen(true);
        }}
      />

      {/* Main Content Area (Split layout) */}
      <main className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
        {/* Left / Center: Code Editor & In-Window Visualizer */}
        <CodeEditorPanel
          code={code}
          language={language}
          theme={theme}
          viewMode={viewMode}
          onChangeViewMode={(mode) => setViewMode(mode)}
          onChangeLanguage={(lang) => {
            setLanguage(lang);
            setFiles((prev) =>
              prev.map((f) => (f.id === activeFileId ? { ...f, language: lang } : f))
            );
          }}
          onChangeCode={handleChangeCode}
          onClearCode={handleClearCode}
          lineWrapping={lineWrapping}
          onToggleLineWrapping={() => setLineWrapping(!lineWrapping)}
          fontSize={fontSize}
          onChangeFontSize={setFontSize}
          // Selection & AI Scope
          selection={selection}
          onSelectionChange={setSelection}
          aiScopeMode={aiScopeMode}
          // Multi-file Workspace
          workspaceMode={workspaceMode}
          onChangeWorkspaceMode={handleChangeWorkspaceMode}
          files={files}
          activeFileId={activeFileId}
          onSelectFile={handleSelectFile}
          onAddFile={handleAddFile}
          onDeleteFile={handleDeleteFile}
          onRenameFile={handleRenameFile}
          // Sugestão 4: Diagnóstico e Auto-Fix
          onAutoFixDiagnostic={handleAutoFixDiagnostic}
          isLoading={isLoading}
          // Sugestões Extras: Formatação e Histórico de Versões
          onFormatCode={handleFormatCode}
          onOpenVersionHistory={() => setIsVersionHistoryOpen(true)}
          checkpointCount={checkpoints.length}
        />

        {/* Right: AI Commands & Diff Chat */}
        <SidePanel
          messages={messages}
          instruction={instruction}
          isLoading={isLoading}
          onChangeInstruction={setInstruction}
          onSend={handleSendInstruction}
          onClearChat={handleClearChat}
          onApplyDiff={handleApplyDiff}
          onApplyPartialDiff={handleApplyPartialDiff}
          onDiscardDiff={handleDiscardDiff}
          onSelectQuickPrompt={(p) => setInstruction(p)}
          currentCode={code}
          // Multimodal (Images)
          attachedImages={attachedImages}
          onAddImages={handleAddImages}
          onRemoveImage={handleRemoveImage}
          isAnalyzingVision={isAnalyzingVision}
          // Mode (Planejamento vs Execução)
          interactionMode={interactionMode}
          onChangeInteractionMode={setInteractionMode}
          activeProvider={currentActiveProvider}
          onToggleActiveProvider={handleToggleActiveProvider}
          onOpenSettings={() => setIsSettingsOpen(true)}
          activeShortModelName={activeShortModelName}
          activeFullModelInfo={activeFullModelInfo}
          // AI Scope & Selection
          aiScopeMode={aiScopeMode}
          onChangeAiScopeMode={setAiScopeMode}
          selection={selection}
          onClearSelection={() => setSelection(null)}
          onExplainCode={handleExplainCode}
          onCancelInstruction={isLoading || isAnalyzingVision ? handleCancelInstruction : undefined}
        />
      </main>

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        config={config}
        onClose={() => setIsSettingsOpen(false)}
        onSave={(newCfg) => setConfig(newCfg)}
        onTestConnection={handleTestConnection}
        localFolderSupported={isFileSystemAccessSupported()}
        localFolderName={localFolderName}
        localFolderPermissionNeeded={localFolderPermissionNeeded}
        saveMode={saveMode}
        onOpenLocalFolder={handleOpenLocalFolder}
        onReconnectLocalFolder={handleReconnectLocalFolder}
        onDisconnectLocalFolder={handleDisconnectLocalFolder}
        onChangeSaveMode={handleChangeSaveMode}
        defaultTab={settingsDefaultTab}
      />

      {/* Code Templates Modal */}
      <TemplatesModal
        isOpen={isTemplatesOpen}
        onClose={() => setIsTemplatesOpen(false)}
        onSelectTemplate={handleSelectTemplate}
      />

      {/* Version History Checkpoints Modal */}
      <VersionHistoryModal
        isOpen={isVersionHistoryOpen}
        onClose={() => setIsVersionHistoryOpen(false)}
        checkpoints={checkpoints}
        onRestoreCheckpoint={handleRestoreCheckpoint}
        activeFileName={
          workspaceMode === 'project'
            ? files.find((f) => f.id === activeFileId)?.name
            : `arquivo.${language}`
        }
      />

      {/* Import Conflict Resolution Modal (Etapas 2 e 3) */}
      {isImportConflictOpen && pendingImportFiles && (
        <ImportConflictModal
          isOpen={isImportConflictOpen}
          incomingFiles={pendingImportFiles}
          existingFiles={files}
          onReplace={() => applyImportedFiles(pendingImportFiles, 'replace')}
          onMerge={() => applyImportedFiles(pendingImportFiles, 'merge')}
          onCancel={() => {
            setIsImportConflictOpen(false);
            setPendingImportFiles(null);
          }}
        />
      )}

      {/* Local Folder Toast Feedback */}
      {localSaveToast && (
        <div
          id="localSaveToast"
          className={`fixed bottom-5 right-5 z-50 flex items-center gap-2 px-3.5 py-2 rounded-xl border shadow-xl text-xs font-medium animate-in fade-in slide-in-from-bottom-2 duration-150 ${
            localSaveToast.type === 'success'
              ? 'bg-[var(--panel)] border-emerald-500/40 text-[var(--text)]'
              : 'bg-[var(--panel)] border-[var(--rem)]/40 text-[var(--rem)]'
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full ${
              localSaveToast.type === 'success' ? 'bg-emerald-400' : 'bg-[var(--rem)]'
            }`}
          />
          <span>{localSaveToast.message}</span>
        </div>
      )}
    </div>
  );
}
