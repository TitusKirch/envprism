import { describe, expect, it } from 'vitest';
import { isSecretKey } from '@/core/mask.ts';
import { mergeConfig, resolveHeuristics } from '@/config/resolve.ts';
import { isPlaceholderValue } from '@tui/format.ts';

describe('core threading honors custom config', () => {
  it('isSecretKey matches a custom token list', () => {
    expect(isSecretKey('SESSION_JWT')).toBe(false); // not a default token
    expect(isSecretKey('SESSION_JWT', ['JWT'])).toBe(true);
  });

  it('isPlaceholderValue matches a custom regex', () => {
    const re = /^(setme)$/i;
    expect(isPlaceholderValue('SETME', re)).toBe(true);
    expect(isPlaceholderValue('todo', re)).toBe(false); // default atom not in custom re
  });
});

describe('resolveHeuristics', () => {
  it('compiles default matchers equivalent to the built-ins', () => {
    const h = resolveHeuristics(mergeConfig({}));
    expect(h.isSecretKey('API_TOKEN')).toBe(true);
    expect(h.isSecretKey('PUBLIC_KEY')).toBe(false); // carve-out preserved
    expect(h.isPlaceholderValue('changeme')).toBe(true);
    expect(h.grouping).toBe('auto');
  });

  it('applies extend + override and upper-cases tokens', () => {
    const h = resolveHeuristics(
      mergeConfig({ heuristics: { secretTokensExtra: ['jwt'] } })
    );
    expect(h.isSecretKey('SESSION_JWT')).toBe(true);
    expect(h.isSecretKey('API_TOKEN')).toBe(true); // defaults still present
  });

  it('compiles custom placeholder atoms', () => {
    const h = resolveHeuristics(
      mergeConfig({ heuristics: { placeholders: ['set[_-]?me'] } })
    );
    expect(h.isPlaceholderValue('set-me')).toBe(true);
    expect(h.isPlaceholderValue('todo')).toBe(false); // default atoms replaced
  });
});
