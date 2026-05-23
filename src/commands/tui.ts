import { defineCommand } from 'citty';
import consola from 'consola';
import { resolve } from 'pathe';
import { loadEnvprismConfig } from '@/config/load.ts';
import { resolveBase } from '@/core/base.ts';
import { discoverEnvFiles } from '@/core/discover.ts';
import { buildMatrix } from '@/core/matrix.ts';

interface TuiInvocation {
  paths?: string | string[];
  base?: string;
  config?: string;
}

/**
 * Resolve the matrix and boot the TUI. Shared between the explicit `tui`
 * subcommand and the default-no-subcommand path in `rootCommand`.
 */
export async function runTui(args: TuiInvocation): Promise<void> {
  const { config } = await loadEnvprismConfig({ configFile: args.config });
  const inputs = collectPaths(args.paths, config.discovery.paths);
  const files = await discoverEnvFiles(
    inputs.map((p) => resolve(p)),
    {
      skipSuffixes: config.discovery.skipSuffixes,
      exampleFirst: config.discovery.exampleFirst
    }
  );

  if (files.length === 0) {
    consola.warn('No .env* files found.');
    process.exit(1);
  }

  const base = resolveBase(files, args.base, {
    name: config.base.name,
    priority: config.base.priority
  });
  if (!base) {
    consola.error('Could not resolve a base file.');
    process.exit(1);
  }

  const matrix = buildMatrix(files, base);

  // Dynamic import keeps @opentui/core out of the bundle path used by the
  // `diff` subcommand, so users running diff on Node never hit Bun-only code.
  const { runMatrixTui } = await import('../tui/app.ts');
  await runMatrixTui(matrix, config);
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
    },
    config: {
      type: 'string',
      description:
        'Path to an envprism.config file (default: walk up from cwd).'
    }
  },
  async run({ args }) {
    await runTui({ paths: args.paths, base: args.base, config: args.config });
  }
});

function collectPaths(arg: unknown, fallback: string[]): string[] {
  if (Array.isArray(arg)) return arg.map(String);
  if (typeof arg === 'string' && arg.length > 0) return [arg];
  return fallback;
}
