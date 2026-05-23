import { buildMatrix } from '@/core/matrix.ts';
import type { EnvFile } from '@/core/types.ts';
import type { TuiContext } from '@tui/context.ts';
import { matchesFilter } from '@tui/format.ts';
import {
  keyDrifts,
  orderedKeys,
  SECTION_COLLAPSE_KEY,
  stepRow
} from '@tui/grouping.ts';
import type { MatrixItem, UndoEntry } from '@tui/types.ts';

export function cellKey(key: string, file: EnvFile): string {
  return `${key}|${file.path}`;
}

export function markModified(
  ctx: TuiContext,
  key: string,
  file: EnvFile
): void {
  ctx.state.modified.add(cellKey(key, file));
}

export function pushUndo(ctx: TuiContext, entry: UndoEntry): void {
  ctx.state.undo.push(entry);
  if (ctx.state.undo.length > ctx.config.tui.undoLimit) ctx.state.undo.shift();
}

export function focusedKey(ctx: TuiContext): string | null {
  const item = ctx.state.visibleItems[ctx.state.rowIdx];
  return item && item.kind === 'key' ? item.ref : null;
}

export function focusKey(ctx: TuiContext, key: string): void {
  const idx = ctx.state.visibleKeys.indexOf(key);
  if (idx >= 0) ctx.state.rowIdx = idx;
}

export function recomputeVisibleKeys(ctx: TuiContext): void {
  const { state } = ctx;
  // Two parallel structures:
  //   visibleKeys  — just the key names (used by editing helpers)
  //   visibleItems — dividers + visible keys, in render order
  // Dividers stay in the item list even when their section is collapsed,
  // so the user can navigate onto one and expand it with 'c'.
  const visibleKeys: string[] = [];
  const items: MatrixItem[] = [];
  const orderedAll = orderedKeys(ctx.matrix, state, ctx.sectionOf);
  const seen = new Set<string>();
  const focusedRef = state.visibleItems[state.rowIdx]?.ref;
  for (const k of orderedAll) {
    if (!matchesFilter(k, state.filter)) continue;
    if (state.driftOnly && !keyDrifts(ctx.matrix, k)) continue;
    const secKey = ctx.sectionOf(k) ?? SECTION_COLLAPSE_KEY;
    if (!seen.has(secKey)) {
      seen.add(secKey);
      items.push({ kind: 'divider', ref: secKey });
    }
    if (state.collapsed.has(secKey)) continue;
    items.push({ kind: 'key', ref: k });
    visibleKeys.push(k);
  }
  state.visibleKeys = visibleKeys;
  state.visibleItems = items;
  // Try to keep focus on the same item across rebuilds.
  if (focusedRef) {
    const i = items.findIndex((it) => it.ref === focusedRef);
    if (i >= 0) state.rowIdx = i;
  }
  if (state.rowIdx >= items.length) {
    state.rowIdx = Math.max(0, items.length - 1);
  }
  // Make sure we don't land on an expanded divider after a rebuild.
  if (
    items[state.rowIdx]?.kind === 'divider' &&
    !state.collapsed.has(items[state.rowIdx]!.ref)
  ) {
    const next = stepRow(state, 1);
    const prev = stepRow(state, -1);
    state.rowIdx = next !== state.rowIdx ? next : prev;
  }
}

export function rebuildMatrix(ctx: TuiContext): void {
  const { state } = ctx;
  const enabledList = ctx.allFiles.filter((f) => state.enabled.has(f));
  if (!state.enabled.has(ctx.currentBase)) {
    // Base got disabled — promote the first enabled file.
    const next = enabledList[0];
    if (next) ctx.currentBase = next;
  }
  ctx.matrix = buildMatrix(enabledList, ctx.currentBase);
  if (state.colIdx >= ctx.matrix.files.length) {
    state.colIdx = Math.max(0, ctx.matrix.files.length - 1);
  }
  if (state.sidebarIdx >= ctx.allFiles.length) {
    state.sidebarIdx = Math.max(0, ctx.allFiles.length - 1);
  }
  recomputeVisibleKeys(ctx);
}
