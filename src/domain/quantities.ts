import type { Project } from "./types";
import { computeStats } from "./stats";
import { roomNetArea } from "./rooms";
import { perimeter } from "@/geometry/polygon";
import { wallLength } from "@/geometry/openings";

/**
 * "Bóc khối lượng sơ bộ": material quantities and a rough budget read straight off the drawing.
 * Masonry, plaster, paint, tiles, doors and windows come from the walls and rooms; the frame
 * (concrete, steel) uses per-m² ratios typical of Vietnamese townhouses. An estimate to compare
 * quotes against, not a contractor's BOQ.
 */

export type QuantityGroup = "structure" | "masonry" | "finish" | "openings" | "mep" | "labour";

export const QUANTITY_GROUP_LABELS: Record<QuantityGroup, string> = {
  structure: "Kết cấu (bê tông, thép)",
  masonry: "Xây tô",
  finish: "Hoàn thiện",
  openings: "Cửa",
  mep: "Điện nước, thiết bị",
  labour: "Nhân công",
};

export interface MaterialPrice {
  key: string;
  name: string;
  unit: string;
  group: QuantityGroup;
  /** Default unit price in đồng (HCMC, 2026, materials delivered). */
  price: number;
  note?: string;
}

export const MATERIALS: readonly MaterialPrice[] = [
  { key: "concrete", name: "Bê tông kết cấu (móng, cột, dầm, sàn)", unit: "m³", group: "structure", price: 0, note: "Quy ra xi măng, cát, đá bên dưới; ≈ 0,28 m³/m² sàn" },
  { key: "steel", name: "Thép kết cấu", unit: "kg", group: "structure", price: 15_800, note: "≈ 40 kg/m² sàn" },
  { key: "brick", name: "Gạch ống 8×8×18", unit: "viên", group: "masonry", price: 1_350, note: "Tường 110: 55 viên/m², tường 220: 110 viên/m², hao hụt 5%" },
  { key: "cement", name: "Xi măng (bao 50 kg)", unit: "bao", group: "masonry", price: 92_000, note: "Bê tông mác 250: 350 kg/m³; vữa mác 75: 250 kg/m³" },
  { key: "sand", name: "Cát xây tô + bê tông", unit: "m³", group: "masonry", price: 380_000 },
  { key: "stone", name: "Đá 1×2", unit: "m³", group: "masonry", price: 480_000, note: "0,85 m³/m³ bê tông" },
  { key: "paint", name: "Sơn nước (lót + 2 lớp phủ)", unit: "lít", group: "finish", price: 110_000, note: "Tường trát 2 mặt + trần, 0,25 lít/m²" },
  { key: "floorTile", name: "Gạch lát nền", unit: "m²", group: "finish", price: 280_000, note: "Diện tích thông thuỷ các phòng + 5%" },
  { key: "wallTile", name: "Gạch ốp tường WC", unit: "m²", group: "finish", price: 250_000, note: "Chu vi WC × cao 2,4 m" },
  { key: "door", name: "Cửa đi (trọn bộ)", unit: "bộ", group: "openings", price: 4_500_000 },
  { key: "window", name: "Cửa sổ nhôm kính", unit: "m²", group: "openings", price: 2_200_000 },
  { key: "mep", name: "Điện nước (dây, ống, thiết bị cơ bản)", unit: "m² sàn", group: "mep", price: 350_000 },
  { key: "sanitary", name: "Thiết bị vệ sinh (xí, lavabo, sen)", unit: "bộ", group: "mep", price: 9_000_000, note: "Mỗi phòng WC / tắm 1 bộ" },
  { key: "labour", name: "Nhân công xây dựng + hoàn thiện", unit: "m² sàn", group: "labour", price: 1_700_000 },
];

export interface QuantityLine extends MaterialPrice {
  qty: number;
  /** Unit price used (the user's override or the default), đồng. */
  unitPrice: number;
  /** qty × unitPrice, in triệu đồng like the rest of the finance view. */
  amount: number;
}

export interface QuantityResult {
  lines: QuantityLine[];
  /** Sum of all lines, triệu đồng. */
  total: number;
  floorArea: number;
  /** Total / floor area, triệu đồng per m² of floor. */
  perM2: number;
  wallArea: number;
}

/** Concrete and frame ratios per m² of floor (townhouse, 3–5 storeys). */
const CONCRETE_PER_M2 = 0.28;
const STEEL_PER_M2 = 40;
const PAINT_L_PER_M2 = 0.25;

export function computeQuantities(p: Project, prices: Record<string, number> = p.finance.materialPrices ?? {}): QuantityResult {
  const stats = computeStats(p);
  const floorArea = stats.totalFloorArea;
  let wallArea = 0;
  let bricks = 0;
  let masonryMortar = 0;
  let plaster = 0;
  let ceiling = 0;
  let floorTile = 0;
  let wcTile = 0;
  let doors = 0;
  let windowArea = 0;
  let wetRooms = 0;

  for (const f of p.floors) {
    for (const w of f.walls) {
      const L = wallLength(w);
      const holes = f.openings.filter((o) => o.wallId === w.id).reduce((s, o) => s + o.width * Math.max(0, Math.min(o.height, f.height - o.sill)), 0);
      const net = Math.max(0, L * f.height - holes);
      wallArea += net;
      bricks += net * 500 * Math.max(w.thickness, 0.1);
      masonryMortar += net * w.thickness * 0.29;
      // Both faces get plaster (the outer face of exterior walls too).
      plaster += net * 2;
    }
    for (const r of f.rooms) {
      const a = roomNetArea(r);
      ceiling += a;
      floorTile += a;
      if (r.type === "wc" || r.type === "bathroom") {
        wetRooms++;
        wcTile += perimeter(r.netPolygon ?? r.polygon) * 2.4;
      }
    }
    for (const o of f.openings) {
      if (o.kind === "door") doors++;
      else windowArea += o.width * o.height;
    }
  }

  const concrete = floorArea * CONCRETE_PER_M2;
  const plasterMortar = plaster * 0.017;
  const cementKg = concrete * 350 + (masonryMortar + plasterMortar) * 250;
  const qty: Record<string, number> = {
    concrete,
    steel: floorArea * STEEL_PER_M2,
    brick: bricks * 1.05,
    cement: cementKg / 50,
    sand: concrete * 0.45 + (masonryMortar + plasterMortar) * 1.1,
    stone: concrete * 0.85,
    paint: (plaster + ceiling) * PAINT_L_PER_M2,
    floorTile: floorTile * 1.05,
    wallTile: wcTile,
    door: doors,
    window: windowArea,
    mep: floorArea,
    sanitary: wetRooms,
    labour: floorArea,
  };

  const lines = MATERIALS.map((m) => {
    const unitPrice = prices[m.key] ?? m.price;
    const q = qty[m.key] ?? 0;
    return { ...m, qty: q, unitPrice, amount: (q * unitPrice) / 1e6 };
  });
  const total = lines.reduce((s, l) => s + l.amount, 0);
  return { lines, total, floorArea, perM2: floorArea > 0 ? total / floorArea : 0, wallArea };
}
