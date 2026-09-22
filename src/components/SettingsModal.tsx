import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X,
  Sparkles,
  Network,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2,
  Key,
  Eye,
  EyeOff,
  Zap,
  Check,
  FolderDown,
  FolderOpen,
  HardDrive,
  ShieldAlert,
  FolderCheck,
  FolderX,
  Save,
} from 'lucide-react';
import { ConnectionConfig, AIProvider, AVAILABLE_GEMINI_MODELS } from '../types';
import { getShortModelName } from '../utils/modelNames';
import { Tooltip, InfoTooltip } from './Tooltip';

interface SettingsModalProps {
  isOpen: boolean;
  config: ConnectionConfig;
  onClose: () => void;
  onSave: (newConfig: ConnectionConfig) => void;
  onTestConnection: (
    configToTest: ConnectionConfig,
    targetProvider?: AIProvider
  ) => Promise<{ success: boolean; message: string }>;
  localFolderSupported?: boolean;
  localFolderName?: string | null;
  localFolderPermissionNeeded?: boolean;
  saveMode?: 'auto' | 'manual';
  onOpenLocalFolder?: () => Promise<void>;
  onReconnectLocalFolder?: () => Promise<void>;
  onDisconnectLocalFolder?: () => void;
  onChangeSaveMode?: (mode: 'auto' | 'manual') => void;
  defaultTab?: 'modes' | 'keys' | 'colab' | 'localFolder';
}

