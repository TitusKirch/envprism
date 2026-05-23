import { setBase, syncToAll, toggleEnabled, undo } from '@tui/actions/batch.ts';
import { saveDirty } from '@tui/actions/io.ts';
import {
  startAdd,
  startDelete,
  startEdit,
  startNewFile
} from '@tui/actions/prompt.ts';
import type { TuiContext } from '@tui/context.ts';
import { SECTION_COLLAPSE_KEY, stepRow } from '@tui/grouping.ts';
import type { KeyEvent } from '@tui/keys/event.ts';
import { recomputeVisibleKeys } from '@tui/state/visible.ts';

export function handleBrowseKey(
  ctx: TuiContext,
  key: KeyEvent,
  cleanup: () => void
): void {
  const { state } = ctx;
  const refresh = ctx.refresh;

  if (key.ctrl && key.name === 'c') return cleanup();
  if (key.ctrl && key.name === 's') {
    state.confirmQuit = false;
    return void saveDirty(ctx);
  }
  if (key.ctrl && key.name === 'z') {
    state.confirmQuit = false;
    return undo(ctx);
  }
  if (key.ctrl && key.name === 't') {
    state.showSecrets = !state.showSecrets;
    state.message = state.showSecrets
      ? 'Showing secret values in plain text.'
      : 'Masking secret values.';
    return refresh();
  }

  const tryQuit = () => {
    if (state.dirty.size > 0 && !state.confirmQuit) {
      state.confirmQuit = true;
      state.message = `${state.dirty.size} unsaved file(s). Press 'q' again to quit without saving, or Ctrl-S to save first.`;
      refresh();
      return;
    }
    cleanup();
  };
  // Any key other than q clears a pending quit confirmation.
  if (state.confirmQuit && key.name !== 'q') {
    state.confirmQuit = false;
    state.message = null;
  }

  if (state.pane === 'sidebar') {
    switch (key.name) {
      case 'q':
        return tryQuit();
      case 'tab':
        state.pane = 'matrix';
        return refresh();
      case 'right':
        state.pane = 'matrix';
        return refresh();
      case 'up':
        state.sidebarIdx = Math.max(0, state.sidebarIdx - 1);
        return refresh();
      case 'down':
        state.sidebarIdx = Math.min(
          ctx.allFiles.length - 1,
          state.sidebarIdx + 1
        );
        return refresh();
      case 'space':
        return toggleEnabled(ctx);
      case 'b':
        return setBase(ctx);
    }
    if (key.sequence === ' ') return toggleEnabled(ctx);
    if (key.sequence === '?' || key.sequence === 'ß') {
      state.helpOpen = true;
      return refresh();
    }
    return;
  }

  switch (key.name) {
    case 'q':
      return tryQuit();
    case 'tab':
      state.pane = 'sidebar';
      return refresh();
    case 'up':
      state.rowIdx = stepRow(state, -1);
      return refresh();
    case 'down':
      state.rowIdx = stepRow(state, 1);
      return refresh();
    case 'left':
      if (state.colIdx === 0) {
        // Already at the leftmost matrix column — hand focus to the sidebar.
        state.pane = 'sidebar';
        return refresh();
      }
      state.colIdx = Math.max(0, state.colIdx - 1);
      return refresh();
    case 'right':
      state.colIdx = Math.min(ctx.matrix.files.length - 1, state.colIdx + 1);
      return refresh();
    case 'e':
    case 'return':
      return startEdit(ctx);
    case 'a':
      return startAdd(ctx);
    case 'd':
      return startDelete(ctx);
    case 'n':
      return startNewFile(ctx);
    case 'v':
      state.driftOnly = !state.driftOnly;
      state.message = state.driftOnly
        ? 'Drift-only view (only keys with differences).'
        : 'Full view.';
      recomputeVisibleKeys(ctx);
      return refresh();
    case 'c': {
      if (key.shift) {
        // Capital C — expand every collapsed section. Use this when all
        // keys you'd navigate to are hidden behind a fold.
        if (state.collapsed.size === 0) {
          state.message = 'Nothing collapsed.';
          return refresh();
        }
        const count = state.collapsed.size;
        state.collapsed.clear();
        state.message = `Expanded ${count} section(s).`;
        recomputeVisibleKeys(ctx);
        return refresh();
      }
      // Collapse / expand the section of the focused item. Works on
      // both key rows and section dividers; on a divider this is the
      // only way back into a collapsed section.
      const item = state.visibleItems[state.rowIdx];
      if (!item) return;
      const sectionKey =
        item.kind === 'divider'
          ? item.ref
          : (ctx.sectionOf(item.ref) ?? SECTION_COLLAPSE_KEY);
      const label =
        sectionKey === SECTION_COLLAPSE_KEY ? '(other)' : sectionKey;
      if (state.collapsed.has(sectionKey)) {
        state.collapsed.delete(sectionKey);
        state.message = `Expanded "${label}".`;
      } else {
        state.collapsed.add(sectionKey);
        state.message = `Collapsed "${label}". Press Shift-C to expand all.`;
      }
      recomputeVisibleKeys(ctx);
      return refresh();
    }
    case 'g': {
      // Preserve focus across the rebuild — focusedRef in
      // recomputeVisibleKeys finds the same item by ref.
      state.grouping = state.grouping === 'banner' ? 'prefix' : 'banner';
      recomputeVisibleKeys(ctx);
      state.message =
        state.grouping === 'banner'
          ? 'Group by comment banners.'
          : 'Group by key prefix (first underscore segment).';
      return refresh();
    }
  }

  if (key.sequence === '/' || key.name === 'slash') {
    state.mode = 'filter';
    state.message = null;
    refresh();
    return;
  }

  // = sync-to-all. opentui's key.name for "=" is inconsistent across
  // platforms so we check the sequence directly.
  if (key.sequence === '=') return syncToAll(ctx);

  if (key.sequence === '?' || key.sequence === 'ß') {
    state.helpOpen = true;
    refresh();
  }
}
