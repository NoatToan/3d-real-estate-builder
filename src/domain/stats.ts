import type { Floor, Project, Vec2 } from "./types";
import { area, clipHalfPlane } from "@/geometry/polygon";
import { insetPolygon } from "@/geometry/offset";
import { buildingOutlines } from "@/geometry/wallGraph";
import { roomNetArea } from "./rooms";
import { cutLineOrigin, roadCutGeometry } from "./roadCut";

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

/**
 * Buildable area after setbacks, or null when setbacks are disabled / impossible.
 * With a road cut, the front setback is measured from the new road boundary.
 */
export function buildablePolygon(p: Project): Vec2[] | null {
  const { setback, roadCut } = p.constraints;
  if (!setback.enabled || p.lot.polygon.length < 3) return null;
  const inset = insetPolygon(p.lot.polygon, setback.perEdge);
  if (!inset || !roadCutGeometry(p)) return inset;
  const { origin, normal } = cutLineOrigin(p.lot.polygon, roadCut.edge, roadCut.depth + (setback.perEdge[roadCut.edge] ?? 0));
  const clipped = clipHalfPlane(inset, origin, normal);
  return clipped.length ? clipped : null;
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
  /** Area taken by road widening, null when there is no road cut. */
  roadCutArea: number | null;
  /** Lot area left to build on (lot − road cut). Coverage and FAR use this. */
  siteArea: number;
  /** Frontage along the new road boundary, null without a road cut. */
  frontWidthAfterCut: number | null;
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
  const cut = roadCutGeometry(p);
  const siteArea = cut ? cut.remainingArea : lotArea;
  return {
    lotArea,
    roadCutArea: cut ? cut.cutArea : null,
    siteArea,
    frontWidthAfterCut: cut ? cut.frontWidth : null,
    certifiedArea: certified,
    lotAreaDeviation: certified && certified > 0 ? (lotArea - certified) / certified : null,
    buildableArea: buildable ? area(buildable) : null,
    footprintArea,
    totalFloorArea,
    coverage: siteArea > 0 ? footprintArea / siteArea : 0,
    floorAreaRatio: siteArea > 0 ? totalFloorArea / siteArea : 0,
    totalHeight: p.floors.reduce((s, f) => s + f.height, 0),
    floors,
  };
}
