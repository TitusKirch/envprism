import { rebuildKvLine } from '@/core/serialize.ts';
import { basename } from 'pathe';
import type { TuiContext } from '@tui/context.ts';
import { appendKv } from '@tui/envfile.ts';
import { findKvEntry } from '@tui/format.ts';
import {
  focusedKey,
  markModified,
  pushUndo,
  rebuildMatrix
} from '@tui/state/visible.ts';

export function applyToAllFiles(
  ctx: TuiContext,
  key: string,
  value: string
): number {
  // Set key=value in every enabled file. Used by '=' in the matrix and
  // Ctrl-A from the edit prompt. Each per-file mutation is undone
  // individually (one Ctrl-Z per file) — not perfect but predictable.
  const { state } = ctx;
  let touched = 0;
  for (const file of ctx.matrix.files) {
    const existing = findKvEntry(file, key);
    if (existing) {
      if (existing.value === value) continue;
      pushUndo(ctx, {
        kind: 'edit',
        file,
        entry: existing,
        prevValue: existing.value,
        prevRaw: existing.raw
      });
      existing.value = value;
      rebuildKvLine(existing);
    } else {
      const added = appendKv(file, key, value);
      pushUndo(ctx, { kind: 'add-kv', file, entry: added });
    }
    state.dirty.add(file);
    markModified(ctx, key, file);
    touched++;
  }
  return touched;
}

export function syncToAll(ctx: TuiContext): void {
  const { state } = ctx;
  const key = focusedKey(ctx);
  const file = ctx.matrix.files[state.colIdx];
  if (!key || !file) {
    state.message = 'Move onto a variable row to sync.';
    ctx.refresh();
    return;
  }
  const entry = findKvEntry(file, key);
  if (!entry) {
    state.message = `${key} has no value in ${basename(file.path)} to sync.`;
    ctx.refresh();
    return;
  }
  const touched = applyToAllFiles(ctx, key, entry.value);
  rebuildMatrix(ctx);
  state.message =
    touched > 0
      ? `Synced ${key} to ${touched} file(s). Ctrl-S to save.`
      : `${key} is already in sync.`;
  ctx.refresh();
}

export function undo(ctx: TuiContext): void {
  const { state } = ctx;
  const last = state.undo.pop();
  if (!last) {
    state.message = 'Nothing to undo.';
    ctx.refresh();
    return;
  }
  switch (last.kind) {
    case 'edit':
      last.entry.value = last.prevValue;
      last.entry.raw = last.prevRaw;
      state.dirty.add(last.file);
      state.message = `Undid edit on ${last.entry.key} in ${basename(last.file.path)}.`;
      break;
    case 'add-kv': {
      const i = last.file.entries.indexOf(last.entry);
      if (i >= 0) last.file.entries.splice(i, 1);
      state.dirty.add(last.file);
      state.message = `Undid add of ${last.entry.key} in ${basename(last.file.path)}.`;
      break;
    }
    case 'delete-kv':
      last.file.entries.splice(last.idx, 0, last.entry);
      state.dirty.add(last.file);
      state.message = `Undid delete of ${last.entry.key} in ${basename(last.file.path)}.`;
      break;
  }
  rebuildMatrix(ctx);
  ctx.refresh();
}

export function toggleEnabled(ctx: TuiContext): void {
  const { state } = ctx;
  const file = ctx.allFiles[state.sidebarIdx];
  if (!file) return;
  if (state.enabled.has(file)) {
    if (state.enabled.size === 1) {
      state.message = 'At least one file must stay enabled.';
      ctx.refresh();
      return;
    }
    state.enabled.delete(file);
    state.message = `Hidden ${basename(file.path)} from the matrix.`;
  } else {
    state.enabled.add(file);
    state.message = `Showing ${basename(file.path)} in the matrix.`;
  }
  rebuildMatrix(ctx);
  ctx.refresh();
}

export function setBase(ctx: TuiContext): void {
  const { state } = ctx;
  const file = ctx.allFiles[state.sidebarIdx];
  if (!file) return;
  if (file === ctx.currentBase) {
    state.message = `${basename(file.path)} is already the base.`;
    ctx.refresh();
    return;
  }
  const wasDisabled = !state.enabled.has(file);
  if (wasDisabled) state.enabled.add(file);
  ctx.currentBase = file;
  rebuildMatrix(ctx);
  state.message = wasDisabled
    ? `${basename(file.path)} is now the base (re-enabled).`
    : `${basename(file.path)} is now the base.`;
  ctx.refresh();
}
