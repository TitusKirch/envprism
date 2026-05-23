import { basename } from 'pathe';
import type { EnvFile } from '@/core/types.ts';

export interface BaseOptions {
  /** Filename treated as the default base when present (default `.env.example`). */
  name?: string;
  /** Ordered basenames tried before falling back to the first file. */
  priority?: readonly string[];
}

/**
 * Resolve which {@link EnvFile} acts as the base (reference) for diff. Order:
 *
 * 1. `override` path argument, matched by full path or basename.
 * 2. `options.name` (default `.env.example`) if present.
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

  const name = options.name ?? '.env.example';
  const example = files.find((f) => basename(f.path) === name);
  if (example) return example;

  for (const candidate of options.priority ?? []) {
    const match = files.find((f) => basename(f.path) === candidate);
    if (match) return match;
  }

  return files[0] ?? null;
}
