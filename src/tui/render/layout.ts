import {
  BoxRenderable,
  type CliRenderer,
  RGBA,
  ScrollBoxRenderable,
  TextRenderable
} from '@opentui/core';
import type { TuiElements } from '@tui/context.ts';
import type { ResolvedLayout, ResolvedTheme } from '@tui/theme.ts';

/**
 * Build the static element tree once and return stable handles. Content is
 * (re)populated later by the refreshers; this only establishes the layout
 * skeleton and parent/child wiring.
 */
export function buildLayout(
  renderer: CliRenderer,
  theme: ResolvedTheme,
  layout: ResolvedLayout
): TuiElements {
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
    width: layout.SIDEBAR_WIDTH,
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
    contentOptions: { flexDirection: 'column', rowGap: layout.ROW_GAP }
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
    fg: theme.fgDim,
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
    fg: theme.fg,
    height: 1,
    wrapMode: 'none'
  });
  const filterStatus = new TextRenderable(renderer, {
    id: 'filter-status',
    content: '',
    fg: theme.fgDim,
    height: 1,
    marginTop: 1,
    wrapMode: 'none'
  });
  const filterHint = new TextRenderable(renderer, {
    id: 'filter-hint',
    content: 'Enter · keep filter    Esc · clear & close',
    fg: theme.fg,
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
    fg: theme.fg,
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

  return {
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
}
