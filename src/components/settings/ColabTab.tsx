import React from 'react';
import {
  Zap,
  Eye,
  RefreshCw,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { getShortModelName } from '../../utils/modelNames';
import { Tooltip, InfoTooltip } from '../Tooltip';

interface ColabTabProps {
  endpointUrl: string;
  setEndpointUrl: (u: string) => void;
  testing: boolean;
  handleTest: () => Promise<void>;
  detectedModels: string[];
  isCustomColabModel: boolean;
  setIsCustomColabModel: (b: boolean) => void;
  colabModel: string;
  handleSetModel: (m: string) => void;
  modelVisionMap: Record<string, boolean>;
  setModelVisionMap: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  detectingModels: boolean;
  handleDetectModels: () => Promise<void>;
  colabDisplayName: string;
  setColabDisplayName: (n: string) => void;
  showAdvancedColab: boolean;
  setShowAdvancedColab: React.Dispatch<React.SetStateAction<boolean>>;
  authToken: string;
  setAuthToken: (t: string) => void;
  useProxy: boolean;
  setUseProxy: (p: boolean) => void;
  handleApplyPreset: (type: 'colab' | 'ollama' | 'openai') => void;
  requestTemplate: string;
  setRequestTemplate: (t: string) => void;
  responsePath: string;
  setResponsePath: (p: string) => void;
  visionPrompt: string;
  setVisionPrompt: (vp: string) => void;
}

export const ColabTab: React.FC<ColabTabProps> = ({
  endpointUrl,
  setEndpointUrl,
  testing,
  handleTest,
  detectedModels,
  isCustomColabModel,
  setIsCustomColabModel,
  colabModel,
  handleSetModel,
  modelVisionMap,
  setModelVisionMap,
  detectingModels,
  handleDetectModels,
  colabDisplayName,
  setColabDisplayName,
  showAdvancedColab,
  setShowAdvancedColab,
  authToken,
  setAuthToken,
  useProxy,
  setUseProxy,
  handleApplyPreset,
  requestTemplate,
  setRequestTemplate,
  responsePath,
  setResponsePath,
  visionPrompt,
  setVisionPrompt,
}) => {
  return (
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
  );
};
