import { describe, expect, it } from "vitest";
import { createFloor, createOpening, createStair, createWall } from "./factory";
import { createFurniture } from "./furniture";
import { duplicateFurniture, duplicateStair, entityOutline, entitySummary, findEntity } from "./selection";
import { reconcileRooms } from "./rooms";
import type { Floor } from "./types";

function floorWithEverything(): Floor {
  const f = createFloor(0);
  const walls = [createWall({ x: 0, y: 0 }, { x: 4, y: 0 }, 0.2), createWall({ x: 4, y: 0 }, { x: 4, y: 3 }, 0.2), createWall({ x: 4, y: 3 }, { x: 0, y: 3 }, 0.2), createWall({ x: 0, y: 3 }, { x: 0, y: 0 }, 0.2)];
  return {
    ...f,
    walls,
    rooms: reconcileRooms([], walls),
    openings: [createOpening("door", walls[0].id, 2)],
    stairs: [createStair("straight", { x: 1, y: 1 })],
    furniture: [createFurniture("bedDouble", { x: 2, y: 1.5 }, 90)],
  };
}

describe("selection helpers", () => {
  const f = floorWithEverything();

  it("finds each kind of object", () => {
    expect(findEntity(f, f.furniture[0].id)?.kind).toBe("furniture");
    expect(findEntity(f, f.stairs[0].id)?.kind).toBe("stair");
    expect(findEntity(f, f.openings[0].id)?.kind).toBe("opening");
    expect(findEntity(f, f.walls[1].id)?.kind).toBe("wall");
    expect(findEntity(f, f.rooms[0].id)?.kind).toBe("room");
    expect(findEntity(f, "nope")).toBeNull();
  });

  it("gives an outline and a height to anchor the actions bar", () => {
    const bed = entityOutline(f, findEntity(f, f.furniture[0].id)!);
    expect(bed.points).toHaveLength(4);
    expect(bed.height).toBeCloseTo(0.5);
    const door = entityOutline(f, findEntity(f, f.openings[0].id)!);
    expect(Math.min(...door.points.map((p) => p.x))).toBeCloseTo(1.55);
    expect(door.height).toBeCloseTo(2.2);
    expect(entityOutline(f, findEntity(f, f.stairs[0].id)!).height).toBe(f.height);
    expect(entityOutline(f, findEntity(f, f.walls[0].id)!).points).toHaveLength(2);
  });

  it("summarises size in Vietnamese format", () => {
    expect(entitySummary(findEntity(f, f.furniture[0].id)!).size).toBe("1,80 × 2,10 m");
    expect(entitySummary(findEntity(f, f.walls[0].id)!).size).toBe("4,00 m · dày 200");
    expect(entitySummary(findEntity(f, f.rooms[0].id)!).size).toMatch(/m²$/);
    expect(entitySummary(findEntity(f, f.openings[0].id)!).title).toBe("Cửa đi");
  });

  it("duplicates next to the original with a new id", () => {
    const bed = f.furniture[0];
    const copy = duplicateFurniture(bed);
    expect(copy.id).not.toBe(bed.id);
    expect(copy.x).toBeCloseTo(bed.x + 0.3);
    expect(copy.rotation).toBe(90);
    const st = duplicateStair(f.stairs[0]);
    expect(st.id).not.toBe(f.stairs[0].id);
    expect(st.y).toBeCloseTo(1.5);
  });
});
