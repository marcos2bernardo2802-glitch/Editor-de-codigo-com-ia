import { SupportedLanguage, ProjectFile } from '../types';
import { normalizeFilePath, extractFileNameFromPath } from './workspace';
import { resolveJsModuleGraph, getFileDir } from './resolveModules';

export const CONSOLE_INJECT_SCRIPT = `<script id="preview-console-bridge">
(function() {
  function serialize(arg) {
    if (arg === null) return 'null';
    if (arg === undefined) return 'undefined';
    if (typeof arg === 'object') {
      try { return JSON.stringify(arg); } catch(e) { return Object.prototype.toString.call(arg); }
    }
    return String(arg);
  }
  function send(type, args) {
    try {
      var msg = Array.prototype.slice.call(args).map(serialize).join(' ');
      window.parent.postMessage({ type: 'preview_console', level: type, message: msg, timestamp: Date.now() }, '*');
    } catch(e) {}
  }

  function showToast(msg) {
    try {
      var toast = document.createElement('div');
      toast.style.position = 'fixed';
      toast.style.bottom = '16px';
      toast.style.left = '50%';
      toast.style.transform = 'translateX(-50%)';
      toast.style.backgroundColor = 'rgba(15, 23, 42, 0.92)';
      toast.style.color = '#f8fafc';
      toast.style.padding = '8px 16px';
      toast.style.borderRadius = '8px';
      toast.style.boxShadow = '0 4px 14px rgba(0,0,0,0.3)';
      toast.style.fontFamily = 'system-ui, -apple-system, sans-serif';
      toast.style.fontSize = '12px';
      toast.style.fontWeight = '500';
      toast.style.zIndex = '999999';
      toast.style.pointerEvents = 'none';
      toast.style.transition = 'opacity 0.25s ease';
      toast.textContent = msg;
      if (document.body) {
        document.body.appendChild(toast);
        setTimeout(function() {
          toast.style.opacity = '0';
          setTimeout(function() { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 250);
        }, 2500);
      }
    } catch(e) {}
  }

  var oldLog = console.log;
  var oldErr = console.error;
  var oldWarn = console.warn;
  var oldInfo = console.info;

  console.log = function() { send('log', arguments); if(oldLog) try { oldLog.apply(console, arguments); } catch(e){} };
  console.error = function() { send('error', arguments); if(oldErr) try { oldErr.apply(console, arguments); } catch(e){} };
  console.warn = function() { send('warn', arguments); if(oldWarn) try { oldWarn.apply(console, arguments); } catch(e){} };
  console.info = function() { send('info', arguments); if(oldInfo) try { oldInfo.apply(console, arguments); } catch(e){} };

  window.alert = function(msg) {
    send('info', ['[Alerta]: ' + msg]);
    showToast('[Alerta]: ' + msg);
  };
  window.confirm = function(msg) {
    send('info', ['[Confirmar]: ' + msg]);
    return true;
  };
  window.prompt = function(msg, def) {
    send('info', ['[Prompt]: ' + msg]);
    return def || '';
  };

  window.addEventListener('error', function(e) {
    send('error', [e.message || 'Erro de execução na prévia']);
  });
  window.addEventListener('unhandledrejection', function(e) {
    var reason = e.reason ? (e.reason.message || String(e.reason)) : 'Promise rejeitada';
    send('error', ['Promise rejeitada: ' + reason]);
  });
})();
</script>`;

/**
 * Injects the console bridge at the very beginning of the <head> tag
 * so that any script on the page (inline or external) will be captured.
 */
export function injectConsoleBridge(html: string): string {
  if (html.includes('<head>')) {
    return html.replace('<head>', `<head>\n${CONSOLE_INJECT_SCRIPT}`);
  }
  if (html.includes('<head ')) {
    return html.replace(/<head\b([^>]*)>/i, `<head$1>\n${CONSOLE_INJECT_SCRIPT}`);
  }
  if (html.includes('<html>') || html.includes('<html ')) {
    return html.replace(/<html\b([^>]*)>/i, `<html$1>\n<head>\n${CONSOLE_INJECT_SCRIPT}\n</head>`);
  }
  if (html.includes('<body>') || html.includes('<body ')) {
    return html.replace(/<body\b([^>]*)>/i, `<head>\n${CONSOLE_INJECT_SCRIPT}\n</head>\n<body$1>`);
  }
  return `<head>\n${CONSOLE_INJECT_SCRIPT}\n</head>\n${html}`;
}

