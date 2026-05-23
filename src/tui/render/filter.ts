import type { TuiContext } from '@tui/context.ts';

export function refreshFilter(ctx: TuiContext): void {
  const {
    el: { filterBox, filterField, filterStatus },
    matrix,
    state
  } = ctx;
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
