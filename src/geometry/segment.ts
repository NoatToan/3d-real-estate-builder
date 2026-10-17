import type { Vec2 } from "@/domain/types";
import { clamp, cross, dist, dot, EPS, lerp, sub } from "./vec";

export interface SegmentHit {
  point: Vec2;
  /** Parameter along the first segment [0,1]. */
  t: number;
  /** Parameter along the second segment [0,1]. */
  u: number;
}

/** Proper or touching intersection of segments p1p2 and q1q2 (null if parallel or disjoint). */
export function segmentIntersection(p1: Vec2, p2: Vec2, q1: Vec2, q2: Vec2, eps = 1e-9): SegmentHit | null {
  const r = sub(p2, p1);
  const s = sub(q2, q1);
  const denom = cross(r, s);
  if (Math.abs(denom) < EPS) return null;
  const qp = sub(q1, p1);
  const t = cross(qp, s) / denom;
  const u = cross(qp, r) / denom;
  if (t < -eps || t > 1 + eps || u < -eps || u > 1 + eps) return null;
  return { point: lerp(p1, p2, t), t: clamp(t, 0, 1), u: clamp(u, 0, 1) };
}

/** Intersection of two infinite lines given point + direction (null if parallel). */
export function lineIntersection(p1: Vec2, d1: Vec2, p2: Vec2, d2: Vec2): Vec2 | null {
  const denom = cross(d1, d2);
  if (Math.abs(denom) < 1e-12) return null;
  const t = cross(sub(p2, p1), d2) / denom;
  return { x: p1.x + d1.x * t, y: p1.y + d1.y * t };
}

export interface Projection {
  point: Vec2;
  t: number;
  distance: number;
}

/** Closest point on segment ab to p. */
export function projectOnSegment(p: Vec2, a: Vec2, b: Vec2): Projection {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  const t = l2 < EPS ? 0 : clamp(dot(sub(p, a), ab) / l2, 0, 1);
  const point = lerp(a, b, t);
  return { point, t, distance: dist(p, point) };
}

/** True if the segments lie on a shared line and overlap for more than `minOverlap`. */
export function collinearOverlap(a1: Vec2, a2: Vec2, b1: Vec2, b2: Vec2, eps = 1e-4, minOverlap = 1e-3): boolean {
  const d = sub(a2, a1);
  const l = Math.hypot(d.x, d.y);
  if (l < EPS) return false;
  const off1 = Math.abs(cross(d, sub(b1, a1))) / l;
  const off2 = Math.abs(cross(d, sub(b2, a1))) / l;
  if (off1 > eps || off2 > eps) return false;
  const t1 = dot(sub(b1, a1), d) / (l * l);
  const t2 = dot(sub(b2, a1), d) / (l * l);
  const lo = Math.max(0, Math.min(t1, t2));
  const hi = Math.min(1, Math.max(t1, t2));
  return (hi - lo) * l > minOverlap;
}
