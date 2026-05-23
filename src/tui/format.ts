import { maskValue } from '@/core/mask.ts';
import type { EnvFile, KvEntry } from '@/core/types.ts';

export const PLACEHOLDER_RE =
  /^(todo|fixme|changeme|placeholder|tbd|x{3,}|your[_-]?(secret|key|token|password|api[_-]?key)(_here)?|replace[_-]?me)$/i;

export function isPlaceholderValue(value: string): boolean {
  const v = value.trim();
  if (v.length === 0) return false;
  return PLACEHOLDER_RE.test(v);
}

export function formatValue(
  value: string | undefined,
  secret: boolean
): string {
  if (value === undefined) return '';
  if (secret) return maskValue(value);
  return value;
}

export function matchesFilter(key: string, filter: string): boolean {
  if (!filter) return true;
  return key.toLowerCase().includes(filter.toLowerCase());
}

export function truncate(text: string, width: number): string {
  if (width <= 0) return '';
  if (text.length <= width) return text;
  if (width <= 1) return '…';
  return `${text.slice(0, width - 1)}…`;
}

export function findKvEntry(file: EnvFile, key: string): KvEntry | undefined {
  for (const e of file.entries) {
    if (e.kind === 'kv' && e.key === key) return e;
  }
  return undefined;
}
