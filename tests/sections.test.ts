import { describe, expect, it } from 'vitest';
import { parseEnv } from '../src/core/parse.ts';
import { computeSections } from '../src/core/sections.ts';

describe('computeSections', () => {
  it('picks up inline === banners', () => {
    const file = parseEnv(
      ['# === Database ===', 'DB_HOST=localhost', 'DB_PORT=5432'].join('\n') +
        '\n'
    );
    const s = computeSections(file);
    expect(s.get('DB_HOST')).toBe('Database');
    expect(s.get('DB_PORT')).toBe('Database');
  });

  it('picks up triple-line === block banners', () => {
    const file = parseEnv(
      ['# =========', '# Auth', '# =========', 'TOKEN=abc', 'SECRET=xyz'].join(
        '\n'
      ) + '\n'
    );
    const s = computeSections(file);
    expect(s.get('TOKEN')).toBe('Auth');
    expect(s.get('SECRET')).toBe('Auth');
  });

  it('handles --- and ### separators', () => {
    const file = parseEnv(
      [
        '# --- App ---',
        'APP=one',
        '############',
        '# Database',
        '############',
        'DB=two'
      ].join('\n') + '\n'
    );
    const s = computeSections(file);
    expect(s.get('APP')).toBe('App');
    expect(s.get('DB')).toBe('Database');
  });

  it('switches sections as new headers appear', () => {
    const file = parseEnv(
      [
        '# === Database ===',
        'DB=1',
        '# === Auth ===',
        'TOKEN=2',
        '# === Flags ===',
        'F=3'
      ].join('\n') + '\n'
    );
    const s = computeSections(file);
    expect(s.get('DB')).toBe('Database');
    expect(s.get('TOKEN')).toBe('Auth');
    expect(s.get('F')).toBe('Flags');
  });

  it('returns an empty map when no banners are present', () => {
    const file = parseEnv('A=1\n# just a note\nB=2\n');
    const s = computeSections(file);
    expect(s.size).toBe(0);
  });

  it('does not treat a lone decorative line as a section', () => {
    const file = parseEnv('# ============\nA=1\n');
    const s = computeSections(file);
    expect(s.size).toBe(0);
  });
});
