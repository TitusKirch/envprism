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

interface State {
  mode: Mode;
  filter: string;
  rowIdx: number;
  colIdx: number;
  prompt: Prompt | null;
  dirty: Set<EnvFile>;
  visibleKeys: string[];
  message: string | null;
  driftOnly: boolean;
  confirmQuit: boolean;
  grouping: Grouping;
  helpOpen: boolean;
  undo: UndoEntry[];
}

const COLORS = {
  fg: RGBA.fromHex('#cccccc'),
  fgDim: RGBA.fromHex('#666666'),
  fgHeader: RGBA.fromHex('#ffffff'),
  fgBase: RGBA.fromHex('#ffd866'),
  fgDirty: RGBA.fromHex('#56b6c2'),
  fgSection: RGBA.fromHex('#82aaff'),
  differs: RGBA.fromHex('#ffd866'),
  missing: RGBA.fromHex('#ff6b6b'),
  extra: RGBA.fromHex('#c792ea'),
  focusBg: RGBA.fromHex('#3a3f4b')
};

const KEY_COL_WIDTH = 22;
const VALUE_COL_MIN = 18;
const SIDEBAR_WIDTH = 30;
const ROW_GAP = 0;
const CELL_PAD_X = 1;
const KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

const HELP_TEXT = [
  'Navigation',
  '  ↑ ↓ ← →           Move focused cell',
  '  Mouse wheel       Scroll the matrix (both axes)',
  '',
  'Editing — operates on the focused (key, file) cell',
  '  e  /  Enter       Edit the cell value',
  '  a                 Add a new key to the focused file',
  '  d                 Delete the key from the focused file',
  '  n                 Create a new env file (sibling of the base)',
  '  Ctrl-Z            Undo last edit/add/delete',
  '  Ctrl-S            Write every dirty file to disk',
  '',
  'View',
  '  /                 Filter keys (Esc clears, Enter keeps)',
  '  v                 Toggle: show all keys ↔ only drifting keys',
  '  g                 Toggle: group by comment banner ↔ key prefix',
  '',
  'Help & exit',
  '  ?                 Toggle this overlay',
  '  q                 Quit (press twice if there are unsaved changes)',
  '  Ctrl-C            Force quit without confirmation',
  '',
  'Symbols in cells',
  '  ≠ value           Differs from base',
  '  ✗ missing         Key is in base but missing here',
  '  ★ value           Key is here but not in base',
  '  •••• (N)          Secret-suspect value masked by length'
].join('\n');

