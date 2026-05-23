import { defu } from 'defu';
import {
  DEFAULT_CONFIG,
  type EnvprismConfig,
  type EnvprismUserConfig
} from '@/config/schema.ts';

/**
 * Resolve a replace-or-extend list field. An explicit `replace` list wins over
 * the built-in `fallback`; `extra` is always appended to whatever the current
 * list is. De-duplicated so repeated entries are harmless.
 */
function pickList(
  replace: string[] | undefined,
  extra: string[] | undefined,
  fallback: string[]
): string[] {
  const base = replace ?? fallback;
  return [...new Set([...base, ...(extra ?? [])])];
}

/**
 * Merge a deep-partial user config onto {@link DEFAULT_CONFIG}. Scalars and
 * plain objects use defu (user wins, gaps fall back). List fields are handled
 * manually because defu concatenates arrays — wrong for our replace semantics:
 * `*` lists replace the default, `*Extra` lists append. The folded result puts
 * everything into the canonical field and leaves `*Extra` empty.
 */
export function mergeConfig(user: EnvprismUserConfig = {}): EnvprismConfig {
  return {
    discovery: {
      paths: user.discovery?.paths ?? DEFAULT_CONFIG.discovery.paths,
      skipSuffixes: pickList(
        user.discovery?.skipSuffixes,
        user.discovery?.skipSuffixesExtra,
        DEFAULT_CONFIG.discovery.skipSuffixes
      ),
      skipSuffixesExtra: [],
      exampleFirst:
        user.discovery?.exampleFirst ?? DEFAULT_CONFIG.discovery.exampleFirst
    },
    base: {
      exampleName: user.base?.exampleName ?? DEFAULT_CONFIG.base.exampleName,
      priority: user.base?.priority ?? DEFAULT_CONFIG.base.priority
    },
    heuristics: {
      secretTokens: pickList(
        user.heuristics?.secretTokens,
        user.heuristics?.secretTokensExtra,
        DEFAULT_CONFIG.heuristics.secretTokens
      ),
      secretTokensExtra: [],
      placeholders: pickList(
        user.heuristics?.placeholders,
        user.heuristics?.placeholdersExtra,
        DEFAULT_CONFIG.heuristics.placeholders
      ),
      placeholdersExtra: [],
      grouping: user.heuristics?.grouping ?? DEFAULT_CONFIG.heuristics.grouping
    },
    diff: defu(user.diff, DEFAULT_CONFIG.diff),
    tui: {
      theme: defu(user.tui?.theme, DEFAULT_CONFIG.tui.theme),
      layout: defu(user.tui?.layout, DEFAULT_CONFIG.tui.layout),
      undoLimit: user.tui?.undoLimit ?? DEFAULT_CONFIG.tui.undoLimit
    }
  };
}
