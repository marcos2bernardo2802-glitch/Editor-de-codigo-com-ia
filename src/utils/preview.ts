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
  var oldLog = console.log;
  var oldErr = console.error;
  var oldWarn = console.warn;
  var oldInfo = console.info;
  console.log = function() { send('log', arguments); if(oldLog) oldLog.apply(console, arguments); };
  console.error = function() { send('error', arguments); if(oldErr) oldErr.apply(console, arguments); };
  console.warn = function() { send('warn', arguments); if(oldWarn) oldWarn.apply(console, arguments); };
  console.info = function() { send('info', arguments); if(oldInfo) oldInfo.apply(console, arguments); };
  window.addEventListener('error', function(e) {
    send('error', [e.message || 'Erro de execução']);
  });
})();
</script>`;

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
  const normTarget = normalizeFilePath(targetPath).toLowerCase();
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
  return found;
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
      matchedFile.content,
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
 * Generates the preview HTML for the iframe.
 * Supports:
 * - Multi-file linking (<link rel="stylesheet">, <script src="...">)
 * - ES modules (<script type="module" src="...">) via Blob URLs
 * - Recursive CSS @import resolution
 * - Collection of created Blob URLs for cleanup
 */
export function generatePreviewHtml(
  code: string,
  language: SupportedLanguage,
  projectFiles?: ProjectFile[],
  createdBlobUrlsCollector?: string[]
): string {
  // If multi-file project is active
  if (projectFiles && projectFiles.length > 0) {
    // 1. Find main HTML file (index.html, or first .html file, or active file if html)
    const mainHtmlFile =
      projectFiles.find((f) => (f.path || f.name).toLowerCase() === 'index.html') ||
      projectFiles.find((f) => (f.path || f.name).toLowerCase().endsWith('/index.html')) ||
      projectFiles.find((f) => f.language === 'html' || f.name.endsWith('.html')) ||
      (language === 'html' ? { content: code, name: 'index.html', path: 'index.html', language: 'html' as SupportedLanguage, id: 'temp' } : null);

    if (mainHtmlFile) {
      let combinedHtml = mainHtmlFile.content;
      const htmlPath = normalizeFilePath(mainHtmlFile.path || mainHtmlFile.name);
      const htmlDir = htmlPath.includes('/') ? htmlPath.slice(0, htmlPath.lastIndexOf('/')) : '';

      const embeddedFileIds = new Set<string>();
      if (mainHtmlFile.id) {
        embeddedFileIds.add(mainHtmlFile.id);
      }

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
          const resolvedCss = resolveCssImports(
            matchedFile.content,
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

              if (isModule) {
                // ES Module script: generate Blob URL graph
                const { entryBlobUrl, createdBlobUrls, resolvedFileIds } = resolveJsModuleGraph(
                  matchedFile,
                  projectFiles
                );
                if (createdBlobUrlsCollector) {
                  createdBlobUrlsCollector.push(...createdBlobUrls);
                }
                resolvedFileIds.forEach((id) => embeddedFileIds.add(id));

                return `<script type="module" src="${entryBlobUrl}" data-source="${matchedFile.path || matchedFile.name}"></script>`;
              } else {
                // Classic script: inline as text
                return `<script data-source="${matchedFile.path || matchedFile.name}">\n// Injetado de: ${matchedFile.path || matchedFile.name}\ntry {\n${matchedFile.content}\n} catch(err) {\n  console.error('[Script Error ${matchedFile.path || matchedFile.name}]:', err);\n}\n<\/script>`;
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

      // 4. Bundle any remaining CSS files that weren't explicitly linked in the HTML
      const remainingCss = projectFiles
        .filter((f) => (f.language === 'css' || f.name.endsWith('.css')) && !embeddedFileIds.has(f.id))
        .map((f) => {
          embeddedFileIds.add(f.id);
          const resolved = resolveCssImports(
            f.content,
            f.path || f.name,
            projectFiles,
            new Set(),
            embeddedFileIds
          );
          return `/* File: ${f.path || f.name} */\n${resolved}`;
        })
        .join('\n\n');

      // 5. Bundle any remaining JS files that weren't explicitly linked
      const remainingJsFiles = projectFiles.filter(
        (f) =>
          (f.language === 'javascript' || f.language === 'typescript' || f.name.endsWith('.js') || f.name.endsWith('.ts')) &&
          !embeddedFileIds.has(f.id)
      );

      const remainingJsScripts = remainingJsFiles
        .map((f) => {
          embeddedFileIds.add(f.id);
          // Check if file uses ES modules (import/export)
          const usesModules = /\b(import\s+|export\s+)/.test(f.content);
          if (usesModules) {
            const { entryBlobUrl, createdBlobUrls, resolvedFileIds } = resolveJsModuleGraph(
              f,
              projectFiles
            );
            if (createdBlobUrlsCollector) {
              createdBlobUrlsCollector.push(...createdBlobUrls);
            }
            resolvedFileIds.forEach((id) => embeddedFileIds.add(id));
            return `<script type="module" src="${entryBlobUrl}" data-source="${f.path || f.name}"></script>`;
          }
          return `<script data-source="${f.path || f.name}">\n// File: ${f.path || f.name}\ntry {\n${f.content}\n} catch(err) {\n  console.error('[Script Error ${f.path || f.name}]:', err);\n}\n<\/script>`;
        })
        .join('\n');

      // Wrap if not a full HTML document
      if (!combinedHtml.includes('<html') && !combinedHtml.includes('<!DOCTYPE')) {
        combinedHtml = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Projeto Preview</title>
  ${remainingCss ? `<style id="project-unlinked-styles">\n${remainingCss}\n</style>` : ''}
</head>
<body>
  ${combinedHtml}
  ${CONSOLE_INJECT_SCRIPT}
  ${remainingJsScripts ? `\n${remainingJsScripts}` : ''}
</body>
</html>`;
        return combinedHtml;
      }

      // Inject unlinked CSS into head
      if (remainingCss) {
        if (combinedHtml.includes('</head>')) {
          combinedHtml = combinedHtml.replace(
            '</head>',
            `<style id="project-unlinked-styles">\n${remainingCss}\n</style>\n</head>`
          );
        } else {
          combinedHtml = `<style id="project-unlinked-styles">\n${remainingCss}\n</style>\n` + combinedHtml;
        }
      }

      // Inject console bridge & unlinked JS before body close
      const scriptInjection = `${CONSOLE_INJECT_SCRIPT}\n${remainingJsScripts}`;
      if (combinedHtml.includes('</body>')) {
        combinedHtml = combinedHtml.replace('</body>', `${scriptInjection}\n</body>`);
      } else {
        combinedHtml = combinedHtml + `\n${scriptInjection}`;
      }

      return combinedHtml;
    }
  }

  // Fallback for single file rendering
  if (language === 'html') {
    let finalHtml = code;
    if (!code.includes('<html') && !code.includes('<!DOCTYPE')) {
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
  ${code}
</body>
</html>`;
    }

    if (finalHtml.includes('</body>')) {
      return finalHtml.replace('</body>', `${CONSOLE_INJECT_SCRIPT}\n</body>`);
    }
    return finalHtml + `\n${CONSOLE_INJECT_SCRIPT}`;
  }

  if (language === 'css') {
    return `<!DOCTYPE html>
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
  }

  if (language === 'javascript' || language === 'typescript') {
    return `<!DOCTYPE html>
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
  }

  if (language === 'markdown') {
    // Basic Markdown formatting preview
    const escaped = code
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    return `<!DOCTYPE html>
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
  }

  if (language === 'json') {
    return `<!DOCTYPE html>
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
  }

  return `<!DOCTYPE html>
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
}
