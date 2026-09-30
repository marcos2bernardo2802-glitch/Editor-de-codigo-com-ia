import React from 'react';
import {
  FolderOpen,
  HardDrive,
  AlertCircle,
  FolderCheck,
  FolderX,
  ShieldAlert,
  RefreshCw,
  Save,
  Check,
} from 'lucide-react';
import { Tooltip } from '../Tooltip';

interface LocalFolderTabProps {
  localFolderSupported: boolean;
  localFolderPermissionNeeded: boolean;
  localFolderName: string | null;
  saveMode: 'auto' | 'manual';
  onOpenLocalFolder?: () => Promise<void>;
  onReconnectLocalFolder?: () => Promise<void>;
  onDisconnectLocalFolder?: () => void;
  onChangeSaveMode?: (mode: 'auto' | 'manual') => void;
}

export const LocalFolderTab: React.FC<LocalFolderTabProps> = ({
  localFolderSupported,
  localFolderPermissionNeeded,
  localFolderName,
  saveMode,
  onOpenLocalFolder,
  onReconnectLocalFolder,
  onDisconnectLocalFolder,
  onChangeSaveMode,
}) => {
  return (
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
  );
};
