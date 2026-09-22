import { ProjectFile } from '../types';
import { importProjectFromZip } from './importZip';
import {
  detectLanguageFromName,
  extractFileNameFromPath,
  normalizeFilePath,
} from './workspace';

// Binary / media extensions to ignore
const BINARY_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'bmp', 'tiff',
  'woff', 'woff2', 'ttf', 'eot', 'otf',
  'mp3', 'wav', 'ogg', 'mp4', 'webm', 'avi', 'mov',
  'zip', 'tar', 'gz', 'rar', '7z',
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
  'exe', 'dll', 'so', 'dylib', 'bin', 'iso', 'dmg', 'class', 'pyc', 'wasm',
]);

const IGNORED_DIRECTORIES = [
  'node_modules',
  '.git',
  'dist',
  '.next',
  '__pycache__',
  'build',
  '.vscode',
  '.idea',
];

function isBinaryFile(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  return BINARY_EXTENSIONS.has(ext);
}

function isIgnoredPath(path: string): boolean {
  const segments = path.split('/');
  return segments.some((seg) => IGNORED_DIRECTORIES.includes(seg) || seg === '.DS_Store' || seg === 'Thumbs.db');
}

/**
 * Traverses a FileSystemEntry recursively
 */
async function traverseFileSystemEntry(
  entry: any,
  currentPath = ''
): Promise<ProjectFile[]> {
  const files: ProjectFile[] = [];

  if (entry.isFile) {
    const fullPath = normalizeFilePath(currentPath ? `${currentPath}/${entry.name}` : entry.name);
    if (isIgnoredPath(fullPath) || isBinaryFile(entry.name)) {
      return [];
    }

    try {
      const file: File = await new Promise((resolve, reject) => {
        entry.file(resolve, reject);
      });

      const content = await file.text();
      const lang = detectLanguageFromName(entry.name);

      files.push({
        id: `file-dropped-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        path: fullPath,
        name: entry.name,
        language: lang,
        content,
        history: [content],
        historyIndex: 0,
      });
    } catch {
      // Ignore unreadable files
    }
  } else if (entry.isDirectory) {
    const dirName = entry.name;
    if (IGNORED_DIRECTORIES.includes(dirName)) {
      return [];
    }

    const nextPath = currentPath ? `${currentPath}/${dirName}` : dirName;
    const reader = entry.createReader();

    // readEntries may return in batches, read until empty
    const readAllEntries = async (): Promise<any[]> => {
      const all: any[] = [];
      while (true) {
        const batch: any[] = await new Promise((resolve, reject) => {
          reader.readEntries(resolve, reject);
        });
        if (!batch || batch.length === 0) break;
        all.push(...batch);
      }
      return all;
    };

    try {
      const childEntries = await readAllEntries();
      for (const child of childEntries) {
        const childFiles = await traverseFileSystemEntry(child, nextPath);
        files.push(...childFiles);
      }
    } catch {
      // Ignore unreadable directory
    }
  }

  return files;
}

/**
 * Processes dropped items or files from a DragEvent
 */
export async function processDroppedData(dataTransfer: DataTransfer): Promise<ProjectFile[]> {
  // Check if single .zip file was dropped
  if (dataTransfer.files.length === 1 && dataTransfer.files[0].name.toLowerCase().endsWith('.zip')) {
    return importProjectFromZip(dataTransfer.files[0]);
  }

  // Handle entries via webkitGetAsEntry
  const items = Array.from(dataTransfer.items || []);
  const entryPromises: Promise<ProjectFile[]>[] = [];

  let hasEntries = false;
  for (const item of items) {
    if (typeof item.webkitGetAsEntry === 'function') {
      const entry = item.webkitGetAsEntry();
      if (entry) {
        hasEntries = true;
        entryPromises.push(traverseFileSystemEntry(entry, ''));
      }
    }
  }

  if (hasEntries) {
    const results = await Promise.all(entryPromises);
    const combined = results.flat();
    return combined;
  }

  // Fallback if webkitGetAsEntry is unavailable: standard FileList
  const files: ProjectFile[] = [];
  for (let i = 0; i < dataTransfer.files.length; i++) {
    const file = dataTransfer.files[i];
    if (isBinaryFile(file.name) || file.name === '.DS_Store') continue;

    try {
      const content = await file.text();
      const lang = detectLanguageFromName(file.name);
      files.push({
        id: `file-dropped-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        path: normalizeFilePath(file.name),
        name: file.name,
        language: lang,
        content,
        history: [content],
        historyIndex: 0,
      });
    } catch {
      // Ignore
    }
  }

  return files;
}
