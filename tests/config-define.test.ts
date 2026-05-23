import { describe, expect, it } from 'vitest';
import { defineEnvprismConfig } from '@/config/define.ts';
import { DEFAULT_CONFIG } from '@/config/schema.ts';

describe('defineEnvprismConfig', () => {
  it('returns its input unchanged (identity helper)', () => {
    const cfg = { heuristics: { grouping: 'prefix' as const } };
    expect(defineEnvprismConfig(cfg)).toBe(cfg);
  });
});

describe('DEFAULT_CONFIG', () => {
  it('mirrors the previously hardcoded values', () => {
    expect(DEFAULT_CONFIG.discovery.paths).toEqual(['.']);
    expect(DEFAULT_CONFIG.discovery.skipSuffixes).toEqual([
      '.swp',
      '~',
      '.bak'
    ]);
    expect(DEFAULT_CONFIG.base.exampleName).toBe('.env.example');
    expect(DEFAULT_CONFIG.heuristics.secretTokens).toContain('SECRET');
    expect(DEFAULT_CONFIG.heuristics.secretTokens).toContain('DSN');
    expect(DEFAULT_CONFIG.heuristics.grouping).toBe('auto');
    expect(DEFAULT_CONFIG.diff).toEqual({
      json: false,
      checkExitCode: 1
    });
    expect(DEFAULT_CONFIG.tui.maskSecrets).toBe(true);
    expect(DEFAULT_CONFIG.tui.layout).toEqual({
      keyColWidth: 22,
      valueColMin: 18,
      sidebarWidth: 30,
      rowGap: 0,
      cellPadX: 1
    });
    expect(DEFAULT_CONFIG.tui.undoLimit).toBe(50);
  });

  it('keeps the placeholder atoms in sync with the legacy regex', () => {
    const re = new RegExp(
      `^(${DEFAULT_CONFIG.heuristics.placeholders.join('|')})$`,
      'i'
    );
    for (const v of ['TODO', 'changeme', 'xxxx', 'your_secret_here']) {
      expect(re.test(v)).toBe(true);
    }
    expect(re.test('postgres://x')).toBe(false);
  });
});
