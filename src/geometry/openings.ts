import type { Opening, Vec2, Wall } from "@/domain/types";
import { clamp, dist, lerp, normalize, perp, sub } from "./vec";

/** Minimum solid wall kept at each end of a wall next to an opening (m). */
export const OPENING_END_MARGIN = 0.05;

export const wallLength = (w: Wall): number => dist(w.a, w.b);

export function wallDirection(w: Wall): Vec2 {
  return normalize(sub(w.b, w.a));
}

export function wallNormal(w: Wall): Vec2 {
  return perp(wallDirection(w));
}

/** Point on the wall centre line at distance `d` from wall.a. */
export function pointAlongWall(w: Wall, d: number): Vec2 {
  const L = wallLength(w);
  return L === 0 ? w.a : lerp(w.a, w.b, d / L);
}

/** Corners of the wall's thick rectangle (a-left, b-left, b-right, a-right). */
export function wallQuad(w: Wall): Vec2[] {
  const n = wallNormal(w);
  const h = w.thickness / 2;
  return [
    { x: w.a.x + n.x * h, y: w.a.y + n.y * h },
    { x: w.b.x + n.x * h, y: w.b.y + n.y * h },
    { x: w.b.x - n.x * h, y: w.b.y - n.y * h },
    { x: w.a.x - n.x * h, y: w.a.y - n.y * h },
  ];
}

/** Clamps an opening so it fits on its wall. */
export function clampOpening(o: Opening, wall: Wall): Opening {
  const L = wallLength(wall);
  const width = clamp(o.width, 0.2, Math.max(0.2, L - 2 * OPENING_END_MARGIN));
  const lo = width / 2 + OPENING_END_MARGIN;
  const offset = clamp(o.offset, lo, Math.max(lo, L - lo));
  return { ...o, width, offset };
}

export function openingSpan(o: Opening): [number, number] {
  return [o.offset - o.width / 2, o.offset + o.width / 2];
}

/** True if two openings on the same wall overlap. */
export function openingsOverlap(a: Opening, b: Opening): boolean {
  if (a.wallId !== b.wallId) return false;
  const [a0, a1] = openingSpan(a);
  const [b0, b1] = openingSpan(b);
  return a0 < b1 - 1e-6 && b0 < a1 - 1e-6;
}

export interface WallPiece {
  /** Start / end distance along the wall. */
  start: number;
  end: number;
  bottom: number;
  top: number;
}

/**
 * Splits a wall into solid boxes around its openings (used for 3D extrusion):
 * full-height piers between openings plus the parts below sills and above heads.
 */
export function wallPieces(wall: Wall, openings: readonly Opening[], height: number): WallPiece[] {
  const L = wallLength(wall);
  const sorted = openings
    .filter((o) => o.wallId === wall.id)
    .map((o) => clampOpening(o, wall))
    .sort((p, q) => p.offset - q.offset);
  const pieces: WallPiece[] = [];
  let cursor = 0;
  for (const o of sorted) {
    const [s, e] = openingSpan(o);
    const start = Math.max(s, cursor);
    if (start > cursor + 1e-6) pieces.push({ start: cursor, end: start, bottom: 0, top: height });
    if (e <= start) continue;
    const sill = clamp(o.sill, 0, height);
    const head = clamp(o.sill + o.height, sill, height);
    if (sill > 1e-6) pieces.push({ start, end: e, bottom: 0, top: sill });
    if (head < height - 1e-6) pieces.push({ start, end: e, bottom: head, top: height });
    cursor = Math.max(cursor, e);
  }
  if (cursor < L - 1e-6) pieces.push({ start: cursor, end: L, bottom: 0, top: height });
  return pieces;
}
