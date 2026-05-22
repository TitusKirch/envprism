import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseEnv } from '../src/core/parse.ts';
import { rebuildKvLine, serializeEnv } from '../src/core/serialize.ts';
import type { KvEntry } from '../src/core/types.ts';

const FIXTURE_DIR = join(__dirname, 'fixtures');

describe('serializeEnv (round-trip)', () => {
  const fixtures = readdirSync(FIXTURE_DIR).filter((f) => f.endsWith('.env'));

  for (const name of fixtures) {
    it(`round-trips ${name} byte-for-byte`, () => {
      const original = readFileSync(join(FIXTURE_DIR, name), 'utf8');
      const file = parseEnv(original, name);
      expect(serializeEnv(file)).toBe(original);
    });
  }
});

describe('rebuildKvLine', () => {
  it('rewrites the line after a value change (unquoted)', () => {
    const file = parseEnv('PORT=3000\n');
    const entry = file.entries[0] as KvEntry;
    entry.value = '4000';
    rebuildKvLine(entry);
    expect(serializeEnv(file)).toBe('PORT=4000\n');
  });

  it('preserves quoting style on unchanged structure', () => {
    const file = parseEnv('TOKEN="old"\n');
    const entry = file.entries[0] as KvEntry;
    entry.value = 'new';
    rebuildKvLine(entry);
    expect(serializeEnv(file)).toBe('TOKEN="new"\n');
  });

  it('auto-promotes to double quotes when an unquoted value gains whitespace', () => {
    const file = parseEnv('NAME=alice\n');
    const entry = file.entries[0] as KvEntry;
    entry.value = 'alice cooper';
    rebuildKvLine(entry);
    expect(serializeEnv(file)).toBe('NAME="alice cooper"\n');
  });

  it('escapes newlines when round-tripping multi-line values via double quotes', () => {
    const file = parseEnv('MSG="hi"\n');
    const entry = file.entries[0] as KvEntry;
    entry.value = 'line1\nline2';
    rebuildKvLine(entry);
    expect(serializeEnv(file)).toBe('MSG="line1\\nline2"\n');
  });

  it('preserves inline comments after rebuild', () => {
    const file = parseEnv('PORT=3000 # default\n');
    const entry = file.entries[0] as KvEntry;
    entry.value = '4000';
    rebuildKvLine(entry);
    expect(serializeEnv(file)).toBe('PORT=4000 # default\n');
  });

  it('preserves export prefix after rebuild', () => {
    const file = parseEnv('export FOO=bar\n');
    const entry = file.entries[0] as KvEntry;
    entry.value = 'baz';
    rebuildKvLine(entry);
    expect(serializeEnv(file)).toBe('export FOO=baz\n');
  });
});
