// Window sizes for the expanded and minimized layouts. Pure, shared with the preview.

import type { CompactStyle } from "./types";

export const SIZE_EXPANDED = { w: 300, h: 432 };

const COMPACT_BASE: Record<CompactStyle, { w: number; h: number }> = {
  bars: { w: 240, h: 86 },
  rings: { w: 200, h: 124 },
};
/** Extra height per bar row / extra width per ring beyond the first two. */
const BAR_ROW_H = 26;
const RING_W = 80;
/** Window chrome around the minimized content: border + `.widget.compact` padding. */
export const COMPACT_PAD = { x: 2 * 10 + 2, y: 2 * 6 + 2 };

/** Minimized window size for `count` meters (the base size fits two); a fallback
 * for when the rendered content cannot be measured. */
export function compactSize(style: CompactStyle, count: number): { w: number; h: number } {
  const extra = Math.max(0, count - 2);
  const base = COMPACT_BASE[style];
  return style === "rings"
    ? { w: base.w + extra * RING_W, h: base.h }
    : { w: base.w, h: base.h + extra * BAR_ROW_H };
}
