import { describe, expect, it } from 'vitest';
import { serializeEnv } from '@/core/serialize.ts';
import {
  appendKv,
  createEmptyEnvFile,
  isValidEnvFileName
} from '@tui/envfile.ts';

describe('isValidEnvFileName', () => {
  it('accepts .env* names', () => {
    for (const n of ['.env', '.env.local', '.env.production']) {
      expect(isValidEnvFileName(n)).toBe(true);
    }
  });

  it('rejects non-.env names and path separators', () => {
    expect(isValidEnvFileName('config')).toBe(false);
    expect(isValidEnvFileName('sub/.env')).toBe(false);
    expect(isValidEnvFileName('sub\\.env')).toBe(false);
  });

  it('rejects editor/backup suffixes', () => {
    expect(isValidEnvFileName('.env.swp')).toBe(false);
    expect(isValidEnvFileName('.env~')).toBe(false);
    expect(isValidEnvFileName('.env.bak')).toBe(false);
  });
});

describe('createEmptyEnvFile', () => {
  it('seeds a comment header from the basename and a trailing newline', () => {
    const file = createEmptyEnvFile('/tmp/project/.env.local');
    expect(file.path).toBe('/tmp/project/.env.local');
    expect(file.trailingNewline).toBe(true);
    expect(file.entries).toEqual([{ kind: 'comment', raw: '# .env.local' }]);
  });
});

describe('appendKv', () => {
  it('appends a round-trippable kv entry and forces a trailing newline', () => {
    const file = createEmptyEnvFile('/tmp/.env');
    const entry = appendKv(file, 'PORT', '3000');
    expect(entry.kind).toBe('kv');
    expect(entry.key).toBe('PORT');
    expect(entry.value).toBe('3000');
    expect(file.entries.at(-1)).toBe(entry);
    expect(file.trailingNewline).toBe(true);
    expect(serializeEnv(file)).toBe('# .env\nPORT=3000\n');
  });
});
