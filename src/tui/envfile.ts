import { basename } from 'pathe';
import { rebuildKvLine } from '@/core/serialize.ts';
import type { EnvFile, KvEntry } from '@/core/types.ts';

export function isValidEnvFileName(name: string): boolean {
  if (!name.startsWith('.env')) return false;
  if (name.includes('/') || name.includes('\\')) return false;
  if (name.endsWith('.swp') || name.endsWith('~') || name.endsWith('.bak'))
    return false;
  return true;
}

export function createEmptyEnvFile(path: string): EnvFile {
  return {
    path,
    entries: [{ kind: 'comment', raw: `# ${basename(path)}` }],
    trailingNewline: true
  };
}

export function appendKv(file: EnvFile, key: string, value: string): KvEntry {
  const entry: KvEntry = {
    kind: 'kv',
    key,
    rawValue: '',
    value,
    quoting: 'none',
    exportPrefix: false,
    inlineComment: '',
    raw: ''
  };
  rebuildKvLine(entry);
  file.entries.push(entry);
  // Round-trip semantics: serializeEnv joins with \n and appends a trailing
  // newline if trailingNewline is set. Push alone gives us "...\nKEY=val" when
  // trailingNewline=false, or "...\nKEY=val\n" when true. Either case is
  // sane; we make sure the file ends with a newline so editors don't complain.
  file.trailingNewline = true;
  return entry;
}
