import { rebuildKvLine } from '@/core/serialize.ts';
import { basename, dirname, join } from 'pathe';
import type { TuiContext } from '@tui/context.ts';
import {
  appendKv,
  createEmptyEnvFile,
  isValidEnvFileName
} from '@tui/envfile.ts';
import { findKvEntry } from '@tui/format.ts';
import {
  focusedKey,
  focusKey,
  markModified,
  pushUndo,
  rebuildMatrix
} from '@tui/state/visible.ts';
import { KEY_RE, type Prompt } from '@tui/types.ts';

export function openPrompt(ctx: TuiContext, prompt: Prompt, value = ''): void {
  const { state } = ctx;
  state.prompt = prompt;
  state.mode = 'prompt';
  state.message = null;
  state.promptInput = value;
  ctx.refresh();
}

export function closePrompt(ctx: TuiContext, msg: string | null = null): void {
  const { state } = ctx;
  state.prompt = null;
  state.mode = 'browse';
  state.promptInput = '';
  state.message = msg;
  ctx.refresh();
}

export function cancelPrompt(ctx: TuiContext): void {
  closePrompt(ctx, 'Cancelled.');
}

export function startEdit(ctx: TuiContext): void {
  const { state } = ctx;
  const key = focusedKey(ctx);
  const file = ctx.matrix.files[state.colIdx];
  if (!key || !file) {
    state.message = 'Move onto a variable row to edit.';
    ctx.refresh();
    return;
  }
  // Edit works on missing cells too — on commit we either update the
  // existing entry or append a new one.
  const entry = findKvEntry(file, key);
  openPrompt(ctx, { kind: 'edit', key, file }, entry?.value ?? '');
}

export function startAdd(ctx: TuiContext): void {
  const file = ctx.matrix.files[ctx.state.colIdx];
  if (!file) return;
  openPrompt(ctx, { kind: 'add-key', file });
}

export function startNewFile(ctx: TuiContext): void {
  openPrompt(ctx, { kind: 'new-file' });
}

export function startDelete(ctx: TuiContext): void {
  const { state } = ctx;
  const key = focusedKey(ctx);
  const file = ctx.matrix.files[state.colIdx];
  if (!key || !file) {
    state.message = 'Move onto a variable row to delete.';
    ctx.refresh();
    return;
  }
  const entry = findKvEntry(file, key);
  if (!entry) {
    state.message = `${key} is not present in ${basename(file.path)}.`;
    ctx.refresh();
    return;
  }
  const idx = file.entries.indexOf(entry);
  if (idx >= 0) {
    pushUndo(ctx, { kind: 'delete-kv', file, entry, idx });
    file.entries.splice(idx, 1);
  }
  state.dirty.add(file);
  markModified(ctx, key, file);
  rebuildMatrix(ctx);
  state.message = `Deleted ${key} from ${basename(file.path)}. Ctrl-S to save.`;
  ctx.refresh();
}

export function commitPrompt(ctx: TuiContext): void {
  const { state } = ctx;
  if (!state.prompt) return;
  const p = state.prompt;
  const raw = state.promptInput;

  if (p.kind === 'edit') {
    const existing = findKvEntry(p.file, p.key);
    if (existing) {
      pushUndo(ctx, {
        kind: 'edit',
        file: p.file,
        entry: existing,
        prevValue: existing.value,
        prevRaw: existing.raw
      });
      existing.value = raw;
      rebuildKvLine(existing);
      state.dirty.add(p.file);
      markModified(ctx, p.key, p.file);
      rebuildMatrix(ctx);
      closePrompt(
        ctx,
        `Edited ${p.key} in ${basename(p.file.path)}. Ctrl-S to save.`
      );
    } else {
      // Missing cell: add the key with the typed value.
      const added = appendKv(p.file, p.key, raw);
      pushUndo(ctx, { kind: 'add-kv', file: p.file, entry: added });
      state.dirty.add(p.file);
      markModified(ctx, p.key, p.file);
      rebuildMatrix(ctx);
      closePrompt(
        ctx,
        `Added ${p.key} to ${basename(p.file.path)}. Ctrl-S to save.`
      );
    }
    return;
  }

  if (p.kind === 'add-key') {
    const key = raw.trim();
    if (!KEY_RE.test(key)) {
      state.message = `Invalid key "${key}". Must match ${KEY_RE.source}.`;
      ctx.refresh();
      return;
    }
    if (findKvEntry(p.file, key)) {
      state.message = `${key} already exists in ${basename(p.file.path)}. Use edit instead.`;
      ctx.refresh();
      return;
    }
    openPrompt(ctx, { kind: 'add-value', key, file: p.file });
    return;
  }

  if (p.kind === 'add-value') {
    const added = appendKv(p.file, p.key, raw);
    pushUndo(ctx, { kind: 'add-kv', file: p.file, entry: added });
    state.dirty.add(p.file);
    markModified(ctx, p.key, p.file);
    rebuildMatrix(ctx);
    focusKey(ctx, p.key);
    state.colIdx = ctx.matrix.files.indexOf(p.file);
    closePrompt(
      ctx,
      `Added ${p.key} to ${basename(p.file.path)}. Ctrl-S to save.`
    );
    return;
  }

  if (p.kind === 'new-file') {
    const name = raw.trim();
    if (!isValidEnvFileName(name)) {
      state.message =
        name.length === 0
          ? 'Filename cannot be empty.'
          : !name.startsWith('.env')
            ? `Filename must start with ".env" (got "${name}").`
            : `"${name}" is not a valid env filename.`;
      ctx.refresh();
      return;
    }
    const newPath = join(dirname(ctx.currentBase.path), name);
    if (ctx.allFiles.some((f) => f.path === newPath)) {
      state.message = `${name} already exists.`;
      ctx.refresh();
      return;
    }
    const newFile = createEmptyEnvFile(newPath);
    ctx.allFiles.push(newFile);
    state.enabled.add(newFile);
    state.dirty.add(newFile);
    rebuildMatrix(ctx);
    state.colIdx = ctx.matrix.files.indexOf(newFile);
    closePrompt(ctx, `Created ${name}. Ctrl-S to write to disk.`);
    return;
  }
}
