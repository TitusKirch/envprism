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
}

const COLORS = {
  fg: RGBA.fromHex('#cccccc'),
  fgDim: RGBA.fromHex('#666666'),
  fgHeader: RGBA.fromHex('#ffffff'),
  fgBase: RGBA.fromHex('#ffd866'),
  fgDirty: RGBA.fromHex('#56b6c2'),
  differs: RGBA.fromHex('#ffd866'),
  missing: RGBA.fromHex('#ff6b6b'),
  extra: RGBA.fromHex('#c792ea'),
  focusBg: RGBA.fromHex('#3a3f4b')
};

const KEY_COL_WIDTH = 22;
const VALUE_COL_MIN = 18;
const SIDEBAR_WIDTH = 30;
const ROW_GAP = 1;
const KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

export async function runMatrixTui(initialMatrix: Matrix): Promise<void> {
  const renderer = await createCliRenderer();
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
    confirmQuit: false
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
    paddingX: 1
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
    paddingX: 1
  });
  root.add(footer);

  const hint = new TextRenderable(renderer, { id: 'hint', content: '' });
  footer.add(hint);

  const status = new TextRenderable(renderer, {
    id: 'status',
    content: '',
    fg: COLORS.fgDim
  });
  footer.add(status);

  const promptLabel = new TextRenderable(renderer, {
    id: 'prompt-label',
    content: ''
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

  // --- State helpers ---
  const recomputeVisibleKeys = () => {
    state.visibleKeys = matrix.keys.filter((k) => {
      if (!matchesFilter(k, state.filter)) return false;
      if (state.driftOnly && !keyDrifts(matrix, k)) return false;
      return true;
    });
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
      valueColWidth
    );
    refreshFooter(hint, status, promptLabel, filterInput, promptInput, state);
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
      if (idx >= 0) file.entries.splice(idx, 1);
      state.dirty.add(file);
      rebuildMatrix();
      state.message = `Deleted ${key} from ${basename(file.path)}. Ctrl-S to save.`;
      refresh();
    };

    const commitPrompt = () => {
      if (!state.prompt) return;
      const p = state.prompt;
      const raw = promptInput.value;

      if (p.kind === 'edit') {
        const entry = findKvEntry(p.file, p.key);
        if (entry) {
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
        appendKv(p.file, p.key, raw);
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
      }

      if (key.sequence === '/' || key.name === 'slash') {
        state.mode = 'filter';
        state.message = null;
        filterInput.focus();
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
  valueColWidth: number
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

  for (let r = 0; r < state.visibleKeys.length; r++) {
    const key = state.visibleKeys[r]!;
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
  hint: TextRenderable,
  status: TextRenderable,
  promptLabel: TextRenderable,
  filterInput: InputRenderable,
  promptInput: InputRenderable,
  state: State
): void {
  const dirty = state.dirty.size;
  const dirtyLabel = dirty > 0 ? `  ●${dirty} unsaved` : '';

  if (state.mode === 'prompt' && state.prompt) {
    hint.content = `[Enter] confirm   [Esc] cancel${dirtyLabel}`;
    promptLabel.content = promptLabelText(state.prompt);
  } else if (state.mode === 'filter') {
    hint.content = `[Enter] keep filter   [Esc] clear${dirtyLabel}`;
    promptLabel.content = ' Filter:';
  } else {
    const viewLabel = state.driftOnly ? ' [diff]' : '';
    hint.content =
      `[↑↓←→] move  [e] edit  [a] add  [d] del  [n] new  ` +
      `[v] view${viewLabel}  [/] filter  [Ctrl-S] save  [q] quit${dirtyLabel}`;
    promptLabel.content = '';
  }
  filterInput.width = state.mode === 'filter' ? 40 : 0;
  promptInput.width = state.mode === 'prompt' ? 60 : 0;
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

function appendKv(file: EnvFile, key: string, value: string): void {
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
      flexShrink: 0
    };
    if (cell.bg) cellOpts.backgroundColor = cell.bg;
    const cellBox = new BoxRenderable(renderer, cellOpts);
    cellBox.add(
      new TextRenderable(renderer, {
        id: `${idPrefix}-c${i}-t`,
        content: truncate(cell.text, cell.width),
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
