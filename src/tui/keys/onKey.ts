import type { TuiContext } from '@tui/context.ts';
import { handleBrowseKey } from '@tui/keys/browse.ts';
import type { KeyEvent } from '@tui/keys/event.ts';
import { handleFilterKey } from '@tui/keys/filter.ts';
import { handleHelpKey } from '@tui/keys/help.ts';
import { handlePromptKey } from '@tui/keys/prompt.ts';

/**
 * Build the global keypress handler. Dispatches by current mode; `cleanup`
 * tears down the renderer and resolves the run promise (used by Ctrl-C and
 * the quit-confirm path in browse mode).
 */
export function createOnKey(
  ctx: TuiContext,
  cleanup: () => void
): (key: KeyEvent) => void {
  return (key: KeyEvent) => {
    if (ctx.state.helpOpen) return handleHelpKey(ctx, key);
    if (ctx.state.mode === 'prompt') return handlePromptKey(ctx, key);
    if (ctx.state.mode === 'filter') return handleFilterKey(ctx, key);
    handleBrowseKey(ctx, key, cleanup);
  };
}
