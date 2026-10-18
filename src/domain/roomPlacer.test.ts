import { describe, expect, it } from "vitest";
import { createLot, createProject, rectPolygon } from "./factory";
import { applyRoomPlacement, autoPlaceRooms, ensureShell, findRoomPlacements, roomTemplate } from "./roomPlacer";
import { planQuickFloor, QUICK_TEMPLATES, quickFloorOutline } from "./quickFloor";
import { furnitureRect } from "./furniture";
import { validateProject } from "./validation";
import type { Floor, Project } from "./types";
import { pointInPolygon } from "@/geometry/polygon";
import { useProjectStore } from "@/store/projectStore";

const townhouse = () => createProject("Nhà", createLot(rectPolygon(5, 20)));
const errors = (p: Project, f: Floor) => validateProject({ ...p, floors: [f] }).filter((i) => i.level === "error");

/** Floor laid out with the "Sàn trống" template: front space, stair + WC core, back space. */
function openFloor(p: Project): Floor {
  const plan = planQuickFloor(quickFloorOutline(p), QUICK_TEMPLATES.find((t) => t.id === "open")!.zones, { frontEdge: 0, withStair: true, isGround: false, floorHeight: 3.6, exteriorThickness: 0.22, interiorThickness: 0.11 })!;
  const s = useProjectStore.getState();
  s.load(p);
  s.applyQuickFloor(p.floors[0].id, plan);
  return useProjectStore.getState().project!.floors[0];
}

describe("findRoomPlacements", () => {
  it("builds the shell of an empty floor first", () => {
    const p = townhouse();
    const r = ensureShell(p, p.floors[0]);
    expect(r.added).toBe(true);
    expect(r.floor.walls).toHaveLength(4);
    expect(r.floor.rooms).toHaveLength(1);
  });

  it("puts a master bedroom on a facade (quiet back first) with door, window and furniture", () => {
    const p = townhouse();
    const { floor } = ensureShell(p, p.floors[0]);
    const [best] = findRoomPlacements(p, floor, { template: roomTemplate("master") });
    expect(best).toBeDefined();
    // Back of the 20 m lot.
    expect(Math.max(...best.rect.map((v) => v.y))).toBeGreaterThan(19.5);
    expect(best.pros.join(" ")).toContain("mặt sau");
    expect(best.cons).toEqual([]);
    expect(best.openings.map((o) => o.kind).sort()).toEqual(["door", "window"]);
    expect(best.furniture.map((f) => f.kind)).toEqual(expect.arrayContaining(["bedDouble", "wardrobe"]));
    for (const f of best.furniture) for (const c of furnitureRect(f)) expect(pointInPolygon(c, best.rect)).toBe(true);

    const next = applyRoomPlacement(floor, best);
    const room = next.rooms.find((r) => r.type === "bedroom")!;
    expect(room.name).toBe("Phòng ngủ master");
    expect(errors(p, next)).toEqual([]);
  });

  it("rejects spots that would block the stair/WC core or leave no way through", () => {
    const p = townhouse();
    const floor = openFloor(p);
    const spots = findRoomPlacements(p, floor, { template: roomTemplate("double") }, 5);
    expect(spots.length).toBeGreaterThan(0);
    const stair = floor.stairs[0];
    for (const s of spots) expect(pointInPolygon({ x: stair.x, y: stair.y }, s.rect)).toBe(false);
  });

  it("returns nothing when the room can't fit", () => {
    const p = townhouse();
    const { floor } = ensureShell(p, p.floors[0]);
    expect(findRoomPlacements(p, floor, { template: roomTemplate("double"), width: 6, depth: 6 })).toEqual([]);
  });

  it("skips floors with no free (Khác) space", () => {
    const p = townhouse();
    const floor = openFloor(p);
    const taken = { ...floor, rooms: floor.rooms.map((r) => ({ ...r, type: "living" as const })) };
    expect(findRoomPlacements(p, taken, { template: roomTemplate("wc") })).toEqual([]);
  });
});

describe("autoPlaceRooms", () => {
  it("fills an open floor with 2 bedrooms and a WC, each on a facade, without errors", () => {
    const p = townhouse();
    const r = autoPlaceRooms(p, openFloor(p), ["double", "double", "wc"].map((id) => ({ template: roomTemplate(id) })));
    expect(r.failed).toEqual([]);
    expect(r.placed.map((x) => x.label.name)).toEqual(["Phòng ngủ 1", "Phòng ngủ 2", "WC 2"]);
    const beds = r.placed.filter((x) => x.label.type === "bedroom");
    // Both on a facade (the template's facade windows are reused, not doubled).
    for (const b of beds) expect(b.pros.join(" ")).toMatch(/Giáp tường mặt (sau|tiền)/);
    expect(r.floor.rooms.filter((x) => x.type === "bedroom")).toHaveLength(2);
    expect(errors(p, r.floor)).toEqual([]);
  });

  it("applies as one undo step in the store", () => {
    const p = townhouse();
    const s = useProjectStore.getState();
    s.load(p);
    const r = autoPlaceRooms(p, p.floors[0], [{ template: roomTemplate("master") }]);
    s.setFloorLayout(p.floors[0].id, r.floor);
    expect(useProjectStore.getState().project!.floors[0].rooms.some((x) => x.name === "Phòng ngủ master")).toBe(true);
    useProjectStore.getState().undo();
    expect(useProjectStore.getState().project!.floors[0].walls).toHaveLength(0);
  });
});

describe("stair from the floor below", () => {
  it("keeps rooms off the stair well and uses it as the way in", () => {
    const p = townhouse();
    const ground = openFloor(p);
    const upper = { ...ground, id: "upper", name: "Tầng 2", stairs: [], furniture: [] };
    const proj = { ...p, floors: [ground, upper] };
    const well = ground.stairs[0];
    const spots = findRoomPlacements(proj, upper, { template: roomTemplate("double") }, 5);
    expect(spots.length).toBeGreaterThan(0);
    for (const s of spots) expect(pointInPolygon({ x: well.x, y: well.y }, s.rect)).toBe(false);
  });
});
