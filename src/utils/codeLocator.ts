import { parse } from '@babel/parser';
import { SelectionRange } from '../types';
import { computeLineDiff } from './diff';
import { groupIntoHunks } from './hunks';

const SAFETY_MARGIN_LINES = 3;

export function buildSelectionFromLineRange(code: string, startLine: number, endLine: number): SelectionRange {
  const lines = code.split('\n');
  const fromLine = Math.max(1, startLine - SAFETY_MARGIN_LINES);
  const toLine = Math.min(lines.length, endLine + SAFETY_MARGIN_LINES);
  const text = lines.slice(fromLine - 1, toLine).join('\n');
  const from = lines.slice(0, fromLine - 1).reduce((acc, line) => acc + line.length + 1, 0);
  const to = from + text.length;
  return { from, to, text, fromLine, toLine };
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Localiza exatamente onde uma função, componente ou classe está declarada
 * no código de um arquivo utilizando o AST do @babel/parser.
 *
 * Adiciona uma margem de segurança de linhas antes e depois da declaração
 * e retorna a seleção correspondente no formato SelectionRange.
 */
export function locateTargetByName(code: string, targetName: string): SelectionRange | null {
  // a) Validações iniciais
  if (!code || typeof code !== 'string' || !targetName || !targetName.trim()) {
    return null;
  }

  const trimmedTarget = targetName.trim();

  // b) Parse do código via @babel/parser
  let ast: any;
  try {
    ast = parse(code, {
      sourceType: 'unambiguous',
      plugins: ['jsx', 'typescript'],
      errorRecovery: true,
    });
  } catch {
    return null;
  }

  // c) Coleta recursiva de nós correspondentes
  const matchedNodes: any[] = [];
  const visited = new Set<any>();

  function traverse(node: any) {
    if (!node || typeof node !== 'object') {
      return;
    }
    if (visited.has(node)) {
      return;
    }
    visited.add(node);

    if (typeof node.type === 'string') {
      // 1. FunctionDeclaration
      if (node.type === 'FunctionDeclaration' && node.id?.name === trimmedTarget) {
        matchedNodes.push(node);
      }
      // 2. ClassDeclaration
      else if (node.type === 'ClassDeclaration' && node.id?.name === trimmedTarget) {
        matchedNodes.push(node);
      }
      // 3. VariableDeclarator com ArrowFunction ou FunctionExpression
      else if (
        node.type === 'VariableDeclarator' &&
        node.id?.type === 'Identifier' &&
        node.id.name === trimmedTarget &&
        node.init &&
        (node.init.type === 'ArrowFunctionExpression' || node.init.type === 'FunctionExpression')
      ) {
        matchedNodes.push(node);
      }
      // 4. ClassMethod ou ObjectMethod
      else if (
        (node.type === 'ClassMethod' || node.type === 'ObjectMethod') &&
        node.key?.type === 'Identifier' &&
        node.key.name === trimmedTarget
      ) {
        matchedNodes.push(node);
      }
      // 5. ObjectProperty com ArrowFunction ou FunctionExpression
      else if (
        node.type === 'ObjectProperty' &&
        node.key?.type === 'Identifier' &&
        node.key.name === trimmedTarget &&
        node.value &&
        (node.value.type === 'ArrowFunctionExpression' || node.value.type === 'FunctionExpression')
      ) {
        matchedNodes.push(node);
      }
    }

    // Visita recursiva de propriedades que sejam objetos ou arrays
    for (const key of Object.keys(node)) {
      const child = node[key];
      if (Array.isArray(child)) {
        for (const item of child) {
          if (item && typeof item === 'object') {
            traverse(item);
          }
        }
      } else if (child && typeof child === 'object') {
        traverse(child);
      }
    }
  }

  traverse(ast);

  // d) Valida quantidade de correspondências
  if (matchedNodes.length !== 1) {
    return null;
  }

  const targetNode = matchedNodes[0];
  if (!targetNode.loc?.start?.line || !targetNode.loc?.end?.line) {
    return null;
  }

  // e) Extrai linhas de início e fim (1-indexadas)
  const matchStartLine = targetNode.loc.start.line;
  const matchEndLine = targetNode.loc.end.line;

  return buildSelectionFromLineRange(code, matchStartLine, matchEndLine);
}

export function locateTargetInCss(code: string, selectorName: string): SelectionRange | null {
  if (!code || !selectorName?.trim()) return null;
  const target = selectorName.trim();
  const regex = new RegExp(escapeRegExp(target) + '\\s*\\{');
  const match = regex.exec(code);
  if (!match) return null;
  const openBraceIndex = code.indexOf('{', match.index);
  if (openBraceIndex === -1) return null;
  let depth = 0;
  let endIndex = -1;
  for (let i = openBraceIndex; i < code.length; i++) {
    if (code[i] === '{') depth++;
    else if (code[i] === '}') {
      depth--;
      if (depth === 0) {
        endIndex = i;
        break;
      }
    }
  }
  if (endIndex === -1) return null;
  const startLine = code.slice(0, match.index).split('\n').length;
  const endLine = code.slice(0, endIndex).split('\n').length;
  return buildSelectionFromLineRange(code, startLine, endLine);
}

export function locateTargetInHtml(code: string, identifier: string): SelectionRange | null {
  if (!code || !identifier?.trim()) return null;
  let raw = identifier.trim();
  if (raw.startsWith('#') || raw.startsWith('.')) raw = raw.slice(1);
  const openTagMatch = new RegExp(
    '<([a-zA-Z0-9]+)([^>]*\\b(?:id|class)\\s*=\\s*["\'][^"\']*\\b' + escapeRegExp(raw) + '\\b[^"\']*["\'][^>]*)>'
  ).exec(code);
  if (!openTagMatch) return null;
  const tagName = openTagMatch[1];
  const startIndex = openTagMatch.index;
  const combined = new RegExp('<\\/?' + tagName + '(\\s[^>]*)?>', 'gi');
  combined.lastIndex = startIndex;
  let depth = 0;
  let endIndex = -1;
  let m: RegExpExecArray | null;
  while ((m = combined.exec(code)) !== null) {
    if (m[0].startsWith('</')) {
      depth--;
      if (depth === 0) {
        endIndex = m.index + m[0].length;
        break;
      }
    } else {
      depth++;
    }
  }
  if (endIndex === -1) endIndex = startIndex + openTagMatch[0].length;
  const startLine = code.slice(0, startIndex).split('\n').length;
  const endLine = code.slice(0, endIndex).split('\n').length;
  return buildSelectionFromLineRange(code, startLine, endLine);
}

export function locateTargetByText(code: string, name: string): SelectionRange | null {
  if (!code || !name?.trim()) return null;
  const idx = code.indexOf(name.trim());
  if (idx === -1) return null;
  const line = code.slice(0, idx).split('\n').length;
  return buildSelectionFromLineRange(code, line, line);
}

export function locateTarget(code: string, targetName: string, filePath: string): SelectionRange | null {
  if (!code || !targetName?.trim()) return null;
  const ext = (filePath || '').split('.').pop()?.toLowerCase() || '';
  let result: SelectionRange | null = null;
  if (['js', 'jsx', 'ts', 'tsx'].includes(ext)) {
    result = locateTargetByName(code, targetName);
  } else if (ext === 'css') {
    result = locateTargetInCss(code, targetName);
  } else if (ext === 'html' || ext === 'htm') {
    result = locateTargetInHtml(code, targetName);
  }
  if (!result) {
    result = locateTargetByText(code, targetName);
  }
  return result;
}

export function locateChangedRegion(oldCode: string, newCode: string): SelectionRange | null {
  if (oldCode === newCode) return null;

  const diffResult = computeLineDiff(oldCode, newCode);
  const hunks = groupIntoHunks(diffResult.lines, 0);

  let minNewLine: number | null = null;
  let maxNewLine: number | null = null;

  for (const hunk of hunks) {
    for (const line of hunk.lines) {
      if (line.type !== 'rem' && typeof line.newLineNum === 'number') {
        if (line.type === 'add') {
          if (minNewLine === null || line.newLineNum < minNewLine) minNewLine = line.newLineNum;
          if (maxNewLine === null || line.newLineNum > maxNewLine) maxNewLine = line.newLineNum;
        }
      }
    }
  }

  if (minNewLine === null || maxNewLine === null) {
    return null;
  }

  return buildSelectionFromLineRange(newCode, minNewLine, maxNewLine);
}
