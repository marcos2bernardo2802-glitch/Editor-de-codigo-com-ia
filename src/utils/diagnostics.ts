import { parse } from '@babel/parser';
import { DiagnosticItem } from '../types';

/**
 * Standard void tags in HTML5 (tags that do not require and must not have a closing tag)
 */
const HTML_VOID_TAGS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
  '!doctype',
]);

/**
 * Translate and format Babel error messages into clear Portuguese explanations
 */
function formatBabelMessage(rawMsg: string): string {
  const clean = rawMsg.replace(/\s*\(\d+:\d+\)$/, '').trim();

  if (/unterminated string/i.test(clean)) {
    return 'Texto/string não terminada (aspas abertas sem fechamento).';
  }
  if (/unterminated template/i.test(clean)) {
    return 'Template string (crase `) não foi fechada.';
  }
  if (/unterminated comment/i.test(clean)) {
    return 'Comentário de bloco /* ... */ não foi fechado.';
  }
  if (/unexpected token/i.test(clean)) {
    return `Token ou símbolo inesperado: "${clean.replace(/.*unexpected token:?/i, '').trim()}".`;
  }
  if (/missing semicolon/i.test(clean)) {
    return 'Ponto e vírgula ausente ou expressão de código incompleta.';
  }
  if (/identifier.*has already been declared/i.test(clean)) {
    return 'Identificador/variável com nome duplicado no mesmo escopo.';
  }
  if (/unexpected reserved word/i.test(clean)) {
    return 'Uso inválido de palavra reservada da linguagem.';
  }
  if (/unclosed/i.test(clean)) {
    return `Elemento não fechado: ${clean}.`;
  }

  return clean;
}

/**
 * Validates JavaScript and TypeScript using @babel/parser
 */
export function validateJavaScript(
  code: string,
  lineOffset = 0,
  sourceName = 'JavaScript'
): DiagnosticItem[] {
  if (!code || !code.trim()) return [];
  const diagnostics: DiagnosticItem[] = [];

  try {
    const ast = parse(code, {
      sourceType: 'unambiguous',
      plugins: ['jsx', 'typescript'],
      errorRecovery: true,
    });

    if ((ast as any).errors && (ast as any).errors.length > 0) {
      for (const err of (ast as any).errors) {
        const line = (err.loc ? err.loc.line : 1) + lineOffset;
        const col = err.loc ? err.loc.column + 1 : 1;
        const msg = formatBabelMessage(err.message || 'Erro de sintaxe');

        diagnostics.push({
          id: `diag-js-${line}-${col}-${diagnostics.length}`,
          line,
          column: col,
          severity: 'error',
          message: msg,
          source: sourceName,
          suggestedPrompt: `Corrija o erro de sintaxe ${sourceName} na linha ${line}: ${msg}`,
        });
      }
    }
  } catch (err: any) {
    const line = (err.loc ? err.loc.line : 1) + lineOffset;
    const col = err.loc ? err.loc.column + 1 : 1;
    const msg = formatBabelMessage(err.message || 'Erro de sintaxe');

    diagnostics.push({
      id: `diag-js-fatal-${line}-${col}`,
      line,
      column: col,
      severity: 'error',
      message: msg,
      source: sourceName,
      suggestedPrompt: `Corrija o erro de sintaxe ${sourceName} na linha ${line}: ${msg}`,
    });
  }

  return diagnostics;
}

/**
 * Validates CSS syntax
 */
