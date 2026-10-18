import type { Floor, Project, RoomType, Vec2 } from "./types";
import { createFloor, createLot, createProject, rectPolygon } from "./factory";
import { floorFromQuickPlan, outlineFrontEdge, planQuickFloor, QUICK_TEMPLATES, quickFloorOutline } from "./quickFloor";
import { autoPlaceRooms, roomTemplate } from "./roomPlacer";
import { edgeLengths } from "@/geometry/polygon";

/**
 * "Nhà mẫu": ready-made projects a new user can open and edit straight away. Each one is
 * generated with the same tools the user has (Tạo nhanh templates, Phòng mẫu), so it always
 * matches what the editor would produce and passes the checks.
 */

interface SampleFloor {
  name?: string;
  /** Tạo nhanh template id. */
  template?: string;
  /** Rooms placed with Phòng mẫu into an empty shell (instead of a template). */
  rooms?: string[];
  /** Rename what is left of the floor after the rooms are placed. */
  rest?: { name: string; type: RoomType };
  /** Stair up to the next floor (defaults to "not the top floor"). */
  stair?: boolean;
}

export interface SampleHouse {
  id: string;
  label: string;
  description: string;
  /** Lot outline in metres; edge 0 faces the street. */
  lot: Vec2[];
  /** Depth taken by the road (giải phóng mặt bằng), 0 = none. */
  roadCut?: number;
  floors: SampleFloor[];
}

export const SAMPLE_HOUSES: readonly SampleHouse[] = [
  {
    id: "ong-4x15",
    label: "Nhà ống 4×15, 3 tầng",
    description: "Trệt để xe + khách + bếp, lầu 2 phòng ngủ, tầng thờ + giặt phơi",
    lot: rectPolygon(4, 15),
    floors: [{ template: "ground" }, { template: "bedrooms" }, { template: "worship" }],
  },
  {
    id: "pho-5x20",
    label: "Nhà phố 5×20, 4 tầng có gara",
    description: "Gara ô tô, 2 tầng ngủ (master riêng), tầng thờ trên cùng",
    lot: rectPolygon(5, 20),
    floors: [
      { template: "ground" },
      { template: "bedrooms" },
      { template: "open", rooms: ["master", "wc"], rest: { name: "Sinh hoạt chung", type: "living" } },
      { template: "worship" },
    ],
  },
  {
    id: "top-hau",
    label: "Nhà tóp hậu 5 tầng cho thuê",
    description: "Lô tóp hậu, giải phóng 3 m mặt tiền: cửa hàng tầng trệt, 3 tầng văn phòng, tầng thờ",
    lot: [
      { x: 0, y: 0 },
      { x: 6.2, y: 0 },
      { x: 5.6, y: 21 },
      { x: 1, y: 21 },
    ],
    roadCut: 3,
    floors: [{ template: "shop" }, { template: "office" }, { template: "office" }, { template: "office" }, { template: "worship" }],
  },
  {
    id: "tret-lau-6x18",
    label: "Nhà 1 trệt 1 lầu 6×18",
    description: "Trệt rộng có gara, lầu 3 phòng ngủ + 2 WC",
    lot: rectPolygon(6, 18),
    floors: [{ template: "ground" }, { template: "open", rooms: ["double", "double", "single", "wc", "wc"], rest: { name: "Sinh hoạt chung", type: "living" } }],
  },
  {
    id: "can-ho-2pn",
    label: "Căn hộ 2 phòng ngủ ~70 m²",
    description: "Master, phòng ngủ đôi, WC, bếp; còn lại là khách + ăn",
    lot: rectPolygon(8, 9),
    floors: [{ name: "Căn hộ", rooms: ["master", "double", "wc", "kitchen"], rest: { name: "Phòng khách + ăn", type: "living" }, stair: false }],
  },
];

export const sampleHouse = (id: string): SampleHouse | undefined => SAMPLE_HOUSES.find((s) => s.id === id);

export function buildSample(sample: SampleHouse): Project {
  const p = createProject(sample.label, createLot(sample.lot.map((v) => ({ ...v })), { edgeLengths: edgeLengths(sample.lot) }));
  if (sample.roadCut) p.constraints.roadCut = { ...p.constraints.roadCut, enabled: true, edge: 0, depth: sample.roadCut };
  const floors: Floor[] = [];
  sample.floors.forEach((spec, i) => {
    let f = createFloor(i, spec.name ? { name: spec.name } : {});
    const proj = { ...p, floors: [...floors, f] };
    const withStair = spec.stair ?? i < sample.floors.length - 1;
    if (spec.template) {
      const outline = quickFloorOutline(proj);
      const tpl = QUICK_TEMPLATES.find((t) => t.id === spec.template)!;
      const frontEdge = outlineFrontEdge(outline, p.lot.polygon, 0);
      const plan = planQuickFloor(outline, tpl.zones, {
        frontEdge,
        withStair,
        isGround: i === 0,
        floorHeight: f.height,
        exteriorThickness: p.defaults.exteriorWallThickness,
        interiorThickness: p.defaults.wallThickness,
      });
      if (plan) f = floorFromQuickPlan(f, plan);
    }
    if (spec.rooms?.length) {
      f = autoPlaceRooms({ ...proj, floors: [...floors, f] }, f, spec.rooms.map((id) => ({ template: roomTemplate(id) }))).floor;
    }
    if (spec.rest) {
      const rest = spec.rest;
      f = { ...f, rooms: f.rooms.map((r) => (r.type === "other" ? { ...r, name: rest.name, type: rest.type } : r)) };
    }
    floors.push(f);
  });
  return { ...p, floors };
}
