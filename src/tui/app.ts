import {
  BoxRenderable,
  type CliRenderer,
  createCliRenderer,
  InputRenderable,
  RGBA,
  ScrollBoxRenderable,
  TextRenderable
} from '@opentui/core';
import { writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'pathe';
import { isSecretKey, maskValue } from '../core/mask.ts';
import { buildMatrix, type CellState, type Matrix } from '../core/matrix.ts';
import { rebuildKvLine, serializeEnv } from '../core/serialize.ts';
import type { EnvFile, KvEntry } from '../core/types.ts';

type Mode = 'browse' | 'filter' | 'prompt';

type Prompt =
  | { kind: 'edit'; key: string; file: EnvFile }
  | { kind: 'add-key'; file: EnvFile }
  | { kind: 'add-value'; key: string; file: EnvFile }
  | { kind: 'new-file' };

type Grouping = 'banner' | 'prefix';

type UndoEntry =
  | {
      kind: 'edit';
      file: EnvFile;
      entry: KvEntry;
      prevValue: string;
      prevRaw: string;
    }
  | { kind: 'add-kv'; file: EnvFile; entry: KvEntry }
  | { kind: 'delete-kv'; file: EnvFile; entry: KvEntry; idx: number };

const UNDO_LIMIT = 50;

type Pane = 'matrix' | 'sidebar';

type ItemKind = 'key' | 'divider';
interface MatrixItem {
  kind: ItemKind;
  // For 'key': the variable name; for 'divider': the section's lookup name
  // (or '__other__'). Holding the raw key/section here keeps focus stable
  // across rebuilds.
  ref: string;
}

interface State {
  mode: Mode;
  filter: string;
  rowIdx: number;
  colIdx: number;
  prompt: Prompt | null;
  dirty: Set<EnvFile>;
  visibleKeys: string[]; // kept for callers that just want the keys
  visibleItems: MatrixItem[];
  message: string | null;
  driftOnly: boolean;
  confirmQuit: boolean;
  grouping: Grouping;
  helpOpen: boolean;
  undo: UndoEntry[];
  pane: Pane;
  sidebarIdx: number;
  enabled: Set<EnvFile>;
  showSecrets: boolean;
  collapsed: Set<string>;
}

const COLORS = {
  fg: RGBA.fromHex('#cccccc'),
  fgDim: RGBA.fromHex('#666666'),
  fgHeader: RGBA.fromHex('#ffffff'),
  // Base file accent — blue/purple so it doesn't collide with the drift-
  // yellow indicator that is also used everywhere.
  fgBase: RGBA.fromHex('#82aaff'),
  fgDirty: RGBA.fromHex('#ffd866'),
  fgSection: RGBA.fromHex('#82aaff'),
  differs: RGBA.fromHex('#ffd866'),
  missing: RGBA.fromHex('#ff6b6b'),
  extra: RGBA.fromHex('#c792ea'),
  placeholder: RGBA.fromHex('#ffa05c'),
  focusBg: RGBA.fromHex('#3a3f4b')
};

const PLACEHOLDER_RE =
  /^(todo|fixme|changeme|placeholder|tbd|x{3,}|your[_-]?(secret|key|token|password|api[_-]?key)(_here)?|replace[_-]?me)$/i;

function isPlaceholderValue(value: string): boolean {
  const v = value.trim();
  if (v.length === 0) return false;
  return PLACEHOLDER_RE.test(v);
}

const KEY_COL_WIDTH = 22;
const VALUE_COL_MIN = 18;
const SIDEBAR_WIDTH = 30;
const ROW_GAP = 0;
const CELL_PAD_X = 1;
const KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

type HelpLine =
  | { kind: 'header'; text: string }
  | { kind: 'entry'; text: string }
  | { kind: 'legend'; symbol: string; color: RGBA; description: string }
  | { kind: 'blank' };

function buildHelpLines(): HelpLine[] {
  return [
    { kind: 'header', text: 'Panes' },
    {
      kind: 'entry',
      text: '  Tab               Switch matrix ↔ files sidebar'
    },
    {
      kind: 'entry',
      text: '  ← (leftmost col)  Hop from matrix into the sidebar'
    },
    { kind: 'blank' },
    { kind: 'header', text: 'Matrix navigation' },
    { kind: 'entry', text: '  ↑ ↓ ← →           Move focused cell' },
    { kind: 'entry', text: '  Mouse wheel       Scroll (both axes)' },
    { kind: 'blank' },
    { kind: 'header', text: 'Files sidebar' },
    { kind: 'entry', text: '  ↑ ↓               Move selection' },
    { kind: 'entry', text: '  Space             Enable / disable file' },
    { kind: 'entry', text: '  b                 Make selected file the base' },
    { kind: 'entry', text: '  Tab / →           Back to matrix' },
    { kind: 'blank' },
    { kind: 'header', text: 'Editing' },
    { kind: 'entry', text: '  e / Enter         Edit focused cell value' },
    { kind: 'entry', text: '  a                 Add a new variable here' },
    {
      kind: 'entry',
      text: '  d                 Delete the variable from this file'
    },
    { kind: 'entry', text: '  n                 Create a new .env* file' },
    {
      kind: 'entry',
      text: '  =                 Sync focused value to every file'
    },
    {
      kind: 'entry',
      text: '  Ctrl-A (in edit)  Apply typed value to every file'
    },
    { kind: 'entry', text: '  Ctrl-Z            Undo last edit/add/delete' },
    { kind: 'entry', text: '  Ctrl-S            Write all dirty files' },
    {
      kind: 'entry',
      text: '  c                 Collapse / expand focused section'
    },
    {
      kind: 'entry',
      text: '  Shift-C           Expand every collapsed section'
    },
    { kind: 'blank' },
    { kind: 'header', text: 'View' },
    { kind: 'entry', text: '  /                 Filter keys' },
    { kind: 'entry', text: '  v                 All keys ↔ drift-only' },
    { kind: 'entry', text: '  g                 Group by prefix ↔ banner' },
    { kind: 'entry', text: '  Ctrl-T            Show / mask secret values' },
    { kind: 'blank' },
    { kind: 'header', text: 'Help & exit' },
    { kind: 'entry', text: '  ? / ß             Toggle this overlay' },
    { kind: 'entry', text: '  q                 Quit (twice if dirty)' },
    { kind: 'entry', text: '  Ctrl-C            Force quit' },
    { kind: 'blank' },
    { kind: 'header', text: 'Cell icons' },
    {
      kind: 'legend',
      symbol: '≠ value',
      color: RGBA.fromHex('#ffd866'),
      description: 'value differs from base'
    },
    {
      kind: 'legend',
      symbol: '✗ missing',
      color: RGBA.fromHex('#ff6b6b'),
      description: 'this file has no value for the key'
    },
    {
      kind: 'legend',
      symbol: '★ value',
      color: RGBA.fromHex('#c792ea'),
      description: 'key is not in the base'
    },
    {
      kind: 'legend',
      symbol: '•••• (N)',
      color: RGBA.fromHex('#cccccc'),
      description: 'secret-suspect value masked by length'
    },
    {
      kind: 'legend',
      symbol: '⚠ TODO',
      color: RGBA.fromHex('#ffa05c'),
      description: 'placeholder value (TODO, CHANGEME, xxx, …)'
    }
  ];
}

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
    collapsed: new Set()
  };

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

  const filterInput = new InputRenderable(renderer, {
    id: 'filter-input',
    placeholder: 'Filter keys…',
    width: 40
  });
  footer.add(filterInput);
  // Subscribe directly to the input — the global keypress handler doesn't
  // see chars consumed by the focused Input, so we mirror the value via
  // the Input's own events instead. Read .value directly so we don't depend
  // on whichever payload opentui happens to pass with the event.
  const syncFilterFromInput = () => {
    if (state.mode !== 'filter') return;
    const value = filterInput.value;
    if (state.filter === value) return;
    state.filter = value;
    recomputeVisibleKeys();
    refresh();
  };
  filterInput.on('input', syncFilterFromInput);
  filterInput.on('change', syncFilterFromInput);

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
  const promptInput = new InputRenderable(renderer, {
    id: 'prompt-input',
    placeholder: ''
  });
  const promptHint = new TextRenderable(renderer, {
    id: 'prompt-hint',
    content:
      'Enter · confirm    Ctrl-A · apply to all files    ' +
      'Ctrl-T · show/mask secrets    Esc · cancel',
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
  const helpBox = new BoxRenderable(renderer, {
    id: 'help-overlay',
    position: 'absolute',
    top: 2,
    left: '8%',
    right: '8%',
    height: 'auto',
    zIndex: 100,
    border: true,
    borderStyle: 'rounded',
    title: ' Keybindings — press ? or Esc to close ',
    paddingX: 2,
    paddingY: 1,
    visible: false,
    backgroundColor: RGBA.fromHex('#1a1a1a'),
    flexDirection: 'row',
    columnGap: 3
  });
  const helpLeft = new BoxRenderable(renderer, {
    id: 'help-left',
    flexDirection: 'column',
    flexGrow: 1,
    flexBasis: 0
  });
  const helpRight = new BoxRenderable(renderer, {
    id: 'help-right',
    flexDirection: 'column',
    flexGrow: 1,
    flexBasis: 0
  });
  const helpLines = buildHelpLines();
  // Split at the first blank line after the half-way mark so columns break on
  // a group boundary, not mid-section.
  const half = Math.floor(helpLines.length / 2);
  let splitIdx = half;
  for (let i = half; i < helpLines.length; i++) {
    if (helpLines[i]?.kind === 'blank') {
      splitIdx = i + 1;
      break;
    }
  }
  helpLines.slice(0, splitIdx).forEach((line, i) => {
    helpLeft.add(buildHelpRow(renderer, `help-l-${i}`, line));
  });
  helpLines.slice(splitIdx).forEach((line, i) => {
    helpRight.add(buildHelpRow(renderer, `help-r-${i}`, line));
  });
  helpBox.add(helpLeft);
  helpBox.add(helpRight);
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

  const refresh = () => {
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
    refreshFooter(hintA, hintB, status, filterInput, renderer, state);
    refreshPrompt(promptBox, promptBody, promptInput, renderer, matrix, state);
    helpBox.visible = state.helpOpen;
    dimOverlay.visible = state.helpOpen || state.mode === 'prompt';
  };

  recomputeVisibleKeys();
  refresh();

  // --- Interaction ---
  return new Promise<void>((resolve) => {
    const cleanup = () => {
      renderer.keyInput.off('keypress', onKey);
      renderer.destroy?.();
      resolve();
    };

    const openPrompt = (prompt: Prompt, value = '', placeholder = '') => {
      state.prompt = prompt;
      state.mode = 'prompt';
      state.message = null;
      promptInput.placeholder = placeholder;
      promptInput.value = value;
      // Make the modal visible first so focus() targets a rendered input.
      refresh();
      promptInput.focus();
    };

    const closePrompt = (msg: string | null = null) => {
      promptInput.blur();
      promptInput.value = '';
      state.prompt = null;
      state.mode = 'browse';
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
      const raw = promptInput.value;

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
          rebuildMatrix();
          closePrompt(
            `Edited ${p.key} in ${basename(p.file.path)}. Ctrl-S to save.`
          );
        } else {
          // Missing cell: add the key with the typed value.
          const added = appendKv(p.file, p.key, raw);
          pushUndo({ kind: 'add-kv', file: p.file, entry: added });
          state.dirty.add(p.file);
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
          state.message = `"${name}" is not a valid .env* filename.`;
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
        if (key.name === 'escape') cancelPrompt();
        else if (key.name === 'return') commitPrompt();
        else if (key.ctrl && key.name === 't') {
          state.showSecrets = !state.showSecrets;
          refresh();
        } else if (key.ctrl && key.name === 'a' && state.prompt) {
          // Apply current input value to *every* file (not just the focused
          // one). Only sensible during edit / add-value prompts where the
          // input represents a value.
          const p = state.prompt;
          if (p.kind === 'edit' || p.kind === 'add-value') {
            const touched = applyToAllFiles(p.key, promptInput.value);
            rebuildMatrix();
            closePrompt(
              touched > 0
                ? `Set ${p.key} in ${touched} file(s). Ctrl-S to save.`
                : `${p.key} already had that value everywhere.`
            );
          }
        }
        return;
      }

      if (state.mode === 'filter') {
        if (key.name === 'escape') {
          filterInput.value = '';
          state.filter = '';
          state.mode = 'browse';
          filterInput.blur();
          recomputeVisibleKeys();
          refresh();
          return;
        }
        if (key.name === 'return') {
          state.mode = 'browse';
          filterInput.blur();
          refresh();
          return;
        }
        // All other keys are consumed by the focused InputRenderable; the
        // 'input' subscription mirrors the value into state.filter.
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
        case 'equal':
          return syncToAll();
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
        // refresh first so the input is visible, then focus it. Focus on a
        // hidden renderable is a no-op in opentui — was the cause of "filter
        // never accepts keystrokes".
        refresh();
        filterInput.focus();
        return;
      }

      if (key.sequence === '?' || key.sequence === 'ß') {
        state.helpOpen = true;
        refresh();
      }
    };

    renderer.keyInput.on('keypress', onKey);
    renderer.on('resize', refresh);
  });
}

