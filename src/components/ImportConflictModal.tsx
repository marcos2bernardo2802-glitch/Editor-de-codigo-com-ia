import React from 'react';
import { FolderInput, Replace, GitMerge, AlertTriangle, X, FileCode } from 'lucide-react';
import { ProjectFile } from '../types';
import { normalizeFilePath } from '../utils/workspace';

interface ImportConflictModalProps {
  isOpen: boolean;
  incomingFiles: ProjectFile[];
  existingFiles: ProjectFile[];
  onReplace: () => void;
  onMerge: () => void;
  onCancel: () => void;
}

export const ImportConflictModal: React.FC<ImportConflictModalProps> = ({
  isOpen,
  incomingFiles,
  existingFiles,
  onReplace,
  onMerge,
  onCancel,
}) => {
  if (!isOpen) return null;

  // Find colliding paths
  const existingPathMap = new Set(
    existingFiles.map((f) => normalizeFilePath(f.path || f.name).toLowerCase())
  );

  const conflictingFiles = incomingFiles.filter((f) =>
    existingPathMap.has(normalizeFilePath(f.path || f.name).toLowerCase())
  );

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
    >
      <div className="w-full max-w-lg bg-[var(--panel)] border border-[var(--border)] rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--border)]">
          <div className="flex items-center gap-2">
            <FolderInput className="w-4 h-4 text-[var(--accent)]" />
            <h3 className="text-sm font-semibold text-[var(--text)] m-0">
              Importar Projeto
            </h3>
          </div>
          <button
            onClick={onCancel}
            className="p-1 rounded-lg text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--panel-2)] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          <div className="flex items-start gap-3 p-3.5 rounded-xl bg-[var(--panel-2)] border border-[var(--border)]">
            <FileCode className="w-5 h-5 text-[var(--accent)] shrink-0 mt-0.5" />
            <div>
              <p className="text-xs text-[var(--text)] font-medium m-0">
                {incomingFiles.length} {incomingFiles.length === 1 ? 'arquivo preparado' : 'arquivos preparados'} para importação.
              </p>
              <p className="text-[11px] text-[var(--muted)] mt-1 m-0">
                Você já possui {existingFiles.length} {existingFiles.length === 1 ? 'arquivo' : 'arquivos'} no seu workspace atual. Como deseja prosseguir?
              </p>
            </div>
          </div>

          {conflictingFiles.length > 0 && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300">
              <div className="flex items-center gap-2 mb-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                <span className="text-xs font-semibold text-amber-400">
                  {conflictingFiles.length} {conflictingFiles.length === 1 ? 'caminho coincidente' : 'caminhos coincidentes'}:
                </span>
              </div>
              <p className="text-[11px] text-amber-200/80 m-0 mb-2">
                Se escolher <strong>Mesclar</strong>, os arquivos existentes com mesmo caminho serão sobrescritos pelos novos:
              </p>
              <div className="max-h-24 overflow-y-auto space-y-1 font-mono text-[10px] text-amber-200/90 pl-1">
                {conflictingFiles.map((f, i) => (
                  <div key={i} className="truncate">
                    • {f.path || f.name}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action options */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <button
              onClick={onReplace}
              className="flex flex-col items-start p-3.5 rounded-xl border border-[var(--border)] hover:border-[var(--rem)]/60 bg-[var(--panel-2)] hover:bg-[var(--rem-bg)] transition-all cursor-pointer text-left group"
            >
              <div className="flex items-center gap-2 text-xs font-semibold text-[var(--text)] group-hover:text-[var(--rem)] mb-1">
                <Replace className="w-4 h-4 text-[var(--rem)]" />
                <span>Substituir tudo</span>
              </div>
              <p className="text-[11px] text-[var(--muted)] m-0 leading-tight">
                Descarta o workspace atual e carrega exclusivamente os {incomingFiles.length} arquivos importados.
              </p>
            </button>

            <button
              onClick={onMerge}
              className="flex flex-col items-start p-3.5 rounded-xl border border-[var(--border)] hover:border-[var(--accent)]/60 bg-[var(--panel-2)] hover:bg-[var(--accent)]/10 transition-all cursor-pointer text-left group"
            >
              <div className="flex items-center gap-2 text-xs font-semibold text-[var(--text)] group-hover:text-[var(--accent)] mb-1">
                <GitMerge className="w-4 h-4 text-[var(--accent)]" />
                <span>Mesclar arquivos</span>
              </div>
              <p className="text-[11px] text-[var(--muted)] m-0 leading-tight">
                Mantém seus arquivos atuais e adiciona os novos (sobrescrevendo apenas colisões de mesmo caminho).
              </p>
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end px-5 py-3 border-t border-[var(--border)] bg-[var(--panel-2)]">
          <button
            onClick={onCancel}
            className="px-3.5 py-1.5 text-xs text-[var(--muted)] hover:text-[var(--text)] rounded-lg transition-colors cursor-pointer"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
};
