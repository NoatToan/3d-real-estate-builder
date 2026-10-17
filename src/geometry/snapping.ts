import type { Vec2, Wall } from "@/domain/types";
import { projectOnSegment } from "./segment";
import { dist, mid, round } from "./vec";

export type SnapKind = "endpoint" | "midpoint" | "wall" | "lot-vertex" | "lot-edge" | "angle" | "grid" | "none";

export interface SnapResult {
  point: Vec2;
  kind: SnapKind;
  /** Anchor point of an angle snap (to draw a guide line). */
  guideFrom?: Vec2;
}

export interface SnapContext {
  walls: readonly Wall[];
  lot: readonly Vec2[];
  /** Extra snap points (e.g. points of the polyline being drawn). */
  extraPoints?: readonly Vec2[];
  /** Grid step in metres (0 disables grid snapping). */
  grid: number;
  /** Snap radius in metres (depends on zoom). */
  tolerance: number;
  /** Previous point of the polyline being drawn, enables angle snapping. */
  anchor?: Vec2 | null;
  /** Angle increment in degrees for angle snapping. */
  angleStep?: number;
  /** Force snapping to the angle increment (Shift). */
  forceAngle?: boolean;
  /** Ids of walls to ignore (e.g. the wall being dragged). */
  ignoreWallIds?: ReadonlySet<string>;
  enabled?: boolean;
}

function nearestPoint(p: Vec2, candidates: Iterable<Vec2>, tol: number): Vec2 | null {
  let best: Vec2 | null = null;
  let bestD = tol;
  for (const c of candidates) {
    const d = dist(p, c);
    if (d <= bestD) {
      best = c;
      bestD = d;
    }
  }
  return best;
}

function angleSnap(p: Vec2, anchor: Vec2, stepDeg: number, grid: number, force: boolean): Vec2 | null {
  const dx = p.x - anchor.x;
  const dy = p.y - anchor.y;
  const length = Math.hypot(dx, dy);
  if (length < 1e-6) return null;
  const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
  const snapped = Math.round(ang / stepDeg) * stepDeg;
  if (!force && Math.abs(snapped - ang) > 4) return null;
  const l = grid > 0 ? Math.max(grid, round(length, grid)) : length;
  const r = (snapped * Math.PI) / 180;
  return { x: anchor.x + Math.cos(r) * l, y: anchor.y + Math.sin(r) * l };
}

/** Snaps a cursor position to the most relevant feature, in priority order. */
export function snapPoint(p: Vec2, ctx: SnapContext): SnapResult {
  if (ctx.enabled === false) return { point: p, kind: "none" };
  const tol = ctx.tolerance;
  const walls = ctx.walls.filter((w) => !ctx.ignoreWallIds?.has(w.id));

  const endpoints: Vec2[] = [];
  for (const w of walls) endpoints.push(w.a, w.b);
  if (ctx.extraPoints) endpoints.push(...ctx.extraPoints);
  const ep = nearestPoint(p, endpoints, tol);
  if (ep) return { point: { ...ep }, kind: "endpoint" };

  const lv = nearestPoint(p, ctx.lot, tol);
  if (lv) return { point: { ...lv }, kind: "lot-vertex" };

  const mp = nearestPoint(
    p,
    walls.map((w) => mid(w.a, w.b)),
    tol * 0.8,
  );
  if (mp) return { point: mp, kind: "midpoint" };

  if (ctx.anchor) {
    const a = angleSnap(p, ctx.anchor, ctx.angleStep ?? 45, ctx.grid, !!ctx.forceAngle);
    if (a) return { point: a, kind: "angle", guideFrom: ctx.anchor };
  }

  let bestWall: { point: Vec2; d: number } | null = null;
  for (const w of walls) {
    const pr = projectOnSegment(p, w.a, w.b);
    if (pr.distance <= tol && (!bestWall || pr.distance < bestWall.d)) bestWall = { point: pr.point, d: pr.distance };
  }
  if (bestWall) return { point: bestWall.point, kind: "wall" };

  for (let i = 0; i < ctx.lot.length; i++) {
    const pr = projectOnSegment(p, ctx.lot[i], ctx.lot[(i + 1) % ctx.lot.length]);
    if (pr.distance <= tol) return { point: pr.point, kind: "lot-edge" };
  }

  if (ctx.grid > 0) return { point: { x: round(p.x, ctx.grid), y: round(p.y, ctx.grid) }, kind: "grid" };
  return { point: p, kind: "none" };
}