/**
 * Resolves a relative path against a base file directory.
 * e.g. baseDir="src", rel="styles/main.css" -> "src/styles/main.css"
 * e.g. baseDir="src/pages", rel="../styles/main.css" -> "src/styles/main.css"
 */
export function resolveRelativePath(baseDir: string, relativePath: string): string {
  const clean = relativePath.split('?')[0].split('#')[0].trim();
  if (clean.startsWith('/')) {
    return normalizeFilePath(clean.slice(1));
  }
  const parts = baseDir ? baseDir.split('/').filter(Boolean) : [];
  for (const seg of clean.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') {
      parts.pop();
    } else {
      parts.push(seg);
    }
  }
  return parts.join('/');
}

/**
 * Finds a project file by resolved path, partial ending, or file name.
 */
export function findMatchingFile(
  projectFiles: ProjectFile[],
  targetPath: string
): ProjectFile | undefined {
  if (!projectFiles || projectFiles.length === 0 || !targetPath) return undefined;
  const cleanTarget = targetPath.split('?')[0].split('#')[0].trim();
  const normTarget = normalizeFilePath(cleanTarget).toLowerCase();
  const targetFileName = extractFileNameFromPath(normTarget).toLowerCase();

  // 1. Exact path match
  let found = projectFiles.find(
    (f) => normalizeFilePath(f.path || f.name).toLowerCase() === normTarget
  );
  if (found) return found;

  // 2. Ends with target path (e.g. "style.css" matching "src/style.css")
  found = projectFiles.find((f) =>
    normalizeFilePath(f.path || f.name).toLowerCase().endsWith(normTarget)
  );
  if (found) return found;

  // 3. Fallback: match by filename
  found = projectFiles.find(
    (f) => extractFileNameFromPath(f.path || f.name).toLowerCase() === targetFileName
  );
  if (found) return found;

  // 4. Fuzzy fallback (e.g. "styles.css" vs "style.css")
  const baseNameNoExt = targetFileName.replace(/\.[^/.]+$/, '');
  const ext = targetFileName.includes('.') ? targetFileName.slice(targetFileName.lastIndexOf('.')) : '';
  if (ext) {
    found = projectFiles.find((f) => {
      const fName = extractFileNameFromPath(f.path || f.name).toLowerCase();
      if (!fName.endsWith(ext)) return false;
      const fBase = fName.slice(0, fName.length - ext.length);
      return fBase === baseNameNoExt || fBase.startsWith(baseNameNoExt) || baseNameNoExt.startsWith(fBase);
    });
    if (found) return found;
  }

  return undefined;
}

export function isExternalUrl(url: string): boolean {
  return /^(?:[a-z]+:)?\/\//i.test(url) || url.startsWith('data:') || url.startsWith('blob:');
}

/**
 * Resolves recursive @import statements in CSS files:
 * - @import "x.css";
 * - @import 'x.css';
 * - @import url("x.css");
 * - @import url(x.css);
 * Ignores external URLs (http, https, //).
 * Protects against circular imports using a visited Set.
 */
