import type { Room, Wall } from "./types";
import { newId } from "./factory";
import { area, centroid, pointInPolygon } from "@/geometry/polygon";
import { detectRooms } from "@/geometry/wallGraph";

function nextRoomNumber(rooms: readonly Room[]): number {
  let max = 0;
  for (const r of rooms) {
    const m = /^Phòng (\d+)$/.exec(r.name);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max + 1;
}

/**
 * Recomputes auto-detected rooms from the walls while keeping the identity, name and
 * type of rooms that still exist (matched by centroid containment and similar area).
 * Manual rooms are kept untouched, and detected faces duplicating a manual room are skipped.
 */
export function reconcileRooms(prev: readonly Room[], walls: readonly Wall[]): Room[] {
  const manual = prev.filter((r) => r.source === "manual");
  const oldAuto = prev.filter((r) => r.source === "auto");
  const detected = detectRooms(walls).filter((d) => {
    const c = centroid(d.polygon);
    return !manual.some((m) => {
      const ratio = d.area / Math.max(1e-9, area(m.polygon));
      return pointInPolygon(c, m.polygon) && ratio > 0.85 && ratio < 1.15;
    });
  });

  // Score every (detected, old) pair; greedy assignment by best area agreement.
  const pairs: { d: number; o: number; score: number }[] = [];
  detected.forEach((d, di) => {
    const c = centroid(d.polygon);
    oldAuto.forEach((o, oi) => {
      if (!pointInPolygon(c, o.polygon)) return;
      const a = area(o.polygon);
      pairs.push({ d: di, o: oi, score: Math.min(a, d.area) / Math.max(a, d.area) });
    });
  });
  pairs.sort((p, q) => q.score - p.score);
  const usedD = new Set<number>();
  const usedO = new Set<number>();
  const match = new Map<number, Room>();
  for (const p of pairs) {
    if (usedD.has(p.d) || usedO.has(p.o)) continue;
    usedD.add(p.d);
    usedO.add(p.o);
    match.set(p.d, oldAuto[p.o]);
  }

  let n = nextRoomNumber(prev);
  const auto: Room[] = detected.map((d, i) => {
    const old = match.get(i);
    return old
      ? { ...old, polygon: d.polygon, netPolygon: d.netPolygon }
      : {
          id: newId("r_"),
          polygon: d.polygon,
          netPolygon: d.netPolygon,
          name: `Phòng ${n++}`,
          type: "other",
          source: "auto",
        };
  });
  return [...manual, ...auto];
}

/** Net area of a room (inside the walls when known). */
export const roomNetArea = (r: Room): number => area(r.netPolygon ?? r.polygon);