// --- Refreshers ---

function refreshSidebar(
  sidebar: BoxRenderable,
  renderer: CliRenderer,
  matrix: Matrix,
  allFiles: EnvFile[],
  state: State
): void {
  const total = allFiles.length;
  const enabled = state.enabled.size;
  sidebar.title =
    state.pane === 'sidebar'
      ? ` Files ${enabled}/${total} • focused `
      : ` Files ${enabled}/${total} `;
  removeAllChildren(sidebar);
  for (let i = 0; i < allFiles.length; i++) {
    const file = allFiles[i]!;
    const isBase = file === matrix.base;
    const isDirty = state.dirty.has(file);
    const isEnabled = state.enabled.has(file);
    const matrixIdx = matrix.files.indexOf(file);
    const isFocusCol = isEnabled && matrixIdx === state.colIdx;
    const isPaneFocus = state.pane === 'sidebar' && i === state.sidebarIdx;
    const nameFg = !isEnabled
      ? COLORS.fgDim
      : isBase
        ? COLORS.fgBase
        : COLORS.fg;

    const row = new BoxRenderable(renderer, {
      id: `file-${file.path}`,
      flexDirection: 'row',
      height: 1,
      flexShrink: 0,
      ...(isPaneFocus ? { backgroundColor: COLORS.focusBg } : {})
    });
    const span = (id: string, text: string, fg: RGBA) =>
      new TextRenderable(renderer, {
        id: `${row.id}-${id}`,
        content: text,
        fg,
        height: 1,
        wrapMode: 'none'
      });
    row.add(span('focus', `${isPaneFocus ? '▶' : ' '} `, COLORS.fg));
    row.add(
      span(
        'dirty',
        `${isDirty ? '●' : ' '} `,
        isDirty ? COLORS.fgDirty : COLORS.fgDim
      )
    );
    row.add(
      span(
        'base',
        `${isBase ? '★' : ' '} `,
        isBase ? COLORS.fgBase : COLORS.fgDim
      )
    );
    row.add(span('col', `${isFocusCol ? '▸' : ' '} `, COLORS.fgDim));
    row.add(span('enabled', `${isEnabled ? '✓' : '☐'} `, COLORS.fgDim));
    row.add(span('name', basename(file.path), nameFg));
    sidebar.add(row);
  }
}

