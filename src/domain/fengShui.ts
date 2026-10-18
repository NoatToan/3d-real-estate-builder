import type { FengShuiInputs, Floor, Project, Vec2 } from "./types";
import { DIRECTIONS, type Direction } from "./types";
import { outlineFrontEdge, quickFloorOutline } from "./quickFloor";
import { cutLineOrigin, siteLotPolygon } from "./roadCut";
import { area, bbox, centroid, pointInPolygon } from "@/geometry/polygon";
import { buildingOutlines } from "@/geometry/wallGraph";
import { generateStair } from "@/geometry/stairs";
import { dist, scale } from "@/geometry/vec";

/**
 * "Phong thuỷ" (Bát trạch, the school most Vietnamese homeowners ask about): the owner's
 * cung mệnh from birth year and gender gives 4 good and 4 bad directions. The house facing,
 * and the sector (seen from the centre of the house) of the kitchen, WCs, altar and bedrooms
 * are checked against them, plus the stair step count (sinh – lão – bệnh – tử). Rule-based and
 * explained, as a guide rather than a verdict.
 */

export { DIRECTIONS, type Direction };

export const DIRECTION_LABELS: Record<Direction, string> = {
  N: "Bắc",
  NE: "Đông Bắc",
  E: "Đông",
  SE: "Đông Nam",
  S: "Nam",
  SW: "Tây Nam",
  W: "Tây",
  NW: "Tây Bắc",
};

export const DIRECTION_DEGREES: Record<Direction, number> = { N: 0, NE: 45, E: 90, SE: 135, S: 180, SW: 225, W: 270, NW: 315 };

export type Star = "sinhKhi" | "thienY" | "dienNien" | "phucVi" | "hoaHai" | "lucSat" | "nguQuy" | "tuyetMenh";

export const STAR_INFO: Record<Star, { label: string; good: boolean; meaning: string }> = {
  sinhKhi: { label: "Sinh Khí", good: true, meaning: "tài lộc, thăng tiến" },
  thienY: { label: "Thiên Y", good: true, meaning: "sức khoẻ" },
  dienNien: { label: "Diên Niên", good: true, meaning: "hoà thuận, bền lâu" },
  phucVi: { label: "Phục Vị", good: true, meaning: "bình yên" },
  hoaHai: { label: "Hoạ Hại", good: false, meaning: "thị phi" },
  lucSat: { label: "Lục Sát", good: false, meaning: "tranh cãi" },
  nguQuy: { label: "Ngũ Quỷ", good: false, meaning: "hao tài" },
  tuyetMenh: { label: "Tuyệt Mệnh", good: false, meaning: "xấu nhất" },
};

const STAR_ORDER: Star[] = ["sinhKhi", "thienY", "dienNien", "phucVi", "hoaHai", "lucSat", "nguQuy", "tuyetMenh"];

/** Direction of each star, per quái số (same order as STAR_ORDER). */
const KUA_TABLE: Record<number, Direction[]> = {
  1: ["SE", "E", "S", "N", "W", "NW", "NE", "SW"],
  2: ["NE", "W", "NW", "SW", "E", "S", "SE", "N"],
  3: ["S", "N", "SE", "E", "SW", "NE", "NW", "W"],
  4: ["N", "S", "E", "SE", "NW", "W", "SW", "NE"],
  6: ["W", "NE", "SW", "NW", "SE", "N", "E", "S"],
  7: ["NW", "SW", "NE", "W", "N", "SE", "S", "E"],
  8: ["SW", "NW", "W", "NE", "S", "E", "N", "SE"],
  9: ["E", "SE", "N", "S", "NE", "SW", "W", "NW"],
};

export const KUA_LABELS: Record<number, { name: string; group: "Đông tứ mệnh" | "Tây tứ mệnh" }> = {
  1: { name: "Khảm", group: "Đông tứ mệnh" },
  2: { name: "Khôn", group: "Tây tứ mệnh" },
  3: { name: "Chấn", group: "Đông tứ mệnh" },
  4: { name: "Tốn", group: "Đông tứ mệnh" },
  6: { name: "Càn", group: "Tây tứ mệnh" },
  7: { name: "Đoài", group: "Tây tứ mệnh" },
  8: { name: "Cấn", group: "Tây tứ mệnh" },
  9: { name: "Ly", group: "Đông tứ mệnh" },
};


