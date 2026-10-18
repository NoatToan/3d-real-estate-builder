import type { Floor, Furniture, FurnitureKind, Opening, Project, Room, RoomType, Vec2, Wall } from "./types";
import { createOpening, createWall } from "./factory";
import { createFurniture, furnitureRect, furnitureSpec } from "./furniture";
import { cutLineOrigin } from "./roadCut";
import { outlineFrontEdge, quickFloorOutline } from "./quickFloor";
import { reconcileRooms } from "./rooms";
import { insetPolygon } from "@/geometry/offset";
import { clampOpening, openingsOverlap } from "@/geometry/openings";
import { pointInPolygon, pointOnPolygonBoundary, polygonInsidePolygon } from "@/geometry/polygon";
import { generateStair } from "@/geometry/stairs";
import { add, dist, dot, normalize, perp, scale, sub } from "@/geometry/vec";

/**
 * "Phòng mẫu": drops a standard-size room (bedroom, WC, kitchen…) into the free space of a
 * floor. Candidate spots are scored with plain rules a designer would use — a bedroom wants a
 * facade wall for its window, the quiet back of the house, a WC nearby and no kitchen or
 * garage next door — and every candidate must leave the rest of the floor reachable.
 * Rule-based on purpose: fast, explainable and works offline.
 */

export interface RoomTemplate {
  id: string;
  label: string;
  /** Room name given to the placed room (numbered when it repeats). */
  name: string;
  type: RoomType;
  /** Clear (inside the walls) size in metres. */
  width: number;
  depth: number;
  /** Recommended minimums, shown as a warning when the user goes below them. */
  minWidth: number;
  minArea: number;
  furniture: FurnitureKind[];
  /** "required": a window on the front/back facade (side walls usually touch the neighbours). */
  window: "required" | "nice" | "no";
  facade: "front" | "back" | "any";
  near: RoomType[];
  avoid: RoomType[];
  /** true: keep away from the stair (noise); false: wants to be next to it (plumbing core). */
  quiet: boolean;
  doorWidth: number;
  description: string;
}

const BEDROOM: Pick<RoomTemplate, "type" | "window" | "facade" | "near" | "avoid" | "quiet" | "doorWidth"> = {
  type: "bedroom",
  window: "required",
  facade: "back",
  near: ["wc", "bathroom"],
  avoid: ["kitchen", "garage", "laundry"],
  quiet: true,
  doorWidth: 0.8,
};

export const ROOM_TEMPLATES: readonly RoomTemplate[] = [
  { id: "master", label: "Phòng ngủ master", name: "Phòng ngủ master", ...BEDROOM, width: 3.6, depth: 4.2, minWidth: 3, minArea: 12, furniture: ["bedDouble", "nightstand", "nightstand", "wardrobe"], description: "Giường 1m8, 2 tab, tủ áo" },
  { id: "double", label: "Phòng ngủ đôi", name: "Phòng ngủ", ...BEDROOM, width: 3.3, depth: 3.6, minWidth: 2.7, minArea: 10, furniture: ["bedDouble", "nightstand", "wardrobe"], description: "Giường 1m8, tủ áo" },
  { id: "single", label: "Phòng ngủ đơn / trẻ em", name: "Phòng ngủ", ...BEDROOM, width: 2.7, depth: 3.3, minWidth: 2.4, minArea: 8, furniture: ["bedSingle", "wardrobe", "desk"], description: "Giường 1m, tủ áo, bàn học" },
  { id: "wc", label: "WC / tắm", name: "WC", type: "wc", width: 1.5, depth: 2.2, minWidth: 1.2, minArea: 2.5, furniture: ["toilet", "basin", "shower"], window: "no", facade: "any", near: ["bedroom", "corridor"], avoid: ["kitchen"], quiet: false, doorWidth: 0.7, description: "Xí, lavabo, sen tắm" },
  { id: "kitchen", label: "Bếp + ăn", name: "Bếp + ăn", type: "kitchen", width: 3, depth: 4.2, minWidth: 2.4, minArea: 9, furniture: ["kitchenCounter", "fridge", "diningTable4"], window: "nice", facade: "back", near: ["living", "dining"], avoid: ["wc", "bedroom"], quiet: false, doorWidth: 0.9, description: "Tủ bếp, tủ lạnh, bàn ăn 4" },
  { id: "office", label: "Phòng làm việc", name: "Phòng làm việc", type: "office", width: 2.7, depth: 3, minWidth: 2.2, minArea: 6, furniture: ["desk", "officeChair", "bookshelf"], window: "nice", facade: "front", near: [], avoid: ["kitchen", "garage"], quiet: true, doorWidth: 0.8, description: "Bàn, ghế, kệ sách" },
  { id: "worship", label: "Phòng thờ", name: "Phòng thờ", type: "worship", width: 2.7, depth: 3, minWidth: 2.2, minArea: 6, furniture: ["altar"], window: "nice", facade: "front", near: [], avoid: ["wc", "kitchen"], quiet: true, doorWidth: 0.9, description: "Bàn thờ, nên ở tầng trên cùng" },
  { id: "storage", label: "Kho", name: "Kho", type: "storage", width: 1.5, depth: 2, minWidth: 1, minArea: 2, furniture: [], window: "no", facade: "any", near: [], avoid: [], quiet: false, doorWidth: 0.7, description: "Kho đồ" },
];