function refreshMatrix(
  matrixBox: BoxRenderable,
  headerHost: BoxRenderable,
  scrollBox: ScrollBoxRenderable,
  renderer: CliRenderer,
  matrix: Matrix,
  state: State,
  valueColWidth: number,
  sectionOf: (key: string) => string | undefined
): void {
  matrixBox.title = matrixTitle(matrix, state);
  removeAllChildren(headerHost);
  removeAllChildren(scrollBox.content);

  headerHost.add(
    buildRow(renderer, 'header', [
      { text: 'KEY', fg: COLORS.fgHeader, width: KEY_COL_WIDTH },
      ...matrix.files.map((f) => ({
        text: basename(f.path),
        fg: COLORS.fgHeader,
        width: valueColWidth
      }))
    ])
  );

  // Walk every key (including those hidden by a collapsed section) so we can
  // render section dividers for collapsed groups too. Within an expanded
  // group we render the cell rows; within a collapsed one we render nothing
  // beyond the header.
  const totalWidth = KEY_COL_WIDTH + valueColWidth * matrix.files.length;
  const sectionStats = sectionMetadata(matrix, sectionOf, state);

  for (let r = 0; r < state.visibleItems.length; r++) {
    const item = state.visibleItems[r]!;
    if (item.kind === 'divider') {
      const sectionKey = item.ref;
      const sectionName = sectionKey === '__other__' ? undefined : sectionKey;
      const meta = sectionStats.get(sectionKey) ?? {
        drift: 0,
        missing: 0,
        total: 0
      };
      const focused = state.mode === 'browse' && r === state.rowIdx;
      scrollBox.content.add(
        buildSectionDivider(renderer, `row-${r}`, sectionName, totalWidth, {
          ...meta,
          collapsed: state.collapsed.has(sectionKey),
          focused
        })
      );
      continue;
    }
    const key = item.ref;
    const secret = isSecretKey(key) && !state.showSecrets;
    const cells: CellSpec[] = [
      { text: key, fg: COLORS.fg, width: KEY_COL_WIDTH }
    ];
    for (let c = 0; c < matrix.files.length; c++) {
      const file = matrix.files[c]!;
      const cell = matrix.cell(key, file);
      const focused =
        state.mode === 'browse' && r === state.rowIdx && c === state.colIdx;
      cells.push(buildValueCell(cell, secret, valueColWidth, focused));
    }
    scrollBox.content.add(buildRow(renderer, `row-${r}`, cells));
  }

  // Keep the focused row visible when navigating up/down past the viewport.
  if (state.mode === 'browse' && state.visibleItems.length > 0) {
    try {
      scrollBox.scrollChildIntoView(`row-${state.rowIdx}`);
    } catch {
      // scrollChildIntoView throws if the row id isn't laid out yet; the
      // next refresh after layout will succeed.
    }
  }
}

