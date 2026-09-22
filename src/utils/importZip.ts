import JSZip from 'jszip';
import { ProjectFile, SupportedLanguage } from '../types';
import {
  detectLanguageFromName,
  extractFileNameFromPath,
  normalizeFilePath,
} from './workspace';

// Binary / media extensions to ignore for now
const BINARY_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'bmp', 'tiff',
  'woff', 'woff2', 'ttf', 'eot', 'otf',
  'mp3', 'wav', 'ogg', 'mp4', 'webm', 'avi', 'mov',
  'zip', 'tar', 'gz', 'rar', '7z',
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
  'exe', 'dll', 'so', 'dylib', 'bin', 'iso', 'dmg', 'class', 'pyc', 'wasm',
]);

// Directories to skip
const IGNORED_DIRECTORIES = [
  'node_modules/',
  '.git/',
  'dist/',
  '.next/',
  '__pycache__/',
  'build/',
  '.vscode/',
  '.idea/',
];

function isBinaryFile(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  return BINARY_EXTENSIONS.has(ext);
}

function shouldSkipPath(path: string): boolean {
  const normalized = normalizeFilePath(path);
  // System junk files
  if (normalized.endsWith('.DS_Store') || normalized.endsWith('Thumbs.db')) {
    return true;
  }
  // Check ignored directories
  for (const dir of IGNORED_DIRECTORIES) {
    if (normalized.startsWith(dir) || normalized.includes(`/${dir}`)) {
      return true;
    }
  }
  return false;
}

/**
 * Reads a .zip file and converts code/text files into ProjectFile[]
 */
export async function importProjectFromZip(zipFile: File): Promise<ProjectFile[]> {
  const zip = await JSZip.loadAsync(zipFile);
  const importedFiles: ProjectFile[] = [];

  const entries = Object.entries(zip.files);

  for (const [rawPath, entry] of entries) {
    // Skip folders
    if (entry.dir) continue;

    const normalizedPath = normalizeFilePath(rawPath);
    if (!normalizedPath) continue;

    // Skip ignored directories & system junk
    if (shouldSkipPath(normalizedPath)) continue;

    const fileName = extractFileNameFromPath(normalizedPath);

    // Skip binary assets
    if (isBinaryFile(fileName)) continue;

    try {
      const content = await entry.async('string');
      const language = detectLanguageFromName(fileName);

      importedFiles.push({
        id: `file-imported-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        path: normalizedPath,
        name: fileName,
        language,
        content,
        history: [content],
        historyIndex: 0,
      });
    } catch {
      // If reading as text fails (e.g. malformed encoding), skip entry safely
      continue;
    }
  }

  // Sort files so index.html or root files come first
  importedFiles.sort((a, b) => {
    if (a.path === 'index.html') return -1;
    if (b.path === 'index.html') return 1;
    return a.path.localeCompare(b.path);
  });

  return importedFiles;
}
