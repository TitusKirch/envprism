import type { BoxRenderable, TextRenderable } from '@opentui/core';
import type { Matrix } from '@/core/matrix.ts';
import type { State } from '@tui/types.ts';

export function refreshFilter(
  filterBox: BoxRenderable,
  filterField: TextRenderable,
  filterStatus: TextRenderable,
  matrix: Matrix,
  state: State
): void {
  const open = state.mode === 'filter';
  filterBox.visible = open;
  if (!open) return;
  // Show the current filter with a fake cursor at the end. visibleKeys is
  // already filtered, so its length is the live match count.
  filterField.content = `▸ ${state.filter}▏`;
  const matches = state.visibleKeys.length;
  const total = matrix.keys.length;
  filterStatus.content =
    state.filter.length === 0
      ? 'Type to filter the keys list.'
      : `Matching ${matches} of ${total} keys.`;
}