interface FooterSeg {
  text: string;
  fg: RGBA;
}

function bindings(specs: { key: string; label: string }[]): FooterSeg[] {
  // "[key] label" with the brackets dim and the key + label in normal fg.
  // Segments separated by dim " · ".
  const out: FooterSeg[] = [];
  specs.forEach((spec, i) => {
    if (i > 0) out.push({ text: ' · ', fg: COLORS.fgDim });
    out.push({ text: '[', fg: COLORS.fgDim });
    out.push({ text: spec.key, fg: COLORS.fg });
    out.push({ text: '] ', fg: COLORS.fgDim });
    out.push({ text: spec.label, fg: COLORS.fg });
  });
  return out;
}

function renderHintBox(
  box: BoxRenderable,
  renderer: CliRenderer,
  segs: FooterSeg[]
): void {
  removeAllChildren(box);
  segs.forEach((seg, i) => {
    box.add(
      new TextRenderable(renderer, {
        id: `${box.id}-seg-${i}`,
        content: seg.text,
        fg: seg.fg,
        height: 1,
        wrapMode: 'none'
      })
    );
  });
}

function refreshFooter(
  hintA: BoxRenderable,
  hintB: BoxRenderable,
  status: TextRenderable,
  filterInput: InputRenderable,
  renderer: CliRenderer,
  state: State
): void {
  const dirty = state.dirty.size;
  const dirtyTail: FooterSeg[] =
    dirty > 0
      ? [
          { text: '   ', fg: COLORS.fgDim },
          { text: '●', fg: COLORS.differs },
          { text: ` ${dirty} unsaved`, fg: COLORS.fg }
        ]
      : [];

  if (state.mode === 'filter') {
    renderHintBox(hintA, renderer, [
      ...bindings([
        { key: 'Enter', label: 'keep filter' },
        { key: 'Esc', label: 'clear' }
      ]),
      ...dirtyTail
    ]);
    renderHintBox(hintB, renderer, [{ text: ' Filter:', fg: COLORS.fgDim }]);
  } else if (state.mode === 'prompt') {
    renderHintBox(hintA, renderer, []);
    renderHintBox(hintB, renderer, []);
  } else if (state.pane === 'sidebar') {
    renderHintBox(hintA, renderer, [
      ...bindings([
        { key: '↑↓', label: 'move' },
        { key: 'Space', label: 'toggle' },
        { key: 'b', label: 'set base' },
        { key: 'Tab/→', label: 'matrix' },
        { key: '^S', label: 'save' },
        { key: '?', label: 'help' },
        { key: 'q', label: 'quit' }
      ]),
      ...dirtyTail
    ]);
    renderHintBox(hintB, renderer, [{ text: 'Files pane', fg: COLORS.fgDim }]);
  } else {
    renderHintBox(hintA, renderer, [
      ...bindings([
        { key: '↑↓←→', label: 'move' },
        { key: 'Tab', label: 'files' },
        { key: 'e', label: 'edit' },
        { key: 'a', label: 'add var' },
        { key: 'd', label: 'del var' },
        { key: 'n', label: 'new file' },
        { key: '=', label: 'sync to all' },
        { key: 'c', label: 'collapse' },
        { key: '^T', label: 'secrets' },
        { key: '^Z', label: 'undo' },
        { key: '^S', label: 'save' },
        { key: '/', label: 'filter' },
        { key: '?/ß', label: 'help' },
        { key: 'q', label: 'quit' }
      ]),
      ...dirtyTail
    ]);
    renderHintBox(hintB, renderer, [
      { text: 'view: ', fg: COLORS.fgDim },
      { text: state.driftOnly ? 'drift' : 'all', fg: COLORS.fg },
      { text: '  ·  group: ', fg: COLORS.fgDim },
      { text: state.grouping, fg: COLORS.fg },
      { text: '  ·  secrets: ', fg: COLORS.fgDim },
      { text: state.showSecrets ? 'shown' : 'masked', fg: COLORS.fg }
    ]);
  }
  filterInput.visible = state.mode === 'filter';
  status.content = state.message ?? '';
}

