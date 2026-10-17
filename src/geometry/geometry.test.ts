import { describe, expect, it } from "vitest";
import type { Opening, Stair, Wall } from "@/domain/types";
import {
  area,
  centroid,
  circlePolygon,
  edgeLengths,
  isSimplePolygon,
  pointInPolygon,
  polygonInsidePolygon,
  signedArea,
  simplifyPolygon,
} from "./polygon";
import { collinearOverlap, lineIntersection, projectOnSegment, segmentIntersection } from "./segment";
import { insetPolygon } from "./offset";
import { buildingOutlines, buildWallGraph, detectRooms } from "./wallGraph";
import { estimateScale, fitLotPolygon, solveLot } from "./lotSolver";
import { generateStair, splitFlights } from "./stairs";
import { clampOpening, openingsOverlap, wallPieces, wallQuad } from "./openings";
import { snapPoint } from "./snapping";
import { rotate } from "./vec";

const sq = (w: number, h: number, x = 0, y = 0) => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
];

let wid = 0;
const wall = (ax: number, ay: number, bx: number, by: number, thickness = 0.2): Wall => ({
  id: `w${++wid}`,
  a: { x: ax, y: ay },
  b: { x: bx, y: by },
  thickness,
});

const boxWalls = (w: number, h: number, t = 0.2): Wall[] => [
  wall(0, 0, w, 0, t),
  wall(w, 0, w, h, t),
  wall(w, h, 0, h, t),
  wall(0, h, 0, 0, t),
];

describe("polygon", () => {
  it("computes area, centroid and orientation", () => {
    const p = sq(4, 5);
    expect(area(p)).toBeCloseTo(20);
    expect(signedArea(p)).toBeGreaterThan(0);
    expect(signedArea([...p].reverse())).toBeLessThan(0);
    expect(centroid(p)).toEqual({ x: 2, y: 2.5 });
    expect(edgeLengths(p)).toEqual([4, 5, 4, 5]);
  });

  it("tests point inclusion including the boundary", () => {
    const p = sq(4, 4);
    expect(pointInPolygon({ x: 2, y: 2 }, p)).toBe(true);
    expect(pointInPolygon({ x: 4, y: 2 }, p)).toBe(true);
    expect(pointInPolygon({ x: 5, y: 2 }, p)).toBe(false);
  });

  it("detects self intersections", () => {
    expect(isSimplePolygon(sq(2, 2))).toBe(true);
    expect(
      isSimplePolygon([
        { x: 0, y: 0 },
        { x: 2, y: 2 },
        { x: 2, y: 0 },
        { x: 0, y: 2 },
      ]),
    ).toBe(false);
  });

  it("simplifies collinear vertices", () => {
    const p = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }];
    expect(simplifyPolygon(p)).toHaveLength(4);
  });

  it("checks polygon containment", () => {
    expect(polygonInsidePolygon(sq(1, 1, 1, 1), sq(4, 4))).toBe(true);
    expect(polygonInsidePolygon(sq(3, 3, 2, 2), sq(4, 4))).toBe(false);
    expect(circlePolygon({ x: 0, y: 0 }, 1, 16)).toHaveLength(16);
  });
});

describe("segment", () => {
  it("intersects crossing segments", () => {
    const hit = segmentIntersection({ x: 0, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }, { x: 2, y: 0 });
    expect(hit?.point.x).toBeCloseTo(1);
    expect(segmentIntersection({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 })).toBeNull();
    expect(lineIntersection({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 0 })).toBeNull();
  });

  it("projects onto segments and detects overlap", () => {
    const pr = projectOnSegment({ x: 1, y: 1 }, { x: 0, y: 0 }, { x: 2, y: 0 });
    expect(pr.point).toEqual({ x: 1, y: 0 });
    expect(pr.distance).toBeCloseTo(1);
    expect(collinearOverlap({ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 0 }, { x: 3, y: 0 })).toBe(true);
    expect(collinearOverlap({ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }, { x: 4, y: 0 })).toBe(false);
  });
});

describe("insetPolygon", () => {
  it("insets uniformly and per edge", () => {
    const r = insetPolygon(sq(10, 20), 1)!;
    expect(area(r)).toBeCloseTo(8 * 18);
    const per = insetPolygon(sq(10, 20), [3, 0, 0, 0])!;
    expect(area(per)).toBeCloseTo(10 * 17);
  });

  it("works regardless of winding and supports outset", () => {
    expect(area(insetPolygon([...sq(10, 20)].reverse(), 1)!)).toBeCloseTo(144);
    expect(area(insetPolygon(sq(10, 10), -1)!)).toBeCloseTo(144);
  });

  it("returns null when the setback swallows the polygon", () => {
    expect(insetPolygon(sq(4, 4), 3)).toBeNull();
  });
});

