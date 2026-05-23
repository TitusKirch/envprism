import { mergeConfig, resolveHeuristics } from '@/config/resolve.ts';
import type { EnvprismUserConfig } from '@/config/schema.ts';
import { buildMatrix } from '@/core/matrix.ts';
import { parseEnv } from '@/core/parse.ts';
import type { EnvFile } from '@/core/types.ts';
import type { TuiContext } from '@tui/context.ts';
import { prefixSection } from '@tui/grouping.ts';
import { recomputeVisibleKeys } from '@tui/state/visible.ts';
import type { State } from '@tui/types.ts';

/** Build an EnvFile from raw source (trailing newline added if missing). */
export function file(path: string, source: string): EnvFile {
  return parseEnv(source.endsWith('\n') ? source : source + '\n', path);
}

/**
 * Position the cursor on a key the way navigation does — by its index in
 * `visibleItems` (which includes dividers), so `focusedKey(ctx)` resolves it.
 * (`focusKey` indexes `visibleKeys` instead and is only used post-add.)
 */
export function focusOnKey(ctx: TuiContext, key: string, col = 0): void {
  ctx.state.rowIdx = ctx.state.visibleItems.findIndex(
    (i) => i.kind === 'key' && i.ref === key
  );
  ctx.state.colIdx = col;
}

/**
 * Construct a TuiContext for unit-testing the state/actions/keys layers
 * without opentui. The render-only fields (renderer/el/theme/layout) are never
 * touched by those modules, so they are stubbed; refresh/refreshNow are no-ops.
 */
export function makeTestCtx(
  files: EnvFile[],
  base: EnvFile,
  userConfig: EnvprismUserConfig = {}
): TuiContext {
  const config = mergeConfig(userConfig);
  const heuristics = resolveHeuristics(config);
  const allFiles = files.slice();
  const matrix = buildMatrix(allFiles, base);
  const hasBanners = matrix.keys.some((k) => matrix.sectionOf(k) !== undefined);
  const grouping =
    heuristics.grouping === 'auto'
      ? hasBanners
        ? 'banner'
        : 'prefix'
      : heuristics.grouping;

  const state: State = {
    mode: 'browse',
    filter: '',
    rowIdx: 0,
    colIdx: 0,
    prompt: null,
    dirty: new Set(),
    visibleKeys: [],
    visibleItems: [],
    message: null,
    driftOnly: false,
    confirmQuit: false,
    grouping,
    helpOpen: false,
    undo: [],
    pane: 'matrix',
    sidebarIdx: 0,
    enabled: new Set(allFiles),
    showSecrets: !config.tui.maskSecrets,
    collapsed: new Set(),
    modified: new Set(),
    promptInput: ''
  };

  const ctx = {
    renderer: undefined as never,
    state,
    allFiles,
    el: undefined as never,
    config,
    theme: undefined as never,
    layout: undefined as never,
    heuristics,
    matrix,
    currentBase: base,
    refresh: () => {},
    refreshNow: () => {},
    sectionOf: (key: string): string | undefined =>
      state.grouping === 'banner'
        ? ctx.matrix.sectionOf(key)
        : prefixSection(key)
  } as TuiContext;

  recomputeVisibleKeys(ctx);
  return ctx;
}
