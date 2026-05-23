import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { rebuildKvLine } from '@/core/serialize.ts';
import { saveDirty } from '@tui/actions/io.ts';
import { file, makeTestCtx } from './helpers/ctx.ts';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'envprism-io-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('saveDirty', () => {
  it('writes every dirty file to disk and clears the dirty/modified sets', async () => {
    const base = file(join(dir, '.env.example'), 'APP_NAME=base\n');
    const dev = file(join(dir, '.env'), 'APP_NAME=dev\n');
    const ctx = makeTestCtx([base, dev], base);

    // Mutate a value and mark dirty/modified as the editing layer would.
    const entry = base.entries.find((e) => e.kind === 'kv');
    if (entry && entry.kind === 'kv') {
      entry.value = 'written';
      rebuildKvLine(entry);
    }
    ctx.state.dirty.add(base);
    ctx.state.modified.add('APP_NAME|' + base.path);

    await saveDirty(ctx);

    expect(await readFile(base.path, 'utf8')).toContain('APP_NAME=written');
    expect(ctx.state.dirty.size).toBe(0);
    expect(ctx.state.modified.size).toBe(0);
    expect(ctx.state.message).toMatch(/saved 1 file/i);
  });

  it('does nothing when there are no dirty files', async () => {
    const base = file(join(dir, '.env.example'), 'A=1\n');
    const ctx = makeTestCtx([base], base);
    await saveDirty(ctx);
    expect(ctx.state.message).toMatch(/nothing to save/i);
  });

  it('reports a failure when a file cannot be written', async () => {
    // Point a dirty file at a path inside a non-existent directory.
    const base = file(join(dir, 'missing-subdir', '.env'), 'A=1\n');
    const ctx = makeTestCtx([base], base);
    ctx.state.dirty.add(base);
    await saveDirty(ctx);
    expect(ctx.state.message).toMatch(/save failed/i);
    expect(ctx.state.dirty.size).toBe(1); // not cleared on failure
  });
});
