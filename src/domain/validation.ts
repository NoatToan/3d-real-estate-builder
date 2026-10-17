import type { Project, Vec2 } from "./types";
import { isSimplePolygon, pointInPolygon } from "@/geometry/polygon";
import { openingsOverlap, wallQuad } from "@/geometry/openings";
import { generateStair } from "@/geometry/stairs";
import { buildingOutlines } from "@/geometry/wallGraph";
import { buildablePolygon, computeStats } from "./stats";

export type IssueLevel = "error" | "warning" | "info";

export interface Issue {
  id: string;
  level: IssueLevel;
  message: string;
  floorId?: string;
  entityIds?: string[];
}

const TOL = 0.01;

function allInside(points: readonly Vec2[], poly: readonly Vec2[]): boolean {
  return points.every((p) => pointInPolygon(p, poly, TOL));
}

/** Checks the project against the enabled constraints and basic sanity rules. */
export function validateProject(p: Project): Issue[] {
  const issues: Issue[] = [];
  const lot = p.lot.polygon;
  const lotOk = lot.length >= 3 && isSimplePolygon(lot);
  if (!lotOk) issues.push({ id: "lot-invalid", level: "error", message: "Ranh giới thửa đất không hợp lệ (tự cắt nhau hoặc thiếu đỉnh)." });

  const stats = computeStats(p);
  if (stats.lotAreaDeviation != null && Math.abs(stats.lotAreaDeviation) > 0.03) {
    issues.push({
      id: "lot-area",
      level: "warning",
      message: `Diện tích tính được lệch ${(stats.lotAreaDeviation * 100).toFixed(1)}% so với diện tích trên sổ.`,
    });
  }

  const buildable = buildablePolygon(p);
  if (p.constraints.setback.enabled && !buildable) {
    issues.push({ id: "setback-invalid", level: "error", message: "Khoảng lùi quá lớn — không còn diện tích xây dựng." });
  }

  p.floors.forEach((f, fi) => {
    const isTop = fi === p.floors.length - 1;
    const outsideLot: string[] = [];
    const outsideSetback: string[] = [];
    for (const w of f.walls) {
      const pts = wallQuad(w);
      if (p.constraints.keepInsideLot && lotOk && !allInside(pts, lot)) outsideLot.push(w.id);
      const limitSetback = buildable && (fi === 0 || !p.constraints.allowOverhang);
      if (limitSetback && !allInside(pts, buildable)) outsideSetback.push(w.id);
    }
    if (outsideLot.length)
      issues.push({
        id: `lot-${f.id}`,
        level: "error",
        floorId: f.id,
        entityIds: outsideLot,
        message: `${f.name}: ${outsideLot.length} vách nằm ngoài ranh đất.`,
      });
    if (outsideSetback.length)
      issues.push({
        id: `setback-${f.id}`,
        level: "warning",
        floorId: f.id,
        entityIds: outsideSetback,
        message: `${f.name}: ${outsideSetback.length} vách vượt chỉ giới xây dựng (khoảng lùi).`,
      });

    if (fi > 0 && !p.constraints.allowOverhang) {
      const below = buildingOutlines(p.floors[fi - 1].walls);
      const here = buildingOutlines(f.walls);
      if (below.length && here.some((o) => !below.some((b) => allInside(o, b)))) {
        issues.push({
          id: `overhang-${f.id}`,
          level: "warning",
          floorId: f.id,
          message: `${f.name}: phần sàn đua ra ngoài tầng dưới (bật "Cho phép đua/ban công" nếu có chủ đích).`,
        });
      }
    }

    for (const s of f.stairs) {
      const g = generateStair(s, f.height);
      if (isTop)
        issues.push({
          id: `stair-top-${s.id}`,
          level: "warning",
          floorId: f.id,
          entityIds: [s.id],
          message: `${f.name}: cầu thang ở tầng trên cùng — hãy thêm tầng phía trên hoặc xoá thang.`,
        });
      if (p.constraints.keepInsideLot && lotOk && !allInside(g.footprint, lot))
        issues.push({
          id: `stair-lot-${s.id}`,
          level: "error",
          floorId: f.id,
          entityIds: [s.id],
          message: `${f.name}: cầu thang vượt ra ngoài ranh đất.`,
        });
      g.warnings.forEach((msg, k) =>
        issues.push({ id: `stair-${s.id}-${k}`, level: "warning", floorId: f.id, entityIds: [s.id], message: `${f.name} – cầu thang: ${msg}` }),
      );
    }

    const wallIds = new Set(f.walls.map((w) => w.id));
    for (let i = 0; i < f.openings.length; i++) {
      const o = f.openings[i];
      if (!wallIds.has(o.wallId)) {
        issues.push({ id: `orphan-${o.id}`, level: "error", floorId: f.id, entityIds: [o.id], message: `${f.name}: cửa không gắn với vách nào.` });
        continue;
      }
      for (let j = i + 1; j < f.openings.length; j++) {
        if (openingsOverlap(o, f.openings[j]))
          issues.push({
            id: `overlap-${o.id}-${f.openings[j].id}`,
            level: "warning",
            floorId: f.id,
            entityIds: [o.id, f.openings[j].id],
            message: `${f.name}: hai cửa chồng lên nhau trên cùng một vách.`,
          });
      }
    }

    if (!f.walls.length && !f.rooms.length)
      issues.push({ id: `empty-${f.id}`, level: "info", floorId: f.id, message: `${f.name}: chưa có vách hoặc phòng nào.` });
  });

  return issues;
}