function refreshPrompt(
  promptBox: BoxRenderable,
  promptBody: BoxRenderable,
  promptInput: InputRenderable,
  renderer: CliRenderer,
  matrix: Matrix,
  state: State
): void {
  const open = state.mode === 'prompt' && state.prompt !== null;
  promptBox.visible = open;
  promptInput.visible = open;
  if (!open || !state.prompt) return;

  promptBox.title = promptLabelText(state.prompt);

  // Body layout: full-width input on top, then a context table of every file
  // and its current value (read-only). For add-key / new-file there's no
  // context to show — just the input.
  removeAllChildren(promptBody);
  const p = state.prompt;
  promptBody.add(promptInput);

  if (p.kind === 'edit' || p.kind === 'add-value') {
    const secret = isSecretKey(p.key) && !state.showSecrets;
    const nameWidth = Math.min(
      26,
      Math.max(...matrix.files.map((f) => basename(f.path).length + 2))
    );

    promptBody.add(
      new TextRenderable(renderer, {
        id: 'prompt-table-header',
        content: 'Current values',
        fg: COLORS.fgSection,
        wrapMode: 'none',
        height: 1,
        marginTop: 1
      })
    );

    for (const file of matrix.files) {
      const isTarget = file === p.file;
      const row = new BoxRenderable(renderer, {
        id: `prompt-row-${file.path}`,
        flexDirection: 'row',
        height: 1,
        flexShrink: 0
      });
      row.add(
        new TextRenderable(renderer, {
          id: `prompt-row-${file.path}-name`,
          content: `${isTarget ? '▸' : ' '} ${basename(file.path)}`.padEnd(
            nameWidth
          ),
          fg: isTarget ? COLORS.fgBase : COLORS.fgDim,
          height: 1,
          wrapMode: 'none'
        })
      );
      const entry = findKvEntry(file, p.key);
      const current = entry ? formatValue(entry.value, secret) : '✗ missing';
      row.add(
        new TextRenderable(renderer, {
          id: `prompt-row-${file.path}-value`,
          content: current,
          fg: !entry ? COLORS.missing : isTarget ? COLORS.fg : COLORS.fgDim,
          height: 1,
          wrapMode: 'none'
        })
      );
      promptBody.add(row);
    }
  }
}

