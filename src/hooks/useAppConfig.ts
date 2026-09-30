import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ConnectionConfig,
  DEFAULT_CONFIG,
  AIProvider,
  ThemeMode,
  AssistantMode,
  EditorViewMode,
  InteractionMode,
} from '../types';
import { getShortModelName } from '../utils/modelNames';
import { testGeminiKeysDirect } from '../utils/geminiClient';

export async function safeReadJsonResponse(res: Response): Promise<any> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    const contentType = res.headers.get('content-type') || 'desconhecido';
    const trimmed = text.trim();
    const snippet = trimmed.slice(0, 300);

    if (
      res.status === 404 &&
      (trimmed.includes('NOT_FOUND') || trimmed.includes('gru1::') || trimmed.includes('The page could not be found'))
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

export function useAppConfig(interactionMode: InteractionMode) {
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
    } catch {}
    return DEFAULT_CONFIG;
  });

  useEffect(() => {
    try {
      localStorage.setItem('ai_connection_config', JSON.stringify(config));
    } catch {}
  }, [config]);

  // UI preferences
  const [viewMode, setViewMode] = useState<EditorViewMode>('code');
  const [lineWrapping, setLineWrapping] = useState<boolean>(true);
  const [fontSize, setFontSize] = useState<number>(13);
  const [showDiagnostics, setShowDiagnostics] = useState<boolean>(true);
  const [isExplorerOpen, setIsExplorerOpen] = useState<boolean>(true);
  const [theme, setTheme] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem('editor_theme');
    return saved === 'light' ? 'light' : 'dark';
  });
  const [assistantMode, setAssistantMode] = useState<AssistantMode>(() => {
    const saved = localStorage.getItem('genia_assistant_mode');
    return saved === 'avancado' ? 'avancado' : 'basico';
  });

  // Sync theme attribute on document root
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('editor_theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('genia_assistant_mode', assistantMode);
  }, [assistantMode]);

  const handleToggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

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

  const currentActiveModel = useMemo(() => {
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

  const activeShortModelName = useMemo(() => {
    const customDisplay =
      currentActiveProvider === 'gemini' ? config.geminiDisplayName : config.colabDisplayName;
    return getShortModelName(currentActiveModel, currentActiveProvider, customDisplay);
  }, [currentActiveModel, currentActiveProvider, config.geminiDisplayName, config.colabDisplayName]);

  const activeFullModelInfo = useMemo(() => {
    const provName = currentActiveProvider === 'gemini' ? 'Gemini' : 'Colab / Ollama';
    return `${provName} (${currentActiveModel || 'Padrão'})`;
  }, [currentActiveProvider, currentActiveModel]);

  // Test connection function (used by SettingsModal)
  const handleTestConnection = useCallback(async (
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
        } catch {}

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

      if (cfg.useProxy) {
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
          if (res.status === 404) {
            const peek = await res.clone().text();
            if (peek.includes('NOT_FOUND') || peek.includes('gru1::') || peek.includes('The page could not be found')) {
              res = await fetch(testUrl, {
                method: 'POST',
                headers,
                body: JSON.stringify(testPayload),
              });
            }
          }
        } catch {
          res = await fetch(testUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(testPayload),
          });
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
  }, []);

  return {
    config,
    setConfig,
    viewMode,
    setViewMode,
    lineWrapping,
    setLineWrapping,
    fontSize,
    setFontSize,
    showDiagnostics,
    setShowDiagnostics,
    isExplorerOpen,
    setIsExplorerOpen,
    theme,
    setTheme,
    handleToggleTheme,
    assistantMode,
    setAssistantMode,
    currentActiveProvider,
    currentActiveModel,
    activeShortModelName,
    activeFullModelInfo,
    handleToggleActiveProvider,
    handleTestConnection,
  };
}
