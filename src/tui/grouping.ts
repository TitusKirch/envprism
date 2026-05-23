import type { Matrix } from '@/core/matrix.ts';
import { matchesFilter } from '@tui/format.ts';
import type { State } from '@tui/types.ts';

// Lookup name for keys/sections that have no banner or prefix bucket.
export const SECTION_COLLAPSE_KEY = '__other__';

export function prefixSection(key: string): string | undefined {
  const idx = key.indexOf('_');
  if (idx <= 0) return undefined;
  return key.slice(0, idx);
}

/**
 * Sort by first-underscore-prefix while preserving the relative order each
 * prefix first appeared in. Keys without an underscore land in a trailing
 * "Other" group keeping their authored order.
 */
export function groupByPrefix(keys: string[]): string[] {
  const groups = new Map<string, string[]>();
  const order: string[] = [];
  const OTHER = SECTION_COLLAPSE_KEY;
  for (const k of keys) {
    const p = prefixSection(k) ?? OTHER;
    let bucket = groups.get(p);
    if (!bucket) {
      bucket = [];
      groups.set(p, bucket);
      if (p !== OTHER) order.push(p);
    }
    bucket.push(k);
  }
  if (groups.has(OTHER)) order.push(OTHER);
  return order.flatMap((p) => groups.get(p)!);
}

/**
 * Move row focus by `delta` while skipping section dividers that are not
 * collapsed. The user only needs to land on a divider when its section is
 * folded — that's the only context in which 'c' on the divider does work
 * the focused-key path doesn't already cover.
 */
export function stepRow(state: State, delta: number): number {
  const items = state.visibleItems;
  if (items.length === 0) return 0;
  const canFocus = (i: number) => {
    const it = items[i];
    if (!it) return false;
    if (it.kind === 'key') return true;
    // divider — focusable only when collapsed
    return state.collapsed.has(it.ref);
  };
  let i = state.rowIdx + delta;
  while (i >= 0 && i < items.length) {
    if (canFocus(i)) return i;
    i += delta;
  }
  // No focusable item further along — clamp to current.
  return state.rowIdx;
}

export function orderedKeys(
  matrix: Matrix,
  state: State,
  sectionOf: (key: string) => string | undefined
): string[] {
  void sectionOf;
  const filtered = matrix.keys.filter((k) => {
    if (!matchesFilter(k, state.filter)) return false;
    if (state.driftOnly && !keyDrifts(matrix, k)) return false;
    return true;
  });
  return state.grouping === 'prefix' ? groupByPrefix(filtered) : filtered;
}

export interface SectionStats {
  drift: number;
  missing: number;
  total: number;
}

export function sectionMetadata(
  matrix: Matrix,
  sectionOf: (key: string) => string | undefined,
  state: State
): Map<string, SectionStats> {
  const out = new Map<string, SectionStats>();
  for (const key of orderedKeys(matrix, state, sectionOf)) {
    const k = sectionOf(key) ?? SECTION_COLLAPSE_KEY;
    const bucket = out.get(k) ?? { drift: 0, missing: 0, total: 0 };
    bucket.total += 1;
    let drifts = false;
    let missing = false;
    for (const file of matrix.files) {
      if (file === matrix.base) continue;
      const s = matrix.cell(key, file).state;
      if (s === 'missing') missing = true;
      if (s === 'differs' || s === 'missing' || s === 'extra') drifts = true;
    }
    if (drifts) bucket.drift += 1;
    if (missing) bucket.missing += 1;
    out.set(k, bucket);
  }
  return out;
}

export function keyDrifts(matrix: Matrix, key: string): boolean {
  for (const file of matrix.files) {
    if (file === matrix.base) continue;
    const s = matrix.cell(key, file).state;
    if (s === 'differs' || s === 'missing' || s === 'extra') return true;
  }
  return false;
}
