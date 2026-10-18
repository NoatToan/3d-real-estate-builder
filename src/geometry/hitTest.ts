import type { Floor, Id, Vec2, Wall } from "@/domain/types";
import { area, pointInPolygon } from "./polygon";
import { projectOnSegment } from "./segment";
import { pointAlongWall, wallDirection, wallLength, wallNormal } from "./openings";
import { generateStair } from "./stairs";
import { dist } from "./vec";

export type HitKind = "opening" | "stair" | "wall" | "room";

export interface Hit {
  kind: HitKind;
  id: Id;
}

/**
 * Finds the entity under a plan point. Priority: openings > stairs > walls > rooms
 * (smallest room wins when rooms overlap).
 */
export function hitTest(floor: Floor, p: Vec2, tolerance: number): Hit | null {
  const walls = new Map(floor.walls.map((w) => [w.id, w]));

  for (const o of floor.openings) {
    const w = walls.get(o.wallId);
    if (!w) continue;
    const u = wallDirection(w);
    const c = pointAlongWall(w, o.offset);
    const a = { x: c.x - (u.x * o.width) / 2, y: c.y - (u.y * o.width) / 2 };
    const b = { x: c.x + (u.x * o.width) / 2, y: c.y + (u.y * o.width) / 2 };
    if (projectOnSegment(p, a, b).distance <= Math.max(tolerance, w.thickness / 2)) return { kind: "opening", id: o.id };
  }

  for (const s of floor.stairs) {
    if (pointInPolygon(p, generateStair(s, floor.height).footprint)) return { kind: "stair", id: s.id };
  }

  let bestWall: { id: Id; d: number } | null = null;
  for (const w of floor.walls) {
    const d = projectOnSegment(p, w.a, w.b).distance;
    if (d <= Math.max(tolerance, w.thickness / 2) && (!bestWall || d < bestWall.d)) bestWall = { id: w.id, d };
  }
  if (bestWall) return { kind: "wall", id: bestWall.id };

  let bestRoom: { id: Id; a: number } | null = null;
  for (const r of floor.rooms) {
    const poly = r.netPolygon ?? r.polygon;
    if (pointInPolygon(p, poly)) {
      const a = area(poly);
      if (!bestRoom || a < bestRoom.a) bestRoom = { id: r.id, a };
    }
  }
  return bestRoom ? { kind: "room", id: bestRoom.id } : null;
}

/** Wall endpoints shared with at least one other wall (to draw clean joints). */
export function connectedEndpoints(walls: readonly Wall[], eps = 1e-3): Map<Id, { a: boolean; b: boolean }> {
  const out = new Map<Id, { a: boolean; b: boolean }>();
  for (const w of walls) {
    const touches = (p: Vec2) => walls.some((o) => o.id !== w.id && (dist(o.a, p) < eps || dist(o.b, p) < eps));
    out.set(w.id, { a: touches(w.a), b: touches(w.b) });
  }
  return out;
}

/** Wall rectangle, extended by half the thickness at connected ends so corners close. */
export function wallRenderQuad(w: Wall, extendA: boolean, extendB: boolean): Vec2[] {
  const u = wallDirection(w);
  const n = wallNormal(w);
  const h = w.thickness / 2;
  const a = extendA ? { x: w.a.x - u.x * h, y: w.a.y - u.y * h } : w.a;
  const b = extendB ? { x: w.b.x + u.x * h, y: w.b.y + u.y * h } : w.b;
  return [
    { x: a.x + n.x * h, y: a.y + n.y * h },
    { x: b.x + n.x * h, y: b.y + n.y * h },
    { x: b.x - n.x * h, y: b.y - n.y * h },
    { x: a.x - n.x * h, y: a.y - n.y * h },
  ];
}

/** Nearest wall to a point within tolerance, with the distance along the wall. */
export function nearestWall(walls: readonly Wall[], p: Vec2, tolerance: number): { wall: Wall; offset: number; point: Vec2 } | null {
  let best: { wall: Wall; offset: number; point: Vec2; d: number } | null = null;
  for (const w of walls) {
    const pr = projectOnSegment(p, w.a, w.b);
    const d = pr.distance;
    if (d <= Math.max(tolerance, w.thickness) && (!best || d < best.d)) best = { wall: w, offset: pr.t * wallLength(w), point: pr.point, d };
  }
  return best ? { wall: best.wall, offset: best.offset, point: best.point } : null;
}
