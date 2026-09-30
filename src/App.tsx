import React, { useState, useCallback, useRef } from 'react';
import {
  CodeTemplate,
  SupportedLanguage,
  ProjectFile,
  VersionCheckpoint,
} from './types';
import { CODE_TEMPLATES } from './utils/templates';
import { formatCode } from './utils/formatter';
import { exportProjectAsZip } from './utils/exportZip';
import { isFileSystemAccessSupported } from './utils/localFolder';
import { useCheckpoints } from './hooks/useCheckpoints';
import { useLocalFolder } from './hooks/useLocalFolder';
import { useEditorHistory } from './hooks/useEditorHistory';
import { useWorkspaceFiles } from './hooks/useWorkspaceFiles';
import { useAppConfig } from './hooks/useAppConfig';
import { useResizablePanels } from './hooks/useResizablePanels';
import { useMultimodalImages } from './hooks/useMultimodalImages';
import { useAiWorkflow } from './hooks/useAiWorkflow';
import { Header } from './components/Header';
import { CodeEditorPanel } from './components/CodeEditorPanel';
import { SidePanel } from './components/SidePanel';
import { SettingsModal } from './components/SettingsModal';
import { TemplatesModal } from './components/TemplatesModal';
import { VersionHistoryModal } from './components/VersionHistoryModal';
import { ImportConflictModal } from './components/ImportConflictModal';
import { DropzoneOverlay } from './components/DropzoneOverlay';
import { LocalSaveToast } from './components/LocalSaveToast';

