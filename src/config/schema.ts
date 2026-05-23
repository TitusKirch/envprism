// Config schema for envprism. Kept RGBA-free (no @opentui/core import) so the
// public `envprism/config` entry and the Node-safe `diff` path never pull in
// the TUI runtime. The resolved RGBA theme lives in src/tui/theme.ts.

export type GroupingMode = 'auto' | 'banner' | 'prefix';

export interface DiscoveryConfig {
  /** Paths scanned when none are passed on the CLI. */
  paths: string[];
  /** Filename suffixes to skip (editor/backup files). Replaces the default. */
  skipSuffixes: string[];
  /** Appended to {@link skipSuffixes} (or its default). */
  skipSuffixesExtra: string[];
  /** Sort `.env.example` first in the discovered file order. */
  exampleFirst: boolean;
}

export interface BaseConfig {
  /** Filename treated as the default base when present. */
  exampleName: string;
  /** Ordered basenames tried before falling back to the first file. */
  priority: string[];
}

export interface HeuristicsConfig {
  /** Secret-key tokens (case-insensitive). Replaces the built-in list. */
  secretTokens: string[];
  /** Appended to {@link secretTokens} (or its default). */
  secretTokensExtra: string[];
  /** Placeholder regex alternation atoms. Replaces the built-in list. */
  placeholders: string[];
  /** Appended to {@link placeholders} (or its default). */
  placeholdersExtra: string[];
  /** Default TUI grouping. 'auto' picks banner when the base has banners. */
  grouping: GroupingMode;
}

export interface DiffConfig {
  /** Emit JSON instead of the text table by default. */
  json: boolean;
  /** Exit code used by `--check` when files drift. */
  checkExitCode: number;
}

/** Partial hex (`#rrggbb`) overrides for the TUI palette; gaps use defaults. */
export interface ThemeConfig {
  fg?: string;
  fgDim?: string;
  fgHeader?: string;
  fgBase?: string;
  fgSection?: string;
  differs?: string;
  extra?: string;
  placeholder?: string;
  modified?: string;
  fgDirty?: string;
  missing?: string;
  focusBg?: string;
}

export type ThemeKey = keyof ThemeConfig;

export interface LayoutConfig {
  keyColWidth: number;
  valueColMin: number;
  sidebarWidth: number;
  rowGap: number;
  cellPadX: number;
}

export interface TuiConfig {
  theme: ThemeConfig;
  layout: LayoutConfig;
  undoLimit: number;
  /** Start with secret-suspect values masked (toggle in-app with Ctrl-T). */
  maskSecrets: boolean;
}

/** Fully-resolved, internal config shape (every field populated). */
export interface EnvprismConfig {
  discovery: DiscoveryConfig;
  base: BaseConfig;
  heuristics: HeuristicsConfig;
  diff: DiffConfig;
  tui: TuiConfig;
}

/** Deep-partial shape authored in envprism.config.{ts,js,mjs,json}. */
export interface EnvprismUserConfig {
  discovery?: Partial<DiscoveryConfig>;
  base?: Partial<BaseConfig>;
  heuristics?: Partial<HeuristicsConfig>;
  diff?: Partial<DiffConfig>;
  tui?: {
    theme?: ThemeConfig;
    layout?: Partial<LayoutConfig>;
    undoLimit?: number;
    maskSecrets?: boolean;
  };
}

/**
 * Built-in defaults — the single source of truth for every tunable value.
 * Mirrors the previously hardcoded constants (mask.ts SECRET_TOKENS,
 * format.ts PLACEHOLDER_RE atoms, discover.ts SKIP_SUFFIXES, theme.ts layout).
 */
export const DEFAULT_CONFIG: EnvprismConfig = {
  discovery: {
    paths: ['.'],
    skipSuffixes: ['.swp', '~', '.bak'],
    skipSuffixesExtra: [],
    exampleFirst: true
  },
  base: {
    exampleName: '.env.example',
    priority: []
  },
  heuristics: {
    secretTokens: [
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
    ],
    secretTokensExtra: [],
    placeholders: [
      'todo',
      'fixme',
      'changeme',
      'placeholder',
      'tbd',
      'x{3,}',
      'your[_-]?(secret|key|token|password|api[_-]?key)(_here)?',
      'replace[_-]?me'
    ],
    placeholdersExtra: [],
    grouping: 'auto'
  },
  diff: {
    json: false,
    checkExitCode: 1
  },
  tui: {
    theme: {},
    layout: {
      keyColWidth: 22,
      valueColMin: 18,
      sidebarWidth: 30,
      rowGap: 0,
      cellPadX: 1
    },
    undoLimit: 50,
    maskSecrets: true
  }
};