describe("wall graph & room detection", () => {
  it("detects one room inside a closed box", () => {
    const rooms = detectRooms(boxWalls(4, 5));
    expect(rooms).toHaveLength(1);
    expect(rooms[0].area).toBeCloseTo(20);
    expect(rooms[0].netArea).toBeCloseTo(3.8 * 4.8);
  });

  it("splits rooms with a partition wall (T-junctions)", () => {
    const rooms = detectRooms([...boxWalls(6, 4), wall(3, 0, 3, 4)]);
    expect(rooms).toHaveLength(2);
    expect(rooms.map((r) => r.area).sort()).toEqual([12, 12]);
  });

  it("handles crossing partitions and dangling walls", () => {
    const rooms = detectRooms([...boxWalls(6, 6), wall(3, -1, 3, 7), wall(-1, 3, 7, 3), wall(1, 1, 2, 1)]);
    expect(rooms).toHaveLength(4);
    rooms.forEach((r) => expect(r.area).toBeCloseTo(9));
  });

  it("merges nearly coincident endpoints and duplicated walls", () => {
    const walls = [...boxWalls(4, 4), wall(0.004, 0, 4, 0.003)];
    const g = buildWallGraph(walls);
    expect(g.nodes).toHaveLength(4);
    expect(detectRooms(walls)).toHaveLength(1);
  });

  it("ignores open wall chains", () => {
    expect(detectRooms([wall(0, 0, 4, 0), wall(4, 0, 4, 4)])).toHaveLength(0);
  });

  it("builds the outer outline outset by half the wall thickness", () => {
    const outlines = buildingOutlines([...boxWalls(4, 5), wall(2, 0, 2, 5)]);
    expect(outlines).toHaveLength(1);
    expect(area(outlines[0])).toBeCloseTo(4.2 * 5.2);
  });
});

describe("lot solver", () => {
  it("estimates the scale as the median ratio", () => {
    const px = sq(100, 400);
    expect(estimateScale(px, [5, 20, 5, null])).toBeCloseTo(20);
    expect(estimateScale(px, [null, null, null, null])).toBeNull();
  });

  it("fits a skewed trace to certificate lengths", () => {
    const traced = [
      { x: 0, y: 0 },
      { x: 5.3, y: 0.1 },
      { x: 5.1, y: 19.6 },
      { x: -0.2, y: 20.3 },
    ];
    const res = fitLotPolygon(traced, [5, 20, 5.2, 20.1]);
    expect(res.maxError).toBeLessThan(0.01);
    expect(res.polygon[0].x).toBeGreaterThanOrEqual(-1e-9);
    expect(res.area).toBeGreaterThan(95);
  });

  it("solves from pixels", () => {
    const res = solveLot(sq(200, 800), [5, 20, 5, 20])!;
    expect(res.pxPerMeter).toBeCloseTo(40);
    expect(res.area).toBeCloseTo(100, 1);
    expect(solveLot(sq(1, 1).slice(0, 2), [1, 1])).toBeNull();
    expect(solveLot(sq(200, 800), [null, null, null, null])).toBeNull();
  });
});

const baseStair = (over: Partial<Stair> = {}): Stair => ({
  id: "s1",
  type: "straight",
  x: 0,
  y: 0,
  rotation: 0,
  width: 1,
  riserCount: 18,
  treadDepth: 0.26,
  landingDepth: 1,
  gap: 0.1,
  turn: "right",
  innerRadius: 0.15,
  sweep: 360,
  ...over,
});

