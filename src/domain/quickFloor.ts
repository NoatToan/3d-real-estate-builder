import type { Furniture, FurnitureKind, Opening, Project, RoomType, Stair, Vec2, Wall } from "./types";
import { createOpening, createStair, createWall } from "./factory";
import { createFurniture, furnitureSpec } from "./furniture";
import { cutLineOrigin, lineSpanInside, siteLotPolygon } from "./roadCut";
import { buildablePolygon } from "./stats";
import { insetPolygon } from "@/geometry/offset";
import { generateStair } from "@/geometry/stairs";
import { add, dist, dot, normalize, perp, scale, sub } from "@/geometry/vec";

/**
 * "Tạo nhanh mặt sàn": lays out a townhouse floor as bands from the front to the back
 * (the usual nhà ống layout). Each band becomes a room; the stair band also gets a WC on
 * one side and the stair on the other, with a walkway between them.
 */
export interface QuickZone {
  name: string;
  type: RoomType;
  /** Depth of the band in metres; 0 = share whatever is left. */
  depth: number;
  furniture?: FurnitureKind[];
  /** Puts a U stair rising to the next floor in this band. */
  stair?: boolean;
  /** Small room against one side wall (e.g. WC next to the stair). */
  side?: { name: string; type: RoomType; width: number; furniture?: FurnitureKind[] };
}

export interface QuickTemplate {
  id: string;
  label: string;
  description: string;
  zones: QuickZone[];
}

const STAIR_WC: QuickZone = {
  name: "Cầu thang",
  type: "corridor",
  depth: 3.8,
  stair: true,
  side: { name: "WC", type: "wc", width: 1.4, furniture: ["toilet", "basin"] },
};

export const QUICK_TEMPLATES: readonly QuickTemplate[] = [
  {
    id: "ground",
    label: "Tầng trệt nhà ở",
    description: "Để xe phía trước, phòng khách, thang + WC, bếp ăn phía sau",
    zones: [
      { name: "Để xe", type: "garage", depth: 5.4, furniture: ["car", "motorbike", "motorbike"] },
      { name: "Phòng khách", type: "living", depth: 4, furniture: ["sofa", "coffeeTable"] },
      STAIR_WC,
      { name: "Bếp + ăn", type: "kitchen", depth: 0, furniture: ["kitchenCounter", "diningTable4"] },
    ],
  },
  {
    id: "bedrooms",
    label: "Tầng 2 phòng ngủ",
    description: "Phòng ngủ trước, thang + WC giữa, phòng ngủ sau",
    zones: [
      { name: "Phòng ngủ 1", type: "bedroom", depth: 0, furniture: ["bedDouble", "wardrobe"] },
      STAIR_WC,
      { name: "Phòng ngủ 2", type: "bedroom", depth: 0, furniture: ["bedDouble", "wardrobe"] },
    ],
  },
  {
    id: "office",
    label: "Văn phòng cho thuê",
    description: "Sàn làm việc mở, thang + WC, phòng họp phía sau",
    zones: [
      { name: "Văn phòng mở", type: "office", depth: 0, furniture: ["desk", "desk", "desk"] },
      STAIR_WC,
      { name: "Phòng họp", type: "office", depth: 4, furniture: ["meetingTable"] },
    ],
  },
  {
    id: "shop",
    label: "Cửa hàng / kinh doanh",
    description: "Mặt bằng bán hàng phía trước, thang + WC, kho phía sau",
    zones: [
      { name: "Cửa hàng", type: "other", depth: 0, furniture: ["bookshelf", "bookshelf", "desk"] },
      STAIR_WC,
      { name: "Kho", type: "storage", depth: 3, furniture: ["bookshelf"] },
    ],
  },
  {
    id: "worship",
    label: "Tầng thờ + giặt phơi",
    description: "Phòng thờ phía trước, thang + WC, sân giặt phơi phía sau",
    zones: [
      { name: "Phòng thờ", type: "worship", depth: 4, furniture: ["altar"] },
      STAIR_WC,
      { name: "Giặt phơi", type: "laundry", depth: 0, furniture: ["washer", "plant"] },
    ],
  },
  {
    id: "open",
    label: "Sàn trống",
    description: "Chỉ tường bao và lõi thang + WC, tự bố trí phần còn lại",
    zones: [{ name: "Không gian mở", type: "other", depth: 0 }, STAIR_WC, { name: "Không gian sau", type: "other", depth: 0 }],
  },
];

export interface QuickFloorOptions {
  /** Lot edge on the street side. */
  frontEdge: number;
  /** Add a stair in bands that ask for one. */
  withStair: boolean;
  /** Ground floor: a main door on the facade instead of a window. */
  isGround: boolean;
  floorHeight: number;
  exteriorThickness: number;
  interiorThickness: number;
}

