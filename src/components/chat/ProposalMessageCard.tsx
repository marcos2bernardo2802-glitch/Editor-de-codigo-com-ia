import React from 'react';
import {
  Sparkles,
  ShieldCheck,
  Scissors,
  GraduationCap,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { ChatMessage, AssistantMode } from '../../types';
import { DiffViewer } from '../DiffViewer';

interface ProposalMessageCardProps {
  msg: ChatMessage;
  fullModelTooltip: string;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onApplyDiff: (msgId: string, newCode: string) => void;
  onApplyPartialDiff?: (msgId: string, updatedCode: string) => void;
  onDiscardDiff: (msgId: string) => void;
  assistantMode: AssistantMode;
  onExplainChange: (msgId: string) => void;
  explainingMsgId: string | null;
}

export const ProposalMessageCard: React.FC<ProposalMessageCardProps> = ({
  msg,
  fullModelTooltip,
  isExpanded,
  onToggleExpand,
  onApplyDiff,
  onApplyPartialDiff,
  onDiscardDiff,
  assistantMode,
  onExplainChange,
  explainingMsgId,
}) => {
  if (msg.oldCode === undefined || msg.newCode === undefined) return null;

  return (
    <div className="flex flex-col gap-1">
      {/* Cabeçalho da proposta: nome completo apenas no tooltip */}
      <div
        className="flex items-center justify-between text-[11px] text-[var(--muted)] px-1 cursor-default"
        title={msg.provider || fullModelTooltip}
      >
        <span className="flex items-center gap-1 font-semibold text-[var(--text)]">
          <Sparkles className="w-3 h-3 text-[var(--accent)]" />
          <span>Proposta de Edição</span>
        </span>

        <div className="flex items-center gap-1.5">
          {msg.usedKeyMask && (
            <span
              className="inline-flex items-center gap-1 text-[9.5px] px-1.5 py-0.2 rounded bg-[var(--panel-2)] border border-[var(--border)] text-[var(--muted)] font-mono"
              title="Chave de API utilizada para esta requisição"
            >
              <ShieldCheck className="w-2.5 h-2.5 text-[var(--accent)]" />
              {msg.usedKeyMask}
            </span>
          )}

          {msg.scope === 'selection' && (
            <span className="inline-flex items-center gap-1 text-[9.5px] px-1.5 py-0.2 rounded-full bg-[var(--accent)]/15 border border-[var(--accent)]/30 text-[var(--accent)] font-mono">
              <Scissors className="w-2.5 h-2.5" />
              L{msg.selectionRange?.fromLine}–L{msg.selectionRange?.toLine}
            </span>
          )}
        </div>
      </div>

      {/* Diffs recolhidos por padrão */}
      <DiffViewer
        messageId={msg.id}
        isExpanded={isExpanded}
        onToggleExpand={onToggleExpand}
        oldCode={msg.oldCode}
        newCode={msg.newCode}
        applied={msg.applied}
        discarded={msg.discarded}
        onApply={() => onApplyDiff(msg.id, msg.fullNewCode || msg.newCode || '')}
        onDiscard={() => onDiscardDiff(msg.id)}
        onApplyPartial={
          onApplyPartialDiff
            ? (updated) => onApplyPartialDiff(msg.id, updated)
            : undefined
        }
      />

      {assistantMode === 'basico' && msg.applied && (
        <div className="mt-1 p-2.5 rounded-xl bg-[var(--accent)]/10 border border-[var(--accent)]/30 text-[11.5px] text-[var(--text)] flex flex-col gap-2">
          {msg.changeExplanation ? (
            <>
              <div className="flex items-center gap-1.5 font-semibold text-[var(--accent)]">
                <GraduationCap className="w-3.5 h-3.5" />
                <span>Explicação da alteração</span>
              </div>
              <div className="whitespace-pre-wrap leading-relaxed">{msg.changeExplanation}</div>
            </>
          ) : (
            <>
              <span>Pronto! Fiz a alteração. Quer que eu explique o que mudei e por quê?</span>
              <button
                type="button"
                onClick={() => onExplainChange(msg.id)}
                disabled={explainingMsgId !== null}
                className="self-start inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--accent)] text-[#1a1206] font-semibold text-[11px] cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {explainingMsgId === msg.id ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>Explicando...</span>
                  </>
                ) : (
                  <>
                    <GraduationCap className="w-3 h-3" />
                    <span>Explicar essa alteração</span>
                  </>
                )}
              </button>
            </>
          )}
        </div>
      )}

      {/* Aviso / Interrupção */}
      {msg.warning && (
        <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-[10.5px] text-amber-300 flex items-start gap-1.5 leading-relaxed">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-400" />
          <span>{msg.warning}</span>
        </div>
      )}

      {/* Bloco recolhível de raciocínio interno */}
      {msg.thinking && (
        <details className="text-[10.5px] bg-[var(--panel-2)] border border-[var(--border)] rounded-xl p-2 text-[var(--muted)] group">
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
    </div>
  );
};
