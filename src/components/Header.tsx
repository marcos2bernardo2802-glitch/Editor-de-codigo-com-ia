import React, { useState, useRef } from 'react';
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
  FolderUp,
  Save,
  HardDrive,
  FolderCheck,
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
  onImportZip?: (file: File) => void;
  onOpenSettings: () => void;
  onOpenTemplates: () => void;
  localFolderConnected?: boolean;
  localFolderName?: string | null;
  saveMode?: 'auto' | 'manual';
  isSavingLocal?: boolean;
  onSaveLocalFolder?: () => void;
  onOpenLocalFolderSettings?: () => void;
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
  onImportZip,
  onOpenSettings,
  onOpenTemplates,
  localFolderConnected = false,
  localFolderName = null,
  saveMode = 'manual',
  isSavingLocal = false,
  onSaveLocalFolder,
  onOpenLocalFolderSettings,
}) => {
  const [copied, setCopied] = useState(false);
  const zipInputRef = useRef<HTMLInputElement>(null);

  const handleCopy = () => {
    onCopy();
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleZipFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onImportZip) {
      onImportZip(file);
    }
    e.target.value = '';
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

      {/* Status indicator & Local folder indicator */}
      <div className="hidden md:flex items-center gap-2 text-xs">
        <div className="flex items-center gap-2 text-[var(--muted)]">
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

        {/* Local folder subtle status badge */}
        {onOpenLocalFolderSettings && (
          <button
            id="btnHeaderLocalFolderStatus"
            type="button"
            onClick={onOpenLocalFolderSettings}
            className={`flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-full border transition-all cursor-pointer ${
              localFolderConnected
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
                : 'border-[var(--border)] bg-[var(--panel-2)]/60 text-[var(--muted)] hover:text-[var(--text)]'
            }`}
            title={
              localFolderConnected
                ? `Pasta local: ${localFolderName} (${saveMode === 'auto' ? 'Autosave ligado' : 'Salvar manual'}) — clique para abrir configurações`
                : 'Armazenamento em memória (sem pasta local conectada) — clique para conectar pasta'
            }
          >
            {localFolderConnected ? (
              <>
                <FolderCheck className="w-3 h-3 text-emerald-400 shrink-0" />
                <span className="max-w-[100px] truncate font-medium">{localFolderName}</span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
              </>
            ) : (
              <>
                <HardDrive className="w-3 h-3 text-[var(--muted)] shrink-0" />
                <span className="hidden lg:inline text-[10px]">Em memória</span>
              </>
            )}
          </button>
        )}
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

        {/* Download single active file */}
        <button
          id="btnDownload"
          onClick={onDownload}
          className="w-8 h-8 rounded-lg border border-[var(--border)] hover:border-[var(--muted)] flex items-center justify-center text-[var(--muted)] hover:text-[var(--text)] bg-transparent transition-colors cursor-pointer"
          title="Baixar arquivo de código individual"
        >
          <Download className="w-4 h-4" />
        </button>

        {/* Hidden Zip file input */}
        <input
          ref={zipInputRef}
          type="file"
          accept=".zip"
          onChange={handleZipFileChange}
          className="hidden"
        />

        {/* Import ZIP Button */}
        {onImportZip && (
          <button
            id="btnImportZip"
            type="button"
            onClick={() => zipInputRef.current?.click()}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-[var(--muted)] hover:text-[var(--text)] border border-[var(--border)] hover:border-[var(--muted)] rounded-lg bg-transparent transition-colors cursor-pointer"
            title="Importar projeto (.zip)"
          >
            <FolderUp className="w-3.5 h-3.5 text-[var(--accent)]" />
            <span className="hidden lg:inline">Importar .zip</span>
          </button>
        )}

        {/* Export ZIP Button */}
        {onExportZip && (
          <button
            id="btnExportZip"
            type="button"
            onClick={onExportZip}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-[var(--muted)] hover:text-[var(--text)] border border-[var(--border)] hover:border-[var(--muted)] rounded-lg bg-transparent transition-colors cursor-pointer"
            title="Exportar projeto completo em .zip"
          >
            <FolderDown className="w-3.5 h-3.5 text-[var(--accent)]" />
            <span className="hidden lg:inline">Exportar .zip</span>
          </button>
        )}

        {/* Local Folder Save Button (Manual Mode) */}
        {localFolderConnected && saveMode === 'manual' && onSaveLocalFolder && (
          <button
            id="btnSaveLocalFolder"
            type="button"
            onClick={onSaveLocalFolder}
            disabled={isSavingLocal}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 border border-emerald-500/60 rounded-lg transition-colors cursor-pointer shadow-xs disabled:opacity-50"
            title="Salvar alterações no disco local (Ctrl+S / Cmd+S)"
          >
            <Save className={`w-3.5 h-3.5 ${isSavingLocal ? 'animate-bounce' : ''}`} />
            <span>{isSavingLocal ? 'Salvando...' : 'Salvar disco'}</span>
          </button>
        )}

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
