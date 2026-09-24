import React, { useMemo, useState, useEffect } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { EditorView } from '@codemirror/view';
import { javascript } from '@codemirror/lang-javascript';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { python } from '@codemirror/lang-python';
import { oneDark } from '@codemirror/theme-one-dark';
import { githubLight } from '@uiw/codemirror-theme-github';
import {
  SupportedLanguage,
  ThemeMode,
  EditorViewMode,
  AIScopeMode,
  SelectionRange,
  WorkspaceMode,
  ProjectFile,
  DiagnosticItem,
} from '../types';
import {
  Scissors,
  FolderTree,
  FileCode,
  Code2,
  Eye,
  Columns,
} from 'lucide-react';
import { LivePreviewPane } from './LivePreviewPane';
import { FileTabBar } from './FileTabBar';
import { FileTreeExplorer } from './FileTreeExplorer';
import { DiagnosticsBar } from './DiagnosticsBar';
import { diagnoseCode } from '../utils/diagnostics';

interface CodeEditorPanelProps {
  code: string;
  language: SupportedLanguage;
  theme: ThemeMode;
  viewMode: EditorViewMode;
  onChangeViewMode: (mode: EditorViewMode) => void;
  onChangeLanguage: (lang: SupportedLanguage) => void;
  onChangeCode: (code: string) => void;
  onClearCode: () => void;
  lineWrapping: boolean;
  onToggleLineWrapping: () => void;
  fontSize: number;
  onChangeFontSize: (size: number) => void;

  // Diagnostics & Explorer visibility
  showDiagnostics: boolean;
  onToggleDiagnostics: () => void;
  isExplorerOpen: boolean;
  onToggleExplorer: () => void;

  // Selection & AI Scope
  selection: SelectionRange | null;
  onSelectionChange: (sel: SelectionRange | null) => void;
  aiScopeMode: AIScopeMode;

  // Multi-file Workspace
  workspaceMode: WorkspaceMode;
  onChangeWorkspaceMode: (mode: WorkspaceMode) => void;
  files: ProjectFile[];
  activeFileId: string;
  onSelectFile: (fileId: string) => void;
  onAddFile: (pathOrName: string, language: SupportedLanguage, initialContent?: string) => void;
  onDeleteFile: (fileId: string) => void;
  onRenameFile: (fileId: string, newPathOrName: string) => void;

  // Diagnostics & Auto-Fix
  onAutoFixDiagnostic?: (diagnostic: DiagnosticItem | DiagnosticItem[]) => void;
  isLoading?: boolean;

  // Sugestões Extras: Formatação e Histórico de Versões
  onFormatCode?: () => void;
  onOpenVersionHistory?: () => void;
  checkpointCount?: number;
}

