import type { Furniture, FurnitureKind, Vec2 } from "./types";
import { newId } from "./factory";
import { rotate } from "@/geometry/vec";

/**
 * A furniture model is a handful of parts in a unit box: u across the width (0 = left),
 * v across the depth (0 = back, 1 = front), z as a fraction of the height. The same parts
 * draw the 2D symbol (top view) and build the 3D model, so both always agree.
 */
export interface FurniturePart {
  u0: number;
  u1: number;
  v0: number;
  v1: number;
  z0: number;
  z1: number;
  shape?: "box" | "cylinder" | "sphere";
  /** Hex colour; defaults to the item colour. */
  color?: string;
  opacity?: number;
}

export type FurnitureCategory = "living" | "bedroom" | "kitchen" | "bath" | "work" | "other";

export interface FurnitureSpec {
  kind: FurnitureKind;
  label: string;
  category: FurnitureCategory;
  width: number;
  depth: number;
  height: number;
  color: string;
  parts: FurniturePart[];
}

export const FURNITURE_CATEGORY_LABELS: Record<FurnitureCategory, string> = {
  living: "Phòng khách",
  bedroom: "Phòng ngủ",
  kitchen: "Bếp & ăn",
  bath: "Vệ sinh & giặt",
  work: "Làm việc",
  other: "Khác",
};

const DARK = "#334155";
const WOOD = "#b98b5a";
const WHITE = "#f8fafc";
const FABRIC = "#94a3b8";
const GLASS = "#7dd3fc";

const P = (u0: number, v0: number, u1: number, v1: number, z0: number, z1: number, extra: Partial<FurniturePart> = {}): FurniturePart => ({ u0, v0, u1, v1, z0, z1, ...extra });

/** Four legs and a top, inset `m` from the edges. */
const table = (m = 0.05, top = 0.06, color?: string): FurniturePart[] => [
  P(0, 0, 1, 1, 1 - top, 1, { color }),
  P(m, m, m + 0.06, m + 0.08, 0, 1 - top, { color: DARK }),
  P(1 - m - 0.06, m, 1 - m, m + 0.08, 0, 1 - top, { color: DARK }),
  P(m, 1 - m - 0.08, m + 0.06, 1 - m, 0, 1 - top, { color: DARK }),
  P(1 - m - 0.06, 1 - m - 0.08, 1 - m, 1 - m, 0, 1 - top, { color: DARK }),
];

const sofaParts = (arm: number): FurniturePart[] => [
  P(arm, 0.22, 1 - arm, 1, 0, 0.5),
  P(0, 0, 1, 0.22, 0, 1),
  P(0, 0.22, arm, 1, 0, 0.7),
  P(1 - arm, 0.22, 1, 1, 0, 0.7),
];

const bedParts = (pillows: number): FurniturePart[] => {
  const out = [P(0, 0, 1, 1, 0, 0.85, { color: WOOD }), P(0, 0, 1, 0.05, 0, 1.9, { color: WOOD }), P(0.02, 0.32, 0.98, 1, 0.85, 1, { color: "#a5b4fc" })];
  const w = 0.9 / pillows;
  for (let i = 0; i < pillows; i++) out.push(P(0.06 + i * w, 0.08, 0.06 + (i + 1) * w - 0.06, 0.24, 0.85, 1.15, { color: WHITE }));
  return out;
};

const chairsAround = (rows: number): FurniturePart[] => {
  const out: FurniturePart[] = [];
  for (let i = 0; i < rows; i++) {
    const u0 = (i + 0.5) / rows - 0.12;
    out.push(P(u0, 0, u0 + 0.24, 0.18, 0, 0.6, { color: WOOD }), P(u0, 0.82, u0 + 0.24, 1, 0, 0.6, { color: WOOD }));
  }
  return out;
};

