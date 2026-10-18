import { nanoid } from "nanoid";
import {
  SCHEMA_VERSION,
  type Constraints,
  type FinanceInputs,
  type Floor,
  type Lot,
  type Opening,
  type OpeningKind,
  type Project,
  type ProjectMeta,
  type Stair,
  type StairType,
  type Vec2,
  type Wall,
} from "./types";
import { area } from "@/geometry/polygon";

export const newId = (prefix = ""): string => `${prefix}${nanoid(10)}`;

export const DEFAULT_FLOOR_HEIGHT = 3.3;
export const DEFAULT_GROUND_FLOOR_HEIGHT = 3.6;
export const DEFAULT_SLAB = 0.12;
export const DEFAULT_WALL = 0.11;
export const DEFAULT_EXTERIOR_WALL = 0.22;

export function rectPolygon(width: number, depth: number): Vec2[] {
  return [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: depth },
    { x: 0, y: depth },
  ];
}

export function createLot(polygon: Vec2[] = rectPolygon(5, 20), over: Partial<Lot> = {}): Lot {
  return {
    imageId: null,
    trace: null,
    polygon,
    edgeLengths: polygon.map(() => null),
    certifiedArea: null,
    parcelNo: "",
    mapSheetNo: "",
    address: "",
    ...over,
  };
}

export function defaultConstraints(edgeCount: number): Constraints {
  return {
    keepInsideLot: true,
    setback: { enabled: false, perEdge: Array.from({ length: edgeCount }, () => 0) },
    roadCut: { enabled: false, edge: 0, depth: 0, roadWidth: null },
    allowOverhang: false,
    showStats: true,
  };
}

/** Starting assumptions for the feasibility view (HCMC townhouse for rent, 2026 prices). */
export function defaultFinance(): FinanceInputs {
  return {
    unitPrice: 5.85,
    surchargePct: 5,
    foundationPct: 50,
    roofPct: 50,
    areaOverride: null,
    extraCosts: [
      { id: newId("c_"), name: "Thang máy", amount: 550 },
      { id: newId("c_"), name: "PCCC", amount: 200 },
      { id: newId("c_"), name: "Thiết kế, giấy phép, hoàn công", amount: 180 },
      { id: newId("c_"), name: "Phá dỡ nhà cũ", amount: 50 },
    ],
    contingencyPct: 10,
    buildMonths: 12,
    ownCapital: 3000,
    income: [
      { id: newId("i_"), name: "Sàn văn phòng cho thuê", quantity: 3, unitPrice: 18 },
      { id: newId("i_"), name: "Gửi xe máy", quantity: 10, unitPrice: 0.15 },
    ],
    occupancyPct: 90,
    rentGrowthPct: 5,
    taxPct: 10,
    opexMonthly: 8,
    opexGrowthPct: 4,
    loanRatePct: 10,
    loanYears: 15,
    scenario: "base",
  };
}

export function createFloor(index: number, over: Partial<Floor> = {}): Floor {
  return {
    id: newId("f_"),
    name: index === 0 ? "Tầng 1 (trệt)" : `Tầng ${index + 1}`,
    height: index === 0 ? DEFAULT_GROUND_FLOOR_HEIGHT : DEFAULT_FLOOR_HEIGHT,
    slabThickness: DEFAULT_SLAB,
    walls: [],
    rooms: [],
    openings: [],
    stairs: [],
    ...over,
  };
}

export function createProject(name: string, lot: Lot = createLot()): Project {
  const now = new Date().toISOString();
  return {
    id: newId("p_"),
    name: name.trim() || "Dự án mới",
    schemaVersion: SCHEMA_VERSION,
    createdAt: now,
    updatedAt: now,
    lot,
    constraints: defaultConstraints(lot.polygon.length),
    floors: [createFloor(0)],
    defaults: { wallThickness: DEFAULT_WALL, exteriorWallThickness: DEFAULT_EXTERIOR_WALL },
    finance: defaultFinance(),
  };
}

export function createWall(a: Vec2, b: Vec2, thickness = DEFAULT_WALL): Wall {
  return { id: newId("w_"), a: { ...a }, b: { ...b }, thickness };
}

export function createOpening(kind: OpeningKind, wallId: string, offset: number): Opening {
  return kind === "door"
    ? { id: newId("o_"), wallId, kind, offset, width: 0.9, height: 2.2, sill: 0, hinge: "start", swing: "left" }
    : { id: newId("o_"), wallId, kind, offset, width: 1.2, height: 1.4, sill: 0.9, hinge: "start", swing: "left" };
}

export function createStair(type: StairType, at: Vec2, rotation = 0): Stair {
  const base: Stair = {
    id: newId("s_"),
    type,
    x: at.x,
    y: at.y,
    rotation,
    width: 0.9,
    riserCount: 20,
    treadDepth: 0.26,
    landingDepth: 0.9,
    gap: 0.1,
    turn: "right",
    innerRadius: 0.12,
    sweep: 360,
  };
  if (type === "spiral") return { ...base, width: 0.75, riserCount: 18, treadDepth: 0.26 };
  return base;
}

export function projectMeta(p: Project): ProjectMeta {
  return {
    id: p.id,
    name: p.name,
    updatedAt: p.updatedAt,
    floorCount: p.floors.length,
    lotArea: p.lot.polygon.length >= 3 ? area(p.lot.polygon) : 0,
    address: p.lot.address,
  };
}
