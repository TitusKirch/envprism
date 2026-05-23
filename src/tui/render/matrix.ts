import type { Matrix } from '@/core/matrix.ts';
import { basename } from 'pathe';
import type { TuiContext } from '@tui/context.ts';
import { sectionMetadata } from '@tui/grouping.ts';
import {
  buildRow,
  buildSectionDivider,
  buildValueCell,
  type CellSpec
} from '@tui/render/builders.ts';
import { removeAllChildren } from '@tui/render/dom.ts';
import type { State } from '@tui/types.ts';

export function matrixTitle(matrix: Matrix, state: State): string {
  const visible = state.visibleKeys.length;
  const total = matrix.keys.length;
  const parts: string[] = [`${total} keys`];
  if (state.driftOnly) parts.push(`drift ${visible}/${total}`);
  else if (state.filter && visible !== total) {
    parts.push(`"${state.filter}" ${visible}/${total}`);
  }
  return ` Matrix · ${parts.join(' · ')} `;
}

/**
 * Available width inside the matrix box (subtract sidebar, both borders and the
 * matrix's horizontal padding). If columns would shrink below VALUE_COL_MIN to
 * fit, keep them at the minimum and let the ScrollBox handle the overflow.
 */
export function computeValueColWidth(ctx: TuiContext): number {
  const { renderer, matrix, layout } = ctx;
  const available = Math.max(
    0,
    renderer.terminalWidth - layout.SIDEBAR_WIDTH - 6 - layout.KEY_COL_WIDTH
  );
  const fair = matrix.files.length
    ? Math.floor(available / matrix.files.length)
    : layout.VALUE_COL_MIN;
  return Math.max(layout.VALUE_COL_MIN, fair);
}

export function refreshMatrix(ctx: TuiContext): void {
  const {
    el: { matrixBox, headerHost, scrollBox },
    renderer,
    matrix,
    state,
    theme,
    layout,
    heuristics
  } = ctx;
  const sectionOf = ctx.sectionOf;
  const valueColWidth = computeValueColWidth(ctx);
  matrixBox.title = matrixTitle(matrix, state);
  removeAllChildren(headerHost);
  removeAllChildren(scrollBox.content);

  headerHost.add(
    buildRow(
      renderer,
      'header',
      [
        { text: 'KEY', fg: theme.fgHeader, width: layout.KEY_COL_WIDTH },
        ...matrix.files.map((f) => ({
          text: basename(f.path),
          fg: theme.fgHeader,
          width: valueColWidth
        }))
      ],
      layout.CELL_PAD_X
    )
  );

  // Walk every key (including those hidden by a collapsed section) so we can
  // render section dividers for collapsed groups too. Within an expanded
  // group we render the cell rows; within a collapsed one we render nothing
  // beyond the header.
  const totalWidth = layout.KEY_COL_WIDTH + valueColWidth * matrix.files.length;
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
        buildSectionDivider(
          renderer,
          `row-${r}`,
          sectionName,
          totalWidth,
          {
            ...meta,
            collapsed: state.collapsed.has(sectionKey),
            focused
          },
          theme
        )
      );
      continue;
    }
    const key = item.ref;
    const secret = heuristics.isSecretKey(key) && !state.showSecrets;
    const cells: CellSpec[] = [
      { text: key, fg: theme.fg, width: layout.KEY_COL_WIDTH }
    ];
    for (let c = 0; c < matrix.files.length; c++) {
      const file = matrix.files[c]!;
      const cell = matrix.cell(key, file);
      const focused =
        state.mode === 'browse' && r === state.rowIdx && c === state.colIdx;
      const isModified = state.modified.has(`${key}|${file.path}`);
      cells.push(
        buildValueCell(
          cell,
          secret,
          valueColWidth,
          focused,
          isModified,
          theme,
          heuristics.isPlaceholderValue
        )
      );
    }
    scrollBox.content.add(
      buildRow(renderer, `row-${r}`, cells, layout.CELL_PAD_X)
    );
  }

  // Keep the focused row in view. Single deferred call so layout has been
  // computed before we ask for a scroll target; doing it twice (sync +
  // deferred) was causing visible "jumps" because the two calls landed on
  // slightly different layouts.
  if (state.mode === 'browse' && state.visibleItems.length > 0) {
    const target = `row-${state.rowIdx}`;
    setImmediate(() => {
      try {
        scrollBox.scrollChildIntoView(target);
      } catch {
        /* row not laid out yet — next refresh will retry */
      }
    });
  }
}
