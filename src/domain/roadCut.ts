import type { Project, Vec2 } from "./types";
import { area, clipHalfPlane, signedArea } from "@/geometry/polygon";
import { add, dist, dot, normalize, perp, scale, sub } from "@/geometry/vec";

/**
 * Road widening (giải phóng mặt bằng theo lộ giới): the strip of the lot within `depth`
 * metres of one edge is taken for the road. What is left is the land you can still build on.
 */
export interface RoadCutGeometry {
  /** Lot part that remains after the cut. */
  remaining: Vec2[];
  /** Lot part taken by the road. */
  cut: Vec2[];
  cutArea: number;
  remainingArea: number;
  /** New front boundary (ranh lộ giới) inside the lot. */
  line: [Vec2, Vec2];
  /** Frontage measured along the new boundary. */
  frontWidth: number;
}

function inwardNormal(poly: readonly Vec2[], edge: number): Vec2 {
  const a = poly[edge];
  const b = poly[(edge + 1) % poly.length];
  // Positive signed area (clockwise on screen) keeps the interior on the +perp side.
  return scale(perp(normalize(sub(b, a))), Math.sign(signedArea(poly)) || 1);
}

/** Half-plane boundary `depth` metres inside lot edge `edge`, with its inward normal. */
export function cutLineOrigin(poly: readonly Vec2[], edge: number, depth: number): { origin: Vec2; normal: Vec2 } {
  const normal = inwardNormal(poly, edge);
  return { origin: add(poly[edge], scale(normal, depth)), normal };
}

export function lineSpanInside(poly: readonly Vec2[], origin: Vec2, normal: Vec2): [Vec2, Vec2] | null {
  const dir = perp(normal);
  const ts: number[] = [];
  for (let i = 0, n = poly.length; i < n; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    const sa = dot(sub(a, origin), normal);
    const sb = dot(sub(b, origin), normal);
    if (sa === sb || (sa > 0 && sb > 0) || (sa < 0 && sb < 0)) continue;
    const t = sa / (sa - sb);
    const p = add(a, scale(sub(b, a), t));
    ts.push(dot(sub(p, origin), dir));
  }
  if (ts.length < 2) return null;
  const lo = Math.min(...ts);
  const hi = Math.max(...ts);
  return [add(origin, scale(dir, lo)), add(origin, scale(dir, hi))];
}

export function roadCutGeometry(p: Project): RoadCutGeometry | null {
  const rc = p.constraints.roadCut;
  const lot = p.lot.polygon;
  if (!rc.enabled || rc.depth <= 0 || lot.length < 3 || rc.edge < 0 || rc.edge >= lot.length) return null;
  const { origin, normal } = cutLineOrigin(lot, rc.edge, rc.depth);
  const remaining = clipHalfPlane(lot, origin, normal);
  const cut = clipHalfPlane(lot, origin, scale(normal, -1));
  const line = lineSpanInside(lot, origin, normal);
  if (!remaining.length || !cut.length || !line) return null;
  return { remaining, cut, cutArea: area(cut), remainingArea: area(remaining), line, frontWidth: dist(line[0], line[1]) };
}

/** Land you may build on: the lot minus the road cut (or the whole lot). */
export function siteLotPolygon(p: Project): Vec2[] {
  return roadCutGeometry(p)?.remaining ?? p.lot.polygon;
}
