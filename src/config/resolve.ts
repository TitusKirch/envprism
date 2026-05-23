import consola from 'consola';
import { defu } from 'defu';
import { isSecretKey } from '@/core/mask.ts';
import {
  DEFAULT_CONFIG,
  type EnvprismConfig,
  type EnvprismUserConfig,
  type GroupingMode,
  type ThemeConfig,
  type ThemeKey
} from '@/config/schema.ts';
import { isPlaceholderValue } from '@tui/format.ts';

/** Hex source of truth for the TUI palette (resolved to RGBA in theme.ts). */
export const DEFAULT_THEME_HEX: Record<ThemeKey, string> = {
  fg: '#cccccc',
  fgDim: '#666666',
  fgHeader: '#ffffff',
  fgBase: '#82aaff',
  fgSection: '#82aaff',
  differs: '#ffd866',
  extra: '#ffd866',
  placeholder: '#ffd866',
  modified: '#7fce6a',
  fgDirty: '#7fce6a',
  missing: '#ff6b6b',
  focusBg: '#3a3f4b'
};

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

/**
 * Merge user hex overrides onto {@link DEFAULT_THEME_HEX}. Invalid hex values
 * warn (light runtime guard) and fall back to the default. RGBA-free so it is
 * unit-testable under Node without loading the TUI runtime; theme.ts wraps the
 * result with RGBA.fromHex.
 */
export function resolveThemeHex(
  theme: ThemeConfig = {},
  warn: (msg: string) => void = consola.warn
): Record<ThemeKey, string> {
  const out = { ...DEFAULT_THEME_HEX };
  for (const key of Object.keys(DEFAULT_THEME_HEX) as ThemeKey[]) {
    const override = theme[key];
    if (override === undefined) continue;
    if (HEX_RE.test(override)) {
      out[key] = override;
    } else {
      warn(`envprism: ignoring invalid hex for theme.${key}: "${override}"`);
    }
  }
  return out;
}

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
      undoLimit: user.tui?.undoLimit ?? DEFAULT_CONFIG.tui.undoLimit,
      maskSecrets: user.tui?.maskSecrets ?? DEFAULT_CONFIG.tui.maskSecrets
    }
  };
}

export interface ResolvedHeuristics {
  isSecretKey(key: string): boolean;
  isPlaceholderValue(value: string): boolean;
  grouping: GroupingMode;
}

/**
 * Compile the resolved heuristics config into ready-to-call matchers. Secret
 * tokens are upper-cased (the matcher upper-cases keys); placeholder atoms are
 * compiled into a single case-insensitive alternation. RGBA-free.
 */
export function resolveHeuristics(c: EnvprismConfig): ResolvedHeuristics {
  const tokens = c.heuristics.secretTokens.map((t) => t.toUpperCase());
  const placeholderRe = new RegExp(
    `^(${c.heuristics.placeholders.join('|')})$`,
    'i'
  );
  return {
    isSecretKey: (key) => isSecretKey(key, tokens),
    isPlaceholderValue: (value) => isPlaceholderValue(value, placeholderRe),
    grouping: c.heuristics.grouping
  };
}
