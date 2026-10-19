import { beforeEach, describe, expect, it } from "vitest";
import { useEditorStore } from "./editorStore";
import { useProjectStore } from "./projectStore";
import { createFurniture } from "@/domain/furniture";
import { createLot, createOpening, createProject, createWall, rectPolygon } from "@/domain/factory";

const ps = () => useProjectStore.getState();
const ed = () => useEditorStore.getState();
const floor = (i = 0) => ps().project!.floors[i];

function box(w: number, h: number) {
  return [
    createWall({ x: 1, y: 1 }, { x: 1 + w, y: 1 }, 0.2),
    createWall({ x: 1 + w, y: 1 }, { x: 1 + w, y: 1 + h }, 0.2),
    createWall({ x: 1 + w, y: 1 + h }, { x: 1, y: 1 + h }, 0.2),
    createWall({ x: 1, y: 1 + h }, { x: 1, y: 1 }, 0.2),
  ];
}

// Same wiring as EditorApp: every project change re-checks what the editor points at.
let unsub: () => void = () => {};
beforeEach(() => {
  unsub();
  ed().reset();
  ps().load(createProject("Test", createLot(rectPolygon(8, 20))));
  ed().setActiveFloor(floor().id);
  unsub = useProjectStore.subscribe((st, prev) => {
    if (st.project !== prev.project) ed().syncWithProject(st.project);
  });
});

describe("editor stays in step with the project", () => {
  it("drops a selection that undo removed", () => {
    const sofa = createFurniture("sofa", { x: 3, y: 3 }, 0);
    ps().addFurniture(floor().id, sofa);
    ed().select({ floorId: floor().id, ids: [sofa.id] });
    ps().undo();
    expect(ed().selection).toBeNull();
    ps().redo();
    expect(ed().selection).toBeNull();
  });

  it("keeps only the objects that still exist in a multi-selection", () => {
    const walls = box(4, 5);
    ps().addWalls(floor().id, walls);
    const door = createOpening("door", walls[0].id, 2);
    ps().addOpening(floor().id, door);
    ed().select({ floorId: floor().id, ids: [walls[1].id, door.id] });
    ps().undo(); // removes the door
    expect(ed().selection).toEqual({ floorId: floor().id, ids: [walls[1].id] });
  });

  it("drops the selection when its wall is deleted with its door", () => {
    const walls = box(4, 5);
    ps().addWalls(floor().id, walls);
    const door = createOpening("door", walls[0].id, 2);
    ps().addOpening(floor().id, door);
    ed().select({ floorId: floor().id, ids: [door.id] });
    ps().removeEntities(floor().id, [walls[0].id]);
    expect(ed().selection).toBeNull();
  });

  it("moves to an existing floor when the active one disappears (undo add floor)", () => {
    const first = floor().id;
    const id = ps().addFloor()!;
    ed().setActiveFloor(id);
    ed().toggleFloorVisibility(id);
    ps().undo();
    expect(ed().activeFloorId).toBe(first);
    expect(ed().viewer.hiddenFloorIds).toEqual([]);
  });

  it("leaves valid state untouched", () => {
    const sofa = createFurniture("sofa", { x: 3, y: 3 }, 0);
    ps().addFurniture(floor().id, sofa);
    ed().select({ floorId: floor().id, ids: [sofa.id] });
    const before = ed().selection;
    ps().updateFurniture(floor().id, sofa.id, { rotation: 90 });
    expect(ed().selection).toBe(before);
  });
});

describe("drawing tools", () => {
  it("clear the selection so the panel shows the tool options", () => {
    ed().select({ floorId: floor().id, ids: ["x"] });
    ed().setTool("door");
    expect(ed().selection).toBeNull();
    expect(ed().panelTab).toBe("edit");
    ed().select({ floorId: floor().id, ids: ["x"] });
    ed().setTool("select");
    expect(ed().selection).not.toBeNull();
  });
});
