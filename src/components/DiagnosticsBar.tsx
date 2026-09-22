import React, { useState } from 'react';
import { DiagnosticItem } from '../types';
import {
  AlertTriangle,
  AlertCircle,
  Wrench,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Check,
} from 'lucide-react';

interface DiagnosticsBarProps {
  diagnostics: DiagnosticItem[];
  onAutoFix: (diagnostic: DiagnosticItem | DiagnosticItem[]) => void;
  isLoading: boolean;
}

export const DiagnosticsBar: React.FC<DiagnosticsBarProps> = ({
  diagnostics,
  onAutoFix,
  isLoading,
}) => {
  const [expanded, setExpanded] = useState(false);

  if (!diagnostics || diagnostics.length === 0) return null;

  const errorCount = diagnostics.filter((d) => d.severity === 'error').length;
  const warningCount = diagnostics.filter((d) => d.severity === 'warning').length;

  const firstDiag = diagnostics[0];

  return (
    <div className="border-t border-[var(--border)] bg-[var(--panel)] transition-all select-none">
      {/* Summary Bar */}
      <div className="flex items-center justify-between px-3 py-1.5 text-xs gap-2">
        <div
          className="flex items-center gap-2 cursor-pointer min-w-0 flex-1 overflow-hidden"
          onClick={() => setExpanded(!expanded)}
          title="Clique para ver todos os erros de sintaxe"
        >
          {errorCount > 0 ? (
            <span className="flex items-center gap-1 font-semibold text-[var(--rem)] bg-[var(--rem-bg)] px-2 py-0.5 rounded border border-[var(--rem)]/30 shrink-0">
              <AlertCircle className="w-3.5 h-3.5" />
              {errorCount} {errorCount === 1 ? 'erro' : 'erros'}
            </span>
          ) : (
            <span className="flex items-center gap-1 font-semibold text-[var(--accent)] bg-[var(--accent)]/10 px-2 py-0.5 rounded border border-[var(--accent)]/30 shrink-0">
              <AlertTriangle className="w-3.5 h-3.5" />
              {warningCount} {warningCount === 1 ? 'aviso' : 'avisos'}
            </span>
          )}

          {firstDiag.source && (
            <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-[var(--panel-2)] text-[var(--muted)] border border-[var(--border)] shrink-0 hidden sm:inline">
              {firstDiag.source}
            </span>
          )}

          <span className="text-[var(--text)] text-xs truncate max-w-lg font-mono">
            L{firstDiag.line}: {firstDiag.message}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* Direct 1-click Auto-Fix */}
          <button
            onClick={() =>
              diagnostics.length > 1 ? onAutoFix(diagnostics) : onAutoFix(firstDiag)
            }
            disabled={isLoading}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-[var(--accent)] hover:brightness-110 text-[#1a1206] font-semibold text-xs transition-all cursor-pointer shadow-xs disabled:opacity-50"
            title={
              diagnostics.length > 1
                ? `Solicitar à IA que conserte todos os ${diagnostics.length} problemas automaticamente`
                : 'Solicitar à IA que conserte este problema automaticamente'
            }
          >
            <Wrench className="w-3 h-3" />
            <span>
              {diagnostics.length > 1
                ? `Auto-Fix (${diagnostics.length})`
                : 'Auto-Fix IA'}
            </span>
          </button>

          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1 text-[var(--muted)] hover:text-[var(--text)] transition-colors cursor-pointer"
            title={expanded ? 'Recolher detalhes' : 'Ver todos os diagnósticos'}
          >
            {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Expanded List of Issues */}
      {expanded && (
        <div className="max-h-48 overflow-y-auto px-3 py-2 border-t border-[var(--border)]/70 bg-[var(--panel-2)]/60 flex flex-col gap-1.5 text-xs font-mono">
          {diagnostics.map((diag) => (
            <div
              key={diag.id}
              className="flex items-center justify-between gap-2 p-1.5 rounded bg-[var(--panel)] border border-[var(--border)]"
            >
              <div className="flex items-center gap-2 overflow-hidden min-w-0">
                {diag.severity === 'error' ? (
                  <AlertCircle className="w-3.5 h-3.5 text-[var(--rem)] shrink-0" />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                )}
                {diag.source && (
                  <span className="text-[10px] px-1 py-0.5 rounded bg-[var(--panel-2)] text-[var(--muted)] border border-[var(--border)] shrink-0">
                    {diag.source}
                  </span>
                )}
                <span className="font-semibold text-[var(--muted)] shrink-0">
                  Linha {diag.line}
                  {diag.column ? `:${diag.column}` : ''}:
                </span>
                <span className="truncate text-[var(--text)] font-sans">{diag.message}</span>
              </div>

              <button
                onClick={() => onAutoFix(diag)}
                disabled={isLoading}
                className="flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--panel-2)] hover:bg-[var(--accent)] hover:text-[#1a1206] text-[var(--accent)] border border-[var(--border)] font-sans text-[11px] font-medium shrink-0 transition-colors cursor-pointer disabled:opacity-50"
                title="Corrigir este problema específico"
              >
                <Sparkles className="w-3 h-3" />
                <span>Corrigir</span>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
