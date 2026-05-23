import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadEnvprismConfig } from '@/config/load.ts';

let dir: string;
const savedEnv = process.env.ENVPRISM_CONFIG;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'envprism-cfg-'));
  delete process.env.ENVPRISM_CONFIG;
});

afterEach(async () => {
  if (savedEnv === undefined) delete process.env.ENVPRISM_CONFIG;
  else process.env.ENVPRISM_CONFIG = savedEnv;
  await rm(dir, { recursive: true, force: true });
});

describe('loadEnvprismConfig', () => {
  it('returns merged defaults when no config file exists', async () => {
    const { config, configFile } = await loadEnvprismConfig({ cwd: dir });
    expect(configFile).toBeUndefined();
    expect(config.heuristics.grouping).toBe('auto');
  });

  it('walks up from a nested cwd to find the config', async () => {
    await writeFile(
      join(dir, 'envprism.config.json'),
      JSON.stringify({ heuristics: { grouping: 'prefix' } })
    );
    const nested = join(dir, 'a', 'b');
    await mkdir(nested, { recursive: true });
    const { config, configFile } = await loadEnvprismConfig({ cwd: nested });
    expect(config.heuristics.grouping).toBe('prefix');
    expect(configFile).toBe(join(dir, 'envprism.config.json'));
  });

  it('honors an explicit configFile path', async () => {
    const explicit = join(dir, 'custom.json');
    await writeFile(explicit, JSON.stringify({ diff: { json: true } }));
    const { config, configFile } = await loadEnvprismConfig({
      configFile: explicit
    });
    expect(config.diff.json).toBe(true);
    expect(configFile).toBe(explicit);
  });

  it('reads ENVPRISM_CONFIG when no explicit path is given', async () => {
    const explicit = join(dir, 'fromenv.json');
    await writeFile(explicit, JSON.stringify({ tui: { undoLimit: 7 } }));
    process.env.ENVPRISM_CONFIG = explicit;
    const { config } = await loadEnvprismConfig({});
    expect(config.tui.undoLimit).toBe(7);
  });
});
