import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'pathe';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { discoverEnvFiles } from '@/core/discover.ts';
import { rm } from 'node:fs/promises';

describe('discoverEnvFiles', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'envprism-discover-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('finds .env* files, skips backups, sorts with .env.example first', async () => {
    await Promise.all([
      writeFile(join(dir, '.env'), 'A=1\n'),
      writeFile(join(dir, '.env.example'), 'A=\n'),
      writeFile(join(dir, '.env.staging'), 'A=2\n'),
      writeFile(join(dir, '.env.local.swp'), 'ignored\n'),
      writeFile(join(dir, 'README.md'), 'irrelevant\n')
    ]);

    const files = await discoverEnvFiles([dir]);
    expect(files.map((f) => f.path.split('/').pop())).toEqual([
      '.env.example',
      '.env',
      '.env.staging'
    ]);
  });

  it('accepts explicit file paths', async () => {
    const a = join(dir, '.env');
    const b = join(dir, '.env.prod');
    await writeFile(a, 'X=1\n');
    await writeFile(b, 'X=2\n');

    const files = await discoverEnvFiles([a, b]);
    expect(files).toHaveLength(2);
  });
});
