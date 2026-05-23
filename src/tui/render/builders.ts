import {
  BoxRenderable,
  type CliRenderer,
  RGBA,
  TextRenderable
} from '@opentui/core';
import type { CellState } from '@/core/matrix.ts';
import { formatValue, truncate } from '@tui/format.ts';
import type { SectionStats } from '@tui/grouping.ts';
import type { ResolvedTheme } from '@tui/theme.ts';
import type { HelpLine } from '@tui/types.ts';

export interface CellSpec {
  text: string;
  fg: RGBA;
  width: number;
  bg?: RGBA;
  // Optional coloured prefix — rendered in its own Text span so only the
  // icon carries the state colour, the text stays neutral.
  icon?: { char: string; fg: RGBA };
  // Optional coloured marker that sits at the right edge of the cell.
  // Used for the modified-since-load indicator.
  trailing?: { char: string; fg: RGBA };
}

export function buildValueCell(
  cell: { state: CellState; value: string | undefined },
  secret: boolean,
  width: number,
  focused: boolean,
  modified: boolean,
  theme: ResolvedTheme,
  isPlaceholder: (value: string) => boolean
): CellSpec {
  const bg = focused ? theme.focusBg : undefined;
  const trailing = modified ? { char: '●', fg: theme.modified } : undefined;
  if (cell.state === 'missing') {
    return {
      text: 'missing',
      fg: theme.fgDim,
      width,
      bg,
      icon: { char: '✗', fg: theme.missing },
      trailing
    };
  }
  const value = cell.value ?? '';
  if (value !== '' && isPlaceholder(value)) {
    return {
      text: value,
      fg: theme.fg,
      width,
      bg,
      icon: { char: '⚠', fg: theme.placeholder },
      trailing
    };
  }
  const isEmpty = value === '' && !secret;
  const displayText = isEmpty ? '(empty)' : formatValue(value, secret);
  const displayFg = isEmpty ? theme.fgDim : theme.fg;
  if (cell.state === 'differs') {
    return {
      text: displayText,
      fg: displayFg,
      width,
      bg,
      icon: { char: '≠', fg: theme.differs },
      trailing
    };
  }
  if (cell.state === 'extra') {
    return {
      text: displayText,
      fg: displayFg,
      width,
      bg,
      icon: { char: '★', fg: theme.extra },
      trailing
    };
  }
  return { text: displayText, fg: displayFg, width, bg, trailing };
}

export function buildHelpRow(
  renderer: CliRenderer,
  id: string,
  line: HelpLine,
  theme: ResolvedTheme
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
        fg: theme.fgSection,
        wrapMode: 'none',
        height: 1
      })
    );
  } else if (line.kind === 'entry') {
    row.add(
      new TextRenderable(renderer, {
        id: `${id}-t`,
        content: line.text,
        fg: theme.fg,
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
        fg: theme.fgDim,
        wrapMode: 'none',
        height: 1
      })
    );
  }
  return row;
}

export function buildSectionDivider(
  renderer: CliRenderer,
  id: string,
  name: string | undefined,
  width: number,
  meta: SectionStats & { collapsed: boolean; focused?: boolean },
  theme: ResolvedTheme
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
    { text: ` ${indicator} `, fg: theme.fgDim },
    { text: baseName, fg: theme.fg },
    { text: '  ', fg: theme.fgDim }
  ];
  if (meta.missing > 0) {
    segs.push({ text: '✗ ', fg: theme.missing });
    segs.push({ text: `${meta.missing}`, fg: theme.missing });
    segs.push({ text: ' missing  ', fg: theme.fg });
  }
  if (meta.drift > 0) {
    segs.push({ text: '≠ ', fg: theme.differs });
    segs.push({ text: `${meta.drift}`, fg: theme.differs });
    segs.push({ text: '/', fg: theme.fgDim });
    segs.push({ text: `${meta.total}`, fg: theme.differs });
    segs.push({ text: ' drift  ', fg: theme.fg });
  }
  if (meta.missing === 0 && meta.drift === 0) {
    segs.push({ text: `${meta.total}`, fg: theme.fgDim });
    segs.push({ text: ' keys  ', fg: theme.fg });
  }
  segs.push({ text: ' ', fg: theme.fgDim });

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
    ...(meta.focused ? { backgroundColor: theme.focusBg } : {})
  });
  box.add(
    new TextRenderable(renderer, {
      id: `${id}-lead`,
      content: rule.repeat(beforeLen),
      fg: theme.fgDim,
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
      fg: theme.fgDim,
      height: 1,
      wrapMode: 'none'
    })
  );
  return box;
}

export function buildRow(
  renderer: CliRenderer,
  idPrefix: string,
  cells: CellSpec[],
  padX: number
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
      paddingX: padX
    };
    if (cell.bg) cellOpts.backgroundColor = cell.bg;
    const cellBox = new BoxRenderable(renderer, cellOpts);
    const innerWidth = Math.max(0, cell.width - padX * 2);
    const iconLen = cell.icon ? cell.icon.char.length + 1 : 0;
    const trailingLen = cell.trailing ? cell.trailing.char.length + 1 : 0;
    const textWidth = Math.max(0, innerWidth - iconLen - trailingLen);
    if (cell.icon) {
      cellBox.add(
        new TextRenderable(renderer, {
          id: `${idPrefix}-c${i}-icon`,
          content: `${cell.icon.char} `,
          fg: cell.icon.fg,
          height: 1,
          wrapMode: 'none'
        })
      );
    }
    cellBox.add(
      new TextRenderable(renderer, {
        id: `${idPrefix}-c${i}-t`,
        content: truncate(cell.text, textWidth),
        fg: cell.fg,
        height: 1,
        flexGrow: 1,
        wrapMode: 'none'
      })
    );
    if (cell.trailing) {
      cellBox.add(
        new TextRenderable(renderer, {
          id: `${idPrefix}-c${i}-trail`,
          content: ` ${cell.trailing.char}`,
          fg: cell.trailing.fg,
          height: 1,
          wrapMode: 'none'
        })
      );
    }
    row.add(cellBox);
  });
  return row;
}
