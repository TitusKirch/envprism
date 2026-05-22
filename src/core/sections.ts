import type { EnvEntry, EnvFile } from './types.ts';

const DECORATIVE_RE = /^\s*#[\s=\-#~*]+\s*$/;
const INLINE_SECTION_RE = /^\s*#\s*[=\-~*]{2,}\s*(.+?)\s*[=\-~*]{2,}\s*$/;
const SECTION_NAME_CLEANUP = /[\s=\-#~*]+$/;

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
  if (DECORATIVE_RE.test(e.raw)) return null;

  const inline = e.raw.match(INLINE_SECTION_RE);
  if (inline?.[1]) return inline[1].trim();

  const text = stripCommentPrefix(e.raw);
  if (!text) return null;

  if (isDecorative(entries[idx - 1]) || isDecorative(entries[idx + 1])) {
    return text;
  }
  return null;
}

function isDecorative(e: EnvEntry | undefined): boolean {
  if (!e || e.kind !== 'comment') return false;
  return DECORATIVE_RE.test(e.raw);
}

function stripCommentPrefix(raw: string): string {
  // Strip leading whitespace + '#' + spaces, and any trailing decorative
  // chars/whitespace. Whatever's left is the human-readable section name.
  return raw
    .replace(/^\s*#+\s*/, '')
    .replace(SECTION_NAME_CLEANUP, '')
    .trim();
}