export const CodeEditorPanel: React.FC<CodeEditorPanelProps> = ({
  code,
  language,
  theme,
  viewMode,
  onChangeViewMode,
  onChangeLanguage,
  onChangeCode,
  onClearCode,
  lineWrapping,
  onToggleLineWrapping,
  fontSize,
  onChangeFontSize,
  showDiagnostics,
  onToggleDiagnostics,
  isExplorerOpen,
  onToggleExplorer,
  selection,
  onSelectionChange,
  aiScopeMode,
  workspaceMode,
  onChangeWorkspaceMode,
  files,
  activeFileId,
  onSelectFile,
  onAddFile,
  onDeleteFile,
  onRenameFile,
  onAutoFixDiagnostic,
  isLoading = false,
  onFormatCode,
  onOpenVersionHistory,
  checkpointCount = 0,
}) => {
  // Atalho de teclado Ctrl+B / Cmd+B para alternar a árvore de arquivos no modo projeto
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        if (workspaceMode === 'project') {
          e.preventDefault();
          onToggleExplorer();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [workspaceMode, onToggleExplorer]);

  // Run real-time syntax diagnostics
  const diagnostics = useMemo(() => {
    return diagnoseCode(code, language);
  }, [code, language]);

  // Selection listener extension for CodeMirror
  const selectionListener = useMemo(() => {
    return EditorView.updateListener.of((update) => {
      if (update.selectionSet || update.docChanged) {
        const main = update.state.selection.main;
        if (!main.empty) {
          const text = update.state.sliceDoc(main.from, main.to);
          const fromLine = update.state.doc.lineAt(main.from).number;
          const toLine = update.state.doc.lineAt(main.to).number;
          onSelectionChange({
            from: main.from,
            to: main.to,
            text,
            fromLine,
            toLine,
          });
        } else {
          onSelectionChange(null);
        }
      }
    });
  }, [onSelectionChange]);

  // CodeMirror language extension
  const extensions = useMemo(() => {
    const list = [selectionListener];
    switch (language) {
      case 'html':
        list.push(html());
        break;
      case 'javascript':
        list.push(javascript({ jsx: true }));
        break;
      case 'typescript':
        list.push(javascript({ jsx: true, typescript: true }));
        break;
      case 'css':
        list.push(css());
        break;
      case 'python':
        list.push(python());
        break;
      case 'json':
        list.push(javascript());
        break;
      case 'markdown':
        list.push(html());
        break;
      default:
        list.push(html());
    }
    return list;
  }, [language, selectionListener]);

  const lineCount = useMemo(() => code.split('\n').length, [code]);
  const charCount = code.length;

  return (
    <section className="flex-1 min-w-0 flex flex-col border-r border-[var(--border)] bg-[var(--bg)] h-full overflow-hidden">
      {/* Editor Sub-header */}
      <div className="flex items-center justify-between gap-2 px-3 sm:px-4 py-2 border-b border-[var(--border)] bg-[var(--panel)] shrink-0 select-none">
        {/* Left: View Mode Switcher & Workspace Mode Selector */}
        <div className="flex items-center gap-2">
          {/* View mode switcher (Apenas os ícones) */}
          <div className="flex items-center p-0.5 rounded-md bg-[var(--panel-2)] border border-[var(--border)]">
            <button
              id="tabViewCode"
              onClick={() => onChangeViewMode('code')}
              className={`p-1 rounded text-xs transition-all cursor-pointer ${
                viewMode === 'code'
                  ? 'bg-[var(--panel)] text-[var(--accent)] font-semibold shadow-xs'
                  : 'text-[var(--muted)] hover:text-[var(--text)]'
              }`}
              title="Código (Exibir apenas editor)"
              aria-label="Código"
            >
              <Code2 className="w-3.5 h-3.5" />
            </button>

            <button
              id="tabViewPreview"
              onClick={() => onChangeViewMode('preview')}
              className={`p-1 rounded text-xs transition-all cursor-pointer ${
                viewMode === 'preview'
                  ? 'bg-[var(--panel)] text-[var(--accent)] font-semibold shadow-xs'
                  : 'text-[var(--muted)] hover:text-[var(--text)]'
              }`}
              title="Visualizador (Exibir apenas preview renderizado)"
              aria-label="Visualizador"
            >
              <Eye className="w-3.5 h-3.5" />
            </button>

            <button
              id="tabViewSplit"
              onClick={() => onChangeViewMode('split')}
              className={`p-1 rounded text-xs transition-all cursor-pointer ${
                viewMode === 'split'
                  ? 'bg-[var(--panel)] text-[var(--accent)] font-semibold shadow-xs'
                  : 'text-[var(--muted)] hover:text-[var(--text)]'
              }`}
              title="Dividir tela lado a lado (Editor + Preview)"
              aria-label="Dividir tela"
            >
              <Columns className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="h-3.5 w-[1px] bg-[var(--border)] hidden sm:block" />

          {/* Workspace Mode Selector (Modo Único vs Modo Projeto) */}
          <div className="flex items-center p-0.5 rounded-md bg-[var(--panel-2)] border border-[var(--border)]">
            <button
              id="btnWorkspaceSingle"
              onClick={() => onChangeWorkspaceMode('single')}
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10.5px] transition-colors cursor-pointer ${
                workspaceMode === 'single'
                  ? 'bg-[var(--panel)] text-[var(--text)] font-semibold shadow-xs'
                  : 'text-[var(--muted)] hover:text-[var(--text)]'
              }`}
              title="Modo padrão: editar um arquivo único"
            >
              <FileCode className="w-3 h-3" />
              <span className="hidden sm:inline">Único</span>
            </button>

            <button
              id="btnWorkspaceProject"
              onClick={() => onChangeWorkspaceMode('project')}
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10.5px] transition-colors cursor-pointer ${
                workspaceMode === 'project'
                  ? 'bg-[var(--accent)] text-[#1a1206] font-semibold shadow-xs'
                  : 'text-[var(--muted)] hover:text-[var(--text)]'
              }`}
              title="Modo projeto: múltiplos arquivos com abas (HTML + CSS + JS)"
            >
              <FolderTree className="w-3 h-3" />
              <span className="hidden sm:inline">Projeto ({files.length})</span>
            </button>
          </div>
        </div>

        {/* Right: Code stats info */}
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-[11px] font-mono text-[var(--muted)]/80">
            {lineCount} {lineCount === 1 ? 'linha' : 'linhas'} • {charCount} chars
          </span>
        </div>
      </div>

      {/* Workspace Area: Explorer (left) + TabBar & Editor/Preview (right) */}
      <div className="flex-1 flex min-h-0 relative overflow-hidden">
        {/* File Tree Explorer (only in 'project' mode) */}
        {workspaceMode === 'project' && (
          <FileTreeExplorer
            files={files}
            activeFileId={activeFileId}
            onSelectFile={onSelectFile}
            onAddFile={onAddFile}
            onDeleteFile={onDeleteFile}
            onRenameFile={onRenameFile}
            isOpen={isExplorerOpen}
            onToggleOpen={onToggleExplorer}
          />
        )}

        {/* Central Workspace: Tab Bar and Editor/Preview Split */}
        <div className="flex-1 min-w-0 flex flex-col h-full overflow-hidden">
          {/* Multi-file Workspace Tab Bar (only active in 'project' mode) */}
          {workspaceMode === 'project' && (
            <FileTabBar
              files={files}
              activeFileId={activeFileId}
              onSelectFile={onSelectFile}
              onAddFile={onAddFile}
              onDeleteFile={onDeleteFile}
              onRenameFile={onRenameFile}
              isExplorerOpen={isExplorerOpen}
              onToggleExplorer={onToggleExplorer}
            />
          )}

          {/* Editor & Preview Split Container */}
          <div className="flex-1 flex flex-col md:flex-row min-h-0 relative overflow-hidden">
            {/* Code Editor (rendered in 'code' or 'split' modes) */}
            {(viewMode === 'code' || viewMode === 'split') && (
              <div
                className={`flex flex-col min-h-0 overflow-hidden ${
                  viewMode === 'split'
                    ? 'w-full h-1/2 md:h-full md:w-1/2 border-b md:border-b-0 md:border-r border-[var(--border)]'
                    : 'w-full h-full'
                }`}
                style={{ fontSize: `${fontSize}px` }}
              >
                {/* Selection notification banner when in selection mode */}
                {aiScopeMode === 'selection' && (
                  <div className="px-3 py-1.5 bg-[var(--accent)]/10 border-b border-[var(--accent)]/30 flex items-center justify-between text-xs text-[var(--text)] shrink-0 select-none">
                    <div className="flex items-center gap-1.5 font-sans">
                      <Scissors className="w-3.5 h-3.5 text-[var(--accent)]" />
                      {selection ? (
                        <span>
                          Trecho ativo: <strong className="font-mono text-[var(--accent)]">Linhas {selection.fromLine}–{selection.toLine}</strong> ({selection.text.length} caracteres)
                        </span>
                      ) : (
                        <span className="text-[var(--muted)]">
                          Selecione com o mouse o bloco de código que deseja editar com a IA.
                        </span>
                      )}
                    </div>
                    {selection && (
                      <button
                        onClick={() => onSelectionChange(null)}
                        className="text-[10px] text-[var(--muted)] hover:text-[var(--text)] font-sans underline cursor-pointer"
                      >
                        Desmarcar
                      </button>
                    )}
                  </div>
                )}

                <div className="flex-1 min-h-0 overflow-hidden">
                  <CodeMirror
                    value={code}
                    height="100%"
                    theme={theme === 'dark' ? oneDark : githubLight}
                    extensions={extensions}
                    basicSetup={{
                      lineNumbers: true,
                      highlightActiveLineGutter: true,
                      highlightSpecialChars: true,
                      history: true,
                      foldGutter: true,
                      drawSelection: true,
                      dropCursor: true,
                      allowMultipleSelections: true,
                      indentOnInput: true,
                      syntaxHighlighting: true,
                      bracketMatching: true,
                      closeBrackets: true,
                      autocompletion: true,
                      rectangularSelection: true,
                      crosshairCursor: true,
                      highlightActiveLine: true,
                      highlightSelectionMatches: true,
                      closeBracketsKeymap: true,
                      defaultKeymap: true,
                      searchKeymap: true,
                      historyKeymap: true,
                      foldKeymap: true,
                      completionKeymap: true,
                      lintKeymap: true,
                    }}
                    onChange={(val) => onChangeCode(val)}
                    placeholder="// Cole ou digite seu código aqui..."
                    className="h-full w-full [&_.cm-editor]:h-full [&_.cm-scroller]:overflow-auto [&_.cm-gutters]:bg-[var(--panel)] [&_.cm-gutters]:border-r [&_.cm-gutters]:border-[var(--border)]"
                  />
                </div>

                {/* Sugestão 4: Diagnostics Bar & One-Click Auto-Fix */}
                {showDiagnostics && diagnostics.length > 0 && onAutoFixDiagnostic && (
                  <DiagnosticsBar
                    diagnostics={diagnostics}
                    onAutoFix={onAutoFixDiagnostic}
                    isLoading={isLoading}
                  />
                )}
              </div>
            )}

            {/* Live Preview Pane (rendered in 'preview' or 'split' modes) */}
            {(viewMode === 'preview' || viewMode === 'split') && (
              <div
                className={`flex flex-col min-h-0 overflow-hidden ${
                  viewMode === 'split' ? 'w-full h-1/2 md:h-full md:w-1/2' : 'w-full h-full'
                }`}
              >
                <LivePreviewPane
                  code={code}
                  language={language}
                  projectFiles={workspaceMode === 'project' ? files : undefined}
                  activeFileId={activeFileId}
                  onSelectFile={onSelectFile}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
