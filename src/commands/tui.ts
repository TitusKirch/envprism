import { defineCommand } from 'citty';
import consola from 'consola';
import { resolve } from 'pathe';
import { resolveBase } from '../core/base.ts';
import { discoverEnvFiles } from '../core/discover.ts';
import { buildMatrix } from '../core/matrix.ts';

interface TuiInvocation {
  paths?: string | string[];
  base?: string;
}

/**
 * Resolve the matrix and boot the TUI. Shared between the explicit `tui`
 * subcommand and the default-no-subcommand path in `rootCommand`.
 */
export async function runTui(args: TuiInvocation): Promise<void> {
  const inputs = collectPaths(args.paths);
  const files = await discoverEnvFiles(inputs.map((p) => resolve(p)));

  if (files.length === 0) {
    consola.warn('No .env* files found.');
    process.exit(1);
  }

  const base = resolveBase(files, args.base);
  if (!base) {
    consola.error('Could not resolve a base file.');
    process.exit(1);
  }

  const matrix = buildMatrix(files, base);

  // Dynamic import keeps @opentui/core out of the bundle path used by the
  // `diff` subcommand, so users running diff on Node never hit Bun-only code.
  const { runMatrixTui } = await import('../tui/app.ts');
  await runMatrixTui(matrix);
}

export const tuiCommand = defineCommand({
  meta: {
    name: 'tui',
    description: 'Open the interactive matrix view (default command).'
  },
  args: {
    paths: {
      type: 'positional',
      required: false,
      description: 'Directory or files to scan (defaults to cwd).'
    },
    base: {
      type: 'string',
      description: 'Base file to diff against (defaults to .env.example).'
    }
  },
  async run({ args }) {
    await runTui({ paths: args.paths, base: args.base });
  }
});

function collectPaths(arg: unknown): string[] {
  if (Array.isArray(arg)) return arg.map(String);
  if (typeof arg === 'string' && arg.length > 0) return [arg];
  return ['.'];
}
