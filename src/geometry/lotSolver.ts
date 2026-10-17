import type { Vec2 } from "@/domain/types";
import { area, bbox, edgeLengths } from "./polygon";
import { dist } from "./vec";

/**
 * Pixels-per-metre from the traced pixel polygon and the known certificate lengths:
 * the median of per-edge ratios, which is robust to a single mis-assigned number.
 */
export function estimateScale(pixelPoly: readonly Vec2[], lengths: readonly (number | null)[]): number | null {
  const ratios: number[] = [];
  pixelPoly.forEach((p, i) => {
    const L = lengths[i];
    if (L && L > 0) ratios.push(dist(p, pixelPoly[(i + 1) % pixelPoly.length]) / L);
  });
  if (!ratios.length) return null;
  ratios.sort((a, b) => a - b);
  const m = Math.floor(ratios.length / 2);
  return ratios.length % 2 ? ratios[m] : (ratios[m - 1] + ratios[m]) / 2;
}

export interface FitResult {
  polygon: Vec2[];
  /** Fitted length minus target length per edge (null where unknown). */
  residuals: (number | null)[];
  maxError: number;
  area: number;
}

function energy(pts: Vec2[], target: (number | null)[], anchor: Vec2[], lambda: number): number {
  let e = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const L = target[i];
    if (L != null) {
      const d = dist(pts[i], pts[(i + 1) % n]) - L;
      e += d * d;
    }
    const ax = pts[i].x - anchor[i].x;
    const ay = pts[i].y - anchor[i].y;
    e += lambda * (ax * ax + ay * ay);
  }
  return e;
}

function gradient(pts: Vec2[], target: (number | null)[], anchor: Vec2[], lambda: number): Vec2[] {
  const n = pts.length;
  const g = pts.map((p, i) => ({
    x: 2 * lambda * (p.x - anchor[i].x),
    y: 2 * lambda * (p.y - anchor[i].y),
  }));
  for (let i = 0; i < n; i++) {
    const L = target[i];
    if (L == null) continue;
    const j = (i + 1) % n;
    const dx = pts[j].x - pts[i].x;
    const dy = pts[j].y - pts[i].y;
    const l = Math.hypot(dx, dy) || 1e-12;
    const k = (2 * (l - L)) / l;
    g[j].x += k * dx;
    g[j].y += k * dy;
    g[i].x -= k * dx;
    g[i].y -= k * dy;
  }
  return g;
}

/**
 * Adjusts the traced polygon (already in metres) so its edges match the certificate
 * lengths as closely as possible while staying close to the traced shape (which
 * carries the angle information the certificate usually lacks).
 */
export function fitLotPolygon(
  initial: readonly Vec2[],
  lengths: readonly (number | null)[],
  { lambda = 1e-3, iterations = 4000, tolerance = 1e-12 } = {},
): FitResult {
  const target = initial.map((_, i) => {
    const L = lengths[i];
    return L != null && L > 0 ? L : null;
  });
  const anchor = initial.map((p) => ({ ...p }));
  let pts = initial.map((p) => ({ ...p }));
  let step = 0.1;
  let e = energy(pts, target, anchor, lambda);

  for (let it = 0; it < iterations; it++) {
    const g = gradient(pts, target, anchor, lambda);
    let accepted = false;
    let improvement = 0;
    for (let tries = 0; tries < 30; tries++) {
      const cand = pts.map((p, i) => ({ x: p.x - step * g[i].x, y: p.y - step * g[i].y }));
      const ce = energy(cand, target, anchor, lambda);
      if (ce < e) {
        improvement = e - ce;
        pts = cand;
        e = ce;
        step *= 1.2;
        accepted = true;
        break;
      }
      step *= 0.5;
    }
    if (!accepted || improvement < tolerance) break;
  }

  const fitted = edgeLengths(pts);
  const residuals = target.map((L, i) => (L == null ? null : fitted[i] - L));
  const maxError = residuals.reduce<number>((m, r) => Math.max(m, Math.abs(r ?? 0)), 0);
  return { polygon: normalizeOrigin(pts), residuals, maxError, area: area(pts) };
}

/** Translates the polygon so its bounding box starts at (0, 0). */
export function normalizeOrigin(pts: readonly Vec2[]): Vec2[] {
  const b = bbox(pts);
  return pts.map((p) => ({ x: p.x - b.minX, y: p.y - b.minY }));
}

/** Converts the traced pixel polygon to metres and fits it to the certificate lengths. */
export function solveLot(
  pixelPoly: readonly Vec2[],
  lengths: readonly (number | null)[],
  pxPerMeterOverride?: number,
): (FitResult & { pxPerMeter: number }) | null {
  if (pixelPoly.length < 3) return null;
  const pxPerMeter = pxPerMeterOverride ?? estimateScale(pixelPoly, lengths);
  if (!pxPerMeter || !Number.isFinite(pxPerMeter) || pxPerMeter <= 0) return null;
  const metres = pixelPoly.map((p) => ({ x: p.x / pxPerMeter, y: p.y / pxPerMeter }));
  return { ...fitLotPolygon(metres, lengths), pxPerMeter };
}
