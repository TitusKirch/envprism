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
import { prefixSection, stepRow } from '@tui/grouping.ts';
import type { TuiContext, TuiElements } from '@tui/context.ts';
import { refreshAll } from '@tui/render/index.ts';
import {
  rebuildMatrix as rebuildMatrixImpl,
  recomputeVisibleKeys as recomputeVisibleKeysImpl
} from '@tui/state/visible.ts';
import {
  cancelPrompt as cancelPromptImpl,
  closePrompt as closePromptImpl,
  commitPrompt as commitPromptImpl,
  startAdd as startAddImpl,
  startDelete as startDeleteImpl,
  startEdit as startEditImpl,
  startNewFile as startNewFileImpl
} from '@tui/actions/prompt.ts';
import {
  applyToAllFiles as applyToAllFilesImpl,
  setBase as setBaseImpl,
  syncToAll as syncToAllImpl,
  toggleEnabled as toggleEnabledImpl,
  undo as undoImpl
} from '@tui/actions/batch.ts';
import { saveDirty as saveDirtyImpl } from '@tui/actions/io.ts';

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
  const refresh = ctx.refresh;
  const sectionOf = ctx.sectionOf;

  // --- State helpers (thin ctx-bound wrappers over state/visible.ts) ---
  const recomputeVisibleKeys = () => recomputeVisibleKeysImpl(ctx);
  const rebuildMatrix = () => rebuildMatrixImpl(ctx);

  recomputeVisibleKeys();
  ctx.refreshNow();

  // --- Interaction ---
  return new Promise<void>((resolve) => {
    const cleanup = () => {
      renderer._internalKeyInput.offInternal('keypress', onKey);
      renderer.destroy?.();
      resolve();
    };

    // Thin ctx-bound wrappers so the key handler below reads unchanged.
    const closePrompt = (msg: string | null = null) =>
      closePromptImpl(ctx, msg);
    const cancelPrompt = () => cancelPromptImpl(ctx);
    const commitPrompt = () => commitPromptImpl(ctx);
    const startEdit = () => startEditImpl(ctx);
    const startAdd = () => startAddImpl(ctx);
    const startNewFile = () => startNewFileImpl(ctx);
    const startDelete = () => startDeleteImpl(ctx);
    const applyToAllFiles = (key: string, value: string) =>
      applyToAllFilesImpl(ctx, key, value);
    const syncToAll = () => syncToAllImpl(ctx);
    const undo = () => undoImpl(ctx);
    const toggleEnabled = () => toggleEnabledImpl(ctx);
    const setBase = () => setBaseImpl(ctx);
    const saveDirty = () => saveDirtyImpl(ctx);

    const onKey = (key: {
      name: string;
      ctrl?: boolean;
      shift?: boolean;
      sequence?: string;
      preventDefault?: () => void;
    }) => {
      if (state.helpOpen) {
        if (
          key.name === 'escape' ||
          key.sequence === '?' ||
          key.sequence === 'ß' ||
          key.name === 'q'
        ) {
          state.helpOpen = false;
          refresh();
        }
        return;
      }

      if (state.mode === 'prompt') {
        if (key.name === 'escape') {
          cancelPrompt();
          return;
        }
        if (key.name === 'return') {
          commitPrompt();
          return;
        }
        if (key.name === 'backspace') {
          if (state.promptInput.length > 0) {
            state.promptInput = state.promptInput.slice(0, -1);
            refresh();
          }
          return;
        }
        if (key.ctrl && key.name === 't') {
          state.showSecrets = !state.showSecrets;
          refresh();
          return;
        }
        if (key.ctrl && key.name === 'a' && state.prompt) {
          const p = state.prompt;
          if (p.kind === 'edit' || p.kind === 'add-value') {
            const touched = applyToAllFiles(p.key, state.promptInput);
            rebuildMatrix();
            closePrompt(
              touched > 0
                ? `Set ${p.key} in ${touched} file(s). Ctrl-S to save.`
                : `${p.key} already had that value everywhere.`
            );
          }
          return;
        }
        const seq = key.sequence ?? '';
        if (!key.ctrl && seq.length === 1 && seq >= ' ' && seq !== '\x7f') {
          state.promptInput += seq;
          refresh();
        }
        return;
      }

      if (state.mode === 'filter') {
        if (key.name === 'escape') {
          state.filter = '';
          state.mode = 'browse';
          recomputeVisibleKeys();
          refresh();
          return;
        }
        if (key.name === 'return') {
          state.mode = 'browse';
          refresh();
          return;
        }
        if (key.name === 'backspace') {
          if (state.filter.length > 0) {
            state.filter = state.filter.slice(0, -1);
            recomputeVisibleKeys();
            refresh();
          }
          return;
        }
        // Append any printable character. opentui's KeyEvent puts the actual
        // char into `sequence` for normal keystrokes.
        const seq = key.sequence ?? '';
        if (seq.length === 1 && seq >= ' ' && seq !== '\x7f') {
          state.filter += seq;
          recomputeVisibleKeys();
          refresh();
        }
        return;
      }

      // Browse mode.
      if (key.ctrl && key.name === 'c') return cleanup();
      if (key.ctrl && key.name === 's') {
        state.confirmQuit = false;
        return void saveDirty();
      }
      if (key.ctrl && key.name === 'z') {
        state.confirmQuit = false;
        return undo();
      }
      if (key.ctrl && key.name === 't') {
        state.showSecrets = !state.showSecrets;
        state.message = state.showSecrets
          ? 'Showing secret values in plain text.'
          : 'Masking secret values.';
        return refresh();
      }

      const tryQuit = () => {
        if (state.dirty.size > 0 && !state.confirmQuit) {
          state.confirmQuit = true;
          state.message = `${state.dirty.size} unsaved file(s). Press 'q' again to quit without saving, or Ctrl-S to save first.`;
          refresh();
          return;
        }
        cleanup();
      };
      // Any key other than q clears a pending quit confirmation.
      if (state.confirmQuit && key.name !== 'q') {
        state.confirmQuit = false;
        state.message = null;
      }

      if (state.pane === 'sidebar') {
        switch (key.name) {
          case 'q':
            return tryQuit();
          case 'tab':
            state.pane = 'matrix';
            return refresh();
          case 'right':
            state.pane = 'matrix';
            return refresh();
          case 'up':
            state.sidebarIdx = Math.max(0, state.sidebarIdx - 1);
            return refresh();
          case 'down':
            state.sidebarIdx = Math.min(
              allFiles.length - 1,
              state.sidebarIdx + 1
            );
            return refresh();
          case 'space':
            return toggleEnabled();
          case 'b':
            return setBase();
        }
        if (key.sequence === ' ') return toggleEnabled();
        if (key.sequence === '?' || key.sequence === 'ß') {
          state.helpOpen = true;
          return refresh();
        }
        return;
      }

      switch (key.name) {
        case 'q':
          return tryQuit();
        case 'tab':
          state.pane = 'sidebar';
          return refresh();
        case 'up':
          state.rowIdx = stepRow(state, -1);
          return refresh();
        case 'down':
          state.rowIdx = stepRow(state, 1);
          return refresh();
        case 'left':
          if (state.colIdx === 0) {
            // Already at the leftmost matrix column — hand focus to the sidebar.
            state.pane = 'sidebar';
            return refresh();
          }
          state.colIdx = Math.max(0, state.colIdx - 1);
          return refresh();
        case 'right':
          state.colIdx = Math.min(
            ctx.matrix.files.length - 1,
            state.colIdx + 1
          );
          return refresh();
        case 'e':
        case 'return':
          return startEdit();
        case 'a':
          return startAdd();
        case 'd':
          return startDelete();
        case 'n':
          return startNewFile();
        case 'v':
          state.driftOnly = !state.driftOnly;
          state.message = state.driftOnly
            ? 'Drift-only view (only keys with differences).'
            : 'Full view.';
          recomputeVisibleKeys();
          return refresh();
        case 'c': {
          if (key.shift) {
            // Capital C — expand every collapsed section. Use this when all
            // keys you'd navigate to are hidden behind a fold.
            if (state.collapsed.size === 0) {
              state.message = 'Nothing collapsed.';
              return refresh();
            }
            const count = state.collapsed.size;
            state.collapsed.clear();
            state.message = `Expanded ${count} section(s).`;
            recomputeVisibleKeys();
            return refresh();
          }
          // Collapse / expand the section of the focused item. Works on
          // both key rows and section dividers; on a divider this is the
          // only way back into a collapsed section.
          const item = state.visibleItems[state.rowIdx];
          if (!item) return;
          const sectionKey =
            item.kind === 'divider'
              ? item.ref
              : (sectionOf(item.ref) ?? '__other__');
          if (state.collapsed.has(sectionKey)) {
            state.collapsed.delete(sectionKey);
            state.message = `Expanded "${sectionKey === '__other__' ? '(other)' : sectionKey}".`;
          } else {
            state.collapsed.add(sectionKey);
            state.message = `Collapsed "${sectionKey === '__other__' ? '(other)' : sectionKey}". Press Shift-C to expand all.`;
          }
          recomputeVisibleKeys();
          return refresh();
        }
        case 'g': {
          // Preserve focus across the rebuild — focusedRef in
          // recomputeVisibleKeys finds the same item by ref.
          state.grouping = state.grouping === 'banner' ? 'prefix' : 'banner';
          recomputeVisibleKeys();
          state.message =
            state.grouping === 'banner'
              ? 'Group by comment banners.'
              : 'Group by key prefix (first underscore segment).';
          return refresh();
        }
      }

      if (key.sequence === '/' || key.name === 'slash') {
        state.mode = 'filter';
        state.message = null;
        refresh();
        return;
      }

      // = sync-to-all. opentui's key.name for "=" is inconsistent across
      // platforms so we check the sequence directly.
      if (key.sequence === '=') return syncToAll();

      if (key.sequence === '?' || key.sequence === 'ß') {
        state.helpOpen = true;
        refresh();
      }
    };

    // Use the internal channel so our handler runs *before* the focused
    // renderable processes the event. That lets us intercept Esc / Enter
    // before opentui's InputRenderable swallows them (Esc would otherwise
    // just blur the input instead of closing the modal).
    renderer._internalKeyInput.onInternal('keypress', onKey);
    renderer.on('resize', refresh);
  });
}
