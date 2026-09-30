import React from 'react';
import {
  Sparkles,
  Network,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';
import { AIProvider, AVAILABLE_GEMINI_MODELS } from '../../types';
import { getShortModelName } from '../../utils/modelNames';
import { Tooltip, InfoTooltip } from '../Tooltip';

interface ModesTabProps {
  planningProvider: AIProvider;
  setPlanningProvider: (p: AIProvider) => void;
  executionProvider: AIProvider;
  setExecutionProvider: (p: AIProvider) => void;
  visionProvider: 'gemini' | 'colab' | 'none';
  setVisionProvider: (v: 'gemini' | 'colab' | 'none') => void;
  visionModel: string;
  setVisionModel: (m: string) => void;
  resolvedPlanColabModel: string;
  setColabPlanningModel: (m: string) => void;
  colabPlanningModel: string;
  colabModel: string;
  detectedModels: string[];
  modelVisionMap: Record<string, boolean>;
  detectingModels: boolean;
  endpointUrl: string;
  handleDetectModels: () => Promise<void>;
  resolvedGeminiModel: string;
  geminiShortName: string;
  resolvedExecColabModel: string;
  setColabExecutionModel: (m: string) => void;
  colabExecutionModel: string;
  visionSectionOpen: boolean;
  setVisionSectionOpen: React.Dispatch<React.SetStateAction<boolean>>;
  resolvedVisionColabModel: string;
  setColabVisionModel: (m: string) => void;
  colabVisionModel: string;
}

export const ModesTab: React.FC<ModesTabProps> = ({
  planningProvider,
  setPlanningProvider,
  executionProvider,
  setExecutionProvider,
  visionProvider,
  setVisionProvider,
  visionModel,
  setVisionModel,
  resolvedPlanColabModel,
  setColabPlanningModel,
  colabPlanningModel,
  colabModel,
  detectedModels,
  modelVisionMap,
  detectingModels,
  endpointUrl,
  handleDetectModels,
  resolvedGeminiModel,
  geminiShortName,
  resolvedExecColabModel,
  setColabExecutionModel,
  colabExecutionModel,
  visionSectionOpen,
  setVisionSectionOpen,
  resolvedVisionColabModel,
  setColabVisionModel,
  colabVisionModel,
}) => {
  const getVisionProviderLabel = () => {
    if (visionProvider === 'none') return 'Desativado';
    if (visionProvider === 'gemini') return `Google Gemini (${getShortModelName(visionModel, 'gemini')})`;
    return `Colab / Local (${getShortModelName(resolvedVisionColabModel, 'colab')})`;
  };

  return (
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
        <div
          role="button"
          tabIndex={0}
          onClick={() => setVisionSectionOpen((prev) => !prev)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setVisionSectionOpen((prev) => !prev);
            }
          }}
          className="w-full flex items-center justify-between p-3 text-left hover:bg-[var(--panel-2)]/40 transition-colors cursor-pointer select-none"
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
        </div>

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
  );
};
