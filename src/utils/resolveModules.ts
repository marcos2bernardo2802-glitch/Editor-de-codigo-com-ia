import { ProjectFile } from '../types';
import { normalizeFilePath, extractFileNameFromPath } from './workspace';
import { resolveRelativePath } from './preview';

export interface ModuleResolutionResult {
  entryBlobUrl: string;
  createdBlobUrls: string[];
  resolvedFileIds: Set<string>;
}

/**
 * Checks if a specifier is a relative path (e.g. ./foo, ../bar, /baz)
 */
export function isRelativeSpecifier(spec: string): boolean {
  return spec.startsWith('./') || spec.startsWith('../') || spec.startsWith('/');
}

/**
 * Returns the directory of a file path.
 */
export function getFileDir(filePath: string): string {
  const norm = normalizeFilePath(filePath);
  const lastSlash = norm.lastIndexOf('/');
  return lastSlash !== -1 ? norm.slice(0, lastSlash) : '';
}

/**
 * Finds a project file by resolved path, with automatic extensions fallback (.js, .ts, etc.).
 */
export function findMatchingFileWithExt(
  projectFiles: ProjectFile[],
  targetPath: string
): ProjectFile | undefined {
  const normTarget = normalizeFilePath(targetPath).toLowerCase();
  const targetFileName = extractFileNameFromPath(normTarget).toLowerCase();

  const direct = projectFiles.find(
    (f) => normalizeFilePath(f.path || f.name).toLowerCase() === normTarget
  );
  if (direct) return direct;

  const endsWith = projectFiles.find((f) =>
    normalizeFilePath(f.path || f.name).toLowerCase().endsWith(normTarget)
  );
  if (endsWith) return endsWith;

  const byName = projectFiles.find(
    (f) => extractFileNameFromPath(f.path || f.name).toLowerCase() === targetFileName
  );
  if (byName) return byName;

  // Fallbacks for missing extensions (.js, .ts, .jsx, .tsx, /index.js, /index.ts)
  const extensions = ['.js', '.ts', '.jsx', '.tsx', '/index.js', '/index.ts'];
  for (const ext of extensions) {
    const candidatePath = normTarget + ext;
    const candidateName = targetFileName + ext;

    const matchExt = projectFiles.find((f) => {
      const p = normalizeFilePath(f.path || f.name).toLowerCase();
      return p === candidatePath || p.endsWith(candidatePath) || extractFileNameFromPath(p) === candidateName;
    });
    if (matchExt) return matchExt;
  }

  return undefined;
}

/**
 * Replaces module specifiers in JavaScript/TypeScript code:
 * - import ... from 'specifier'
 * - export ... from 'specifier'
 * - import 'specifier'
 * - import('specifier')
 */
export function replaceModuleSpecifiers(
  content: string,
  replacer: (specifier: string) => string
): string {
  let result = content;

  // 1. from 'specifier' or from "specifier"
  result = result.replace(/(from\s*['"])([^'"]+)(['"])/g, (_, p1, spec, p3) => {
    return `${p1}${replacer(spec)}${p3}`;
  });

  // 2. side-effect import: import 'specifier' or import "specifier"
  result = result.replace(/(import\s*['"])([^'"]+)(['"])/g, (_, p1, spec, p3) => {
    return `${p1}${replacer(spec)}${p3}`;
  });

  // 3. dynamic import: import('specifier') or import("specifier")
  result = result.replace(/(import\s*\(\s*['"])([^'"]+)(['"]\s*\))/g, (_, p1, spec, p3) => {
    return `${p1}${replacer(spec)}${p3}`;
  });

  return result;
}

/**
 * Resolves the dependency graph of an ES module entry file,
 * creating Blob URLs for all relative imports and recursively rewriting specifiers.
 * Protects against circular dependencies and duplicate Blob URLs.
 */
export function resolveJsModuleGraph(
  entryFile: ProjectFile,
  allFiles: ProjectFile[]
): ModuleResolutionResult {
  const blobUrlCache = new Map<string, string>(); // normPath -> blobUrl
  const inProgress = new Set<string>(); // normPath in current recursion stack
  const createdBlobUrls: string[] = [];
  const resolvedFileIds = new Set<string>();

  function processFile(file: ProjectFile): string {
    const normPath = normalizeFilePath(file.path || file.name).toLowerCase();

    // Re-use already created Blob URL
    if (blobUrlCache.has(normPath)) {
      return blobUrlCache.get(normPath)!;
    }

    // Circular dependency protection: stop recursion if currently being processed
    if (inProgress.has(normPath)) {
      return '';
    }

    inProgress.add(normPath);
    if (file.id) {
      resolvedFileIds.add(file.id);
    }

    const fileDir = getFileDir(file.path || file.name);

    // Recursively resolve all relative import/export specifiers in this file's content
    const processedCode = replaceModuleSpecifiers(file.content, (specifier) => {
      if (!isRelativeSpecifier(specifier)) {
        // External URLs (https://...) or package specifiers stay as they are
        return specifier;
      }

      const resolvedPath = resolveRelativePath(fileDir, specifier);
      const depFile = findMatchingFileWithExt(allFiles, resolvedPath);

      if (!depFile) {
        // Dependency not found in project files, keep original
        return specifier;
      }

      const depNormPath = normalizeFilePath(depFile.path || depFile.name).toLowerCase();

      // If already cached, reuse immediately
      if (blobUrlCache.has(depNormPath)) {
        return blobUrlCache.get(depNormPath)!;
      }

      // If in progress (circular), do not recurse
      if (inProgress.has(depNormPath)) {
        return specifier;
      }

      // Process child dependency
      const childBlobUrl = processFile(depFile);
      return childBlobUrl || specifier;
    });

    const blob = new Blob([processedCode], { type: 'text/javascript' });
    const blobUrl = URL.createObjectURL(blob);

    blobUrlCache.set(normPath, blobUrl);
    createdBlobUrls.push(blobUrl);
    inProgress.delete(normPath);

    return blobUrl;
  }

  const entryBlobUrl = processFile(entryFile);

  return {
    entryBlobUrl,
    createdBlobUrls,
    resolvedFileIds,
  };
}
