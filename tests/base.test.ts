import { describe, expect, it } from 'vitest';
import { resolveBase } from '@/core/base.ts';
import { parseEnv } from '@/core/parse.ts';

const makeFile = (path: string) => parseEnv('A=1\n', path);

describe('resolveBase', () => {
  it('prefers .env.example when present', () => {
    const files = [
      makeFile('/x/.env'),
      makeFile('/x/.env.example'),
      makeFile('/x/.env.staging')
    ];
    expect(resolveBase(files)?.path).toBe('/x/.env.example');
  });

  it('falls back to the first file when no .env.example', () => {
    const files = [makeFile('/x/.env'), makeFile('/x/.env.staging')];
    expect(resolveBase(files)?.path).toBe('/x/.env');
  });

  it('honours an explicit override by basename', () => {
    const files = [
      makeFile('/x/.env'),
      makeFile('/x/.env.example'),
      makeFile('/x/.env.staging')
    ];
    expect(resolveBase(files, '.env.staging')?.path).toBe('/x/.env.staging');
  });

  it('honours an explicit override by full path', () => {
    const files = [makeFile('/x/.env'), makeFile('/x/.env.staging')];
    expect(resolveBase(files, '/x/.env.staging')?.path).toBe('/x/.env.staging');
  });

  it('throws when override does not match', () => {
    const files = [makeFile('/x/.env')];
    expect(() => resolveBase(files, '.env.nope')).toThrow(/did not match/);
  });

  it('returns null on empty input', () => {
    expect(resolveBase([])).toBeNull();
  });
});
