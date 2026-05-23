import type { TuiContext } from '@tui/context.ts';
import type { KeyEvent } from '@tui/keys/event.ts';

export function handleHelpKey(ctx: TuiContext, key: KeyEvent): void {
  if (
    key.name === 'escape' ||
    key.sequence === '?' ||
    key.sequence === 'ß' ||
    key.name === 'q'
  ) {
    ctx.state.helpOpen = false;
    ctx.refresh();
  }
}
