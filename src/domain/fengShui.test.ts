import { describe, expect, it } from "vitest";
import { analyzeFengShui, directionFromDegrees, kuaNumber, nearestSinh, planBearing, sectorWedges, starOf, stepCycle } from "./fengShui";
import { buildSample, sampleHouse } from "./samples";
import { createLot, createProject, rectPolygon } from "./factory";

describe("cung mệnh (quái số)", () => {
  it("matches the usual tables", () => {
    expect(kuaNumber(1984, "male")).toBe(7); // Đoài
    expect(kuaNumber(1984, "female")).toBe(8); // Cấn
    expect(kuaNumber(1990, "male")).toBe(1); // Khảm
    expect(kuaNumber(1990, "female")).toBe(8); // 5 → Cấn
    expect(kuaNumber(2000, "male")).toBe(9); // Ly
    expect(kuaNumber(2000, "female")).toBe(6); // Càn
    expect(kuaNumber(1977, "male")).toBe(2); // 5 → Khôn
  });

  it("gives four good directions of the right group", () => {
    // Khảm (Đông tứ mệnh): Sinh Khí Đông Nam, Tuyệt Mệnh Tây Nam.
    expect(starOf(1, "SE")).toBe("sinhKhi");
    expect(starOf(1, "SW")).toBe("tuyetMenh");
    expect(starOf(7, "NW")).toBe("sinhKhi");
  });
});

describe("helpers", () => {
  it("rounds bearings to 8 directions", () => {
    expect(directionFromDegrees(0)).toBe("N");
    expect(directionFromDegrees(130)).toBe("SE");
    expect(directionFromDegrees(-30)).toBe("NW");
  });

  it("names step counts and finds the nearest 'Sinh'", () => {
    expect(stepCycle(21)).toBe("Sinh");
    expect(stepCycle(20)).toBe("Tử");
    expect(stepCycle(22)).toBe("Lão");
    expect(nearestSinh(20)).toBe(21);
    expect(nearestSinh(18)).toBe(17);
  });

  it("maps plan directions to the compass from the house facing", () => {
    const p = createProject("x", createLot(rectPolygon(5, 20)));
    // Street at the top (y = 0): looking out the front is −y. Facing south → −y is 180°.
    expect(planBearing(p, "S", { x: 0, y: -1 })).toBeCloseTo(180);
    // Into the lot (+y) is then north; facing south, your right hand (+x on the plan) points west.
    expect(planBearing(p, "S", { x: 0, y: 1 })).toBeCloseTo(0);
    expect(planBearing(p, "S", { x: 1, y: 0 })).toBeCloseTo(270);
  });
});

describe("analyzeFengShui", () => {
  it("needs a birth year", () => {
    const p = createProject("x", createLot(rectPolygon(5, 20)));
    expect(analyzeFengShui(p)).toBeNull();
  });

  it("checks facing, wet rooms, altar, bedrooms and stairs on a sample house", () => {
    const p = buildSample(sampleHouse("pho-5x20")!);
    const r = analyzeFengShui(p, { facing: "SE", birthYear: 1990, gender: "male" })!;
    expect(r.kuaName).toBe("Khảm");
    expect(r.facingStar).toBe("sinhKhi");
    expect(r.checks.find((c) => c.id === "facing")!.level).toBe("good");
    expect(r.checks.some((c) => c.title.includes("WC"))).toBe(true);
    expect(r.checks.some((c) => c.title.includes("Phòng thờ"))).toBe(true);
    expect(r.checks.some((c) => c.id.startsWith("steps-"))).toBe(true);
    expect(r.score).toBeGreaterThan(0);
    expect(r.score).toBeLessThanOrEqual(100);
    // Bad facing costs more.
    const bad = analyzeFengShui(p, { facing: "SW", birthYear: 1990, gender: "male" })!;
    expect(bad.checks.find((c) => c.id === "facing")!.level).toBe("bad");
  });

  it("offers a one-click fix for the step count", () => {
    const p = buildSample(sampleHouse("ong-4x15")!);
    p.floors[0].stairs[0] = { ...p.floors[0].stairs[0], riserCount: 20 };
    const r = analyzeFengShui(p, { facing: null, birthYear: 1984, gender: "female" })!;
    const c = r.checks.find((x) => x.id === `steps-${p.floors[0].stairs[0].id}`)!;
    expect(c.level).toBe("bad");
    expect(c.fix?.riserCount).toBe(21);
  });
});

describe("sectorWedges", () => {
  it("puts each direction where planBearing says it is", () => {
    const p = createProject("x", createLot(rectPolygon(5, 20)));
    const w = sectorWedges(p, p.floors[0], { facing: "S", birthYear: 1990, gender: "male" });
    expect(w).toHaveLength(8);
    const south = w.find((x) => x.dir === "S")!;
    // South is towards the street (smaller y than the centre).
    expect(south.labelAt.y).toBeLessThan(10);
    expect(south.star).toBe("dienNien");
    expect(sectorWedges(p, p.floors[0], { facing: null, birthYear: 1990, gender: "male" })).toEqual([]);
  });
});
