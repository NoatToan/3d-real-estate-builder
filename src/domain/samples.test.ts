import { describe, expect, it } from "vitest";
import { buildSample, SAMPLE_HOUSES } from "./samples";
import { validateProject } from "./validation";
import { parseProject } from "./schema";
import { computeStats } from "./stats";

describe("sample houses", () => {
  for (const s of SAMPLE_HOUSES) {
    it(`${s.label} builds a valid, furnished project`, () => {
      const p = buildSample(s);
      expect(p.floors).toHaveLength(s.floors.length);
      for (const f of p.floors) {
        expect(f.walls.length).toBeGreaterThan(3);
        expect(f.rooms.length).toBeGreaterThan(1);
        expect(f.furniture.length).toBeGreaterThan(0);
      }
      const issues = validateProject(p);
      expect(issues.filter((i) => i.level === "error").map((i) => i.message)).toEqual([]);
      expect(issues.filter((i) => i.level === "warning").map((i) => i.message)).toEqual([]);
      expect(computeStats(p).totalFloorArea).toBeGreaterThan(40);
      expect(() => parseProject(JSON.parse(JSON.stringify(p)))).not.toThrow();
    });
  }

  it("names the rooms placed into open floors", () => {
    const p = buildSample(SAMPLE_HOUSES.find((s) => s.id === "can-ho-2pn")!);
    const names = p.floors[0].rooms.map((r) => r.name);
    expect(names).toEqual(expect.arrayContaining(["Phòng ngủ master", "Phòng ngủ 1", "WC", "Bếp + ăn", "Phòng khách + ăn"]));
  });
});