export const roomTemplate = (id: string): RoomTemplate => ROOM_TEMPLATES.find((t) => t.id === id) ?? ROOM_TEMPLATES[0];

/** Ready-made sets for "Tự xếp phòng": placed one after another, best spot first. */
export const ROOM_PROGRAMMES: readonly { id: string; label: string; rooms: string[] }[] = [
  { id: "2bed", label: "2 phòng ngủ + WC", rooms: ["double", "double", "wc"] },
  { id: "master", label: "Master + phòng ngủ đơn + WC", rooms: ["master", "single", "wc"] },
  { id: "3bed", label: "3 phòng ngủ + 2 WC", rooms: ["double", "double", "single", "wc", "wc"] },
  { id: "work", label: "Phòng làm việc + kho + WC", rooms: ["office", "storage", "wc"] },
];

/** Room types that count as free space a new room can be carved out of. */
export const FREE_ROOM_TYPES: readonly RoomType[] = ["other", "corridor"];

export interface RoomRequest {
  template: RoomTemplate;
  /** Clear size; defaults to the template's. */
  width?: number;
  depth?: number;
}

export interface RoomPlacement {
  key: string;
  hostId: string;
  /** Wall centre-line corners of the new room. */
  rect: Vec2[];
  score: number;
  pros: string[];
  cons: string[];
  walls: Wall[];
  openings: Opening[];
  furniture: Furniture[];
  label: { at: Vec2; name: string; type: RoomType };
  clearWidth: number;
  clearDepth: number;
}

// ---------------------------------------------------------------------------------------------
// Frame: d runs from the street into the lot, s across the frontage. Rooms are axis-aligned in it.

interface Frame {
  origin: Vec2;
  n: Vec2;
  a: Vec2;
}
interface Box {
  d0: number;
  d1: number;
  s0: number;
  s1: number;
}
type SideKey = "front" | "back" | "left" | "right";
const SIDES: readonly SideKey[] = ["front", "back", "left", "right"];

const toWorld = (F: Frame, d: number, s: number): Vec2 => add(add(F.origin, scale(F.n, d)), scale(F.a, s));
const depthOf = (F: Frame, p: Vec2) => dot(sub(p, F.origin), F.n);
const acrossOf = (F: Frame, p: Vec2) => dot(sub(p, F.origin), F.a);

export function floorFrame(p: Project): Frame {
  const outline = quickFloorOutline(p);
  if (outline.length < 3) return { origin: { x: 0, y: 0 }, n: { x: 0, y: 1 }, a: { x: -1, y: 0 } };
  const lotEdge = p.constraints.roadCut.enabled ? p.constraints.roadCut.edge : 0;
  const { origin, normal } = cutLineOrigin(outline, outlineFrontEdge(outline, p.lot.polygon, lotEdge), 0);
  return { origin, n: normal, a: perp(normal) };
}

function frameBox(F: Frame, pts: readonly Vec2[]): Box {
  const ds = pts.map((p) => depthOf(F, p));
  const ss = pts.map((p) => acrossOf(F, p));
  return { d0: Math.min(...ds), d1: Math.max(...ds), s0: Math.min(...ss), s1: Math.max(...ss) };
}
const boxCorners = (F: Frame, b: Box): Vec2[] => [toWorld(F, b.d0, b.s0), toWorld(F, b.d0, b.s1), toWorld(F, b.d1, b.s1), toWorld(F, b.d1, b.s0)];
const grow = (b: Box, m: number): Box => ({ d0: b.d0 - m, d1: b.d1 + m, s0: b.s0 - m, s1: b.s1 + m });
const overlaps = (p: Box, q: Box) => p.d0 < q.d1 && q.d0 < p.d1 && p.s0 < q.s1 && q.s0 < p.s1;
const boxGap = (p: Box, q: Box) => Math.max(0, Math.max(p.d0, q.d0) - Math.min(p.d1, q.d1), Math.max(p.s0, q.s0) - Math.min(p.s1, q.s1));

/** Side of a box as a world segment (start → end) plus its outward normal. */
function sideOf(F: Frame, b: Box, k: SideKey): { p: Vec2; q: Vec2; out: Vec2 } {
  switch (k) {
    case "front":
      return { p: toWorld(F, b.d0, b.s0), q: toWorld(F, b.d0, b.s1), out: scale(F.n, -1) };
    case "back":
      return { p: toWorld(F, b.d1, b.s0), q: toWorld(F, b.d1, b.s1), out: F.n };
    case "left":
      return { p: toWorld(F, b.d0, b.s0), q: toWorld(F, b.d1, b.s0), out: scale(F.a, -1) };
    case "right":
      return { p: toWorld(F, b.d0, b.s1), q: toWorld(F, b.d1, b.s1), out: F.a };
  }
}
const OPPOSITE: Record<SideKey, SideKey> = { front: "back", back: "front", left: "right", right: "left" };

