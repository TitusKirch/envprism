import { describe, expect, it } from 'vitest';
import { buildMatrix } from '@/core/matrix.ts';
import { parseEnv } from '@/core/parse.ts';
import {
  groupByPrefix,
  keyDrifts,
  orderedKeys,
  prefixSection,
  SECTION_COLLAPSE_KEY,
  sectionMetadata,
  stepRow
} from '@tui/grouping.ts';
import type { MatrixItem, State } from '@tui/types.ts';

function makeState(over: Partial<State>): State {
  return {
    mode: 'browse',
    filter: '',
    rowIdx: 0,
    colIdx: 0,
    prompt: null,
    dirty: new Set(),
    visibleKeys: [],
    visibleItems: [],
    message: null,
    driftOnly: false,
    confirmQuit: false,
    grouping: 'banner',
    helpOpen: false,
    undo: [],
    pane: 'matrix',
    sidebarIdx: 0,
    enabled: new Set(),
    showSecrets: false,
    collapsed: new Set(),
    modified: new Set(),
    promptInput: '',
    ...over
  };
}

const base = parseEnv(
  'APP_NAME=x\nAPP_PORT=1\nDB_HOST=h\nLONE=v\n',
  '.env.example'
);
const dev = parseEnv('APP_NAME=x\nAPP_PORT=2\nLONE=v\n', '.env');
const matrix = buildMatrix([base, dev], base);

describe('prefixSection', () => {
  it('takes the first underscore-delimited prefix', () => {
    expect(prefixSection('APP_NAME')).toBe('APP');
    expect(prefixSection('DB_HOST')).toBe('DB');
  });

  it('returns undefined when there is no usable prefix', () => {
    expect(prefixSection('LONE')).toBeUndefined();
    expect(prefixSection('_LEADING')).toBeUndefined();
  });
});

describe('groupByPrefix', () => {
  it('clusters by prefix in first-seen order, prefix-less keys trail', () => {
    expect(groupByPrefix(['APP_A', 'DB_X', 'APP_B', 'LONE', 'DB_Y'])).toEqual([
      'APP_A',
      'APP_B',
      'DB_X',
      'DB_Y',
      'LONE'
    ]);
  });
});

describe('keyDrifts', () => {
  it('is true when a non-base file differs and false when aligned', () => {
    expect(keyDrifts(matrix, 'APP_PORT')).toBe(true); // 1 vs 2
    expect(keyDrifts(matrix, 'DB_HOST')).toBe(true); // missing in dev
    expect(keyDrifts(matrix, 'APP_NAME')).toBe(false);
  });
});

describe('orderedKeys', () => {
  it('filters by substring', () => {
    const state = makeState({ filter: 'app' });
    expect(orderedKeys(matrix, state, () => undefined)).toEqual([
      'APP_NAME',
      'APP_PORT'
    ]);
  });

  it('drift-only drops aligned keys', () => {
    const state = makeState({ driftOnly: true });
    expect(orderedKeys(matrix, state, () => undefined)).not.toContain(
      'APP_NAME'
    );
    expect(orderedKeys(matrix, state, () => undefined)).toContain('APP_PORT');
  });

  it('regroups by prefix when grouping is prefix', () => {
    const state = makeState({ grouping: 'prefix' });
    expect(orderedKeys(matrix, state, () => undefined)).toEqual([
      'APP_NAME',
      'APP_PORT',
      'DB_HOST',
      'LONE'
    ]);
  });
});

describe('sectionMetadata', () => {
  it('counts drift/missing/total per section bucket', () => {
    const state = makeState({ grouping: 'prefix' });
    const meta = sectionMetadata(matrix, prefixSection, state);
    expect(meta.get('APP')).toEqual({ drift: 1, missing: 0, total: 2 });
    expect(meta.get('DB')).toEqual({ drift: 1, missing: 1, total: 1 });
    expect(meta.get(SECTION_COLLAPSE_KEY)).toEqual({
      drift: 0,
      missing: 0,
      total: 1
    });
  });
});

describe('stepRow', () => {
  const items: MatrixItem[] = [
    { kind: 'key', ref: 'A' },
    { kind: 'divider', ref: 'sec' },
    { kind: 'key', ref: 'B' }
  ];

  it('skips a divider that is not collapsed', () => {
    const state = makeState({ visibleItems: items, rowIdx: 0 });
    expect(stepRow(state, 1)).toBe(2);
  });

  it('lands on a divider when its section is collapsed', () => {
    const state = makeState({
      visibleItems: items,
      rowIdx: 0,
      collapsed: new Set(['sec'])
    });
    expect(stepRow(state, 1)).toBe(1);
  });

  it('clamps to the current row when nothing further is focusable', () => {
    const state = makeState({ visibleItems: items, rowIdx: 2 });
    expect(stepRow(state, 1)).toBe(2);
  });
});