export function validateCss(
  code: string,
  lineOffset = 0,
  sourceName = 'CSS'
): DiagnosticItem[] {
  if (!code || !code.trim()) return [];
  const diagnostics: DiagnosticItem[] = [];
  const lines = code.split('\n');

  let openBraces = 0;
  let lastOpenLine = 1;
  let inComment = false;
  let commentStartLine = 1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const currentDocLine = i + 1 + lineOffset;

    for (let c = 0; c < line.length; c++) {
      const ch = line[c];
      const next = line[c + 1];

      if (inComment) {
        if (ch === '*' && next === '/') {
          inComment = false;
          c++;
        }
        continue;
      }

      if (ch === '/' && next === '*') {
        inComment = true;
        commentStartLine = currentDocLine;
        c++;
        continue;
      }

      if (ch === '{') {
        openBraces++;
        lastOpenLine = currentDocLine;
      } else if (ch === '}') {
        openBraces--;
        if (openBraces < 0) {
          diagnostics.push({
            id: `diag-css-extra-brace-${currentDocLine}`,
            line: currentDocLine,
            column: c + 1,
            severity: 'error',
            message: 'Chave de fechamento "}" excedente sem bloco "{" correspondente.',
            source: sourceName,
            suggestedPrompt: `Remova a chave excedente "}" na linha ${currentDocLine} do ${sourceName}.`,
          });
          openBraces = 0;
        }
      }
    }

    // Check for property missing colon or invalid declaration: e.g. "color red;"
    const trimmed = line.trim();
    if (
      openBraces > 0 &&
      trimmed &&
      !trimmed.startsWith('/*') &&
      !trimmed.endsWith('{') &&
      !trimmed.endsWith('}') &&
      !inComment
    ) {
      if (trimmed.includes(';') && !trimmed.includes(':')) {
        diagnostics.push({
          id: `diag-css-missing-colon-${currentDocLine}`,
          line: currentDocLine,
          severity: 'warning',
          message: 'Declaração CSS com ponto e vírgula mas sem dois-pontos ":" separando propriedade e valor.',
          source: sourceName,
          suggestedPrompt: `Corrija a sintaxe da propriedade CSS na linha ${currentDocLine}: "${trimmed}".`,
        });
      }
    }
  }

  if (inComment) {
    diagnostics.push({
      id: `diag-css-unclosed-comment-${commentStartLine}`,
      line: commentStartLine,
      severity: 'error',
      message: 'Comentário CSS /* ... */ não foi fechado.',
      source: sourceName,
      suggestedPrompt: `Feche o comentário CSS aberto por volta da linha ${commentStartLine}.`,
    });
  }

  if (openBraces > 0) {
    diagnostics.push({
      id: `diag-css-unclosed-brace-${lastOpenLine}`,
      line: lastOpenLine,
      severity: 'error',
      message: `${openBraces} bloco(s) CSS com chave "{" aberta sem fechamento "}".`,
      source: sourceName,
      suggestedPrompt: `Feche a regra CSS aberta na linha ${lastOpenLine} com "}".`,
    });
  }

  return diagnostics;
}

/**
 * Validates HTML tags, unclosed brackets, and embedded <script> / <style> blocks
 */
