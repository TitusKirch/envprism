import { describe, expect, it } from 'vitest';
import { parseEnv } from '@/core/parse.ts';

describe('parseEnv', () => {
  it('parses simple key=value', () => {
    const file = parseEnv('FOO=bar\n');
    expect(file.entries).toHaveLength(1);
    const entry = file.entries[0];
    expect(entry).toMatchObject({ kind: 'kv', key: 'FOO', value: 'bar' });
  });

  it('preserves comments and blank lines', () => {
    const file = parseEnv('# top\nFOO=bar\n\n# below\n');
    expect(file.entries.map((e) => e.kind)).toEqual([
      'comment',
      'kv',
      'blank',
      'comment'
    ]);
  });

  it('handles double-quoted values with escapes', () => {
    const file = parseEnv('GREETING="hello\\nworld"\n');
    const entry = file.entries[0];
    expect(entry).toMatchObject({
      kind: 'kv',
      key: 'GREETING',
      value: 'hello\nworld',
      quoting: 'double'
    });
  });

  it('handles single-quoted values as literal', () => {
    const file = parseEnv("SECRET='abc\\n123'\n");
    expect(file.entries[0]).toMatchObject({
      kind: 'kv',
      value: 'abc\\n123',
      quoting: 'single'
    });
  });

  it('captures inline trailing comments without losing the value', () => {
    const file = parseEnv('PORT=3000 # default port\n');
    const entry = file.entries[0];
    expect(entry).toMatchObject({ kind: 'kv', value: '3000' });
  });

  it('treats `#` inside a quoted value as part of the value', () => {
    const file = parseEnv('TOKEN="abc#def"\n');
    expect(file.entries[0]).toMatchObject({ kind: 'kv', value: 'abc#def' });
  });

  it('recognises the `export` prefix', () => {
    const file = parseEnv('export FOO=bar\n');
    expect(file.entries[0]).toMatchObject({
      kind: 'kv',
      key: 'FOO',
      exportPrefix: true
    });
  });

  it('parses empty values', () => {
    const file = parseEnv('EMPTY=\nQUOTED_EMPTY=""\n');
    expect(file.entries[0]).toMatchObject({ kind: 'kv', value: '' });
    expect(file.entries[1]).toMatchObject({
      kind: 'kv',
      value: '',
      quoting: 'double'
    });
  });

  it('detects trailing newline', () => {
    expect(parseEnv('FOO=bar\n').trailingNewline).toBe(true);
    expect(parseEnv('FOO=bar').trailingNewline).toBe(false);
  });
});