// ---------------------------------------------------------------------------------------------
// Walls along a segment

interface Cover {
  wall: Wall;
  t0: number;
  t1: number;
}

/** Parts of segment p→q (as 0..1 parameters) lying on existing collinear walls. */
function coverOnSegment(walls: readonly Wall[], p: Vec2, q: Vec2): Cover[] {
  const L = dist(p, q);
  if (L < 1e-6) return [];
  const u = scale(sub(q, p), 1 / L);
  const nrm = perp(u);
  const out: Cover[] = [];
  for (const w of walls) {
    if (Math.abs(dot(sub(w.a, p), nrm)) > 0.02 || Math.abs(dot(sub(w.b, p), nrm)) > 0.02) continue;
    const ta = dot(sub(w.a, p), u) / L;
    const tb = dot(sub(w.b, p), u) / L;
    const t0 = Math.max(0, Math.min(ta, tb));
    const t1 = Math.min(1, Math.max(ta, tb));
    if ((t1 - t0) * L > 0.01) out.push({ wall: w, t0, t1 });
  }
  return out;
}

/** Parameter intervals of [0, 1] not covered. */
function uncovered(covers: readonly Cover[]): [number, number][] {
  const iv = covers.map((c) => [c.t0, c.t1] as [number, number]).sort((x, y) => x[0] - y[0]);
  const out: [number, number][] = [];
  let t = 0;
  for (const [a, b] of iv) {
    if (a > t) out.push([t, a]);
    t = Math.max(t, b);
  }
  if (t < 1) out.push([t, 1]);
  return out;
}

type Exposure = "front" | "back" | "side" | null;

/** Exterior walls have a room on one side only; front/back are the ones running across the lot. */
function wallExposure(F: Frame, rooms: readonly Room[], w: Wall, midDepth: number): Exposure {
  const L = dist(w.a, w.b);
  if (L < 1e-6) return null;
  const mid = scale(add(w.a, w.b), 0.5);
  const nrm = perp(scale(sub(w.b, w.a), 1 / L));
  const off = w.thickness / 2 + 0.08;
  const in1 = rooms.some((r) => pointInPolygon(add(mid, scale(nrm, off)), r.polygon));
  const in2 = rooms.some((r) => pointInPolygon(add(mid, scale(nrm, -off)), r.polygon));
  if (in1 === in2) return null;
  if (Math.abs(dot(normalize(sub(w.b, w.a)), F.a)) < 0.9) return "side";
  return depthOf(F, mid) < midDepth ? "front" : "back";
}

// ---------------------------------------------------------------------------------------------
// Host grid: free cells of the host room, used to check that the floor stays walkable.

const STEP = 0.1;
/** Clearance (cells) from walls and the new room: ~0.8 m wide passages. */
const CLEAR = 4;

interface Grid {
  box: Box;
  nd: number;
  ns: number;
  walk: Uint8Array;
}

function buildGrid(F: Frame, host: Room): Grid {
  const box = frameBox(F, host.polygon);
  const nd = Math.max(1, Math.ceil((box.d1 - box.d0) / STEP));
  const ns = Math.max(1, Math.ceil((box.s1 - box.s0) / STEP));
  const inside = new Uint8Array(nd * ns);
  for (let i = 0; i < nd; i++)
    for (let j = 0; j < ns; j++) inside[i * ns + j] = pointInPolygon(toWorld(F, box.d0 + (i + 0.5) * STEP, box.s0 + (j + 0.5) * STEP), host.polygon) ? 1 : 0;
  // Chebyshev distance to the nearest outside cell (two-pass chamfer).
  const BIG = 1 << 20;
  const dd = new Int32Array(nd * ns);
  for (let k = 0; k < dd.length; k++) dd[k] = inside[k] ? BIG : 0;
  const at = (i: number, j: number) => (i < 0 || j < 0 || i >= nd || j >= ns ? 0 : dd[i * ns + j]);
  for (let i = 0; i < nd; i++)
    for (let j = 0; j < ns; j++) {
      const k = i * ns + j;
      if (!dd[k]) continue;
      dd[k] = Math.min(dd[k], at(i - 1, j - 1) + 1, at(i - 1, j) + 1, at(i - 1, j + 1) + 1, at(i, j - 1) + 1);
    }
  for (let i = nd - 1; i >= 0; i--)
    for (let j = ns - 1; j >= 0; j--) {
      const k = i * ns + j;
      if (!dd[k]) continue;
      dd[k] = Math.min(dd[k], at(i + 1, j + 1) + 1, at(i + 1, j) + 1, at(i + 1, j - 1) + 1, at(i, j + 1) + 1);
    }
  const walk = new Uint8Array(nd * ns);
  for (let k = 0; k < dd.length; k++) walk[k] = dd[k] >= CLEAR ? 1 : 0;
  return { box, nd, ns, walk };
}