export function validateHtml(code: string): DiagnosticItem[] {
  if (!code || !code.trim()) return [];
  const diagnostics: DiagnosticItem[] = [];
  const lines = code.split('\n');

  // 1. Validate embedded <script> tags
  const scriptRegex = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let scriptMatch: RegExpExecArray | null;
  while ((scriptMatch = scriptRegex.exec(code)) !== null) {
    const fullMatch = scriptMatch[0];
    const scriptContent = scriptMatch[2];
    const matchIndex = scriptMatch.index;

    // Calculate line number where this script body starts
    const prefix = code.slice(0, matchIndex + fullMatch.indexOf(scriptContent));
    const scriptLineOffset = prefix.split('\n').length - 1;

    const jsDiags = validateJavaScript(
      scriptContent,
      scriptLineOffset,
      'HTML <script>'
    );
    diagnostics.push(...jsDiags);
  }

  // 2. Validate embedded <style> tags
  const styleRegex = /<style\b([^>]*)>([\s\S]*?)<\/style>/gi;
  let styleMatch: RegExpExecArray | null;
  while ((styleMatch = styleRegex.exec(code)) !== null) {
    const fullMatch = styleMatch[0];
    const styleContent = styleMatch[2];
    const matchIndex = styleMatch.index;

    const prefix = code.slice(0, matchIndex + fullMatch.indexOf(styleContent));
    const styleLineOffset = prefix.split('\n').length - 1;

    const cssDiags = validateCss(styleContent, styleLineOffset, 'HTML <style>');
    diagnostics.push(...cssDiags);
  }

  // 3. Structural tag balancing
  const tagStack: { tag: string; line: number; raw: string }[] = [];
  const tagPattern = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z0-9_-]+)([^>]*?)(\/?)>/g;
  let tagMatch: RegExpExecArray | null;

  while ((tagMatch = tagPattern.exec(code)) !== null) {
    const rawMatch = tagMatch[0];
    if (rawMatch.startsWith('<!--')) continue; // Skip HTML comments

    const isClosing = tagMatch[1] === '/';
    const tagName = tagMatch[2].toLowerCase();
    const selfClosing = tagMatch[4] === '/' || HTML_VOID_TAGS.has(tagName);

    // Calculate line number
    const prefix = code.slice(0, tagMatch.index);
    const lineNum = prefix.split('\n').length;

    // Don't validate tags inside script/style bodies since they were already analyzed
    if (tagName === 'script' || tagName === 'style') {
      if (!isClosing && !selfClosing) {
        tagStack.push({ tag: tagName, line: lineNum, raw: rawMatch });
      } else if (isClosing) {
        if (tagStack.length > 0 && tagStack[tagStack.length - 1].tag === tagName) {
          tagStack.pop();
        }
      }
      continue;
    }

    if (selfClosing) {
      continue;
    }

    if (!isClosing) {
      tagStack.push({ tag: tagName, line: lineNum, raw: rawMatch });
    } else {
      // It is a closing tag </tag>
      if (tagStack.length === 0) {
        diagnostics.push({
          id: `diag-html-extra-close-${lineNum}-${tagName}`,
          line: lineNum,
          severity: 'error',
          message: `Tag </${tagName}> fechada na linha ${lineNum} sem tag de abertura correspondente.`,
          source: 'Validador HTML',
          suggestedPrompt: `Remova ou corrija a tag de fechamento excedente </${tagName}> na linha ${lineNum}.`,
        });
      } else {
        const top = tagStack[tagStack.length - 1];
        if (top.tag === tagName) {
          tagStack.pop();
        } else {
          // Check if top is deeper in the stack
          let foundIdx = -1;
          for (let s = tagStack.length - 1; s >= 0; s--) {
            if (tagStack[s].tag === tagName) {
              foundIdx = s;
              break;
            }
          }
          if (foundIdx !== -1) {
            const unclosed = tagStack.slice(foundIdx + 1);
            tagStack.splice(foundIdx);
            for (const item of unclosed) {
              diagnostics.push({
                id: `diag-html-unclosed-inner-${item.line}-${item.tag}`,
                line: item.line,
                severity: 'warning',
                message: `Tag <${item.tag}> aberta na linha ${item.line} não foi fechada antes de </${tagName}> (linha ${lineNum}).`,
                source: 'Validador HTML',
                suggestedPrompt: `Feche adequadamente a tag <${item.tag}> aberta na linha ${item.line}.`,
              });
            }
          } else {
            diagnostics.push({
              id: `diag-html-mismatch-${lineNum}-${tagName}`,
              line: lineNum,
              severity: 'error',
              message: `Tag </${tagName}> incompatível: a tag aberta esperada era <${top.tag}> (aberta na linha ${top.line}).`,
              source: 'Validador HTML',
              suggestedPrompt: `Corrija o fechamento de tag na linha ${lineNum}: esperava-se </${top.tag}> em vez de </${tagName}>.`,
            });
          }
        }
      }
    }
  }

  // Check remaining unclosed tags
  for (const remaining of tagStack) {
    // Ignore html/body unclosed warnings if standard page snippet
    diagnostics.push({
      id: `diag-html-unclosed-${remaining.line}-${remaining.tag}`,
      line: remaining.line,
      severity: 'error',
      message: `Tag <${remaining.tag}> aberta na linha ${remaining.line} não possui fechamento </${remaining.tag}>.`,
      source: 'Validador HTML',
      suggestedPrompt: `Feche a tag <${remaining.tag}> aberta na linha ${remaining.line}.`,
    });
  }

  // Check for malformed tags like `<div <span` or unclosed angle brackets
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/<[a-zA-Z][^>]*<[a-zA-Z]/.test(l)) {
      diagnostics.push({
        id: `diag-html-nested-angle-${i + 1}`,
        line: i + 1,
        severity: 'error',
        message: 'Tag HTML malformada com caractere "<" duplicado antes do fechamento ">".',
        source: 'Validador HTML',
        suggestedPrompt: `Corrija a tag HTML malformada na linha ${i + 1}.`,
      });
    }
  }

  return diagnostics;
}

