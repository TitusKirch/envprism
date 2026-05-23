import {
  type BoxRenderable,
  type CliRenderer,
  type RGBA,
  TextRenderable
} from '@opentui/core';
import type { TuiContext } from '@tui/context.ts';
import { removeAllChildren } from '@tui/render/dom.ts';
import type { ResolvedTheme } from '@tui/theme.ts';

export interface FooterSeg {
  text: string;
  fg: RGBA;
}

function bindings(
  specs: { key: string; label: string }[],
  theme: ResolvedTheme
): FooterSeg[] {
  // "[key] label" with the brackets dim and the key + label in normal fg.
  // Segments separated by dim " · ".
  const out: FooterSeg[] = [];
  specs.forEach((spec, i) => {
    if (i > 0) out.push({ text: ' · ', fg: theme.fgDim });
    out.push({ text: '[', fg: theme.fgDim });
    out.push({ text: spec.key, fg: theme.fg });
    out.push({ text: '] ', fg: theme.fgDim });
    out.push({ text: spec.label, fg: theme.fg });
  });
  return out;
}

export function renderHintBox(
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

export function refreshFooter(ctx: TuiContext): void {
  const {
    el: { hintA, hintB, status },
    renderer,
    state,
    theme
  } = ctx;
  const dirty = state.dirty.size;
  const dirtyTail: FooterSeg[] =
    dirty > 0
      ? [
          { text: '   ', fg: theme.fgDim },
          { text: '●', fg: theme.modified },
          { text: ` ${dirty} unsaved`, fg: theme.fg }
        ]
      : [];

  if (state.mode === 'filter') {
    renderHintBox(hintA, renderer, [
      ...bindings(
        [
          { key: 'Enter', label: 'keep filter' },
          { key: 'Esc', label: 'clear' }
        ],
        theme
      ),
      ...dirtyTail
    ]);
    renderHintBox(hintB, renderer, [{ text: ' Filter:', fg: theme.fgDim }]);
  } else if (state.mode === 'prompt') {
    renderHintBox(hintA, renderer, []);
    renderHintBox(hintB, renderer, []);
  } else if (state.pane === 'sidebar') {
    renderHintBox(hintA, renderer, [
      ...bindings(
        [
          { key: '↑↓', label: 'move' },
          { key: 'Space', label: 'toggle' },
          { key: 'b', label: 'set base' },
          { key: 'Tab/→', label: 'matrix' },
          { key: '^S', label: 'save' },
          { key: '?', label: 'help' },
          { key: 'q', label: 'quit' }
        ],
        theme
      ),
      ...dirtyTail
    ]);
    renderHintBox(hintB, renderer, [{ text: 'Files pane', fg: theme.fgDim }]);
  } else {
    renderHintBox(hintA, renderer, [
      ...bindings(
        [
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
        ],
        theme
      ),
      ...dirtyTail
    ]);
    renderHintBox(hintB, renderer, [
      { text: 'view: ', fg: theme.fgDim },
      { text: state.driftOnly ? 'drift' : 'all', fg: theme.fg },
      { text: '  ·  group: ', fg: theme.fgDim },
      { text: state.grouping, fg: theme.fg },
      { text: '  ·  secrets: ', fg: theme.fgDim },
      { text: state.showSecrets ? 'shown' : 'masked', fg: theme.fg }
    ]);
  }
  status.content = state.message ?? '';
}
