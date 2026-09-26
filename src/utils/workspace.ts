import { ProjectFile, SupportedLanguage, ChatMessage, ChatHistoryItem } from '../types';

export function normalizeFilePath(inputPath: string): string {
  let cleaned = inputPath.trim().replace(/\\/g, '/');
  // Remove leading slashes and ./
  cleaned = cleaned.replace(/^\.?\/+/, '');
  // Remove duplicate slashes
  cleaned = cleaned.replace(/\/+/g, '/');
  return cleaned;
}

export function extractFileNameFromPath(fullPath: string): string {
  const normalized = normalizeFilePath(fullPath);
  const segments = normalized.split('/');
  return segments[segments.length - 1] || normalized;
}

export function detectLanguageFromName(filename: string): SupportedLanguage {
  const parts = filename.split('.');
  const ext = parts.length > 1 ? parts.pop()?.toLowerCase() : '';
  switch (ext) {
    case 'html':
    case 'htm':
      return 'html';
    case 'css':
      return 'css';
    case 'js':
    case 'jsx':
    case 'mjs':
    case 'cjs':
      return 'javascript';
    case 'ts':
    case 'tsx':
      return 'typescript';
    case 'py':
    case 'pyw':
      return 'python';
    case 'json':
      return 'json';
    case 'md':
    case 'markdown':
    case 'yaml':
    case 'yml':
    case 'toml':
    case 'ini':
    case 'env':
    case 'txt':
    case 'sh':
    case 'bash':
    case 'sql':
    case 'log':
    case 'gitignore':
    case 'continueignore':
      return 'markdown';
    default:
      return 'markdown';
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
    case 'markdown':
      return `# ${name}\n\nDocumentação e anotações do projeto.\n`;
    default:
      return '';
  }
}

export const DEFAULT_PROJECT_FILES: ProjectFile[] = [
  {
    id: 'file-index-html',
    path: 'index.html',
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
    path: 'style.css',
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
    path: 'script.js',
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

export interface ProjectContextSummary {
  hasMultiFiles: boolean;
  contextText: string;
}

/**
 * Constrói o contexto textual de múltiplos arquivos para ser injetado nos prompts da IA (Gemini ou Colab/Ollama).
 * Inclui árvore de caminhos, conteúdo dos arquivos com cabeçalhos e controle de limite de caracteres.
 */
export function buildProjectContextPrompt(
  files: Array<{ path?: string; name?: string; language?: string; content?: string }> | undefined,
  activeFilePath?: string,
  maxTotalChars = 60000
): ProjectContextSummary {
  if (!Array.isArray(files) || files.length <= 1) {
    return { hasMultiFiles: false, contextText: '' };
  }

  const activePathNorm = (activeFilePath || '').trim().toLowerCase();

  // 1. Árvore de arquivos do projeto
  const treeLines = files.map((f) => {
    const filePath = f.path || f.name || 'sem-nome';
    const isThisActive =
      activePathNorm && filePath.trim().toLowerCase() === activePathNorm;
    return `- ${filePath}${isThisActive ? ' (arquivo ativo, foco do usuário)' : ''}`;
  });

  const treeHeader = `ESTRUTURA DO PROJETO (${files.length} arquivos):\n${treeLines.join('\n')}`;

  // 2. Localiza o arquivo ativo para priorização total
  let activeIndex = files.findIndex(
    (f) => activePathNorm && (f.path || f.name || '').trim().toLowerCase() === activePathNorm
  );
  if (activeIndex === -1) {
    activeIndex = 0;
  }

  const activeFile = files[activeIndex];
  const activeFileLength = activeFile?.content ? activeFile.content.length : 0;
  let remainingBudget = Math.max(maxTotalChars - activeFileLength, 0);

  const includedFileBlocks: string[] = [];
  const omittedFiles: string[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const isThisActive = i === activeIndex;
    const filePath = file.path || file.name || `arquivo-${i + 1}`;
    const fileLang = file.language || 'text';
    const fileContent = typeof file.content === 'string' ? file.content : '';

    if (isThisActive) {
      // O arquivo ativo é sempre incluído por inteiro
      includedFileBlocks.push(
        `--- Arquivo: ${filePath} (ARQUIVO ATIVO, FOCO DO USUÁRIO) [${fileLang}] ---\n\`\`\`${fileLang}\n${fileContent}\n\`\`\``
      );
    } else {
      if (remainingBudget >= 200) {
        if (fileContent.length <= remainingBudget) {
          remainingBudget -= fileContent.length;
          includedFileBlocks.push(
            `--- Arquivo: ${filePath} [${fileLang}] ---\n\`\`\`${fileLang}\n${fileContent}\n\`\`\``
          );
        } else {
          // Trunca o arquivo para caber no orçamento restante
          const truncated = fileContent.slice(0, remainingBudget);
          remainingBudget = 0;
          includedFileBlocks.push(
            `--- Arquivo: ${filePath} [${fileLang}] (parcial, truncado por limite de tamanho) ---\n\`\`\`${fileLang}\n${truncated}\n... [restante do arquivo omitido por limite de tamanho]\n\`\`\``
          );
          omittedFiles.push(`${filePath} (parcialmente truncado)`);
        }
      } else {
        omittedFiles.push(filePath);
      }
    }
  }

  let warningSection = '';
  if (omittedFiles.length > 0) {
    warningSection = `\nAVISO: Os seguintes arquivos foram omitidos ou truncados por limite de contexto (${maxTotalChars} caracteres):\n${omittedFiles
      .map((name) => `• ${name}`)
      .join('\n')}\n`;
  }

  const contextText = `${treeHeader}\n\nCONTEÚDO DOS ARQUIVOS DO PROJETO:\n${includedFileBlocks.join('\n\n')}${warningSection ? `\n\n${warningSection}` : ''}`;

  return { hasMultiFiles: true, contextText };
}

export function buildChatHistoryPayload(messages: ChatMessage[], limit = 10): ChatHistoryItem[] {
  if (!Array.isArray(messages) || messages.length === 0) return [];

  // Pega as mensagens que não estejam em streaming ativo
  const completed = messages.filter((m) => !m.streaming);
  const sliced = completed.slice(-limit);

  const payload: ChatHistoryItem[] = [];
  for (const msg of sliced) {
    if (msg.type === 'instruction') {
      payload.push({
        role: 'user',
        mode: msg.mode || 'plan',
        text: (msg.text || '').trim(),
      });
    } else if (msg.type === 'explanation') {
      payload.push({
        role: 'assistant',
        mode: msg.mode || 'plan',
        text: (msg.text || '').trim(),
      });
    } else if (msg.type === 'proposal') {
      payload.push({
        role: 'assistant',
        mode: msg.mode || 'execute',
        text: `Alteração de código aplicada (escopo: ${msg.scope || 'full'})`,
      });
    }
    // Ignorar type === 'error' ou 'info' ou 'chat' não suportados, e nunca incluir msg.thinking
  }

  return payload;
}

