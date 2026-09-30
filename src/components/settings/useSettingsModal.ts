import { useState, useEffect, useCallback } from 'react';
import { ConnectionConfig, AIProvider, AVAILABLE_GEMINI_MODELS } from '../../types';
import { getShortModelName } from '../../utils/modelNames';
import { testGeminiKeysDirect } from '../../utils/geminiClient';
import { KeyStatusItem } from './KeysTab';

export function resolveActiveModel(
  modeModel: string | undefined,
  fallbackColabModel: string,
  modelList: string[]
): string {
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
}

export function maskKey(k: string): string {
  const trimmed = (k || '').trim();
  if (!trimmed) return '';
  if (trimmed.length <= 8) return '...' + trimmed.slice(-4);
  return trimmed.slice(0, 4) + '...' + trimmed.slice(-4);
}

interface UseSettingsModalProps {
  isOpen: boolean;
  config: ConnectionConfig;
  defaultTab?: 'modes' | 'keys' | 'colab' | 'localFolder';
  onSave: (newConfig: ConnectionConfig) => void;
  onClose: () => void;
  onTestConnection: (
    configToTest: ConnectionConfig,
    targetProvider?: AIProvider
  ) => Promise<{ success: boolean; message: string }>;
}

export function useSettingsModal({
  isOpen,
  config,
  defaultTab,
  onSave,
  onClose,
  onTestConnection,
}: UseSettingsModalProps) {
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

  const resolvedPlanColabModel = resolveActiveModel(colabPlanningModel, colabModel, detectedModels);
  const resolvedExecColabModel = resolveActiveModel(colabExecutionModel, colabModel, detectedModels);
  const resolvedVisionColabModel = resolveActiveModel(colabVisionModel, colabModel, detectedModels);

  // Gemini model resolved identifier
  const resolvedGeminiModel =
    geminiModel === 'custom'
      ? customGeminiInput.trim() || 'gemini-3.8-flash'
      : geminiModel || 'gemini-3.8-flash';

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

    const testDirectInBrowser = async () => {
      try {
        const { GoogleGenAI } = await import('@google/genai');
        const ai = new GoogleGenAI({ apiKey: keyToTest.trim() });
        await ai.models.generateContent({
          model: resolvedGeminiModel || 'gemini-3.8-flash',
          contents: 'ping',
          config: { maxOutputTokens: 2 },
        });
        setIndividualKeyTests((prev) => ({
          ...prev,
          [idx]: { status: 'valid', message: 'Válida e pronta para uso' },
        }));
      } catch (directErr: any) {
        const msg = directErr.message || '';
        const isQuota = msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED');
        setIndividualKeyTests((prev) => ({
          ...prev,
          [idx]: {
            status: isQuota ? 'quota' : 'invalid',
            message: isQuota ? 'Limite de cota excedido (429)' : msg || 'Chave inválida',
          },
        }));
      }
    };

    try {
      const res = await fetch('/api/ai/test-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: keyToTest,
          model: resolvedGeminiModel,
        }),
      });

      if (!res.ok) {
        await testDirectInBrowser();
        return;
      }

      let data: any;
      try {
        data = await res.json();
      } catch {
        await testDirectInBrowser();
        return;
      }

      if (data.valid) {
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
    } catch {
      await testDirectInBrowser();
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

      // Fallback direto ao /v1/models se proxy indisponível
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

  // Test connection button
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
        let results: any[] = [];
        try {
          const res = await fetch('/api/ai/test-keys', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              keys: geminiKeys,
              model: resolvedGeminiModel,
            }),
          });
          if (res.ok) {
            const data = await res.json();
            if (data.results && Array.isArray(data.results)) {
              results = data.results;
            }
          }
        } catch {
          // fallback para teste direto no navegador
        }

        if (results.length === 0 && geminiKeys.length > 0) {
          try {
            results = await testGeminiKeysDirect(geminiKeys, resolvedGeminiModel);
          } catch (directErr: any) {
            setTestResult({
              success: false,
              message: `Falha ao testar chaves: ${directErr.message || directErr}`,
            });
            return;
          }
        }

        if (results.length > 0) {
          const allValid = results.every((r: any) => r.valid);
          const validCount = results.filter((r: any) => r.valid).length;

          const newTests: Record<number, { status: any; message: string }> = {};
          results.forEach((r: any) => {
            newTests[r.index] = {
              status: r.status,
              message: r.message,
            };
          });
          setIndividualKeyTests(newTests);

          const summary = results
            .map((r: any) => `${r.keyMask}: ${r.valid ? '✓ Válida' : `✗ ${r.message}`}`)
            .join(' | ');

          setTestResult({
            success: allValid || validCount > 0,
            message: `${validCount}/${results.length} chave(s) operacionais. (${summary})`,
          });
        } else {
          setTestResult({
            success: false,
            message: 'Nenhuma chave Gemini disponível para teste.',
          });
        }
      } else if (activeTab === 'colab') {
        const res = await onTestConnection(cfg, 'colab');
        setTestResult(res);
        if (res.success && res.message.includes('Modelo ativo detectado:')) {
          const match = res.message.match(/Modelo ativo detectado:\s*"([^"]+)"/);
          if (match && match[1]) {
            handleSetModel(match[1]);
          }
        }
      } else {
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

  const geminiShortName = getShortModelName(resolvedGeminiModel, 'gemini', geminiDisplayName);
  const planColabShortName = getShortModelName(resolvedPlanColabModel, 'colab', colabDisplayName);
  const execColabShortName = getShortModelName(resolvedExecColabModel, 'colab', colabDisplayName);

  return {
    planningProvider,
    setPlanningProvider,
    executionProvider,
    setExecutionProvider,
    visionProvider,
    setVisionProvider,
    visionModel,
    setVisionModel,
    colabVisionModel,
    setColabVisionModel,
    colabPlanningModel,
    setColabPlanningModel,
    colabExecutionModel,
    setColabExecutionModel,
    visionPrompt,
    setVisionPrompt,
    modelVisionMap,
    setModelVisionMap,
    visionSectionOpen,
    setVisionSectionOpen,
    showAdvancedColab,
    setShowAdvancedColab,
    geminiModel,
    setGeminiModel,
    customGeminiInput,
    setCustomGeminiInput,
    geminiKeys,
    newKeyInput,
    setNewKeyInput,
    keyInputError,
    setKeyInputError,
    keysHealth,
    individualKeyTests,
    geminiDisplayName,
    setGeminiDisplayName,
    colabDisplayName,
    setColabDisplayName,
    endpointUrl,
    setEndpointUrl,
    colabModel,
    setColabModel,
    isCustomColabModel,
    setIsCustomColabModel,
    detectedModels,
    detectingModels,
    authToken,
    setAuthToken,
    requestTemplate,
    setRequestTemplate,
    responsePath,
    setResponsePath,
    useProxy,
    setUseProxy,
    activeTab,
    setActiveTab,
    testing,
    testResult,
    resolvedPlanColabModel,
    resolvedExecColabModel,
    resolvedVisionColabModel,
    resolvedGeminiModel,
    geminiShortName,
    planColabShortName,
    execColabShortName,
    handleAddKey,
    handleRemoveKey,
    handleTestIndividualKey,
    handleSetModel,
    handleDetectModels,
    handleApplyPreset,
    handleTest,
    handleSave,
  };
}
