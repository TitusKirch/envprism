import { RGBA } from '@opentui/core';
import type { HelpLine } from '@tui/types.ts';

export function buildHelpLines(): HelpLine[] {
  return [
    { kind: 'header', text: 'Panes' },
    {
      kind: 'entry',
      text: '  Tab               Switch matrix ↔ files sidebar'
    },
    {
      kind: 'entry',
      text: '  ← (leftmost col)  Hop from matrix into the sidebar'
    },
    { kind: 'blank' },
    { kind: 'header', text: 'Matrix navigation' },
    { kind: 'entry', text: '  ↑ ↓ ← →           Move focused cell' },
    { kind: 'entry', text: '  Mouse wheel       Scroll (both axes)' },
    { kind: 'blank' },
    { kind: 'header', text: 'Files sidebar' },
    { kind: 'entry', text: '  ↑ ↓               Move selection' },
    { kind: 'entry', text: '  Space             Enable / disable file' },
    { kind: 'entry', text: '  b                 Make selected file the base' },
    { kind: 'entry', text: '  Tab / →           Back to matrix' },
    { kind: 'blank' },
    { kind: 'header', text: 'Editing' },
    { kind: 'entry', text: '  e / Enter         Edit focused cell value' },
    { kind: 'entry', text: '  a                 Add a new variable here' },
    {
      kind: 'entry',
      text: '  d                 Delete the variable from this file'
    },
    { kind: 'entry', text: '  n                 Create a new .env* file' },
    {
      kind: 'entry',
      text: '  =                 Sync focused value to every file'
    },
    {
      kind: 'entry',
      text: '  Ctrl-A (in edit)  Apply typed value to every file'
    },
    { kind: 'entry', text: '  Ctrl-Z            Undo last edit/add/delete' },
    { kind: 'entry', text: '  Ctrl-S            Write all dirty files' },
    {
      kind: 'entry',
      text: '  c                 Collapse / expand focused section'
    },
    {
      kind: 'entry',
      text: '  Shift-C           Expand every collapsed section'
    },
    { kind: 'blank' },
    { kind: 'header', text: 'View' },
    { kind: 'entry', text: '  /                 Filter keys' },
    { kind: 'entry', text: '  v                 All keys ↔ drift-only' },
    { kind: 'entry', text: '  g                 Group by prefix ↔ banner' },
    { kind: 'entry', text: '  Ctrl-T            Show / mask secret values' },
    { kind: 'blank' },
    { kind: 'header', text: 'Help & exit' },
    { kind: 'entry', text: '  ? / ß             Toggle this overlay' },
    { kind: 'entry', text: '  q                 Quit (twice if dirty)' },
    { kind: 'entry', text: '  Ctrl-C            Force quit' },
    { kind: 'blank' },
    { kind: 'header', text: 'Cell icons' },
    {
      kind: 'legend',
      symbol: '≠ value',
      color: RGBA.fromHex('#ffd866'),
      description: 'value differs from base'
    },
    {
      kind: 'legend',
      symbol: '✗ missing',
      color: RGBA.fromHex('#ff6b6b'),
      description: 'this file has no value for the key'
    },
    {
      kind: 'legend',
      symbol: '★ value',
      color: RGBA.fromHex('#ffd866'),
      description: 'key is not in the base'
    },
    {
      kind: 'legend',
      symbol: '•••• (N)',
      color: RGBA.fromHex('#cccccc'),
      description: 'secret-suspect value masked by length'
    },
    {
      kind: 'legend',
      symbol: '⚠ TODO',
      color: RGBA.fromHex('#ffd866'),
      description: 'placeholder value (TODO, CHANGEME, xxx, …)'
    },
    {
      kind: 'legend',
      symbol: 'value ●',
      color: RGBA.fromHex('#7fce6a'),
      description: 'modified in this session — Ctrl-S to persist'
    }
  ];
}