function promptLabelText(p: Prompt): string {
  switch (p.kind) {
    case 'edit':
      return ` Edit ${p.key} in ${basename(p.file.path)}:`;
    case 'add-key':
      return ` Add new key to ${basename(p.file.path)}:`;
    case 'add-value':
      return ` Value for ${p.key} in ${basename(p.file.path)}:`;
    case 'new-file':
      return ' New env file name (e.g. .env.local):';
  }
}

// --- Helpers ---

function prefixSection(key: string): string | undefined {
  const idx = key.indexOf('_');
  if (idx <= 0) return undefined;
  return key.slice(0, idx);
}

/**
 * Sort by first-underscore-prefix while preserving the relative order each
 * prefix first appeared in. Keys without an underscore land in a trailing
 * "Other" group keeping their authored order.
 */
function groupByPrefix(keys: string[]): string[] {
  const groups = new Map<string, string[]>();
  const order: string[] = [];
  const OTHER = '__other__';
  for (const k of keys) {
    const p = prefixSection(k) ?? OTHER;
    let bucket = groups.get(p);
    if (!bucket) {
      bucket = [];
      groups.set(p, bucket);
      if (p !== OTHER) order.push(p);
    }
    bucket.push(k);
  }
  if (groups.has(OTHER)) order.push(OTHER);
  return order.flatMap((p) => groups.get(p)!);
}

/**
 * Move row focus by `delta` while skipping section dividers that are not
 * collapsed. The user only needs to land on a divider when its section is
 * folded — that's the only context in which 'c' on the divider does work
 * the focused-key path doesn't already cover.
 */
function stepRow(state: State, delta: number): number {
  const items = state.visibleItems;
  if (items.length === 0) return 0;
  const canFocus = (i: number) => {
    const it = items[i];
    if (!it) return false;
    if (it.kind === 'key') return true;
    // divider — focusable only when collapsed
    return state.collapsed.has(it.ref);
  };
  let i = state.rowIdx + delta;
  while (i >= 0 && i < items.length) {
    if (canFocus(i)) return i;
    i += delta;
  }
  // No focusable item further along — clamp to current.
  return state.rowIdx;
}

function orderedKeys(
  matrix: Matrix,
  state: State,
  sectionOf: (key: string) => string | undefined
): string[] {
  void sectionOf;
  const filtered = matrix.keys.filter((k) => {
    if (!matchesFilter(k, state.filter)) return false;
    if (state.driftOnly && !keyDrifts(matrix, k)) return false;
    return true;
  });
  return state.grouping === 'prefix' ? groupByPrefix(filtered) : filtered;
}

interface SectionStats {
  drift: number;
  missing: number;
  total: number;
}

function sectionMetadata(
  matrix: Matrix,
  sectionOf: (key: string) => string | undefined,
  state: State
): Map<string, SectionStats> {
  const out = new Map<string, SectionStats>();
  for (const key of orderedKeys(matrix, state, sectionOf)) {
    const k = sectionOf(key) ?? '__other__';
    const bucket = out.get(k) ?? { drift: 0, missing: 0, total: 0 };
    bucket.total += 1;
    let drifts = false;
    let missing = false;
    for (const file of matrix.files) {
      if (file === matrix.base) continue;
      const s = matrix.cell(key, file).state;
      if (s === 'missing') missing = true;
      if (s === 'differs' || s === 'missing' || s === 'extra') drifts = true;
    }
    if (drifts) bucket.drift += 1;
    if (missing) bucket.missing += 1;
    out.set(k, bucket);
  }
  return out;
}

function buildValueCell(
  cell: { state: CellState; value: string | undefined },
  secret: boolean,
  width: number,
  focused: boolean
): CellSpec {
  const bg = focused ? COLORS.focusBg : undefined;
  if (cell.state === 'missing') {
    return {
      text: 'missing',
      fg: COLORS.fgDim,
      width,
      bg,
      icon: { char: '✗', fg: COLORS.missing }
    };
  }
  const value = cell.value ?? '';
  if (value !== '' && isPlaceholderValue(value)) {
    return {
      text: value,
      fg: COLORS.fg,
      width,
      bg,
      icon: { char: '⚠', fg: COLORS.placeholder }
    };
  }
  // Empty value: render "(empty)" in dim so the cell isn't confused with a
  // missing one but the eye still glides past it.
  const isEmpty = value === '' && !secret;
  const displayText = isEmpty ? '(empty)' : formatValue(value, secret);
  const displayFg = isEmpty ? COLORS.fgDim : COLORS.fg;
  if (cell.state === 'differs') {
    return {
      text: displayText,
      fg: displayFg,
      width,
      bg,
      icon: { char: '≠', fg: COLORS.differs }
    };
  }
  if (cell.state === 'extra') {
    return {
      text: displayText,
      fg: displayFg,
      width,
      bg,
      icon: { char: '★', fg: COLORS.extra }
    };
  }
  // base / same — no icon.
  return { text: displayText, fg: displayFg, width, bg };
}