export default function App() {
  // Main editor state
  const [code, setCode] = useState<string>(CODE_TEMPLATES[0].code);
  const [language, setLanguage] = useState<SupportedLanguage>('html');

  // Modals
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isTemplatesOpen, setIsTemplatesOpen] = useState<boolean>(false);
  const [isVersionHistoryOpen, setIsVersionHistoryOpen] = useState<boolean>(false);

  // History stack for Undo / Redo
  const { history, historyIndex, setHistoryIndex, pushHistory, resetHistory } =
    useEditorHistory(CODE_TEMPLATES[0].code);

  // Version History Checkpoints
  const { checkpoints, addCheckpoint } = useCheckpoints();

  // Forward refs to connect hooks without circular dependencies
  const markManualEditRef = useRef<() => void>(() => {});
  const setSelectionRef = useRef<React.Dispatch<React.SetStateAction<any>>>(() => {});

  // Workspace and Multi-file state
  const {
    workspaceMode,
    setWorkspaceMode,
    files,
    setFiles,
    activeFileId,
    setActiveFileId,
    activeFile,
    isDraggingOver,
    pendingImportFiles,
    setPendingImportFiles,
    isImportConflictOpen,
    setIsImportConflictOpen,
    handleChangeWorkspaceMode,
    handleSelectFile,
    handleAddFile,
    handleDeleteFile,
    handleRenameFile,
    applyImportedFiles,
    handleImportZip,
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  } = useWorkspaceFiles({
    currentCode: code,
    onActiveFileChange: useCallback(
      (f: ProjectFile) => {
        setCode(f.content);
        setLanguage(f.language);
        resetHistory(f.content);
        setSelectionRef.current(null);
      },
      [resetHistory]
    ),
    onLanguageChange: setLanguage,
    onBeforeManualEdit: () => markManualEditRef.current(),
  });

  // Local folder integration
  const {
    localFolderHandle,
    localFolderName,
    localFolderPermissionNeeded,
    saveMode,
    isSavingLocal,
    localSaveToast,
    settingsDefaultTab,
    setSettingsDefaultTab,
    handleChangeSaveMode,
    handleOpenLocalFolder,
    handleReconnectLocalFolder,
    handleDisconnectLocalFolder,
    handleSaveToLocalFolder,
  } = useLocalFolder({
    files,
    activeFileId,
    code,
    onFilesLoaded: useCallback(
      (loadedFiles: ProjectFile[]) => {
        setFiles(loadedFiles);
        setWorkspaceMode('project');
        const firstFile =
          loadedFiles.find((f) => (f.path || f.name).toLowerCase() === 'index.html') ||
          loadedFiles.find((f) => (f.path || f.name).toLowerCase().endsWith('/index.html')) ||
          loadedFiles.find((f) => f.name.toLowerCase().endsWith('.html') || f.name.toLowerCase().endsWith('.htm')) ||
          loadedFiles[0];
        if (firstFile) {
          setActiveFileId(firstFile.id);
          setCode(firstFile.content);
          setLanguage(firstFile.language);
          resetHistory(firstFile.content);
          setSelectionRef.current(null);
        }
      },
      [setFiles, setWorkspaceMode, setActiveFileId, resetHistory]
    ),
  });

  // Multimodal (Images) state
  const notifyMessageRef = useRef<(msg: any) => void>(() => {});
  const {
    attachedImages,
    setAttachedImages,
    isAnalyzingVision,
    setIsAnalyzingVision,
    handleAddImages,
    handleRemoveImage,
  } = useMultimodalImages({
    onNotifyMessage: (msg) => notifyMessageRef.current(msg),
  });

  // App Configuration & UI preferences
  const interactionModeRef = useRef<'plan' | 'execute'>('plan');
  const {
    config,
    setConfig,
    viewMode,
    setViewMode,
    lineWrapping,
    setLineWrapping,
    fontSize,
    setFontSize,
    showDiagnostics,
    setShowDiagnostics,
    isExplorerOpen,
    setIsExplorerOpen,
    theme,
    handleToggleTheme,
    assistantMode,
    setAssistantMode,
    currentActiveProvider,
    currentActiveModel,
    activeShortModelName,
    activeFullModelInfo,
    handleToggleActiveProvider,
    handleTestConnection,
  } = useAppConfig(interactionModeRef.current);

  // Chat Panel Resizing State (Desktop)
  const {
    chatWidth,
    setChatWidth,
    isDraggingChatWidth,
    mainContainerRef,
    handleStartResizeChat,
    handleResetChatWidth,
  } = useResizablePanels(420, 280, 1200);

  // AI Workflow Engine
  const {
    messages,
    setMessages,
    instruction,
    setInstruction,
    isLoading,
    interactionMode,
    setInteractionMode,
    aiScopeMode,
    setAiScopeMode,
    selection,
    setSelection,
    isDetectingSelectionTarget,
    pendingManualError,
    setPendingManualError,
    status,
    statusText,
    markManualEdit,
    handleCancelInstruction,
    handleSendInstruction,
    handleExplainChange,
    handleRuntimeError,
    handleManualFixRequest,
    handleRequestSelectionMode,
    handleApplyDiff,
    handleApplyPartialDiff,
    handleDiscardDiff,
    handleExplainCode,
    handleAutoFixDiagnostic,
    handleClearChat,
  } = useAiWorkflow({
    code,
    setCode,
    language,
    pushHistory,
    addCheckpoint,
    files,
    setFiles,
    activeFileId,
    activeFile,
    workspaceMode,
    config,
    setConfig,
    assistantMode,
    attachedImages,
    setAttachedImages,
    setIsAnalyzingVision,
    onOpenSettings: () => setIsSettingsOpen(true),
  });

  // Wire up refs
  markManualEditRef.current = markManualEdit;
  setSelectionRef.current = setSelection;
  notifyMessageRef.current = (msg) => setMessages((prev) => [...prev, msg]);
  interactionModeRef.current = interactionMode;

  const handleUndo = () => {
    markManualEdit();
    if (historyIndex > 0) {
      const prevIndex = historyIndex - 1;
      setHistoryIndex(prevIndex);
      const prevCode = history[prevIndex];
      setCode(prevCode);
      setFiles((prev) =>
        prev.map((f) => (f.id === activeFileId ? { ...f, content: prevCode } : f))
      );
    }
  };

  const handleRedo = () => {
    markManualEdit();
    if (historyIndex < history.length - 1) {
      const nextIndex = historyIndex + 1;
      setHistoryIndex(nextIndex);
      const nextCode = history[nextIndex];
      setCode(nextCode);
      setFiles((prev) =>
        prev.map((f) => (f.id === activeFileId ? { ...f, content: nextCode } : f))
      );
    }
  };

  const handleChangeCode = (newVal: string) => {
    markManualEdit();
    setCode(newVal);
    setFiles((prev) =>
      prev.map((f) => (f.id === activeFileId ? { ...f, content: newVal } : f))
    );
  };

  const handleFormatCode = () => {
    markManualEdit();
    const formatted = formatCode(code, language);
    if (formatted !== code) {
      setCode(formatted);
      pushHistory(formatted);
      setFiles((prev) =>
        prev.map((f) => (f.id === activeFileId ? { ...f, content: formatted } : f))
      );
      addCheckpoint({
        description: 'Formatação automática de código',
        code: formatted,
        source: 'format',
        fileId: activeFileId,
        fileName: activeFile?.name,
      });
    }
  };

  const handleExportZip = async () => {
    try {
      await exportProjectAsZip(files, workspaceMode, code, language);
    } catch (err: any) {
      console.error('Erro ao exportar ZIP:', err);
    }
  };

  const handleRestoreCheckpoint = (cp: VersionCheckpoint) => {
    markManualEdit();
    setCode(cp.code);
    pushHistory(cp.code);
    setFiles((prev) =>
      prev.map((f) => (f.id === activeFileId ? { ...f, content: cp.code } : f))
    );
    setSelection(null);
    addCheckpoint({
      description: `Restaurado de: ${cp.description}`,
      code: cp.code,
      source: 'user',
      fileId: activeFileId,
      fileName: activeFile?.name,
    });
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(code);
  };

  const handleDownloadCode = () => {
    const extMap: Record<SupportedLanguage, string> = {
      html: 'html',
      javascript: 'js',
      typescript: 'ts',
      css: 'css',
      python: 'py',
      json: 'json',
      markdown: 'md',
    };
    const extension = extMap[language] || 'txt';
    const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const currentFileName =
      workspaceMode === 'project'
        ? files.find((f) => f.id === activeFileId)?.name || `arquivo.${extension}`
        : `codigo_${Date.now()}.${extension}`;
    a.download = currentFileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleClearCode = () => {
    markManualEdit();
    setCode('');
    pushHistory('');
    setFiles((prev) =>
      prev.map((f) => (f.id === activeFileId ? { ...f, content: '' } : f))
    );
    setSelection(null);
  };

  const handleSelectTemplate = (template: CodeTemplate) => {
    markManualEdit();
    setCode(template.code);
    setLanguage(template.language);
    pushHistory(template.code);
    setFiles((prev) =>
      prev.map((f) =>
        f.id === activeFileId
          ? { ...f, content: template.code, language: template.language }
          : f
      )
    );
    setSelection(null);
  };

  const handleChangeLanguage = (lang: string) => {
    const supportedLang = lang as SupportedLanguage;
    setLanguage(supportedLang);
    setFiles((prev) =>
      prev.map((f) => (f.id === activeFileId ? { ...f, language: supportedLang } : f))
    );
  };

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="relative flex flex-col h-screen w-screen overflow-hidden bg-[var(--bg)] text-[var(--text)]"
    >
      {/* Drag & Drop Visual Overlay */}
      <DropzoneOverlay isVisible={isDraggingOver} />

      {/* Header Bar */}
      <Header
        status={status}
        statusText={statusText}
        config={config}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        canUndo={historyIndex > 0}
        canRedo={historyIndex < history.length - 1}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onCopy={handleCopyCode}
        onDownload={handleDownloadCode}
        onExportZip={handleExportZip}
        onImportZip={handleImportZip}
        onOpenSettings={() => {
          setSettingsDefaultTab('modes');
          setIsSettingsOpen(true);
        }}
        onOpenTemplates={() => setIsTemplatesOpen(true)}
        localFolderConnected={Boolean(localFolderHandle && !localFolderPermissionNeeded)}
        localFolderName={localFolderName}
        saveMode={saveMode}
        isSavingLocal={isSavingLocal}
        onSaveLocalFolder={() => handleSaveToLocalFolder()}
        onOpenLocalFolderSettings={() => {
          setSettingsDefaultTab('localFolder');
          setIsSettingsOpen(true);
        }}
        onOpenVersionHistory={() => setIsVersionHistoryOpen(true)}
        checkpointCount={checkpoints.length}
        onFormatCode={handleFormatCode}
        onClearCode={handleClearCode}
        language={language}
        onChangeLanguage={handleChangeLanguage}
        lineWrapping={lineWrapping}
        onToggleLineWrapping={() => setLineWrapping(!lineWrapping)}
        fontSize={fontSize}
        onChangeFontSize={setFontSize}
        isExplorerOpen={isExplorerOpen}
        onToggleExplorer={() => setIsExplorerOpen(!isExplorerOpen)}
        showDiagnostics={showDiagnostics}
        onToggleDiagnostics={() => setShowDiagnostics(!showDiagnostics)}
        viewMode={viewMode}
        onChangeViewMode={(mode) => setViewMode(mode)}
        assistantMode={assistantMode}
        onChangeAssistantMode={setAssistantMode}
      />

      {/* Main Content Area (Split layout) */}
      <main ref={mainContainerRef} className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden relative">
        {/* Left / Center: Code Editor & In-Window Visualizer */}
        <CodeEditorPanel
          code={code}
          language={language}
          theme={theme}
          viewMode={viewMode}
          onChangeViewMode={(mode) => setViewMode(mode)}
          onChangeLanguage={handleChangeLanguage}
          onChangeCode={handleChangeCode}
          onClearCode={handleClearCode}
          lineWrapping={lineWrapping}
          onToggleLineWrapping={() => setLineWrapping(!lineWrapping)}
          fontSize={fontSize}
          onChangeFontSize={setFontSize}
          showDiagnostics={showDiagnostics}
          onToggleDiagnostics={() => setShowDiagnostics(!showDiagnostics)}
          isExplorerOpen={isExplorerOpen}
          onToggleExplorer={() => setIsExplorerOpen(!isExplorerOpen)}
          // Selection & AI Scope
          selection={selection}
          onSelectionChange={setSelection}
          aiScopeMode={aiScopeMode}
          // Multi-file Workspace
          workspaceMode={workspaceMode}
          onChangeWorkspaceMode={handleChangeWorkspaceMode}
          files={files}
          activeFileId={activeFileId}
          onSelectFile={handleSelectFile}
          onAddFile={handleAddFile}
          onDeleteFile={handleDeleteFile}
          onRenameFile={handleRenameFile}
          // Diagnóstico e Auto-Fix
          onAutoFixDiagnostic={handleAutoFixDiagnostic}
          isLoading={isLoading}
          // Formatação e Histórico de Versões
          onFormatCode={handleFormatCode}
          onOpenVersionHistory={() => setIsVersionHistoryOpen(true)}
          checkpointCount={checkpoints.length}
          // Desfazer / Refazer
          canUndo={historyIndex > 0}
          canRedo={historyIndex < history.length - 1}
          onUndo={handleUndo}
          onRedo={handleRedo}
          // Modo Básico: Autocorreção de erro em tempo de execução
          onRuntimeError={handleRuntimeError}
          pendingFixError={pendingManualError}
          onRequestFix={handleManualFixRequest}
          onDismissFix={() => setPendingManualError(null)}
        />

        {/* Draggable Divider between Code Editor and AI Chat (Desktop) */}
        <div
          role="separator"
          tabIndex={0}
          aria-orientation="vertical"
          aria-label="Ajustar divisão entre código e chat com IA"
          aria-valuenow={chatWidth}
          onMouseDown={handleStartResizeChat}
          onDoubleClick={handleResetChatWidth}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft') {
              e.preventDefault();
              setChatWidth((prev) =>
                Math.min(
                  prev + 20,
                  (mainContainerRef.current?.getBoundingClientRect().width || 1000) - 320
                )
              );
            } else if (e.key === 'ArrowRight') {
              e.preventDefault();
              setChatWidth((prev) => Math.max(prev - 20, 280));
            } else if (e.key === 'Home' || e.key === 'Enter') {
              e.preventDefault();
              handleResetChatWidth();
            }
          }}
          className={`hidden md:flex flex-col items-center justify-center w-2 z-20 cursor-col-resize select-none shrink-0 group transition-colors relative bg-[var(--panel-2)]/40 hover:bg-[var(--accent)]/25 ${
            isDraggingChatWidth ? 'bg-[var(--accent)]/35' : ''
          }`}
          title="Arraste para regular o tamanho dos dois campos (Duplo clique para redefinir)"
        >
          <div className="absolute inset-y-0 inset-x-0 z-10" />
          <div
            className={`w-1 rounded-full transition-all duration-150 z-20 ${
              isDraggingChatWidth
                ? 'h-14 bg-[var(--accent)] shadow-sm'
                : 'h-8 bg-[var(--muted)]/50 group-hover:h-12 group-hover:bg-[var(--accent)]'
            }`}
          />
        </div>

        {/* Right: AI Commands & Diff Chat */}
        <SidePanel
          width={chatWidth}
          messages={messages}
          instruction={instruction}
          isLoading={isLoading}
          onChangeInstruction={setInstruction}
          onSend={handleSendInstruction}
          onClearChat={handleClearChat}
          onApplyDiff={handleApplyDiff}
          onApplyPartialDiff={handleApplyPartialDiff}
          onDiscardDiff={handleDiscardDiff}
          onSelectQuickPrompt={(p) => setInstruction(p)}
          currentCode={code}
          status={status}
          statusText={statusText}
          // Multimodal (Images)
          attachedImages={attachedImages}
          onAddImages={handleAddImages}
          onRemoveImage={handleRemoveImage}
          isAnalyzingVision={isAnalyzingVision}
          // Mode (Planejamento vs Execução)
          interactionMode={interactionMode}
          onChangeInteractionMode={setInteractionMode}
          activeProvider={currentActiveProvider}
          onToggleActiveProvider={handleToggleActiveProvider}
          onOpenSettings={() => setIsSettingsOpen(true)}
          activeShortModelName={activeShortModelName}
          activeFullModelInfo={activeFullModelInfo}
          // AI Scope & Selection
          aiScopeMode={aiScopeMode}
          onChangeAiScopeMode={setAiScopeMode}
          onRequestSelectionMode={handleRequestSelectionMode}
          isDetectingSelectionTarget={isDetectingSelectionTarget}
          selection={selection}
          onClearSelection={() => setSelection(null)}
          onExplainCode={handleExplainCode}
          onCancelInstruction={handleCancelInstruction}
          assistantMode={assistantMode}
          onExplainChange={handleExplainChange}
          explainingMsgId={null}
        />
      </main>

      {/* Global Transparent Overlay during drag to prevent iframe event interception */}
      {isDraggingChatWidth && (
        <div
          className="fixed inset-0 z-[9999] cursor-col-resize select-none"
          style={{ userSelect: 'none' }}
        />
      )}

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        config={config}
        onClose={() => setIsSettingsOpen(false)}
        onSave={(newCfg) => setConfig(newCfg)}
        onTestConnection={handleTestConnection}
        localFolderSupported={isFileSystemAccessSupported()}
        localFolderName={localFolderName}
        localFolderPermissionNeeded={localFolderPermissionNeeded}
        saveMode={saveMode}
        onOpenLocalFolder={handleOpenLocalFolder}
        onReconnectLocalFolder={handleReconnectLocalFolder}
        onDisconnectLocalFolder={handleDisconnectLocalFolder}
        onChangeSaveMode={handleChangeSaveMode}
        defaultTab={settingsDefaultTab}
      />

      {/* Code Templates Modal */}
      <TemplatesModal
        isOpen={isTemplatesOpen}
        onClose={() => setIsTemplatesOpen(false)}
        onSelectTemplate={handleSelectTemplate}
      />

      {/* Version History Checkpoints Modal */}
      <VersionHistoryModal
        isOpen={isVersionHistoryOpen}
        onClose={() => setIsVersionHistoryOpen(false)}
        checkpoints={checkpoints}
        onRestoreCheckpoint={handleRestoreCheckpoint}
        activeFileName={
          workspaceMode === 'project'
            ? files.find((f) => f.id === activeFileId)?.name
            : `arquivo.${language}`
        }
      />

      {/* Import Conflict Resolution Modal */}
      {isImportConflictOpen && pendingImportFiles && (
        <ImportConflictModal
          isOpen={isImportConflictOpen}
          incomingFiles={pendingImportFiles}
          existingFiles={files}
          onReplace={() => applyImportedFiles(pendingImportFiles, 'replace')}
          onMerge={() => applyImportedFiles(pendingImportFiles, 'merge')}
          onCancel={() => {
            setIsImportConflictOpen(false);
            setPendingImportFiles(null);
          }}
        />
      )}

      {/* Local Folder Toast Feedback */}
      <LocalSaveToast toast={localSaveToast} />
    </div>
  );
}
