import { defineCommand } from 'citty';
import consola from 'consola';
import { resolve } from 'pathe';
import { loadEnvprismConfig } from '@/config/load.ts';
import { resolveBase } from '@/core/base.ts';
import { computeDiff, formatDiffText } from '@/core/diff.ts';
import { discoverEnvFiles } from '@/core/discover.ts';
import { buildMatrix } from '@/core/matrix.ts';

export const diffCommand = defineCommand({
  meta: {
    name: 'diff',
    description: 'Print the drift between .env* files compared to a base.'
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
    json: {
      type: 'boolean',
      description: 'Emit JSON instead of a text table.'
    },
    check: {
      type: 'boolean',
      description:
        'Suppress output and exit 1 when any file drifts from the base.'
    },
    config: {
      type: 'string',
      description:
        'Path to an envprism.config file (default: walk up from cwd).'
    }
  },
  async run({ args }) {
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
      if (!args.check) consola.warn('No .env* files found.');
      process.exit(args.check ? 0 : 1);
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
    const report = computeDiff(matrix);

    if (args.check) {
      process.exit(report.inSync ? 0 : config.diff.checkExitCode);
    }

    const json = args.json ?? config.diff.json;
    if (json) {
      process.stdout.write(JSON.stringify(report, null, 2) + '\n');
      return;
    }

    process.stdout.write(formatDiffText(report));
  }
});

function collectPaths(arg: unknown, fallback: string[]): string[] {
  if (Array.isArray(arg)) return arg.map(String);
  if (typeof arg === 'string' && arg.length > 0) return [arg];
  return fallback;
}