/**
 * Validates Python syntax and structure
 */
export function validatePython(code: string): DiagnosticItem[] {
  if (!code || !code.trim()) return [];
  const diagnostics: DiagnosticItem[] = [];
  const lines = code.split('\n');

  let openParens = 0;
  let openBrackets = 0;
  let openBraces = 0;
  let parenLine = 1;
  let inMultilineString: string | null = null;
  let multilineStart = 1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    const trimmed = line.trim();

    // Check multiline strings
    if (inMultilineString) {
      if (line.includes(inMultilineString)) {
        inMultilineString = null;
      }
      continue;
    }

    if (trimmed.startsWith("'''") || trimmed.startsWith('"""')) {
      const token = trimmed.slice(0, 3);
      if (trimmed.length > 3 && trimmed.slice(3).includes(token)) {
        // closed on same line
      } else {
        inMultilineString = token;
        multilineStart = lineNum;
        continue;
      }
    }

    // Ignore comments
    if (trimmed.startsWith('#')) continue;

    // Check bracket counts
    for (let c = 0; c < line.length; c++) {
      const ch = line[c];
      if (ch === '#') break; // comment starts
      if (ch === '(') {
        openParens++;
        parenLine = lineNum;
      } else if (ch === ')') {
        openParens--;
        if (openParens < 0) {
          diagnostics.push({
            id: `diag-py-extra-paren-${lineNum}`,
            line: lineNum,
            severity: 'error',
            message: 'Parêntese de fechamento ")" inesperado em Python.',
            source: 'Validador Python',
            suggestedPrompt: `Remova o parêntese excedente ")" na linha ${lineNum}.`,
          });
          openParens = 0;
        }
      } else if (ch === '[') {
        openBrackets++;
      } else if (ch === ']') {
        openBrackets--;
      } else if (ch === '{') {
        openBraces++;
      } else if (ch === '}') {
        openBraces--;
      }
    }

    // Check statements that MUST end with a colon ":"
    const colonKeywords = [
      /^(def\s+[a-zA-Z0-9_]+\s*\(.*\))/,
      /^(class\s+[a-zA-Z0-9_]+(\(.*\))?)/,
      /^(if\s+.+)/,
      /^(elif\s+.+)/,
      /^(else)$/,
      /^(for\s+.+\s+in\s+.+)/,
      /^(while\s+.+)/,
      /^(try)$/,
      /^(except(\s+.+)?)$/,
      /^(finally)$/,
      /^(with\s+.+)/,
    ];

    if (openParens === 0 && openBrackets === 0) {
      for (const pattern of colonKeywords) {
        if (pattern.test(trimmed)) {
          if (!trimmed.endsWith(':') && !trimmed.includes(': #')) {
            diagnostics.push({
              id: `diag-py-missing-colon-${lineNum}`,
              line: lineNum,
              severity: 'error',
              message: `Declaração Python "${trimmed}" precisa terminar com dois-pontos ":".`,
              source: 'Validador Python',
              suggestedPrompt: `Adicione dois-pontos ":" ao final da instrução na linha ${lineNum}: "${trimmed}:"`,
            });
          }
          break;
        }
      }
    }

    // Check JS syntax mistakes in Python
    if (/\bfunction\s+[a-zA-Z0-9_]+\s*\(/.test(trimmed)) {
      diagnostics.push({
        id: `diag-py-function-keyword-${lineNum}`,
        line: lineNum,
        severity: 'error',
        message: 'Em Python utilize "def nome_funcao():" em vez da palavra-chave "function".',
        source: 'Validador Python',
        suggestedPrompt: `Substitua "function" por "def" na linha ${lineNum}.`,
      });
    }

    if (trimmed.includes('===') || trimmed.includes('!==')) {
      diagnostics.push({
        id: `diag-py-triple-equals-${lineNum}`,
        line: lineNum,
        severity: 'error',
        message: 'Operadores "===" e "!==" não existem em Python; utilize "==" ou "!=" (ou "is").',
        source: 'Validador Python',
        suggestedPrompt: `Substitua o operador de igualdade na linha ${lineNum} por "==" ou "!=".`,
      });
    }
  }

  if (inMultilineString) {
    diagnostics.push({
      id: `diag-py-unclosed-docstring-${multilineStart}`,
      line: multilineStart,
      severity: 'error',
      message: `String multiline ${inMultilineString} iniciada na linha ${multilineStart} não foi fechada.`,
      source: 'Validador Python',
      suggestedPrompt: `Feche a string multiline ${inMultilineString} aberta na linha ${multilineStart}.`,
    });
  }

  if (openParens > 0) {
    diagnostics.push({
      id: `diag-py-unclosed-paren-${parenLine}`,
      line: parenLine,
      severity: 'error',
      message: `${openParens} parêntese(s) "(" não foram fechados em Python.`,
      source: 'Validador Python',
      suggestedPrompt: `Feche os parênteses abertos por volta da linha ${parenLine}.`,
    });
  }

  return diagnostics;
}

