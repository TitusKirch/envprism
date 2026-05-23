import type {
  BoxRenderable,
  CliRenderer,
  ScrollBoxRenderable,
  TextRenderable
} from '@opentui/core';
import type { Matrix } from '@/core/matrix.ts';
import type { EnvFile } from '@/core/types.ts';
import type { State } from '@tui/types.ts';

/** Stable handles to every opentui element built once during layout. */
export interface TuiElements {
  root: BoxRenderable;
  body: BoxRenderable;
  sidebar: BoxRenderable;
  matrixBox: BoxRenderable;
  headerHost: BoxRenderable;
  scrollBox: ScrollBoxRenderable;
  footer: BoxRenderable;
  hintA: BoxRenderable;
  hintB: BoxRenderable;
  status: TextRenderable;
  filterBox: BoxRenderable;
  filterField: TextRenderable;
  filterStatus: TextRenderable;
  promptBox: BoxRenderable;
  promptBody: BoxRenderable;
  promptHint: TextRenderable;
  helpBox: BoxRenderable;
  dimOverlay: BoxRenderable;
}

/**
 * The single object threaded through every state/action/render module instead
 * of closures. Reassigned bindings (`matrix`, `currentBase`) live here as
 * mutable fields so a write in one module is observed by reads in another;
 * everything else is a stable reference.
 *
 * IMPORTANT: never snapshot `ctx.matrix` into a local and reuse it across a
 * `rebuildMatrix` — always read `ctx.matrix` fresh.
 */
export interface TuiContext {
  readonly renderer: CliRenderer;
  readonly state: State;
  readonly allFiles: EnvFile[]; // mutated in place (push), stable reference
  readonly el: TuiElements;

  // Reassigned by rebuildMatrix / setBase — must stay mutable fields.
  matrix: Matrix;
  currentBase: EnvFile;

  // Wired up in runMatrixTui; callable from any module via the context.
  refresh(): void; // batched (queueMicrotask)
  refreshNow(): void; // synchronous full render
  sectionOf(key: string): string | undefined;
}