function cellOf(g: Grid, d: number, s: number): number {
  const i = Math.floor((d - g.box.d0) / STEP);
  const j = Math.floor((s - g.box.s0) / STEP);
  return i < 0 || j < 0 || i >= g.nd || j >= g.ns ? -1 : i * g.ns + j;
}

/** Nearest walkable cell to (d, s) within r metres, honouring the blocked box. */
function nearestWalk(g: Grid, blocked: Box | null, d: number, s: number, r = 0.6): number {
  let best = -1;
  let bestD = Infinity;
  const k = Math.ceil(r / STEP);
  for (let di = -k; di <= k; di++)
    for (let sj = -k; sj <= k; sj++) {
      const dd = d + di * STEP;
      const ss = s + sj * STEP;
      const c = cellOf(g, dd, ss);
      if (c < 0 || !g.walk[c] || (blocked && isBlocked(g, blocked, c))) continue;
      const e = di * di + sj * sj;
      if (e < bestD) {
        bestD = e;
        best = c;
      }
    }
  return best;
}

function isBlocked(g: Grid, b: Box, c: number): boolean {
  const i = Math.floor(c / g.ns);
  const j = c % g.ns;
  const d = g.box.d0 + (i + 0.5) * STEP;
  const s = g.box.s0 + (j + 0.5) * STEP;
  const m = CLEAR * STEP;
  return d > b.d0 - m && d < b.d1 + m && s > b.s0 - m && s < b.s1 + m;
}

/** BFS distances (cells) from the sources over walkable, unblocked cells; −1 = unreachable. */
function reach(g: Grid, blocked: Box, sources: number[]): Int32Array {
  const distc = new Int32Array(g.nd * g.ns).fill(-1);
  const q: number[] = [];
  for (const c of sources) {
    if (c < 0 || distc[c] >= 0) continue;
    distc[c] = 0;
    q.push(c);
  }
  for (let h = 0; h < q.length; h++) {
    const c = q[h];
    const i = Math.floor(c / g.ns);
    const j = c % g.ns;
    const nb = [i > 0 ? c - g.ns : -1, i < g.nd - 1 ? c + g.ns : -1, j > 0 ? c - 1 : -1, j < g.ns - 1 ? c + 1 : -1];
    for (const x of nb) {
      if (x < 0 || distc[x] >= 0 || !g.walk[x] || isBlocked(g, blocked, x)) continue;
      distc[x] = distc[c] + 1;
      q.push(x);
    }
  }
  return distc;
}

// ---------------------------------------------------------------------------------------------

interface Context {
  F: Frame;
  floor: Floor;
  tInt: number;
  midDepth: number;
  exposure: Map<string, Exposure>;
  stairBoxes: Box[];
}

function contextFor(p: Project, floor: Floor): Context {
  const F = floorFrame(p);
  const ds = floor.walls.flatMap((w) => [depthOf(F, w.a), depthOf(F, w.b)]);
  const midDepth = ds.length ? (Math.min(...ds) + Math.max(...ds)) / 2 : 0;
  const exposure = new Map(floor.walls.map((w) => [w.id, wallExposure(F, floor.rooms, w, midDepth)]));
  // Stairs rising from this floor and the stair well of the one arriving from the floor below.
  const below = p.floors[p.floors.findIndex((f) => f.id === floor.id) - 1];
  const stairBoxes = [...floor.stairs.map((s) => frameBox(F, generateStair(s, floor.height).footprint)), ...(below?.stairs ?? []).map((s) => frameBox(F, generateStair(s, below.height).footprint))];
  return { F, floor, tInt: p.defaults.wallThickness, midDepth, exposure, stairBoxes };
}

function uniqueSorted(v: number[]): number[] {
  const s = [...v].sort((x, y) => x - y);
  return s.filter((x, i) => i === 0 || x - s[i - 1] > 0.04);
}

function roomName(floor: Floor, base: string): string {
  const used = new Set(floor.rooms.map((r) => r.name));
  if (!used.has(base) && base !== "Phòng ngủ") return base;
  for (let k = base === "Phòng ngủ" ? 1 : 2; ; k++) if (!used.has(`${base} ${k}`)) return `${base} ${k}`;
}

interface Door {
  side: SideKey;
  t: number;
  dist: number;
}