export async function runMatrixTui(initialMatrix: Matrix): Promise<void> {
  const renderer = await createCliRenderer({ useMouse: true });
  let matrix = initialMatrix;

  const state: State = {
    mode: 'browse',
    filter: '',
    rowIdx: 0,
    colIdx: 0,
    prompt: null,
    dirty: new Set(),
    visibleKeys: matrix.keys.slice(),
    message: null,
    driftOnly: false,
    confirmQuit: false,
    grouping: 'banner',
    helpOpen: false,
    undo: []
  };

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

  const hintA = new TextRenderable(renderer, {
    id: 'hint-a',
    content: '',
    wrapMode: 'none',
    height: 1
  });
  footer.add(hintA);

  const hintB = new TextRenderable(renderer, {
    id: 'hint-b',
    content: '',
    wrapMode: 'none',
    fg: COLORS.fgDim,
    height: 1
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

  const promptLabel = new TextRenderable(renderer, {
    id: 'prompt-label',
    content: '',
    wrapMode: 'none',
    height: 1
  });
  footer.add(promptLabel);

  const filterInput = new InputRenderable(renderer, {
    id: 'filter-input',
    placeholder: 'Filter keys…',
    width: 40
  });
  footer.add(filterInput);

  const promptInput = new InputRenderable(renderer, {
    id: 'prompt-input',
    placeholder: '',
    width: 60
  });
  footer.add(promptInput);

  // Floating help overlay. Hidden until '?' opens it.
  const helpBox = new BoxRenderable(renderer, {
    id: 'help-overlay',
    position: 'absolute',
    top: 2,
    left: 4,
    right: 4,
    bottom: 2,
    zIndex: 100,
    border: true,
    borderStyle: 'rounded',
    title: ' Keybindings ',
    paddingX: 2,
    paddingY: 1,
    visible: false,
    backgroundColor: RGBA.fromHex('#1a1a1a')
  });
  helpBox.add(
    new TextRenderable(renderer, {
      id: 'help-text',
      content: HELP_TEXT,
      fg: COLORS.fg
    })
  );
  renderer.root.add(helpBox);

  // --- State helpers ---
  const sectionOf = (key: string): string | undefined =>
    state.grouping === 'banner' ? matrix.sectionOf(key) : prefixSection(key);

  const recomputeVisibleKeys = () => {
    const filtered = matrix.keys.filter((k) => {
      if (!matchesFilter(k, state.filter)) return false;
      if (state.driftOnly && !keyDrifts(matrix, k)) return false;
      return true;
    });
    state.visibleKeys =
      state.grouping === 'prefix' ? groupByPrefix(filtered) : filtered;
    if (state.rowIdx >= state.visibleKeys.length) {
      state.rowIdx = Math.max(0, state.visibleKeys.length - 1);
    }
  };

  const rebuildMatrix = () => {
    matrix = buildMatrix(matrix.files, matrix.base);
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
    refreshSidebar(sidebar, renderer, matrix, state);
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
    refreshFooter(
      hintA,
      hintB,
      status,
      promptLabel,
      filterInput,
      promptInput,
      state
    );
    helpBox.visible = state.helpOpen;
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
      promptInput.focus();
      refresh();
    };

    const closePrompt = (msg: string | null = null) => {
      promptInput.value = '';
      promptInput.blur();
      state.prompt = null;
      state.mode = 'browse';
      state.message = msg;
      refresh();
    };

    const startEdit = () => {
      const key = state.visibleKeys[state.rowIdx];
      const file = matrix.files[state.colIdx];
      if (!key || !file) return;
      const entry = findKvEntry(file, key);
      if (!entry) {
        state.message = `Cannot edit "${key}" in ${basename(file.path)}: missing. Press 'a' to add.`;
        refresh();
        return;
      }
      openPrompt({ kind: 'edit', key, file }, entry.value, 'New value');
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
      const key = state.visibleKeys[state.rowIdx];
      const file = matrix.files[state.colIdx];
      if (!key || !file) return;
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
        const entry = findKvEntry(p.file, p.key);
        if (entry) {
          pushUndo({
            kind: 'edit',
            file: p.file,
            entry,
            prevValue: entry.value,
            prevRaw: entry.raw
          });
          entry.value = raw;
          rebuildKvLine(entry);
          state.dirty.add(p.file);
          rebuildMatrix();
          closePrompt(
            `Edited ${p.key} in ${basename(p.file.path)}. Ctrl-S to save.`
          );
        } else {
          closePrompt(`Lost the entry for ${p.key} — try again.`);
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
        const newPath = join(dirname(matrix.base.path), name);
        if (matrix.files.some((f) => f.path === newPath)) {
          state.message = `${name} already exists.`;
          refresh();
          return;
        }
        const newFile = createEmptyEnvFile(newPath);
        matrix.files.push(newFile);
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
      sequence?: string;
    }) => {
      if (state.helpOpen) {
        if (key.name === 'escape' || key.sequence === '?' || key.name === 'q') {
          state.helpOpen = false;
          refresh();
        }
        return;
      }

      if (state.mode === 'prompt') {
        if (key.name === 'escape') cancelPrompt();
        else if (key.name === 'return') commitPrompt();
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
        queueMicrotask(() => {
          if (state.filter !== filterInput.value) {
            state.filter = filterInput.value;
            recomputeVisibleKeys();
            refresh();
          }
        });
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

      switch (key.name) {
        case 'q':
          return tryQuit();
        case 'up':
          state.rowIdx = Math.max(0, state.rowIdx - 1);
          return refresh();
        case 'down':
          state.rowIdx = Math.min(
            Math.max(0, state.visibleKeys.length - 1),
            state.rowIdx + 1
          );
          return refresh();
        case 'left':
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
        case 'g': {
          const prevKey = state.visibleKeys[state.rowIdx];
          state.grouping = state.grouping === 'banner' ? 'prefix' : 'banner';
          recomputeVisibleKeys();
          if (prevKey) {
            const newIdx = state.visibleKeys.indexOf(prevKey);
            if (newIdx >= 0) state.rowIdx = newIdx;
          }
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
        filterInput.focus();
        refresh();
        return;
      }

      if (key.sequence === '?') {
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
  state: State
): void {
  sidebar.title = ` Files (${matrix.files.length}) `;
  removeAllChildren(sidebar);
  for (let i = 0; i < matrix.files.length; i++) {
    const file = matrix.files[i]!;
    const isBase = file === matrix.base;
    const isDirty = state.dirty.has(file);
    const isFocusCol = i === state.colIdx;
    const marker = `${isDirty ? '●' : ' '}${isBase ? '★' : ' '}${isFocusCol ? '▸' : ' '}`;
    sidebar.add(
      new TextRenderable(renderer, {
        id: `file-${file.path}`,
        content: `${marker} ${basename(file.path)}`,
        fg: isDirty ? COLORS.fgDirty : isBase ? COLORS.fgBase : COLORS.fg
      })
    );
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

  let lastSection: string | undefined;
  for (let r = 0; r < state.visibleKeys.length; r++) {
    const key = state.visibleKeys[r]!;
    const section = sectionOf(key);
    if (section !== lastSection) {
      const totalWidth = KEY_COL_WIDTH + valueColWidth * matrix.files.length;
      scrollBox.content.add(
        buildSectionDivider(renderer, `section-${r}`, section, totalWidth)
      );
      lastSection = section;
    }
    const secret = isSecretKey(key);
    const cells: { text: string; fg: RGBA; width: number; bg?: RGBA }[] = [
      { text: key, fg: COLORS.fg, width: KEY_COL_WIDTH }
    ];
    for (let c = 0; c < matrix.files.length; c++) {
      const file = matrix.files[c]!;
      const cell = matrix.cell(key, file);
      const focused =
        state.mode === 'browse' && r === state.rowIdx && c === state.colIdx;
      cells.push({
        text: renderCellText(cell.state, cell.value, secret),
        fg: stateColor(cell.state),
        width: valueColWidth,
        bg: focused ? COLORS.focusBg : undefined
      });
    }
    scrollBox.content.add(buildRow(renderer, `row-${r}`, cells));
  }

  // Keep the focused row visible when navigating up/down past the viewport.
  if (state.mode === 'browse' && state.visibleKeys.length > 0) {
    try {
      scrollBox.scrollChildIntoView(`row-${state.rowIdx}`);
    } catch {
      // scrollChildIntoView throws if the row id isn't laid out yet; the
      // next refresh after layout will succeed.
    }
  }
}

function refreshFooter(
  hintA: TextRenderable,
  hintB: TextRenderable,
  status: TextRenderable,
  promptLabel: TextRenderable,
  filterInput: InputRenderable,
  promptInput: InputRenderable,
  state: State
): void {
  const dirty = state.dirty.size;
  const dirtyLabel = dirty > 0 ? `  ●${dirty} unsaved` : '';

  if (state.mode === 'prompt' && state.prompt) {
    hintA.content = `[Enter] confirm   [Esc] cancel${dirtyLabel}`;
    hintB.content = '';
    promptLabel.content = promptLabelText(state.prompt);
  } else if (state.mode === 'filter') {
    hintA.content = `[Enter] keep filter   [Esc] clear${dirtyLabel}`;
    hintB.content = '';
    promptLabel.content = ' Filter:';
  } else {
    // Line 1: actions (always visible). Line 2: current modes.
    hintA.content =
      `↑↓←→ move · e edit · a add · d del · n new · ` +
      `^Z undo · ^S save · / filter · ? help · q quit${dirtyLabel}`;
    hintB.content =
      `v view: ${state.driftOnly ? 'drift' : 'all'} · ` +
      `g group: ${state.grouping}`;
    promptLabel.content = '';
  }
  filterInput.visible = state.mode === 'filter';
  promptInput.visible = state.mode === 'prompt';
  status.content = state.message ?? '';
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

function buildSectionDivider(
  renderer: CliRenderer,
  id: string,
  name: string | undefined,
  width: number
): BoxRenderable {
  // A single-line banner that spans the full matrix width. When `name` is
  // undefined the divider is just a horizontal rule (separates extras /
  // unsectioned keys from the previous group).
  const label = name ? ` ${name} ` : '';
  const rule = '─';
  const visible = Math.max(0, width - 2);
  const beforeLen = Math.max(2, Math.floor((visible - label.length) / 2));
  const afterLen = Math.max(0, visible - beforeLen - label.length);
  const content = rule.repeat(beforeLen) + label + rule.repeat(afterLen);
  const box = new BoxRenderable(renderer, {
    id,
    flexDirection: 'row',
    flexShrink: 0,
    height: 1,
    paddingX: 1
  });
  box.add(
    new TextRenderable(renderer, {
      id: `${id}-text`,
      content,
      fg: COLORS.fgSection
    })
  );
  return box;
}

function buildRow(
  renderer: CliRenderer,
  idPrefix: string,
  cells: { text: string; fg: RGBA; width: number; bg?: RGBA }[]
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
      flexShrink: 0,
      paddingX: CELL_PAD_X
    };
    if (cell.bg) cellOpts.backgroundColor = cell.bg;
    const cellBox = new BoxRenderable(renderer, cellOpts);
    // Inner width = column width minus the left + right padding.
    const innerWidth = Math.max(0, cell.width - CELL_PAD_X * 2);
    cellBox.add(
      new TextRenderable(renderer, {
        id: `${idPrefix}-c${i}-t`,
        content: truncate(cell.text, innerWidth),
        fg: cell.fg
      })
    );
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

function renderCellText(
  cellState: CellState,
  value: string | undefined,
  secret: boolean
): string {
  if (cellState === 'missing') return '✗ missing';
  if (cellState === 'extra') return `★ ${formatValue(value, secret)}`;
  if (value === undefined) return '';
  if (cellState === 'differs') return `≠ ${formatValue(value, secret)}`;
  return formatValue(value, secret);
}

function formatValue(value: string | undefined, secret: boolean): string {
  if (value === undefined) return '';
  if (secret) return maskValue(value);
  return value;
}

function stateColor(cellState: CellState): RGBA {
  switch (cellState) {
    case 'differs':
      return COLORS.differs;
    case 'missing':
      return COLORS.missing;
    case 'extra':
      return COLORS.extra;
    case 'base':
    case 'same':
    default:
      return COLORS.fg;
  }
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
