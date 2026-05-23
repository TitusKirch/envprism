import { createCliRenderer } from '@opentui/core';
import type { Matrix } from '@/core/matrix.ts';
import type { State } from '@tui/types.ts';
import { prefixSection } from '@tui/grouping.ts';
import type { TuiContext } from '@tui/context.ts';
import { createOnKey } from '@tui/keys/onKey.ts';
import { buildLayout } from '@tui/render/layout.ts';
import { refreshAll } from '@tui/render/index.ts';
import { recomputeVisibleKeys } from '@tui/state/visible.ts';

export async function runMatrixTui(initialMatrix: Matrix): Promise<void> {
  const renderer = await createCliRenderer({ useMouse: true });
  // The full discovered file list never changes; the matrix is rebuilt from
  // the currently *enabled* subset whenever the user toggles a file.
  const allFiles = initialMatrix.files.slice();

  // Prefer banner grouping when the base file actually has section banners;
  // otherwise prefix grouping is more useful out of the box.
  const hasBanners = initialMatrix.keys.some(
    (k) => initialMatrix.sectionOf(k) !== undefined
  );
  const state: State = {
    mode: 'browse',
    filter: '',
    rowIdx: 0,
    colIdx: 0,
    prompt: null,
    dirty: new Set(),
    visibleKeys: initialMatrix.keys.slice(),
    visibleItems: [],
    message: null,
    driftOnly: false,
    confirmQuit: false,
    grouping: hasBanners ? 'banner' : 'prefix',
    helpOpen: false,
    undo: [],
    pane: 'matrix',
    sidebarIdx: 0,
    enabled: new Set(allFiles),
    showSecrets: false,
    collapsed: new Set(),
    modified: new Set(),
    promptInput: ''
  };

  const el = buildLayout(renderer);

  // Coalesce burst-y refreshes (held arrow keys, fast filter typing) into one
  // render per microtask flush. refreshAll rebuilds every matrix row, which is
  // expensive per keystroke; batching keeps held keys in opentui's own redraw
  // loop instead of our re-render.
  let refreshScheduled = false;
  const ctx: TuiContext = {
    renderer,
    state,
    allFiles,
    el,
    matrix: initialMatrix,
    currentBase: initialMatrix.base,
    refresh: () => {
      if (refreshScheduled) return;
      refreshScheduled = true;
      queueMicrotask(() => {
        refreshScheduled = false;
        refreshAll(ctx);
      });
    },
    refreshNow: () => refreshAll(ctx),
    sectionOf: (key: string): string | undefined =>
      state.grouping === 'banner'
        ? ctx.matrix.sectionOf(key)
        : prefixSection(key)
  };

  recomputeVisibleKeys(ctx);
  ctx.refreshNow();

  // --- Interaction ---
  return new Promise<void>((resolve) => {
    const cleanup = () => {
      renderer._internalKeyInput.offInternal('keypress', onKey);
      renderer.destroy?.();
      resolve();
    };

    const onKey = createOnKey(ctx, cleanup);

    // Use the internal channel so our handler runs *before* the focused
    // renderable processes the event. That lets us intercept Esc / Enter
    // before opentui's InputRenderable swallows them (Esc would otherwise
    // just blur the input instead of closing the modal).
    renderer._internalKeyInput.onInternal('keypress', onKey);
    renderer.on('resize', ctx.refresh);
  });
}
