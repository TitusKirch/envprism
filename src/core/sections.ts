import type { EnvEntry, EnvFile } from './types.ts';

const SEP_CHARS = new Set(['=', '-', '#', '~', '*']);
const SPACE_CHARS = new Set([' ', '\t']);

/**
 * Walk the base file in source order and decide which section each kv entry
 * belongs to. Returns a `key → section` map; keys with no inferred section
 * are absent from the map.
 *
 * A "section header" is one of:
 *   1. An inline banner: `# === Section name ===` (or `---`, `~~~`, `***`).
 *   2. A block banner — a single comment line `# Section name` whose
 *      immediately preceding or following comment line is purely decorative
 *      (e.g. `# ===========================`).
 *
 * The detected name applies to every subsequent kv entry until the next
 * detected section header.
 */
export function computeSections(base: EnvFile): Map<string, string> {
  const out = new Map<string, string>();
  let current: string | null = null;
  for (let i = 0; i < base.entries.length; i++) {
    const name = detectSectionName(base.entries, i);
    if (name !== null) current = name;
    const e = base.entries[i]!;
    if (e.kind === 'kv' && current) out.set(e.key, current);
  }
  return out;
}

function detectSectionName(entries: EnvEntry[], idx: number): string | null {
  const e = entries[idx];
  if (!e || e.kind !== 'comment') return null;
  if (isDecorativeLine(e.raw)) return null;

  const inline = parseInlineBanner(e.raw);
  if (inline !== null) return inline;

  const text = stripCommentPrefix(e.raw);
  if (!text) return null;

  if (isDecorative(entries[idx - 1]) || isDecorative(entries[idx + 1])) {
    return text;
  }
  return null;
}

function isDecorative(e: EnvEntry | undefined): boolean {
  if (!e || e.kind !== 'comment') return false;
  return isDecorativeLine(e.raw);
}

/**
 * True for comment lines whose body is nothing but separator chars and
 * whitespace (e.g. "# ======", "###", "# -=-=-=-").
 *
 * Implemented with a manual scan rather than a regex with overlapping
 * `\s*` / `[\s…]+` groups, which CodeQL flags as ReDoS-prone.
 */
function isDecorativeLine(raw: string): boolean {
  const start = skipSpaces(raw, 0);
  if (start >= raw.length || raw[start] !== '#') return false;
  let i = start + 1;
  let sawSeparator = false;
  while (i < raw.length) {
    const ch = raw[i]!;
    if (SEP_CHARS.has(ch)) sawSeparator = true;
    else if (!SPACE_CHARS.has(ch)) return false;
    i++;
  }
  return sawSeparator;
}

/**
 * Parse a single-line inline banner like `# === Name ===` (also `---`,
 * `~~~`, `***`) and return the inner name, or null if the line isn't an
 * inline banner.
 *
 * Manual scan, again to avoid the overlapping `\s*` regex backtracking
 * CodeQL warned about.
 */
function parseInlineBanner(raw: string): string | null {
  const start = skipSpaces(raw, 0);
  if (start >= raw.length || raw[start] !== '#') return null;

  // After '#', skip spaces, then read 2+ separator chars (single char repeated).
  let i = skipSpaces(raw, start + 1);
  if (i >= raw.length || !SEP_CHARS.has(raw[i]!)) return null;
  let leadCount = 0;
  while (i < raw.length && SEP_CHARS.has(raw[i]!)) {
    leadCount++;
    i++;
  }
  if (leadCount < 2) return null;

  // Walk from the end inward to find the trailing separator run.
  let j = raw.length;
  while (j > i && SPACE_CHARS.has(raw[j - 1]!)) j--;
  if (j <= i || !SEP_CHARS.has(raw[j - 1]!)) return null;
  let trailCount = 0;
  while (j > i && SEP_CHARS.has(raw[j - 1]!)) {
    trailCount++;
    j--;
  }
  if (trailCount < 2) return null;

  // Between the two separator runs lives the name (after stripping spaces).
  const inner = raw.slice(i, j).trim();
  return inner.length > 0 ? inner : null;
}

function stripCommentPrefix(raw: string): string {
  // Leading whitespace, then one or more '#', then whitespace, then content.
  let i = skipSpaces(raw, 0);
  while (i < raw.length && raw[i] === '#') i++;
  i = skipSpaces(raw, i);
  // Trim trailing whitespace and decorative chars.
  let j = raw.length;
  while (
    j > i &&
    (SPACE_CHARS.has(raw[j - 1]!) || SEP_CHARS.has(raw[j - 1]!))
  ) {
    j--;
  }
  return raw.slice(i, j);
}

function skipSpaces(raw: string, from: number): number {
  let i = from;
  while (i < raw.length && SPACE_CHARS.has(raw[i]!)) i++;
  return i;
}
