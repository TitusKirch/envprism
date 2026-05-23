import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, join } from 'pathe';
import { parseEnv } from '@/core/parse.ts';
import type { EnvFile } from '@/core/types.ts';

const SKIP_SUFFIXES = ['.swp', '~', '.bak'];

export interface DiscoverOptions {
  /** Filename suffixes to skip (default: editor/backup suffixes). */
  skipSuffixes?: readonly string[];
  /** Sort `.env.example` first in the result (default: true). */
  exampleFirst?: boolean;
}

/**
 * Discover `.env*` files in the given path(s). Each path may be a directory
 * (glob-like discovery happens at its top level) or an explicit file. Editor
 * and backup files are skipped.
 *
 * Files are returned sorted: `.env.example` first if present (unless
 * `exampleFirst` is false), then the rest alphabetically. Base-resolution
 * lives in `base.ts` and depends on this order.
 */
export async function discoverEnvFiles(
  paths: string[],
  options: DiscoverOptions = {}
): Promise<EnvFile[]> {
  const skipSuffixes = options.skipSuffixes ?? SKIP_SUFFIXES;
  const exampleFirst = options.exampleFirst ?? true;
  const filePaths = new Set<string>();

  for (const p of paths) {
    const info = await stat(p);
    if (info.isDirectory()) {
      const entries = await readdir(p);
      for (const name of entries) {
        if (!looksLikeEnvFile(name, skipSuffixes)) continue;
        filePaths.add(join(p, name));
      }
    } else {
      filePaths.add(p);
    }
  }

  const sorted = [...filePaths].sort((a, b) =>
    envPathOrder(a, b, exampleFirst)
  );
  const files: EnvFile[] = [];
  for (const filePath of sorted) {
    const source = await readFile(filePath, 'utf8');
    files.push(parseEnv(source, filePath));
  }
  return files;
}

function looksLikeEnvFile(
  name: string,
  skipSuffixes: readonly string[]
): boolean {
  if (!name.startsWith('.env')) return false;
  if (skipSuffixes.some((s) => name.endsWith(s))) return false;
  return true;
}

function envPathOrder(a: string, b: string, exampleFirst: boolean): number {
  const an = basename(a);
  const bn = basename(b);
  if (exampleFirst) {
    if (an === '.env.example') return -1;
    if (bn === '.env.example') return 1;
  }
  return an.localeCompare(bn);
}