const digitRoot = (n: number) => {
  let x = Math.abs(Math.trunc(n));
  while (x > 9) x = String(x).split("").reduce((s, d) => s + Number(d), 0);
  return x;
};

/** Quái số (Kua) for a lunar birth year: 1–9 without 5. */
export function kuaNumber(year: number, gender: "male" | "female"): number {
  const r = digitRoot(year % 100);
  const modern = year >= 2000;
  let k = gender === "male" ? (modern ? 9 : 10) - r : (modern ? 6 : 5) + r;
  k = digitRoot(k);
  if (k === 0) k = 9;
  if (k === 5) k = gender === "male" ? 2 : 8;
  return k;
}

export function starOf(kua: number, dir: Direction): Star {
  return STAR_ORDER[KUA_TABLE[kua].indexOf(dir)];
}

export const directionsOf = (kua: number): { dir: Direction; star: Star }[] => DIRECTIONS.map((dir) => ({ dir, star: starOf(kua, dir) }));

export function directionFromDegrees(deg: number): Direction {
  return DIRECTIONS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}

/** Compass bearing (0 = north, clockwise) of a plan vector, given the house facing. */
export function planBearing(p: Project, facing: Direction, v: Vec2): number {
  const outline = quickFloorOutline(p).length >= 3 ? quickFloorOutline(p) : siteLotPolygon(p);
  const lotEdge = p.constraints.roadCut.enabled ? p.constraints.roadCut.edge : 0;
  const n = outline.length >= 3 ? cutLineOrigin(outline, outlineFrontEdge(outline, p.lot.polygon, lotEdge), 0).normal : { x: 0, y: 1 };
  const out = scale(n, -1);
  // Plan y points down, so atan2 grows clockwise on screen, like a compass.
  const d = ((Math.atan2(v.y, v.x) - Math.atan2(out.y, out.x)) * 180) / Math.PI;
  return (((DIRECTION_DEGREES[facing] + d) % 360) + 360) % 360;
}

/** Centre of the house on a floor: its outline centroid, else the site's. */
export function houseCentre(p: Project, f: Floor): { centre: Vec2; size: number; outline: Vec2[] } {
  const outlines = buildingOutlines(f.walls);
  const main = outlines.sort((a, b) => area(b) - area(a))[0] ?? siteLotPolygon(p);
  return { centre: centroid(main), size: Math.sqrt(area(main)), outline: main };
}

export type CheckLevel = "good" | "warn" | "bad";

export interface FengShuiCheck {
  id: string;
  level: CheckLevel;
  title: string;
  detail: string;
  floorId?: string;
  entityIds?: string[];
  /** One-click fix: stair riser count. */
  fix?: { floorId: string; stairId: string; riserCount: number; label: string };
}

export interface FengShuiResult {
  kua: number;
  kuaName: string;
  group: string;
  directions: { dir: Direction; star: Star }[];
  facingStar: Star | null;
  checks: FengShuiCheck[];
  score: number;
}

const STEP_CYCLE = ["Tử", "Sinh", "Lão", "Bệnh"] as const;

/** Name of the step count in the sinh – lão – bệnh – tử cycle. */
export const stepCycle = (n: number) => STEP_CYCLE[((n % 4) + 4) % 4];

/** Nearest step count ending on "Sinh" (n mod 4 = 1). */
export function nearestSinh(n: number): number {
  const down = n - ((((n - 1) % 4) + 4) % 4);
  const up = down + 4;
  return n - down <= up - n && down >= 2 ? down : up;
}

