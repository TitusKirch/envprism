import { applyToAllFiles } from '@tui/actions/batch.ts';
import {
  cancelPrompt,
  closePrompt,
  commitPrompt
} from '@tui/actions/prompt.ts';
import type { TuiContext } from '@tui/context.ts';
import type { KeyEvent } from '@tui/keys/event.ts';
import { rebuildMatrix } from '@tui/state/visible.ts';

export function handlePromptKey(ctx: TuiContext, key: KeyEvent): void {
  const { state } = ctx;
  if (key.name === 'escape') {
    cancelPrompt(ctx);
    return;
  }
  if (key.name === 'return') {
    commitPrompt(ctx);
    return;
  }
  if (key.name === 'backspace') {
    if (state.promptInput.length > 0) {
      state.promptInput = state.promptInput.slice(0, -1);
      ctx.refresh();
    }
    return;
  }
  if (key.ctrl && key.name === 't') {
    state.showSecrets = !state.showSecrets;
    ctx.refresh();
    return;
  }
  if (key.ctrl && key.name === 'a' && state.prompt) {
    const p = state.prompt;
    if (p.kind === 'edit' || p.kind === 'add-value') {
      const touched = applyToAllFiles(ctx, p.key, state.promptInput);
      rebuildMatrix(ctx);
      closePrompt(
        ctx,
        touched > 0
          ? `Set ${p.key} in ${touched} file(s). Ctrl-S to save.`
          : `${p.key} already had that value everywhere.`
      );
    }
    return;
  }
  const seq = key.sequence ?? '';
  if (!key.ctrl && seq.length === 1 && seq >= ' ' && seq !== '\x7f') {
    state.promptInput += seq;
    ctx.refresh();
  }
}
