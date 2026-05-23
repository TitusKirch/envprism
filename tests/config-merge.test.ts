import { describe, expect, it } from 'vitest';
import { mergeConfig } from '@/config/resolve.ts';
import { DEFAULT_CONFIG } from '@/config/schema.ts';

describe('mergeConfig', () => {
  it('returns defaults for an empty user config', () => {
    expect(mergeConfig({})).toEqual(DEFAULT_CONFIG);
    expect(mergeConfig()).toEqual(DEFAULT_CONFIG);
  });

  it('replaces a list when the base field is given', () => {
    const merged = mergeConfig({ heuristics: { secretTokens: ['JWT'] } });
    expect(merged.heuristics.secretTokens).toEqual(['JWT']);
  });

  it('appends via *Extra to the default list', () => {
    const merged = mergeConfig({ heuristics: { secretTokensExtra: ['JWT'] } });
    expect(merged.heuristics.secretTokens).toEqual([
      ...DEFAULT_CONFIG.heuristics.secretTokens,
      'JWT'
    ]);
  });

  it('appends *Extra onto an explicit replace list', () => {
    const merged = mergeConfig({
      heuristics: { secretTokens: ['A'], secretTokensExtra: ['B'] }
    });
    expect(merged.heuristics.secretTokens).toEqual(['A', 'B']);
    expect(merged.heuristics.secretTokensExtra).toEqual([]);
  });

  it('de-duplicates merged list entries', () => {
    const merged = mergeConfig({
      discovery: { skipSuffixesExtra: ['.bak', '.tmp'] }
    });
    expect(merged.discovery.skipSuffixes).toEqual([
      '.swp',
      '~',
      '.bak',
      '.tmp'
    ]);
  });

  it('lets user scalars win and fills gaps from defaults (defu)', () => {
    const merged = mergeConfig({ diff: { json: true } });
    expect(merged.diff.json).toBe(true);
    expect(merged.diff.checkExitCode).toBe(1); // gap filled from default
  });

  it('deep-merges partial theme overrides, keeping other keys absent', () => {
    const merged = mergeConfig({ tui: { theme: { fgBase: '#abcdef' } } });
    expect(merged.tui.theme.fgBase).toBe('#abcdef');
    expect(merged.tui.theme.fg).toBeUndefined();
    expect(merged.tui.layout.keyColWidth).toBe(22);
  });

  it('replaces base.priority rather than concatenating', () => {
    const merged = mergeConfig({ base: { priority: ['.env.shared'] } });
    expect(merged.base.priority).toEqual(['.env.shared']);
  });
});
