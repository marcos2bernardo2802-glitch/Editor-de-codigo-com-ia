import React, { useState, useMemo } from 'react';
import { computeLineDiff } from '../utils/diff';
import { groupIntoHunks, applySingleHunk, DiffHunk } from '../utils/hunks';
import {
  Check,
  X,
  Copy,
  ChevronDown,
  ChevronUp,
  Layers,
  Sparkles,
  CheckCheck,
} from 'lucide-react';

interface DiffViewerProps {
  messageId?: string;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  oldCode: string;
  newCode: string;
  applied?: boolean;
  discarded?: boolean;
  onApply: () => void;
  onDiscard: () => void;
  onApplyPartial?: (updatedFullCode: string) => void;
}

export const DiffViewer: React.FC<DiffViewerProps> = ({
  messageId,
  isExpanded: controlledExpanded,
  onToggleExpand,
  oldCode,
  newCode,
  applied,
  discarded,
  onApply,
  onDiscard,
  onApplyPartial,
}) => {
  const [internalExpanded, setInternalExpanded] = useState(false);
  const isExpanded = controlledExpanded !== undefined ? controlledExpanded : internalExpanded;

  const [copied, setCopied] = useState(false);
  const [showAllContext, setShowAllContext] = useState(false);
  const [hunkMode, setHunkMode] = useState<boolean>(false);
  const [appliedHunkIds, setAppliedHunkIds] = useState<Set<string>>(new Set());

  const handleToggleExpand = () => {
    if (onToggleExpand) {
      onToggleExpand();
    } else {
      setInternalExpanded((prev) => !prev);
    }
  };

  // Compute full line diff
  const diffResult = useMemo(() => {
    return computeLineDiff(oldCode, newCode);
  }, [oldCode, newCode]);

  const { lines, additions, deletions, unchanged } = diffResult;

  // Group diff into contiguous change hunks (blocos)
  const hunks = useMemo(() => {
    return groupIntoHunks(lines);
  }, [lines]);

  // Context filtering for unified view
  const displayLines = useMemo(() => {
    if (showAllContext || lines.length <= 40) return lines;
    const activeIndices = new Set<number>();
    lines.forEach((l, idx) => {
      if (l.type === 'add' || l.type === 'rem') {
        for (let offset = -2; offset <= 2; offset++) {
          const target = idx + offset;
          if (target >= 0 && target < lines.length) {
            activeIndices.add(target);
          }
        }
      }
    });

    return lines.filter((_, idx) => activeIndices.has(idx));
  }, [lines, showAllContext]);

  const handleCopyNewCode = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(newCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Sugestão 3: Aceitar um bloco isolado de diff
  const handleAcceptHunk = (hunk: DiffHunk) => {
    if (!onApplyPartial) return;
    try {
      const result = applySingleHunk(oldCode, hunk);
      if (result.success || result.newCode !== oldCode) {
        setAppliedHunkIds((prev) => new Set([...prev, hunk.id]));
        onApplyPartial(result.newCode);
      }
    } catch (err) {
      console.error('Falha ao aplicar bloco parcial:', err);
    }
  };

  const hasChanges = additions > 0 || deletions > 0;
  const canShowHunkMode = hunks.length > 1 && Boolean(onApplyPartial);
  const showCodeBlock = isExpanded || hunkMode;

  return (
    <div className="mt-2 text-xs font-mono rounded-lg border border-[var(--border)] bg-[var(--panel-2)] overflow-hidden shadow-xs">
      {/* Resumo compacto / Linha de recolher e expandir */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[var(--panel)] border-b border-[var(--border)] text-[11px] select-none gap-2">
        <button
          type="button"
          onClick={handleToggleExpand}
          className="flex items-center gap-1.5 hover:opacity-85 transition-opacity cursor-pointer text-left"
          aria-label={isExpanded ? 'Ocultar alterações' : 'Ver alterações'}
          title={isExpanded ? 'Clique para recolher o diff' : 'Clique para expandir o diff completo'}
        >
          <span className="text-[var(--add)] font-semibold font-mono">+{additions}</span>
          <span className="text-[var(--rem)] font-semibold font-mono">−{deletions}</span>
          <span className="text-[var(--muted)] font-sans">linhas ·</span>
          <span className="text-[var(--accent)] font-medium font-sans underline underline-offset-2">
            {isExpanded ? 'Ocultar alterações' : 'Ver alterações'}
          </span>
          {isExpanded ? (
            <ChevronUp className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
          )}
        </button>

        <div className="flex items-center gap-2 shrink-0">
          {/* Hunk Mode Toggle (Aceitar bloco a bloco) */}
          {canShowHunkMode && !applied && !discarded && (
            <button
              type="button"
              onClick={() => {
                const next = !hunkMode;
                setHunkMode(next);
                if (next && !isExpanded) {
                  handleToggleExpand();
                }
              }}
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-sans font-medium transition-colors cursor-pointer ${
                hunkMode
                  ? 'bg-[var(--accent)]/20 border-[var(--accent)] text-[var(--accent)]'
                  : 'bg-[var(--panel-2)] border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]'
              }`}
              title="Alternar entre aplicar tudo de uma vez ou aceitar bloco a bloco"
              aria-label="Alternar aprovação por blocos"
            >
              <Layers className="w-3 h-3" />
              <span>Blocos ({hunks.length})</span>
            </button>
          )}

          {isExpanded && lines.length > 40 && !hunkMode && (
            <button
              type="button"
              onClick={() => setShowAllContext(!showAllContext)}
              className="flex items-center gap-0.5 text-[10px] text-[var(--muted)] hover:text-[var(--text)] transition-colors cursor-pointer"
              title={showAllContext ? 'Recolher contexto igual' : 'Expandir todo o código'}
            >
              {showAllContext ? (
                <>
                  <span>Recolher</span>
                  <ChevronUp className="w-3 h-3" />
                </>
              ) : (
                <>
                  <span>Expandir tudo</span>
                  <ChevronDown className="w-3 h-3" />
                </>
              )}
            </button>
          )}

          <button
            type="button"
            onClick={handleCopyNewCode}
            className="p-1 rounded text-[var(--muted)] hover:text-[var(--text)] transition-colors cursor-pointer"
            title="Copiar código resultante completo"
            aria-label="Copiar código resultante completo"
          >
            {copied ? <Check className="w-3 h-3 text-[var(--add)]" /> : <Copy className="w-3 h-3" />}
          </button>
        </div>
      </div>

      {/* Code Viewer: exibido quando expandido ou quando modo de blocos estiver ativo */}
      {showCodeBlock && (
        <div className="max-h-80 overflow-y-auto overflow-x-auto text-[12px] leading-relaxed border-t border-[var(--border)]/50">
          {!hasChanges ? (
            <div className="p-3 text-center text-[var(--muted)] italic">
              Nenhuma diferença encontrada entre o código atual e a proposta.
            </div>
          ) : hunkMode && canShowHunkMode ? (
            /* Visualização e Aplicação Bloco a Bloco (Hunk-by-Hunk) */
            <div className="divide-y divide-[var(--border)]">
              {hunks.map((hunk, hIdx) => {
                const isHunkApplied = appliedHunkIds.has(hunk.id);
                return (
                  <div key={hunk.id} className="p-2 bg-[var(--panel)]/30">
                    <div className="flex items-center justify-between mb-1.5 pb-1 border-b border-[var(--border)]/60 text-[11px] font-sans">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-[var(--text)]">Bloco {hIdx + 1}</span>
                        <span className="text-[10px] text-[var(--muted)]">
                          (L{hunk.oldStartLine}–L{hunk.oldStartLine + Math.max(0, (hunk.originalOldLines?.length || 1) - 1)})
                        </span>
                        <span className="text-[10px] text-[var(--add)]">+{hunk.additions}</span>
                        <span className="text-[10px] text-[var(--rem)]">−{hunk.deletions}</span>
                      </div>

                      {/* Botão para aceitar este bloco específico */}
                      {!applied && !discarded && (
                        <button
                          type="button"
                          onClick={() => handleAcceptHunk(hunk)}
                          disabled={isHunkApplied}
                          className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-all cursor-pointer ${
                            isHunkApplied
                              ? 'bg-[var(--add-bg)] text-[var(--add)] border border-[var(--add)]/30 cursor-default'
                              : 'bg-[var(--add)] text-[#0d1a14] hover:brightness-110 active:scale-95 shadow-xs'
                          }`}
                        >
                          <Check className="w-3 h-3" />
                          <span>{isHunkApplied ? 'Aplicado' : 'Aceitar este bloco'}</span>
                        </button>
                      )}
                    </div>

                    {/* Linhas deste bloco */}
                    <div className="font-mono text-[11px]">
                      {hunk.lines.map((line, lIdx) => {
                        const isAdd = line.type === 'add';
                        const isRem = line.type === 'rem';
                        return (
                          <div
                            key={lIdx}
                            className={`flex items-start px-2 py-0.5 select-text ${
                              isAdd
                                ? 'bg-[var(--add-bg)] text-[var(--add)]'
                                : isRem
                                ? 'bg-[var(--rem-bg)] text-[var(--rem)] line-through decoration-[var(--rem)]/50'
                                : 'text-[var(--muted)]'
                            }`}
                          >
                            <div className="w-6 shrink-0 text-right pr-2 text-[10px] text-[var(--muted)]/50 select-none">
                              {line.oldLineNum || ''}
                            </div>
                            <div className="w-6 shrink-0 text-right pr-2 text-[10px] text-[var(--muted)]/50 select-none">
                              {line.newLineNum || ''}
                            </div>
                            <div className="w-4 shrink-0 font-bold select-none text-center">
                              {isAdd ? '+' : isRem ? '-' : ' '}
                            </div>
                            <div className="flex-1 whitespace-pre-wrap break-all">{line.text || ' '}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Visualização unificada linha a linha */
            displayLines.map((line, idx) => {
              const isAdd = line.type === 'add';
              const isRem = line.type === 'rem';
              return (
                <div
                  key={idx}
                  className={`flex items-start px-2 py-0.5 select-text ${
                    isAdd
                      ? 'bg-[var(--add-bg)] text-[var(--add)]'
                      : isRem
                      ? 'bg-[var(--rem-bg)] text-[var(--rem)] line-through decoration-[var(--rem)]/50'
                      : 'text-[var(--muted)]'
                  }`}
                >
                  <div className="w-7 shrink-0 text-right pr-2 text-[10px] text-[var(--muted)]/50 select-none font-mono">
                    {line.oldLineNum || ''}
                  </div>
                  <div className="w-7 shrink-0 text-right pr-2 text-[10px] text-[var(--muted)]/50 select-none font-mono">
                    {line.newLineNum || ''}
                  </div>
                  <div className="w-4 shrink-0 font-bold select-none text-center">
                    {isAdd ? '+' : isRem ? '-' : ' '}
                  </div>
                  <div className="flex-1 whitespace-pre-wrap break-all">{line.text || ' '}</div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Action buttons (Aplicar tudo / Descartar) - sempre visíveis e acionáveis */}
      {!discarded && (
        <div className="p-2 bg-[var(--panel)] border-t border-[var(--border)] flex items-center gap-2">
          {applied ? (
            <div className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-md bg-[var(--add-bg)] border border-[var(--add)]/40 text-[var(--add)] text-xs font-semibold">
              <CheckCheck className="w-3.5 h-3.5" />
              <span>Alteração Completa Aplicada</span>
            </div>
          ) : (
            <>
              <button
                id="btnApplyProposal"
                type="button"
                onClick={onApply}
                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-md bg-[var(--add)] hover:brightness-110 text-[#0d1a14] font-semibold transition-all cursor-pointer shadow-xs active:scale-98 text-xs"
                title="Aplicar todas as alterações de uma vez"
                aria-label="Aplicar todas as alterações"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Aplicar Tudo</span>
              </button>
              <button
                id="btnDiscardProposal"
                type="button"
                onClick={onDiscard}
                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-md bg-transparent border border-[var(--border)] hover:border-[var(--muted)] text-[var(--muted)] hover:text-[var(--text)] font-medium transition-colors cursor-pointer active:scale-98 text-xs"
                title="Descartar esta proposta"
                aria-label="Descartar proposta"
              >
                <X className="w-3.5 h-3.5" />
                <span>Descartar</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};
