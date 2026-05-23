import type { TuiContext } from '@tui/context.ts';
import type { KeyEvent } from '@tui/keys/event.ts';
import { recomputeVisibleKeys } from '@tui/state/visible.ts';

export function handleFilterKey(ctx: TuiContext, key: KeyEvent): void {
  const { state } = ctx;
  if (key.name === 'escape') {
    state.filter = '';
    state.mode = 'browse';
    recomputeVisibleKeys(ctx);
    ctx.refresh();
    return;
  }
  if (key.name === 'return') {
    state.mode = 'browse';
    ctx.refresh();
    return;
  }
  if (key.name === 'backspace') {
    if (state.filter.length > 0) {
      state.filter = state.filter.slice(0, -1);
      recomputeVisibleKeys(ctx);
      ctx.refresh();
    }
    return;
  }
  // Append any printable character. opentui's KeyEvent puts the actual
  // char into `sequence` for normal keystrokes.
  const seq = key.sequence ?? '';
  if (seq.length === 1 && seq >= ' ' && seq !== '\x7f') {
    state.filter += seq;
    recomputeVisibleKeys(ctx);
    ctx.refresh();
  }
}
