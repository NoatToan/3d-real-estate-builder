import { describe, expect, it } from "vitest";
import { planQuickFloor, QUICK_TEMPLATES, quickFloorOutline, zoneDepths, type QuickFloorOptions } from "./quickFloor";
import { createFurniture, FURNITURE_CATALOG, furnitureRect } from "./furniture";
import { createLot, createProject, rectPolygon } from "./factory";
import { parseProject } from "./schema";
import { validateProject } from "./validation";
import { area, pointInPolygon } from "@/geometry/polygon";
import { hitTest } from "@/geometry/hitTest";
import { generateStair } from "@/geometry/stairs";
import { useProjectStore } from "@/store/projectStore";

const OPTS: QuickFloorOptions = { frontEdge: 0, withStair: true, isGround: true, floorHeight: 3.6, exteriorThickness: 0.22, interiorThickness: 0.11 };
const tpl = (id: string) => QUICK_TEMPLATES.find((t) => t.id === id)!;

describe("zoneDepths", () => {
  it("keeps fixed depths and shares the rest", () => {
    expect(zoneDepths([{ name: "a", type: "other", depth: 4 }, { name: "b", type: "other", depth: 0 }, { name: "c", type: "other", depth: 0 }], 20)).toEqual([4, 8, 8]);
  });

  it("shrinks fixed bands when the lot is too short", () => {
    const d = zoneDepths([{ name: "a", type: "other", depth: 10 }, { name: "b", type: "other", depth: 0 }], 8, 2.5);
    expect(d[0]).toBeCloseTo(5.5);
    expect(d[1]).toBeCloseTo(2.5);
  });
});

describe("planQuickFloor", () => {
  const lot = rectPolygon(5, 20);

  it("lays out bands front to back with doors, stair, WC and furniture", () => {
    const plan = planQuickFloor(lot, tpl("ground").zones, OPTS)!;
    expect(plan).not.toBeNull();
    expect(plan.depth).toBeCloseTo(19.78, 2);
    // 4 exterior + 3 cross walls + 1 WC wall
    expect(plan.walls).toHaveLength(8);
    expect(plan.stairs).toHaveLength(1);
    expect(plan.openings.filter((o) => o.kind === "door").length).toBeGreaterThanOrEqual(5);
    expect(plan.furniture.map((f) => f.kind)).toEqual(expect.arrayContaining(["car", "sofa", "toilet", "kitchenCounter"]));
    // Everything stays on the lot.
    const fp = generateStair(plan.stairs[0], OPTS.floorHeight).footprint;
    expect(fp.every((p) => pointInPolygon(p, lot, 0.01))).toBe(true);
    for (const f of plan.furniture) expect(furnitureRect(f).every((p) => pointInPolygon(p, lot, 0.01))).toBe(true);
  });

  it("follows the chosen street edge", () => {
    // Street on the right edge (x = 20) of a 20 × 6 lot.
    const plan = planQuickFloor(rectPolygon(20, 6), tpl("bedrooms").zones, { ...OPTS, frontEdge: 1 })!;
    const inner = plan.walls.slice(4);
    // Two cross walls run across the frontage (constant x); the WC wall runs along the depth.
    expect(inner.filter((w) => Math.abs(w.a.x - w.b.x) < 1e-6)).toHaveLength(2);
    expect(inner.filter((w) => Math.abs(w.a.y - w.b.y) < 1e-6)).toHaveLength(1);
    expect(plan.labels.map((l) => l.name)).toContain("Phòng ngủ 2");
  });

  it("skips the stair when asked", () => {
    expect(planQuickFloor(lot, tpl("office").zones, { ...OPTS, withStair: false })!.stairs).toHaveLength(0);
  });
});

describe("applyQuickFloor in the store", () => {
  it("replaces the floor, names the rooms and undoes in one step", () => {
    const p = createProject("Nhà", createLot(rectPolygon(5, 20)));
    const s = useProjectStore.getState();
    s.load(p);
    const fid = p.floors[0].id;
    const plan = planQuickFloor(quickFloorOutline(p), tpl("ground").zones, OPTS)!;
    s.applyQuickFloor(fid, plan);
    const f = useProjectStore.getState().project!.floors[0];
    expect(f.rooms.map((r) => r.name)).toEqual(expect.arrayContaining(["Để xe", "Phòng khách", "WC", "Bếp + ăn"]));
    expect(f.rooms.find((r) => r.name === "WC")!.type).toBe("wc");
    expect(validateProject(useProjectStore.getState().project!).filter((i) => i.level === "error")).toEqual([]);
    useProjectStore.getState().undo();
    expect(useProjectStore.getState().project!.floors[0].walls).toHaveLength(0);
  });
});

describe("furniture", () => {
  it("has a valid catalog", () => {
    for (const s of FURNITURE_CATALOG) {
      expect(s.width).toBeGreaterThan(0);
      for (const p of s.parts) {
        expect(p.u0).toBeLessThan(p.u1);
        expect(p.v0).toBeLessThan(p.v1);
        expect(p.z0).toBeLessThan(p.z1);
      }
    }
  });

  it("rotates the footprint around its centre and is hit-testable", () => {
    const f = createFurniture("bedDouble", { x: 5, y: 5 }, 90);
    const r = furnitureRect(f);
    expect(area(r)).toBeCloseTo(1.8 * 2.1);
    // Rotated 90°: depth (2.1) now runs along x.
    const xs = r.map((p) => p.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(2.1);
    const p = createProject("x");
    p.floors[0].furniture = [f];
    expect(hitTest(p.floors[0], { x: 5.9, y: 5 }, 0.05)).toEqual({ kind: "furniture", id: f.id });
  });

  it("loads projects saved before furniture existed", () => {
    const old = JSON.parse(JSON.stringify(createProject("Cũ"))) as { floors: Record<string, unknown>[] };
    delete old.floors[0].furniture;
    expect(parseProject(old).floors[0].furniture).toEqual([]);
  });

  it("is added, moved, clamped and removed through the store", () => {
    const s = useProjectStore.getState();
    s.load(createProject("x"));
    const fid = useProjectStore.getState().project!.floors[0].id;
    const f = createFurniture("sofa", { x: 1, y: 1 });
    s.addFurniture(fid, f);
    s.updateFurniture(fid, f.id, { x: 2, rotation: 450, width: -3 });
    const got = useProjectStore.getState().project!.floors[0].furniture[0];
    expect(got.x).toBe(2);
    expect(got.rotation).toBe(90);
    expect(got.width).toBe(0.1);
    s.removeEntities(fid, [f.id]);
    expect(useProjectStore.getState().project!.floors[0].furniture).toHaveLength(0);
  });
});
