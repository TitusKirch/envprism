import { writeFile } from 'node:fs/promises';
import { serializeEnv } from '@/core/serialize.ts';
import { basename } from 'pathe';
import type { TuiContext } from '@tui/context.ts';

export async function saveDirty(ctx: TuiContext): Promise<void> {
  const { state } = ctx;
  if (state.dirty.size === 0) {
    state.message = 'Nothing to save.';
    ctx.refresh();
    return;
  }
  const count = state.dirty.size;
  const errors: string[] = [];
  for (const file of state.dirty) {
    try {
      await writeFile(file.path, serializeEnv(file), 'utf8');
    } catch (err) {
      errors.push(
        `${basename(file.path)}: ${(err as Error).message ?? String(err)}`
      );
    }
  }
  if (errors.length === 0) {
    state.dirty.clear();
    state.modified.clear();
    state.message = `Saved ${count} file${count === 1 ? '' : 's'}.`;
  } else {
    state.message = `Save failed: ${errors.join('; ')}`;
  }
  ctx.refresh();
}
