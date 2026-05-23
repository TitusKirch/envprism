import { RGBA } from '@opentui/core';
import { DEFAULT_THEME_HEX, resolveThemeHex } from '@/config/resolve.ts';
import type { LayoutConfig, ThemeConfig, ThemeKey } from '@/config/schema.ts';

// Three semantic colours only. Everything else is grayscale so the eye
// doesn't get pulled in five directions. The hex source of truth lives in
// resolve.ts (DEFAULT_THEME_HEX) so the merge logic stays RGBA-free.

export type ResolvedTheme = Record<ThemeKey, RGBA>;

/** Resolve a partial hex theme into RGBA values (gaps + invalid → defaults). */
export function resolveTheme(
  theme: ThemeConfig = {},
  warn?: (msg: string) => void
): ResolvedTheme {
  const hex = resolveThemeHex(theme, warn);
  const out = {} as ResolvedTheme;
  for (const key of Object.keys(DEFAULT_THEME_HEX) as ThemeKey[]) {
    out[key] = RGBA.fromHex(hex[key]);
  }
  return out;
}

/** The default resolved palette (was previously the `COLORS` constant). */
export const DEFAULT_THEME: ResolvedTheme = resolveTheme();

export interface ResolvedLayout {
  KEY_COL_WIDTH: number;
  VALUE_COL_MIN: number;
  SIDEBAR_WIDTH: number;
  ROW_GAP: number;
  CELL_PAD_X: number;
}

export function resolveLayout(layout: LayoutConfig): ResolvedLayout {
  return {
    KEY_COL_WIDTH: layout.keyColWidth,
    VALUE_COL_MIN: layout.valueColMin,
    SIDEBAR_WIDTH: layout.sidebarWidth,
    ROW_GAP: layout.rowGap,
    CELL_PAD_X: layout.cellPadX
  };
}
