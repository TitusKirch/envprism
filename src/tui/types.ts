import type { RGBA } from '@opentui/core';
import type { EnvFile, KvEntry } from '@/core/types.ts';

export type Mode = 'browse' | 'filter' | 'prompt';

export type Prompt =
  | { kind: 'edit'; key: string; file: EnvFile }
  | { kind: 'add-key'; file: EnvFile }
  | { kind: 'add-value'; key: string; file: EnvFile }
  | { kind: 'new-file' };

export type Grouping = 'banner' | 'prefix';

export type UndoEntry =
  | {
      kind: 'edit';
      file: EnvFile;
      entry: KvEntry;
      prevValue: string;
      prevRaw: string;
    }
  | { kind: 'add-kv'; file: EnvFile; entry: KvEntry }
  | { kind: 'delete-kv'; file: EnvFile; entry: KvEntry; idx: number };

export const UNDO_LIMIT = 50;

export type Pane = 'matrix' | 'sidebar';

export type ItemKind = 'key' | 'divider';
export interface MatrixItem {
  kind: ItemKind;
  // For 'key': the variable name; for 'divider': the section's lookup name
  // (or '__other__'). Holding the raw key/section here keeps focus stable
  // across rebuilds.
  ref: string;
}

export interface State {
  mode: Mode;
  filter: string;
  rowIdx: number;
  colIdx: number;
  prompt: Prompt | null;
  dirty: Set<EnvFile>;
  visibleKeys: string[]; // kept for callers that just want the keys
  visibleItems: MatrixItem[];
  message: string | null;
  driftOnly: boolean;
  confirmQuit: boolean;
  grouping: Grouping;
  helpOpen: boolean;
  undo: UndoEntry[];
  pane: Pane;
  sidebarIdx: number;
  enabled: Set<EnvFile>;
  showSecrets: boolean;
  collapsed: Set<string>;
  // (key + "|" + file.path) of cells the user has touched in this session.
  // Drives a green ● marker so unsaved local changes are visually distinct
  // from "this file disagrees with base", which uses the diff icons.
  modified: Set<string>;
  // Current value of the prompt input. We accumulate characters ourselves
  // in the global key handler instead of relying on opentui's InputRenderable,
  // because the InputRenderable swallows Esc (it interprets it as "blur").
  promptInput: string;
}

export const KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

export type HelpLine =
  | { kind: 'header'; text: string }
  | { kind: 'entry'; text: string }
  | { kind: 'legend'; symbol: string; color: RGBA; description: string }
  | { kind: 'blank' };