/** Best spots for a room on the floor, best first. Empty when it doesn't fit anywhere. */
export function findRoomPlacements(project: Project, floor: Floor, req: RoomRequest, limit = 3): RoomPlacement[] {
  const T = req.template;
  const cw = Math.max(0.6, req.width ?? T.width);
  const cd = Math.max(0.6, req.depth ?? T.depth);
  const ctx = contextFor(project, floor);
  const { F, tInt } = ctx;
  const hosts = floor.rooms.filter((r) => FREE_ROOM_TYPES.includes(r.type));
  const scored: { box: Box; host: Room; score: number; pros: string[]; cons: string[]; door: Door }[] = [];

  for (const host of hosts) {
    const hb = frameBox(F, host.polygon);
    const grid = buildGrid(F, host);
    const obstacles = [
      ...ctx.stairBoxes.map((b) => grow(b, 0.6)),
      ...floor.furniture.map((f) => frameBox(F, furnitureRect(f))),
    ];
    // Access points: doors in the host's walls and stairs arriving inside it.
    const doorZones: Box[] = [];
    const sourcePts: { d: number; s: number }[] = [];
    for (const o of floor.openings) {
      if (o.kind !== "door") continue;
      const w = floor.walls.find((x) => x.id === o.wallId);
      if (!w) continue;
      const u = normalize(sub(w.b, w.a));
      const c = add(w.a, scale(u, o.offset));
      if (!pointOnPolygonBoundary(c, host.polygon, 0.05)) continue;
      const nrm = perp(u);
      const inward = pointInPolygon(add(c, scale(nrm, 0.3)), host.polygon) && !pointOnPolygonBoundary(add(c, scale(nrm, 0.3)), host.polygon, 1e-3) ? nrm : scale(nrm, -1);
      const e0 = add(c, scale(u, -o.width / 2));
      const e1 = add(add(c, scale(u, o.width / 2)), scale(inward, 1.0));
      doorZones.push(frameBox(F, [e0, e1]));
      const sp = add(c, scale(inward, 0.5));
      sourcePts.push({ d: depthOf(F, sp), s: acrossOf(F, sp) });
    }
    for (const b of ctx.stairBoxes) {
      const c = { d: (b.d0 + b.d1) / 2, s: (b.s0 + b.s1) / 2 };
      if (pointInPolygon(toWorld(F, c.d, c.s), host.polygon)) sourcePts.push(c);
    }

    const vd = host.polygon.map((p) => depthOf(F, p));
    const vs = host.polygon.map((p) => acrossOf(F, p));
    for (const [W, D] of cw === cd ? [[cw, cd]] : [[cw, cd], [cd, cw]]) {
      const Wc = W + tInt;
      const Dc = D + tInt;
      const grid05 = (lo: number, hi: number) => Array.from({ length: Math.max(0, Math.floor((hi - lo) / 0.5)) + 1 }, (_, k) => lo + k * 0.5);
      const dAnchors = uniqueSorted([...vd.flatMap((v) => [v, v - Dc]), ...grid05(hb.d0, hb.d1 - Dc)]).filter((v) => v >= hb.d0 - 1e-6 && v + Dc <= hb.d1 + 1e-6);
      const sAnchors = uniqueSorted([...vs.flatMap((v) => [v, v - Wc]), ...grid05(hb.s0, hb.s1 - Wc)]).filter((v) => v >= hb.s0 - 1e-6 && v + Wc <= hb.s1 + 1e-6);
      for (const d0 of dAnchors)
        for (const s0 of sAnchors) {
          const box: Box = { d0, d1: d0 + Dc, s0, s1: s0 + Wc };
          if (!polygonInsidePolygon(boxCorners(F, grow(box, -0.01)), host.polygon)) continue;
          if (obstacles.some((o) => overlaps(o, box)) || doorZones.some((z) => overlaps(z, box))) continue;
          if (floor.walls.some((w) => [w.a, w.b].some((p) => overlaps(grow(box, -0.05), frameBox(F, [p]))))) continue;

          // Stay walkable: every access point still reachable, no area cut off.
          const sources = sourcePts.map((p) => nearestWalk(grid, box, p.d, p.s));
          if (sources.some((c) => c < 0)) continue;
          let seeds = sources;
          if (!seeds.length) {
            // No door or stair in this space (e.g. an empty shell): use any walkable cell left.
            const any = grid.walk.findIndex((v, c) => v === 1 && !isBlocked(grid, box, c));
            if (any < 0) continue;
            seeds = [any];
          }
          const distc = reach(grid, box, seeds);
          if (sources.some((c) => distc[c] < 0)) continue;
          let reached = 0;
          let freeLeft = 0;
          for (let c = 0; c < distc.length; c++) {
            if (!grid.walk[c] || isBlocked(grid, box, c)) continue;
            freeLeft++;
            if (distc[c] >= 0) reached++;
          }
          if ((freeLeft - reached) * STEP * STEP > 0.6) continue;

          // Door on a side that needs a new wall, opening onto reachable floor, nearest to the access.
          const covers = Object.fromEntries(SIDES.map((k) => [k, coverOnSegment(floor.walls, sideOf(F, box, k).p, sideOf(F, box, k).q)])) as Record<SideKey, Cover[]>;
          let door: Door | null = null;
          for (const k of SIDES) {
            const sd = sideOf(F, box, k);
            const L = dist(sd.p, sd.q);
            for (const [u0, u1] of uncovered(covers[k])) {
              const a0 = u0 * L;
              const a1 = u1 * L;
              if (a1 - a0 < T.doorWidth + 0.3) continue;
              for (const at of [a0 + 0.15 + T.doorWidth / 2, a1 - 0.15 - T.doorWidth / 2, (a0 + a1) / 2]) {
                const pt = add(add(sd.p, scale(normalize(sub(sd.q, sd.p)), at)), scale(sd.out, 0.5));
                const c = cellOf(grid, depthOf(F, pt), acrossOf(F, pt));
                const cc = c >= 0 && distc[c] >= 0 ? c : nearestWalk(grid, box, depthOf(F, pt), acrossOf(F, pt), 0.3);
                if (cc < 0 || distc[cc] < 0) continue;
                if (!door || distc[cc] < door.dist) door = { side: k, t: at / L, dist: distc[cc] };
              }
            }
          }
          if (!door) continue;

          const r = scoreSpot(ctx, T, box, covers, host, hb, sources.length ? door.dist * STEP : null);
          scored.push({ box, host, door, ...r });
        }
    }
  }

  scored.sort((x, y) => y.score - x.score);
  const picked: typeof scored = [];
  for (const c of scored) {
    if (picked.length >= limit) break;
    const cx = (c.box.d0 + c.box.d1) / 2;
    const cy = (c.box.s0 + c.box.s1) / 2;
    if (picked.some((p) => Math.hypot((p.box.d0 + p.box.d1) / 2 - cx, (p.box.s0 + p.box.s1) / 2 - cy) < 1.2)) continue;
    picked.push(c);
  }
  return picked.map((c, i) => buildPlacement(ctx, T, c.box, c.host, c.door, c.score, c.pros, c.cons, i));
}

