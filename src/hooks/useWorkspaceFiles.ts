import { useState, useRef, useCallback } from 'react';
import { ProjectFile, WorkspaceMode, SupportedLanguage } from '../types';
import {
  DEFAULT_PROJECT_FILES,
  detectLanguageFromName,
  normalizeFilePath,
  extractFileNameFromPath,
} from '../utils/workspace';
import { importProjectFromZip } from '../utils/importZip';
import { processDroppedData } from '../utils/dropHandler';

interface UseWorkspaceFilesOptions {
  currentCode: string;
  onActiveFileChange: (file: ProjectFile) => void;
  onLanguageChange: (lang: SupportedLanguage) => void;
  onBeforeManualEdit?: () => void;
}

export function useWorkspaceFiles({
  currentCode,
  onActiveFileChange,
  onLanguageChange,
  onBeforeManualEdit,
}: UseWorkspaceFilesOptions) {
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('single');
  const [files, setFiles] = useState<ProjectFile[]>(DEFAULT_PROJECT_FILES);
  const [activeFileId, setActiveFileId] = useState<string>('file-index-html');
  const activeFile = files.find((f) => f.id === activeFileId);

  // Drag and Drop & Import state
  const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);
  const [pendingImportFiles, setPendingImportFiles] = useState<ProjectFile[] | null>(null);
  const [isImportConflictOpen, setIsImportConflictOpen] = useState<boolean>(false);
  const dragCounterRef = useRef<number>(0);

  // Switch between Single File mode and Project mode
  const handleChangeWorkspaceMode = (newMode: WorkspaceMode) => {
    setWorkspaceMode(newMode);
    if (newMode === 'project') {
      const current = files.find((f) => f.id === activeFileId) || files[0];
      if (current) {
        setActiveFileId(current.id);
        onActiveFileChange(current);
      }
    }
  };

  // Select a file from project tabs
  const handleSelectFile = (fileId: string) => {
    onBeforeManualEdit?.();
    setFiles((prev) =>
      prev.map((f) => (f.id === activeFileId ? { ...f, content: currentCode } : f))
    );

    const target = files.find((f) => f.id === fileId);
    if (target) {
      setActiveFileId(target.id);
      onActiveFileChange(target);
    }
  };

  // Add new file to project
  const handleAddFile = (pathOrName: string, lang: SupportedLanguage, initialContent = '') => {
    const normPath = normalizeFilePath(pathOrName);
    const fileName = extractFileNameFromPath(normPath);
    const newFile: ProjectFile = {
      id: `file-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      path: normPath,
      name: fileName,
      language: lang,
      content: initialContent,
      history: [initialContent],
      historyIndex: 0,
    };
    setFiles((prev) => [...prev, newFile]);
    setActiveFileId(newFile.id);
    onActiveFileChange(newFile);
  };

  // Delete file from project
  const handleDeleteFile = (fileId: string) => {
    if (files.length <= 1) return;
    const remaining = files.filter((f) => f.id !== fileId);
    setFiles(remaining);

    if (activeFileId === fileId) {
      const nextActive = remaining[0];
      setActiveFileId(nextActive.id);
      onActiveFileChange(nextActive);
    }
  };

  // Rename file or path in project
  const handleRenameFile = (fileId: string, newPathOrName: string) => {
    const normPath = normalizeFilePath(newPathOrName);
    const fileName = extractFileNameFromPath(normPath);
    const detectedLang = detectLanguageFromName(fileName);
    setFiles((prev) =>
      prev.map((f) =>
        f.id === fileId
          ? {
              ...f,
              path: normPath,
              name: fileName,
              language: detectedLang,
            }
          : f
      )
    );
    if (activeFileId === fileId) {
      onLanguageChange(detectedLang);
    }
  };

  // Aplica os arquivos importados (substituindo ou mesclando)
  const applyImportedFiles = useCallback(
    (incoming: ProjectFile[], mode: 'replace' | 'merge') => {
      if (mode === 'replace') {
        setFiles(incoming);
        setWorkspaceMode('project');
        const first =
          incoming.find((f) => (f.path || f.name).toLowerCase() === 'index.html') ||
          incoming.find((f) => (f.path || f.name).toLowerCase().endsWith('/index.html')) ||
          incoming.find((f) => f.name.toLowerCase().endsWith('.html') || f.name.toLowerCase().endsWith('.htm')) ||
          incoming[0];
        if (first) {
          setActiveFileId(first.id);
          onActiveFileChange(first);
        }
      } else {
        const incomingPathMap = new Map<string, ProjectFile>();
        incoming.forEach((f) => {
          incomingPathMap.set(normalizeFilePath(f.path || f.name).toLowerCase(), f);
        });

        const merged: ProjectFile[] = [];
        files.forEach((existing) => {
          const norm = normalizeFilePath(existing.path || existing.name).toLowerCase();
          if (!incomingPathMap.has(norm)) {
            merged.push(existing);
          }
        });
        merged.push(...incoming);

        setFiles(merged);
        setWorkspaceMode('project');
        const stillActive = merged.find((f) => f.id === activeFileId);
        if (stillActive) {
          onActiveFileChange(stillActive);
        } else {
          const first = incoming[0] || merged[0];
          if (first) {
            setActiveFileId(first.id);
            onActiveFileChange(first);
          }
        }
      }
      setIsImportConflictOpen(false);
      setPendingImportFiles(null);
    },
    [files, activeFileId, onActiveFileChange]
  );

  // Processa arquivos recebidos por .zip ou drag & drop
  const handleProcessIncomingFiles = useCallback(
    (incoming: ProjectFile[]) => {
      if (incoming.length === 0) return;
      const isWorkspaceEmpty =
        files.length === 0 ||
        (files.length === 1 && (!files[0].content || files[0].content.trim() === ''));

      if (isWorkspaceEmpty) {
        applyImportedFiles(incoming, 'replace');
      } else {
        setPendingImportFiles(incoming);
        setIsImportConflictOpen(true);
      }
    },
    [files, applyImportedFiles]
  );

  // Importa projeto a partir de um arquivo .zip
  const handleImportZip = useCallback(
    async (file: File) => {
      try {
        const imported = await importProjectFromZip(file);
        if (imported.length === 0) {
          alert('Nenhum arquivo de código/texto suportado foi localizado no arquivo .zip.');
          return;
        }
        handleProcessIncomingFiles(imported);
      } catch (err: any) {
        console.error('Erro ao importar ZIP:', err);
        alert(`Erro ao processar o arquivo .zip: ${err?.message || 'Arquivo corrompido ou formato inválido'}`);
      }
    },
    [handleProcessIncomingFiles]
  );

  // Handlers de Drag & Drop
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current += 1;
    if (e.dataTransfer && e.dataTransfer.types.includes('Files')) {
      setIsDraggingOver(true);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setIsDraggingOver(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDraggingOver(false);

    try {
      const droppedFiles = await processDroppedData(e.dataTransfer);
      if (droppedFiles.length > 0) {
        handleProcessIncomingFiles(droppedFiles);
      }
    } catch (err: any) {
      console.error('Erro ao soltar arquivos:', err);
    }
  };

  return {
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
    handleProcessIncomingFiles,
    handleImportZip,
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  };
}