/**
 * Validates JSON syntax
 */
export function validateJson(code: string): DiagnosticItem[] {
  if (!code || !code.trim()) return [];
  const diagnostics: DiagnosticItem[] = [];

  try {
    JSON.parse(code);
  } catch (err: any) {
    const rawMsg: string = err.message || 'JSON inválido';
    let line = 1;
    let col = 1;

    const posMatch = rawMsg.match(/position\s+(\d+)/i);
    if (posMatch) {
      const charIdx = parseInt(posMatch[1], 10);
      const prefix = code.slice(0, Math.min(charIdx, code.length));
      const lines = prefix.split('\n');
      line = lines.length;
      col = lines[lines.length - 1].length + 1;
    } else {
      const lineMatch = rawMsg.match(/line\s+(\d+)/i);
      if (lineMatch) line = parseInt(lineMatch[1], 10);
      const colMatch = rawMsg.match(/column\s+(\d+)/i);
      if (colMatch) col = parseInt(colMatch[1], 10);
    }

    let friendly = rawMsg;
    if (/trailing comma/i.test(rawMsg) || /unexpected token ,/i.test(rawMsg)) {
      friendly = 'Vírgula sobrando (trailing comma) não permitida no formato JSON.';
    } else if (/unexpected token '/i.test(rawMsg)) {
      friendly = 'JSON exige aspas duplas (") para chaves e textos; aspas simples (\') são inválidas.';
    } else if (/unexpected token \}/i.test(rawMsg)) {
      friendly = 'Chave de fechamento "}" inesperada ou vírgula sobrando antes dela.';
    } else if (/unexpected token \]/i.test(rawMsg)) {
      friendly = 'Colchete de fechamento "]" inesperado ou vírgula sobrando antes dele.';
    }

    diagnostics.push({
      id: `diag-json-${line}-${col}`,
      line,
      column: col,
      severity: 'error',
      message: `Erro no JSON: ${friendly}`,
      source: 'Validador JSON',
      suggestedPrompt: `Corrija o erro de sintaxe JSON na linha ${line}: ${friendly}`,
    });
  }

  return diagnostics;
}

/**
 * Master diagnostic router for any supported language
 */
export function diagnoseCode(code: string, language: string): DiagnosticItem[] {
  if (!code || !code.trim()) return [];

  switch (language) {
    case 'html':
      return validateHtml(code);
    case 'javascript':
    case 'typescript':
      return validateJavaScript(code, 0, language === 'typescript' ? 'TypeScript' : 'JavaScript');
    case 'css':
      return validateCss(code);
    case 'python':
      return validatePython(code);
    case 'json':
      return validateJson(code);
    default:
      return validateHtml(code);
  }
}
