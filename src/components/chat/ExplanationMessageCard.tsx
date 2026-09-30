import React from 'react';
import Markdown from 'react-markdown';
import {
  MessageSquare,
  ShieldCheck,
  AlertTriangle,
  ArrowRight,
} from 'lucide-react';
import { ChatMessage } from '../../types';

interface ExplanationMessageCardProps {
  msg: ChatMessage;
  fullModelTooltip: string;
  onTransferToExecution: (planText: string) => void;
}

export const ExplanationMessageCard: React.FC<ExplanationMessageCardProps> = ({
  msg,
  fullModelTooltip,
  onTransferToExecution,
}) => {
  const rawContent = msg.explanation || msg.text || '';

  return (
    <div
      key={msg.id}
      className="bg-[var(--panel-2)] border border-[var(--border)] rounded-2xl rounded-bl-xs p-3 text-xs text-[var(--text)] flex flex-col gap-2 shadow-2xs"
    >
      {/* Cabeçalho da resposta */}
      <div
        className="flex items-center justify-between border-b border-[var(--border)]/40 pb-1 cursor-default select-none"
        title={msg.provider || fullModelTooltip}
      >
        <span className="flex items-center gap-1.5 text-[10px] font-medium text-[var(--muted)]">
          <MessageSquare className="w-2.5 h-2.5 text-blue-400/70 shrink-0" />
          <span className="tracking-tight text-blue-400/80">Resposta de Planejamento</span>
        </span>

        {msg.usedKeyMask && (
          <span
            className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.2 rounded bg-[var(--panel)] border border-[var(--border)] text-[var(--muted)] font-mono"
            title="Chave de API utilizada"
          >
            <ShieldCheck className="w-2.5 h-2.5 text-[var(--accent)]" />
            {msg.usedKeyMask}
          </span>
        )}
      </div>

      {/* Corpo Markdown com cursor pulsante discreto durante streaming */}
      <div className="text-xs text-[var(--text)] leading-relaxed font-sans prose prose-invert max-w-none space-y-2 selection:bg-[var(--accent)]/30">
        <Markdown>{rawContent}</Markdown>
        {msg.streaming && (
          <span className="inline-block w-1.5 h-3 ml-1 bg-blue-400 animate-pulse align-middle" />
        )}
      </div>

      {/* Aviso / Interrupção */}
      {msg.warning && (
        <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-[10.5px] text-amber-300 flex items-start gap-1.5 leading-relaxed">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-400" />
          <span>{msg.warning}</span>
        </div>
      )}

      {/* Bloco discreto de raciocínio */}
      {msg.thinking && (
        <details className="text-[10.5px] bg-[var(--panel)] border border-[var(--border)] rounded-xl p-2 text-[var(--muted)] group">
          <summary className="cursor-pointer font-medium text-[var(--muted)] hover:text-[var(--text)] select-none flex items-center justify-between list-none">
            <span className="flex items-center gap-1.5">
              <span>🧠</span>
              <span>Raciocínio interno ({msg.thinking.length} caracteres)</span>
            </span>
            <span className="text-[9px] text-[var(--muted)] group-open:rotate-90 transition-transform">▸</span>
          </summary>
          <div className="mt-1.5 pt-1.5 border-t border-[var(--border)]/50 font-mono text-[9.5px] whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto text-[var(--text)]/80 select-text">
            {msg.thinking}
          </div>
        </details>
      )}

      {/* Ação rápida: transferir plano para Execução */}
      {!msg.streaming && (
        <div className="pt-1.5 border-t border-[var(--border)]/60 flex justify-end">
          <button
            type="button"
            onClick={() => onTransferToExecution(rawContent)}
            className="flex items-center gap-1 text-[10.5px] font-semibold text-[var(--accent)] hover:underline cursor-pointer"
          >
            <span>Levar plano para Execução</span>
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
};
