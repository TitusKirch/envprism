import { describe, expect, it } from 'vitest';
import { buildMatrix } from '@/core/matrix.ts';
import { parseEnv } from '@/core/parse.ts';

describe('buildMatrix', () => {
  const base = parseEnv(
    [
      '# header',
      'APP_NAME=envprism',
      'PORT=3000',
      'DATABASE_URL=postgres://x',
      'SECRET_KEY='
    ].join('\n') + '\n',
    '.env.example'
  );

  const dev = parseEnv(
    [
      'APP_NAME=envprism',
      'PORT=3001',
      'DATABASE_URL=postgres://x',
      'SECRET_KEY=dev-key',
      'EXTRA_DEV=on'
    ].join('\n') + '\n',
    '.env'
  );

  const staging = parseEnv(
    ['APP_NAME=envprism', 'PORT=3000'].join('\n') + '\n',
    '.env.staging'
  );

  const files = [base, dev, staging];

  it('lists base keys first, in source order, with extras appended alphabetically', () => {
    const m = buildMatrix(files, base);
    expect(m.keys).toEqual([
      'APP_NAME',
      'PORT',
      'DATABASE_URL',
      'SECRET_KEY',
      'EXTRA_DEV'
    ]);
  });

  it('reports same / differs / missing / extra correctly', () => {
    const m = buildMatrix(files, base);

    // base column
    expect(m.cell('APP_NAME', base).state).toBe('base');
    expect(m.cell('APP_NAME', base).value).toBe('envprism');

    // dev column
    expect(m.cell('APP_NAME', dev).state).toBe('same');
    expect(m.cell('PORT', dev).state).toBe('differs');
    expect(m.cell('SECRET_KEY', dev).state).toBe('differs');
    expect(m.cell('EXTRA_DEV', dev).state).toBe('extra');

    // staging column — missing where base has the key but staging does not
    expect(m.cell('DATABASE_URL', staging).state).toBe('missing');
    expect(m.cell('DATABASE_URL', staging).value).toBeUndefined();
    expect(m.cell('EXTRA_DEV', staging).state).toBe('missing');
  });
});
