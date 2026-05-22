import {
  BoxRenderable,
  type CliRenderer,
  createCliRenderer,
  InputRenderable,
  RGBA,
  TextRenderable
} from '@opentui/core';
import { writeFile } from 'node:fs/promises';
import { basename } from 'pathe';
import { isSecretKey, maskValue } from '../core/mask.ts';
import type { CellState, Matrix } from '../core/matrix.ts';
import { rebuildKvLine, serializeEnv } from '../core/serialize.ts';
import type { EnvFile, KvEntry } from '../core/types.ts';

type Mode = 'browse' | 'filter' | 'edit';

interface State {
  mode: Mode;
  filter: string;
  rowIdx: number; // index into visibleKeys
  colIdx: number; // index into matrix.files (0 = first file)
  editing: { key: string; file: EnvFile } | null;
  dirty: Set<EnvFile>;
  visibleKeys: string[];
  message: string | null;
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
  focusBg: RGBA.fromHex('#3a3f4b'),
  defaultBg: RGBA.fromHex('#000000')
};

const KEY_COL_WIDTH = 22;
const VALUE_COL_WIDTH = 24;

export async function runMatrixTui(matrix: Matrix): Promise<void> {
  const renderer = await createCliRenderer();

  const state: State = {
    mode: 'browse',
    filter: '',
    rowIdx: 0,
    colIdx: 0,
    editing: null,
    dirty: new Set(),
    visibleKeys: matrix.keys.slice(),
    message: null
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
    width: 30,
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

  const editInput = new InputRenderable(renderer, {
    id: 'edit-input',
    placeholder: 'New value (Enter saves, Esc cancels)',
    width: 60
  });
  footer.add(editInput);

  // Refs we mutate on focus/filter/edit changes.
  const cellRefs: BoxRenderable[][] = [];

  const recomputeVisibleKeys = () => {
    state.visibleKeys = matrix.keys.filter((k) =>
      matchesFilter(k, state.filter)
    );
    if (state.rowIdx >= state.visibleKeys.length) {
      state.rowIdx = Math.max(0, state.visibleKeys.length - 1);
    }
  };

  const refresh = () => {
    refreshSidebar(sidebar, renderer, matrix, state);
    refreshMatrix(matrixBox, renderer, matrix, state, cellRefs);
    refreshFooter(hint, status, promptLabel, filterInput, editInput, state);
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

    const startEdit = () => {
      const key = state.visibleKeys[state.rowIdx];
      const file = matrix.files[state.colIdx];
      if (!key || !file) return;
      const entry = findKvEntry(file, key);
      if (!entry) {
        state.message = `Cannot edit "${key}" in ${basename(file.path)}: key is missing (add not yet supported).`;
        refresh();
        return;
      }
      state.editing = { key, file };
      state.mode = 'edit';
      state.message = null;
      editInput.value = entry.value;
      editInput.focus();
      refresh();
    };

    const commitEdit = () => {
      if (!state.editing) return;
      const { key, file } = state.editing;
      const entry = findKvEntry(file, key);
      if (entry) {
        entry.value = editInput.value;
        rebuildKvLine(entry);
        state.dirty.add(file);
        state.message = `Edited ${key} in ${basename(file.path)}. Press Ctrl-S to save.`;
      }
      editInput.value = '';
      editInput.blur();
      state.editing = null;
      state.mode = 'browse';
      refresh();
    };

    const cancelEdit = () => {
      editInput.value = '';
      editInput.blur();
      state.editing = null;
      state.mode = 'browse';
      state.message = 'Edit cancelled.';
      refresh();
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
      if (state.mode === 'edit') {
        if (key.name === 'escape') cancelEdit();
        else if (key.name === 'return') commitEdit();
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
      if (key.ctrl && key.name === 'c') {
        cleanup();
        return;
      }
      if (key.ctrl && key.name === 's') {
        void saveDirty();
        return;
      }

      switch (key.name) {
        case 'q':
          cleanup();
          return;
        case 'up':
          state.rowIdx = Math.max(0, state.rowIdx - 1);
          refresh();
          return;
        case 'down':
          state.rowIdx = Math.min(
            Math.max(0, state.visibleKeys.length - 1),
            state.rowIdx + 1
          );
          refresh();
          return;
        case 'left':
          state.colIdx = Math.max(0, state.colIdx - 1);
          refresh();
          return;
        case 'right':
          state.colIdx = Math.min(matrix.files.length - 1, state.colIdx + 1);
          refresh();
          return;
        case 'e':
        case 'return':
          startEdit();
          return;
      }

      if (key.sequence === '/' || key.name === 'slash') {
        state.mode = 'filter';
        state.message = null;
        filterInput.focus();
        refresh();
      }
    };

    renderer.keyInput.on('keypress', onKey);
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
  for (const file of matrix.files) {
    const isBase = file === matrix.base;
    const isDirty = state.dirty.has(file);
    const marker = `${isDirty ? '●' : ' '}${isBase ? '★' : ' '} `;
    sidebar.add(
      new TextRenderable(renderer, {
        id: `file-${file.path}`,
        content: `${marker}${basename(file.path)}`,
        fg: isDirty ? COLORS.fgDirty : isBase ? COLORS.fgBase : COLORS.fg
      })
    );
  }
}

function refreshMatrix(
  matrixBox: BoxRenderable,
  renderer: CliRenderer,
  matrix: Matrix,
  state: State,
  cellRefs: BoxRenderable[][]
): void {
  matrixBox.title = matrixTitle(matrix, state);
  removeAllChildren(matrixBox);
  cellRefs.length = 0;

  // Header row.
  matrixBox.add(
    buildRow(renderer, 'header', [
      { text: 'KEY', fg: COLORS.fgHeader, width: KEY_COL_WIDTH },
      ...matrix.files.map((f) => ({
        text: basename(f.path),
        fg: COLORS.fgHeader,
        width: VALUE_COL_WIDTH
      }))
    ])
  );

  // Data rows.
  for (let r = 0; r < state.visibleKeys.length; r++) {
    const key = state.visibleKeys[r]!;
    const secret = isSecretKey(key);
    const rowCells: { text: string; fg: RGBA; width: number; bg?: RGBA }[] = [
      { text: key, fg: COLORS.fg, width: KEY_COL_WIDTH }
    ];
    for (let c = 0; c < matrix.files.length; c++) {
      const file = matrix.files[c]!;
      const cell = matrix.cell(key, file);
      const focused =
        state.mode !== 'filter' && r === state.rowIdx && c === state.colIdx;
      rowCells.push({
        text: renderCellText(cell.state, cell.value, secret),
        fg: stateColor(cell.state),
        width: VALUE_COL_WIDTH,
        bg: focused ? COLORS.focusBg : undefined
      });
    }
    const rowRefs: BoxRenderable[] = [];
    const rowBox = buildRow(renderer, `row-${r}`, rowCells, rowRefs);
    matrixBox.add(rowBox);
    cellRefs.push(rowRefs);
  }
}

function refreshFooter(
  hint: TextRenderable,
  status: TextRenderable,
  promptLabel: TextRenderable,
  filterInput: InputRenderable,
  editInput: InputRenderable,
  state: State
): void {
  const dirty = state.dirty.size;
  const dirtyLabel = dirty > 0 ? `  ●${dirty} unsaved` : '';
  if (state.mode === 'edit' && state.editing) {
    hint.content = `[Enter] save   [Esc] cancel${dirtyLabel}`;
    promptLabel.content = ` Edit ${state.editing.key} in ${basename(state.editing.file.path)}:`;
  } else if (state.mode === 'filter') {
    hint.content = `[Enter] keep filter   [Esc] clear${dirtyLabel}`;
    promptLabel.content = ' Filter:';
  } else {
    hint.content = `[↑↓←→] move  [e/Enter] edit  [/] filter  [Ctrl-S] save  [q] quit${dirtyLabel}`;
    promptLabel.content = '';
  }
  // Hide the inactive input by setting its height to 0; opentui has no easy
  // `visible` toggle here, but width=0 is a workable approximation that keeps
  // the layout stable.
  filterInput.width = state.mode === 'filter' ? 40 : 0;
  editInput.width = state.mode === 'edit' ? 60 : 0;
  status.content = state.message ?? '';
}

// --- Helpers ---

function buildRow(
  renderer: CliRenderer,
  idPrefix: string,
  cells: { text: string; fg: RGBA; width: number; bg?: RGBA }[],
  outRefs?: BoxRenderable[]
): BoxRenderable {
  const row = new BoxRenderable(renderer, {
    id: idPrefix,
    flexDirection: 'row'
  });
  cells.forEach((cell, i) => {
    const cellBox = new BoxRenderable(renderer, {
      id: `${idPrefix}-c${i}`,
      width: cell.width,
      backgroundColor: cell.bg ?? COLORS.defaultBg
    });
    cellBox.add(
      new TextRenderable(renderer, {
        id: `${idPrefix}-c${i}-t`,
        content: truncate(cell.text, cell.width),
        fg: cell.fg
      })
    );
    row.add(cellBox);
    if (outRefs && i > 0) outRefs.push(cellBox);
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
  const filtered =
    state.filter && visible !== total
      ? ` · "${state.filter}" (${visible}/${total})`
      : '';
  return ` Matrix · ${total} keys${filtered} `;
}

function renderCellText(
  state: CellState,
  value: string | undefined,
  secret: boolean
): string {
  if (state === 'missing') return '✗ missing';
  if (state === 'extra') return `★ ${formatValue(value, secret)}`;
  if (value === undefined) return '';
  if (state === 'differs') return `≠ ${formatValue(value, secret)}`;
  return formatValue(value, secret);
}

function formatValue(value: string | undefined, secret: boolean): string {
  if (value === undefined) return '';
  if (secret) return maskValue(value);
  return value;
}

function stateColor(state: CellState): RGBA {
  switch (state) {
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
