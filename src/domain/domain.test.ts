import { describe, expect, it } from "vitest";
import { createFloor, createLot, createOpening, createProject, createStair, createWall, projectMeta, rectPolygon } from "./factory";
import { parseProject, ProjectFormatError, migrateProject } from "./schema";
import { reconcileRooms, roomNetArea } from "./rooms";
import { buildablePolygon, computeStats, floorElevations } from "./stats";
import { validateProject } from "./validation";
import { fmtArea, fmtLength, fmtPercent } from "./labels";
import type { Project, Wall } from "./types";

const box = (w: number, h: number, x = 0, y = 0, t = 0.2): Wall[] => [
  createWall({ x, y }, { x: x + w, y }, t),
  createWall({ x: x + w, y }, { x: x + w, y: y + h }, t),
  createWall({ x: x + w, y: y + h }, { x, y: y + h }, t),
  createWall({ x, y: y + h }, { x, y }, t),
];

function projectWith(walls: Wall[]): Project {
  const p = createProject("Test", createLot(rectPolygon(10, 20)));
  p.floors[0].walls = walls;
  p.floors[0].rooms = reconcileRooms([], walls);
  return p;
}

describe("factory", () => {
  it("creates a valid default project", () => {
    const p = createProject("  ");
    expect(p.name).toBe("Dự án mới");
    expect(p.floors).toHaveLength(1);
    expect(p.constraints.setback.perEdge).toHaveLength(4);
    expect(() => parseProject(p)).not.toThrow();
    expect(projectMeta(p).lotArea).toBeCloseTo(100);
  });

  it("creates openings and stairs with sensible defaults", () => {
    expect(createOpening("door", "w", 1).sill).toBe(0);
    expect(createOpening("window", "w", 1).sill).toBeGreaterThan(0);
    expect(createStair("spiral", { x: 1, y: 1 }).width).toBeLessThan(0.9);
    expect(createFloor(1).name).toBe("Tầng 2");
  });
});

describe("schema", () => {
  it("rejects malformed documents with a readable path", () => {
    const p = createProject("x");
    const bad = { ...p, floors: [{ ...p.floors[0], height: -1 }] };
    expect(() => parseProject(bad)).toThrow(/floors\.0\.height/);
    expect(() => parseProject(null)).toThrow(ProjectFormatError);
  });

  it("migrates v0 and refuses newer versions", () => {
    const p = createProject("x");
    const { schemaVersion: _v, ...v0 } = p;
    void _v;
    expect(parseProject(v0).schemaVersion).toBe(1);
    expect(() => migrateProject({ ...p, schemaVersion: 99 })).toThrow(/phiên bản mới hơn/);
  });
});

describe("rooms", () => {
  it("detects rooms and keeps names across edits", () => {
    const walls = box(6, 4);
    let rooms = reconcileRooms([], walls);
    expect(rooms).toHaveLength(1);
    rooms = rooms.map((r) => ({ ...r, name: "Khách", type: "living" as const }));

    const split = [...walls, createWall({ x: 4, y: 0 }, { x: 4, y: 4 })];
    const next = reconcileRooms(rooms, split);
    expect(next).toHaveLength(2);
    const kept = next.find((r) => r.name === "Khách");
    expect(kept?.id).toBe(rooms[0].id);
    expect(next.find((r) => r.name !== "Khách")?.name).toMatch(/^Phòng \d+$/);
  });

  it("keeps manual rooms and skips duplicate auto faces", () => {
    const walls = box(4, 4);
    const manual = {
      id: "m",
      polygon: rectPolygon(4, 4),
      netPolygon: null,
      name: "Thủ công",
      type: "bedroom" as const,
      source: "manual" as const,
    };
    const rooms = reconcileRooms([manual], walls);
    expect(rooms).toHaveLength(1);
    expect(rooms[0].id).toBe("m");
    expect(roomNetArea(rooms[0])).toBeCloseTo(16);
  });
});

describe("stats", () => {
  it("computes coverage and floor area ratio", () => {
    const p = projectWith(box(5, 10, 1, 1));
    p.floors.push(createFloor(1, { walls: box(5, 10, 1, 1) }));
    const s = computeStats(p);
    expect(s.lotArea).toBeCloseTo(200);
    expect(s.footprintArea).toBeCloseTo(5.2 * 10.2);
    expect(s.totalFloorArea).toBeCloseTo(2 * 5.2 * 10.2);
    expect(s.coverage).toBeCloseTo((5.2 * 10.2) / 200);
    expect(floorElevations(p.floors)).toEqual([0, 3.6]);
    expect(s.totalHeight).toBeCloseTo(6.9);
  });

  it("computes the buildable polygon only when enabled", () => {
    const p = projectWith([]);
    expect(buildablePolygon(p)).toBeNull();
    p.constraints.setback = { enabled: true, perEdge: [3, 0, 2, 0] };
    expect(computeStats(p).buildableArea).toBeCloseTo(10 * 15);
  });
});

describe("validation", () => {
  it("flags walls outside the lot only when the constraint is on", () => {
    const p = projectWith(box(12, 5));
    expect(validateProject(p).some((i) => i.id.startsWith("lot-f_"))).toBe(true);
    p.constraints.keepInsideLot = false;
    expect(validateProject(p).some((i) => i.id.startsWith("lot-f_"))).toBe(false);
  });

  it("flags setback violations, overhangs and stair issues", () => {
    const p = projectWith(box(8, 18, 1, 1));
    p.constraints.setback = { enabled: true, perEdge: [3, 0, 0, 0] };
    p.floors[0].stairs.push(createStair("straight", { x: 2, y: 5 }));
    const issues = validateProject(p);
    expect(issues.some((i) => i.id.startsWith("setback-"))).toBe(true);
    expect(issues.some((i) => i.id.startsWith("stair-top-"))).toBe(true);

    p.floors.push(createFloor(1, { walls: box(9, 18, 0.5, 1) }));
    expect(validateProject(p).some((i) => i.id.startsWith("overhang-"))).toBe(true);
    p.constraints.allowOverhang = true;
    expect(validateProject(p).some((i) => i.id.startsWith("overhang-"))).toBe(false);
  });

  it("flags overlapping and orphan openings, invalid setbacks, area deviation", () => {
    const p = projectWith(box(4, 4, 1, 1));
    const w = p.floors[0].walls[0];
    p.floors[0].openings.push(createOpening("window", w.id, 2), createOpening("door", w.id, 2.2), createOpening("door", "nope", 1));
    p.constraints.setback = { enabled: true, perEdge: [6, 6, 6, 6] };
    p.lot.certifiedArea = 150;
    const ids = validateProject(p).map((i) => i.id);
    expect(ids.some((i) => i.startsWith("overlap-"))).toBe(true);
    expect(ids.some((i) => i.startsWith("orphan-"))).toBe(true);
    expect(ids).toContain("setback-invalid");
    expect(ids).toContain("lot-area");
  });
});

describe("labels", () => {
  it("formats Vietnamese numbers", () => {
    expect(fmtLength(3.5)).toBe("3,50 m");
    expect(fmtArea(12)).toBe("12,00 m²");
    expect(fmtPercent(0.456)).toBe("45,6%");
  });
});