export function analyzeFengShui(p: Project, inputs: FengShuiInputs = p.fengShui): FengShuiResult | null {
  if (!inputs.birthYear) return null;
  const kua = kuaNumber(inputs.birthYear, inputs.gender);
  const checks: FengShuiCheck[] = [];
  const facing = inputs.facing;
  const facingStar = facing ? starOf(kua, facing) : null;
  const sectorText = (s: Star, d: Direction) => `hướng ${DIRECTION_LABELS[d]} (${STAR_INFO[s].label} – ${STAR_INFO[s].meaning})`;

  if (facing && facingStar) {
    const good = STAR_INFO[facingStar].good;
    checks.push({
      id: "facing",
      level: good ? "good" : "bad",
      title: `Hướng nhà ${DIRECTION_LABELS[facing]}: ${STAR_INFO[facingStar].label}`,
      detail: good ? `Hợp mệnh ${KUA_LABELS[kua].name}.` : `Không hợp mệnh ${KUA_LABELS[kua].name}. Có thể xoay cửa chính hoặc lối vào sang hướng tốt, hoặc dùng mệnh của người khác trong nhà.`,
    });
  }

  if (facing) {
    p.floors.forEach((f, i) => {
      const { centre, size } = houseCentre(p, f);
      const sector = (pt: Vec2): { dir: Direction; star: Star } | null => {
        if (dist(pt, centre) < size * 0.12) return null;
        const dir = directionFromDegrees(planBearing(p, facing, { x: pt.x - centre.x, y: pt.y - centre.y }));
        return { dir, star: starOf(kua, dir) };
      };
      for (const r of f.rooms) {
        const c = centroid(r.polygon);
        const s = sector(c);
        const where = `${f.name}`;
        if (r.type === "wc" || r.type === "bathroom") {
          if (!s) checks.push({ id: `wc-${r.id}`, level: "bad", title: `${r.name} ở trung tâm nhà`, detail: `${where}: WC giữa nhà bị coi là xấu nhất (uế khí lan ra cả nhà). Nên dời ra một góc xấu.`, floorId: f.id, entityIds: [r.id] });
          else if (STAR_INFO[s.star].good) checks.push({ id: `wc-${r.id}`, level: "warn", title: `${r.name} nằm cung tốt`, detail: `${where}: ở ${sectorText(s.star, s.dir)}. WC nên đặt ở cung xấu để "trấn" hung khí.`, floorId: f.id, entityIds: [r.id] });
          else checks.push({ id: `wc-${r.id}`, level: "good", title: `${r.name} ở cung xấu`, detail: `${where}: ${sectorText(s.star, s.dir)} — đúng nguyên tắc.`, floorId: f.id, entityIds: [r.id] });
        } else if (r.type === "kitchen") {
          if (s && STAR_INFO[s.star].good) checks.push({ id: `k-${r.id}`, level: "warn", title: `${r.name} nằm cung tốt`, detail: `${where}: ở ${sectorText(s.star, s.dir)}. Bếp nên "toạ hung hướng cát": đặt ở cung xấu, miệng bếp quay về hướng tốt.`, floorId: f.id, entityIds: [r.id] });
          else checks.push({ id: `k-${r.id}`, level: "good", title: `${r.name} toạ cung xấu`, detail: `${where}: ${s ? sectorText(s.star, s.dir) : "giữa nhà"}. Quay miệng bếp về một hướng tốt.`, floorId: f.id, entityIds: [r.id] });
        } else if (r.type === "worship" || r.type === "bedroom") {
          const what = r.type === "worship" ? "Bàn thờ" : "Phòng ngủ";
          if (s && !STAR_INFO[s.star].good) checks.push({ id: `g-${r.id}`, level: "warn", title: `${r.name} ở cung xấu`, detail: `${where}: ${sectorText(s.star, s.dir)}. ${what} nên ở cung tốt (Sinh Khí, Thiên Y, Diên Niên, Phục Vị).`, floorId: f.id, entityIds: [r.id] });
          else if (s) checks.push({ id: `g-${r.id}`, level: "good", title: `${r.name} ở cung tốt`, detail: `${where}: ${sectorText(s.star, s.dir)}.`, floorId: f.id, entityIds: [r.id] });
        }
        // Altar or kitchen right under a WC on the floor above.
        const above = p.floors[i + 1];
        if ((r.type === "worship" || r.type === "kitchen") && above) {
          const wc = above.rooms.find((x) => (x.type === "wc" || x.type === "bathroom") && pointInPolygon(centroid(x.polygon), r.polygon));
          if (wc) checks.push({ id: `under-${r.id}`, level: "bad", title: `${r.name} nằm dưới ${wc.name}`, detail: `${f.name} – ${above.name}: ${r.type === "worship" ? "bàn thờ" : "bếp"} không nên đặt ngay dưới WC tầng trên.`, floorId: f.id, entityIds: [r.id] });
        }
      }
      for (const st of f.stairs) {
        const fp = generateStair(st, f.height).footprint;
        if (!sector(centroid(fp))) checks.push({ id: `sc-${st.id}`, level: "warn", title: "Cầu thang ở giữa nhà", detail: `${f.name}: thang "xuyên tâm" bị coi là chia cắt nhà. Nên đưa thang sát tường hông.`, floorId: f.id, entityIds: [st.id] });
      }
    });
  }

  // Step count, independent of directions.
  for (const f of p.floors) {
    for (const st of f.stairs) {
      const name = stepCycle(st.riserCount);
      if (name === "Sinh") checks.push({ id: `steps-${st.id}`, level: "good", title: `Cầu thang ${st.riserCount} bậc: "${name}"`, detail: `${f.name}: số bậc rơi vào chữ Sinh.`, floorId: f.id, entityIds: [st.id] });
      else {
        const target = nearestSinh(st.riserCount);
        checks.push({
          id: `steps-${st.id}`,
          level: name === "Lão" ? "warn" : "bad",
          title: `Cầu thang ${st.riserCount} bậc: "${name}"`,
          detail: `${f.name}: nên chọn số bậc rơi vào chữ Sinh (chia 4 dư 1), gần nhất là ${target} bậc.`,
          floorId: f.id,
          entityIds: [st.id],
          fix: { floorId: f.id, stairId: st.id, riserCount: target, label: `Đổi thành ${target} bậc` },
        });
      }
    }
  }

  const penalty = checks.reduce((s, c) => s + (c.level === "bad" ? (c.id === "facing" ? 25 : 12) : c.level === "warn" ? 6 : 0), 0);
  return {
    kua,
    kuaName: KUA_LABELS[kua].name,
    group: KUA_LABELS[kua].group,
    directions: directionsOf(kua),
    facingStar,
    checks: checks.sort((a, b) => ["bad", "warn", "good"].indexOf(a.level) - ["bad", "warn", "good"].indexOf(b.level)),
    score: Math.max(0, 100 - penalty),
  };
}

