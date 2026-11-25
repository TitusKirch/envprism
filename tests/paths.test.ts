import { describe, expect, it } from 'vitest';
import { collectPaths } from '@/commands/paths.ts';

describe('collectPaths', () => {
  it('prefers every positional in `_` over the named arg', () => {
    expect(collectPaths({ paths: 'a', _: ['a', 'b'] }, ['.'])).toEqual([
      'a',
      'b'
    ]);
  });

  it('falls back to the named arg, string or array', () => {
    expect(collectPaths({ paths: 'a', _: [] }, ['.'])).toEqual(['a']);
    expect(collectPaths({ paths: ['a', 'b'] }, ['.'])).toEqual(['a', 'b']);
  });

  it('falls back to the configured paths when nothing was passed', () => {
    expect(collectPaths({ _: [] }, ['src', 'apps'])).toEqual(['src', 'apps']);
    expect(collectPaths({ paths: '' }, ['.'])).toEqual(['.']);
  });
});
