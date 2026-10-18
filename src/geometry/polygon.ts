import type { Vec2 } from "@/domain/types";
import { cross, dist, EPS, sub } from "./vec";
import { segmentIntersection } from "./segment";

/** Signed area (shoelace). Positive when vertices run clockwise on screen (y down). */
export function signedArea(poly: readonly Vec2[]): number {
  let s = 0;
  for (let i = 0, n = poly.length; i < n; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

export const area = (poly: readonly Vec2[]): number => Math.abs(signedArea(poly));

export function perimeter(poly: readonly Vec2[]): number {
  let p = 0;
  for (let i = 0; i < poly.length; i++) p += dist(poly[i], poly[(i + 1) % poly.length]);
  return p;
}

export function edgeLengths(poly: readonly Vec2[]): number[] {
  return poly.map((p, i) => dist(p, poly[(i + 1) % poly.length]));
}

export function centroid(poly: readonly Vec2[]): Vec2 {
  const a = signedArea(poly);
  if (Math.abs(a) < EPS) {
    const n = poly.length || 1;
    return {
      x: poly.reduce((s, p) => s + p.x, 0) / n,
      y: poly.reduce((s, p) => s + p.y, 0) / n,
    };
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0, n = poly.length; i < n; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % n];
    const f = p.x * q.y - q.x * p.y;
    cx += (p.x + q.x) * f;
    cy += (p.y + q.y) * f;
  }
  return { x: cx / (6 * a), y: cy / (6 * a) };
}

/** Ray-casting point in polygon. Points on the boundary count as inside. */
export function pointInPolygon(p: Vec2, poly: readonly Vec2[], eps = 1e-7): boolean {
  if (pointOnPolygonBoundary(p, poly, eps)) return true;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

export function pointOnPolygonBoundary(p: Vec2, poly: readonly Vec2[], eps = 1e-7): boolean {
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const ab = sub(b, a);
    const ap = sub(p, a);
    const l2 = ab.x * ab.x + ab.y * ab.y;
    if (l2 < EPS) {
      if (dist(a, p) <= eps) return true;
      continue;
    }
    if (Math.abs(cross(ab, ap)) / Math.sqrt(l2) > eps) continue;
    const t = (ap.x * ab.x + ap.y * ab.y) / l2;
    if (t >= -eps && t <= 1 + eps) return true;
  }
  return false;
}

/** Makes the polygon wind clockwise on screen (positive signed area). */
export function ensureClockwise(poly: Vec2[]): Vec2[] {
  return signedArea(poly) < 0 ? [...poly].reverse() : poly;
}

export function ensureCounterClockwise(poly: Vec2[]): Vec2[] {
  return signedArea(poly) > 0 ? [...poly].reverse() : poly;
}

export function bbox(points: readonly Vec2[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

/** True when no two non-adjacent edges intersect. */
export function isSimplePolygon(poly: readonly Vec2[]): boolean {
  const n = poly.length;
  if (n < 3) return false;
  for (let i = 0; i < n; i++) {
    const a1 = poly[i];
    const a2 = poly[(i + 1) % n];
    for (let j = i + 1; j < n; j++) {
      if ((j + 1) % n === i || (i + 1) % n === j) continue;
      const b1 = poly[j];
      const b2 = poly[(j + 1) % n];
      if (segmentIntersection(a1, a2, b1, b2)) return false;
    }
  }
  return true;
}

/** Removes consecutive duplicates and collinear vertices. */
export function simplifyPolygon(poly: readonly Vec2[], eps = 1e-6): Vec2[] {
  let pts = poly.filter((p, i) => dist(p, poly[(i + 1) % poly.length]) > eps);
  let changed = true;
  while (changed && pts.length > 3) {
    changed = false;
    for (let i = 0; i < pts.length; i++) {
      const prev = pts[(i - 1 + pts.length) % pts.length];
      const cur = pts[i];
      const next = pts[(i + 1) % pts.length];
      const c = cross(sub(cur, prev), sub(next, cur));
      const d = (cur.x - prev.x) * (next.x - cur.x) + (cur.y - prev.y) * (next.y - cur.y);
      if (Math.abs(c) <= eps * Math.max(1, dist(prev, next)) && d > 0) {
        pts = pts.filter((_, k) => k !== i);
        changed = true;
        break;
      }
    }
  }
  return pts;
}

/** Regular polygon approximating a circle. */
export function circlePolygon(center: Vec2, radius: number, segments = 32): Vec2[] {
  const pts: Vec2[] = [];
  for (let i = 0; i < segments; i++) {
    const t = (i / segments) * Math.PI * 2;
    pts.push({ x: center.x + Math.cos(t) * radius, y: center.y + Math.sin(t) * radius });
  }
  return pts;
}

/** True if every vertex of `inner` lies inside `outer` and no edges properly cross. */
export function polygonInsidePolygon(inner: readonly Vec2[], outer: readonly Vec2[], eps = 1e-6): boolean {
  if (!inner.every((p) => pointInPolygon(p, outer, eps))) return false;
  for (let i = 0; i < inner.length; i++) {
    const a = inner[i];
    const b = inner[(i + 1) % inner.length];
    for (let j = 0; j < outer.length; j++) {
      const c = outer[j];
      const d = outer[(j + 1) % outer.length];
      const hit = segmentIntersection(a, b, c, d);
      if (hit && hit.t > eps && hit.t < 1 - eps && hit.u > eps && hit.u < 1 - eps) return false;
    }
  }
  return true;
}

/**
 * Keeps the part of a polygon on the side of the line through `origin` that `normal`
 * points to (Sutherland–Hodgman against one half-plane). Works for concave input; the
 * result may contain zero-width bridges but its area is exact. Empty when nothing is kept.
 */
export function clipHalfPlane(poly: readonly Vec2[], origin: Vec2, normal: Vec2): Vec2[] {
  const side = (p: Vec2) => (p.x - origin.x) * normal.x + (p.y - origin.y) * normal.y;
  const out: Vec2[] = [];
  for (let i = 0, n = poly.length; i < n; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    const sa = side(a);
    const sb = side(b);
    if (sa >= 0) out.push(a);
    if ((sa >= 0) !== (sb >= 0)) {
      const t = sa / (sa - sb);
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  const cleaned = out.filter((p, i) => dist(p, out[(i + 1) % out.length]) > 1e-9);
  return cleaned.length >= 3 && area(cleaned) > 1e-9 ? cleaned : [];
}
