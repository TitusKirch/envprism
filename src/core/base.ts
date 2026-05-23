import { basename } from 'pathe';
import type { EnvFile } from '@/core/types.ts';

/**
 * Resolve which {@link EnvFile} acts as the base (reference) for diff. Order:
 *
 * 1. `override` path argument, matched by full path or basename.
 * 2. `.env.example` if present.
 * 3. The first file (already sorted by {@link discoverEnvFiles}).
 *
 * Returns `null` if `files` is empty.
 */
export function resolveBase(
  files: EnvFile[],
  override?: string
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

  const example = files.find((f) => basename(f.path) === '.env.example');
  if (example) return example;

  return files[0] ?? null;
}
