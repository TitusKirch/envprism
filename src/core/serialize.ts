import type { EnvFile, KvEntry, Quoting } from '@/core/types.ts';

/**
 * Serialize an {@link EnvFile} back to a string. Unchanged entries are emitted
 * from their captured `raw` line so round-trip is byte-exact; modified entries
 * must have their `raw` field re-built via {@link rebuildKvLine} first.
 */
export function serializeEnv(file: EnvFile): string {
  const body = file.entries.map((e) => e.raw).join('\n');
  return file.trailingNewline ? `${body}\n` : body;
}

/**
 * Rebuild the `raw` line of a kv entry from its structured fields. Call this
 * after mutating `key`, `value`, `quoting`, or `exportPrefix` so the next
 * serialize emits the new line.
 */
export function rebuildKvLine(entry: KvEntry): void {
  const prefix = entry.exportPrefix ? 'export ' : '';
  const encoded = encodeValue(entry.value, entry.quoting);
  // Update rawValue to match the (possibly new) encoded inner form.
  entry.rawValue = encoded.inner;
  entry.raw = `${prefix}${entry.key}=${encoded.full}${entry.inlineComment}`;
}

interface EncodedValue {
  /** Inner string without surrounding quotes (for `rawValue`). */
  inner: string;
  /** Fully formed value including surrounding quotes if any. */
  full: string;
}

function encodeValue(value: string, quoting: Quoting): EncodedValue {
  // Auto-promote to double quotes when an unquoted value would be ambiguous
  // (contains whitespace, `#`, or characters that require escaping). Single
  // quotes are preserved as authored but can't represent embedded `'`.
  const effective: Quoting = needsQuoting(value, quoting) ? 'double' : quoting;

  switch (effective) {
    case 'none':
      return { inner: value, full: value };
    case 'single': {
      if (value.includes("'")) {
        // Fall back to double-quoting if a single quote sneaks in.
        const escaped = escapeDoubleQuoted(value);
        return { inner: escaped, full: `"${escaped}"` };
      }
      return { inner: value, full: `'${value}'` };
    }
    case 'double': {
      const escaped = escapeDoubleQuoted(value);
      return { inner: escaped, full: `"${escaped}"` };
    }
  }
}

function needsQuoting(value: string, current: Quoting): boolean {
  if (current !== 'none') return false;
  return /[\s#"'\\]/.test(value);
}

function escapeDoubleQuoted(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}
