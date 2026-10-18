import { describe, expect, it } from "vitest";
import { computeQuantities, MATERIALS } from "./quantities";
import { buildSample, sampleHouse } from "./samples";
import { createLot, createProject, createWall, rectPolygon } from "./factory";

describe("computeQuantities", () => {
  it("is zero for an empty lot", () => {
    const r = computeQuantities(createProject("x", createLot(rectPolygon(5, 20))));
    expect(r.total).toBe(0);
    expect(r.lines).toHaveLength(MATERIALS.length);
  });

  it("counts bricks from wall area minus openings", () => {
    const p = createProject("x", createLot(rectPolygon(5, 20)));
    const w = createWall({ x: 0, y: 0 }, { x: 10, y: 0 }, 0.22);
    p.floors[0] = { ...p.floors[0], height: 3, walls: [w] };
    const r = computeQuantities(p);
    const brick = r.lines.find((l) => l.key === "brick")!;
    // 10 m × 3 m × 110 viên/m² × 1,05
    expect(brick.qty).toBeCloseTo(30 * 110 * 1.05, 0);
    p.floors[0].openings = [{ id: "o", wallId: w.id, kind: "window", offset: 5, width: 2, height: 1.5, sill: 0.9, hinge: "start", swing: "left" }];
    expect(computeQuantities(p).lines.find((l) => l.key === "brick")!.qty).toBeCloseTo(27 * 110 * 1.05, 0);
  });

  it("gives a plausible budget per m² for a sample townhouse and honours price overrides", () => {
    const p = buildSample(sampleHouse("pho-5x20")!);
    const r = computeQuantities(p);
    // Materials + labour, no finishes luxury: somewhere around 3–8 triệu/m² sàn.
    expect(r.perM2).toBeGreaterThan(3);
    expect(r.perM2).toBeLessThan(8);
    expect(r.lines.find((l) => l.key === "door")!.qty).toBeGreaterThan(5);
    expect(r.lines.find((l) => l.key === "sanitary")!.qty).toBeGreaterThanOrEqual(3);
    const cheaper = computeQuantities(p, { brick: 1000 });
    expect(cheaper.total).toBeLessThan(r.total);
    expect(cheaper.lines.find((l) => l.key === "brick")!.unitPrice).toBe(1000);
  });
});
