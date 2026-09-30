import { useState, useEffect, useRef, useCallback } from 'react';
import { ProjectFile } from '../types';
import {
  isFileSystemAccessSupported,
  openLocalFolder,
  readDirectoryRecursive,
  writeFileToFolder,
  saveHandleToIndexedDB,
  loadHandleFromIndexedDB,
  clearHandleFromIndexedDB,
  verifyHandlePermission,
  requestHandlePermission,
} from '../utils/localFolder';
import { LocalSaveToastData } from '../components/LocalSaveToast';

interface UseLocalFolderOptions {
  files: ProjectFile[];
  activeFileId: string;
  code: string;
  onFilesLoaded: (files: ProjectFile[]) => void;
}

export function useLocalFolder({
  files,
  activeFileId,
  code,
  onFilesLoaded,
}: UseLocalFolderOptions) {
  const [localFolderHandle, setLocalFolderHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [localFolderName, setLocalFolderName] = useState<string | null>(null);
  const [localFolderPermissionNeeded, setLocalFolderPermissionNeeded] = useState<boolean>(false);
  const [saveMode, setSaveMode] = useState<'auto' | 'manual'>(() => {
    try {
      const saved = localStorage.getItem('code_editor_save_mode');
      return saved === 'auto' ? 'auto' : 'manual';
    } catch {
      return 'manual';
    }
  });
  const [isSavingLocal, setIsSavingLocal] = useState<boolean>(false);
  const [localSaveToast, setLocalSaveToast] = useState<LocalSaveToastData | null>(null);
  const [settingsDefaultTab, setSettingsDefaultTab] = useState<'modes' | 'keys' | 'colab' | 'localFolder'>('modes');
  const toastTimeoutRef = useRef<any>(null);

  const showLocalToast = useCallback(
    (message: string, type: 'success' | 'error' = 'success', duration = 2500) => {
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
      setLocalSaveToast({ message, type });
      toastTimeoutRef.current = setTimeout(() => setLocalSaveToast(null), duration);
    },
    []
  );

  const handleChangeSaveMode = (mode: 'auto' | 'manual') => {
    setSaveMode(mode);
    try {
      localStorage.setItem('code_editor_save_mode', mode);
    } catch {}
    showLocalToast(`Modo de salvamento alterado para ${mode === 'auto' ? 'Automático (Autosave)' : 'Manual'}`);
  };

  // Restore persisted local folder from IndexedDB on startup
  useEffect(() => {
    let isMounted = true;
    async function restoreLastFolder() {
      if (!isFileSystemAccessSupported()) return;
      try {
        const handle = await loadHandleFromIndexedDB();
        if (!handle || !isMounted) return;
        setLocalFolderHandle(handle);
        setLocalFolderName(handle.name);

        const hasPerm = await verifyHandlePermission(handle, true);
        if (hasPerm) {
          const loadedFiles = await readDirectoryRecursive(handle);
          if (!isMounted) return;
          if (loadedFiles.length > 0) {
            onFilesLoaded(loadedFiles);
            showLocalToast(`Pasta "${handle.name}" restaurada do disco`);
          }
        } else {
          if (isMounted) setLocalFolderPermissionNeeded(true);
        }
      } catch (err) {
        console.warn('[LocalFolder] Erro ao carregar pasta anterior do IndexedDB:', err);
      }
    }
    restoreLastFolder();
    return () => {
      isMounted = false;
    };
  }, [onFilesLoaded, showLocalToast]);

  const handleOpenLocalFolder = async () => {
    try {
      const handle = await openLocalFolder();
      if (!handle) return; // cancelado pelo usuário

      setLocalFolderHandle(handle);
      setLocalFolderName(handle.name);
      setLocalFolderPermissionNeeded(false);
      await saveHandleToIndexedDB(handle);

      const loadedFiles = await readDirectoryRecursive(handle);
      if (loadedFiles.length > 0) {
        onFilesLoaded(loadedFiles);
        showLocalToast(`Pasta "${handle.name}" aberta (${loadedFiles.length} arquivos)`);
      } else {
        showLocalToast(`Pasta "${handle.name}" conectada (vazia ou sem arquivos suportados)`);
      }
    } catch (err: any) {
      console.error('[LocalFolder] Erro ao abrir pasta:', err);
      showLocalToast(`Erro ao abrir pasta: ${err?.message || 'Falha de permissão'}`, 'error', 3500);
    }
  };

  const handleReconnectLocalFolder = async () => {
    if (!localFolderHandle) return;
    try {
      const granted = await requestHandlePermission(localFolderHandle, true);
      if (granted) {
        setLocalFolderPermissionNeeded(false);
        const loadedFiles = await readDirectoryRecursive(localFolderHandle);
        if (loadedFiles.length > 0) {
          onFilesLoaded(loadedFiles);
          showLocalToast(`Pasta "${localFolderHandle.name}" reconectada com sucesso!`);
        }
      } else {
        showLocalToast('Permissão de acesso ao disco negada pelo navegador.', 'error', 3500);
      }
    } catch (err: any) {
      console.error('[LocalFolder] Erro ao reconectar pasta:', err);
      showLocalToast(`Erro ao reconectar: ${err?.message || 'Falha de permissão'}`, 'error', 3500);
    }
  };

  const handleDisconnectLocalFolder = async () => {
    const folderName = localFolderName;
    setLocalFolderHandle(null);
    setLocalFolderName(null);
    setLocalFolderPermissionNeeded(false);
    await clearHandleFromIndexedDB();
    showLocalToast(`Pasta "${folderName || 'local'}" desconectada`);
  };

  const handleSaveToLocalFolder = async (fileToSave?: ProjectFile) => {
    if (!localFolderHandle) return;
    const targetFile = fileToSave || files.find((f) => f.id === activeFileId);
    if (!targetFile) return;

    try {
      setIsSavingLocal(true);
      const content = targetFile.id === activeFileId ? code : targetFile.content;
      await writeFileToFolder(localFolderHandle, targetFile.path || targetFile.name, content);
      showLocalToast(`"${targetFile.name}" salvo no disco!`);
    } catch (err: any) {
      console.error('[LocalFolder] Erro ao salvar arquivo:', err);
      if (err?.name === 'NotAllowedError') {
        setLocalFolderPermissionNeeded(true);
        showLocalToast('Permissão de gravação expirada. Reconecte a pasta.', 'error', 4000);
      } else {
        showLocalToast(`Erro ao salvar no disco: ${err?.message || 'Falha'}`, 'error', 3500);
      }
    } finally {
      setIsSavingLocal(false);
    }
  };

  const handleSaveAllToLocalFolder = async () => {
    if (!localFolderHandle) return;
    try {
      setIsSavingLocal(true);
      for (const f of files) {
        const content = f.id === activeFileId ? code : f.content;
        await writeFileToFolder(localFolderHandle, f.path || f.name, content);
      }
      showLocalToast(`Todos os ${files.length} arquivos salvos no disco!`);
    } catch (err: any) {
      console.error('[LocalFolder] Erro ao salvar todos os arquivos:', err);
      if (err?.name === 'NotAllowedError') {
        setLocalFolderPermissionNeeded(true);
        showLocalToast('Permissão de gravação expirada. Reconecte a pasta.', 'error', 4000);
      } else {
        showLocalToast(`Erro ao salvar arquivos: ${err?.message || 'Falha'}`, 'error', 3500);
      }
    } finally {
      setIsSavingLocal(false);
    }
  };

  // Debounced Autosave (1200ms) when saveMode === 'auto'
  const autosaveTimerRef = useRef<any>(null);
  useEffect(() => {
    if (saveMode !== 'auto' || !localFolderHandle || localFolderPermissionNeeded) {
      return;
    }
    const activeFile = files.find((f) => f.id === activeFileId);
    if (!activeFile) return;

    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
    }

    autosaveTimerRef.current = setTimeout(async () => {
      try {
        await writeFileToFolder(localFolderHandle, activeFile.path || activeFile.name, code);
        showLocalToast(`Autosave: "${activeFile.name}" salvo`, 'success', 1500);
      } catch (err: any) {
        console.warn('[LocalFolder] Autosave falhou:', err);
        if (err?.name === 'NotAllowedError') {
          setLocalFolderPermissionNeeded(true);
        }
      }
    }, 1200);

    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
      }
    };
  }, [code, activeFileId, saveMode, localFolderHandle, localFolderPermissionNeeded, files, showLocalToast]);

  // Keyboard shortcut Ctrl+S / Cmd+S (Save active file) & Ctrl+Shift+S (Save all files)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (!localFolderHandle) return;
        if (e.shiftKey) {
          handleSaveAllToLocalFolder();
        } else {
          handleSaveToLocalFolder();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [localFolderHandle, files, activeFileId, code]);

  return {
    localFolderHandle,
    localFolderName,
    localFolderPermissionNeeded,
    saveMode,
    isSavingLocal,
    localSaveToast,
    settingsDefaultTab,
    setSettingsDefaultTab,
    showLocalToast,
    handleChangeSaveMode,
    handleOpenLocalFolder,
    handleReconnectLocalFolder,
    handleDisconnectLocalFolder,
    handleSaveToLocalFolder,
    handleSaveAllToLocalFolder,
  };
}
