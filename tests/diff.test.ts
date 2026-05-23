import { describe, expect, it } from 'vitest';
import { computeDiff, formatDiffText } from '@/core/diff.ts';
import { buildMatrix } from '@/core/matrix.ts';
import { parseEnv } from '@/core/parse.ts';

const base = parseEnv(
  ['APP_NAME=envprism', 'PORT=3000', 'DATABASE_URL=postgres://x'].join('\n') +
    '\n',
  '.env.example'
);

const dev = parseEnv(
  ['APP_NAME=envprism', 'PORT=3001', 'EXTRA=on'].join('\n') + '\n',
  '.env'
);

const synced = parseEnv(
  ['APP_NAME=envprism', 'PORT=3000', 'DATABASE_URL=postgres://x'].join('\n') +
    '\n',
  '.env.staging'
);

describe('computeDiff', () => {
  it('marks inSync=false when any file drifts', () => {
    const m = buildMatrix([base, dev], base);
    const report = computeDiff(m);
    expect(report.inSync).toBe(false);
    const devReport = report.files.find((f) => f.path === '.env');
    expect(devReport?.drift).toBeGreaterThan(0);
    expect(devReport?.keys.PORT).toBe('differs');
    expect(devReport?.keys.DATABASE_URL).toBe('missing');
    expect(devReport?.keys.EXTRA).toBe('extra');
  });

  it('marks inSync=true when all non-base files match', () => {
    const m = buildMatrix([base, synced], base);
    const report = computeDiff(m);
    expect(report.inSync).toBe(true);
    expect(report.files[0]?.drift).toBe(0);
  });

  it('counts extra as drift (since user wants "what must be removed")', () => {
    const m = buildMatrix([base, dev], base);
    const report = computeDiff(m);
    expect(report.inSync).toBe(false);
  });
});

describe('formatDiffText', () => {
  it('lists only drifting keys with their states', () => {
    const m = buildMatrix([base, dev], base);
    const text = formatDiffText(computeDiff(m));
    expect(text).toContain('Base: .env.example');
    expect(text).toContain('PORT');
    expect(text).toContain('≠ differs');
    expect(text).toContain('DATABASE_URL');
    expect(text).toContain('✗ missing');
    expect(text).toContain('EXTRA');
    expect(text).toContain('★ extra');
    // APP_NAME is in sync — it should not appear in the drift table.
    expect(text).not.toMatch(/^APP_NAME/m);
  });

  it('reports a clean state', () => {
    const m = buildMatrix([base, synced], base);
    const text = formatDiffText(computeDiff(m));
    expect(text).toContain('All env files are in sync');
  });
});