export const FURNITURE_CATALOG: readonly FurnitureSpec[] = [
  { kind: "sofa", label: "Sofa 3 chỗ", category: "living", width: 2.0, depth: 0.9, height: 0.85, color: FABRIC, parts: sofaParts(0.08) },
  { kind: "armchair", label: "Ghế bành", category: "living", width: 0.85, depth: 0.85, height: 0.85, color: FABRIC, parts: sofaParts(0.18) },
  { kind: "coffeeTable", label: "Bàn trà", category: "living", width: 1.1, depth: 0.6, height: 0.45, color: WOOD, parts: table(0.06, 0.12) },
  {
    kind: "tvUnit",
    label: "Kệ tivi",
    category: "living",
    width: 1.8,
    depth: 0.45,
    height: 0.5,
    color: WOOD,
    parts: [P(0, 0, 1, 1, 0, 1), P(0.12, 0.35, 0.88, 0.5, 1, 2.5, { color: "#0f172a" })],
  },
  { kind: "bedDouble", label: "Giường đôi 1m8", category: "bedroom", width: 1.8, depth: 2.1, height: 0.5, color: WOOD, parts: bedParts(2) },
  { kind: "bedSingle", label: "Giường đơn 1m", category: "bedroom", width: 1.0, depth: 2.0, height: 0.5, color: WOOD, parts: bedParts(1) },
  {
    kind: "wardrobe",
    label: "Tủ quần áo",
    category: "bedroom",
    width: 1.6,
    depth: 0.6,
    height: 2.2,
    color: "#d6c3a5",
    parts: [P(0, 0, 0.495, 1, 0, 1), P(0.505, 0, 1, 1, 0, 1)],
  },
  { kind: "nightstand", label: "Tab đầu giường", category: "bedroom", width: 0.45, depth: 0.4, height: 0.55, color: WOOD, parts: [P(0, 0, 1, 1, 0, 1)] },
  {
    kind: "kitchenCounter",
    label: "Tủ bếp + bồn rửa",
    category: "kitchen",
    width: 2.4,
    depth: 0.6,
    height: 0.9,
    color: WHITE,
    parts: [P(0, 0, 1, 1, 0, 0.95), P(0, 0, 1, 1, 0.95, 1, { color: DARK }), P(0.6, 0.2, 0.85, 0.85, 0.96, 1.01, { color: "#cbd5e1" }), P(0.1, 0.2, 0.38, 0.85, 1, 1.02, { color: "#0f172a" })],
  },
  { kind: "fridge", label: "Tủ lạnh", category: "kitchen", width: 0.7, depth: 0.7, height: 1.8, color: "#e2e8f0", parts: [P(0, 0, 1, 1, 0, 1)] },
  {
    kind: "diningTable4",
    label: "Bàn ăn 4 ghế",
    category: "kitchen",
    width: 1.2,
    depth: 1.6,
    height: 0.75,
    color: WOOD,
    parts: [...table(0.06, 0.06).map((p) => ({ ...p, v0: 0.22 + p.v0 * 0.56, v1: 0.22 + p.v1 * 0.56 })), ...chairsAround(2)],
  },
  {
    kind: "diningTable6",
    label: "Bàn ăn 6 ghế",
    category: "kitchen",
    width: 1.8,
    depth: 1.6,
    height: 0.75,
    color: WOOD,
    parts: [...table(0.05, 0.06).map((p) => ({ ...p, v0: 0.22 + p.v0 * 0.56, v1: 0.22 + p.v1 * 0.56 })), ...chairsAround(3)],
  },
  {
    kind: "toilet",
    label: "Bồn cầu",
    category: "bath",
    width: 0.4,
    depth: 0.7,
    height: 0.75,
    color: WHITE,
    parts: [P(0.05, 0, 0.95, 0.28, 0, 1), P(0.08, 0.25, 0.92, 0.98, 0, 0.55, { shape: "cylinder" })],
  },
  {
    kind: "basin",
    label: "Lavabo",
    category: "bath",
    width: 0.6,
    depth: 0.45,
    height: 0.85,
    color: WOOD,
    parts: [P(0, 0, 1, 1, 0, 0.92), P(0.18, 0.15, 0.82, 0.85, 0.92, 1.05, { shape: "cylinder", color: WHITE })],
  },
  {
    kind: "shower",
    label: "Vòi sen + vách kính",
    category: "bath",
    width: 0.9,
    depth: 0.9,
    height: 2.0,
    color: "#e2e8f0",
    parts: [P(0, 0, 1, 1, 0, 0.03), P(0, 0.97, 1, 1, 0, 1, { color: GLASS, opacity: 0.35 }), P(0.97, 0, 1, 1, 0, 1, { color: GLASS, opacity: 0.35 })],
  },
  {
    kind: "washer",
    label: "Máy giặt",
    category: "bath",
    width: 0.6,
    depth: 0.6,
    height: 0.85,
    color: WHITE,
    parts: [P(0, 0, 1, 1, 0, 1), P(0.25, 0.25, 0.75, 0.75, 1, 1.01, { shape: "cylinder", color: "#cbd5e1" })],
  },
  { kind: "desk", label: "Bàn làm việc", category: "work", width: 1.4, depth: 0.7, height: 0.75, color: "#e7e5e4", parts: table(0.04, 0.05) },
  {
    kind: "officeChair",
    label: "Ghế văn phòng",
    category: "work",
    width: 0.6,
    depth: 0.6,
    height: 1.0,
    color: DARK,
    parts: [P(0.1, 0.1, 0.9, 0.9, 0, 0.45, { shape: "cylinder" }), P(0.12, 0, 0.88, 0.14, 0.45, 1)],
  },
  { kind: "meetingTable", label: "Bàn họp 8 người", category: "work", width: 2.4, depth: 1.2, height: 0.75, color: "#e7e5e4", parts: table(0.06, 0.05) },
  { kind: "bookshelf", label: "Kệ sách / hồ sơ", category: "work", width: 0.9, depth: 0.35, height: 2.0, color: WOOD, parts: [P(0, 0, 1, 1, 0, 1)] },
  {
    kind: "altar",
    label: "Bàn thờ",
    category: "other",
    width: 1.2,
    depth: 0.6,
    height: 1.2,
    color: "#7f1d1d",
    parts: [P(0, 0, 1, 1, 0, 0.92), P(0, 0, 1, 1, 0.92, 1, { color: "#b45309" })],
  },
  {
    kind: "plant",
    label: "Chậu cây",
    category: "other",
    width: 0.5,
    depth: 0.5,
    height: 1.4,
    color: "#4d7c0f",
    parts: [P(0.2, 0.2, 0.8, 0.8, 0, 0.3, { shape: "cylinder", color: "#92400e" }), P(0, 0, 1, 1, 0.3, 1, { shape: "sphere" })],
  },
  {
    kind: "car",
    label: "Ô tô",
    category: "other",
    width: 1.85,
    depth: 4.6,
    height: 1.5,
    color: "#2e5f8a",
    parts: [P(0.02, 0.06, 0.98, 0.94, 0, 0.18, { color: "#0f172a" }), P(0, 0, 1, 1, 0.18, 0.55), P(0.07, 0.3, 0.93, 0.72, 0.55, 1, { color: GLASS, opacity: 0.8 })],
  },
  {
    kind: "motorbike",
    label: "Xe máy",
    category: "other",
    width: 0.7,
    depth: 1.9,
    height: 1.1,
    color: "#b91c1c",
    parts: [P(0.4, 0.02, 0.6, 0.98, 0, 0.35, { color: "#0f172a" }), P(0.3, 0.15, 0.7, 0.85, 0.35, 0.7), P(0.3, 0.4, 0.7, 0.75, 0.7, 0.8, { color: DARK })],
  },
];