export function resolveCssImports(
  cssContent: string,
  currentFilePath: string,
  allFiles: ProjectFile[],
  visited: Set<string> = new Set(),
  embeddedFileIds?: Set<string>
): string {
  if (!cssContent) return '';
  const currentDir = getFileDir(currentFilePath);
  const currentNorm = normalizeFilePath(currentFilePath).toLowerCase();
  visited.add(currentNorm);

  const importRegex = /@import\s+(?:url\(\s*(?:['"]([^'"]+)['"]|([^'")]+))\s*\)|['"]([^'"]+)['"])([^;]*);?/gi;

  return cssContent.replace(importRegex, (fullMatch, url1, url2, url3, mediaQuery) => {
    const rawUrl = (url1 || url2 || url3 || '').trim();

    if (!rawUrl || isExternalUrl(rawUrl)) {
      return fullMatch; // Keep external stylesheets (CDN, Google Fonts) intact
    }

    const resolvedPath = resolveRelativePath(currentDir, rawUrl);
    const matchedFile = findMatchingFile(allFiles, resolvedPath);

    if (!matchedFile) {
      return `/* @import não encontrado no workspace: ${rawUrl} */`;
    }

    const matchedNorm = normalizeFilePath(matchedFile.path || matchedFile.name).toLowerCase();

    if (visited.has(matchedNorm)) {
      return `/* @import circular ignorado: ${rawUrl} */`;
    }

    visited.add(matchedNorm);
    if (embeddedFileIds && matchedFile.id) {
      embeddedFileIds.add(matchedFile.id);
    }

    // Recursively resolve any chained @import in the target file
    const resolvedNestedCss = resolveCssImports(
      matchedFile.content || '',
      matchedFile.path || matchedFile.name,
      allFiles,
      visited,
      embeddedFileIds
    );

    const cleanMedia = (mediaQuery || '').trim();
    if (cleanMedia) {
      return `/* Início @import: ${matchedFile.path || matchedFile.name} (${cleanMedia}) */\n@media ${cleanMedia} {\n${resolvedNestedCss}\n}\n/* Fim @import: ${matchedFile.path || matchedFile.name} */`;
    }

    return `/* Início @import: ${matchedFile.path || matchedFile.name} */\n${resolvedNestedCss}\n/* Fim @import: ${matchedFile.path || matchedFile.name} */`;
  });
}

/**
 * Checks if a project file is a real HTML document or webpage
 */
export function isRealHtmlFile(f?: { path?: string; name?: string; content?: string } | null): boolean {
  if (!f) return false;
  const normName = (f.path || f.name || '').toLowerCase();
  if (normName.endsWith('.html') || normName.endsWith('.htm')) return true;
  if (!f.content) return false;
  const trimmed = f.content.trim().toLowerCase();
  return (
    trimmed.startsWith('<!doctype html') ||
    trimmed.startsWith('<html') ||
    (trimmed.includes('<body') && trimmed.includes('</body>'))
  );
}

/**
 * Returns all previewable HTML files in the project workspace
 */
export function getAvailableHtmlFiles(projectFiles?: ProjectFile[]): ProjectFile[] {
  if (!projectFiles || projectFiles.length === 0) return [];
  return projectFiles.filter(isRealHtmlFile);
}

/**
 * Generates the preview HTML for the iframe.
 * Supports:
 * - Multi-file linking (<link rel="stylesheet">, <script src="...">)
 * - ES modules (<script type="module" src="...">) via Blob URLs
 * - Recursive CSS @import resolution
 * - Collection of created Blob URLs for cleanup
 * - Smart HTML file detection and switching across multi-file projects
 * - Clean CSS/JS isolation to avoid cross-page style breakage
 */
export function generatePreviewHtml(
  code: string,
  language: SupportedLanguage,
  projectFiles?: ProjectFile[],
  createdBlobUrlsCollector?: string[],
  activeFileId?: string,
  selectedPreviewFileId?: string
): string {
  // If multi-file project is active
  if (projectFiles && projectFiles.length > 0) {
    const activeFile = activeFileId ? projectFiles.find((f) => f.id === activeFileId) : undefined;
    const activeFileBaseName = activeFile
      ? activeFile.name.replace(/\.[^/.]+$/, '').toLowerCase()
      : '';

    // Determine the main HTML file to render:
    // 1. User explicitly selected an HTML file from the preview selector
    // 2. Active file if it's an HTML file
    // 3. Sibling HTML file matching the active file's base name (e.g. portal.css -> portal.html)
    // 4. index.html or */index.html
    // 5. First real HTML file found in project
    // 6. If code itself contains HTML tags or language === 'html'
    let mainHtmlFile: ProjectFile | null = null;

    if (selectedPreviewFileId) {
      mainHtmlFile = projectFiles.find((f) => f.id === selectedPreviewFileId) || null;
    }

    if (!mainHtmlFile && activeFile && isRealHtmlFile(activeFile)) {
      mainHtmlFile = activeFile;
    }

    if (!mainHtmlFile && activeFileBaseName) {
      mainHtmlFile =
        projectFiles.find(
          (f) =>
            isRealHtmlFile(f) &&
            f.name.replace(/\.[^/.]+$/, '').toLowerCase() === activeFileBaseName
        ) || null;
    }

    if (!mainHtmlFile) {
      mainHtmlFile =
        projectFiles.find((f) => (f.path || f.name).toLowerCase() === 'index.html') ||
        projectFiles.find((f) => (f.path || f.name).toLowerCase().endsWith('/index.html')) ||
        projectFiles.find((f) => isRealHtmlFile(f)) ||
        null;
    }

    // Fallback if active editor has HTML code
    if (
      !mainHtmlFile &&
      (language === 'html' ||
        code.trim().toLowerCase().startsWith('<!doctype html') ||
        code.trim().toLowerCase().startsWith('<html'))
    ) {
      mainHtmlFile = {
        id: 'virtual-active-html',
        name: activeFile ? activeFile.name : 'index.html',
        path: activeFile ? activeFile.path : 'index.html',
        language: 'html' as SupportedLanguage,
        content: code,
        history: [],
        historyIndex: 0,
      };
    }

    if (mainHtmlFile) {
      // If the mainHtmlFile is currently active in the editor, use live buffer `code`
      let combinedHtml =
        activeFileId && mainHtmlFile.id === activeFileId ? code : mainHtmlFile.content;

      // Handle completely empty HTML files gracefully
      if (!combinedHtml || !combinedHtml.trim()) {
        return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Arquivo Vazio</title>
  <style>
    body {
      font-family: system-ui, -apple-system, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      background: #0d1117;
      color: #8b949e;
      text-align: center;
      padding: 24px;
      box-sizing: border-box;
    }
    .box {
      padding: 32px 24px;
      border: 1px dashed #30363d;
      border-radius: 12px;
      background: #161b22;
      max-width: 440px;
      width: 100%;
    }
    h3 { margin-top: 0; color: #f0f6fc; font-size: 16px; font-weight: 600; }
    p { font-size: 13px; line-height: 1.5; margin-bottom: 0; }
    .badge {
      display: inline-block;
      margin-top: 12px;
      padding: 3px 10px;
      background: #1f6feb20;
      color: #58a6ff;
      border: 1px solid #1f6feb40;
      border-radius: 6px;
      font-size: 12px;
      font-family: monospace;
    }
  </style>
</head>
<body>
  <div class="box">
    <h3>Arquivo HTML Sem Conteúdo</h3>
    <p>O arquivo selecionado está vazio ou não possui elementos no corpo.</p>
    <div class="badge">${mainHtmlFile.path || mainHtmlFile.name}</div>
  </div>
</body>
</html>`;
      }

      const htmlPath = normalizeFilePath(mainHtmlFile.path || mainHtmlFile.name);
      const htmlDir = htmlPath.includes('/') ? htmlPath.slice(0, htmlPath.lastIndexOf('/')) : '';

      const embeddedFileIds = new Set<string>();
      if (mainHtmlFile.id) {
        embeddedFileIds.add(mainHtmlFile.id);
      }

      // Resolve local images (e.g. <img src="logo.svg">)
      combinedHtml = combinedHtml.replace(/<img\b([^>]*?)>/gi, (imgMatch, attrs) => {
        const srcMatch = attrs.match(/\bsrc=["']([^"']+)["']/i);
        if (!srcMatch) return imgMatch;
        const src = srcMatch[1];
        if (isExternalUrl(src)) return imgMatch;

        const resolvedPath = resolveRelativePath(htmlDir, src);
        const matchedImg = findMatchingFile(projectFiles, resolvedPath);
        if (matchedImg && (matchedImg.name.endsWith('.svg') || matchedImg.path?.endsWith('.svg'))) {
          const svgData = `data:image/svg+xml;utf8,${encodeURIComponent(matchedImg.content)}`;
          return imgMatch.replace(srcMatch[0], `src="${svgData}"`);
        }
        return imgMatch;
      });

      // 2. Intercept <link rel="stylesheet" href="..."> tags & resolve recursive @import
      combinedHtml = combinedHtml.replace(/<link\b([^>]*?)>/gi, (match, attrs) => {
        const isStylesheet = /\brel=["']?stylesheet["']?/i.test(attrs);
        if (!isStylesheet) return match;

        const hrefMatch = attrs.match(/\bhref=["']([^"']+)["']/i);
        if (!hrefMatch) return match;

        const href = hrefMatch[1];
        if (isExternalUrl(href)) {
          return match; // Keep external stylesheets (CDN, fonts) intact
        }

        const resolvedPath = resolveRelativePath(htmlDir, href);
        const matchedFile = findMatchingFile(projectFiles, resolvedPath);

        if (matchedFile) {
          embeddedFileIds.add(matchedFile.id);
          const rawCssContent =
            activeFileId && matchedFile.id === activeFileId ? code : matchedFile.content;
          const resolvedCss = resolveCssImports(
            rawCssContent,
            matchedFile.path || matchedFile.name,
            projectFiles,
            new Set(),
            embeddedFileIds
          );
          return `<style data-source="${matchedFile.path || matchedFile.name}">\n/* Injetado de: ${matchedFile.path || matchedFile.name} */\n${resolvedCss}\n</style>`;
        }

        return match;
      });

      // 3. Intercept <script ... src="..."> tags (including type="module" with Blob URLs)
      combinedHtml = combinedHtml.replace(
        /<script\b([^>]*?)(?:\/>|>(.*?)<\/script>)/gis,
        (match, attrs, innerContent) => {
          const isModule = /\btype=["']?module["']?/i.test(attrs);
          const srcMatch = attrs.match(/\bsrc=["']([^"']+)["']/i);

          if (srcMatch) {
            const src = srcMatch[1];
            if (isExternalUrl(src)) {
              return match; // Keep external scripts intact
            }

            const resolvedPath = resolveRelativePath(htmlDir, src);
            const matchedFile = findMatchingFile(projectFiles, resolvedPath);

            if (matchedFile) {
              embeddedFileIds.add(matchedFile.id);
              const scriptContent =
                activeFileId && matchedFile.id === activeFileId ? code : matchedFile.content;

              if (isModule) {
                // ES Module script: generate Blob URL graph
                const virtualScriptFile = { ...matchedFile, content: scriptContent };
                const { entryBlobUrl, createdBlobUrls, resolvedFileIds } = resolveJsModuleGraph(
                  virtualScriptFile,
                  projectFiles
                );
                if (createdBlobUrlsCollector) {
                  createdBlobUrlsCollector.push(...createdBlobUrls);
                }
                resolvedFileIds.forEach((id) => embeddedFileIds.add(id));

                return `<script type="module" src="${entryBlobUrl}" data-source="${matchedFile.path || matchedFile.name}"></script>`;
              } else {
                // Classic script: inline as text
                return `<script data-source="${matchedFile.path || matchedFile.name}">\n// Injetado de: ${matchedFile.path || matchedFile.name}\ntry {\n${scriptContent}\n} catch(err) {\n  console.error('[Script Error ${matchedFile.path || matchedFile.name}]:', err);\n}\n<\/script>`;
              }
            }

            return match;
          }

          // Inline <script type="module">
          if (isModule && innerContent && innerContent.trim()) {
            const virtualFile: ProjectFile = {
              id: 'inline-module-' + Math.random().toString(36).slice(2, 8),
              name: 'inline-module.js',
              path: htmlPath ? `${htmlDir}/inline-module.js` : 'inline-module.js',
              language: 'javascript',
              content: innerContent,
              history: [],
              historyIndex: 0,
            };
            const { entryBlobUrl, createdBlobUrls, resolvedFileIds } = resolveJsModuleGraph(
              virtualFile,
              projectFiles
            );
            if (createdBlobUrlsCollector) {
              createdBlobUrlsCollector.push(...createdBlobUrls);
            }
            resolvedFileIds.forEach((id) => embeddedFileIds.add(id));
            return `<script type="module" src="${entryBlobUrl}"></script>`;
          }

          return match;
        }
      );

      // 4. Auto-inject companion & shared CSS files:
      // - CSS files with the same base name as the HTML file (e.g. divisor.css for divisor.html)
      // - Generic / shared CSS files (e.g. style.css, reset.css, global.css)
      // - Exclude only CSS files that explicitly belong to a DIFFERENT HTML file in the project
      const mainBaseName = mainHtmlFile.name.replace(/\.[^/.]+$/, '').toLowerCase();
      const allCssFiles = projectFiles.filter(
        (f) => f.language === 'css' || f.name.toLowerCase().endsWith('.css')
      );

      const unlinkedCssFiles = allCssFiles.filter((f) => {
        if (embeddedFileIds.has(f.id)) return false;
        const fBaseName = f.name.replace(/\.[^/.]+$/, '').toLowerCase();
        if (fBaseName === mainBaseName) return true;
        // Check if this CSS file is a companion for another HTML file in the workspace
        const belongsToOtherHtml = projectFiles.some(
          (other) =>
            other.id !== mainHtmlFile.id &&
            isRealHtmlFile(other) &&
            other.name.replace(/\.[^/.]+$/, '').toLowerCase() === fBaseName
        );
        if (belongsToOtherHtml) return false;
        return true;
      });

      const remainingCss = unlinkedCssFiles
        .map((f) => {
          embeddedFileIds.add(f.id);
          const rawCssContent = activeFileId && f.id === activeFileId ? code : (f.content || '');
          const resolved = resolveCssImports(
            rawCssContent,
            f.path || f.name,
            projectFiles,
            new Set(),
            embeddedFileIds
          );
          return `/* Injetado de: ${f.path || f.name} */\n${resolved}`;
        })
        .join('\n\n');

      // 5. Auto-inject companion & shared JS files:
      // - JS files with the same base name as the HTML file (e.g. portal.js for portal.html)
      // - Generic / shared JS files (e.g. script.js, app.js, main.js)
      // - Exclude only JS files that explicitly belong to a DIFFERENT HTML file in the project
      const allJsFiles = projectFiles.filter(
        (f) =>
          (f.language === 'javascript' ||
            f.language === 'typescript' ||
            f.name.toLowerCase().endsWith('.js') ||
            f.name.toLowerCase().endsWith('.ts')) &&
          !f.name.toLowerCase().endsWith('.py')
      );

      const unlinkedJsFiles = allJsFiles.filter((f) => {
        if (embeddedFileIds.has(f.id)) return false;
        const fBaseName = f.name.replace(/\.[^/.]+$/, '').toLowerCase();
        if (fBaseName === mainBaseName) return true;
        // Check if this JS file is a companion for another HTML file in the workspace
        const belongsToOtherHtml = projectFiles.some(
          (other) =>
            other.id !== mainHtmlFile.id &&
            isRealHtmlFile(other) &&
            other.name.replace(/\.[^/.]+$/, '').toLowerCase() === fBaseName
        );
        if (belongsToOtherHtml) return false;
        return true;
      });

      const remainingJsScripts = unlinkedJsFiles
        .map((f) => {
          embeddedFileIds.add(f.id);
          const scriptContent = activeFileId && f.id === activeFileId ? code : (f.content || '');
          // Detect actual ES module imports/exports (not just comments or word occurrences)
          const hasRealModuleSyntax = /(?:^|[;\s])(?:import\s+(?:(?:\*|[\w{}\s,]+)\s+from\s+)?['"][^'"]+['"]|export\s+(?:default\s+|const\s+|let\s+|var\s+|function\s+|class\s+|{[\w\s,]+}))/m.test(
            scriptContent
          );

          if (hasRealModuleSyntax) {
            const virtualScriptFile = { ...f, content: scriptContent };
            const { entryBlobUrl, createdBlobUrls, resolvedFileIds } = resolveJsModuleGraph(
              virtualScriptFile,
              projectFiles
            );
            if (createdBlobUrlsCollector) {
              createdBlobUrlsCollector.push(...createdBlobUrls);
            }
            resolvedFileIds.forEach((id) => embeddedFileIds.add(id));
            return `<script type="module" src="${entryBlobUrl}" data-source="${f.path || f.name}"></script>`;
          }
          return `<script data-source="${f.path || f.name}">\n// Injetado de: ${f.path || f.name}\ntry {\n${scriptContent}\n} catch(err) {\n  console.error('[Script Error ${f.path || f.name}]:', err);\n}\n<\/script>`;
        })
        .join('\n');

      // Wrap in complete HTML document if missing <html> or <!DOCTYPE
      if (!combinedHtml.includes('<html') && !combinedHtml.includes('<!DOCTYPE')) {
        combinedHtml = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${mainHtmlFile.name}</title>
  ${remainingCss ? `\n<style id="project-unlinked-styles">\n${remainingCss}\n</style>` : ''}
</head>
<body>
  ${combinedHtml}
  ${remainingJsScripts ? `\n${remainingJsScripts}` : ''}
</body>
</html>`;
        return injectConsoleBridge(combinedHtml);
      }

      // Inject unlinked CSS into head
      if (remainingCss) {
        const styleTag = `<style id="project-unlinked-styles">\n${remainingCss}\n</style>`;
        if (combinedHtml.includes('</head>')) {
          combinedHtml = combinedHtml.replace('</head>', `${styleTag}\n</head>`);
        } else if (combinedHtml.includes('<body')) {
          combinedHtml = combinedHtml.replace(/<body\b/i, `${styleTag}\n<body`);
        } else {
          combinedHtml = `${styleTag}\n${combinedHtml}`;
        }
      }

      // Inject unlinked JS before body close
      if (remainingJsScripts) {
        if (combinedHtml.includes('</body>')) {
          combinedHtml = combinedHtml.replace('</body>', `${remainingJsScripts}\n</body>`);
        } else {
          combinedHtml = combinedHtml + `\n${remainingJsScripts}`;
        }
      }

      return injectConsoleBridge(combinedHtml);
    }
  }

  // Fallback for single file rendering
  if (language === 'html') {
    let finalHtml = code;
    if (!finalHtml || !finalHtml.trim()) {
      finalHtml = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Novo Documento HTML</title>
  <style>
    body {
      font-family: system-ui, -apple-system, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      background: #0f172a;
      color: #94a3b8;
      text-align: center;
      padding: 24px;
      box-sizing: border-box;
    }
    .box {
      padding: 32px 24px;
      border: 1px dashed #334155;
      border-radius: 12px;
      background: #1e293b;
      max-width: 440px;
      width: 100%;
    }
    h3 { margin-top: 0; color: #f8fafc; font-size: 16px; font-weight: 600; }
    p { font-size: 13px; line-height: 1.5; margin-bottom: 0; }
  </style>
</head>
<body>
  <div class="box">
    <h3>Documento HTML Vazio</h3>
    <p>Digite ou cole seu código HTML no editor à esquerda para ver o resultado em tempo real.</p>
  </div>
</body>
</html>`;
      return injectConsoleBridge(finalHtml);
    }

    if (!finalHtml.includes('<html') && !finalHtml.includes('<!DOCTYPE')) {
      finalHtml = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; padding: 20px; color: #1e293b; background: #ffffff; }
  </style>
</head>
<body>
  ${finalHtml}
</body>
</html>`;
    }

    return injectConsoleBridge(finalHtml);
  }

  if (language === 'css') {
    const cssHtml = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: system-ui, -apple-system, sans-serif;
      padding: 24px;
      background: #f8fafc;
      color: #0f172a;
    }
    .preview-container { max-width: 600px; margin: 0 auto; }
    /* Estilos do usuário */
    ${code}
  </style>
</head>
<body>
  <div class="preview-container">
    <h2 style="margin-top:0">Prévia de Estilos CSS</h2>
    <p>Elementos de teste para visualização das classes:</p>
    <div style="margin: 16px 0; display: flex; gap: 10px; flex-wrap: wrap;">
      <button class="btn primary">Botão Primário</button>
      <button class="btn secondary">Botão Secundário</button>
    </div>
    <div class="card" style="padding: 16px; border: 1px solid #cbd5e1; border-radius: 8px; margin: 16px 0; background: white;">
      <h3 style="margin-top:0">Exemplo de Card</h3>
      <p style="margin-bottom:0">Este contêiner foi estilizado com as regras CSS do editor.</p>
    </div>
    <input type="text" placeholder="Campo de input..." style="padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 6px; width: 100%; max-width: 320px;" />
  </div>
</body>
</html>`;
    return injectConsoleBridge(cssHtml);
  }

  if (language === 'javascript' || language === 'typescript') {
    const jsHtml = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      margin: 0;
      padding: 16px;
      background: #0f172a;
      color: #f8fafc;
      font-family: 'JetBrains Mono', monospace, ui-monospace;
      font-size: 13px;
    }
    #console { white-space: pre-wrap; line-height: 1.6; }
    .log { color: #38bdf8; border-bottom: 1px solid #1e293b; padding: 4px 0; }
    .error { color: #f87171; border-bottom: 1px solid #1e293b; padding: 4px 0; }
    .warn { color: #facc15; border-bottom: 1px solid #1e293b; padding: 4px 0; }
    .header { font-weight: bold; color: #94a3b8; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #334155; }
  </style>
</head>
<body>
  <div class="header">Console de Execução JavaScript</div>
  <div id="console"></div>
  <div id="app" style="margin-top: 16px;"></div>

  <script>
    const consoleDiv = document.getElementById('console');
    function appendLog(type, args) {
      const line = document.createElement('div');
      line.className = type;
      line.textContent = '> ' + args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' ');
      consoleDiv.appendChild(line);
    }
    console.log = (...args) => appendLog('log', args);
    console.error = (...args) => appendLog('error', args);
    console.warn = (...args) => appendLog('warn', args);

    window.onerror = function(msg, url, line) {
      appendLog('error', ['Erro linha ' + line + ': ' + msg]);
      return false;
    };

    try {
      ${code}
    } catch(err) {
      console.error(err.message);
    }
  <\/script>
</body>
</html>`;
    return injectConsoleBridge(jsHtml);
  }

  if (language === 'markdown') {
    // Basic Markdown formatting preview
    const escaped = code
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    const mdHtml = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: system-ui, -apple-system, sans-serif;
      line-height: 1.6;
      color: #334155;
      background: #ffffff;
      padding: 32px 24px;
      max-width: 720px;
      margin: 0 auto;
    }
    h1, h2, h3 { color: #0f172a; margin-top: 1.5em; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; }
    code { font-family: monospace; background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; }
    pre { background: #0f172a; color: #f8fafc; padding: 16px; border-radius: 8px; overflow-x: auto; }
    pre code { background: transparent; color: inherit; padding: 0; }
    blockquote { border-left: 4px solid #3b82f6; margin-left: 0; padding-left: 16px; color: #64748b; }
  </style>
</head>
<body>
  <pre style="white-space: pre-wrap; font-family: inherit; background: transparent; color: inherit; padding: 0;">${escaped}</pre>
</body>
</html>`;
    return injectConsoleBridge(mdHtml);
  }

  if (language === 'json') {
    const jsonHtml = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: monospace; padding: 20px; background: #0f172a; color: #38bdf8; font-size: 13px; }
  </style>
</head>
<body>
  <pre id="json"></pre>
  <script>
    try {
      const parsed = JSON.parse(${JSON.stringify(code)});
      document.getElementById('json').textContent = JSON.stringify(parsed, null, 2);
    } catch(e) {
      document.getElementById('json').textContent = 'JSON inválido: ' + e.message;
      document.body.style.color = '#f87171';
    }
  <\/script>
</body>
</html>`;
    return injectConsoleBridge(jsonHtml);
  }

  const fallbackHtml = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: monospace; padding: 24px; background: #0f172a; color: #e2e8f0; font-size: 13px; line-height: 1.6; }
  </style>
</head>
<body>
  <div style="color: #94a3b8; margin-bottom: 12px; font-weight: bold;">Código ${language.toUpperCase()}</div>
  <pre>${code.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
</body>
</html>`;
  return injectConsoleBridge(fallbackHtml);
}
