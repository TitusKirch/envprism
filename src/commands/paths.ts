/**
 * The paths a command should scan. citty puts only the first positional into
 * a named positional arg and every positional into `_`, so `_` wins whenever
 * it holds anything; otherwise the named arg, then the configured fallback.
 */
export function collectPaths(
  args: { paths?: unknown; _?: unknown },
  fallback: string[]
): string[] {
  if (Array.isArray(args._) && args._.length > 0) return args._.map(String);
  const { paths } = args;
  if (Array.isArray(paths)) return paths.map(String);
  if (typeof paths === 'string' && paths.length > 0) return [paths];
  return fallback;
}
