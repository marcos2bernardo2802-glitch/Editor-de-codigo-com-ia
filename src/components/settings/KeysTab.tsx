import React from 'react';
import {
  Key,
  Plus,
  Trash2,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import { AVAILABLE_GEMINI_MODELS } from '../../types';
import { Tooltip, InfoTooltip } from '../Tooltip';

export interface KeyStatusItem {
  index: number;
  keyMask: string;
  inCooldown: boolean;
  secondsRemaining: number;
  consecutive429: number;
}

interface KeysTabProps {
  geminiModel: string;
  setGeminiModel: (m: string) => void;
  customGeminiInput: string;
  setCustomGeminiInput: (v: string) => void;
  geminiDisplayName: string;
  setGeminiDisplayName: (n: string) => void;
  geminiKeys: string[];
  newKeyInput: string;
  setNewKeyInput: (k: string) => void;
  keyInputError: string | null;
  setKeyInputError: (err: string | null) => void;
  handleAddKey: () => void;
  handleRemoveKey: (idx: number) => void;
  handleTestIndividualKey: (idx: number, key: string) => Promise<void>;
  keysHealth: Record<string, KeyStatusItem>;
  individualKeyTests: Record<number, { status: 'testing' | 'valid' | 'invalid' | 'quota'; message: string }>;
  maskKey: (k: string) => string;
}

export const KeysTab: React.FC<KeysTabProps> = ({
  geminiModel,
  setGeminiModel,
  customGeminiInput,
  setCustomGeminiInput,
  geminiDisplayName,
  setGeminiDisplayName,
  geminiKeys,
  newKeyInput,
  setNewKeyInput,
  keyInputError,
  setKeyInputError,
  handleAddKey,
  handleRemoveKey,
  handleTestIndividualKey,
  keysHealth,
  individualKeyTests,
  maskKey,
}) => {
  return (
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
  );
};
