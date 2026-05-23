import type { EnvEntry, EnvFile, KvEntry, Quoting } from './types.ts';

const KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Parse a `.env` file into a structured, round-trippable representation.
 * Each entry stores its original raw line so the serializer can emit it
 * byte-for-byte when nothing changes.
 */
export function parseEnv(source: string, path = ''): EnvFile {
  const trailingNewline = source.endsWith('\n');
  const body = trailingNewline ? source.slice(0, -1) : source;
  const lines = body.length === 0 ? [] : body.split('\n');

  const entries: EnvEntry[] = [];
  for (const raw of lines) {
    entries.push(parseLine(raw));
  }

  return { path, entries, trailingNewline };
}

function parseLine(raw: string): EnvEntry {
  if (raw.trim().length === 0) {
    return { kind: 'blank', raw };
  }

  // Comment line: leading whitespace then `#`.
  const trimmedStart = raw.replace(/^\s+/, '');
  if (trimmedStart.startsWith('#')) {
    return { kind: 'comment', raw };
  }

  const kv = tryParseKv(raw);
  if (kv) return kv;

  // Unrecognised line — treat as a comment-like passthrough so round-trip
  // still works. Diff/matrix code ignores non-kv entries.
  return { kind: 'comment', raw };
}

function tryParseKv(raw: string): KvEntry | null {
  let rest = raw;
  // Optional leading whitespace is preserved in `raw`; the structured key
  // identifier itself is captured separately so we can rebuild the line.
  const leadingWs = rest.match(/^[ \t]*/)?.[0] ?? '';
  rest = rest.slice(leadingWs.length);

  let exportPrefix = false;
  if (rest.startsWith('export ')) {
    exportPrefix = true;
    rest = rest.slice('export '.length).replace(/^[ \t]*/, '');
  }

  const eqIdx = rest.indexOf('=');
  if (eqIdx < 0) return null;

  const key = rest.slice(0, eqIdx).trimEnd();
  if (!KEY_RE.test(key)) return null;

  const after = rest.slice(eqIdx + 1);
  const valueStart = after.replace(/^[ \t]*/, '');
  const valueLeadingWs = after.slice(0, after.length - valueStart.length);

  const parsed = parseValue(valueStart);
  if (!parsed) return null;

  // Preserve trailing whitespace before any inline comment so round-trip
  // matches the source exactly (we don't need to model it separately — `raw`
  // is what gets emitted).
  void leadingWs;
  void valueLeadingWs;

  return {
    kind: 'kv',
    key,
    rawValue: parsed.rawValue,
    value: parsed.value,
    quoting: parsed.quoting,
    exportPrefix,
    inlineComment: parsed.inlineComment,
    raw
  };
}

interface ParsedValue {
  rawValue: string;
  value: string;
  quoting: Quoting;
  inlineComment: string;
}

function parseValue(input: string): ParsedValue | null {
  if (input.length === 0) {
    return { rawValue: '', value: '', quoting: 'none', inlineComment: '' };
  }

  const first = input[0];
  if (first === '"' || first === "'") {
    const close = findClosingQuote(input, first);
    if (close < 0) return null;
    const rawValue = input.slice(1, close);
    const value = first === '"' ? decodeDoubleQuoted(rawValue) : rawValue;
    const tail = input.slice(close + 1);
    const inlineComment = extractInlineComment(tail);
    return {
      rawValue,
      value,
      quoting: first === '"' ? 'double' : 'single',
      inlineComment
    };
  }

  // Unquoted: value runs until ` #` or end-of-line, trailing whitespace
  // belongs to the inline-comment slot (so round-trip is preserved via `raw`).
  const hashIdx = findUnquotedCommentStart(input);
  const valuePart = (hashIdx < 0 ? input : input.slice(0, hashIdx)).trimEnd();
  const inlineComment = hashIdx < 0 ? '' : input.slice(valuePart.length);
  return {
    rawValue: valuePart,
    value: valuePart,
    quoting: 'none',
    inlineComment
  };
}

function findClosingQuote(input: string, quote: '"' | "'"): number {
  for (let i = 1; i < input.length; i++) {
    const ch = input[i];
    if (quote === '"' && ch === '\\') {
      i++;
      continue;
    }
    if (ch === quote) return i;
  }
  return -1;
}

function findUnquotedCommentStart(input: string): number {
  for (let i = 0; i < input.length; i++) {
    if (input[i] !== '#') continue;
    if (i === 0) return i;
    const prev = input[i - 1];
    if (prev === ' ' || prev === '\t') return i;
  }
  return -1;
}

function extractInlineComment(tail: string): string {
  // Tail is everything after the closing quote. It is either empty, pure
  // whitespace, or whitespace + `#...`. Preserve it verbatim.
  return tail;
}

function decodeDoubleQuoted(raw: string): string {
  return raw.replace(/\\(.)/g, (_, ch: string) => {
    switch (ch) {
      case 'n':
        return '\n';
      case 'r':
        return '\r';
      case 't':
        return '\t';
      case '\\':
        return '\\';
      case '"':
        return '"';
      default:
        return `\\${ch}`;
    }
  });
}
