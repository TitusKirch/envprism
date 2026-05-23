import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initCommand } from '@/commands/init.ts';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'envprism-init-'));
  process.exitCode = undefined;
});

afterEach(async () => {
  process.exitCode = undefined;
  await rm(dir, { recursive: true, force: true });
});

async function run(args: Record<string, unknown>): Promise<void> {
  // citty command run signature: { args, cmd, rawArgs }
  await initCommand.run?.({ args, cmd: initCommand, rawArgs: [] } as never);
}

describe('init command', () => {
  it('writes envprism.config.ts with the documented template', async () => {
    await run({ out: dir, force: false });
    const written = await readFile(join(dir, 'envprism.config.ts'), 'utf8');
    expect(written).toContain('export default');
    expect(written).toContain("grouping: 'auto'");
    expect(written).toContain("import('envprism/config')");
    expect(process.exitCode).toBeUndefined();
  });

  it('refuses to overwrite an existing file without --force', async () => {
    await run({ out: dir, force: false });
    await run({ out: dir, force: false });
    expect(process.exitCode).toBe(1);
  });

  it('overwrites with --force', async () => {
    await run({ out: dir, force: false });
    process.exitCode = undefined;
    await run({ out: dir, force: true });
    expect(process.exitCode).toBeUndefined();
  });
});
