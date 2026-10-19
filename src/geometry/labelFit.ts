import type { Vec2 } from "@/domain/types";

/** Average glyph width as a share of the font size (rough, for the plan's sans-serif font). */
export const CHAR_WIDTH = 0.62;
/** Line height as a share of the font size. */
export const LINE_HEIGHT = 1.2;
/** Below this many screen pixels a label is unreadable, so it is hidden instead. */
export const MIN_LABEL_PX = 8;

export interface LabelLine {
  text: string;
  /** Preferred font size in screen pixels (used as-is when there is room). */
  size: number;
}

/** Estimated width of one line of text in screen pixels. */
export const textWidthPx = (text: string, px: number): number => text.length * px * CHAR_WIDTH;

/**
 * Shrink factor (0..1] that makes a block of stacked label lines fit a box of
 * `availW` × `availH` screen pixels. Labels never grow past their preferred size,
 * so zooming in keeps them readable; zooming out shrinks them with their object.
 * Returns 0 when the smallest line would drop below `minPx` (hide the label).
 */
export function fitLabel(lines: readonly LabelLine[], availW: number, availH = Infinity, minPx = MIN_LABEL_PX): number {
  if (lines.length === 0 || !(availW > 0) || !(availH > 0)) return 0;
  const w = Math.max(...lines.map((l) => textWidthPx(l.text, l.size)));
  const h = lines.reduce((s, l) => s + l.size * LINE_HEIGHT, 0);
  const k = Math.min(1, w > 0 ? availW / w : 1, availH / h);
  return Math.min(...lines.map((l) => l.size)) * k >= minPx ? k : 0;
}

/** Distances from `p` to the polygon boundary along y = p.y (left/right) and x = p.x (up/down). */
function spans(poly: readonly Vec2[], p: Vec2): { left: number; right: number; up: number; down: number } {
  let left = Infinity;
  let right = Infinity;
  let up = Infinity;
  let down = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    if ((a.y > p.y) !== (b.y > p.y)) {
      const x = a.x + ((p.y - a.y) / (b.y - a.y)) * (b.x - a.x);
      if (x >= p.x) right = Math.min(right, x - p.x);
      else left = Math.min(left, p.x - x);
    }
    if ((a.x > p.x) !== (b.x > p.x)) {
      const y = a.y + ((p.x - a.x) / (b.x - a.x)) * (b.y - a.y);
      if (y >= p.y) down = Math.min(down, y - p.y);
      else up = Math.min(up, p.y - y);
    }
  }
  return { left, right, up, down };
}

/**
 * Room for a label centred on `p` inside a polygon, in metres: twice the shorter
 * distance to the boundary horizontally and vertically. 0 when `p` is outside.
 */
export function labelRoom(poly: readonly Vec2[], p: Vec2): { width: number; height: number } {
  if (poly.length < 3) return { width: 0, height: 0 };
  const s = spans(poly, p);
  const width = 2 * Math.min(s.left, s.right);
  const height = 2 * Math.min(s.up, s.down);
  return Number.isFinite(width) && Number.isFinite(height) ? { width, height } : { width: 0, height: 0 };
}
