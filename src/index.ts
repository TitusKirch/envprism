export { parseEnv } from './core/parse.ts';
export { serializeEnv, rebuildKvLine } from './core/serialize.ts';
export { discoverEnvFiles } from './core/discover.ts';
export { resolveBase } from './core/base.ts';
export { buildMatrix } from './core/matrix.ts';
export type { Cell, CellState, Matrix } from './core/matrix.ts';
export { computeDiff, formatDiffText } from './core/diff.ts';
export type { DiffFileReport, DiffReport } from './core/diff.ts';
export { isSecretKey, maskValue } from './core/mask.ts';
export type {
  BlankEntry,
  CommentEntry,
  EnvEntry,
  EnvFile,
  KvEntry,
  Quoting
} from './core/types.ts';
