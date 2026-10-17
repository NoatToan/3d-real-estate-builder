import { beforeEach, describe, expect, it } from "vitest";
import { useProjectStore } from "./projectStore";
import { createLot, createOpening, createProject, createStair, createWall, rectPolygon } from "@/domain/factory";

const s = () => useProjectStore.getState();
const floor0 = () => s().project!.floors[0];

function box(w: number, h: number, x = 1, y = 1) {
  return [
    createWall({ x, y }, { x: x + w, y }, 0.2),
    createWall({ x: x + w, y }, { x: x + w, y: y + h }, 0.2),
    createWall({ x: x + w, y: y + h }, { x, y: y + h }, 0.2),
    createWall({ x, y: y + h }, { x, y }, 0.2),
  ];
}

beforeEach(() => {
  s().load(createProject("Test", createLot(rectPolygon(8, 20))));
});

describe("project store", () => {
  it("adds walls, auto-detects rooms and supports undo/redo", () => {
    s().addWalls(floor0().id, box(4, 5));
    expect(floor0().walls).toHaveLength(4);
    expect(floor0().rooms).toHaveLength(1);
    s().undo();
    expect(floor0().walls).toHaveLength(0);
    expect(floor0().rooms).toHaveLength(0);
    s().redo();
    expect(floor0().rooms).toHaveLength(1);
  });

  it("ignores degenerate walls and no-op mutations", () => {
    const before = s().past.length;
    s().addWalls(floor0().id, [createWall({ x: 0, y: 0 }, { x: 0.001, y: 0 })]);
    s().updateFloor(floor0().id, { height: 100 });
    expect(s().past.length).toBe(before);
  });

  it("collapses a drag transaction into one undo step and can cancel", () => {
    s().addWalls(floor0().id, box(4, 5));
    const steps = s().past.length;
    s().begin();
    for (let i = 1; i <= 5; i++) s().moveWallEndpoint(floor0().id, { x: 5, y: 6 - (i - 1) * 0.1 }, { x: 5, y: 6 - i * 0.1 });
    s().commit();
    expect(s().past.length).toBe(steps + 1);
    s().undo();
    expect(floor0().walls.some((w) => w.b.x === 5 && w.b.y === 6)).toBe(true);

    s().begin();
    s().moveWallEndpoint(floor0().id, { x: 5, y: 6 }, { x: 7, y: 7 });
    s().cancel();
    expect(floor0().walls.some((w) => w.b.x === 7)).toBe(false);
  });

  it("splits walls and moves openings to the right half", () => {
    const walls = box(4, 5);
    s().addWalls(floor0().id, walls);
    s().addOpening(floor0().id, createOpening("window", walls[0].id, 3));
    s().splitWall(floor0().id, walls[0].id, { x: 3, y: 1 });
    expect(floor0().walls).toHaveLength(5);
    const o = floor0().openings[0];
    expect(o.wallId).not.toBe(walls[0].id);
    expect(o.offset).toBeCloseTo(1);
    expect(floor0().rooms).toHaveLength(1);
  });

  it("removes openings with their wall and keeps room names", () => {
    const walls = box(4, 5);
    s().addWalls(floor0().id, walls);
    s().updateRoom(floor0().id, floor0().rooms[0].id, { name: "Khách", type: "living" });
    s().addOpening(floor0().id, createOpening("door", walls[1].id, 1));
    s().addWalls(floor0().id, [createWall({ x: 1, y: 3 }, { x: 5, y: 3 })]);
    expect(floor0().rooms).toHaveLength(2);
    expect(floor0().rooms.some((r) => r.name === "Khách")).toBe(true);
    s().removeEntities(floor0().id, [walls[1].id]);
    expect(floor0().openings).toHaveLength(0);
    expect(floor0().rooms).toHaveLength(0);
  });

  it("manages floors", () => {
    s().addWalls(floor0().id, box(4, 5));
    const copy = s().addFloor({ copyFromId: floor0().id, copyWalls: true })!;
    expect(s().project!.floors).toHaveLength(2);
    expect(s().project!.floors[1].walls).toHaveLength(4);
    expect(s().project!.floors[1].rooms).toHaveLength(1);
    const shell = s().addFloor({ copyFromId: floor0().id, copyWalls: false })!;
    expect(s().project!.floors.find((f) => f.id === shell)!.walls).toHaveLength(0);
    s().moveFloor(copy, 1);
    expect(s().project!.floors[2].id).toBe(copy);
    s().updateFloor(copy, { name: "Lửng", height: 2.8, slabThickness: 0.1 });
    expect(s().project!.floors[2].name).toBe("Lửng");
    s().removeFloor(copy);
    s().removeFloor(shell);
    s().removeFloor(floor0().id);
    expect(s().project!.floors).toHaveLength(1);
  });

  it("generates exterior walls from the lot or buildable area", () => {
    expect(s().generateExteriorWalls(floor0().id, "buildable")).toBe(false);
    s().setConstraints({ setback: { enabled: true, perEdge: [2, 0, 0, 0] } });
    expect(s().generateExteriorWalls(floor0().id, "buildable")).toBe(true);
    expect(floor0().walls).toHaveLength(4);
    expect(floor0().rooms).toHaveLength(1);
    expect(s().generateExteriorWalls(floor0().id, "lot")).toBe(true);
  });

  it("manages stairs, manual rooms, lot and name", () => {
    const st = createStair("U", { x: 2, y: 2 });
    s().addStair(floor0().id, st);
    s().updateStair(floor0().id, st.id, { riserCount: 100, rotation: -90, width: 0.1 });
    const stair = floor0().stairs[0];
    expect(stair.riserCount).toBe(60);
    expect(stair.rotation).toBe(270);
    expect(stair.width).toBe(0.4);

    s().addRoom(floor0().id, { id: "m1", polygon: rectPolygon(2, 2), netPolygon: null, name: "Kho", type: "storage", source: "manual" });
    s().updateRoom(floor0().id, "m1", { polygon: rectPolygon(3, 3) });
    expect(floor0().rooms[0].polygon[1].x).toBe(3);
    s().removeEntities(floor0().id, ["m1", st.id]);
    expect(floor0().rooms).toHaveLength(0);
    expect(floor0().stairs).toHaveLength(0);

    s().setLot(createLot(rectPolygon(6, 6).concat([{ x: -1, y: 3 }])));
    expect(s().project!.constraints.setback.perEdge).toHaveLength(5);
    s().rename("  Nhà mới ");
    expect(s().project!.name).toBe("Nhà mới");
  });

  it("updates openings and walls with clamping", () => {
    const walls = box(4, 5);
    s().addWalls(floor0().id, walls);
    const o = createOpening("window", walls[0].id, 2);
    s().addOpening(floor0().id, o);
    s().updateOpening(floor0().id, o.id, { offset: 100 });
    expect(floor0().openings[0].offset).toBeLessThanOrEqual(4);
    s().updateWall(floor0().id, walls[0].id, { thickness: 0.3, b: { x: 3, y: 1 } });
    expect(floor0().walls[0].thickness).toBe(0.3);
    expect(floor0().openings[0].offset).toBeLessThanOrEqual(2);
  });
});
