import { ProjectFile, SupportedLanguage } from '../types';

export function detectLanguageFromName(filename: string): SupportedLanguage {
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'html':
    case 'htm':
      return 'html';
    case 'css':
      return 'css';
    case 'js':
    case 'jsx':
    case 'mjs':
      return 'javascript';
    case 'ts':
    case 'tsx':
      return 'typescript';
    case 'py':
      return 'python';
    case 'json':
      return 'json';
    default:
      return 'html';
  }
}

export function getDefaultFileContent(name: string, language: SupportedLanguage): string {
  switch (language) {
    case 'html':
      return `<!DOCTYPE html>\n<html lang="pt-BR">\n<head>\n  <meta charset="UTF-8">\n  <title>${name}</title>\n</head>\n<body>\n  <div>Novo arquivo HTML</div>\n</body>\n</html>`;
    case 'css':
      return `/* Estilos para ${name} */\n.container {\n  padding: 16px;\n}`;
    case 'javascript':
      return `// Script ${name}\nconsole.log('${name} inicializado');\n`;
    case 'typescript':
      return `// TypeScript ${name}\nexport const greeting: string = 'Olá';\n`;
    case 'python':
      return `# Python script: ${name}\ndef main():\n    print("Olá do ${name}")\n\nif __name__ == "__main__":\n    main()\n`;
    case 'json':
      return `{\n  "name": "${name}",\n  "version": "1.0.0"\n}`;
    default:
      return '';
  }
}

export const DEFAULT_PROJECT_FILES: ProjectFile[] = [
  {
    id: 'file-index-html',
    name: 'index.html',
    language: 'html',
    content: `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Projeto Interativo</title>
</head>
<body>
  <div class="card">
    <div class="badge">PROJETO INTEGRADO</div>
    <h1 id="title">Painel Web Multi-Arquivos</h1>
    <p>HTML, CSS e JavaScript trabalhando juntos em harmonia com renderização em tempo real.</p>
    
    <div class="actions">
      <button id="counterBtn" class="btn btn-primary">Contador: 0</button>
      <button id="colorBtn" class="btn btn-secondary">Mudar Fundo</button>
    </div>
  </div>
</body>
</html>`,
    history: [],
    historyIndex: 0,
  },
  {
    id: 'file-style-css',
    name: 'style.css',
    language: 'css',
    content: `body {
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  margin: 0;
  padding: 32px 16px;
  background: #0f172a;
  color: #f8fafc;
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  transition: background 0.3s ease;
}

.card {
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 16px;
  padding: 32px;
  max-width: 440px;
  width: 100%;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
  text-align: center;
}

.badge {
  display: inline-block;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.05em;
  padding: 4px 10px;
  border-radius: 9999px;
  background: rgba(56, 189, 248, 0.15);
  color: #38bdf8;
  margin-bottom: 16px;
}

h1 {
  margin: 0 0 12px 0;
  color: #f8fafc;
  font-size: 22px;
}

p {
  color: #94a3b8;
  line-height: 1.6;
  font-size: 14px;
  margin-bottom: 24px;
}

.actions {
  display: flex;
  gap: 12px;
  justify-content: center;
  flex-wrap: wrap;
}

.btn {
  padding: 10px 18px;
  font-size: 13px;
  font-weight: 600;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-primary {
  background: #38bdf8;
  color: #0f172a;
}

.btn-primary:hover {
  background: #7dd3fc;
  transform: translateY(-1px);
}

.btn-secondary {
  background: #334155;
  color: #f8fafc;
}

.btn-secondary:hover {
  background: #475569;
}`,
    history: [],
    historyIndex: 0,
  },
  {
    id: 'file-script-js',
    name: 'script.js',
    language: 'javascript',
    content: `let count = 0;
const counterBtn = document.getElementById('counterBtn');
const colorBtn = document.getElementById('colorBtn');

const colors = ['#0f172a', '#1e1b4b', '#14532d', '#701a75', '#1e293b'];
let colorIndex = 0;

if (counterBtn) {
  counterBtn.addEventListener('click', () => {
    count++;
    counterBtn.textContent = 'Contador: ' + count;
    console.log('Contador incrementado para:', count);
  });
}

if (colorBtn) {
  colorBtn.addEventListener('click', () => {
    colorIndex = (colorIndex + 1) % colors.length;
    document.body.style.background = colors[colorIndex];
    console.log('Cor alterada para:', colors[colorIndex]);
  });
}`,
    history: [],
    historyIndex: 0,
  },
];
