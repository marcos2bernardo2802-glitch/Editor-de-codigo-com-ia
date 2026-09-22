import { DiffLine } from '../types';

export interface DiffHunk {
  id: string;
  index: number;
  oldStartLine: number;
  newStartLine: number;
  lines: DiffLine[];
  additions: number;
  deletions: number;
  // Computed lines to be applied if this hunk is accepted alone
  originalOldLines: string[];
  proposedNewLines: string[];
}

/**
 * Groups diff lines into discrete contiguous change blocks (hunks).
 * Lines that are 'same' serve as separators if they exceed context radius.
 */
export function groupIntoHunks(lines: DiffLine[], contextRadius = 2): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  let currentLines: DiffLine[] = [];
  let sameStreak = 0;
  let inHunk = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.type !== 'same') {
      inHunk = true;
      sameStreak = 0;
      currentLines.push(line);
    } else {
      if (inHunk) {
        sameStreak++;
        currentLines.push(line);

        // If we have enough unchanged lines or reach end, close this hunk
        if (sameStreak > contextRadius * 2 || i === lines.length - 1) {
          // Trim excessive trailing 'same' lines
          const validLength = currentLines.length - Math.max(0, sameStreak - contextRadius);
          const hunkLines = currentLines.slice(0, validLength);

          if (hunkLines.some((l) => l.type !== 'same')) {
            hunks.push(buildHunk(hunkLines, hunks.length));
          }

          currentLines = [];
          inHunk = false;
          sameStreak = 0;
        }
      }
    }
  }

  // Flush remaining
  if (currentLines.length > 0 && currentLines.some((l) => l.type !== 'same')) {
    hunks.push(buildHunk(currentLines, hunks.length));
  }

  return hunks;
}

function buildHunk(hunkLines: DiffLine[], index: number): DiffHunk {
  let adds = 0;
  let rems = 0;
  let oldStart = 1;
  let newStart = 1;
  let foundOld = false;
  let foundNew = false;

  const originalOldLines: string[] = [];
  const proposedNewLines: string[] = [];

  for (const l of hunkLines) {
    if (l.type === 'add') {
      adds++;
      proposedNewLines.push(l.text);
      if (!foundNew && l.newLineNum) {
        newStart = l.newLineNum;
        foundNew = true;
      }
    } else if (l.type === 'rem') {
      rems++;
      originalOldLines.push(l.text);
      if (!foundOld && l.oldLineNum) {
        oldStart = l.oldLineNum;
        foundOld = true;
      }
    } else {
      originalOldLines.push(l.text);
      proposedNewLines.push(l.text);
      if (!foundOld && l.oldLineNum) {
        oldStart = l.oldLineNum;
        foundOld = true;
      }
      if (!foundNew && l.newLineNum) {
        newStart = l.newLineNum;
        foundNew = true;
      }
    }
  }

  return {
    id: `hunk-${index}-${oldStart}-${newStart}`,
    index,
    oldStartLine: oldStart,
    newStartLine: newStart,
    lines: hunkLines,
    additions: adds,
    deletions: rems,
    originalOldLines,
    proposedNewLines,
  };
}

/**
 * Applies a specific single hunk onto existing base code.
 * Searches for originalOldLines within the base code and replaces with proposedNewLines.
 */
export function applySingleHunk(
  baseCode: string,
  hunk: DiffHunk
): { success: boolean; newCode: string } {
  const baseLines = baseCode.split('\n');
  const targetOldText = hunk.originalOldLines.join('\n');
  const targetNewText = hunk.proposedNewLines.join('\n');

  // Exact substring match
  if (baseCode.includes(targetOldText)) {
    const updated = baseCode.replace(targetOldText, targetNewText);
    return { success: true, newCode: updated };
  }

  // Approximate match around oldStartLine
  const targetOldCount = hunk.originalOldLines.length;
  const startIdx = Math.max(0, hunk.oldStartLine - 5);
  const endIdx = Math.min(baseLines.length, hunk.oldStartLine + targetOldCount + 5);

  for (let i = startIdx; i <= endIdx - targetOldCount; i++) {
    const slice = baseLines.slice(i, i + targetOldCount).join('\n');
    if (slice === targetOldText) {
      const before = baseLines.slice(0, i);
      const after = baseLines.slice(i + targetOldCount);
      const updated = [...before, ...hunk.proposedNewLines, ...after].join('\n');
      return { success: true, newCode: updated };
    }
  }

  // Fallback: If only removals and additions
  const onlyOldChanged = hunk.lines.filter((l) => l.type === 'rem').map((l) => l.text).join('\n');
  const onlyNewChanged = hunk.lines.filter((l) => l.type === 'add').map((l) => l.text).join('\n');

  if (onlyOldChanged && baseCode.includes(onlyOldChanged)) {
    const updated = baseCode.replace(onlyOldChanged, onlyNewChanged);
    return { success: true, newCode: updated };
  }

  return { success: false, newCode: baseCode };
}
