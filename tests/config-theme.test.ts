import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_THEME_HEX, resolveThemeHex } from '@/config/resolve.ts';

describe('resolveThemeHex', () => {
  it('returns the built-in defaults for an empty override', () => {
    expect(resolveThemeHex({})).toEqual(DEFAULT_THEME_HEX);
  });

  it('applies a valid partial override and keeps other defaults', () => {
    const out = resolveThemeHex({ fgBase: '#abcdef' });
    expect(out.fgBase).toBe('#abcdef');
    expect(out.fg).toBe(DEFAULT_THEME_HEX.fg);
  });

  it('warns and falls back on an invalid hex (light runtime guard)', () => {
    const warn = vi.fn();
    const out = resolveThemeHex({ fg: 'not-a-hex' }, warn);
    expect(out.fg).toBe(DEFAULT_THEME_HEX.fg);
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]?.[0]).toMatch(/theme\.fg/);
  });

  it('matches the legacy COLORS palette byte-for-byte', () => {
    // These were the hardcoded COLORS hex values before the config refactor.
    expect(DEFAULT_THEME_HEX).toEqual({
      fg: '#cccccc',
      fgDim: '#666666',
      fgHeader: '#ffffff',
      fgBase: '#82aaff',
      fgSection: '#82aaff',
      differs: '#ffd866',
      extra: '#ffd866',
      placeholder: '#ffd866',
      modified: '#7fce6a',
      fgDirty: '#7fce6a',
      missing: '#ff6b6b',
      focusBg: '#3a3f4b'
    });
  });
});
