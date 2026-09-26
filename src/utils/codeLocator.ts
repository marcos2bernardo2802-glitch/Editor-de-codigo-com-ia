import { parse } from '@babel/parser';
import { SelectionRange } from '../types';

const SAFETY_MARGIN_LINES = 3;

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

  // f) Divide o código em linhas
  const lines = code.split('\n');

  // g) Calcula margem de segurança
  const fromLine = Math.max(1, matchStartLine - SAFETY_MARGIN_LINES);
  const toLine = Math.min(lines.length, matchEndLine + SAFETY_MARGIN_LINES);

  // h) Monta o texto do trecho selecionado
  const text = lines.slice(fromLine - 1, toLine).join('\n');

  // i) Calcula o deslocamento de caractere "from"
  const from = lines.slice(0, fromLine - 1).reduce((acc, line) => acc + line.length + 1, 0);

  // j) Calcula "to"
  const to = from + text.length;

  // k) Retorna o objeto SelectionRange
  return {
    from,
    to,
    text,
    fromLine,
    toLine,
  };
}
