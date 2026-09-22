import { SupportedLanguage, ProjectFile } from '../types';

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

export function generatePreviewHtml(
  code: string,
  language: SupportedLanguage,
  projectFiles?: ProjectFile[]
): string {
  // If multi-file project is active, create an integrated HTML preview bundling CSS and JS
  if (projectFiles && projectFiles.length > 1) {
    const htmlFile =
      projectFiles.find((f) => f.language === 'html' || f.name.endsWith('.html')) ||
      (language === 'html' ? { content: code, name: 'index.html', language: 'html' as SupportedLanguage } : null);

    const cssFiles = projectFiles.filter((f) => f.language === 'css' || f.name.endsWith('.css'));
    const jsFiles = projectFiles.filter(
      (f) =>
        (f.language === 'javascript' || f.language === 'typescript' || f.name.endsWith('.js') || f.name.endsWith('.ts'))
    );

    if (htmlFile) {
      let combinedHtml = htmlFile.content;

      // Extract all styles
      const bundledCss = cssFiles
        .map((f) => `/* File: ${f.name} */\n${f.content}`)
        .join('\n\n');

      // Extract all scripts
      const bundledJs = jsFiles
        .map((f) => `// File: ${f.name}\n${f.content}`)
        .join('\n\n');

      // If document is missing basic structure
      if (!combinedHtml.includes('<html') && !combinedHtml.includes('<!DOCTYPE')) {
        combinedHtml = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Projeto Preview</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; padding: 16px; margin: 0; }
    ${bundledCss}
  </style>
</head>
<body>
  ${combinedHtml}
  <script>
    try {
      ${bundledJs}
    } catch(err) {
      console.error(err);
    }
  <\/script>
</body>
</html>`;
        return combinedHtml;
      }

      // Inject bundled styles into head
      if (bundledCss) {
        if (combinedHtml.includes('</head>')) {
          combinedHtml = combinedHtml.replace(
            '</head>',
            `<style id="project-bundled-styles">\n${bundledCss}\n</style>\n</head>`
          );
        } else {
          combinedHtml = `<style id="project-bundled-styles">\n${bundledCss}\n</style>\n` + combinedHtml;
        }
      }

      // Inject bundled scripts before body close
      if (bundledJs) {
        const scriptTag = `<script id="project-bundled-scripts">
try {
${bundledJs}
} catch(err) {
  console.error('[Projeto JS Error]:', err);
}
<\/script>`;
        if (combinedHtml.includes('</body>')) {
          combinedHtml = combinedHtml.replace('</body>', `${CONSOLE_INJECT_SCRIPT}\n${scriptTag}\n</body>`);
        } else {
          combinedHtml = combinedHtml + `\n${CONSOLE_INJECT_SCRIPT}\n${scriptTag}`;
        }
      } else {
        if (combinedHtml.includes('</body>')) {
          combinedHtml = combinedHtml.replace('</body>', `${CONSOLE_INJECT_SCRIPT}\n</body>`);
        } else {
          combinedHtml = combinedHtml + `\n${CONSOLE_INJECT_SCRIPT}`;
        }
      }

      return combinedHtml;
    }
  }

  // Single file or fallback rendering
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