function keyDrifts(matrix: Matrix, key: string): boolean {
  for (const file of matrix.files) {
    if (file === matrix.base) continue;
    const s = matrix.cell(key, file).state;
    if (s === 'differs' || s === 'missing' || s === 'extra') return true;
  }
  return false;
}

function isValidEnvFileName(name: string): boolean {
  if (!name.startsWith('.env')) return false;
  if (name.includes('/') || name.includes('\\')) return false;
  if (name.endsWith('.swp') || name.endsWith('~') || name.endsWith('.bak'))
    return false;
  return true;
}

function createEmptyEnvFile(path: string): EnvFile {
  return {
    path,
    entries: [{ kind: 'comment', raw: `# ${basename(path)}` }],
    trailingNewline: true
  };
}

function appendKv(file: EnvFile, key: string, value: string): KvEntry {
  const entry: KvEntry = {
    kind: 'kv',
    key,
    rawValue: '',
    value,
    quoting: 'none',
    exportPrefix: false,
    inlineComment: '',
    raw: ''
  };
  rebuildKvLine(entry);
  file.entries.push(entry);
  // Round-trip semantics: serializeEnv joins with \n and appends a trailing
  // newline if trailingNewline is set. Push alone gives us "...\nKEY=val" when
  // trailingNewline=false, or "...\nKEY=val\n" when true. Either case is
  // sane; we make sure the file ends with a newline so editors don't complain.
  file.trailingNewline = true;
  return entry;
}

function buildHelpRow(
  renderer: CliRenderer,
  id: string,
  line: HelpLine
): BoxRenderable {
  const row = new BoxRenderable(renderer, {
    id,
    flexDirection: 'row',
    height: 1,
    flexShrink: 0
  });
  if (line.kind === 'header') {
    row.add(
      new TextRenderable(renderer, {
        id: `${id}-t`,
        content: line.text,
        fg: COLORS.fgSection,
        wrapMode: 'none',
        height: 1
      })
    );
  } else if (line.kind === 'entry') {
    row.add(
      new TextRenderable(renderer, {
        id: `${id}-t`,
        content: line.text,
        fg: COLORS.fg,
        wrapMode: 'none',
        height: 1
      })
    );
  } else if (line.kind === 'legend') {
    row.add(
      new TextRenderable(renderer, {
        id: `${id}-sym`,
        content: `  ${line.symbol.padEnd(12)}`,
        fg: line.color,
        wrapMode: 'none',
        height: 1
      })
    );
    row.add(
      new TextRenderable(renderer, {
        id: `${id}-desc`,
        content: line.description,
        fg: COLORS.fgDim,
        wrapMode: 'none',
        height: 1
      })
    );
  }
  return row;
}

function buildSectionDivider(
  renderer: CliRenderer,
  id: string,
  name: string | undefined,
  width: number,
  meta: SectionStats & { collapsed: boolean; focused?: boolean }
): BoxRenderable {
  // Multi-segment divider so colours can encode meaning:
  //   gray ───   blue ▾ Name   dim · stats   gray ───
  // Drift counts go yellow; if any key in the section is missing in any
  // non-base file we surface that explicitly in red ("✗ N missing"), even
  // when the section also has plain differs.
  const baseName = name ?? '(other)';
  const indicator = meta.collapsed ? '▸' : '▾';
  // Icons + numbers carry colour (red for missing, yellow for drift). Name
  // and descriptive words render in the normal foreground; the "/" and
  // trailing whitespace stay dim.
  type Seg = { text: string; fg: RGBA };
  const segs: Seg[] = [
    { text: ` ${indicator} `, fg: COLORS.fgDim },
    { text: baseName, fg: COLORS.fg },
    { text: '  ', fg: COLORS.fgDim }
  ];
  if (meta.missing > 0) {
    segs.push({ text: '✗ ', fg: COLORS.missing });
    segs.push({ text: `${meta.missing}`, fg: COLORS.missing });
    segs.push({ text: ' missing  ', fg: COLORS.fg });
  }
  if (meta.drift > 0) {
    segs.push({ text: '≠ ', fg: COLORS.differs });
    segs.push({ text: `${meta.drift}`, fg: COLORS.differs });
    segs.push({ text: '/', fg: COLORS.fgDim });
    segs.push({ text: `${meta.total}`, fg: COLORS.differs });
    segs.push({ text: ' drift  ', fg: COLORS.fg });
  }
  if (meta.missing === 0 && meta.drift === 0) {
    segs.push({ text: `${meta.total}`, fg: COLORS.fgDim });
    segs.push({ text: ' keys  ', fg: COLORS.fg });
  }
  segs.push({ text: ' ', fg: COLORS.fgDim });

  const labelLength = segs.reduce((sum, s) => sum + s.text.length, 0);
  const rule = '─';
  const visible = Math.max(0, width - 2);
  const beforeLen = Math.max(2, Math.floor((visible - labelLength) / 2));
  const afterLen = Math.max(0, visible - beforeLen - labelLength);

  const box = new BoxRenderable(renderer, {
    id,
    flexDirection: 'row',
    flexShrink: 0,
    height: 1,
    paddingX: 1,
    ...(meta.focused ? { backgroundColor: COLORS.focusBg } : {})
  });
  box.add(
    new TextRenderable(renderer, {
      id: `${id}-lead`,
      content: rule.repeat(beforeLen),
      fg: COLORS.fgDim,
      height: 1,
      wrapMode: 'none'
    })
  );
  segs.forEach((seg, i) => {
    box.add(
      new TextRenderable(renderer, {
        id: `${id}-seg-${i}`,
        content: seg.text,
        fg: seg.fg,
        height: 1,
        wrapMode: 'none'
      })
    );
  });
  box.add(
    new TextRenderable(renderer, {
      id: `${id}-trail`,
      content: rule.repeat(afterLen),
      fg: COLORS.fgDim,
      height: 1,
      wrapMode: 'none'
    })
  );
  return box;
}

