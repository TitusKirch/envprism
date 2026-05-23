import { computeSections } from '@/core/sections.ts';
import type { EnvFile, KvEntry } from '@/core/types.ts';

export type CellState = 'same' | 'differs' | 'missing' | 'extra' | 'base';

export interface Cell {
  state: CellState;
  /** Decoded value if present in this file, else `undefined`. */
  value: string | undefined;
}

export interface Matrix {
  /** Union of all keys across all files, base keys first (in source order). */
  keys: string[];
  /** Files in display order; base is included. */
  files: EnvFile[];
  base: EnvFile;
  cell(key: string, file: EnvFile): Cell;
  /**
   * Section name inferred from the base file's comment banners, or
   * `undefined` for keys outside any section (and for keys only present in
   * non-base files).
   */
  sectionOf(key: string): string | undefined;
}

export function buildMatrix(files: EnvFile[], base: EnvFile): Matrix {
  const keys = collectKeys(files, base);
  const lookups = new Map<EnvFile, Map<string, KvEntry>>();
  for (const file of files) {
    lookups.set(file, indexKv(file));
  }
  const baseIndex = lookups.get(base);
  if (!baseIndex) {
    throw new Error('base file is not in the files list');
  }
  const sections = computeSections(base);

  return {
    keys,
    files,
    base,
    sectionOf(key) {
      return sections.get(key);
    },
    cell(key, file) {
      const ownIndex = lookups.get(file);
      if (!ownIndex) {
        throw new Error(`file not in matrix: ${file.path}`);
      }
      const own = ownIndex.get(key);
      const baseEntry = baseIndex.get(key);

      if (file === base) {
        return {
          state: own ? 'base' : 'missing',
          value: own?.value
        };
      }

      if (!own && !baseEntry) {
        return { state: 'missing', value: undefined };
      }
      if (!own) {
        return { state: 'missing', value: undefined };
      }
      if (!baseEntry) {
        return { state: 'extra', value: own.value };
      }
      return {
        state: own.value === baseEntry.value ? 'same' : 'differs',
        value: own.value
      };
    }
  };
}

function collectKeys(files: EnvFile[], base: EnvFile): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  // Base file keys first in their authored order so the matrix view tracks
  // the .env.example layout most users curate.
  for (const e of base.entries) {
    if (e.kind === 'kv' && !seen.has(e.key)) {
      seen.add(e.key);
      out.push(e.key);
    }
  }
  // Then any extras only present in non-base files, in alpha order so the
  // result is deterministic.
  const extras = new Set<string>();
  for (const file of files) {
    if (file === base) continue;
    for (const e of file.entries) {
      if (e.kind === 'kv' && !seen.has(e.key)) {
        extras.add(e.key);
      }
    }
  }
  for (const k of [...extras].sort()) out.push(k);
  return out;
}

function indexKv(file: EnvFile): Map<string, KvEntry> {
  const m = new Map<string, KvEntry>();
  for (const e of file.entries) {
    if (e.kind === 'kv') m.set(e.key, e);
  }
  return m;
}
