import type { Floor, Furniture, Opening, Room, Stair, Vec2, Wall } from "./types";
import { createFurniture, furnitureRect } from "./furniture";
import { newId } from "./factory";
import { OPENING_LABELS, fmtArea, fmtLength, fmtNumber } from "./labels";
import { roomNetArea } from "./rooms";
import { generateStair } from "@/geometry/stairs";
import { pointAlongWall, wallLength } from "@/geometry/openings";
import { normalize, perp, sub } from "@/geometry/vec";

/** One selected object with what it is, for the floating "object actions" bar in 2D and 3D. */
export type SelectedEntity =
  | { kind: "wall"; wall: Wall }
  | { kind: "opening"; opening: Opening; wall: Wall }
  | { kind: "stair"; stair: Stair }
  | { kind: "furniture"; item: Furniture }
  | { kind: "room"; room: Room };

export function findEntity(floor: Floor, id: string): SelectedEntity | null {
  const item = floor.furniture.find((x) => x.id === id);
  if (item) return { kind: "furniture", item };
  const stair = floor.stairs.find((x) => x.id === id);
  if (stair) return { kind: "stair", stair };
  const opening = floor.openings.find((x) => x.id === id);
  const host = opening && floor.walls.find((w) => w.id === opening.wallId);
  if (opening && host) return { kind: "opening", opening, wall: host };
  const wall = floor.walls.find((x) => x.id === id);
  if (wall) return { kind: "wall", wall };
  const room = floor.rooms.find((x) => x.id === id);
  if (room) return { kind: "room", room };
  return null;
}

/** Plan outline of the object and its top height above the floor: where to anchor the bar. */
export function entityOutline(floor: Floor, e: SelectedEntity): { points: Vec2[]; height: number } {
  switch (e.kind) {
    case "furniture":
      return { points: furnitureRect(e.item), height: e.item.height };
    case "stair":
      return { points: generateStair(e.stair, floor.height).footprint, height: floor.height };
    case "opening": {
      const c = pointAlongWall(e.wall, e.opening.offset);
      const u = normalize(sub(e.wall.b, e.wall.a));
      const h = e.opening.width / 2;
      const n = perp(u);
      const t = e.wall.thickness / 2;
      return {
        points: [
          { x: c.x - u.x * h + n.x * t, y: c.y - u.y * h + n.y * t },
          { x: c.x + u.x * h + n.x * t, y: c.y + u.y * h + n.y * t },
          { x: c.x + u.x * h - n.x * t, y: c.y + u.y * h - n.y * t },
          { x: c.x - u.x * h - n.x * t, y: c.y - u.y * h - n.y * t },
        ],
        height: e.opening.sill + e.opening.height,
      };
    }
    case "wall":
      return { points: [e.wall.a, e.wall.b], height: floor.height };
    case "room":
      return { points: e.room.polygon, height: 0 };
  }
}

/** Short size readout shown on the bar ("1,80 × 2,10 m", "4,78 m", "14,69 m²"). */
export function entitySummary(e: SelectedEntity): { title: string; size: string } {
  switch (e.kind) {
    case "furniture":
      return { title: e.item.name, size: `${fmtNumber(e.item.width)} × ${fmtNumber(e.item.depth)} m` };
    case "stair":
      return { title: "Cầu thang", size: `${e.stair.riserCount} bậc · rộng ${fmtLength(e.stair.width)}` };
    case "opening":
      return { title: OPENING_LABELS[e.opening.kind], size: `${fmtNumber(e.opening.width)} × ${fmtNumber(e.opening.height)} m` };
    case "wall":
      return { title: "Vách", size: `${fmtLength(wallLength(e.wall))} · dày ${Math.round(e.wall.thickness * 1000)}` };
    case "room":
      return { title: e.room.name, size: fmtArea(roomNetArea(e.room)) };
  }
}

/** Copy of a piece placed slightly offset so it is visibly a new one. */
export function duplicateFurniture(item: Furniture, offset = 0.3): Furniture {
  return { ...createFurniture(item.kind, { x: item.x + offset, y: item.y + offset }, item.rotation), name: item.name, width: item.width, depth: item.depth, height: item.height };
}

/** Copy of a stair next to the original. */
export function duplicateStair(stair: Stair, offset = 0.5): Stair {
  return { ...stair, id: newId("s_"), x: stair.x + offset, y: stair.y + offset };
}