const BY_KIND = new Map(FURNITURE_CATALOG.map((s) => [s.kind, s]));

export const furnitureSpec = (kind: FurnitureKind): FurnitureSpec => BY_KIND.get(kind)!;

export function createFurniture(kind: FurnitureKind, at: Vec2, rotation = 0): Furniture {
  const s = furnitureSpec(kind);
  return { id: newId("fu_"), kind, name: s.label, x: at.x, y: at.y, rotation, width: s.width, depth: s.depth, height: s.height };
}

/** Local (metres, centred) → plan coordinates. */
export function furnitureToPlan(f: Furniture, lx: number, ly: number): Vec2 {
  return rotate({ x: f.x + lx, y: f.y + ly }, f.rotation, { x: f.x, y: f.y });
}

/** Plan polygon of a part (or of the whole piece when no part is given). */
export function furnitureRect(f: Furniture, part?: Pick<FurniturePart, "u0" | "u1" | "v0" | "v1">): Vec2[] {
  const { u0, u1, v0, v1 } = part ?? { u0: 0, u1: 1, v0: 0, v1: 1 };
  const x = (u: number) => (u - 0.5) * f.width;
  const y = (v: number) => (v - 0.5) * f.depth;
  return [furnitureToPlan(f, x(u0), y(v0)), furnitureToPlan(f, x(u1), y(v0)), furnitureToPlan(f, x(u1), y(v1)), furnitureToPlan(f, x(u0), y(v1))];
}
