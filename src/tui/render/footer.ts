import {
  type BoxRenderable,
  type CliRenderer,
  type RGBA,
  TextRenderable
} from '@opentui/core';
import type { TuiContext } from '@tui/context.ts';
import { removeAllChildren } from '@tui/render/dom.ts';
import { COLORS } from '@tui/theme.ts';

export interface FooterSeg {
  text: string;
  fg: RGBA;
}

export function bindings(specs: { key: string; label: string }[]): FooterSeg[] {
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
    state
  } = ctx;
  const dirty = state.dirty.size;
  const dirtyTail: FooterSeg[] =
    dirty > 0
      ? [
          { text: '   ', fg: COLORS.fgDim },
          { text: '●', fg: COLORS.modified },
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
  status.content = state.message ?? '';
}
