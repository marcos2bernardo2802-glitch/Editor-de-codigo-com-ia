import React, { useMemo, useState } from 'react';
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
  Trash2,
  WrapText,
  Type,
  Eye,
  Code2,
  Columns,
  Scissors,
  FolderTree,
  FileCode,
  ShieldAlert,
  ShieldCheck,
  Wand2,
  History,
} from 'lucide-react';
import { LivePreviewPane } from './LivePreviewPane';
import { FileTabBar } from './FileTabBar';
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
  onAddFile: (name: string, language: SupportedLanguage, initialContent?: string) => void;
  onDeleteFile: (fileId: string) => void;
  onRenameFile: (fileId: string, newName: string) => void;

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
  // Toggle diagnostics bar visibility
  const [showDiagnostics, setShowDiagnostics] = useState<boolean>(true);

  // Run real-time syntax diagnostics
  const diagnostics = useMemo(() => {
    return diagnoseCode(code, language);
  }, [code, language]);

  const errorCount = useMemo(
    () => diagnostics.filter((d) => d.severity === 'error').length,
    [diagnostics]
  );
  const warningCount = useMemo(
    () => diagnostics.filter((d) => d.severity === 'warning').length,
    [diagnostics]
  );

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
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 sm:px-4 py-2 border-b border-[var(--border)] bg-[var(--panel)] shrink-0 select-none">
        {/* Left: View mode tabs & scope switcher */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* View mode switcher */}
          <div className="flex items-center p-0.5 rounded-lg bg-[var(--panel-2)] border border-[var(--border)]">
            <button
              id="tabViewCode"
              onClick={() => onChangeViewMode('code')}
              className={`p-1.5 rounded-md text-xs transition-all cursor-pointer ${
                viewMode === 'code'
                  ? 'bg-[var(--panel)] text-[var(--text)] font-semibold shadow-xs'
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
              className={`p-1.5 rounded-md text-xs transition-all cursor-pointer ${
                viewMode === 'preview'
                  ? 'bg-[var(--panel)] text-[var(--text)] font-semibold shadow-xs'
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
              className={`p-1.5 rounded-md text-xs transition-all cursor-pointer ${
                viewMode === 'split'
                  ? 'bg-[var(--panel)] text-[var(--text)] font-semibold shadow-xs'
                  : 'text-[var(--muted)] hover:text-[var(--text)]'
              }`}
              title="Dividir tela lado a lado (Editor + Preview)"
              aria-label="Dividir tela"
            >
              <Columns className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="h-4 w-[1px] bg-[var(--border)] hidden sm:block" />

          {/* Workspace Mode Selector (Modo Único vs Modo Projeto) */}
          <div className="flex items-center p-0.5 rounded-lg bg-[var(--panel-2)] border border-[var(--border)]">
            <button
              id="btnWorkspaceSingle"
              onClick={() => onChangeWorkspaceMode('single')}
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-colors cursor-pointer ${
                workspaceMode === 'single'
                  ? 'bg-[var(--panel)] text-[var(--text)] font-semibold shadow-xs'
                  : 'text-[var(--muted)] hover:text-[var(--text)]'
              }`}
              title="Modo padrão: editar um arquivo único"
            >
              <FileCode className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Único</span>
            </button>

            <button
              id="btnWorkspaceProject"
              onClick={() => onChangeWorkspaceMode('project')}
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-colors cursor-pointer ${
                workspaceMode === 'project'
                  ? 'bg-[var(--accent)] text-[#1a1206] font-semibold shadow-xs'
                  : 'text-[var(--muted)] hover:text-[var(--text)]'
              }`}
              title="Modo projeto: múltiplos arquivos com abas (HTML + CSS + JS)"
            >
              <FolderTree className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Projeto ({files.length})</span>
            </button>
          </div>

          {/* Diagnostics Status Indicator (Sugestão 4: Diagnóstico de Erros) */}
          <button
            id="btnToggleDiagnostics"
            onClick={() => setShowDiagnostics(!showDiagnostics)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-medium transition-all cursor-pointer ${
              diagnostics.length > 0
                ? errorCount > 0
                  ? 'bg-[var(--rem-bg)] border-[var(--rem)]/50 text-[var(--rem)] shadow-2xs font-semibold'
                  : 'bg-[var(--accent)]/15 border-[var(--accent)]/50 text-[var(--accent)]'
                : 'bg-[var(--panel-2)] border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]'
            }`}
            title={
              diagnostics.length > 0
                ? `${diagnostics.length} problema(s) detectado(s) no código (${errorCount} erro(s), ${warningCount} aviso(s)). Clique para expandir.`
                : 'Código analisado: nenhum erro de sintaxe detectado.'
            }
          >
            {diagnostics.length > 0 ? (
              errorCount > 0 ? (
                <ShieldAlert className="w-3.5 h-3.5 text-[var(--rem)] shrink-0 animate-pulse" />
              ) : (
                <ShieldAlert className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
              )
            ) : (
              <ShieldCheck className="w-3.5 h-3.5 text-[var(--add)] shrink-0" />
            )}
            <span className="inline">
              {diagnostics.length === 0
                ? 'Sem erros'
                : errorCount > 0
                ? `${errorCount} ${errorCount === 1 ? 'erro' : 'erros'}`
                : `${warningCount} ${warningCount === 1 ? 'aviso' : 'avisos'}`}
            </span>
          </button>
        </div>

        {/* Right: Code controls */}
        <div className="flex items-center gap-1.5 sm:gap-2 ml-auto">
          {/* Stats info */}
          <span className="hidden xl:inline text-[11px] font-mono text-[var(--muted)]/70">
            {lineCount} {lineCount === 1 ? 'lin' : 'lins'} • {charCount} chars
          </span>

          {/* Font size control */}
          <div className="hidden sm:flex items-center gap-1 text-[11px] text-[var(--muted)]">
            <Type className="w-3 h-3 text-[var(--muted)]" />
            <select
              value={fontSize}
              onChange={(e) => onChangeFontSize(Number(e.target.value))}
              className="bg-[var(--panel-2)] text-[var(--text)] border border-[var(--border)] rounded px-1.5 py-0.5 text-xs focus:outline-none focus:border-[var(--accent)] cursor-pointer"
              title="Tamanho da fonte"
            >
              <option value={12}>12px</option>
              <option value={13}>13px</option>
              <option value={14}>14px</option>
              <option value={16}>16px</option>
            </select>
          </div>

          {/* Language selector (only in single mode; in project mode, language is per-file tab) */}
          {workspaceMode === 'single' && (
            <select
              id="selectLanguage"
              value={language}
              onChange={(e) => onChangeLanguage(e.target.value as SupportedLanguage)}
              className="bg-[var(--panel-2)] text-[var(--text)] border border-[var(--border)] rounded-md px-2 py-1 text-xs focus:outline-none focus:border-[var(--accent)] cursor-pointer font-medium"
              title="Linguagem do código atual"
            >
              <option value="html">HTML</option>
              <option value="javascript">JavaScript</option>
              <option value="typescript">TypeScript</option>
              <option value="css">CSS</option>
              <option value="python">Python</option>
              <option value="json">JSON</option>
            </select>
          )}

          {/* Format Code */}
          {onFormatCode && (
            <button
              id="btnFormatCode"
              onClick={onFormatCode}
              className="flex items-center gap-1 px-2 py-1 rounded-md border border-[var(--border)] bg-[var(--panel-2)] text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--muted)] text-xs font-medium transition-colors cursor-pointer"
              title="Formatar e identar código automaticamente (2 espaços)"
            >
              <Wand2 className="w-3.5 h-3.5 text-[var(--accent)]" />
              <span className="hidden xl:inline">Formatar</span>
            </button>
          )}

          {/* Version History Checkpoints */}
          {onOpenVersionHistory && (
            <button
              id="btnVersionHistory"
              onClick={onOpenVersionHistory}
              className="flex items-center gap-1 px-2 py-1 rounded-md border border-[var(--border)] bg-[var(--panel-2)] text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--muted)] text-xs font-medium transition-colors cursor-pointer"
              title="Linha do tempo de versões e restauração"
            >
              <History className="w-3.5 h-3.5 text-[var(--accent)]" />
              <span className="hidden xl:inline">Versões</span>
              {checkpointCount > 0 && (
                <span className="text-[10px] bg-[var(--panel)] px-1 rounded-full text-[var(--text)] font-semibold border border-[var(--border)]">
                  {checkpointCount}
                </span>
              )}
            </button>
          )}

          {/* Toggle Wrap */}
          <button
            id="btnToggleWrap"
            onClick={onToggleLineWrapping}
            className={`p-1.5 rounded-md border transition-colors cursor-pointer ${
              lineWrapping
                ? 'bg-[var(--panel-2)] border-[var(--accent)] text-[var(--accent)]'
                : 'border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]'
            }`}
            title="Quebra automática de linha"
          >
            <WrapText className="w-3.5 h-3.5" />
          </button>

          {/* Clear code */}
          <button
            id="btnClearCode"
            onClick={onClearCode}
            className="p-1.5 rounded-md border border-[var(--border)] text-[var(--muted)] hover:text-[var(--rem)] hover:border-[var(--rem)] transition-colors cursor-pointer"
            title="Limpar editor"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Multi-file Workspace Tab Bar (only active in 'project' mode) */}
      {workspaceMode === 'project' && (
        <FileTabBar
          files={files}
          activeFileId={activeFileId}
          onSelectFile={onSelectFile}
          onAddFile={onAddFile}
          onDeleteFile={onDeleteFile}
          onRenameFile={onRenameFile}
        />
      )}

      {/* Editor & Preview Split Container */}
      <div className="flex-1 flex flex-col md:flex-row min-h-0 relative">
        {/* Code Editor (rendered in 'code' or 'split' modes) */}
        {(viewMode === 'code' || viewMode === 'split') && (
          <div
            className={`h-full flex flex-col min-h-0 ${
              viewMode === 'split' ? 'w-full md:w-1/2 border-b md:border-b-0 md:border-r border-[var(--border)]' : 'w-full'
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
            className={`h-full overflow-hidden ${
              viewMode === 'split' ? 'w-full md:w-1/2' : 'w-full'
            }`}
          >
            <LivePreviewPane
              code={code}
              language={language}
              projectFiles={workspaceMode === 'project' ? files : undefined}
            />
          </div>
        )}
      </div>
    </section>
  );
};
