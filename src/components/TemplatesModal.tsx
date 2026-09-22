import React from 'react';
import { X, Code, Check } from 'lucide-react';
import { CODE_TEMPLATES } from '../utils/templates';
import { CodeTemplate, SupportedLanguage } from '../types';

interface TemplatesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTemplate: (template: CodeTemplate) => void;
}

export const TemplatesModal: React.FC<TemplatesModalProps> = ({
  isOpen,
  onClose,
  onSelectTemplate,
}) => {
  if (!isOpen) return null;

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
    >
      <div className="w-full max-w-md bg-[var(--panel)] border border-[var(--border)] rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--border)]">
          <div className="flex items-center gap-2">
            <Code className="w-4 h-4 text-[var(--accent)]" />
            <h3 className="text-sm font-semibold text-[var(--text)] m-0">
              Exemplos de Código para Teste
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--panel-2)] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-2.5 max-h-[70vh] overflow-y-auto">
          {CODE_TEMPLATES.map((tpl, idx) => (
            <div
              key={idx}
              onClick={() => {
                onSelectTemplate(tpl);
                onClose();
              }}
              className="p-3 rounded-xl border border-[var(--border)] bg-[var(--panel-2)] hover:border-[var(--accent)]/60 hover:bg-[var(--panel-2)]/80 transition-all cursor-pointer group"
            >
              <div className="flex items-center justify-between mb-1">
                <h4 className="text-xs font-semibold text-[var(--text)] group-hover:text-[var(--accent)] transition-colors m-0">
                  {tpl.name}
                </h4>
                <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-[var(--panel)] border border-[var(--border)] text-[var(--muted)]">
                  {tpl.language}
                </span>
              </div>
              <p className="text-[11px] text-[var(--muted)] m-0 leading-relaxed">
                {tpl.description}
              </p>
            </div>
          ))}
        </div>

        <div className="p-3 border-t border-[var(--border)] bg-[var(--panel)] flex justify-end">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-xs text-[var(--muted)] hover:text-[var(--text)] border border-[var(--border)] transition-colors cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
