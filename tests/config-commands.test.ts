import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pathCommand } from '@/commands/config/path.ts';
import { showCommand } from '@/commands/config/show.ts';

let dir: string;
let out: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'envprism-cmd-'));
  out = '';
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
    out += String(chunk);
    return true;
  });
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(dir, { recursive: true, force: true });
});

async function run(cmd: typeof showCommand, args: Record<string, unknown>) {
  await cmd.run?.({ args, cmd, rawArgs: [] } as never);
}

describe('config show', () => {
  it('prints the merged config as JSON', async () => {
    const cfg = join(dir, 'envprism.config.json');
    await writeFile(
      cfg,
      JSON.stringify({ heuristics: { grouping: 'prefix' } })
    );
    await run(showCommand, { config: cfg });
    const parsed = JSON.parse(out);
    expect(parsed.heuristics.grouping).toBe('prefix');
    expect(parsed.tui.undoLimit).toBe(50); // gap filled from defaults
  });
});

describe('config path', () => {
  it('prints the resolved path for an explicit config', async () => {
    const cfg = join(dir, 'envprism.config.json');
    await writeFile(cfg, '{}');
    await run(pathCommand, { config: cfg });
    expect(out.trim()).toBe(cfg);
  });

  it('prints nothing to stdout when no config is found', async () => {
    await run(pathCommand, { config: undefined });
    // The "using defaults" note goes to stderr via consola, not stdout.
    expect(out).toBe('');
  });
});