function scoreSpot(ctx: Context, T: RoomTemplate, box: Box, covers: Record<SideKey, Cover[]>, host: Room, hb: Box, walk: number | null) {
  const { F, floor } = ctx;
  const pros: string[] = [];
  const cons: string[] = [];
  let score = 0;

  // Light: which facades does the room touch?
  const facades = new Set<Exposure>();
  let onWalls = 0;
  for (const k of SIDES) {
    const cv = covers[k];
    const covered = cv.reduce((s, c) => s + (c.t1 - c.t0), 0);
    if (covered > 0.9) onWalls++;
    for (const c of cv) {
      const e = ctx.exposure.get(c.wall.id);
      if (e && (c.t1 - c.t0) * dist(sideOf(F, box, k).p, sideOf(F, box, k).q) > 1) facades.add(e);
    }
  }
  const light = facades.has("front") || facades.has("back");
  const facadeName = facades.has("back") ? "mặt sau" : "mặt tiền";
  if (T.window === "required") {
    if (light) {
      score += 30;
      pros.push(`Giáp tường ${facadeName}: mở được cửa sổ lấy sáng, thông gió`);
    } else {
      score -= 30;
      cons.push(facades.has("side") ? "Chỉ giáp tường hông (giáp nhà bên), không mở được cửa sổ — phòng tối" : "Không giáp tường ngoài — phòng không có cửa sổ");
    }
  } else if (T.window === "nice") {
    if (light) {
      score += 12;
      pros.push(`Có cửa sổ ra ${facadeName}`);
    } else {
      score -= 6;
      cons.push("Không có cửa sổ");
    }
  } else if (light) {
    score -= 8;
    cons.push(`Chiếm tường ${facadeName} — nên để dành cho phòng cần ánh sáng`);
  }
  if (T.facade !== "any" && facades.has(T.facade)) {
    score += 8;
    pros.push(T.facade === "back" ? "Phía sau nhà, yên tĩnh, xa tiếng ồn đường" : "Hướng ra mặt tiền");
  }

  // Neighbours through each side.
  const neighbours = new Set<RoomType>();
  for (const k of SIDES) {
    const sd = sideOf(F, box, k);
    for (const t of [0.25, 0.5, 0.75]) {
      const pt = add(add(sd.p, scale(sub(sd.q, sd.p), t)), scale(sd.out, 0.35));
      const r = floor.rooms.find((x) => x.id !== host.id && pointInPolygon(pt, x.polygon));
      if (r) neighbours.add(r.type);
    }
  }
  const near = T.near.filter((t) => neighbours.has(t));
  const avoid = T.avoid.filter((t) => neighbours.has(t));
  const typeName: Partial<Record<RoomType, string>> = { wc: "WC", bathroom: "phòng tắm", bedroom: "phòng ngủ", kitchen: "bếp", garage: "chỗ để xe", laundry: "chỗ giặt phơi", living: "phòng khách", dining: "phòng ăn", corridor: "hành lang" };
  if (near.length) {
    score += 6;
    pros.push(`Cạnh ${near.map((t) => typeName[t] ?? t).join(", ")}`);
  }
  if (avoid.length) {
    score -= 10;
    cons.push(`Sát ${avoid.map((t) => typeName[t] ?? t).join(", ")}: mùi, tiếng ồn`);
  }

  // Stair: noise for quiet rooms, plumbing core for wet rooms.
  const nearStair = ctx.stairBoxes.some((b) => boxGap(b, box) < 0.8);
  if (nearStair && T.quiet) {
    score -= 5;
    cons.push("Sát cầu thang, dễ bị ồn");
  }
  if (nearStair && !T.quiet && T.type === "wc") {
    score += 6;
    pros.push("Gần lõi thang, dễ đi ống cấp thoát nước");
  }

  if (onWalls >= 2) {
    score += 3 * onWalls;
    pros.push(`Tựa ${onWalls} mặt vào tường có sẵn, ít phải xây thêm`);
  }
  for (const g of [box.d0 - hb.d0, hb.d1 - box.d1, box.s0 - hb.s0, hb.s1 - box.s1]) {
    if (g > 0.05 && g < 1) {
      score -= 8;
      cons.push(`Để lại khe hẹp ${g.toFixed(1).replace(".", ",")} m khó sử dụng`);
      break;
    }
  }
  if (walk != null) {
    score -= 0.8 * walk;
    if (walk < 0.2) pros.push("Cửa phòng mở ngay ra lối đi chung");
    else if (walk <= 3) pros.push(`Cửa phòng gần lối đi chung (${walk.toFixed(1).replace(".", ",")} m)`);
  }
  return { score, pros, cons };
}