describe("stairs", () => {
  it("splits flights around a landing", () => {
    expect(splitFlights(18)).toEqual({ first: 9, second: 8 });
    expect(splitFlights(2)).toEqual({ first: 1, second: 1 });
  });

  it("generates a straight stair reaching the floor above", () => {
    const g = generateStair(baseStair(), 3.3);
    expect(g.steps).toHaveLength(18);
    expect(g.steps.at(-1)!.top).toBeCloseTo(3.3);
    expect(area(g.footprint)).toBeCloseTo(18 * 0.26 * 1);
    expect(g.warnings).toEqual([]);
  });

  it("generates L and U stairs with a landing", () => {
    for (const type of ["L", "U"] as const) {
      for (const turn of ["left", "right"] as const) {
        const g = generateStair(baseStair({ type, turn }), 3.3);
        expect(g.steps.filter((s) => s.kind === "landing")).toHaveLength(1);
        expect(g.steps).toHaveLength(18);
        expect(g.steps.at(-1)!.top).toBeCloseTo(3.3);
        expect(isSimplePolygon(g.footprint)).toBe(true);
        for (const s of g.steps) for (const p of s.polygon) expect(pointInPolygon(p, g.footprint, 1e-6)).toBe(true);
      }
    }
  });

  it("generates spiral stairs and checks going on the walk line", () => {
    const g = generateStair(baseStair({ type: "spiral", width: 0.8, riserCount: 16, sweep: 360 }), 3);
    expect(g.steps).toHaveLength(16);
    expect(g.going).toBeCloseTo((0.15 + 0.4) * ((2 * Math.PI) / 16));
    expect(g.warnings.length).toBeGreaterThan(0);
  });

  it("applies rotation", () => {
    const g = generateStair(baseStair({ rotation: 90 }), 3.3);
    const p = g.steps[0].polygon[1];
    const expected = rotate({ x: 0.26, y: 0 }, 90);
    expect(p.x).toBeCloseTo(expected.x);
    expect(p.y).toBeCloseTo(expected.y);
  });

  it("warns on steep stairs", () => {
    const g = generateStair(baseStair({ riserCount: 12, treadDepth: 0.2, width: 0.6 }), 3.3);
    expect(g.warnings.length).toBeGreaterThanOrEqual(3);
  });
});

const opening = (over: Partial<Opening> = {}): Opening => ({
  id: "o1",
  wallId: "w",
  kind: "window",
  offset: 2,
  width: 1,
  height: 1.2,
  sill: 0.9,
  hinge: "start",
  swing: "left",
  ...over,
});

describe("openings", () => {
  const w: Wall = { id: "w", a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, thickness: 0.2 };

  it("splits a wall around a window", () => {
    const pieces = wallPieces(w, [opening()], 3);
    expect(pieces).toEqual([
      { start: 0, end: 1.5, bottom: 0, top: 3 },
      { start: 1.5, end: 2.5, bottom: 0, top: 0.9 },
      { start: 1.5, end: 2.5, bottom: 2.1, top: 3 },
      { start: 2.5, end: 4, bottom: 0, top: 3 },
    ]);
  });

  it("splits a wall around a door (no sill piece)", () => {
    const pieces = wallPieces(w, [opening({ kind: "door", sill: 0, height: 2.2, offset: 1 })], 3);
    expect(pieces).toHaveLength(3);
  });

  it("clamps openings to the wall and detects overlap", () => {
    const c = clampOpening(opening({ offset: 0, width: 10 }), w);
    expect(c.width).toBeCloseTo(3.9);
    expect(c.offset).toBeCloseTo(2);
    expect(openingsOverlap(opening(), opening({ id: "o2", offset: 2.8 }))).toBe(true);
    expect(openingsOverlap(opening(), opening({ id: "o2", offset: 3.6, width: 0.5 }))).toBe(false);
    expect(wallQuad(w)).toHaveLength(4);
  });
});

describe("snapping", () => {
  const walls = boxWalls(4, 4);
  const ctx = { walls, lot: sq(10, 10), grid: 0.1, tolerance: 0.2 };

  it("prefers endpoints, then midpoints, then walls, then grid", () => {
    expect(snapPoint({ x: 0.1, y: 0.05 }, ctx).kind).toBe("endpoint");
    expect(snapPoint({ x: 2.05, y: 0.1 }, ctx).kind).toBe("midpoint");
    expect(snapPoint({ x: 1, y: 0.1 }, ctx)).toEqual({ point: { x: 1, y: 0 }, kind: "wall" });
    const g = snapPoint({ x: 7.03, y: 7.06 }, ctx).point;
    expect(g.x).toBeCloseTo(7);
    expect(g.y).toBeCloseTo(7.1);
    expect(snapPoint({ x: 9.95, y: 9.9 }, ctx).kind).toBe("lot-vertex");
    expect(snapPoint({ x: 9.95, y: 6 }, ctx).kind).toBe("lot-edge");
  });

  it("snaps angles relative to the anchor", () => {
    const r = snapPoint({ x: 6.05, y: 6.1 }, { ...ctx, anchor: { x: 6, y: 8 } });
    expect(r.kind).toBe("angle");
    expect(r.point.x).toBeCloseTo(6);
    expect(r.point.y).toBeCloseTo(6.1);
  });

  it("can be disabled", () => {
    expect(snapPoint({ x: 0.1, y: 0.1 }, { ...ctx, enabled: false }).kind).toBe("none");
  });
});
