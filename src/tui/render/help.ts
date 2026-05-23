import { BoxRenderable, ScrollBoxRenderable } from '@opentui/core';
import type { TuiContext } from '@tui/context.ts';
import { buildHelpLines } from '@tui/help.ts';
import { buildHelpRow } from '@tui/render/builders.ts';
import { removeAllChildren } from '@tui/render/dom.ts';

export function refreshHelp(ctx: TuiContext): void {
  const {
    el: { helpBox },
    renderer,
    state,
    theme
  } = ctx;
  helpBox.visible = state.helpOpen;
  if (!state.helpOpen) return;
  removeAllChildren(helpBox);
  const lines = buildHelpLines();
  // Use one scrollable column when the terminal is narrow or short.
  const narrow = renderer.terminalWidth < 100;
  const short = renderer.terminalHeight < 36;
  const oneColumn = narrow || short;
  if (oneColumn) {
    const scroll = new ScrollBoxRenderable(renderer, {
      id: 'help-scroll',
      flexGrow: 1,
      scrollX: false,
      scrollY: true,
      viewportOptions: { paddingRight: 1 },
      contentOptions: { flexDirection: 'column' }
    });
    helpBox.add(scroll);
    lines.forEach((line, i) => {
      scroll.content.add(buildHelpRow(renderer, `help-${i}`, line, theme));
    });
    return;
  }
  // Two-column grid.
  const grid = new BoxRenderable(renderer, {
    id: 'help-grid',
    flexDirection: 'row',
    flexGrow: 1,
    columnGap: 3
  });
  const left = new BoxRenderable(renderer, {
    id: 'help-left',
    flexDirection: 'column',
    flexGrow: 1,
    flexBasis: 0
  });
  const right = new BoxRenderable(renderer, {
    id: 'help-right',
    flexDirection: 'column',
    flexGrow: 1,
    flexBasis: 0
  });
  const half = Math.floor(lines.length / 2);
  let splitIdx = half;
  for (let i = half; i < lines.length; i++) {
    if (lines[i]?.kind === 'blank') {
      splitIdx = i + 1;
      break;
    }
  }
  lines
    .slice(0, splitIdx)
    .forEach((line, i) =>
      left.add(buildHelpRow(renderer, `help-l-${i}`, line, theme))
    );
  lines
    .slice(splitIdx)
    .forEach((line, i) =>
      right.add(buildHelpRow(renderer, `help-r-${i}`, line, theme))
    );
  grid.add(left);
  grid.add(right);
  helpBox.add(grid);
}