function buildPlacement(ctx: Context, T: RoomTemplate, box: Box, host: Room, door: Door, score: number, pros: string[], cons: string[], i: number): RoomPlacement {
  const { F, floor, tInt } = ctx;
  const walls: Wall[] = [];
  const openings: Opening[] = [];
  const furniture: Furniture[] = [];
  let doorWall: Wall | null = null;
  let doorOffset = 0;
  const inset: Record<SideKey, number> = { front: tInt / 2, back: tInt / 2, left: tInt / 2, right: tInt / 2 };

  for (const k of SIDES) {
    const sd = sideOf(F, box, k);
    const L = dist(sd.p, sd.q);
    const cv = coverOnSegment(floor.walls, sd.p, sd.q);
    for (const c of cv) inset[k] = Math.max(inset[k], c.wall.thickness / 2);
    for (const [u0, u1] of uncovered(cv)) {
      if ((u1 - u0) * L < 0.05) continue;
      const w = createWall(add(sd.p, scale(sub(sd.q, sd.p), u0)), add(sd.p, scale(sub(sd.q, sd.p), u1)), tInt);
      walls.push(w);
      if (k === door.side && door.t >= u0 && door.t <= u1) {
        doorWall = w;
        doorOffset = (door.t - u0) * L;
      }
    }
    // Window on a facade wall the room sits against.
    if (T.window !== "no") {
      for (const c of cv) {
        const e = ctx.exposure.get(c.wall.id);
        const len = (c.t1 - c.t0) * L;
        if ((e !== "front" && e !== "back") || len < 1.2) continue;
        const mid = add(sd.p, scale(sub(sd.q, sd.p), (c.t0 + c.t1) / 2));
        const offset = dot(sub(mid, c.wall.a), normalize(sub(c.wall.b, c.wall.a)));
        const win = clampOpening({ ...createOpening("window", c.wall.id, offset), width: Math.min(1.4, len - 0.6) }, c.wall);
        const s0 = offset - len / 2;
        const s1 = offset + len / 2;
        const existing = floor.openings.filter((o) => o.wallId === c.wall.id && o.offset > s0 && o.offset < s1);
        if (existing.some((o) => o.kind === "window") || existing.some((o) => openingsOverlap(o, win))) continue;
        openings.push(win);
      }
    }
  }
  if (doorWall) openings.push(clampOpening({ ...createOpening("door", doorWall.id, doorOffset), width: T.doorWidth }, doorWall));

  // Furniture: backs against the walls, the bed opposite the door, nothing in the door swing.
  const inner: Box = { d0: box.d0 + inset.front + 0.02, d1: box.d1 - inset.back - 0.02, s0: box.s0 + inset.left + 0.02, s1: box.s1 - inset.right - 0.02 };
  const blocked: Box[] = [];
  {
    const sd = sideOf(F, box, door.side);
    const c = add(sd.p, scale(sub(sd.q, sd.p), door.t));
    const u = normalize(sub(sd.q, sd.p));
    blocked.push(frameBox(F, [add(c, scale(u, -T.doorWidth / 2 - 0.05)), add(add(c, scale(u, T.doorWidth / 2 + 0.05)), scale(sd.out, -(T.doorWidth + 0.15)))]));
  }
  let bed: Box | null = null;
  let bedSide: SideKey | null = null;
  for (const kind of T.furniture) {
    const spec = furnitureSpec(kind);
    const isBed = kind === "bedDouble" || kind === "bedSingle";
    const perpSides = SIDES.filter((k) => k !== door.side && k !== OPPOSITE[door.side]);
    const order: SideKey[] = isBed ? [OPPOSITE[door.side], ...perpSides] : kind === "nightstand" && bedSide ? [bedSide] : [...perpSides, OPPOSITE[door.side], door.side];
    let done = false;
    for (const k of order) {
      const along = k === "front" || k === "back";
      const lo = along ? inner.s0 : inner.d0;
      const hi = along ? inner.s1 : inner.d1;
      const half = spec.width / 2;
      if (hi - lo < spec.width) continue;
      const ts: number[] = [];
      for (let t = lo + half; t <= hi - half + 1e-6; t += 0.1) ts.push(t);
      ts.push(hi - half);
      const centre = (lo + hi) / 2;
      const bedC = bed ? (along ? (bed.s0 + bed.s1) / 2 : (bed.d0 + bed.d1) / 2) : centre;
      ts.sort((x, y) => (isBed ? Math.abs(x - centre) - Math.abs(y - centre) : kind === "nightstand" ? Math.abs(x - bedC) - Math.abs(y - bedC) : Math.min(x - lo, hi - x) - Math.min(y - lo, hi - y)));
      for (const t of ts) {
        const fb: Box =
          k === "front"
            ? { d0: inner.d0, d1: inner.d0 + spec.depth, s0: t - half, s1: t + half }
            : k === "back"
              ? { d0: inner.d1 - spec.depth, d1: inner.d1, s0: t - half, s1: t + half }
              : k === "left"
                ? { d0: t - half, d1: t + half, s0: inner.s0, s1: inner.s0 + spec.depth }
                : { d0: t - half, d1: t + half, s0: inner.s1 - spec.depth, s1: inner.s1 };
        if (fb.d0 < inner.d0 - 1e-6 || fb.d1 > inner.d1 + 1e-6 || fb.s0 < inner.s0 - 1e-6 || fb.s1 > inner.s1 + 1e-6) continue;
        if (blocked.some((b) => overlaps(grow(b, -0.01), fb))) continue;
        const inward = scale(sideOf(F, box, k).out, -1);
        const rot = ((((Math.atan2(-inward.x, inward.y) * 180) / Math.PI) % 360) + 360) % 360;
        furniture.push(createFurniture(kind, toWorld(F, (fb.d0 + fb.d1) / 2, (fb.s0 + fb.s1) / 2), rot));
        // Keep a walking strip in front of beds and wardrobes.
        const front = isBed || kind === "wardrobe" ? 0.5 : 0;
        blocked.push(k === "front" ? { ...fb, d1: fb.d1 + front } : k === "back" ? { ...fb, d0: fb.d0 - front } : k === "left" ? { ...fb, s1: fb.s1 + front } : { ...fb, s0: fb.s0 - front });
        if (isBed) {
          bed = fb;
          bedSide = k;
        }
        done = true;
        break;
      }
      if (done) break;
    }
  }

  const rect = boxCorners(F, box);
  const clearDepth = box.d1 - box.d0 - inset.front - inset.back;
  const clearWidth = box.s1 - box.s0 - inset.left - inset.right;
  return {
    key: `${i}-${box.d0.toFixed(2)}-${box.s0.toFixed(2)}`,
    hostId: host.id,
    rect,
    score,
    pros,
    cons,
    walls,
    openings,
    furniture,
    label: { at: toWorld(F, (box.d0 + box.d1) / 2, (box.s0 + box.s1) / 2), name: roomName(floor, T.name), type: T.type },
    clearWidth: Math.min(clearWidth, clearDepth),
    clearDepth: Math.max(clearWidth, clearDepth),
  };
}

