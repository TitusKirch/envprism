const SECRET_TOKENS = [
  'SECRET',
  'TOKEN',
  'PASSWORD',
  'PASSWD',
  'PWD',
  'KEY',
  'PRIVATE',
  'CREDENTIAL',
  'AUTH',
  'DSN'
] as const;

/**
 * Heuristic: should a value with this key be masked by default? Matches any
 * underscore-separated segment of {@link SECRET_TOKENS} (case-insensitive),
 * with carve-outs for false positives like `*_PUBLIC_KEY`, `PUBLIC_*`, and
 * keys whose final segment is `ID` (e.g. `API_KEY_ID` is an identifier, not
 * a secret).
 */
export function isSecretKey(
  key: string,
  tokens: readonly string[] = SECRET_TOKENS
): boolean {
  const upper = key.toUpperCase();
  const segments = upper.split('_').filter(Boolean);
  if (segments.length === 0) return false;
  if (segments[segments.length - 1] === 'ID') return false;
  if (segments[0] === 'PUBLIC') return false;
  if (segments.includes('PUBLIC')) return false;

  return segments.some((seg) =>
    tokens.some((token) => seg === token || seg.endsWith(token))
  );
}

/**
 * Render a masked placeholder that hints at the original value's length
 * without leaking content. Returns `••••` when the input is empty.
 */
export function maskValue(value: string): string {
  if (value.length === 0) return '••••';
  const dots = '•'.repeat(Math.min(value.length, 8));
  return value.length > 8 ? `${dots} (${value.length})` : dots;
}
