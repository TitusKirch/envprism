import { RGBA } from '@opentui/core';

// Three semantic colours only. Everything else is grayscale so the eye
// doesn't get pulled in five directions.
export const COLORS = {
  fg: RGBA.fromHex('#cccccc'),
  fgDim: RGBA.fromHex('#666666'),
  fgHeader: RGBA.fromHex('#ffffff'),
  // accent — base file + section names (blue/purple, single accent for
  // navigational anchors).
  fgBase: RGBA.fromHex('#82aaff'),
  fgSection: RGBA.fromHex('#82aaff'),
  // drift/extra/placeholder — same yellow. They describe disagreement with
  // the base file, all one semantic.
  differs: RGBA.fromHex('#ffd866'),
  extra: RGBA.fromHex('#ffd866'),
  placeholder: RGBA.fromHex('#ffd866'),
  // user-made changes (modified cells, dirty files, unsaved counter) — green.
  // Different colour from drift on purpose: "I just touched this" is a
  // different signal from "this disagrees with the base".
  modified: RGBA.fromHex('#7fce6a'),
  fgDirty: RGBA.fromHex('#7fce6a'),
  // problem — value-is-missing red. Reserved exclusively for missing.
  missing: RGBA.fromHex('#ff6b6b'),
  focusBg: RGBA.fromHex('#3a3f4b')
};

export const KEY_COL_WIDTH = 22;
export const VALUE_COL_MIN = 18;
export const SIDEBAR_WIDTH = 30;
export const ROW_GAP = 0;
export const CELL_PAD_X = 1;
