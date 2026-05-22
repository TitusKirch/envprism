import { basename } from 'pathe';
import type { Matrix, CellState } from './matrix.ts';
import type { EnvFile } from './types.ts';

export interface DiffReport {
  base: string;
  /** Compared files, excluding the base. */
  files: DiffFileReport[];
  /** True when no non-base cell is `differs`, `missing`, or `extra`. */
  inSync: boolean;
}

export interface DiffFileReport {
  path: string;
  keys: Record<string, CellState>;
  /** Number of keys with state !== 'same'. */
  drift: number;
}

const DRIFT_STATES: ReadonlySet<CellState> = new Set([
  'differs',
  'missing',
  'extra'
]);

export function computeDiff(matrix: Matrix): DiffReport {
  const others = matrix.files.filter((f) => f !== matrix.base);
  const files = others.map((f) => buildFileReport(matrix, f));
  return {
    base: matrix.base.path,
    files,
    inSync: files.every((f) => f.drift === 0)
  };
}

function buildFileReport(matrix: Matrix, file: EnvFile): DiffFileReport {
  const keys: Record<string, CellState> = {};
  let drift = 0;
  for (const key of matrix.keys) {
    const { state } = matrix.cell(key, file);
    keys[key] = state;
    if (DRIFT_STATES.has(state)) drift++;
  }
  return { path: file.path, keys, drift };
}

export function formatDiffText(report: DiffReport): string {
  const baseName = basename(report.base);
  const otherNames = report.files.map((f) => basename(f.path));
  const lines: string[] = [];
  lines.push(`Base: ${baseName}  (vs. ${otherNames.join(', ')})`);
  lines.push('');

  if (report.files.length === 0) {
    lines.push('No other env files to compare.');
    return lines.join('\n') + '\n';
  }

  const driftKeys = new Set<string>();
  for (const f of report.files) {
    for (const [k, s] of Object.entries(f.keys)) {
      if (DRIFT_STATES.has(s)) driftKeys.add(k);
    }
  }

  if (driftKeys.size === 0) {
    lines.push('All env files are in sync with the base.');
    return lines.join('\n') + '\n';
  }

  const keyWidth = Math.max(3, ...[...driftKeys].map((k) => k.length));
  const colWidth = Math.max(12, ...otherNames.map((n) => n.length));

  lines.push(
    formatRow('KEY', otherNames, keyWidth, colWidth, (n) => n.padEnd(colWidth))
  );
  for (const key of [...driftKeys].sort()) {
    const cells = report.files.map((f) => stateLabel(f.keys[key] ?? 'missing'));
    lines.push(
      formatRow(key, cells, keyWidth, colWidth, (n) => n.padEnd(colWidth))
    );
  }

  lines.push('');
  const totalDrift = report.files.reduce((sum, f) => sum + f.drift, 0);
  lines.push(
    `${driftKeys.size} key(s) differ across ${report.files.length} file(s) (${totalDrift} cell drift).`
  );

  return lines.join('\n') + '\n';
}

function formatRow(
  key: string,
  cells: string[],
  keyWidth: number,
  colWidth: number,
  pad: (s: string) => string
): string {
  return [key.padEnd(keyWidth), ...cells.map(pad)].join('  ');
}

function stateLabel(state: CellState): string {
  switch (state) {
    case 'same':
      return '— same';
    case 'differs':
      return '≠ differs';
    case 'missing':
      return '✗ missing';
    case 'extra':
      return '★ extra';
    case 'base':
      return '· base';
  }
}