/** Floor with the placement applied (walls, door/window, furniture, room name and type). */
export function applyRoomPlacement(floor: Floor, pl: RoomPlacement): Floor {
  const walls = [...floor.walls, ...pl.walls];
  const byId = new Map(walls.map((w) => [w.id, w]));
  const rooms = reconcileRooms(floor.rooms, walls).map((r) => (pointInPolygon(pl.label.at, r.polygon) && !pointOnPolygonBoundary(pl.label.at, r.polygon, 1e-3) ? { ...r, name: pl.label.name, type: pl.label.type } : r));
  const openings = [...floor.openings, ...pl.openings].filter((o) => byId.has(o.wallId)).map((o) => clampOpening(o, byId.get(o.wallId)!));
  return { ...floor, walls, rooms, openings, furniture: [...floor.furniture, ...pl.furniture] };
}

/** An empty floor gets exterior walls along the buildable outline first ("tự dựng tường bao"). */
export function ensureShell(project: Project, floor: Floor): { floor: Floor; added: boolean } {
  if (floor.walls.length) return { floor, added: false };
  const t = project.defaults.exteriorWallThickness;
  const centre = insetPolygon(quickFloorOutline(project), t / 2);
  if (!centre) return { floor, added: false };
  const walls = centre.map((p, i) => createWall(p, centre[(i + 1) % centre.length], t));
  return { floor: { ...floor, walls, rooms: reconcileRooms(floor.rooms, walls) }, added: true };
}

/** Places a list of rooms one after another, each at its best remaining spot. */
export function autoPlaceRooms(project: Project, floor: Floor, requests: readonly RoomRequest[]): { floor: Floor; placed: RoomPlacement[]; failed: RoomRequest[]; shellAdded: boolean } {
  const shell = ensureShell(project, floor);
  let f = shell.floor;
  const placed: RoomPlacement[] = [];
  const failed: RoomRequest[] = [];
  for (const r of requests) {
    const best = findRoomPlacements(project, f, r, 1)[0];
    if (!best) {
      failed.push(r);
      continue;
    }
    f = applyRoomPlacement(f, best);
    placed.push(best);
  }
  return { floor: f, placed, failed, shellAdded: shell.added };
}
