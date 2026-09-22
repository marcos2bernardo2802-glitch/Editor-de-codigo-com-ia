import React, { useState } from 'react';
import { History, RotateCcw, Clock, Sparkles, Check, FileCode, X } from 'lucide-react';
import { VersionCheckpoint } from '../types';

interface VersionHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  checkpoints: VersionCheckpoint[];
  onRestoreCheckpoint: (checkpoint: VersionCheckpoint) => void;
  activeFileName?: string;
}

export const VersionHistoryModal: React.FC<VersionHistoryModalProps> = ({
  isOpen,
  onClose,
  checkpoints,
  onRestoreCheckpoint,
  activeFileName,
}) => {
  const [selectedId, setSelectedId] = useState<string | null>(
    checkpoints.length > 0 ? checkpoints[checkpoints.length - 1].id : null
  );
  const [restoredId, setRestoredId] = useState<string | null>(null);

  if (!isOpen) return null;

  const currentSelected =
    checkpoints.find((c) => c.id === selectedId) ||
    (checkpoints.length > 0 ? checkpoints[checkpoints.length - 1] : null);

  const handleRestore = (cp: VersionCheckpoint) => {
    onRestoreCheckpoint(cp);
    setRestoredId(cp.id);
    setTimeout(() => {
      setRestoredId(null);
      onClose();
    }, 600);
  };

  const getSourceBadge = (source: VersionCheckpoint['source']) => {
    switch (source) {
      case 'ai':
        return (
          <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-[var(--accent)]/15 text-[var(--accent)] font-semibold">
            <Sparkles className="w-3 h-3" /> IA Diff
          </span>
        );
      case 'autofix':
        return (
          <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-semibold">
            Auto-Fix
          </span>
        );
      case 'format':
        return (
          <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-400 font-semibold">
            Formatação
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 font-semibold">
            Manual
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
      <div className="bg-[var(--panel)] border border-[var(--border)] rounded-2xl w-full max-w-4xl h-[80vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)] bg-[var(--panel-2)] select-none">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[var(--accent)]/20 text-[var(--accent)] flex items-center justify-center border border-[var(--accent)]/30">
              <History className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-[var(--text)] m-0">
                Linha do Tempo & Checkpoints de Versões
              </h2>
              <p className="text-xs text-[var(--muted)] m-0">
                {activeFileName ? `Histórico para ${activeFileName}` : 'Histórico da sessão'} ({checkpoints.length} registros)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--border)] transition-colors cursor-pointer"
            title="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Split: Left list, Right preview */}
        <div className="flex-1 flex overflow-hidden min-h-0">
          {/* Left Column: Checkpoints List */}
          <div className="w-80 border-r border-[var(--border)] flex flex-col bg-[var(--panel)] overflow-y-auto">
            {checkpoints.length === 0 ? (
              <div className="p-6 text-center text-xs text-[var(--muted)] my-auto">
                <Clock className="w-8 h-8 mx-auto mb-2 text-[var(--muted)] opacity-50" />
                Nenhum checkpoint salvo ainda. Versões são salvas automaticamente quando a IA aplica edições ou quando você formata o código.
              </div>
            ) : (
              <div className="p-3 space-y-2">
                {[...checkpoints].reverse().map((cp, index) => {
                  const isSelected = (currentSelected && currentSelected.id === cp.id);
                  return (
                    <div
                      key={cp.id}
                      onClick={() => setSelectedId(cp.id)}
                      className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                        isSelected
                          ? 'border-[var(--accent)] bg-[var(--accent)]/10 shadow-xs'
                          : 'border-[var(--border)] bg-[var(--panel-2)] hover:border-[var(--muted)]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1 mb-1.5">
                        {getSourceBadge(cp.source)}
                        <span className="text-[10px] text-[var(--muted)] flex items-center gap-1">
                          <Clock className="w-2.5 h-2.5" />
                          {new Date(cp.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                      </div>
                      <div className="text-xs font-medium text-[var(--text)] line-clamp-2">
                        {cp.description || 'Alteração sem descrição'}
                      </div>
                      <div className="mt-2 text-[10px] text-[var(--muted)] flex items-center justify-between">
                        <span>{cp.code.split('\n').length} linhas</span>
                        {index === 0 && (
                          <span className="text-[9px] uppercase font-bold text-[var(--accent)]">
                            Mais recente
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right Column: Code Preview & Restore Action */}
          <div className="flex-1 flex flex-col bg-[#0d1117] overflow-hidden min-h-0">
            {currentSelected ? (
              <>
                {/* Action Bar */}
                <div className="px-4 py-2.5 bg-[#161b22] border-b border-white/10 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-2">
                    <FileCode className="w-4 h-4 text-[var(--accent)]" />
                    <span className="text-xs font-semibold text-white">
                      Visualizando snapshot: {currentSelected.description}
                    </span>
                  </div>

                  <button
                    onClick={() => handleRestore(currentSelected)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold shadow-xs transition-all cursor-pointer ${
                      restoredId === currentSelected.id
                        ? 'bg-emerald-600 text-white'
                        : 'bg-[var(--accent)] text-[#1a1206] hover:brightness-110'
                    }`}
                  >
                    {restoredId === currentSelected.id ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        Restaurado!
                      </>
                    ) : (
                      <>
                        <RotateCcw className="w-3.5 h-3.5" />
                        Restaurar esta Versão
                      </>
                    )}
                  </button>
                </div>

                {/* Code Body */}
                <div className="flex-1 overflow-auto p-4 font-mono text-xs text-[#e6edf3] leading-relaxed">
                  <pre className="m-0 font-mono whitespace-pre-wrap selection:bg-[var(--accent)]/30">
                    {currentSelected.code}
                  </pre>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-xs text-[var(--muted)]">
                Selecione uma versão na lista à esquerda para inspecionar e restaurar.
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-[var(--border)] bg-[var(--panel-2)] flex items-center justify-between text-xs text-[var(--muted)] select-none">
          <span>
            Dica: Restaurar uma versão anterior cria um novo ponto de restauração, preservando o histórico completo.
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg border border-[var(--border)] hover:bg-[var(--border)] text-[var(--text)] transition-colors cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
