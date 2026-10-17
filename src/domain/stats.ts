import type { Floor, Project, Vec2 } from "./types";
import { area } from "@/geometry/polygon";
import { insetPolygon } from "@/geometry/offset";
import { buildingOutlines } from "@/geometry/wallGraph";
import { roomNetArea } from "./rooms";

/** Elevation of each floor's finished floor level above ground (index-aligned with floors). */
export function floorElevations(floors: readonly Floor[]): number[] {
  const out: number[] = [];
  let z = 0;
  for (const f of floors) {
    out.push(z);
    z += f.height;
  }
  return out;
}

/** Buildable area after setbacks, or null when setbacks are disabled / impossible. */
export function buildablePolygon(p: Project): Vec2[] | null {
  if (!p.constraints.setback.enabled || p.lot.polygon.length < 3) return null;
  return insetPolygon(p.lot.polygon, p.constraints.setback.perEdge);
}

export interface FloorStats {
  id: string;
  name: string;
  elevation: number;
  grossArea: number;
  netRoomArea: number;
  roomCount: number;
}

export interface ProjectStats {
  lotArea: number;
  certifiedArea: number | null;
  /** (computed - certified) / certified. */
  lotAreaDeviation: number | null;
  buildableArea: number | null;
  footprintArea: number;
  totalFloorArea: number;
  /** Building coverage ratio (mật độ xây dựng). */
  coverage: number;
  /** Floor area ratio (hệ số sử dụng đất). */
  floorAreaRatio: number;
  totalHeight: number;
  floors: FloorStats[];
}

export function floorGrossArea(f: Floor): number {
  return buildingOutlines(f.walls).reduce((s, o) => s + area(o), 0);
}

export function computeStats(p: Project): ProjectStats {
  const lotArea = p.lot.polygon.length >= 3 ? area(p.lot.polygon) : 0;
  const elevations = floorElevations(p.floors);
  const floors = p.floors.map<FloorStats>((f, i) => ({
    id: f.id,
    name: f.name,
    elevation: elevations[i],
    grossArea: floorGrossArea(f),
    netRoomArea: f.rooms.reduce((s, r) => s + roomNetArea(r), 0),
    roomCount: f.rooms.length,
  }));
  const footprintArea = floors[0]?.grossArea ?? 0;
  const totalFloorArea = floors.reduce((s, f) => s + f.grossArea, 0);
  const buildable = buildablePolygon(p);
  const certified = p.lot.certifiedArea;
  return {
    lotArea,
    certifiedArea: certified,
    lotAreaDeviation: certified && certified > 0 ? (lotArea - certified) / certified : null,
    buildableArea: buildable ? area(buildable) : null,
    footprintArea,
    totalFloorArea,
    coverage: lotArea > 0 ? footprintArea / lotArea : 0,
    floorAreaRatio: lotArea > 0 ? totalFloorArea / lotArea : 0,
    totalHeight: p.floors.reduce((s, f) => s + f.height, 0),
    floors,
  };
}
