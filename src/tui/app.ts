import {
  BoxRenderable,
  createCliRenderer,
  RGBA,
  ScrollBoxRenderable,
  TextRenderable
} from '@opentui/core';
import { writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'pathe';
import { buildMatrix, type Matrix } from '@/core/matrix.ts';
import { rebuildKvLine, serializeEnv } from '@/core/serialize.ts';
import type { EnvFile } from '@/core/types.ts';
import {
  COLORS,
  KEY_COL_WIDTH,
  ROW_GAP,
  SIDEBAR_WIDTH,
  VALUE_COL_MIN
} from '@tui/theme.ts';
import {
  KEY_RE,
  type MatrixItem,
  type Prompt,
  type State,
  UNDO_LIMIT,
  type UndoEntry
} from '@tui/types.ts';
import {
  appendKv,
  createEmptyEnvFile,
  isValidEnvFileName
} from '@tui/envfile.ts';
import { findKvEntry, matchesFilter } from '@tui/format.ts';
import {
  keyDrifts,
  orderedKeys,
  prefixSection,
  stepRow
} from '@tui/grouping.ts';
import { refreshFilter } from '@tui/render/filter.ts';
import { refreshFooter } from '@tui/render/footer.ts';
import { refreshHelp } from '@tui/render/help.ts';
import { refreshMatrix } from '@tui/render/matrix.ts';
import { refreshPrompt } from '@tui/render/prompt.ts';
import { refreshSidebar } from '@tui/render/sidebar.ts';

export async function runMatrixTui(initialMatrix: Matrix): Promise<void> {
  const renderer = await createCliRenderer({ useMouse: true });
  // The full discovered file list never changes; the matrix is rebuilt from
  // the currently *enabled* subset whenever the user toggles a file.
  const allFiles = initialMatrix.files.slice();
  let currentBase = initialMatrix.base;
  let matrix = initialMatrix;

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
    visibleKeys: matrix.keys.slice(),
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

  const cellKey = (key: string, file: EnvFile) => `${key}|${file.path}`;
  const markModified = (key: string, file: EnvFile) =>
    state.modified.add(cellKey(key, file));

  const SECTION_COLLAPSE_KEY = (name: string | undefined) =>
    name ?? '__other__';

  const pushUndo = (entry: UndoEntry) => {
    state.undo.push(entry);
    if (state.undo.length > UNDO_LIMIT) state.undo.shift();
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

  // --- State helpers ---
  const sectionOf = (key: string): string | undefined =>
    state.grouping === 'banner' ? matrix.sectionOf(key) : prefixSection(key);

  const recomputeVisibleKeys = () => {
    // Two parallel structures:
    //   visibleKeys  — just the key names (used by editing helpers)
    //   visibleItems — dividers + visible keys, in render order
    // Dividers stay in the item list even when their section is collapsed,
    // so the user can navigate onto one and expand it with 'c'.
    const visibleKeys: string[] = [];
    const items: MatrixItem[] = [];
    const orderedAll = orderedKeys(matrix, state, sectionOf);
    const seen = new Set<string>();
    const focusedRef = state.visibleItems[state.rowIdx]?.ref;
    for (const k of orderedAll) {
      if (!matchesFilter(k, state.filter)) continue;
      if (state.driftOnly && !keyDrifts(matrix, k)) continue;
      const sec = sectionOf(k);
      const secKey = SECTION_COLLAPSE_KEY(sec);
      if (!seen.has(secKey)) {
        seen.add(secKey);
        items.push({ kind: 'divider', ref: secKey });
      }
      if (state.collapsed.has(secKey)) continue;
      items.push({ kind: 'key', ref: k });
      visibleKeys.push(k);
    }
    state.visibleKeys = visibleKeys;
    state.visibleItems = items;
    // Try to keep focus on the same item across rebuilds.
    if (focusedRef) {
      const i = items.findIndex((it) => it.ref === focusedRef);
      if (i >= 0) state.rowIdx = i;
    }
    if (state.rowIdx >= items.length) {
      state.rowIdx = Math.max(0, items.length - 1);
    }
    // Make sure we don't land on an expanded divider after a rebuild.
    if (
      items[state.rowIdx]?.kind === 'divider' &&
      !state.collapsed.has(items[state.rowIdx]!.ref)
    ) {
      const next = stepRow(state, 1);
      const prev = stepRow(state, -1);
      state.rowIdx = next !== state.rowIdx ? next : prev;
    }
  };

  const rebuildMatrix = () => {
    const enabledList = allFiles.filter((f) => state.enabled.has(f));
    if (!state.enabled.has(currentBase)) {
      // Base got disabled — promote the first enabled file.
      const next = enabledList[0];
      if (next) currentBase = next;
    }
    matrix = buildMatrix(enabledList, currentBase);
    if (state.colIdx >= matrix.files.length) {
      state.colIdx = Math.max(0, matrix.files.length - 1);
    }
    if (state.sidebarIdx >= allFiles.length) {
      state.sidebarIdx = Math.max(0, allFiles.length - 1);
    }
    recomputeVisibleKeys();
  };

  const focusKey = (key: string) => {
    const idx = state.visibleKeys.indexOf(key);
    if (idx >= 0) state.rowIdx = idx;
  };

  const computeValueColWidth = (): number => {
    // Available width inside the matrix box (subtract sidebar, both borders
    // and the matrix's horizontal padding). If columns would have to shrink
    // below VALUE_COL_MIN to fit the viewport, keep them at the minimum and
    // let the ScrollBox handle the horizontal overflow.
    const available = Math.max(
      0,
      renderer.terminalWidth - SIDEBAR_WIDTH - 6 - KEY_COL_WIDTH
    );
    const fair = matrix.files.length
      ? Math.floor(available / matrix.files.length)
      : VALUE_COL_MIN;
    return Math.max(VALUE_COL_MIN, fair);
  };

  const refreshNow = () => {
    const valueColWidth = computeValueColWidth();
    refreshSidebar(sidebar, renderer, matrix, allFiles, state);
    refreshMatrix(
      matrixBox,
      headerHost,
      scrollBox,
      renderer,
      matrix,
      state,
      valueColWidth,
      sectionOf
    );
    refreshFooter(hintA, hintB, status, renderer, state);
    refreshPrompt(promptBox, promptBody, promptHint, renderer, matrix, state);
    refreshHelp(helpBox, renderer, state);
    refreshFilter(filterBox, filterField, filterStatus, matrix, state);
    dimOverlay.visible =
      state.helpOpen || state.mode === 'prompt' || state.mode === 'filter';
  };

  // Coalesce burst-y refreshes (held arrow keys, fast filter typing) into
  // one render per microtask flush. The full refreshNow rebuilds every
  // matrix row, which is expensive when called for every keystroke; with
  // batching, holding an arrow key spends most of the time in opentui's
  // own redraw loop instead of in our re-render.
  let refreshScheduled = false;
  const refresh = () => {
    if (refreshScheduled) return;
    refreshScheduled = true;
    queueMicrotask(() => {
      refreshScheduled = false;
      refreshNow();
    });
  };

  recomputeVisibleKeys();
  refreshNow();

  // --- Interaction ---
  return new Promise<void>((resolve) => {
    const cleanup = () => {
      renderer._internalKeyInput.offInternal('keypress', onKey);
      renderer.destroy?.();
      resolve();
    };

    const openPrompt = (prompt: Prompt, value = '', placeholder = '') => {
      void placeholder; // input is rendered as plain text now, no placeholder slot
      state.prompt = prompt;
      state.mode = 'prompt';
      state.message = null;
      state.promptInput = value;
      refresh();
    };

    const closePrompt = (msg: string | null = null) => {
      state.prompt = null;
      state.mode = 'browse';
      state.promptInput = '';
      state.message = msg;
      refresh();
    };

    const focusedKey = (): string | null => {
      const item = state.visibleItems[state.rowIdx];
      return item && item.kind === 'key' ? item.ref : null;
    };

    const startEdit = () => {
      const key = focusedKey();
      const file = matrix.files[state.colIdx];
      if (!key || !file) {
        state.message = 'Move onto a variable row to edit.';
        refresh();
        return;
      }
      // Edit works on missing cells too — on commit we either update the
      // existing entry or append a new one.
      const entry = findKvEntry(file, key);
      openPrompt({ kind: 'edit', key, file }, entry?.value ?? '', 'value');
    };

    const startAdd = () => {
      const file = matrix.files[state.colIdx];
      if (!file) return;
      openPrompt({ kind: 'add-key', file }, '', 'NEW_KEY');
    };

    const startNewFile = () => {
      openPrompt({ kind: 'new-file' }, '', '.env.local');
    };

    const startDelete = () => {
      const key = focusedKey();
      const file = matrix.files[state.colIdx];
      if (!key || !file) {
        state.message = 'Move onto a variable row to delete.';
        refresh();
        return;
      }
      const entry = findKvEntry(file, key);
      if (!entry) {
        state.message = `${key} is not present in ${basename(file.path)}.`;
        refresh();
        return;
      }
      const idx = file.entries.indexOf(entry);
      if (idx >= 0) {
        pushUndo({ kind: 'delete-kv', file, entry, idx });
        file.entries.splice(idx, 1);
      }
      state.dirty.add(file);
      markModified(key, file);
      rebuildMatrix();
      state.message = `Deleted ${key} from ${basename(file.path)}. Ctrl-S to save.`;
      refresh();
    };

    const toggleEnabled = () => {
      const file = allFiles[state.sidebarIdx];
      if (!file) return;
      if (state.enabled.has(file)) {
        if (state.enabled.size === 1) {
          state.message = 'At least one file must stay enabled.';
          refresh();
          return;
        }
        state.enabled.delete(file);
        state.message = `Hidden ${basename(file.path)} from the matrix.`;
      } else {
        state.enabled.add(file);
        state.message = `Showing ${basename(file.path)} in the matrix.`;
      }
      rebuildMatrix();
      refresh();
    };

    const setBase = () => {
      const file = allFiles[state.sidebarIdx];
      if (!file) return;
      if (file === currentBase) {
        state.message = `${basename(file.path)} is already the base.`;
        refresh();
        return;
      }
      const wasDisabled = !state.enabled.has(file);
      if (wasDisabled) state.enabled.add(file);
      currentBase = file;
      rebuildMatrix();
      state.message = wasDisabled
        ? `${basename(file.path)} is now the base (re-enabled).`
        : `${basename(file.path)} is now the base.`;
      refresh();
    };

    const applyToAllFiles = (key: string, value: string): number => {
      // Set key=value in every enabled file. Used by '=' in the matrix and
      // Ctrl-A from the edit prompt. Each per-file mutation is undone
      // individually (one Ctrl-Z per file) — not perfect but predictable.
      let touched = 0;
      for (const file of matrix.files) {
        const existing = findKvEntry(file, key);
        if (existing) {
          if (existing.value === value) continue;
          pushUndo({
            kind: 'edit',
            file,
            entry: existing,
            prevValue: existing.value,
            prevRaw: existing.raw
          });
          existing.value = value;
          rebuildKvLine(existing);
        } else {
          const added = appendKv(file, key, value);
          pushUndo({ kind: 'add-kv', file, entry: added });
        }
        state.dirty.add(file);
        markModified(key, file);
        touched++;
      }
      return touched;
    };

    const syncToAll = () => {
      const key = focusedKey();
      const file = matrix.files[state.colIdx];
      if (!key || !file) {
        state.message = 'Move onto a variable row to sync.';
        refresh();
        return;
      }
      const entry = findKvEntry(file, key);
      if (!entry) {
        state.message = `${key} has no value in ${basename(file.path)} to sync.`;
        refresh();
        return;
      }
      const touched = applyToAllFiles(key, entry.value);
      rebuildMatrix();
      state.message =
        touched > 0
          ? `Synced ${key} to ${touched} file(s). Ctrl-S to save.`
          : `${key} is already in sync.`;
      refresh();
    };

    const undo = () => {
      const last = state.undo.pop();
      if (!last) {
        state.message = 'Nothing to undo.';
        refresh();
        return;
      }
      switch (last.kind) {
        case 'edit':
          last.entry.value = last.prevValue;
          last.entry.raw = last.prevRaw;
          state.dirty.add(last.file);
          state.message = `Undid edit on ${last.entry.key} in ${basename(last.file.path)}.`;
          break;
        case 'add-kv': {
          const i = last.file.entries.indexOf(last.entry);
          if (i >= 0) last.file.entries.splice(i, 1);
          state.dirty.add(last.file);
          state.message = `Undid add of ${last.entry.key} in ${basename(last.file.path)}.`;
          break;
        }
        case 'delete-kv':
          last.file.entries.splice(last.idx, 0, last.entry);
          state.dirty.add(last.file);
          state.message = `Undid delete of ${last.entry.key} in ${basename(last.file.path)}.`;
          break;
      }
      rebuildMatrix();
      refresh();
    };

    const commitPrompt = () => {
      if (!state.prompt) return;
      const p = state.prompt;
      const raw = state.promptInput;

      if (p.kind === 'edit') {
        const existing = findKvEntry(p.file, p.key);
        if (existing) {
          pushUndo({
            kind: 'edit',
            file: p.file,
            entry: existing,
            prevValue: existing.value,
            prevRaw: existing.raw
          });
          existing.value = raw;
          rebuildKvLine(existing);
          state.dirty.add(p.file);
          markModified(p.key, p.file);
          rebuildMatrix();
          closePrompt(
            `Edited ${p.key} in ${basename(p.file.path)}. Ctrl-S to save.`
          );
        } else {
          // Missing cell: add the key with the typed value.
          const added = appendKv(p.file, p.key, raw);
          pushUndo({ kind: 'add-kv', file: p.file, entry: added });
          state.dirty.add(p.file);
          markModified(p.key, p.file);
          rebuildMatrix();
          closePrompt(
            `Added ${p.key} to ${basename(p.file.path)}. Ctrl-S to save.`
          );
        }
        return;
      }

      if (p.kind === 'add-key') {
        const key = raw.trim();
        if (!KEY_RE.test(key)) {
          state.message = `Invalid key "${key}". Must match ${KEY_RE.source}.`;
          refresh();
          return;
        }
        if (findKvEntry(p.file, key)) {
          state.message = `${key} already exists in ${basename(p.file.path)}. Use edit instead.`;
          refresh();
          return;
        }
        openPrompt({ kind: 'add-value', key, file: p.file }, '', 'value');
        return;
      }

      if (p.kind === 'add-value') {
        const added = appendKv(p.file, p.key, raw);
        pushUndo({ kind: 'add-kv', file: p.file, entry: added });
        state.dirty.add(p.file);
        markModified(p.key, p.file);
        rebuildMatrix();
        focusKey(p.key);
        state.colIdx = matrix.files.indexOf(p.file);
        closePrompt(
          `Added ${p.key} to ${basename(p.file.path)}. Ctrl-S to save.`
        );
        return;
      }

      if (p.kind === 'new-file') {
        const name = raw.trim();
        if (!isValidEnvFileName(name)) {
          state.message =
            name.length === 0
              ? 'Filename cannot be empty.'
              : !name.startsWith('.env')
                ? `Filename must start with ".env" (got "${name}").`
                : `"${name}" is not a valid env filename.`;
          refresh();
          return;
        }
        const newPath = join(dirname(currentBase.path), name);
        if (allFiles.some((f) => f.path === newPath)) {
          state.message = `${name} already exists.`;
          refresh();
          return;
        }
        const newFile = createEmptyEnvFile(newPath);
        allFiles.push(newFile);
        state.enabled.add(newFile);
        state.dirty.add(newFile);
        rebuildMatrix();
        state.colIdx = matrix.files.indexOf(newFile);
        closePrompt(`Created ${name}. Ctrl-S to write to disk.`);
        return;
      }
    };

    const cancelPrompt = () => {
      closePrompt('Cancelled.');
    };

    const saveDirty = async () => {
      if (state.dirty.size === 0) {
        state.message = 'Nothing to save.';
        refresh();
        return;
      }
      const count = state.dirty.size;
      const errors: string[] = [];
      for (const file of state.dirty) {
        try {
          await writeFile(file.path, serializeEnv(file), 'utf8');
        } catch (err) {
          errors.push(
            `${basename(file.path)}: ${(err as Error).message ?? String(err)}`
          );
        }
      }
      if (errors.length === 0) {
        state.dirty.clear();
        state.modified.clear();
        state.message = `Saved ${count} file${count === 1 ? '' : 's'}.`;
      } else {
        state.message = `Save failed: ${errors.join('; ')}`;
      }
      refresh();
    };

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
          state.colIdx = Math.min(matrix.files.length - 1, state.colIdx + 1);
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
