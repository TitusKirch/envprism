import { describe, expect, it } from 'vitest';
import { resolveBase } from '@/core/base.ts';
import { computeDiff, formatDiffText } from '@/core/diff.ts';
import { isSecretKey } from '@/core/mask.ts';
import { buildMatrix } from '@/core/matrix.ts';
import { parseEnv } from '@/core/parse.ts';
import { computeSections } from '@/core/sections.ts';
import { rebuildKvLine, serializeEnv } from '@/core/serialize.ts';
import type { KvEntry } from '@/core/types.ts';

const f = (path: string, src: string) =>
  parseEnv(src.endsWith('\n') ? src : src + '\n', path);

describe('resolveBase — priority fallback', () => {
  it('uses a priority basename when no example file is present', () => {
    const a = f('.env', 'X=1');
    const b = f('.env.shared', 'X=2');
    const base = resolveBase([a, b], undefined, {
      name: '.env.example',
      priority: ['.env.shared']
    });
    expect(base).toBe(b);
  });

  it('falls back to the first file when nothing matches', () => {
    const a = f('.env', 'X=1');
    const b = f('.env.local', 'X=2');
    expect(resolveBase([a, b], undefined, { priority: ['.env.none'] })).toBe(a);
  });
});

describe('diff — text edge cases', () => {
  it('reports when there are no other files to compare', () => {
    const base = f('.env.example', 'A=1');
    const out = formatDiffText(computeDiff(buildMatrix([base], base)));
    expect(out).toMatch(/no other env files/i);
  });

  it('reports in-sync when nothing drifts', () => {
    const base = f('.env.example', 'A=1');
    const dev = f('.env', 'A=1');
    const out = formatDiffText(computeDiff(buildMatrix([base, dev], base)));
    expect(out).toMatch(/in sync/i);
  });

  it('labels extra and missing cells', () => {
    const base = f('.env.example', 'A=1\nB=2');
    const dev = f('.env', 'A=1\nEXTRA=9'); // B missing, EXTRA not in base
    const out = formatDiffText(computeDiff(buildMatrix([base, dev], base)));
    expect(out).toMatch(/★ extra/);
    expect(out).toMatch(/✗ missing/);
  });
});

describe('mask — carve-outs', () => {
  it('does not mask keys whose final segment is ID', () => {
    expect(isSecretKey('API_KEY_ID')).toBe(false);
  });
  it('does not mask keys containing PUBLIC', () => {
    expect(isSecretKey('JWT_PUBLIC_KEY')).toBe(false);
  });
  it('returns false for a key with no usable segments', () => {
    expect(isSecretKey('')).toBe(false);
    expect(isSecretKey('___')).toBe(false);
  });
});

describe('serialize — single-quote fallback', () => {
  it('falls back to double quotes when a single-quoted value contains a quote', () => {
    const entry: KvEntry = {
      kind: 'kv',
      key: 'MSG',
      value: "it's fine",
      rawValue: '',
      quoting: 'single',
      exportPrefix: false,
      inlineComment: '',
      raw: ''
    };
    rebuildKvLine(entry);
    expect(entry.raw).toContain('"');
    expect(
      serializeEnv({ path: '.env', entries: [entry], trailingNewline: true })
    ).toContain('MSG="it\'s fine"');
  });
});

describe('matrix — guards', () => {
  it('throws when the base file is not among the files', () => {
    const a = f('.env', 'X=1');
    const orphan = f('.env.other', 'X=2');
    expect(() => buildMatrix([a], orphan)).toThrow(/base file/i);
  });

  it('throws when cell() is asked about a foreign file', () => {
    const a = f('.env', 'X=1');
    const foreign = f('.env.x', 'X=9');
    const m = buildMatrix([a], a);
    expect(() => m.cell('X', foreign)).toThrow(/not in matrix/i);
  });
});

describe('parse — quoting & comments', () => {
  it('decodes every double-quote escape (\\n \\r \\t \\\\ \\" and unknown)', () => {
    const file = parseEnv('K="a\\tb\\r\\n\\\\c\\"d\\z"\n', '.env');
    const kv = file.entries.find((e) => e.kind === 'kv');
    expect(kv && kv.kind === 'kv' && kv.value).toBe('a\tb\r\n\\c"d\\z');
  });

  it('round-trips an unquoted value with a trailing inline comment', () => {
    const src = 'K=value # trailing note\n';
    expect(serializeEnv(parseEnv(src, '.env'))).toBe(src);
  });

  it('keeps a # that is part of an unquoted value', () => {
    const file = parseEnv('K=va#lue\n', '.env');
    const kv = file.entries.find((e) => e.kind === 'kv');
    expect(kv && kv.kind === 'kv' && kv.value).toBe('va#lue');
  });
});

describe('sections — banner trimming', () => {
  it('strips trailing decoration from a block-banner name line', () => {
    const file = parseEnv(
      '# --------------\n# Database --\n# --------------\nDB_HOST=h\n',
      '.env.example'
    );
    const sections = computeSections(file);
    expect(sections.get('DB_HOST')).toBe('Database');
  });
});