interface KeyStatusItem {
  index: number;
  keyMask: string;
  inCooldown: boolean;
  secondsRemaining: number;
  consecutive429: number;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  config,
  onClose,
  onSave,
  onTestConnection,
  localFolderSupported = false,
  localFolderName = null,
  localFolderPermissionNeeded = false,
  saveMode = 'manual',
  onOpenLocalFolder,
  onReconnectLocalFolder,
  onDisconnectLocalFolder,
  onChangeSaveMode,
  defaultTab,
}) => {
  // Mode selection & providers
  const [planningProvider, setPlanningProvider] = useState<AIProvider>(config.planningProvider || 'colab');
  const [executionProvider, setExecutionProvider] = useState<AIProvider>(config.executionProvider || 'gemini');

  // Auxiliary Vision settings
  const [visionProvider, setVisionProvider] = useState<'gemini' | 'colab' | 'none'>(
    config.visionProvider || 'gemini'
  );
  const [visionModel, setVisionModel] = useState<string>(
    config.visionModel || 'gemini-3.8-flash'
  );
  const [colabVisionModel, setColabVisionModel] = useState<string>(
    config.colabVisionModel || ''
  );
  const [colabPlanningModel, setColabPlanningModel] = useState<string>(
    config.colabPlanningModel || config.colabModel || ''
  );
  const [colabExecutionModel, setColabExecutionModel] = useState<string>(
    config.colabExecutionModel || config.colabModel || ''
  );
  const [visionPrompt, setVisionPrompt] = useState<string>(
    config.visionPrompt ||
      'Analise esta imagem (um print de tela ou de erro). 1) Transcreva literalmente TODO o texto visível (mensagens de erro, stack traces, nomes de arquivo, números de linha, valores). 2) Descreva o layout e os elementos de interface relevantes. 3) Aponte anomalias visíveis (elementos cortados, sobrepostos, desalinhados, mensagens de erro), sem propor correções. Responda em português do Brasil.'
  );
  const [modelVisionMap, setModelVisionMap] = useState<Record<string, boolean>>(
    config.modelVisionMap || {}
  );

  // Retractable sections
  const [visionSectionOpen, setVisionSectionOpen] = useState(false);
  const [showAdvancedColab, setShowAdvancedColab] = useState(false);

  // Gemini model selection
  const initialGeminiModel = config.geminiModel || 'gemini-3.8-flash';
  const isInitialCustom = !AVAILABLE_GEMINI_MODELS.some((m) => m.id === initialGeminiModel);
  const [geminiModel, setGeminiModel] = useState(isInitialCustom ? 'custom' : initialGeminiModel);
  const [customGeminiInput, setCustomGeminiInput] = useState(isInitialCustom ? initialGeminiModel : '');

  // Multi-key Gemini management
  const [geminiKeys, setGeminiKeys] = useState<string[]>(config.geminiKeys || []);
  const [newKeyInput, setNewKeyInput] = useState('');
  const [keyInputError, setKeyInputError] = useState<string | null>(null);
  const [keysHealth, setKeysHealth] = useState<Record<string, KeyStatusItem>>({});
  const [individualKeyTests, setIndividualKeyTests] = useState<
    Record<number, { status: 'testing' | 'valid' | 'invalid' | 'quota'; message: string }>
  >({});

  // Custom display names
  const [geminiDisplayName, setGeminiDisplayName] = useState(config.geminiDisplayName || '');
  const [colabDisplayName, setColabDisplayName] = useState(config.colabDisplayName || '');

  // Colab / custom endpoint settings
  const [endpointUrl, setEndpointUrl] = useState(config.endpointUrl || '');
  const [colabModel, setColabModel] = useState(config.colabModel || '');
  const [isCustomColabModel, setIsCustomColabModel] = useState(false);
  const [detectedModels, setDetectedModels] = useState<string[]>(config.detectedModels || []);
  const [detectingModels, setDetectingModels] = useState(false);
  const [authToken, setAuthToken] = useState(config.authToken || '');
  const [requestTemplate, setRequestTemplate] = useState(config.requestTemplate || '');
  const [responsePath, setResponsePath] = useState(config.responsePath || '');
  const [useProxy, setUseProxy] = useState(config.useProxy ?? true);

  // Tabs & general testing
  const [activeTab, setActiveTab] = useState<'modes' | 'keys' | 'colab' | 'localFolder'>(
    defaultTab || 'modes'
  );
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Helper para resolver o modelo ativo
  const resolveActiveModel = (
    modeModel: string | undefined,
    fallbackColabModel: string,
    modelList: string[]
  ): string => {
    const trimmedFallback = fallbackColabModel.trim();
    const trimmedMode = (modeModel || '').trim();

    if (modelList.length > 0) {
      if (trimmedMode && modelList.includes(trimmedMode)) {
        return trimmedMode;
      }
      if (trimmedFallback && modelList.includes(trimmedFallback)) {
        return trimmedFallback;
      }
      return modelList[0];
    }

    if (trimmedMode && !trimmedMode.includes('qwen3-vl-30b-a3b-128k')) {
      return trimmedMode;
    }
    return trimmedFallback;
  };

  const resolvedPlanColabModel = resolveActiveModel(colabPlanningModel, colabModel, detectedModels);
  const resolvedExecColabModel = resolveActiveModel(colabExecutionModel, colabModel, detectedModels);
  const resolvedVisionColabModel = resolveActiveModel(colabVisionModel, colabModel, detectedModels);

  // Gemini model resolved identifier
  const resolvedGeminiModel =
    geminiModel === 'custom'
      ? customGeminiInput.trim() || 'gemini-3.8-flash'
      : geminiModel || 'gemini-3.8-flash';

  const maskKey = (k: string) => {
    const trimmed = (k || '').trim();
    if (!trimmed) return '';
    if (trimmed.length <= 8) return '...' + trimmed.slice(-4);
    return trimmed.slice(0, 4) + '...' + trimmed.slice(-4);
  };

  // Fetch health/cooldown status of keys
  const refreshKeysHealth = useCallback(async (keysToQuery: string[]) => {
    if (!keysToQuery || keysToQuery.length === 0) {
      setKeysHealth({});
      return;
    }
    try {
      const res = await fetch('/api/ai/keys-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keys: keysToQuery }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.keys && Array.isArray(data.keys)) {
          const map: Record<string, KeyStatusItem> = {};
          data.keys.forEach((item: KeyStatusItem) => {
            map[item.keyMask] = item;
          });
          setKeysHealth(map);
        }
      }
    } catch {
      // ignore
    }
  }, []);

  // Sync state on modal open
  useEffect(() => {
    if (isOpen) {
      setPlanningProvider(config.planningProvider || 'colab');
      setExecutionProvider(config.executionProvider || 'gemini');
      setVisionProvider(config.visionProvider || 'gemini');
      setVisionModel(config.visionModel || 'gemini-3.8-flash');
      setEndpointUrl(config.endpointUrl || '');
      setAuthToken(config.authToken || '');
      setRequestTemplate(config.requestTemplate || '');
      setResponsePath(config.responsePath || '');
      setUseProxy(config.useProxy ?? true);

      // Load keys with fallback to legacy single key
      let loadedKeys: string[] = [];
      if (Array.isArray(config.geminiKeys)) {
        loadedKeys = config.geminiKeys.filter((k) => typeof k === 'string' && k.trim());
      }
      const legacyKey = ((config as any).apiKey || (config as any).geminiApiKey || '').trim();
      if (legacyKey && !loadedKeys.includes(legacyKey)) {
        loadedKeys.unshift(legacyKey);
      }
      setGeminiKeys(loadedKeys);
      refreshKeysHealth(loadedKeys);

      setGeminiDisplayName(config.geminiDisplayName || '');
      setColabDisplayName(config.colabDisplayName || '');
      setModelVisionMap(config.modelVisionMap || {});
      setVisionPrompt(
        config.visionPrompt ||
          'Analise esta imagem (um print de tela ou de erro). 1) Transcreva literalmente TODO o texto visível (mensagens de erro, stack traces, nomes de arquivo, números de linha, valores). 2) Descreva o layout e os elementos de interface relevantes. 3) Aponte anomalias visíveis (elementos cortados, sobrepostos, desalinhados, mensagens de erro), sem propor correções. Responda em português do Brasil.'
      );

      const modelsFromConfig = Array.isArray(config.detectedModels) ? config.detectedModels : [];
      setDetectedModels(modelsFromConfig);

      const baseColab = (config.colabModel || '').trim();
      const currentColab =
        modelsFromConfig.length > 0 && !modelsFromConfig.includes(baseColab)
          ? modelsFromConfig[0]
          : baseColab;
      setColabModel(currentColab);

      const planM = resolveActiveModel(config.colabPlanningModel, currentColab, modelsFromConfig);
      const execM = resolveActiveModel(config.colabExecutionModel, currentColab, modelsFromConfig);
      const visionM = resolveActiveModel(config.colabVisionModel, currentColab, modelsFromConfig);

      setColabPlanningModel(planM);
      setColabExecutionModel(execM);
      setColabVisionModel(visionM);

      const initGemini = config.geminiModel || 'gemini-3.8-flash';
      const isCustom = !AVAILABLE_GEMINI_MODELS.some((m) => m.id === initGemini);
      setGeminiModel(isCustom ? 'custom' : initGemini);
      setCustomGeminiInput(isCustom ? initGemini : '');
      setKeyInputError(null);
      setTestResult(null);

      if (defaultTab) {
        setActiveTab(defaultTab);
      }
    }
  }, [isOpen, config, refreshKeysHealth, defaultTab]);

  if (!isOpen) return null;

  // Add a new Gemini API Key
  const handleAddKey = () => {
    const trimmed = newKeyInput.trim();
    setKeyInputError(null);

    if (!trimmed) {
      setKeyInputError('Cole a chave da API antes de adicionar.');
      return;
    }
    if (geminiKeys.includes(trimmed)) {
      setKeyInputError('Esta chave já está cadastrada na lista.');
      return;
    }

    const updated = [...geminiKeys, trimmed];
    setGeminiKeys(updated);
    setNewKeyInput('');
    refreshKeysHealth(updated);
  };

  // Remove a Gemini API Key
  const handleRemoveKey = (idx: number) => {
    const updated = geminiKeys.filter((_, i) => i !== idx);
    setGeminiKeys(updated);
    setIndividualKeyTests((prev) => {
      const copy = { ...prev };
      delete copy[idx];
      return copy;
    });
    refreshKeysHealth(updated);
  };

  // Test an individual Gemini key
  const handleTestIndividualKey = async (idx: number, keyToTest: string) => {
    setIndividualKeyTests((prev) => ({
      ...prev,
      [idx]: { status: 'testing', message: 'Verificando chave...' },
    }));

    try {
      const res = await fetch('/api/ai/test-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: keyToTest,
          model: resolvedGeminiModel,
        }),
      });
      const data = await res.json();
      if (res.ok && data.valid) {
        setIndividualKeyTests((prev) => ({
          ...prev,
          [idx]: { status: 'valid', message: 'Válida e pronta para uso' },
        }));
      } else {
        const isQuota =
          data.quotaExceeded ||
          (data.message && data.message.includes('429')) ||
          (data.message && data.message.includes('cota'));
        setIndividualKeyTests((prev) => ({
          ...prev,
          [idx]: {
            status: isQuota ? 'quota' : 'invalid',
            message: data.message || 'Chave inválida ou não autorizada',
          },
        }));
      }
    } catch (err: any) {
      setIndividualKeyTests((prev) => ({
        ...prev,
        [idx]: { status: 'invalid', message: `Erro ao testar: ${err.message}` },
      }));
    }
  };

  const handleSetModel = (modelName: string) => {
    const trimmed = modelName.trim();
    setColabModel(trimmed);

    setColabPlanningModel((prev) => {
      if (
        !prev ||
        (detectedModels.length > 0 && !detectedModels.includes(prev)) ||
        prev === colabModel ||
        prev.includes('qwen3-vl-30b-a3b-128k')
      ) {
        return trimmed;
      }
      return prev;
    });

    setColabExecutionModel((prev) => {
      if (
        !prev ||
        (detectedModels.length > 0 && !detectedModels.includes(prev)) ||
        prev === colabModel ||
        prev.includes('qwen3-vl-30b-a3b-128k')
      ) {
        return trimmed;
      }
      return prev;
    });

    setColabVisionModel((prev) => {
      if (
        !prev ||
        (detectedModels.length > 0 && !detectedModels.includes(prev)) ||
        prev === colabModel ||
        prev.includes('qwen3-vl-30b-a3b-128k')
      ) {
        return trimmed;
      }
      return prev;
    });

    try {
      const parsed = JSON.parse(requestTemplate);
      parsed.model = trimmed;
      setRequestTemplate(JSON.stringify(parsed, null, 2));
    } catch {
      // ignore
    }
  };

  const handleDetectModels = async () => {
    if (!endpointUrl.trim()) {
      setTestResult({
        success: false,
        message: 'Preencha a URL do túnel ngrok para detectar os modelos disponíveis.',
      });
      return;
    }
    setDetectingModels(true);
    setTestResult(null);
    try {
      const baseUrl = endpointUrl.trim().replace(/\/+$/, '');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': '1',
      };
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

      let found: string[] = [];

      // 1. Tenta via proxy do servidor
      try {
        const res = await fetch('/api/proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: `${baseUrl}/v1/models`,
            method: 'GET',
            headers,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.data && Array.isArray(data.data)) {
            found = data.data.map((m: any) => m.id || m.name).filter(Boolean);
          } else if (Array.isArray(data)) {
            found = data.map((m: any) => m.id || m.name || m).filter(Boolean);
          } else if (data.models && Array.isArray(data.models)) {
            found = data.models.map((m: any) => m.name || m.id).filter(Boolean);
          }
        }
      } catch {}

      // Fallback direto ao /v1/models se proxy indisponível (ex: Vercel sem backend)
      if (found.length === 0) {
        try {
          const resDirect = await fetch(`${baseUrl}/v1/models`, {
            method: 'GET',
            headers,
          });
          if (resDirect.ok) {
            const data = await resDirect.json();
            if (data.data && Array.isArray(data.data)) {
              found = data.data.map((m: any) => m.id || m.name).filter(Boolean);
            } else if (Array.isArray(data)) {
              found = data.map((m: any) => m.id || m.name || m).filter(Boolean);
            } else if (data.models && Array.isArray(data.models)) {
              found = data.models.map((m: any) => m.name || m.id).filter(Boolean);
            }
          }
        } catch {}
      }

      if (found.length === 0) {
        try {
          const resTags = await fetch('/api/proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              url: `${baseUrl}/api/tags`,
              method: 'GET',
              headers,
            }),
          });
          if (resTags.ok) {
            const dataTags = await resTags.json();
            if (dataTags.models && Array.isArray(dataTags.models)) {
              found = dataTags.models.map((m: any) => m.name || m.model).filter(Boolean);
            }
          }
        } catch {}
      }

      // Fallback direto ao /api/tags
      if (found.length === 0) {
        try {
          const resTagsDirect = await fetch(`${baseUrl}/api/tags`, {
            method: 'GET',
            headers,
          });
          if (resTagsDirect.ok) {
            const dataTags = await resTagsDirect.json();
            if (dataTags.models && Array.isArray(dataTags.models)) {
              found = dataTags.models.map((m: any) => m.name || m.model).filter(Boolean);
            }
          }
        } catch {}
      }

      if (found.length > 0) {
        setDetectedModels(found);
        const targetColabModel = colabModel && found.includes(colabModel) ? colabModel : found[0];
        handleSetModel(targetColabModel);

        const newVisionMap: Record<string, boolean> = { ...modelVisionMap };
        await Promise.all(
          found.map(async (modelName) => {
            try {
              const showRes = await fetch('/api/proxy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  url: `${baseUrl}/api/show`,
                  method: 'POST',
                  headers,
                  body: { name: modelName },
                }),
              });
              if (showRes.ok) {
                const showData = await showRes.json();
                const caps = Array.isArray(showData.capabilities) ? showData.capabilities : [];
                const families = Array.isArray(showData.details?.families) ? showData.details.families : [];
                const isVision =
                  caps.includes('vision') ||
                  families.some(
                    (f: any) =>
                      String(f).toLowerCase().includes('clip') ||
                      String(f).toLowerCase().includes('vision')
                  ) ||
                  /(-vl|vision|llava|minicpm-v|pixtral|bakllava)/i.test(modelName);
                newVisionMap[modelName] = Boolean(isVision);
              } else {
                newVisionMap[modelName] = /(-vl|vision|llava|minicpm-v|pixtral|bakllava)/i.test(modelName);
              }
            } catch {
              newVisionMap[modelName] = /(-vl|vision|llava|minicpm-v|pixtral|bakllava)/i.test(modelName);
            }
          })
        );
        setModelVisionMap(newVisionMap);

        setTestResult({
          success: true,
          message: `${found.length} modelo(s) detectado(s): ${found.join(', ')}.`,
        });
      } else {
        setTestResult({
          success: false,
          message:
            'Nenhum modelo retornado por /v1/models ou /api/tags. Verifique se o servidor vLLM/Ollama está respondendo.',
        });
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: `Falha ao detectar modelos: ${err.message}`,
      });
    } finally {
      setDetectingModels(false);
    }
  };

  const handleApplyPreset = (preset: 'colab' | 'ollama' | 'openai') => {
    if (preset === 'colab') {
      setRequestTemplate(
        JSON.stringify(
          {
            model: colabModel || 'default',
            messages: [
              {
                role: 'user',
                content:
                  'Instrução: {{instruction}}\n\nCódigo:\n```\n{{code}}\n```\n\nRetorne apenas o código resultante, sem explicações.',
              },
            ],
            temperature: 0.2,
            max_tokens: 4096,
          },
          null,
          2
        )
      );
      setResponsePath('choices[0].message.content');
    } else if (preset === 'ollama') {
      setRequestTemplate(
        JSON.stringify(
          {
            model: colabModel || 'codellama',
            prompt:
              'Instrução: {{instruction}}\n\nCódigo:\n```\n{{code}}\n```\n\nRetorne apenas o código resultante.',
            stream: false,
          },
          null,
          2
        )
      );
      setResponsePath('response');
    } else if (preset === 'openai') {
      setRequestTemplate(
        JSON.stringify(
          {
            model: colabModel || 'gpt-4o-mini',
            messages: [
              {
                role: 'system',
                content: 'Você é um assistente de programação. Retorne apenas código.',
              },
              {
                role: 'user',
                content: 'Instrução: {{instruction}}\n\nCódigo:\n```\n{{code}}\n```',
              },
            ],
          },
          null,
          2
        )
      );
      setResponsePath('choices[0].message.content');
    }
  };

  // Test connection button (unified label "Testar conexão")
  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);

    const finalColab = colabModel.trim();
    const cfg: ConnectionConfig = {
      ...config,
      planningProvider,
      executionProvider,
      visionProvider,
      visionModel,
      colabVisionModel: resolveActiveModel(colabVisionModel, finalColab, detectedModels),
      colabPlanningModel: resolveActiveModel(colabPlanningModel, finalColab, detectedModels),
      colabExecutionModel: resolveActiveModel(colabExecutionModel, finalColab, detectedModels),
      detectedModels,
      geminiModel: resolvedGeminiModel,
      geminiKeys,
      endpointUrl,
      colabModel: finalColab,
      authToken,
      requestTemplate,
      responsePath,
      useProxy,
    };

    try {
      if (activeTab === 'keys') {
        // Tab 2: Test all Gemini keys in batch
        const res = await fetch('/api/ai/test-keys', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            keys: geminiKeys,
            model: resolvedGeminiModel,
          }),
        });
        const data = await res.json();
        if (data.results && Array.isArray(data.results) && data.results.length > 0) {
          const allValid = data.results.every((r: any) => r.valid);
          const validCount = data.results.filter((r: any) => r.valid).length;

          // Update individual states
          const newTests: Record<number, { status: any; message: string }> = {};
          data.results.forEach((r: any) => {
            newTests[r.index] = {
              status: r.status,
              message: r.message,
            };
          });
          setIndividualKeyTests(newTests);

          const summary = data.results
            .map((r: any) => `${r.keyMask}: ${r.valid ? '✓ Válida' : `✗ ${r.message}`}`)
            .join(' | ');

          setTestResult({
            success: allValid || validCount > 0,
            message: `${validCount}/${data.results.length} chave(s) operacionais. (${summary})`,
          });
        } else {
          setTestResult({
            success: false,
            message: data.message || 'Nenhuma chave Gemini disponível para teste.',
          });
        }
      } else if (activeTab === 'colab') {
        // Tab 3: Test Colab endpoint & model
        const res = await onTestConnection(cfg, 'colab');
        setTestResult(res);
        if (res.success && res.message.includes('Modelo ativo detectado:')) {
          const match = res.message.match(/Modelo ativo detectado:\s*"([^"]+)"/);
          if (match && match[1]) {
            handleSetModel(match[1]);
          }
        }
      } else {
        // Tab 1: Test active providers
        const res = await onTestConnection(cfg, planningProvider);
        setTestResult(res);
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || 'Falha ao testar conexão',
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = () => {
    const finalColab = colabModel.trim();
    const finalPlanningColab = resolveActiveModel(colabPlanningModel, finalColab, detectedModels);
    const finalExecutionColab = resolveActiveModel(colabExecutionModel, finalColab, detectedModels);
    const finalVisionColab = resolveActiveModel(colabVisionModel, finalColab, detectedModels);

    const newConfig: ConnectionConfig = {
      ...config,
      provider: planningProvider,
      planningProvider,
      executionProvider,
      visionProvider,
      visionModel,
      colabVisionModel: finalVisionColab,
      colabPlanningModel: finalPlanningColab,
      colabExecutionModel: finalExecutionColab,
      visionPrompt,
      modelVisionMap,
      planningAcceptsImages: Boolean(modelVisionMap[finalPlanningColab]),
      executionAcceptsImages: Boolean(modelVisionMap[finalExecutionColab]),
      geminiModel: resolvedGeminiModel,
      geminiKeys,
      geminiDisplayName: geminiDisplayName.trim(),
      colabDisplayName: colabDisplayName.trim(),
      endpointUrl: endpointUrl.trim(),
      colabModel: finalColab,
      detectedModels,
      authToken: authToken.trim(),
      requestTemplate,
      responsePath: responsePath.trim(),
      useProxy,
    };

    onSave(newConfig);
    onClose();
  };

  // Helper labels
  const geminiShortName = getShortModelName(resolvedGeminiModel, 'gemini', geminiDisplayName);
  const planColabShortName = getShortModelName(resolvedPlanColabModel, 'colab', colabDisplayName);
  const execColabShortName = getShortModelName(resolvedExecColabModel, 'colab', colabDisplayName);

  const getVisionProviderLabel = () => {
    if (visionProvider === 'none') return 'Desativado';
    if (visionProvider === 'gemini') return `Google Gemini (${getShortModelName(visionModel, 'gemini')})`;
    return `Colab / Local (${getShortModelName(resolvedVisionColabModel, 'colab')})`;
  };

  return (
    <div
      id="settingsModalOverlay"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4"
    >
      <div
        id="settingsModalContainer"
        className="bg-[var(--panel)] border border-[var(--border)] rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Header without subtitle */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--border)] bg-[var(--panel)] shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[var(--accent)]/15 border border-[var(--accent)]/30 flex items-center justify-center text-[var(--accent)]">
              <Sparkles className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-semibold text-[var(--text)] m-0">
              Configurações de IA & Conexão
            </h3>
          </div>
          <Tooltip content="Fechar configurações" position="left">
            <button
              id="btnCloseSettingsModal"
              type="button"
              onClick={onClose}
              aria-label="Fechar configurações"
              className="p-1 rounded-lg text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--panel-2)] transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </Tooltip>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-[var(--border)] bg-[var(--panel-2)]/50 px-4 pt-2 gap-1.5 shrink-0 select-none">
          <button
            type="button"
            onClick={() => {
              setActiveTab('modes');
              setTestResult(null);
            }}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-all cursor-pointer ${
              activeTab === 'modes'
                ? 'border-[var(--accent)] text-[var(--text)] font-semibold'
                : 'border-transparent text-[var(--muted)] hover:text-[var(--text)]'
            }`}
          >
            <span>Modos (Plan / Act)</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('keys');
              setTestResult(null);
              refreshKeysHealth(geminiKeys);
            }}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-all cursor-pointer ${
              activeTab === 'keys'
                ? 'border-[var(--accent)] text-[var(--text)] font-semibold'
                : 'border-transparent text-[var(--muted)] hover:text-[var(--text)]'
            }`}
          >
            <span>Modelos & Chaves Gemini</span>
            {geminiKeys.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-[var(--accent)]/15 text-[var(--accent)] font-bold">
                {geminiKeys.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('colab');
              setTestResult(null);
            }}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-all cursor-pointer ${
              activeTab === 'colab'
                ? 'border-[var(--accent)] text-[var(--text)] font-semibold'
                : 'border-transparent text-[var(--muted)] hover:text-[var(--text)]'
            }`}
          >
            <span>Google Colab / ngrok</span>
          </button>

          <button
            id="tabBtnLocalFolder"
            type="button"
            onClick={() => {
              setActiveTab('localFolder');
              setTestResult(null);
            }}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-all cursor-pointer ${
              activeTab === 'localFolder'
                ? 'border-[var(--accent)] text-[var(--text)] font-semibold'
                : 'border-transparent text-[var(--muted)] hover:text-[var(--text)]'
            }`}
          >
            <FolderOpen className="w-3.5 h-3.5" />
            <span>Pasta Local</span>
            {localFolderName && (
              <span
                className="w-2 h-2 rounded-full bg-emerald-400 shrink-0"
                title={`Conectado: ${localFolderName}`}
              />
            )}
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-3 text-xs leading-normal">
          {/* ==================== TAB 1: MODOS (PLAN / ACT) ==================== */}
          {activeTab === 'modes' && (
            <div className="space-y-2.5">
              {/* Row 1: Planejamento */}
              <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2.5 p-3 rounded-xl border border-[var(--border)] bg-[var(--panel-2)]/30">
                <div className="flex items-center gap-2 min-w-[140px] shrink-0">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0" />
                  <span className="font-semibold text-xs text-[var(--text)]">Planejamento</span>
                  <InfoTooltip text="Bate-papo conceitual, tirar dúvidas, discutir arquitetura e abordagens sem alterar código." />
                </div>

                <div className="flex items-center gap-2 grow justify-end">
                  {/* Compact Segmented Control [ Colab | Gemini ] */}
                  <div className="inline-flex p-0.5 rounded-lg bg-[var(--panel)] border border-[var(--border)] shrink-0">
                    <button
                      type="button"
                      onClick={() => setPlanningProvider('colab')}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all cursor-pointer flex items-center gap-1 ${
                        planningProvider === 'colab'
                          ? 'bg-[var(--accent)]/15 text-[var(--text)] font-semibold shadow-xs'
                          : 'text-[var(--muted)] hover:text-[var(--text)]'
                      }`}
                    >
                      <Network className="w-3.5 h-3.5 text-[var(--add)]" />
                      <span>Colab</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPlanningProvider('gemini')}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all cursor-pointer flex items-center gap-1 ${
                        planningProvider === 'gemini'
                          ? 'bg-[var(--accent)]/15 text-[var(--text)] font-semibold shadow-xs'
                          : 'text-[var(--muted)] hover:text-[var(--text)]'
                      }`}
                    >
                      <Sparkles className="w-3.5 h-3.5 text-[var(--accent)]" />
                      <span>Gemini</span>
                    </button>
                  </div>

                  {/* Model Selector / Display */}
                  <div className="min-w-[160px] max-w-[240px] shrink-0">
                    {planningProvider === 'colab' ? (
                      detectedModels.length > 0 ? (
                        <select
                          value={resolvedPlanColabModel}
                          onChange={(e) => setColabPlanningModel(e.target.value)}
                          className="w-full bg-[var(--panel)] border border-[var(--border)] rounded-lg px-2.5 py-1 text-xs text-[var(--text)] outline-none"
                        >
                          {detectedModels.map((m) => (
                            <option key={m} value={m}>
                              {getShortModelName(m, 'colab')} {modelVisionMap[m] ? '👁' : ''}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            value={colabPlanningModel || colabModel}
                            onChange={(e) => setColabPlanningModel(e.target.value)}
                            placeholder="Modelo no Colab"
                            className="w-full bg-[var(--panel)] border border-[var(--border)] rounded-lg px-2 py-1 text-xs text-[var(--text)] outline-none"
                          />
                          <Tooltip content="Detectar modelos do servidor" position="top">
                            <button
                              type="button"
                              onClick={handleDetectModels}
                              disabled={detectingModels || !endpointUrl.trim()}
                              aria-label="Detectar modelos"
                              className="p-1 rounded bg-[var(--panel)] border border-[var(--border)] text-[var(--accent)] hover:bg-[var(--panel-2)] transition-colors cursor-pointer disabled:opacity-40"
                            >
                              <RefreshCw className={`w-3 h-3 ${detectingModels ? 'animate-spin' : ''}`} />
                            </button>
                          </Tooltip>
                        </div>
                      )
                    ) : (
                      <Tooltip content={`Identificador completo: ${resolvedGeminiModel} (definido na aba Gemini)`} position="top">
                        <div className="w-full px-2.5 py-1 rounded-lg bg-[var(--panel)] border border-[var(--border)]/70 text-xs font-medium text-[var(--accent)] truncate text-center cursor-default">
                          {geminiShortName}
                        </div>
                      </Tooltip>
                    )}
                  </div>
                </div>
              </div>

              {/* Row 2: Execução */}
              <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2.5 p-3 rounded-xl border border-[var(--border)] bg-[var(--panel-2)]/30">
                <div className="flex items-center gap-2 min-w-[140px] shrink-0">
                  <span className="w-2.5 h-2.5 rounded-full bg-[var(--accent)] shrink-0" />
                  <span className="font-semibold text-xs text-[var(--text)]">Execução</span>
                  <InfoTooltip text="Geração de código cirúrgica ou completa com visualizador de diff e aprovação hunk-by-hunk." />
                </div>

                <div className="flex items-center gap-2 grow justify-end">
                  {/* Compact Segmented Control [ Colab | Gemini ] */}
                  <div className="inline-flex p-0.5 rounded-lg bg-[var(--panel)] border border-[var(--border)] shrink-0">
                    <button
                      type="button"
                      onClick={() => setExecutionProvider('colab')}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all cursor-pointer flex items-center gap-1 ${
                        executionProvider === 'colab'
                          ? 'bg-[var(--accent)]/15 text-[var(--text)] font-semibold shadow-xs'
                          : 'text-[var(--muted)] hover:text-[var(--text)]'
                      }`}
                    >
                      <Network className="w-3.5 h-3.5 text-[var(--add)]" />
                      <span>Colab</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setExecutionProvider('gemini')}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all cursor-pointer flex items-center gap-1 ${
                        executionProvider === 'gemini'
                          ? 'bg-[var(--accent)]/15 text-[var(--text)] font-semibold shadow-xs'
                          : 'text-[var(--muted)] hover:text-[var(--text)]'
                      }`}
                    >
                      <Sparkles className="w-3.5 h-3.5 text-[var(--accent)]" />
                      <span>Gemini</span>
                    </button>
                  </div>

                  {/* Model Selector / Display */}
                  <div className="min-w-[160px] max-w-[240px] shrink-0">
                    {executionProvider === 'colab' ? (
                      detectedModels.length > 0 ? (
                        <select
                          value={resolvedExecColabModel}
                          onChange={(e) => setColabExecutionModel(e.target.value)}
                          className="w-full bg-[var(--panel)] border border-[var(--border)] rounded-lg px-2.5 py-1 text-xs text-[var(--text)] outline-none"
                        >
                          {detectedModels.map((m) => (
                            <option key={m} value={m}>
                              {getShortModelName(m, 'colab')} {modelVisionMap[m] ? '👁' : ''}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            value={colabExecutionModel || colabModel}
                            onChange={(e) => setColabExecutionModel(e.target.value)}
                            placeholder="Modelo no Colab"
                            className="w-full bg-[var(--panel)] border border-[var(--border)] rounded-lg px-2 py-1 text-xs text-[var(--text)] outline-none"
                          />
                          <Tooltip content="Detectar modelos do servidor" position="top">
                            <button
                              type="button"
                              onClick={handleDetectModels}
                              disabled={detectingModels || !endpointUrl.trim()}
                              aria-label="Detectar modelos"
                              className="p-1 rounded bg-[var(--panel)] border border-[var(--border)] text-[var(--accent)] hover:bg-[var(--panel-2)] transition-colors cursor-pointer disabled:opacity-40"
                            >
                              <RefreshCw className={`w-3 h-3 ${detectingModels ? 'animate-spin' : ''}`} />
                            </button>
                          </Tooltip>
                        </div>
                      )
                    ) : (
                      <Tooltip content={`Identificador completo: ${resolvedGeminiModel} (definido na aba Gemini)`} position="top">
                        <div className="w-full px-2.5 py-1 rounded-lg bg-[var(--panel)] border border-[var(--border)]/70 text-xs font-medium text-[var(--accent)] truncate text-center cursor-default">
                          {geminiShortName}
                        </div>
                      </Tooltip>
                    )}
                  </div>
                </div>
              </div>

              {/* Row 3: Retractable Auxiliary Vision */}
              <div className="rounded-xl border border-[var(--border)] bg-[var(--panel-2)]/20 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setVisionSectionOpen((prev) => !prev)}
                  className="w-full flex items-center justify-between p-3 text-left hover:bg-[var(--panel-2)]/40 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    {visionSectionOpen ? (
                      <ChevronDown className="w-3.5 h-3.5 text-[var(--muted)] shrink-0" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-[var(--muted)] shrink-0" />
                    )}
                    <span className="font-semibold text-xs text-[var(--text)]">
                      Visão auxiliar (reserva) ·{' '}
                      <span className="font-normal text-[var(--muted)]">{getVisionProviderLabel()}</span>
                    </span>
                    <InfoTooltip text="Usada só quando o modelo do Plan ou do Act não aceita imagens; descreve o print e envia o texto como contexto." />
                  </div>
                  <Eye className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                </button>

                {visionSectionOpen && (
                  <div className="p-3.5 pt-0 border-t border-[var(--border)]/40 space-y-3 bg-[var(--panel)]/40">
                    <div className="flex flex-wrap items-center gap-2 pt-2">
                      <span className="text-[11px] text-[var(--muted)] min-w-[70px]">Provedor:</span>
                      <div className="inline-flex p-0.5 rounded-lg bg-[var(--panel-2)] border border-[var(--border)]">
                        <button
                          type="button"
                          onClick={() => setVisionProvider('none')}
                          className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
                            visionProvider === 'none'
                              ? 'bg-red-500/15 text-red-300 font-semibold'
                              : 'text-[var(--muted)] hover:text-[var(--text)]'
                          }`}
                        >
                          <EyeOff className="w-3 h-3" />
                          <span>Desativado</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setVisionProvider('gemini')}
                          className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
                            visionProvider === 'gemini'
                              ? 'bg-[var(--accent)]/15 text-[var(--text)] font-semibold'
                              : 'text-[var(--muted)] hover:text-[var(--text)]'
                          }`}
                        >
                          <Sparkles className="w-3 h-3 text-[var(--accent)]" />
                          <span>Google Gemini</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setVisionProvider('colab')}
                          className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
                            visionProvider === 'colab'
                              ? 'bg-purple-500/15 text-purple-300 font-semibold'
                              : 'text-[var(--muted)] hover:text-[var(--text)]'
                          }`}
                        >
                          <Network className="w-3 h-3 text-purple-400" />
                          <span>Colab / Local</span>
                        </button>
                      </div>
                    </div>

                    {visionProvider === 'gemini' && (
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-[11px] text-[var(--muted)] min-w-[70px]">Modelo:</span>
                        <select
                          value={visionModel}
                          onChange={(e) => setVisionModel(e.target.value)}
                          className="bg-[var(--panel-2)] border border-[var(--border)] rounded-lg px-2.5 py-1 text-xs text-[var(--text)] outline-none"
                        >
                          {AVAILABLE_GEMINI_MODELS.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name} · Visão nativa
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {visionProvider === 'colab' && (
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-[11px] text-[var(--muted)] min-w-[70px]">Modelo:</span>
                        {detectedModels.length > 0 ? (
                          <select
                            value={resolvedVisionColabModel}
                            onChange={(e) => setColabVisionModel(e.target.value)}
                            className="bg-[var(--panel-2)] border border-[var(--border)] rounded-lg px-2.5 py-1 text-xs text-purple-300 outline-none"
                          >
                            {detectedModels.map((m) => (
                              <option key={m} value={m}>
                                {getShortModelName(m, 'colab')} {modelVisionMap[m] ? '👁 (Visão)' : ''}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type="text"
                            value={colabVisionModel || colabModel}
                            onChange={(e) => setColabVisionModel(e.target.value)}
                            placeholder="ex: Qwen/Qwen2.5-VL-7B-Instruct ou llava"
                            className="w-56 bg-[var(--panel-2)] border border-[var(--border)] rounded-lg px-2.5 py-1 text-xs text-[var(--text)] outline-none"
                          />
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ==================== TAB 2: MODELOS & CHAVES GEMINI ==================== */}
          {activeTab === 'keys' && (
            <div className="space-y-3">
              {/* Row 1: Model selector & Custom Display Name on the same row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-xl border border-[var(--border)] bg-[var(--panel-2)]/30">
                <div>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <label htmlFor="selectGeminiModel" className="text-xs font-semibold text-[var(--text)]">
                      Modelo Gemini
                    </label>
                    <InfoTooltip text="Escolha o modelo Gemini para processar as requisições de Planejamento e Execução. Suporta modelos oficiais recomendados e identificadores personalizados." />
                  </div>
                  <select
                    id="selectGeminiModel"
                    value={geminiModel}
                    onChange={(e) => {
                      const val = e.target.value;
                      setGeminiModel(val);
                      if (val !== 'custom') {
                        setCustomGeminiInput('');
                      }
                    }}
                    className="w-full bg-[var(--panel)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-xs text-[var(--text)] focus:outline-none focus:border-[var(--accent)] cursor-pointer"
                  >
                    {AVAILABLE_GEMINI_MODELS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} · {m.badge}
                      </option>
                    ))}
                    <option value="custom">Personalizado...</option>
                  </select>
                </div>

                <div>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <label htmlFor="inputGeminiDisplayName" className="text-xs font-semibold text-[var(--text)]">
                      Nome de exibição no chat
                    </label>
                    <InfoTooltip text="Se preenchido, este nome substitui o nome calculado automaticamente no rodapé do chat (ex: Gemini 3.1 Pro)." />
                  </div>
                  <input
                    id="inputGeminiDisplayName"
                    type="text"
                    value={geminiDisplayName}
                    onChange={(e) => setGeminiDisplayName(e.target.value)}
                    placeholder="Ex: Gemini 3.1 Pro (opcional)"
                    className="w-full bg-[var(--panel)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-xs text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>

                {geminiModel === 'custom' && (
                  <div className="sm:col-span-2 pt-1">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={customGeminiInput}
                        onChange={(e) => setCustomGeminiInput(e.target.value)}
                        placeholder="Digite o identificador exato (ex: gemini-3.7-flash, gemini-2.5-pro...)"
                        className="w-full bg-[var(--panel)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-xs font-mono text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
                      />
                      <InfoTooltip text="O identificador informado será enviado diretamente nas requisições da API Gemini." />
                    </div>
                  </div>
                )}
              </div>

              {/* Row 2: API Keys & Multi-Key Failover */}
              <div className="p-3 rounded-xl border border-[var(--border)] bg-[var(--panel-2)]/30 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5 text-[var(--accent)]" />
                    <span className="font-semibold text-xs text-[var(--text)]">
                      Chaves de API · failover automático
                    </span>
                    <InfoTooltip text="Cadastre uma ou mais chaves da API Gemini. Se a chave atual atingir o limite de requisições (HTTP 429), o roteador alternará automaticamente para a próxima chave disponível da lista sem interromper seu fluxo de trabalho. Chaves que atingirem o limite entram em pausa temporária e voltam a ser usadas após o cooldown." />
                  </div>
                  <span className="text-[11px] text-[var(--muted)]">
                    {geminiKeys.length} cadastrada(s)
                  </span>
                </div>

                {/* Key input and Add button on the same line */}
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <input
                      id="inputNewGeminiKey"
                      type="password"
                      value={newKeyInput}
                      onChange={(e) => {
                        setNewKeyInput(e.target.value);
                        if (keyInputError) setKeyInputError(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddKey();
                        }
                      }}
                      placeholder="Cole sua chave AIzaSy..."
                      className="grow bg-[var(--panel)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-xs font-mono text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
                    />
                    <button
                      type="button"
                      onClick={handleAddKey}
                      className="px-3.5 py-1.5 rounded-lg bg-[var(--accent)] text-[#1a1206] font-semibold text-xs hover:brightness-105 transition-all cursor-pointer shrink-0 flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Adicionar</span>
                    </button>
                  </div>
                  {keyInputError && (
                    <p className="text-[11px] text-[var(--rem)] m-0 pl-1 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3 shrink-0" />
                      <span>{keyInputError}</span>
                    </p>
                  )}
                </div>

                {/* Registered keys list */}
                <div className="space-y-1.5 max-h-44 overflow-y-auto pt-1">
                  {geminiKeys.length === 0 ? (
                    <div className="p-2.5 rounded-lg bg-[var(--panel)] border border-dashed border-[var(--border)] text-center text-[var(--muted)] text-[11px]">
                      Nenhuma chave personalizada cadastrada. O servidor utilizará a chave padrão do ambiente se disponível.
                    </div>
                  ) : (
                    geminiKeys.map((k, idx) => {
                      const masked = maskKey(k);
                      const health = keysHealth[masked];
                      const inCooldown = Boolean(health?.inCooldown);
                      const secRemaining = health?.secondsRemaining || 0;
                      const testInfo = individualKeyTests[idx];

                      return (
                        <div
                          key={`${masked}-${idx}`}
                          className="flex items-center justify-between p-2 rounded-lg bg-[var(--panel)] border border-[var(--border)] text-xs gap-2"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <Key className="w-3.5 h-3.5 text-[var(--muted)] shrink-0" />
                            <span className="font-mono text-xs text-[var(--text)] truncate">
                              {masked}
                            </span>

                            {/* Status tag */}
                            {inCooldown ? (
                              <Tooltip
                                content={`Limite atingido (HTTP 429). Retomará em ${secRemaining}s.`}
                                position="top"
                              >
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/15 text-amber-300 border border-amber-500/30 shrink-0">
                                  Em pausa ({secRemaining}s)
                                </span>
                              </Tooltip>
                            ) : (
                              <Tooltip content="Chave ativa pronta para processamento" position="top">
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[var(--add-bg)] text-[var(--add)] border border-[var(--add)]/30 shrink-0">
                                  Ativa
                                </span>
                              </Tooltip>
                            )}

                            {/* Individual test feedback */}
                            {testInfo && (
                              <span
                                className={`text-[10px] truncate max-w-[140px] ${
                                  testInfo.status === 'valid'
                                    ? 'text-[var(--add)]'
                                    : testInfo.status === 'quota'
                                    ? 'text-amber-300'
                                    : testInfo.status === 'testing'
                                    ? 'text-[var(--accent)]'
                                    : 'text-[var(--rem)]'
                                }`}
                                title={testInfo.message}
                              >
                                {testInfo.status === 'testing' && 'Verificando...'}
                                {testInfo.status === 'valid' && '✓ Válida'}
                                {testInfo.status === 'quota' && '⚠ Sem cota'}
                                {testInfo.status === 'invalid' && '✗ Inválida'}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <Tooltip content="Testar esta chave individualmente" position="top">
                              <button
                                type="button"
                                onClick={() => handleTestIndividualKey(idx, k)}
                                aria-label="Testar esta chave"
                                className="p-1 rounded text-[var(--muted)] hover:text-[var(--accent)] hover:bg-[var(--panel-2)] transition-colors cursor-pointer"
                              >
                                <RefreshCw className={`w-3.5 h-3.5 ${testInfo?.status === 'testing' ? 'animate-spin' : ''}`} />
                              </button>
                            </Tooltip>

                            <Tooltip content="Remover esta chave" position="top">
                              <button
                                type="button"
                                onClick={() => handleRemoveKey(idx)}
                                aria-label="Remover chave"
                                className="p-1 rounded text-[var(--muted)] hover:text-[var(--rem)] hover:bg-[var(--panel-2)] transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </Tooltip>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ==================== TAB 3: GOOGLE COLAB / NGROK ==================== */}
          {activeTab === 'colab' && (
            <div className="space-y-3">
              {/* Row 1: Tunnel URL with lightning test button */}
              <div>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <label htmlFor="endpointUrlInput" className="text-xs font-semibold text-[var(--text)]">
                    URL do túnel ngrok
                  </label>
                  <InfoTooltip text="A URL do ngrok muda toda vez que a sessão do Colab reinicia — cole a nova URL gerada pelo túnel aqui (ex: https://xxxx.ngrok-free.app)." />
                </div>
                <div className="flex items-center gap-1.5">
                  <input
                    id="endpointUrlInput"
                    type="url"
                    value={endpointUrl}
                    onChange={(e) => setEndpointUrl(e.target.value)}
                    placeholder="https://xxxx.ngrok-free.app"
                    className="grow bg-[var(--panel-2)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-xs font-mono text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
                  />
                  <Tooltip content="Testar conexão com esta URL" position="top">
                    <button
                      type="button"
                      onClick={() => handleTest()}
                      disabled={testing || !endpointUrl.trim()}
                      aria-label="Testar endpoint"
                      className="p-2 rounded-lg bg-[var(--panel-2)] border border-[var(--border)] hover:border-[var(--accent)] text-[var(--accent)] hover:bg-[var(--accent)]/10 transition-colors cursor-pointer disabled:opacity-40"
                    >
                      <Zap className={`w-3.5 h-3.5 ${testing ? 'animate-pulse' : ''}`} />
                    </button>
                  </Tooltip>
                </div>
              </div>

              {/* Row 2: Single Model Selector & Vision Toggle */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 rounded-xl border border-[var(--border)] bg-[var(--panel-2)]/30">
                <div className="sm:col-span-2">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <label className="text-xs font-semibold text-[var(--text)]">
                      Modelo no Colab
                    </label>
                    <InfoTooltip text="Identificador exato do modelo carregado no seu Colab (ex: valor passado para --model no vLLM ou nome no Ollama)." />
                  </div>

                  <div className="flex items-center gap-1.5">
                    {detectedModels.length > 0 && !isCustomColabModel ? (
                      <select
                        value={colabModel}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === '__custom__') {
                            setIsCustomColabModel(true);
                          } else {
                            handleSetModel(val);
                          }
                        }}
                        className="grow bg-[var(--panel)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-xs text-[var(--text)] focus:outline-none focus:border-[var(--accent)] cursor-pointer"
                      >
                        {detectedModels.map((m) => (
                          <option key={m} value={m}>
                            {getShortModelName(m, 'colab')} {modelVisionMap[m] ? '👁 (Visão)' : ''}
                          </option>
                        ))}
                        <option value="__custom__">[ Digitar outro modelo... ]</option>
                      </select>
                    ) : (
                      <div className="flex items-center gap-1 grow">
                        <input
                          type="text"
                          value={colabModel}
                          onChange={(e) => handleSetModel(e.target.value)}
                          placeholder="Ex: Qwen/Qwen2.5-Coder-7B-Instruct"
                          className="w-full bg-[var(--panel)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-xs font-mono text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
                        />
                        {detectedModels.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setIsCustomColabModel(false)}
                            className="text-[10px] text-[var(--accent)] hover:underline whitespace-nowrap"
                          >
                            Voltar à lista
                          </button>
                        )}
                      </div>
                    )}

                    <Tooltip content="Detectar modelos disponíveis no servidor" position="top">
                      <button
                        type="button"
                        onClick={handleDetectModels}
                        disabled={detectingModels || !endpointUrl.trim()}
                        aria-label="Detectar modelos"
                        className="p-2 rounded-lg bg-[var(--panel)] border border-[var(--border)] text-[var(--accent)] hover:bg-[var(--panel-2)] transition-colors cursor-pointer disabled:opacity-40 shrink-0"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${detectingModels ? 'animate-spin' : ''}`} />
                      </button>
                    </Tooltip>
                  </div>
                </div>

                {/* Vision Support Switch Toggle */}
                <div>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="text-xs font-semibold text-[var(--text)]">
                      Suporte a Visão
                    </span>
                    <InfoTooltip text="Indica se este modelo aceita imagens diretamente (multimodal). Se desligado, a Visão Auxiliar será acionada para descrever prints." />
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      if (!colabModel) return;
                      const next = !modelVisionMap[colabModel];
                      setModelVisionMap((prev) => ({
                        ...prev,
                        [colabModel]: next,
                      }));
                    }}
                    className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg border text-xs font-medium transition-all cursor-pointer ${
                      colabModel && modelVisionMap[colabModel]
                        ? 'border-purple-500/40 bg-purple-500/15 text-purple-200'
                        : 'border-[var(--border)] bg-[var(--panel)] text-[var(--muted)] hover:text-[var(--text)]'
                    }`}
                  >
                    <span className="flex items-center gap-1.5">
                      <Eye className="w-3.5 h-3.5 text-purple-400" />
                      <span>{colabModel && modelVisionMap[colabModel] ? 'Direto' : 'Auxiliar'}</span>
                    </span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                      colabModel && modelVisionMap[colabModel]
                        ? 'bg-purple-500 text-white'
                        : 'bg-[var(--panel-2)] text-[var(--muted)]'
                    }`}>
                      {colabModel && modelVisionMap[colabModel] ? 'Sim' : 'Não'}
                    </span>
                  </button>
                </div>
              </div>

              {/* Row 3: Custom Display Name */}
              <div>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <label htmlFor="inputColabDisplayName" className="text-xs font-semibold text-[var(--text)]">
                    Nome de exibição no chat
                  </label>
                  <InfoTooltip text="Se preenchido, este nome substitui o identificador no chat (ex: Qwen3.6)." />
                </div>
                <input
                  id="inputColabDisplayName"
                  type="text"
                  value={colabDisplayName}
                  onChange={(e) => setColabDisplayName(e.target.value)}
                  placeholder="Ex: Qwen3.6 ou Llama 3.1 (opcional)"
                  className="w-full bg-[var(--panel-2)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-xs text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
                />
              </div>

              {/* Row 4: Retractable Advanced Section */}
              <div className="rounded-xl border border-[var(--border)] bg-[var(--panel-2)]/20 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowAdvancedColab((prev) => !prev)}
                  className="w-full flex items-center justify-between p-3 text-left hover:bg-[var(--panel-2)]/40 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    {showAdvancedColab ? (
                      <ChevronDown className="w-3.5 h-3.5 text-[var(--muted)] shrink-0" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-[var(--muted)] shrink-0" />
                    )}
                    <span className="font-semibold text-xs text-[var(--text)]">
                      Avançado
                    </span>
                    <span className="text-[11px] text-[var(--muted)]">
                      (Token, proxy, predefinições e templates)
                    </span>
                  </div>
                </button>

                {showAdvancedColab && (
                  <div className="p-3.5 pt-0 border-t border-[var(--border)]/40 space-y-3 bg-[var(--panel)]/40">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                      <div>
                        <div className="flex items-center gap-1.5 mb-1">
                          <label htmlFor="authToken" className="text-xs text-[var(--muted)] font-medium">
                            Token / Chave de autorização
                          </label>
                          <InfoTooltip text="Deixe em branco se seu script no Colab não exigir autenticação bearer." />
                        </div>
                        <input
                          id="authToken"
                          type="password"
                          value={authToken}
                          onChange={(e) => setAuthToken(e.target.value)}
                          placeholder="Opcional"
                          className="w-full bg-[var(--panel-2)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-xs font-mono text-[var(--text)] outline-none"
                        />
                      </div>

                      <div className="flex items-center pt-5">
                        <label className="flex items-center gap-2 cursor-pointer text-xs text-[var(--text)]">
                          <input
                            id="useProxyCheck"
                            type="checkbox"
                            checked={useProxy}
                            onChange={(e) => setUseProxy(e.target.checked)}
                            className="w-4 h-4 rounded text-[var(--accent)] accent-[var(--accent)] cursor-pointer"
                          />
                          <span>Usar proxy do servidor</span>
                          <InfoTooltip text="Recomendado para evitar bloqueios de CORS e tela intermediária de confirmação do ngrok." />
                        </label>
                      </div>
                    </div>

                    {/* Predefinições de Formato */}
                    <div>
                      <span className="text-[11px] text-[var(--muted)] block mb-1 font-medium">
                        Predefinições de Formato:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleApplyPreset('colab')}
                          className="px-2.5 py-1 rounded-md bg-[var(--panel-2)] hover:bg-[var(--border)] border border-[var(--border)] text-[11px] text-[var(--text)] transition-colors cursor-pointer"
                        >
                          Colab vLLM / ngrok
                        </button>
                        <button
                          type="button"
                          onClick={() => handleApplyPreset('ollama')}
                          className="px-2.5 py-1 rounded-md bg-[var(--panel-2)] hover:bg-[var(--border)] border border-[var(--border)] text-[11px] text-[var(--text)] transition-colors cursor-pointer"
                        >
                          Ollama Local
                        </button>
                        <button
                          type="button"
                          onClick={() => handleApplyPreset('openai')}
                          className="px-2.5 py-1 rounded-md bg-[var(--panel-2)] hover:bg-[var(--border)] border border-[var(--border)] text-[11px] text-[var(--text)] transition-colors cursor-pointer"
                        >
                          OpenAI / v1 Format
                        </button>
                      </div>
                    </div>

                    {/* Template and Response Path */}
                    <div>
                      <label htmlFor="requestTemplate" className="block text-[11px] text-[var(--muted)] mb-1">
                        Modelo do corpo da requisição:
                      </label>
                      <textarea
                        id="requestTemplate"
                        value={requestTemplate}
                        onChange={(e) => setRequestTemplate(e.target.value)}
                        rows={4}
                        className="w-full bg-[var(--panel-2)] border border-[var(--border)] rounded-lg p-2 text-xs font-mono text-[var(--text)] outline-none leading-relaxed"
                      />
                    </div>

                    <div>
                      <label htmlFor="responsePath" className="block text-[11px] text-[var(--muted)] mb-1">
                        Caminho do código na resposta (ex: <code className="text-[var(--accent)] font-mono">choices[0].message.content</code>):
                      </label>
                      <input
                        id="responsePath"
                        type="text"
                        value={responsePath}
                        onChange={(e) => setResponsePath(e.target.value)}
                        className="w-full bg-[var(--panel-2)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-xs font-mono text-[var(--text)] outline-none"
                      />
                    </div>

                    {/* Vision Prompt */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[11px] text-[var(--muted)] flex items-center gap-1">
                          <Eye className="w-3 h-3 text-purple-400" />
                          <span>Prompt da etapa de visão auxiliar:</span>
                        </label>
                        <button
                          type="button"
                          onClick={() =>
                            setVisionPrompt(
                              'Analise esta imagem (um print de tela ou de erro). 1) Transcreva literalmente TODO o texto visível (mensagens de erro, stack traces, nomes de arquivo, números de linha, valores). 2) Descreva o layout e os elementos de interface relevantes. 3) Aponte anomalias visíveis (elementos cortados, sobrepostos, desalinhados, mensagens de erro), sem propor correções. Responda em português do Brasil.'
                            )
                          }
                          className="text-[10px] text-[var(--accent)] hover:underline cursor-pointer"
                        >
                          Restaurar padrão
                        </button>
                      </div>
                      <textarea
                        id="visionPromptInput"
                        value={visionPrompt}
                        onChange={(e) => setVisionPrompt(e.target.value)}
                        rows={3}
                        className="w-full bg-[var(--panel-2)] border border-[var(--border)] rounded-lg p-2 text-xs font-mono text-[var(--text)] outline-none leading-relaxed"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ==================== TAB 4: PASTA LOCAL ==================== */}
          {activeTab === 'localFolder' && (
            <div className="space-y-3.5">
              {!localFolderSupported ? (
                // Navegador não suportado / iframe
                <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--panel-2)]/40 space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-[var(--rem-bg)] border border-[var(--rem)]/30 text-[var(--rem)] shrink-0">
                      <AlertCircle className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-xs text-[var(--text)] m-0">
                        Disponível apenas em Chrome/Edge
                      </h4>
                      <p className="text-xs text-[var(--muted)] mt-1.5 leading-relaxed">
                        A funcionalidade de leitura e escrita direta em pastas locais depende da{' '}
                        <strong className="text-[var(--text)]">File System Access API</strong>,
                        suportada exclusivamente nos navegadores Google Chrome e Microsoft Edge em
                        janela própria (fora de iframes incorporados).
                      </p>
                      <p className="text-xs text-[var(--muted)] mt-1.5 leading-relaxed">
                        Para abrir uma pasta do seu computador no editor com sincronização no disco,
                        acesse a aplicação diretamente em uma aba do Chrome ou Edge.
                      </p>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-[var(--border)] flex justify-end">
                    <Tooltip content="Disponível apenas em Chrome/Edge" position="top">
                      <div>
                        <button
                          type="button"
                          disabled
                          className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--panel)] text-[var(--muted)] opacity-50 cursor-not-allowed text-xs font-medium"
                        >
                          <FolderOpen className="w-4 h-4" />
                          <span>Abrir pasta local</span>
                        </button>
                      </div>
                    </Tooltip>
                  </div>
                </div>
              ) : localFolderPermissionNeeded ? (
                // Permissão pendente de reativação
                <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-amber-500/20 text-amber-400 shrink-0">
                      <ShieldAlert className="w-5 h-5" />
                    </div>
                    <div className="grow">
                      <h4 className="font-semibold text-xs text-[var(--text)] m-0">
                        Reconectar pasta do disco: {localFolderName}
                      </h4>
                      <p className="text-xs text-[var(--muted)] mt-1.5 leading-relaxed">
                        Esta pasta foi aberta em uma sessão anterior. Por proteção de segurança do
                        navegador, é necessário reconfirmar a permissão de leitura e escrita para
                        reativar a sincronização com o disco.
                      </p>
                      <div className="flex items-center gap-2 mt-3">
                        <button
                          id="btnReconnectLocalFolder"
                          type="button"
                          onClick={onReconnectLocalFolder}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--accent)] text-[#1a1206] font-semibold text-xs transition-colors cursor-pointer shadow-xs hover:brightness-105"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>Reconectar pasta</span>
                        </button>
                        <button
                          type="button"
                          onClick={onDisconnectLocalFolder}
                          className="px-3 py-1.5 rounded-lg border border-[var(--border)] hover:border-[var(--rem)] text-[var(--muted)] hover:text-[var(--rem)] text-xs transition-colors cursor-pointer"
                        >
                          Desconectar
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : localFolderName ? (
                // Pasta conectada com sucesso
                <div className="space-y-3">
                  {/* Status Card */}
                  <div className="p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400 shrink-0">
                        <FolderCheck className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0 animate-pulse" />
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400">
                            Pasta local conectada
                          </span>
                        </div>
                        <h4
                          className="font-mono font-bold text-xs text-[var(--text)] truncate mt-0.5"
                          title={localFolderName}
                        >
                          {localFolderName}
                        </h4>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        id="btnChangeLocalFolder"
                        type="button"
                        onClick={onOpenLocalFolder}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--border)] hover:border-[var(--muted)] text-xs text-[var(--text)] bg-[var(--panel)] transition-colors cursor-pointer"
                        title="Escolher outra pasta no computador"
                      >
                        <FolderOpen className="w-3.5 h-3.5 text-[var(--accent)]" />
                        <span>Trocar pasta</span>
                      </button>

                      <button
                        id="btnDisconnectLocalFolder"
                        type="button"
                        onClick={onDisconnectLocalFolder}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--border)] hover:border-[var(--rem)]/60 text-xs text-[var(--muted)] hover:text-[var(--rem)] bg-[var(--panel)] transition-colors cursor-pointer"
                        title="Desconectar do disco local (nenhum arquivo será excluído)"
                      >
                        <FolderX className="w-3.5 h-3.5" />
                        <span>Desconectar</span>
                      </button>
                    </div>
                  </div>

                  {/* Save Mode Selector */}
                  <div className="p-3.5 rounded-xl border border-[var(--border)] bg-[var(--panel-2)]/30 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold text-xs text-[var(--text)] m-0 flex items-center gap-1.5">
                        <HardDrive className="w-4 h-4 text-[var(--accent)]" />
                        <span>Modo de Salvamento no Disco</span>
                      </h4>
                      <span className="text-[11px] text-[var(--muted)] font-mono">
                        {saveMode === 'auto' ? 'Autosave ativo' : 'Salvar sob demanda'}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                      {/* Manual Mode */}
                      <button
                        type="button"
                        onClick={() => onChangeSaveMode?.('manual')}
                        className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-2 ${
                          saveMode === 'manual'
                            ? 'bg-[var(--accent)]/15 border-[var(--accent)] text-[var(--text)] shadow-xs'
                            : 'bg-[var(--panel)] border-[var(--border)] text-[var(--muted)] hover:border-[var(--muted)]/50 hover:text-[var(--text)]'
                        }`}
                      >
                        <div className="flex items-center justify-between w-full">
                          <span className="font-semibold text-xs text-[var(--text)] flex items-center gap-1.5">
                            <Save className="w-3.5 h-3.5 text-[var(--accent)]" />
                            <span>Manual (Padrão)</span>
                          </span>
                          <span
                            className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                              saveMode === 'manual'
                                ? 'border-[var(--accent)] bg-[var(--accent)] text-[#1a1206]'
                                : 'border-[var(--muted)]/40'
                            }`}
                          >
                            {saveMode === 'manual' && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                          </span>
                        </div>
                        <p className="text-[11px] leading-relaxed text-[var(--muted)] m-0">
                          Salva no disco apenas quando você clicar em <strong>Salvar disco</strong> ou
                          pressionar <strong>Ctrl+S</strong> (Cmd+S). Mais seguro para revisar alterações.
                        </p>
                      </button>

                      {/* Auto Mode */}
                      <button
                        type="button"
                        onClick={() => onChangeSaveMode?.('auto')}
                        className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-2 ${
                          saveMode === 'auto'
                            ? 'bg-[var(--accent)]/15 border-[var(--accent)] text-[var(--text)] shadow-xs'
                            : 'bg-[var(--panel)] border-[var(--border)] text-[var(--muted)] hover:border-[var(--muted)]/50 hover:text-[var(--text)]'
                        }`}
                      >
                        <div className="flex items-center justify-between w-full">
                          <span className="font-semibold text-xs text-[var(--text)] flex items-center gap-1.5">
                            <RefreshCw className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Automático (Autosave)</span>
                          </span>
                          <span
                            className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                              saveMode === 'auto'
                                ? 'border-[var(--accent)] bg-[var(--accent)] text-[#1a1206]'
                                : 'border-[var(--muted)]/40'
                            }`}
                          >
                            {saveMode === 'auto' && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                          </span>
                        </div>
                        <p className="text-[11px] leading-relaxed text-[var(--muted)] m-0">
                          Grava automaticamente no disco com debounce de 1,2s sem digitação. Ideal para
                          desenvolver com hot-reload no terminal local.
                        </p>
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                // Nenhuma pasta conectada
                <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--panel-2)]/30 space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="p-2.5 rounded-lg bg-[var(--accent)]/15 border border-[var(--accent)]/30 text-[var(--accent)] shrink-0">
                      <HardDrive className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-xs text-[var(--text)] m-0">
                        Conectar uma Pasta do Computador
                      </h4>
                      <p className="text-xs text-[var(--muted)] mt-1.5 leading-relaxed">
                        Abra qualquer diretório de projeto do seu disco local (ex: React, Node, HTML/CSS).
                        O editor carrega toda a árvore de arquivos, respeita regras de exclusão (como{' '}
                        <code className="font-mono text-[10px]">node_modules</code> e{' '}
                        <code className="font-mono text-[10px]">.git</code>) e permite salvar alterações
                        reais no seu arquivo físico.
                      </p>
                      <p className="text-xs text-[var(--muted)] mt-1 leading-relaxed">
                        Ao fechar e reabrir o navegador, a última pasta conectada será lembrada
                        automaticamente.
                      </p>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-[var(--border)] flex items-center justify-between">
                    <span className="text-[11px] text-[var(--muted)]">
                      Requer autorização de leitura e escrita
                    </span>
                    <button
                      id="btnOpenLocalFolderSettings"
                      type="button"
                      onClick={onOpenLocalFolder}
                      className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-[var(--accent)] hover:brightness-105 text-[#1a1206] font-semibold text-xs transition-all cursor-pointer shadow-xs"
                    >
                      <FolderOpen className="w-4 h-4" />
                      <span>Abrir pasta local</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Test connection feedback */}
          {testResult && (
            <div
              className={`p-2.5 rounded-xl border text-xs flex items-start gap-2 ${
                testResult.success
                  ? 'bg-[var(--add-bg)] border-[var(--add)]/30 text-[var(--add)]'
                  : 'bg-[var(--rem-bg)] border-[var(--rem)]/30 text-[var(--rem)]'
              }`}
            >
              {testResult.success ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              )}
              <span className="leading-relaxed">{testResult.message}</span>
            </div>
          )}
        </div>

        {/* Modal Footer with unified "Testar conexão" button */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-[var(--border)] bg-[var(--panel)] shrink-0">
          {activeTab !== 'localFolder' ? (
            <Tooltip
              content={
                activeTab === 'modes'
                  ? 'Testa a conectividade dos provedores ativos para Planejamento e Execução.'
                  : activeTab === 'keys'
                  ? 'Valida todas as chaves Gemini cadastradas e verifica limites de cota.'
                  : 'Testa a resposta do endpoint ngrok e o modelo configurado no Colab.'
              }
              position="top"
            >
              <button
                id="btnTestConn"
                type="button"
                onClick={handleTest}
                disabled={testing}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border)] hover:border-[var(--muted)] text-[var(--muted)] hover:text-[var(--text)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                {testing ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Network className="w-3.5 h-3.5" />
                )}
                <span>{testing ? 'Testando...' : 'Testar conexão'}</span>
              </button>
            </Tooltip>
          ) : (
            <div className="text-[11px] text-[var(--muted)] flex items-center gap-1.5">
              <HardDrive className="w-3.5 h-3.5 text-[var(--muted)]" />
              <span>File System Access API</span>
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-lg text-xs text-[var(--muted)] hover:text-[var(--text)] border border-[var(--border)] transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              id="btnSaveSettings"
              type="button"
              onClick={handleSave}
              className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-[var(--accent)] hover:brightness-105 text-[#1a1206] transition-all cursor-pointer shadow-sm"
            >
              Salvar Configurações
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
