import { describe, expect, it } from 'vitest';
import {
  cellKey,
  focusedKey,
  focusKey,
  markModified,
  pushUndo,
  rebuildMatrix,
  recomputeVisibleKeys
} from '@tui/state/visible.ts';
import { file, makeTestCtx } from './helpers/ctx.ts';

function baseFixtures() {
  const base = file(
    '.env.example',
    '# === App ===\nAPP_NAME=x\nAPP_PORT=1\n# === DB ===\nDB_HOST=h\nLONE=v\n'
  );
  const dev = file('.env', 'APP_NAME=x\nAPP_PORT=2\nLONE=v\n');
  return { base, dev };
}

describe('recomputeVisibleKeys', () => {
  it('lists keys with section dividers in banner grouping', () => {
    const { base, dev } = baseFixtures();
    const ctx = makeTestCtx([base, dev], base, {
      heuristics: { grouping: 'banner' }
    });
    const kinds = ctx.state.visibleItems.map((i) => i.kind);
    expect(kinds.filter((k) => k === 'divider').length).toBeGreaterThanOrEqual(
      2
    );
    expect(ctx.state.visibleKeys).toContain('APP_NAME');
    expect(ctx.state.visibleKeys).toContain('DB_HOST');
  });

  it('filters by the active filter string', () => {
    const { base, dev } = baseFixtures();
    const ctx = makeTestCtx([base, dev], base);
    ctx.state.filter = 'app';
    recomputeVisibleKeys(ctx);
    expect(ctx.state.visibleKeys).toEqual(['APP_NAME', 'APP_PORT']);
  });

  it('drift-only hides aligned keys', () => {
    const { base, dev } = baseFixtures();
    const ctx = makeTestCtx([base, dev], base);
    ctx.state.driftOnly = true;
    recomputeVisibleKeys(ctx);
    expect(ctx.state.visibleKeys).toContain('APP_PORT'); // 1 vs 2
    expect(ctx.state.visibleKeys).toContain('DB_HOST'); // missing in dev
    expect(ctx.state.visibleKeys).not.toContain('APP_NAME'); // same
  });

  it('drops keys of collapsed sections from visibleKeys but keeps the divider', () => {
    const { base, dev } = baseFixtures();
    const ctx = makeTestCtx([base, dev], base, {
      heuristics: { grouping: 'banner' }
    });
    const sec = ctx.sectionOf('APP_NAME')!;
    ctx.state.collapsed.add(sec);
    recomputeVisibleKeys(ctx);
    expect(ctx.state.visibleKeys).not.toContain('APP_NAME');
    expect(
      ctx.state.visibleItems.some((i) => i.kind === 'divider' && i.ref === sec)
    ).toBe(true);
  });
});

describe('rebuildMatrix', () => {
  it('rebuilds from enabled files and clamps colIdx', () => {
    const { base, dev } = baseFixtures();
    const ctx = makeTestCtx([base, dev], base);
    ctx.state.colIdx = 1;
    ctx.state.enabled.delete(dev);
    rebuildMatrix(ctx);
    expect(ctx.matrix.files).toEqual([base]);
    expect(ctx.state.colIdx).toBe(0);
  });

  it('promotes a new base when the current base is disabled', () => {
    const { base, dev } = baseFixtures();
    const ctx = makeTestCtx([base, dev], base);
    ctx.state.enabled.delete(base);
    rebuildMatrix(ctx);
    expect(ctx.currentBase).toBe(dev);
  });
});

describe('focus + undo helpers', () => {
  it('focusedKey returns the key under the cursor, null on a divider', () => {
    const { base, dev } = baseFixtures();
    const ctx = makeTestCtx([base, dev], base, {
      heuristics: { grouping: 'banner' }
    });
    const keyIdx = ctx.state.visibleItems.findIndex((i) => i.kind === 'key');
    ctx.state.rowIdx = keyIdx;
    expect(focusedKey(ctx)).toBe(ctx.state.visibleItems[keyIdx]!.ref);

    const divIdx = ctx.state.visibleItems.findIndex(
      (i) => i.kind === 'divider'
    );
    ctx.state.rowIdx = divIdx;
    expect(focusedKey(ctx)).toBeNull();
  });

  it('focusKey points rowIdx at the key index in visibleKeys', () => {
    const { base, dev } = baseFixtures();
    const ctx = makeTestCtx([base, dev], base);
    focusKey(ctx, 'LONE');
    expect(ctx.state.rowIdx).toBe(ctx.state.visibleKeys.indexOf('LONE'));
  });

  it('cellKey + markModified record a touched cell', () => {
    const { base, dev } = baseFixtures();
    const ctx = makeTestCtx([base, dev], base);
    markModified(ctx, 'APP_NAME', base);
    expect(ctx.state.modified.has(cellKey('APP_NAME', base))).toBe(true);
  });

  it('pushUndo trims to the configured undoLimit', () => {
    const { base, dev } = baseFixtures();
    const ctx = makeTestCtx([base, dev], base, { tui: { undoLimit: 2 } });
    for (let i = 0; i < 5; i++) {
      pushUndo(ctx, { kind: 'add-kv', file: base, entry: {} as never });
    }
    expect(ctx.state.undo.length).toBe(2);
  });
});
