export const CARD_W = 320;
const GAP = 12;

type Rect = { left: number; top: number; right: number; bottom: number };

/** Where to put a coach-mark card: beside the target when there is room, else below or above it; inside the window. */
export function placeCard(rect: Rect, view: { width: number; height: number }, cardH = 190): { left: number; top: number } {
  const clampX = (x: number) => Math.min(Math.max(8, x), Math.max(8, view.width - CARD_W - 8));
  const clampY = (y: number) => Math.min(Math.max(8, y), Math.max(8, view.height - cardH - 8));
  if (view.width - rect.right > CARD_W + GAP * 2) return { left: rect.right + GAP, top: clampY(rect.top) };
  if (view.height - rect.bottom > cardH + GAP * 2) return { left: clampX(rect.left), top: rect.bottom + GAP };
  return { left: clampX(rect.left), top: clampY(rect.top - cardH - GAP) };
}