/** The 8 sectors around the centre of a floor, as plan wedges, for the 2D overlay. */
export function sectorWedges(p: Project, f: Floor, inputs: FengShuiInputs = p.fengShui): { dir: Direction; star: Star | null; polygon: Vec2[]; labelAt: Vec2 }[] {
  if (!inputs.facing) return [];
  const facing = inputs.facing;
  const kua = inputs.birthYear ? kuaNumber(inputs.birthYear, inputs.gender) : null;
  const { centre, size, outline } = houseCentre(p, f);
  const b = bbox(outline);
  // Labels sit just outside the house, where the sector's middle ray leaves its bounding box.
  const labelAt = (a: number): Vec2 => {
    const c = Math.cos(a);
    const sn = Math.sin(a);
    const tx = Math.abs(c) > 1e-6 ? (c > 0 ? b.maxX - centre.x : centre.x - b.minX) / Math.abs(c) : Infinity;
    const ty = Math.abs(sn) > 1e-6 ? (sn > 0 ? b.maxY - centre.y : centre.y - b.minY) / Math.abs(sn) : Infinity;
    const t = Math.min(tx, ty) + 1.2;
    return { x: centre.x + c * t, y: centre.y + sn * t };
  };
  // Plan angle of a compass bearing: invert planBearing using two reference bearings.
  const b0 = planBearing(p, facing, { x: 1, y: 0 });
  const toPlan = (bearing: number) => ((bearing - b0) * Math.PI) / 180;
  const R = size * 1.6;
  return DIRECTIONS.map((dir) => {
    const mid = DIRECTION_DEGREES[dir];
    const pts: Vec2[] = [centre];
    for (let k = 0; k <= 6; k++) {
      const a = toPlan(mid - 22.5 + (45 * k) / 6);
      pts.push({ x: centre.x + Math.cos(a) * R, y: centre.y + Math.sin(a) * R });
    }
    const a = toPlan(mid);
    return { dir, star: kua ? starOf(kua, dir) : null, polygon: pts, labelAt: labelAt(a) };
  });
}
