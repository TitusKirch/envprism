import {
  BoxRenderable,
  type CliRenderer,
  createCliRenderer,
  InputRenderable,
  RGBA,
  type TextChunk,
  TextRenderable,
  TextTableRenderable
} from '@opentui/core';
import { basename } from 'pathe';
import { isSecretKey, maskValue } from '../core/mask.ts';
import type { CellState, Matrix } from '../core/matrix.ts';

interface ViewState {
  filter: string;
  filterFocused: boolean;
}

const COLORS = {
  fg: RGBA.fromHex('#cccccc'),
  fgHeader: RGBA.fromHex('#ffffff'),
  fgBase: RGBA.fromHex('#ffd866'),
  differs: RGBA.fromHex('#ffd866'),
  missing: RGBA.fromHex('#ff6b6b'),
  extra: RGBA.fromHex('#c792ea')
};

/**
 * Boot the read-only matrix TUI. Resolves when the user quits.
 *
 * Imports opentui at the top so the bundler can split this file into its own
 * chunk; the core library and the `diff` command never reach this module, so
 * the chunk stays out of code paths that don't require the Bun runtime.
 */
export async function runMatrixTui(matrix: Matrix): Promise<void> {
  const renderer = await createCliRenderer();
  const state: ViewState = { filter: '', filterFocused: false };

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

  body.add(buildSidebar(renderer, matrix));

  const matrixBox = new BoxRenderable(renderer, {
    id: 'matrix-box',
    border: true,
    borderStyle: 'rounded',
    title: matrixTitle(matrix),
    flexGrow: 1,
    paddingX: 1
  });
  const table = new TextTableRenderable(renderer, {
    id: 'matrix-table',
    content: buildTableContent(matrix, ''),
    showBorders: false,
    cellPaddingX: 1
  });
  matrixBox.add(table);
  body.add(matrixBox);

  const footer = new BoxRenderable(renderer, {
    id: 'footer',
    flexDirection: 'row',
    paddingX: 1
  });
  footer.add(
    new TextRenderable(renderer, {
      id: 'hint',
      content: '[/] filter   [q] quit'
    })
  );
  const filterInput = new InputRenderable(renderer, {
    id: 'filter-input',
    placeholder: 'Filter keys…',
    width: 30,
    marginLeft: 2
  });
  footer.add(filterInput);
  root.add(footer);

  const refresh = () => {
    matrixBox.title = matrixTitle(matrix, state.filter);
    table.content = buildTableContent(matrix, state.filter);
  };

  return new Promise<void>((resolve) => {
    const onKey = (key: {
      name: string;
      ctrl?: boolean;
      sequence?: string;
    }) => {
      if (state.filterFocused) {
        if (key.name === 'escape') {
          filterInput.value = '';
          state.filter = '';
          state.filterFocused = false;
          filterInput.blur();
          refresh();
          return;
        }
        if (key.name === 'return') {
          state.filterFocused = false;
          filterInput.blur();
          return;
        }
        // The InputRenderable consumes the keystroke itself; mirror its
        // current value into state on the next tick so the matrix refilters
        // while the user types.
        queueMicrotask(() => {
          if (state.filter !== filterInput.value) {
            state.filter = filterInput.value;
            refresh();
          }
        });
        return;
      }

      if (key.name === 'q' || (key.ctrl && key.name === 'c')) {
        renderer.keyInput.off('keypress', onKey);
        renderer.destroy?.();
        resolve();
        return;
      }
      if (key.sequence === '/' || key.name === 'slash') {
        state.filterFocused = true;
        filterInput.focus();
      }
    };

    renderer.keyInput.on('keypress', onKey);
  });
}

function buildSidebar(renderer: CliRenderer, matrix: Matrix): BoxRenderable {
  const box = new BoxRenderable(renderer, {
    id: 'files',
    border: true,
    borderStyle: 'rounded',
    title: `Files (${matrix.files.length})`,
    flexDirection: 'column',
    width: 26,
    paddingX: 1
  });
  for (const file of matrix.files) {
    const isBase = file === matrix.base;
    box.add(
      new TextRenderable(renderer, {
        id: `file-${file.path}`,
        content: `${isBase ? '★ ' : '  '}${basename(file.path)}`,
        fg: isBase ? COLORS.fgBase : COLORS.fg
      })
    );
  }
  return box;
}

function matrixTitle(matrix: Matrix, filter = ''): string {
  const total = matrix.keys.length;
  const visible = matrix.keys.filter((k) => matchesFilter(k, filter)).length;
  const filtered = filter ? ` · filter "${filter}" (${visible}/${total})` : '';
  return ` Matrix · ${total} keys${filtered} `;
}

function buildTableContent(matrix: Matrix, filter: string) {
  const header: TextChunk[][] = [
    chunk('KEY', COLORS.fgHeader),
    ...matrix.files.map((f) => chunk(basename(f.path), COLORS.fgHeader))
  ];

  const rows = matrix.keys
    .filter((k) => matchesFilter(k, filter))
    .map((key) => buildRow(matrix, key));

  return [header, ...rows];
}

function buildRow(matrix: Matrix, key: string): TextChunk[][] {
  const secret = isSecretKey(key);
  const cells = matrix.files.map((file) => {
    const cell = matrix.cell(key, file);
    return chunk(
      renderCellText(cell.state, cell.value, secret),
      stateColor(cell.state)
    );
  });
  return [chunk(key, COLORS.fg), ...cells];
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
  return value.length > 32 ? `${value.slice(0, 29)}…` : value;
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

function chunk(text: string, fg: RGBA): TextChunk[] {
  return [{ __isChunk: true, text, fg }];
}