interface CellSpec {
  text: string;
  fg: RGBA;
  width: number;
  bg?: RGBA;
  // Optional coloured prefix — rendered in its own Text span so only the
  // icon carries the state colour, the text stays neutral.
  icon?: { char: string; fg: RGBA };
}

function buildRow(
  renderer: CliRenderer,
  idPrefix: string,
  cells: CellSpec[]
): BoxRenderable {
  const row = new BoxRenderable(renderer, {
    id: idPrefix,
    flexDirection: 'row',
    flexShrink: 0,
    height: 1
  });
  cells.forEach((cell, i) => {
    const cellOpts: ConstructorParameters<typeof BoxRenderable>[1] = {
      id: `${idPrefix}-c${i}`,
      width: cell.width,
      height: 1,
      flexDirection: 'row',
      flexShrink: 0,
      paddingX: CELL_PAD_X
    };
    if (cell.bg) cellOpts.backgroundColor = cell.bg;
    const cellBox = new BoxRenderable(renderer, cellOpts);
    const innerWidth = Math.max(0, cell.width - CELL_PAD_X * 2);
    if (cell.icon) {
      const iconLen = cell.icon.char.length + 1; // " " separator
      cellBox.add(
        new TextRenderable(renderer, {
          id: `${idPrefix}-c${i}-icon`,
          content: `${cell.icon.char} `,
          fg: cell.icon.fg,
          height: 1,
          wrapMode: 'none'
        })
      );
      cellBox.add(
        new TextRenderable(renderer, {
          id: `${idPrefix}-c${i}-t`,
          content: truncate(cell.text, Math.max(0, innerWidth - iconLen)),
          fg: cell.fg,
          height: 1,
          wrapMode: 'none'
        })
      );
    } else {
      cellBox.add(
        new TextRenderable(renderer, {
          id: `${idPrefix}-c${i}-t`,
          content: truncate(cell.text, innerWidth),
          fg: cell.fg,
          height: 1,
          wrapMode: 'none'
        })
      );
    }
    row.add(cellBox);
  });
  return row;
}

function removeAllChildren(node: BoxRenderable): void {
  const ids = node.getChildren().map((c) => c.id);
  for (const id of ids) node.remove(id);
}

function matrixTitle(matrix: Matrix, state: State): string {
  const visible = state.visibleKeys.length;
  const total = matrix.keys.length;
  const parts: string[] = [`${total} keys`];
  if (state.driftOnly) parts.push(`drift ${visible}/${total}`);
  else if (state.filter && visible !== total) {
    parts.push(`"${state.filter}" ${visible}/${total}`);
  }
  return ` Matrix · ${parts.join(' · ')} `;
}

function formatValue(value: string | undefined, secret: boolean): string {
  if (value === undefined) return '';
  if (secret) return maskValue(value);
  return value;
}

function matchesFilter(key: string, filter: string): boolean {
  if (!filter) return true;
  return key.toLowerCase().includes(filter.toLowerCase());
}

function truncate(text: string, width: number): string {
  if (width <= 0) return '';
  if (text.length <= width) return text;
  if (width <= 1) return '…';
  return `${text.slice(0, width - 1)}…`;
}

function findKvEntry(file: EnvFile, key: string): KvEntry | undefined {
  for (const e of file.entries) {
    if (e.kind === 'kv' && e.key === key) return e;
  }
  return undefined;
}
