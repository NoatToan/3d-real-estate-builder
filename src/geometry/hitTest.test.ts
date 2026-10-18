import { describe, expect, it } from "vitest";
import { createFloor, createOpening, createStair, createWall } from "@/domain/factory";
import { reconcileRooms } from "@/domain/rooms";
import { connectedEndpoints, hitTest, nearestWall, wallRenderQuad } from "./hitTest";
import { area } from "./polygon";

function setup() {
  const walls = [
    createWall({ x: 0, y: 0 }, { x: 6, y: 0 }, 0.2),
    createWall({ x: 6, y: 0 }, { x: 6, y: 4 }, 0.2),
    createWall({ x: 6, y: 4 }, { x: 0, y: 4 }, 0.2),
    createWall({ x: 0, y: 4 }, { x: 0, y: 0 }, 0.2),
  ];
  const f = createFloor(0, { walls, rooms: reconcileRooms([], walls) });
  f.openings.push(createOpening("door", walls[0].id, 3));
  f.stairs.push(createStair("straight", { x: 1, y: 1 }));
  return f;
}

describe("hitTest", () => {
  it("prioritises openings, stairs, walls, rooms", () => {
    const f = setup();
    expect(hitTest(f, { x: 3, y: 0.05 }, 0.1)?.kind).toBe("opening");
    expect(hitTest(f, { x: 1.5, y: 1.5 }, 0.1)?.kind).toBe("stair");
    expect(hitTest(f, { x: 6.05, y: 2 }, 0.1)?.kind).toBe("wall");
    expect(hitTest(f, { x: 5, y: 3 }, 0.1)?.kind).toBe("room");
    expect(hitTest(f, { x: 10, y: 10 }, 0.1)).toBeNull();
  });

  it("extends connected wall ends and finds the nearest wall", () => {
    const f = setup();
    const conn = connectedEndpoints(f.walls);
    expect(conn.get(f.walls[0].id)).toEqual({ a: true, b: true });
    const q = wallRenderQuad(f.walls[0], true, true);
    expect(area(q)).toBeCloseTo(6.2 * 0.2);
    const n = nearestWall(f.walls, { x: 2, y: 0.1 }, 0.2)!;
    expect(n.wall.id).toBe(f.walls[0].id);
    expect(n.offset).toBeCloseTo(2);
    expect(nearestWall(f.walls, { x: 3, y: 2 }, 0.2)).toBeNull();
  });
});
