import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, join } from 'pathe';
import { parseEnv } from './parse.ts';
import type { EnvFile } from './types.ts';

const SKIP_SUFFIXES = ['.swp', '~', '.bak'];

/**
 * Discover `.env*` files in the given path(s). Each path may be a directory
 * (glob-like discovery happens at its top level) or an explicit file. Editor
 * and backup files are skipped.
 *
 * Files are returned sorted: `.env.example` first if present, then the rest
 * alphabetically. Base-resolution lives in `base.ts` and depends on this order.
 */
export async function discoverEnvFiles(paths: string[]): Promise<EnvFile[]> {
  const filePaths = new Set<string>();

  for (const p of paths) {
    const info = await stat(p);
    if (info.isDirectory()) {
      const entries = await readdir(p);
      for (const name of entries) {
        if (!looksLikeEnvFile(name)) continue;
        filePaths.add(join(p, name));
      }
    } else {
      filePaths.add(p);
    }
  }

  const sorted = [...filePaths].sort(envPathOrder);
  const files: EnvFile[] = [];
  for (const filePath of sorted) {
    const source = await readFile(filePath, 'utf8');
    files.push(parseEnv(source, filePath));
  }
  return files;
}

function looksLikeEnvFile(name: string): boolean {
  if (!name.startsWith('.env')) return false;
  if (SKIP_SUFFIXES.some((s) => name.endsWith(s))) return false;
  return true;
}

function envPathOrder(a: string, b: string): number {
  const an = basename(a);
  const bn = basename(b);
  if (an === '.env.example') return -1;
  if (bn === '.env.example') return 1;
  return an.localeCompare(bn);
}
