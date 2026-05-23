import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { diffCommand } from '@/commands/diff.ts';

class ExitSignal extends Error {
  constructor(public code: number) {
    super('exit');
  }
}

let dir: string;
let out: string;
let lastExit: number | undefined;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'envprism-diff-'));
  out = '';
  lastExit = undefined;
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
    out += String(chunk);
    return true;
  });
  vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    lastExit = code;
    throw new ExitSignal(code ?? 0);
  }) as never);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(dir, { recursive: true, force: true });
});

async function run(args: Record<string, unknown>): Promise<void> {
  try {
    await diffCommand.run?.({ args, cmd: diffCommand, rawArgs: [] } as never);
  } catch (err) {
    if (!(err instanceof ExitSignal)) throw err;
  }
}

async function withDrift() {
  await writeFile(join(dir, '.env.example'), 'A=1\nB=2\n');
  await writeFile(join(dir, '.env'), 'A=9\n'); // A differs, B missing
}

describe('diff command', () => {
  it('prints a text table by default', async () => {
    await withDrift();
    await run({ paths: dir });
    expect(out).toMatch(/Base:/);
    expect(out).toMatch(/\bA\b/);
  });

  it('emits JSON with --json', async () => {
    await withDrift();
    await run({ paths: dir, json: true });
    const report = JSON.parse(out);
    expect(report.base).toMatch(/\.env\.example$/);
    expect(Array.isArray(report.files)).toBe(true);
  });

  it('--check exits non-zero when files drift', async () => {
    await withDrift();
    await run({ paths: dir, check: true });
    expect(lastExit).toBe(1);
  });

  it('--check honors a configured checkExitCode', async () => {
    await withDrift();
    await writeFile(
      join(dir, 'envprism.config.json'),
      JSON.stringify({ diff: { checkExitCode: 7 } })
    );
    await run({
      paths: dir,
      check: true,
      config: join(dir, 'envprism.config.json')
    });
    expect(lastExit).toBe(7);
  });

  it('exits 1 when no env files are found', async () => {
    await run({ paths: dir });
    expect(lastExit).toBe(1);
  });
});
