import { DiffLine } from '../types';

export interface DiffResult {
  lines: DiffLine[];
  additions: number;
  deletions: number;
  unchanged: number;
}

/**
 * Computes line-by-line diff using Longest Common Subsequence (LCS).
 * Preserves exact text and assigns line numbers for old and new code.
 */
export function computeLineDiff(oldStr: string, newStr: string): DiffResult {
  const a = oldStr.split('\n');
  const b = newStr.split('\n');
  const n = a.length;
  const m = b.length;

  // Optimization for large files: if n * m is too large, fallback to simple chunk matching
  const MAX_CELLS = 500000;
  if (n * m > MAX_CELLS) {
    return fastApproxDiff(a, b);
  }

  // Standard LCS DP Table
  // Using 1D or 2D array: since n,m are typically < 1000 lines, 2D Uint16Array is fast and compact
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));

  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      if (a[i] === b[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  const lines: DiffLine[] = [];
  let i = 0;
  let j = 0;
  let oldLineNum = 1;
  let newLineNum = 1;

  let additions = 0;
  let deletions = 0;
  let unchanged = 0;

  while (i < n && j < m) {
    if (a[i] === b[j]) {
      lines.push({
        type: 'same',
        text: a[i],
        oldLineNum: oldLineNum++,
        newLineNum: newLineNum++,
      });
      unchanged++;
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      lines.push({
        type: 'rem',
        text: a[i],
        oldLineNum: oldLineNum++,
      });
      deletions++;
      i++;
    } else {
      lines.push({
        type: 'add',
        text: b[j],
        newLineNum: newLineNum++,
      });
      additions++;
      j++;
    }
  }

  while (i < n) {
    lines.push({
      type: 'rem',
      text: a[i],
      oldLineNum: oldLineNum++,
    });
    deletions++;
    i++;
  }

  while (j < m) {
    lines.push({
      type: 'add',
      text: b[j],
      newLineNum: newLineNum++,
    });
    additions++;
    j++;
  }

  return { lines, additions, deletions, unchanged };
}

function fastApproxDiff(a: string[], b: string[]): DiffResult {
  const lines: DiffLine[] = [];
  let additions = 0;
  let deletions = 0;
  let unchanged = 0;

  const maxLen = Math.max(a.length, b.length);
  for (let i = 0; i < maxLen; i++) {
    const oldLine = a[i];
    const newLine = b[i];

    if (oldLine === undefined) {
      lines.push({ type: 'add', text: newLine, newLineNum: i + 1 });
      additions++;
    } else if (newLine === undefined) {
      lines.push({ type: 'rem', text: oldLine, oldLineNum: i + 1 });
      deletions++;
    } else if (oldLine === newLine) {
      lines.push({ type: 'same', text: oldLine, oldLineNum: i + 1, newLineNum: i + 1 });
      unchanged++;
    } else {
      lines.push({ type: 'rem', text: oldLine, oldLineNum: i + 1 });
      lines.push({ type: 'add', text: newLine, newLineNum: i + 1 });
      deletions++;
      additions++;
    }
  }

  return { lines, additions, deletions, unchanged };
}

/**
 * Safely extracts a value from a nested object using dot/bracket notation
 * e.g. "choices[0].message.content"
 */
export function getByPath(obj: any, path: string): any {
  if (!obj || !path) return undefined;
  const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
  let cur = obj;
  for (let i = 0; i < parts.length; i++) {
    if (cur == null) return undefined;
    cur = cur[parts[i]];
  }
  return cur;
}

/**
 * Replaces {{code}} and {{instruction}} inside JSON template string
 */
export function fillTemplate(templateStr: string, variables: Record<string, string>): string {
  return templateStr.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const val = variables[key] ?? '';
    // JSON.stringify will safely escape newlines and quotes; we strip outer quotes
    return JSON.stringify(val).slice(1, -1);
  });
}
