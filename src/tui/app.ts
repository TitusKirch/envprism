import {
  BoxRenderable,
  createCliRenderer,
  RGBA,
  ScrollBoxRenderable,
  TextRenderable
} from '@opentui/core';
import type { Matrix } from '@/core/matrix.ts';
import { COLORS, ROW_GAP, SIDEBAR_WIDTH } from '@tui/theme.ts';
import type { State } from '@tui/types.ts';
import { prefixSection } from '@tui/grouping.ts';
import type { TuiContext, TuiElements } from '@tui/context.ts';
import { createOnKey } from '@tui/keys/onKey.ts';
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

  // --- Layout ---
  const root = new BoxRenderable(renderer, {
    id: 'root',
    flexDirection: 'column',
    width: '100%',
    height: '100%'
  });
  renderer.root.add(root);

  const body = new BoxRenderable(renderer, {
    id: 'body',
    flexDirection: 'row',
    flexGrow: 1
  });
  root.add(body);

  const sidebar = new BoxRenderable(renderer, {
    id: 'sidebar',
    border: true,
    borderStyle: 'rounded',
    title: '',
    flexDirection: 'column',
    width: SIDEBAR_WIDTH,
    flexShrink: 0,
    paddingX: 1
  });
  body.add(sidebar);

  const matrixBox = new BoxRenderable(renderer, {
    id: 'matrix',
    border: true,
    borderStyle: 'rounded',
    title: '',
    flexDirection: 'column',
    flexGrow: 1,
    paddingX: 1,
    // Reserve a row at the bottom so the ScrollBox's horizontal scrollbar
    // does not overlap the matrix box's bottom border.
    paddingBottom: 1
  });
  body.add(matrixBox);

  // Header sits above the scrollable region so it doesn't scroll out of view.
  const headerHost = new BoxRenderable(renderer, {
    id: 'header-host',
    flexDirection: 'column',
    flexShrink: 0,
    // Match the ScrollBox viewport padding so the header column boundaries
    // line up with the data rows below.
    paddingRight: 1
  });
  matrixBox.add(headerHost);

  const scrollBox = new ScrollBoxRenderable(renderer, {
    id: 'matrix-scroll',
    flexGrow: 1,
    scrollX: true,
    scrollY: true,
    // Reserve a column on the right so the vertical scrollbar doesn't sit on
    // top of cell content, and a row at the bottom for the horizontal one.
    viewportOptions: { paddingRight: 1, paddingBottom: 1 },
    contentOptions: { flexDirection: 'column', rowGap: ROW_GAP }
  });
  matrixBox.add(scrollBox);

  const footer = new BoxRenderable(renderer, {
    id: 'footer',
    flexDirection: 'column',
    flexShrink: 0,
    paddingX: 1
  });
  root.add(footer);

  const hintA = new BoxRenderable(renderer, {
    id: 'hint-a',
    flexDirection: 'row',
    height: 1,
    flexShrink: 0
  });
  footer.add(hintA);

  const hintB = new BoxRenderable(renderer, {
    id: 'hint-b',
    flexDirection: 'row',
    height: 1,
    flexShrink: 0
  });
  footer.add(hintB);

  const status = new TextRenderable(renderer, {
    id: 'status',
    content: '',
    fg: COLORS.fgDim,
    wrapMode: 'none',
    height: 1
  });
  footer.add(status);

  // Filter has its own popover so we don't fight opentui's input-focus
  // behaviour. state.filter is the source of truth; characters are
  // accumulated by the global keypress handler when state.mode === 'filter'.
  const filterBox = new BoxRenderable(renderer, {
    id: 'filter-box',
    position: 'absolute',
    top: '15%',
    left: '20%',
    right: '20%',
    height: 'auto',
    zIndex: 60,
    border: true,
    borderStyle: 'rounded',
    title: ' Filter keys ',
    paddingX: 2,
    paddingY: 1,
    visible: false,
    backgroundColor: RGBA.fromHex('#1a1a1a'),
    flexDirection: 'column'
  });
  const filterField = new TextRenderable(renderer, {
    id: 'filter-field',
    content: '',
    fg: COLORS.fg,
    height: 1,
    wrapMode: 'none'
  });
  const filterStatus = new TextRenderable(renderer, {
    id: 'filter-status',
    content: '',
    fg: COLORS.fgDim,
    height: 1,
    marginTop: 1,
    wrapMode: 'none'
  });
  const filterHint = new TextRenderable(renderer, {
    id: 'filter-hint',
    content: 'Enter · keep filter    Esc · clear & close',
    fg: COLORS.fg,
    height: 1,
    marginTop: 1,
    wrapMode: 'none'
  });
  filterBox.add(filterField);
  filterBox.add(filterStatus);
  filterBox.add(filterHint);
  renderer.root.add(filterBox);

  // --- Prompt modal (used for edit / add / new-file) ---
  const promptBox = new BoxRenderable(renderer, {
    id: 'prompt-box',
    position: 'absolute',
    top: '20%',
    left: '15%',
    right: '15%',
    height: 'auto',
    zIndex: 50,
    border: true,
    borderStyle: 'rounded',
    title: '',
    paddingX: 2,
    paddingY: 1,
    visible: false,
    backgroundColor: RGBA.fromHex('#1a1a1a'),
    flexDirection: 'column'
  });
  // Body of the modal is rebuilt on every refresh — either the context table
  // (edit / add-value) or just a single input row (add-key / new-file).
  const promptBody = new BoxRenderable(renderer, {
    id: 'prompt-body',
    flexDirection: 'column',
    flexGrow: 1
  });
  const promptHint = new TextRenderable(renderer, {
    id: 'prompt-hint',
    content: '',
    fg: COLORS.fg,
    height: 1,
    marginTop: 2,
    wrapMode: 'none'
  });
  promptBox.add(promptBody);
  promptBox.add(promptHint);
  renderer.root.add(promptBox);

  // Full-screen dim layer drawn below the prompt and help overlays so the
  // matrix fades back when a modal is active. Solid dark backgroundColor at
  // reduced opacity feels like a real dim/scrim.
  const dimOverlay = new BoxRenderable(renderer, {
    id: 'dim-overlay',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 40,
    backgroundColor: RGBA.fromHex('#000000'),
    opacity: 0.6,
    visible: false
  });
  renderer.root.add(dimOverlay);

  // Floating help overlay. Hidden until '?' / 'ß' opens it. Two-column grid
  // so the overlay stays compact vertically and doesn't run off the bottom
  // on small terminals.
  // Help overlay — outer Box stays absolute-positioned; the body is rebuilt
  // every time it opens so we can switch between a one-column scrollable
  // layout (small terminals) and a two-column grid (wide terminals).
  const helpBox = new BoxRenderable(renderer, {
    id: 'help-overlay',
    position: 'absolute',
    top: 2,
    bottom: 2,
    left: '8%',
    right: '8%',
    zIndex: 100,
    border: true,
    borderStyle: 'rounded',
    title: ' Keybindings — press ? or Esc to close ',
    paddingX: 2,
    paddingY: 1,
    visible: false,
    backgroundColor: RGBA.fromHex('#1a1a1a'),
    flexDirection: 'column'
  });
  renderer.root.add(helpBox);

  // --- Context ---
  const el: TuiElements = {
    root,
    body,
    sidebar,
    matrixBox,
    headerHost,
    scrollBox,
    footer,
    hintA,
    hintB,
    status,
    filterBox,
    filterField,
    filterStatus,
    promptBox,
    promptBody,
    promptHint,
    helpBox,
    dimOverlay
  };

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
