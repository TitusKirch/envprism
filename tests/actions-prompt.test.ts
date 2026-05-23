import { describe, expect, it } from 'vitest';
import {
  cancelPrompt,
  commitPrompt,
  startAdd,
  startDelete,
  startEdit,
  startNewFile
} from '@tui/actions/prompt.ts';
import { findKvEntry } from '@tui/format.ts';
import { file, focusOnKey, makeTestCtx } from './helpers/ctx.ts';

function fixtures() {
  const base = file('.env.example', 'APP_NAME=base\nPORT=1\n');
  const dev = file('.env', 'APP_NAME=dev\n'); // PORT missing in dev
  return { base, dev };
}

describe('start* open the right prompt', () => {
  it('startEdit opens an edit prompt seeded with the current value', () => {
    const { base, dev } = fixtures();
    const ctx = makeTestCtx([base, dev], base);
    focusOnKey(ctx, 'APP_NAME', 0);
    startEdit(ctx);
    expect(ctx.state.mode).toBe('prompt');
    expect(ctx.state.prompt).toMatchObject({ kind: 'edit', key: 'APP_NAME' });
    expect(ctx.state.promptInput).toBe('base');
  });

  it('startAdd opens an add-key prompt for the focused file', () => {
    const { base, dev } = fixtures();
    const ctx = makeTestCtx([base, dev], base);
    ctx.state.colIdx = 0;
    startAdd(ctx);
    expect(ctx.state.prompt).toMatchObject({ kind: 'add-key' });
  });

  it('startNewFile opens a new-file prompt', () => {
    const { base, dev } = fixtures();
    const ctx = makeTestCtx([base, dev], base);
    startNewFile(ctx);
    expect(ctx.state.prompt).toMatchObject({ kind: 'new-file' });
  });

  it('startDelete removes the key and marks the file dirty', () => {
    const { base, dev } = fixtures();
    const ctx = makeTestCtx([base, dev], base);
    focusOnKey(ctx, 'PORT', 0);
    startDelete(ctx);
    expect(findKvEntry(base, 'PORT')).toBeUndefined();
    expect(ctx.state.dirty.has(base)).toBe(true);
    expect(ctx.state.undo.at(-1)).toMatchObject({ kind: 'delete-kv' });
  });
});

describe('commitPrompt', () => {
  it('edits an existing value', () => {
    const { base, dev } = fixtures();
    const ctx = makeTestCtx([base, dev], base);
    focusOnKey(ctx, 'APP_NAME', 0);
    startEdit(ctx);
    ctx.state.promptInput = 'edited';
    commitPrompt(ctx);
    expect(findKvEntry(base, 'APP_NAME')?.value).toBe('edited');
    expect(ctx.state.mode).toBe('browse');
    expect(ctx.state.dirty.has(base)).toBe(true);
  });

  it('adds the key when editing a missing cell', () => {
    const { base, dev } = fixtures();
    const ctx = makeTestCtx([base, dev], base);
    focusOnKey(ctx, 'PORT', ctx.matrix.files.indexOf(dev)); // PORT missing in dev
    startEdit(ctx);
    ctx.state.promptInput = '8080';
    commitPrompt(ctx);
    expect(findKvEntry(dev, 'PORT')?.value).toBe('8080');
  });

  it('rejects an invalid key in the add-key step', () => {
    const { base, dev } = fixtures();
    const ctx = makeTestCtx([base, dev], base);
    ctx.state.colIdx = 0;
    startAdd(ctx);
    ctx.state.promptInput = '1nvalid key';
    commitPrompt(ctx);
    expect(ctx.state.mode).toBe('prompt'); // stays open
    expect(ctx.state.message).toMatch(/invalid key/i);
  });

  it('add-key advances to add-value, which appends the entry', () => {
    const { base, dev } = fixtures();
    const ctx = makeTestCtx([base, dev], base);
    ctx.state.colIdx = 0;
    startAdd(ctx);
    ctx.state.promptInput = 'NEW_FLAG';
    commitPrompt(ctx); // -> add-value
    expect(ctx.state.prompt).toMatchObject({
      kind: 'add-value',
      key: 'NEW_FLAG'
    });
    ctx.state.promptInput = 'true';
    commitPrompt(ctx);
    expect(findKvEntry(base, 'NEW_FLAG')?.value).toBe('true');
  });

  it('rejects an invalid filename in the new-file step', () => {
    const { base, dev } = fixtures();
    const ctx = makeTestCtx([base, dev], base);
    startNewFile(ctx);
    ctx.state.promptInput = 'notenv';
    commitPrompt(ctx);
    expect(ctx.state.mode).toBe('prompt');
    expect(ctx.state.message).toMatch(/\.env/);
  });

  it('rejects an empty filename', () => {
    const { base, dev } = fixtures();
    const ctx = makeTestCtx([base, dev], base);
    startNewFile(ctx);
    ctx.state.promptInput = '   ';
    commitPrompt(ctx);
    expect(ctx.state.message).toMatch(/empty/i);
  });

  it('rejects a filename that already exists', () => {
    const { base, dev } = fixtures();
    const ctx = makeTestCtx([base, dev], base);
    startNewFile(ctx);
    ctx.state.promptInput = '.env'; // dev already lives at .env next to base
    commitPrompt(ctx);
    expect(ctx.state.message).toMatch(/already exists/i);
  });

  it('creates a new env file in the new-file step', () => {
    const { base, dev } = fixtures();
    const ctx = makeTestCtx([base, dev], base);
    startNewFile(ctx);
    ctx.state.promptInput = '.env.local';
    commitPrompt(ctx);
    expect(ctx.allFiles.some((f) => f.path.endsWith('.env.local'))).toBe(true);
    expect(ctx.state.mode).toBe('browse');
  });
});

describe('cancelPrompt', () => {
  it('closes the prompt with a cancelled message', () => {
    const { base, dev } = fixtures();
    const ctx = makeTestCtx([base, dev], base);
    startNewFile(ctx);
    cancelPrompt(ctx);
    expect(ctx.state.mode).toBe('browse');
    expect(ctx.state.prompt).toBeNull();
    expect(ctx.state.message).toMatch(/cancel/i);
  });
});
