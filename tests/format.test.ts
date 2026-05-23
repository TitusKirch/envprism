import { describe, expect, it } from 'vitest';
import { maskValue } from '@/core/mask.ts';
import { parseEnv } from '@/core/parse.ts';
import {
  findKvEntry,
  formatValue,
  isPlaceholderValue,
  matchesFilter,
  truncate
} from '@tui/format.ts';

describe('isPlaceholderValue', () => {
  it('flags common placeholder tokens (case-insensitive)', () => {
    for (const v of [
      'todo',
      'FIXME',
      'changeme',
      'xxx',
      'xxxx',
      'your_secret_here',
      'replace-me'
    ]) {
      expect(isPlaceholderValue(v)).toBe(true);
    }
  });

  it('ignores empty/whitespace and real values', () => {
    expect(isPlaceholderValue('')).toBe(false);
    expect(isPlaceholderValue('   ')).toBe(false);
    expect(isPlaceholderValue('postgres://localhost')).toBe(false);
    expect(isPlaceholderValue('xx')).toBe(false); // needs 3+ x
  });

  it('trims before testing', () => {
    expect(isPlaceholderValue('  TODO  ')).toBe(true);
  });
});

describe('formatValue', () => {
  it('returns empty string for undefined', () => {
    expect(formatValue(undefined, false)).toBe('');
    expect(formatValue(undefined, true)).toBe('');
  });

  it('returns the raw value when not secret', () => {
    expect(formatValue('plain', false)).toBe('plain');
  });

  it('masks the value when secret', () => {
    expect(formatValue('super-secret', true)).toBe(maskValue('super-secret'));
  });
});

describe('matchesFilter', () => {
  it('matches everything when filter is empty', () => {
    expect(matchesFilter('ANYTHING', '')).toBe(true);
  });

  it('is a case-insensitive substring match', () => {
    expect(matchesFilter('DATABASE_URL', 'base')).toBe(true);
    expect(matchesFilter('DATABASE_URL', 'BASE')).toBe(true);
    expect(matchesFilter('PORT', 'url')).toBe(false);
  });
});

describe('truncate', () => {
  it('returns empty for non-positive width', () => {
    expect(truncate('hello', 0)).toBe('');
    expect(truncate('hello', -3)).toBe('');
  });

  it('returns text unchanged when it fits', () => {
    expect(truncate('hi', 5)).toBe('hi');
    expect(truncate('hello', 5)).toBe('hello');
  });

  it('adds an ellipsis when too long', () => {
    expect(truncate('hello', 4)).toBe('hel…');
    expect(truncate('hello', 1)).toBe('…');
  });
});

describe('findKvEntry', () => {
  const file = parseEnv('# c\nFOO=1\nBAR=2\n', '.env');

  it('finds an existing key', () => {
    expect(findKvEntry(file, 'BAR')?.value).toBe('2');
  });

  it('returns undefined for a missing key', () => {
    expect(findKvEntry(file, 'NOPE')).toBeUndefined();
  });
});
