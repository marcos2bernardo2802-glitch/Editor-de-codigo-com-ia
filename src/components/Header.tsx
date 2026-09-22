import React, { useState } from 'react';
import {
  Copy,
  Download,
  RotateCcw,
  RotateCw,
  Settings,
  Check,
  Code2,
  Sparkles,
  Network,
  Sun,
  Moon,
  FolderArchive,
  FolderDown,
} from 'lucide-react';
import { ConnectionConfig, ThemeMode } from '../types';

interface HeaderProps {
  status: 'connected' | 'disconnected' | 'testing';
  statusText: string;
  config: ConnectionConfig;
  theme: ThemeMode;
  onToggleTheme: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onCopy: () => void;
  onDownload: () => void;
  onExportZip?: () => void;
  onOpenSettings: () => void;
  onOpenTemplates: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  status,
  statusText,
  config,
  theme,
  onToggleTheme,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onCopy,
  onDownload,
  onExportZip,
  onOpenSettings,
  onOpenTemplates,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    onCopy();
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <header className="flex items-center justify-between px-5 py-3 border-b border-[var(--border)] bg-[var(--panel)] shrink-0 select-none">
      {/* Brand & Mode */}
      <div className="flex items-center gap-3">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[var(--accent)] to-[var(--accent-dim)] flex items-center justify-center font-mono text-xs font-bold text-[#14161d] shadow-sm">
          IA
        </div>
        <div className="flex items-center gap-2">
          <h1 className="text-sm font-semibold tracking-tight text-[var(--text)] m-0">
            Editor de Código com IA
          </h1>
          <span
            className="hidden sm:inline-flex items-center gap-1.5 text-[11px] px-2.5 py-0.5 rounded-full border border-[var(--border)] bg-[var(--panel-2)] text-[var(--muted)]"
            title={`Planejamento: ${config.planningProvider || 'colab'} | Execução: ${config.executionProvider || 'gemini'}`}
          >
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]"></span>
              <span className="text-[var(--text)] font-mono text-[10px]">Plan:</span>
              <span className="capitalize text-[var(--muted)]">{config.planningProvider || 'colab'}</span>
            </span>
            <span className="text-[var(--border)]">|</span>
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--add)]"></span>
              <span className="text-[var(--text)] font-mono text-[10px]">Exec:</span>
              <span className="capitalize text-[var(--muted)]">{config.executionProvider || 'gemini'}</span>
            </span>
          </span>
        </div>
      </div>

      {/* Status indicator */}
      <div className="hidden md:flex items-center gap-2 text-xs text-[var(--muted)]">
        <span
          className={`w-2 h-2 rounded-full transition-colors ${
            status === 'connected'
              ? 'bg-[var(--add)] ring-2 ring-[var(--add)]/20'
              : status === 'testing'
              ? 'bg-[var(--accent)] animate-pulse'
              : 'bg-[var(--rem)]'
          }`}
        />
        <span className="capitalize">{statusText}</span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        {/* Theme toggle button */}
        <button
          id="btnThemeToggle"
          onClick={onToggleTheme}
          className="w-8 h-8 rounded-lg border border-[var(--border)] hover:border-[var(--muted)] flex items-center justify-center text-[var(--muted)] hover:text-[var(--text)] bg-transparent transition-colors cursor-pointer"
          title={theme === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
          aria-label={theme === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
        >
          {theme === 'dark' ? (
            <Sun className="w-4 h-4 text-[var(--accent)]" />
          ) : (
            <Moon className="w-4 h-4 text-[var(--accent)]" />
          )}
        </button>

        <button
          id="btnTemplates"
          onClick={onOpenTemplates}
          className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-[var(--muted)] hover:text-[var(--text)] border border-[var(--border)] hover:border-[var(--muted)] rounded-lg bg-transparent transition-colors cursor-pointer"
          title="Exemplos de código para testar"
        >
          <Code2 className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Exemplos</span>
        </button>

        <button
          id="btnCopy"
          onClick={handleCopy}
          className="w-8 h-8 rounded-lg border border-[var(--border)] hover:border-[var(--muted)] flex items-center justify-center text-[var(--muted)] hover:text-[var(--text)] bg-transparent transition-colors cursor-pointer"
          title="Copiar código atual"
        >
          {copied ? <Check className="w-4 h-4 text-[var(--add)]" /> : <Copy className="w-4 h-4" />}
        </button>

        <button
          id="btnDownload"
          onClick={onDownload}
          className="w-8 h-8 rounded-lg border border-[var(--border)] hover:border-[var(--muted)] flex items-center justify-center text-[var(--muted)] hover:text-[var(--text)] bg-transparent transition-colors cursor-pointer"
          title="Baixar arquivo de código individual"
        >
          <Download className="w-4 h-4" />
        </button>

        <div className="flex items-center border border-[var(--border)] rounded-lg overflow-hidden">
          <button
            id="btnUndo"
            onClick={onUndo}
            disabled={!canUndo}
            className="w-8 h-8 flex items-center justify-center text-[var(--muted)] hover:text-[var(--text)] disabled:opacity-30 disabled:cursor-not-allowed bg-transparent transition-colors cursor-pointer"
            title="Desfazer alteração"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <div className="w-[1px] h-4 bg-[var(--border)]" />
          <button
            id="btnRedo"
            onClick={onRedo}
            disabled={!canRedo}
            className="w-8 h-8 flex items-center justify-center text-[var(--muted)] hover:text-[var(--text)] disabled:opacity-30 disabled:cursor-not-allowed bg-transparent transition-colors cursor-pointer"
            title="Refazer alteração"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>
        </div>

        <button
          id="btnSettings"
          onClick={onOpenSettings}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[var(--text)] bg-[var(--panel-2)] hover:bg-[var(--border)] border border-[var(--border)] rounded-lg transition-colors cursor-pointer"
          title="Configurações de conexão da IA"
        >
          <Settings className="w-3.5 h-3.5 text-[var(--accent)]" />
          <span>Conexão</span>
        </button>
      </div>
    </header>
  );
};
