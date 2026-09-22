import { SupportedLanguage } from '../types';

/**
 * Intelligent client-side code formatter for HTML, CSS, JS, TS, JSON, and Python
 */
export function formatCode(code: string, language: SupportedLanguage): string {
  if (!code || !code.trim()) return code;

  try {
    switch (language) {
      case 'json':
        return formatJson(code);
      case 'html':
        return formatHtml(code);
      case 'css':
        return formatCss(code);
      case 'javascript':
      case 'typescript':
        return formatJs(code);
      case 'python':
        return formatPython(code);
      default:
        return code;
    }
  } catch (err) {
    console.warn('Erro na formatação de código:', err);
    return code;
  }
}

function formatJson(code: string): string {
  const parsed = JSON.parse(code);
  return JSON.stringify(parsed, null, 2);
}

function formatHtml(html: string): string {
  const tab = '  ';
  let result = '';
  let indent = 0;
  
  // Normalize whitespace between tags
  const clean = html
    .replace(/>\s*</g, '><')
    .replace(/<!DOCTYPE[^>]*>/i, (m) => m + '\n')
    .trim();

  // Tokenize HTML tags and text content
  const tokens = clean.split(/(<\/?[a-zA-Z0-9\-_]+(?:\s+[^>]*?)?>|<!--[\s\S]*?-->)/g).filter(Boolean);

  const voidTags = new Set([
    'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
    'link', 'meta', 'param', 'source', 'track', 'wbr'
  ]);

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i].trim();
    if (!token) continue;

    const isComment = token.startsWith('<!--');
    const isClosing = token.startsWith('</');
    const isOpening = token.startsWith('<') && !isClosing && !isComment;
    const tagNameMatch = token.match(/^<\/?([a-zA-Z0-9\-_]+)/);
    const tagName = tagNameMatch ? tagNameMatch[1].toLowerCase() : '';
    const isVoid = isOpening && (voidTags.has(tagName) || token.endsWith('/>'));

    if (isClosing) {
      indent = Math.max(0, indent - 1);
    }

    // Indent and add newline if not empty
    if (result && !result.endsWith('\n')) {
      result += '\n';
    }

    result += tab.repeat(indent) + token;

    if (isOpening && !isVoid) {
      indent++;
    }
  }

  return result.trim();
}

function formatCss(css: string): string {
  const tab = '  ';
  let formatted = '';
  let indent = 0;

  // Normalize braces and semicolons
  const clean = css
    .replace(/\s*\{\s*/g, ' {\n')
    .replace(/\s*;\s*/g, ';\n')
    .replace(/\s*\}\s*/g, '\n}\n')
    .replace(/\n\s*\n/g, '\n');

  const lines = clean.split('\n');

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith('}')) {
      indent = Math.max(0, indent - 1);
    }

    formatted += tab.repeat(indent) + line + '\n';

    if (line.endsWith('{')) {
      indent++;
    }
  }

  return formatted.trim();
}

function formatJs(code: string): string {
  const tab = '  ';
  let formatted = '';
  let indent = 0;

  const lines = code.split('\n');

  for (let rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      formatted += '\n';
      continue;
    }

    // If line starts with closing brace/bracket/paren
    if (/^[}\])]/.test(line)) {
      indent = Math.max(0, indent - 1);
    }

    formatted += tab.repeat(indent) + line + '\n';

    // Check count of open vs close in line
    const openBraces = (line.match(/[{\[(]/g) || []).length;
    const closeBraces = (line.match(/[}\])]/g) || []).length;
    const diff = openBraces - closeBraces;

    if (diff > 0) {
      indent += diff;
    } else if (diff < 0 && !/^[}\])]/.test(line)) {
      indent = Math.max(0, indent + diff);
    }
  }

  // Remove more than 2 consecutive newlines
  return formatted.replace(/\n{3,}/g, '\n\n').trim();
}

function formatPython(code: string): string {
  const lines = code.split('\n');
  const tab = '    ';
  let formatted = '';
  let indent = 0;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      formatted += '\n';
      continue;
    }

    // Dedent on else, elif, except, finally
    if (/^(else|elif|except|finally):/.test(line)) {
      const currentIndent = Math.max(0, indent - 1);
      formatted += tab.repeat(currentIndent) + line + '\n';
      continue;
    }

    formatted += tab.repeat(indent) + line + '\n';

    if (line.endsWith(':')) {
      indent++;
    } else if (/^(return|pass|break|continue)/.test(line)) {
      // Potentially decrease indent after terminal statement if next line isn't nested
      indent = Math.max(0, indent - 1);
    }
  }

  return formatted.replace(/\n{3,}/g, '\n\n').trim();
}
