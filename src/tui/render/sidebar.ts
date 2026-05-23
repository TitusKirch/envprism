import {
  BoxRenderable,
  type CliRenderer,
  type RGBA,
  TextRenderable
} from '@opentui/core';
import type { Matrix } from '@/core/matrix.ts';
import type { EnvFile } from '@/core/types.ts';
import { basename } from 'pathe';
import { removeAllChildren } from '@tui/render/dom.ts';
import { COLORS } from '@tui/theme.ts';
import type { State } from '@tui/types.ts';

export function refreshSidebar(
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