export interface QuickFloorPlan {
  walls: Wall[];
  openings: Opening[];
  stairs: Stair[];
  furniture: Furniture[];
  /** Where each named room ends up, to label the detected rooms. */
  labels: { at: Vec2; name: string; type: RoomType }[];
  /** Usable size of the outline, measured on the wall centre lines. */
  depth: number;
  width: number;
}

/** Outline the generator fills: the buildable area when setbacks are on, else the land left after a road cut. */
export function quickFloorOutline(p: Project): Vec2[] {
  return buildablePolygon(p) ?? siteLotPolygon(p);
}

/**
 * Index of the outline edge that faces the same way as lot edge `lotEdge`. Road cuts and setbacks
 * re-order the outline's vertices, so a lot edge index can't be used on the outline directly:
 * pick the edge running in the same direction that lies closest to the lot edge.
 */
export function outlineFrontEdge(outline: readonly Vec2[], lot: readonly Vec2[], lotEdge: number): number {
  const n = outline.length;
  if (lot.length < 2 || n < 2) return 0;
  const la = lot[lotEdge % lot.length];
  const lb = lot[(lotEdge + 1) % lot.length];
  const dir = normalize(sub(lb, la));
  const mid = scale(add(la, lb), 0.5);
  let best = Math.min(Math.max(0, lotEdge), n - 1);
  let bestDist = Infinity;
  for (let i = 0; i < n; i++) {
    const a = outline[i];
    const b = outline[(i + 1) % n];
    if (dist(a, b) < 1e-6 || dot(normalize(sub(b, a)), dir) < 0.9) continue;
    const d = Math.abs(dot(sub(mid, a), perp(dir)));
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

/** Splits `total` metres between the bands: fixed depths first (shrunk if needed), the rest shared. */
export function zoneDepths(zones: readonly QuickZone[], total: number, minRest = 2.5): number[] {
  const rest = zones.filter((z) => z.depth <= 0).length;
  const fixed = zones.reduce((s, z) => s + Math.max(0, z.depth), 0);
  const room = Math.max(0, total - rest * minRest);
  const k = fixed > room ? (fixed > 0 ? room / fixed : 0) : 1;
  const restDepth = rest ? (total - fixed * k) / rest : 0;
  return zones.map((z) => (z.depth > 0 ? z.depth * k : restDepth));
}

export function planQuickFloor(outline: readonly Vec2[], zones: readonly QuickZone[], o: QuickFloorOptions): QuickFloorPlan | null {
  if (outline.length < 3 || !zones.length) return null;
  const centre = insetPolygon(outline, o.exteriorThickness / 2);
  if (!centre) return null;

  // Frame: n points from the street into the lot, a runs across the frontage.
  const edge = Math.min(Math.max(0, o.frontEdge), outline.length - 1);
  const { origin, normal: n } = cutLineOrigin(outline, edge, 0);
  const a = perp(n);
  const at = (d: number, s: number) => add(add(origin, scale(n, d)), scale(a, s));
  const depthOf = (p: Vec2) => dot(sub(p, origin), n);
  const acrossOf = (p: Vec2) => dot(sub(p, origin), a);
  const dMin = Math.min(...centre.map(depthOf));
  const dMax = Math.max(...centre.map(depthOf));
  /** Across range of the centre outline at depth d, nudged inside so the line actually crosses it. */
  const spanAt = (d: number): [number, number] | null => {
    const dd = Math.min(dMax - 0.01, Math.max(dMin + 0.01, d));
    const s = lineSpanInside(centre, at(dd, 0), n);
    if (!s) return null;
    const v = s.map(acrossOf);
    return [Math.min(...v), Math.max(...v)];
  };
  const full = spanAt((dMin + dMax) / 2);
  if (!full) return null;

  const tExt = o.exteriorThickness;
  const tInt = o.interiorThickness;
  const walls: Wall[] = centre.map((p, i) => createWall(p, centre[(i + 1) % centre.length], tExt));
  const openings: Opening[] = [];
  const stairs: Stair[] = [];
  const furniture: Furniture[] = [];
  const labels: QuickFloorPlan["labels"] = [];

  const depths = zoneDepths(zones, dMax - dMin);
  const bounds = [dMin];
  depths.forEach((d) => bounds.push(bounds[bounds.length - 1] + d));
  bounds[bounds.length - 1] = dMax;

  // Walkway position across the floor: beside the stair core when there is one.
  const core = zones.find((z) => z.side || z.stair);
  const stairWidth = 2 * 0.9 + 0.1;
  const walkway = (() => {
    const [s0, s1] = full;
    if (!core) return (s0 + s1) / 2;
    const left = s0 + tExt / 2 + (core.side ? core.side.width + tInt : 0);
    const right = s1 - tExt / 2 - (core.stair && o.withStair ? stairWidth : 0);
    return right > left ? (left + right) / 2 : (s0 + s1) / 2;
  })();
  // Furniture faces the street (local +y towards −n).
  const facing = (Math.atan2(n.x, -n.y) * 180) / Math.PI;

  // Cross walls between bands, each with a door on the walkway.
  for (let i = 1; i < bounds.length - 1; i++) {
    const s = spanAt(bounds[i]);
    if (!s) continue;
    const p0 = at(bounds[i], s[0]);
    const p1 = at(bounds[i], s[1]);
    const w = createWall(p0, p1, tInt);
    walls.push(w);
    openings.push(createOpening("door", w.id, Math.min(dist(p0, p1) - 0.6, Math.max(0.6, walkway - s[0]))));
  }

  // Facade (front) and back openings on the exterior walls that run across the frontage.
  const crossWall = (d: number) => walls.slice(0, centre.length).find((w) => Math.abs(depthOf(w.a) - d) < 0.05 && Math.abs(depthOf(w.b) - d) < 0.05 && dist(w.a, w.b) > 1.2);
  const front = crossWall(dMin);
  if (front) {
    const L = dist(front.a, front.b);
    const op = o.isGround ? { ...createOpening("door", front.id, L / 2), width: Math.min(L - 0.6, 2.4), height: 2.6 } : { ...createOpening("window", front.id, L / 2), width: Math.min(L - 0.8, 2.6), height: 1.8, sill: 0.6 };
    openings.push(op);
  }
  const back = crossWall(dMax);
  if (back) openings.push({ ...createOpening("window", back.id, dist(back.a, back.b) / 2), width: Math.min(dist(back.a, back.b) - 0.8, 1.6) });

  zones.forEach((z, i) => {
    const d0 = bounds[i];
    const d1 = bounds[i + 1];
    const mid = (d0 + d1) / 2;
    const span = spanAt(mid) ?? full;
    const inner0 = span[0] + tExt / 2;
    const inner1 = span[1] - tExt / 2;
    let main0 = inner0;
    let main1 = inner1;

    if (z.side && z.side.width < inner1 - inner0 - 1) {
      const sAt = inner0 + z.side.width + tInt / 2;
      const w = createWall(at(d0, sAt), at(d1, sAt), tInt);
      walls.push(w);
      openings.push({ ...createOpening("door", w.id, (d1 - d0) / 2), width: 0.7 });
      labels.push({ at: at(mid, (inner0 + sAt) / 2), name: z.side.name, type: z.side.type });
      // Side-room fixtures in a column along the depth, backs to the side wall.
      let cursor = d0 + tInt / 2 + 0.1;
      for (const k of z.side.furniture ?? []) {
        const spec = furnitureSpec(k);
        if (cursor + spec.width > d1 - 0.1) break;
        const c = at(cursor + spec.width / 2, inner0 + spec.depth / 2 + 0.02);
        // Backs to the side wall: local +y points across the floor.
        furniture.push(createFurniture(k, c, (Math.atan2(n.y, n.x) * 180) / Math.PI));
        cursor += spec.width + 0.25;
      }
      main0 = sAt + tInt / 2;
    }

    if (z.stair && o.withStair) {
      const riserCount = Math.min(30, Math.max(12, Math.round(o.floorHeight / 0.17)));
      const rot = (Math.atan2(n.y, n.x) * 180) / Math.PI;
      const draft = { ...createStair("U", { x: 0, y: 0 }, rot), riserCount, width: 0.9, treadDepth: 0.26, landingDepth: 0.9, gap: 0.1, turn: "left" as const };
      const fp = generateStair(draft, o.floorHeight).footprint;
      const fd = fp.map(depthOf);
      const fa = fp.map(acrossOf);
      // Against the far side wall, starting just behind the band's front wall.
      const shiftD = d0 + tInt / 2 + 0.05 - Math.min(...fd);
      const shiftA = main1 - 0.02 - Math.max(...fa);
      const move = add(scale(n, shiftD), scale(a, shiftA));
      stairs.push({ ...draft, x: draft.x + move.x, y: draft.y + move.y });
      main1 = Math.min(...fa) + shiftA;
    }

    labels.push({ at: at(mid, (main0 + main1) / 2), name: z.name, type: z.type });

    // Band furniture: one row against the back of the band, facing the street.
    const items = (z.furniture ?? []).map(furnitureSpec);
    const gap = 0.35;
    let used = 0;
    const fit = items.filter((s) => {
      const need = used + (used ? gap : 0) + s.width;
      if (need > main1 - main0 - 0.3 || s.depth > d1 - d0 - tInt - 0.3) return false;
      used = need;
      return true;
    });
    let s = (main0 + main1) / 2 - used / 2;
    for (const spec of fit) {
      const c = at(d1 - tInt / 2 - 0.15 - spec.depth / 2, s + spec.width / 2);
      furniture.push(createFurniture(spec.kind, c, facing));
      s += spec.width + gap;
    }
  });

  return { walls, openings, stairs, furniture, labels, depth: dMax - dMin, width: full[1] - full[0] };
}
