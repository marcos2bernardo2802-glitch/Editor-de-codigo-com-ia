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
    <header className="flex items-center justify-between px-3 sm:px-4 py-1.5 border-b border-[var(--border)] bg-[var(--panel)] shrink-0 select-none min-h-[40px]">
      {/* Brand & MenuBar alinhados à esquerda */}
      <div className="flex items-center gap-2 sm:gap-2.5">
        <h1 className="text-sm sm:text-base font-bold tracking-tight m-0 inline-flex items-center select-none cursor-default group-genia transition-transform duration-200 hover:scale-105">
          <span className="text-orange-500 dark:text-orange-400 font-extrabold tracking-tight animate-gen-glow">Gen</span>
          <span className="text-sky-500 dark:text-sky-400 font-black tracking-wide ml-0.5 animate-ia-glow">IA</span>
        </h1>

        {/* Separator and Horizontal MenuBar (Arquivo, Editar, Exibir, Seleção, Acessar) */}
        <div className="h-4 w-[1px] bg-[var(--border)] hidden sm:block mx-0.5" />
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

      {/* Ações, Marcadores Plan/Exec e Botões de Ícones alinhados à direita */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        {/* Marcadores: Plan e Exec */}
        <span
          className="hidden md:inline-flex items-center gap-1.5 text-[10.5px] px-2 py-0.5 rounded-full border border-[var(--border)] bg-[var(--panel-2)] text-[var(--muted)]"
          title={`Planejamento: ${config.planningProvider || 'colab'} | Execução: ${config.executionProvider || 'gemini'}`}
        >
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]"></span>
            <span className="text-[var(--text)] font-mono text-[9.5px]">Plan:</span>
            <span className="capitalize text-[var(--muted)]">{config.planningProvider || 'colab'}</span>
          </span>
          <span className="text-[var(--border)]">|</span>
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--add)]"></span>
            <span className="text-[var(--text)] font-mono text-[9.5px]">Exec:</span>
            <span className="capitalize text-[var(--muted)]">{config.executionProvider || 'gemini'}</span>
          </span>
        </span>

        {/* Botão "Em memória" / Pasta local (apenas ícone com legenda ao passar o mouse) */}
        {onOpenLocalFolderSettings && (
          <button
            id="btnHeaderLocalFolderStatus"
            type="button"
            onClick={onOpenLocalFolderSettings}
            className={`p-1.5 rounded-md border transition-all cursor-pointer flex items-center justify-center ${
              localFolderConnected
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
                : 'border-[var(--border)] bg-[var(--panel-2)]/60 text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--panel-2)]'
            }`}
            title={
              localFolderConnected
                ? `Pasta local conectada: ${localFolderName} (${saveMode === 'auto' ? 'Autosave ligado' : 'Salvar manual'}) — clique para abrir configurações`
                : 'Armazenamento em memória (sem pasta local conectada) — clique para conectar pasta'
            }
            aria-label={
              localFolderConnected
                ? `Pasta local: ${localFolderName}`
                : 'Armazenamento em memória'
            }
          >
            {localFolderConnected ? (
              <div className="relative flex items-center justify-center">
                <FolderCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-emerald-400 ring-1 ring-[var(--panel)]" />
              </div>
            ) : (
              <HardDrive className="w-3.5 h-3.5 text-[var(--muted)]" />
            )}
          </button>
        )}

        {/* Botão Exemplos (apenas ícone com legenda ao passar o mouse) */}
        <button
          id="btnTemplates"
          onClick={onOpenTemplates}
          className="p-1.5 text-[var(--muted)] hover:text-[var(--text)] border border-[var(--border)] hover:border-[var(--muted)] rounded-md bg-[var(--panel-2)]/60 hover:bg-[var(--panel-2)] transition-colors cursor-pointer flex items-center justify-center"
          title="Exemplos de código para testar"
          aria-label="Exemplos de código"
        >
          <Code2 className="w-3.5 h-3.5" />
        </button>

        {/* Botão Conexão (apenas ícone com legenda ao passar o mouse) */}
        <button
          id="btnSettings"
          onClick={onOpenSettings}
          className="p-1.5 text-[var(--text)] bg-[var(--panel-2)] hover:bg-[var(--border)] border border-[var(--border)] rounded-md transition-colors cursor-pointer flex items-center justify-center"
          title="Configurações de conexão da IA"
          aria-label="Configurações de conexão da IA"
        >
          <Settings className="w-3.5 h-3.5 text-[var(--accent)]" />
        </button>
      </div>
    </header>
  );
};
