export type Quoting = 'none' | 'single' | 'double';

export interface KvEntry {
  kind: 'kv';
  key: string;
  /** Raw value as written on disk, without surrounding quotes. */
  rawValue: string;
  /** Decoded value (escapes processed for `double`-quoted entries). */
  value: string;
  quoting: Quoting;
  /** `export ` prefix on the line, if any. */
  exportPrefix: boolean;
  /** Inline trailing comment, including the leading whitespace + `#`. */
  inlineComment: string;
  /** Raw line text as parsed (used for exact round-trip). */
  raw: string;
}

export interface CommentEntry {
  kind: 'comment';
  raw: string;
}

export interface BlankEntry {
  kind: 'blank';
  raw: string;
}

export type EnvEntry = KvEntry | CommentEntry | BlankEntry;

export interface EnvFile {
  /** Absolute or relative path the file was loaded from. */
  path: string;
  entries: EnvEntry[];
  /** Whether the source ended with a trailing newline. */
  trailingNewline: boolean;
}
