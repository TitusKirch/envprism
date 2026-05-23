import { describe, expect, it } from 'vitest';
import {
  applyToAllFiles,
  setBase,
  syncToAll,
  toggleEnabled,
  undo
} from '@tui/actions/batch.ts';
import { findKvEntry } from '@tui/format.ts';
import { file, focusOnKey, makeTestCtx } from './helpers/ctx.ts';

function fixtures() {
  const base = file('.env.example', 'APP_NAME=base\nPORT=1\n');
  const dev = file('.env', 'APP_NAME=dev\nPORT=2\n');
  const prod = file('.env.production', 'APP_NAME=prod\n'); // PORT missing
  return { base, dev, prod };
}

describe('applyToAllFiles', () => {
  it('sets the key in every file and records one undo entry per change', () => {
    const { base, dev, prod } = fixtures();
    const ctx = makeTestCtx([base, dev, prod], base);
    const touched = applyToAllFiles(ctx, 'PORT', '9000');
    expect(touched).toBe(3); // base 1->9000, dev 2->9000, prod adds it
    expect(findKvEntry(base, 'PORT')?.value).toBe('9000');
    expect(findKvEntry(prod, 'PORT')?.value).toBe('9000');
    expect(ctx.state.undo.length).toBe(3);
    expect(ctx.state.dirty.size).toBe(3);
  });

  it('skips files that already hold the value', () => {
    const { base, dev, prod } = fixtures();
    const ctx = makeTestCtx([base, dev, prod], base);
    const touched = applyToAllFiles(ctx, 'APP_NAME', 'dev');
    expect(touched).toBe(2); // dev already 'dev'
  });
});

describe('syncToAll', () => {
  it('propagates the focused cell value to all files', () => {
    const { base, dev, prod } = fixtures();
    const ctx = makeTestCtx([base, dev, prod], base);
    focusOnKey(ctx, 'PORT', ctx.matrix.files.indexOf(dev)); // PORT=2 in dev
    syncToAll(ctx);
    expect(findKvEntry(base, 'PORT')?.value).toBe('2');
    expect(findKvEntry(prod, 'PORT')?.value).toBe('2');
  });
});

describe('undo', () => {
  it('reverses an edit', () => {
    const { base, dev, prod } = fixtures();
    const ctx = makeTestCtx([base, dev, prod], base);
    applyToAllFiles(ctx, 'APP_NAME', 'changed');
    undo(ctx); // undoes last (prod)
    expect(findKvEntry(prod, 'APP_NAME')?.value).toBe('prod');
  });

  it('reports nothing to undo on an empty stack', () => {
    const { base, dev } = fixtures();
    const ctx = makeTestCtx([base, dev], base);
    undo(ctx);
    expect(ctx.state.message).toMatch(/nothing to undo/i);
  });

  it('reverses an add (removes the appended entry)', () => {
    const { base, dev } = fixtures();
    const ctx = makeTestCtx([base, dev], base);
    applyToAllFiles(ctx, 'NEW_KEY', 'v'); // appends to files lacking it
    undo(ctx);
    expect(findKvEntry(ctx.allFiles.at(-1)!, 'NEW_KEY')).toBeUndefined();
  });

  it('reverses a delete (re-inserts the entry)', () => {
    const { base, dev } = fixtures();
    const ctx = makeTestCtx([base, dev], base);
    const idx = base.entries.findIndex(
      (e) => e.kind === 'kv' && e.key === 'PORT'
    );
    const entry = base.entries[idx];
    if (!entry || entry.kind !== 'kv') throw new Error('PORT not found');
    ctx.state.undo.push({ kind: 'delete-kv', file: base, entry, idx });
    base.entries.splice(idx, 1);
    undo(ctx);
    expect(findKvEntry(base, 'PORT')).toBeDefined();
  });
});

describe('toggleEnabled', () => {
  it('disables the selected file and rebuilds the matrix', () => {
    const { base, dev, prod } = fixtures();
    const ctx = makeTestCtx([base, dev, prod], base);
    ctx.state.sidebarIdx = ctx.allFiles.indexOf(dev);
    toggleEnabled(ctx);
    expect(ctx.state.enabled.has(dev)).toBe(false);
    expect(ctx.matrix.files).not.toContain(dev);
  });

  it('re-enables a disabled file', () => {
    const { base, dev, prod } = fixtures();
    const ctx = makeTestCtx([base, dev, prod], base);
    ctx.state.sidebarIdx = ctx.allFiles.indexOf(dev);
    toggleEnabled(ctx); // off
    toggleEnabled(ctx); // on
    expect(ctx.state.enabled.has(dev)).toBe(true);
    expect(ctx.matrix.files).toContain(dev);
  });

  it('refuses to disable the last enabled file', () => {
    const { base } = fixtures();
    const ctx = makeTestCtx([base], base);
    ctx.state.sidebarIdx = 0;
    toggleEnabled(ctx);
    expect(ctx.state.enabled.has(base)).toBe(true);
    expect(ctx.state.message).toMatch(/at least one/i);
  });
});

describe('setBase', () => {
  it('switches the base to the selected file', () => {
    const { base, dev, prod } = fixtures();
    const ctx = makeTestCtx([base, dev, prod], base);
    ctx.state.sidebarIdx = ctx.allFiles.indexOf(dev);
    setBase(ctx);
    expect(ctx.currentBase).toBe(dev);
    expect(ctx.matrix.base).toBe(dev);
  });

  it('is a no-op note when the selected file is already the base', () => {
    const { base, dev } = fixtures();
    const ctx = makeTestCtx([base, dev], base);
    ctx.state.sidebarIdx = ctx.allFiles.indexOf(base);
    setBase(ctx);
    expect(ctx.state.message).toMatch(/already the base/i);
  });
});

describe('syncToAll — guard rails', () => {
  it('warns when the cursor is not on a key row', () => {
    const { base, dev } = fixtures();
    const ctx = makeTestCtx([base, dev], base, {
      heuristics: { grouping: 'prefix' }
    });
    ctx.state.rowIdx = ctx.state.visibleItems.findIndex(
      (i) => i.kind === 'divider'
    );
    syncToAll(ctx);
    expect(ctx.state.message).toMatch(/move onto a variable row/i);
  });

  it('warns when the focused file has no value to sync', () => {
    const { base, dev, prod } = fixtures();
    const ctx = makeTestCtx([base, dev, prod], base);
    focusOnKey(ctx, 'PORT', ctx.matrix.files.indexOf(prod)); // PORT missing in prod
    syncToAll(ctx);
    expect(ctx.state.message).toMatch(/no value/i);
  });
});
