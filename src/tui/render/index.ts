import type { TuiContext } from '@tui/context.ts';
import { refreshFilter } from '@tui/render/filter.ts';
import { refreshFooter } from '@tui/render/footer.ts';
import { refreshHelp } from '@tui/render/help.ts';
import { refreshMatrix } from '@tui/render/matrix.ts';
import { refreshPrompt } from '@tui/render/prompt.ts';
import { refreshSidebar } from '@tui/render/sidebar.ts';

/**
 * Full synchronous render of every region. Reads `ctx.matrix` fresh so a
 * `rebuildMatrix` that ran between scheduling and this flush is reflected.
 */
export function refreshAll(ctx: TuiContext): void {
  const { state } = ctx;
  refreshSidebar(ctx);
  refreshMatrix(ctx);
  refreshFooter(ctx);
  refreshPrompt(ctx);
  refreshHelp(ctx);
  refreshFilter(ctx);
  ctx.el.dimOverlay.visible =
    state.helpOpen || state.mode === 'prompt' || state.mode === 'filter';
}
