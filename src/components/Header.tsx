import React from 'react';
import {
  Settings,
  Code2,
  HardDrive,
  FolderCheck,
} from 'lucide-react';
import { ConnectionConfig, ThemeMode, EditorViewMode } from '../types';
import { MenuBar } from './MenuBar';

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

  // MenuBar props
  onOpenVersionHistory?: () => void;
  checkpointCount?: number;
  onFormatCode?: () => void;
  onClearCode: () => void;
  language: string;
  onChangeLanguage: (lang: string) => void;

  // MenuBar "Exibir" props
  lineWrapping: boolean;
  onToggleLineWrapping: () => void;
  fontSize: number;
  onChangeFontSize: (size: number) => void;
  isExplorerOpen: boolean;
  onToggleExplorer: () => void;
  showDiagnostics: boolean;
  onToggleDiagnostics: () => void;
  viewMode: EditorViewMode;
  onChangeViewMode: (mode: EditorViewMode) => void;
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
  onOpenVersionHistory,
  checkpointCount = 0,
  onFormatCode,
  onClearCode,
  language,
  onChangeLanguage,
  lineWrapping,
  onToggleLineWrapping,
  fontSize,
  onChangeFontSize,
  isExplorerOpen,
  onToggleExplorer,
  showDiagnostics,
  onToggleDiagnostics,
  viewMode,
  onChangeViewMode,
}) => {
  return (
    <header className="flex items-center justify-between px-5 py-3 border-b border-[var(--border)] bg-[var(--panel)] shrink-0 select-none">
      {/* Brand, Mode & MenuBar */}
      <div className="flex items-center gap-3">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[var(--accent)] to-[var(--accent-dim)] flex items-center justify-center font-mono text-xs font-bold text-[#14161d] shadow-sm">
          IA
        </div>
        <div className="flex items-center gap-2">
          <h1 className="text-sm font-semibold tracking-tight text-[var(--text)] m-0">
            GenIA
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

        {/* Separator and Horizontal MenuBar (Arquivo, Editar, Exibir) */}
        <div className="h-4 w-[1px] bg-[var(--border)] hidden sm:block mx-1" />
        <MenuBar
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={onUndo}
          onRedo={onRedo}
          onCopy={onCopy}
          onDownload={onDownload}
          onExportZip={onExportZip}
          onImportZip={onImportZip}
          onSaveLocalFolder={onSaveLocalFolder}
          onOpenLocalFolderSettings={onOpenLocalFolderSettings}
          onOpenVersionHistory={onOpenVersionHistory}
          checkpointCount={checkpointCount}
          onFormatCode={onFormatCode}
          onClearCode={onClearCode}
          language={language}
          onChangeLanguage={onChangeLanguage}
          theme={theme}
          onToggleTheme={onToggleTheme}
          lineWrapping={lineWrapping}
          onToggleLineWrapping={onToggleLineWrapping}
          fontSize={fontSize}
          onChangeFontSize={onChangeFontSize}
          isExplorerOpen={isExplorerOpen}
          onToggleExplorer={onToggleExplorer}
          showDiagnostics={showDiagnostics}
          onToggleDiagnostics={onToggleDiagnostics}
          viewMode={viewMode}
          onChangeViewMode={onChangeViewMode}
        />
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
