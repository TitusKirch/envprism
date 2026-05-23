import { basename } from 'pathe';
import type { EnvFile } from '@/core/types.ts';

export interface BaseOptions {
  /** Filename treated as the default base when present (default `.env.example`). */
  exampleName?: string;
  /** Ordered basenames tried before falling back to the first file. */
  priority?: readonly string[];
}

/**
 * Resolve which {@link EnvFile} acts as the base (reference) for diff. Order:
 *
 * 1. `override` path argument, matched by full path or basename.
 * 2. `options.exampleName` (default `.env.example`) if present.
 * 3. The first file matching `options.priority`, in priority order.
 * 4. The first file (already sorted by {@link discoverEnvFiles}).
 *
 * Returns `null` if `files` is empty.
 */
export function resolveBase(
  files: EnvFile[],
  override?: string,
  options: BaseOptions = {}
): EnvFile | null {
  if (files.length === 0) return null;

  if (override) {
    const match = files.find(
      (f) => f.path === override || basename(f.path) === override
    );
    if (!match) {
      throw new Error(
        `--base ${override} did not match any discovered env file`
      );
    }
    return match;
  }

  const exampleName = options.exampleName ?? '.env.example';
  const example = files.find((f) => basename(f.path) === exampleName);
  if (example) return example;

  for (const name of options.priority ?? []) {
    const match = files.find((f) => basename(f.path) === name);
    if (match) return match;
  }

  return files[0] ?? null;
}
