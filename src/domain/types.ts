/**
 * Domain model. All lengths are in metres, angles in degrees.
 * Plan coordinates: x to the right, y downwards (screen convention).
 */

export interface Vec2 {
  x: number;
  y: number;
}

export type Id = string;

export interface LotTrace {
  /** Pixel coordinates of the traced vertices on the source image. */
  points: Vec2[];
  /** Image pixels per metre derived from calibration. */
  pxPerMeter: number;
  /** Clockwise image rotation applied before tracing (0/90/180/270). */
  rotation: 0 | 90 | 180 | 270;
}

export interface Lot {
  /** Id of the certificate image blob in IndexedDB (null if drawn by hand). */
  imageId: Id | null;
  trace: LotTrace | null;
  /** Fitted lot boundary in metres, in drawing order. */
  polygon: Vec2[];
  /** Edge lengths from the certificate, `null` when unknown. edge i = polygon[i] -> polygon[i+1]. */
  edgeLengths: (number | null)[];
  /** Area printed on the certificate (m²), used as a cross-check. */
  certifiedArea: number | null;
  /** Free-form certificate info (số thửa, tờ bản đồ, địa chỉ...). */
  parcelNo: string;
  mapSheetNo: string;
  address: string;
}

export interface Constraints {
  keepInsideLot: boolean;
  setback: {
    enabled: boolean;
    /** Setback distance per lot edge (same indexing as lot.polygon edges). */
    perEdge: number[];
  };
  /** Upper floors may extend beyond the setback line (balconies / overhangs), but never beyond the lot. */
  allowOverhang: boolean;
  showStats: boolean;
}

export interface Wall {
  id: Id;
  a: Vec2;
  b: Vec2;
  thickness: number;
}

export type OpeningKind = "door" | "window";

export interface Opening {
  id: Id;
  wallId: Id;
  kind: OpeningKind;
  /** Distance from wall.a to the opening centre, along the wall. */
  offset: number;
  width: number;
  height: number;
  /** Height of the bottom edge above the floor. */
  sill: number;
  /** Door hinge side and swing direction. */
  hinge: "start" | "end";
  swing: "left" | "right";
}

export const ROOM_TYPES = [
  "living",
  "bedroom",
  "kitchen",
  "dining",
  "bathroom",
  "wc",
  "worship",
  "garage",
  "storage",
  "balcony",
  "corridor",
  "office",
  "laundry",
  "other",
] as const;
export type RoomType = (typeof ROOM_TYPES)[number];

export interface Room {
  id: Id;
  /** Centre-line polygon of the room. */
  polygon: Vec2[];
  /** Clear (inside-the-walls) polygon used for display and net area. */
  netPolygon: Vec2[] | null;
  name: string;
  type: RoomType;
  /** auto = detected from closed walls, manual = drawn by the user. */
  source: "auto" | "manual";
}

export const STAIR_TYPES = ["straight", "L", "U", "spiral"] as const;
export type StairType = (typeof STAIR_TYPES)[number];

export interface Stair {
  id: Id;
  type: StairType;
  /** Plan position of the stair origin (start of first step, left edge). */
  x: number;
  y: number;
  rotation: number;
  /** Flight width (for spiral: outer radius - inner radius). */
  width: number;
  riserCount: number;
  treadDepth: number;
  /** L/U: landing depth. */
  landingDepth: number;
  /** U: gap between the two flights. */
  gap: number;
  /** L/U/spiral: direction of the turn. */
  turn: "left" | "right";
  /** Spiral: radius of the central column. */
  innerRadius: number;
  /** Spiral: total sweep angle. */
  sweep: number;
}

export interface Floor {
  id: Id;
  name: string;
  /** Floor-to-floor height. */
  height: number;
  slabThickness: number;
  walls: Wall[];
  rooms: Room[];
  openings: Opening[];
  /** Stairs rising from this floor to the floor above. */
  stairs: Stair[];
}

/** One-off investment item. Money is in million VND (triệu đồng). */
export interface CostItem {
  id: Id;
  name: string;
  amount: number;
}

/** Recurring income: quantity × monthly unit price (million VND / unit / month). */
export interface IncomeItem {
  id: Id;
  name: string;
  quantity: number;
  unitPrice: number;
}

export const FINANCE_SCENARIOS = ["low", "base", "high"] as const;
export type FinanceScenario = (typeof FINANCE_SCENARIOS)[number];

/**
 * Feasibility inputs (dự toán đầu tư & dòng tiền cho thuê). Money in million VND,
 * rates in percent, durations in months / years as named.
 */
export interface FinanceInputs {
  /** Turnkey construction price per m² of equivalent floor area (triệu/m² quy đổi). */
  unitPrice: number;
  /** Surcharge on the construction price, e.g. +5% for narrow lots. */
  surchargePct: number;
  /** Foundation weight as % of the ground-floor area (móng). */
  foundationPct: number;
  /** Roof weight as % of the top-floor area (mái). */
  roofPct: number;
  /** Equivalent floor area typed by the user; null = computed from the drawn floors. */
  areaOverride: number | null;
  extraCosts: CostItem[];
  contingencyPct: number;
  buildMonths: number;
  /** Own money put in (savings, compensation…). The rest is borrowed. */
  ownCapital: number;
  income: IncomeItem[];
  occupancyPct: number;
  rentGrowthPct: number;
  /** Tax on collected rent, % of revenue. */
  taxPct: number;
  /** Operating cost per month. */
  opexMonthly: number;
  opexGrowthPct: number;
  loanRatePct: number;
  loanYears: number;
  scenario: FinanceScenario;
}

export interface Project {
  id: Id;
  name: string;
  schemaVersion: number;
  createdAt: string;
  updatedAt: string;
  lot: Lot;
  constraints: Constraints;
  /** Ordered from ground floor upwards. */
  floors: Floor[];
  defaults: {
    wallThickness: number;
    exteriorWallThickness: number;
  };
  finance: FinanceInputs;
}

export interface ProjectMeta {
  id: Id;
  name: string;
  updatedAt: string;
  floorCount: number;
  lotArea: number;
  address: string;
}

export const SCHEMA_VERSION = 1;
