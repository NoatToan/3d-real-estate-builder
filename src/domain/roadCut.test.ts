import { describe, expect, it } from "vitest";
import { clipHalfPlane, area, pointInPolygon } from "@/geometry/polygon";
import { roadCutGeometry, siteLotPolygon } from "./roadCut";
import { buildablePolygon, computeStats } from "./stats";
import { validateProject } from "./validation";
import { createLot, createProject, createWall, rectPolygon } from "./factory";
import { parseProject } from "./schema";
import { useProjectStore } from "@/store/projectStore";
import type { Project, Vec2 } from "./types";

/** 5 m frontage on edge 0 (y = 0), 20 m deep. */
function project(depth = 4, edge = 0, poly: Vec2[] = rectPolygon(5, 20)): Project {
  const p = createProject("Lô", createLot(poly));
  p.constraints.roadCut = { enabled: true, edge, depth, roadWidth: 19.04 };
  return p;
}

describe("clipHalfPlane", () => {
  it("keeps the side the normal points to", () => {
    const sq = rectPolygon(10, 10);
    expect(area(clipHalfPlane(sq, { x: 0, y: 3 }, { x: 0, y: 1 }))).toBeCloseTo(70);
    expect(area(clipHalfPlane(sq, { x: 0, y: 3 }, { x: 0, y: -1 }))).toBeCloseTo(30);
    expect(clipHalfPlane(sq, { x: 0, y: 20 }, { x: 0, y: 1 })).toEqual([]);
  });

  it("handles concave outlines", () => {
    // L-shape: 10×10 minus the 5×5 top-right corner.
    const l = [
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 5, y: 5 },
      { x: 10, y: 5 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    expect(area(clipHalfPlane(l, { x: 0, y: 2 }, { x: 0, y: 1 }))).toBeCloseTo(75 - 10);
  });
});

describe("roadCutGeometry", () => {
  it("splits the lot along the road edge", () => {
    const g = roadCutGeometry(project(4))!;
    expect(g.cutArea).toBeCloseTo(20);
    expect(g.remainingArea).toBeCloseTo(80);
    expect(g.frontWidth).toBeCloseTo(5);
    expect(g.line.every((p) => Math.abs(p.y - 4) < 1e-9)).toBe(true);
  });

  it("works on any edge and on a tapering lot (tóp hậu)", () => {
    // Front 6.3 m on the left edge (x = 0), back narrows to 3.2 m.
    const taper = [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 3.2 },
      { x: 0, y: 6.3 },
    ];
    const g = roadCutGeometry(project(11, 3, taper))!;
    const total = area(taper);
    expect(g.cutArea + g.remainingArea).toBeCloseTo(total);
    // Width at x = 11 on a linear taper.
    expect(g.frontWidth).toBeCloseTo(6.3 - (11 / 20) * 3.1, 6);
  });

  it("is off when disabled, zero-depth or deeper than the lot", () => {
    const p = project(4);
    p.constraints.roadCut.enabled = false;
    expect(roadCutGeometry(p)).toBeNull();
    expect(siteLotPolygon(p)).toBe(p.lot.polygon);
    expect(roadCutGeometry(project(0))).toBeNull();
    expect(roadCutGeometry(project(25))).toBeNull();
  });
});

describe("road cut in stats and validation", () => {
  it("bases coverage and FAR on the land left after the cut", () => {
    const p = project(4);
    const s = computeStats(p);
    expect(s.lotArea).toBeCloseTo(100);
    expect(s.roadCutArea).toBeCloseTo(20);
    expect(s.siteArea).toBeCloseTo(80);
    expect(s.frontWidthAfterCut).toBeCloseTo(5);
  });

  it("measures the front setback from the new road boundary", () => {
    const p = project(4);
    p.constraints.setback = { enabled: true, perEdge: [2, 0, 1, 0] };
    const b = buildablePolygon(p)!;
    // 5 wide, from y = 4 + 2 to y = 20 − 1.
    expect(area(b)).toBeCloseTo(5 * 13);
    expect(pointInPolygon({ x: 2.5, y: 5.9 }, b)).toBe(false);
    expect(pointInPolygon({ x: 2.5, y: 6.1 }, b)).toBe(true);
  });

  it("flags walls built on the land taken by the road", () => {
    const p = project(4);
    p.floors[0].walls = [createWall({ x: 1, y: 2 }, { x: 4, y: 2 }, 0.2)];
    expect(validateProject(p).some((i) => i.id === `lot-${p.floors[0].id}` && i.level === "error")).toBe(true);
    p.floors[0].walls = [createWall({ x: 1, y: 6 }, { x: 4, y: 6 }, 0.2)];
    expect(validateProject(p).some((i) => i.id === `lot-${p.floors[0].id}`)).toBe(false);
  });

  it("reports a cut deeper than the lot", () => {
    expect(validateProject(project(25)).some((i) => i.id === "roadcut-invalid")).toBe(true);
  });
});

describe("road cut persistence and store", () => {
  it("defaults the road cut for projects saved before the feature", () => {
    const old = JSON.parse(JSON.stringify(createProject("Cũ"))) as { constraints: Record<string, unknown> };
    delete old.constraints.roadCut;
    expect(parseProject(old).constraints.roadCut).toEqual({ enabled: false, edge: 0, depth: 0, roadWidth: null });
  });

  it("wraps exterior walls around the remaining land and resets on a new outline", () => {
    const s = useProjectStore.getState();
    s.load(project(4));
    const fid = useProjectStore.getState().project!.floors[0].id;
    expect(useProjectStore.getState().generateExteriorWalls(fid, "lot")).toBe(true);
    const walls = useProjectStore.getState().project!.floors[0].walls;
    expect(Math.min(...walls.flatMap((w) => [w.a.y, w.b.y]))).toBeCloseTo(4 + 0.11, 6);

    s.setLot(createLot([{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 0, y: 8 }]));
    expect(useProjectStore.getState().project!.constraints.roadCut.enabled).toBe(false);
  });
});
