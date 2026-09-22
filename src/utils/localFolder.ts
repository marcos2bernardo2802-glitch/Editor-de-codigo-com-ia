import { ProjectFile } from '../types';
import {
  detectLanguageFromName,
  extractFileNameFromPath,
  normalizeFilePath,
} from './workspace';
import {
  isBinaryFile,
  shouldSkipPath,
} from './importZip';

const DB_NAME = 'code_editor_local_folder_db';
const DB_VERSION = 1;
const STORE_NAME = 'handles';
const KEY_NAME = 'lastFolder';

/**
 * Checks if the File System Access API is supported and the application is running
 * outside an iframe (top-level window), as required by the API.
 */
export function isFileSystemAccessSupported(): boolean {
  try {
    const hasApi = typeof window !== 'undefined' && 'showDirectoryPicker' in window;
    const isTop = window.self === window.top;
    return Boolean(hasApi && isTop);
  } catch {
    return false;
  }
}

/**
 * Opens IndexedDB database for persisting directory handles.
 */
function openHandleDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB não suportado neste navegador'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

/**
 * Persists the directory handle in IndexedDB.
 */
export async function saveHandleToIndexedDB(dirHandle: FileSystemDirectoryHandle): Promise<void> {
  try {
    const db = await openHandleDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const entry = {
        id: KEY_NAME,
        handle: dirHandle,
        name: dirHandle.name,
        savedAt: Date.now(),
      };
      const req = store.put(entry);

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('[LocalFolder] Falha ao salvar handle no IndexedDB:', err);
  }
}

/**
 * Loads the saved directory handle from IndexedDB.
 */
export async function loadHandleFromIndexedDB(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openHandleDb();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(KEY_NAME);

      req.onsuccess = () => {
        if (req.result && req.result.handle) {
          resolve(req.result.handle as FileSystemDirectoryHandle);
        } else {
          resolve(null);
        }
      };

      req.onerror = () => {
        resolve(null);
      };
    });
  } catch (err) {
    console.warn('[LocalFolder] Falha ao ler handle do IndexedDB:', err);
    return null;
  }
}

/**
 * Clears the saved directory handle from IndexedDB.
 */
export async function clearHandleFromIndexedDB(): Promise<void> {
  try {
    const db = await openHandleDb();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(KEY_NAME);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    });
  } catch (err) {
    console.warn('[LocalFolder] Falha ao limpar handle no IndexedDB:', err);
  }
}

/**
 * Checks if permission is already granted for the directory handle.
 */
export async function verifyHandlePermission(
  dirHandle: FileSystemDirectoryHandle,
  readWrite = true
): Promise<boolean> {
  try {
    const mode = readWrite ? 'readwrite' : 'read';
    const state = await (dirHandle as any).queryPermission({ mode });
    return state === 'granted';
  } catch {
    return false;
  }
}

/**
 * Requests permission from user for the directory handle (must be triggered by user gesture).
 */
export async function requestHandlePermission(
  dirHandle: FileSystemDirectoryHandle,
  readWrite = true
): Promise<boolean> {
  try {
    const mode = readWrite ? 'readwrite' : 'read';
    const state = await (dirHandle as any).requestPermission({ mode });
    return state === 'granted';
  } catch {
    return false;
  }
}

/**
 * Opens a local folder via the native File System Access dialog.
 * Handles AbortError (user cancelled) gracefully and returns null.
 */
export async function openLocalFolder(): Promise<FileSystemDirectoryHandle | null> {
  if (!isFileSystemAccessSupported()) {
    throw new Error('A API File System Access só está disponível no Chrome/Edge fora de iframes.');
  }

  try {
    const dirHandle = await (window as any).showDirectoryPicker({
      mode: 'readwrite',
    });
    return dirHandle as FileSystemDirectoryHandle;
  } catch (err: any) {
    if (err && (err.name === 'AbortError' || err.code === 20)) {
      return null; // Usuário cancelou
    }
    throw err;
  }
}

/**
 * Recursively scans a directory handle and returns ProjectFile[].
 * Ignores node_modules, .git, dist, binary files, etc.
 */
export async function readDirectoryRecursive(
  dirHandle: FileSystemDirectoryHandle,
  currentRelPath = ''
): Promise<ProjectFile[]> {
  const result: ProjectFile[] = [];

  for await (const entry of (dirHandle as any).values()) {
    const entryName: string = entry.name;
    const entryRelPath = currentRelPath ? `${currentRelPath}/${entryName}` : entryName;
    const normalized = normalizeFilePath(entryRelPath);

    if (entry.kind === 'directory') {
      if (shouldSkipPath(`${normalized}/`)) {
        continue;
      }
      const subFiles = await readDirectoryRecursive(entry as FileSystemDirectoryHandle, entryRelPath);
      result.push(...subFiles);
    } else if (entry.kind === 'file') {
      if (shouldSkipPath(normalized) || isBinaryFile(entryName)) {
        continue;
      }

      try {
        const fileHandle = entry as FileSystemFileHandle;
        const file = await fileHandle.getFile();
        const content = await file.text();
        const fileName = extractFileNameFromPath(normalized);
        const language = detectLanguageFromName(fileName);

        result.push({
          id: `file-local-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          path: normalized,
          name: fileName,
          language,
          content,
          history: [content],
          historyIndex: 0,
        });
      } catch (fileErr) {
        console.warn(`[LocalFolder] Não foi possível ler o arquivo ${normalized}:`, fileErr);
      }
    }
  }

  if (!currentRelPath) {
    result.sort((a, b) => {
      if (a.path === 'index.html') return -1;
      if (b.path === 'index.html') return 1;
      return a.path.localeCompare(b.path);
    });
  }

  return result;
}

/**
 * Writes content to a specific file path inside the given directory handle,
 * creating any necessary subdirectories recursively.
 */
export async function writeFileToFolder(
  dirHandle: FileSystemDirectoryHandle,
  filePath: string,
  content: string
): Promise<void> {
  const normalized = normalizeFilePath(filePath).replace(/^\/+/, '');
  const segments = normalized.split('/');
  const fileName = segments.pop();

  if (!fileName) {
    throw new Error(`Caminho de arquivo inválido: ${filePath}`);
  }

  let currentDir = dirHandle;

  // Navigate or create intermediate directories
  for (const seg of segments) {
    if (!seg || seg === '.') continue;
    currentDir = await currentDir.getDirectoryHandle(seg, { create: true });
  }

  // Get or create file handle
  const fileHandle = await currentDir.getFileHandle(fileName, { create: true });
  const writable = await (fileHandle as any).createWritable();
  await writable.write(content);
  await writable.close();
}
