import { z } from "zod";
import { FINANCE_SCENARIOS, FURNITURE_KINDS, ROOM_TYPES, SCHEMA_VERSION, STAIR_TYPES, type Project } from "./types";
import { defaultFinance } from "./factory";

const num = z.number().refine(Number.isFinite, "Giá trị số không hợp lệ");
const pos = num.refine((n) => n > 0, "Giá trị phải lớn hơn 0");
const vec2 = z.object({ x: num, y: num });

const wall = z.object({ id: z.string().min(1), a: vec2, b: vec2, thickness: pos });

const opening = z.object({
  id: z.string().min(1),
  wallId: z.string().min(1),
  kind: z.enum(["door", "window"]),
  offset: num,
  width: pos,
  height: pos,
  sill: num,
  hinge: z.enum(["start", "end"]),
  swing: z.enum(["left", "right"]),
});

const room = z.object({
  id: z.string().min(1),
  polygon: z.array(vec2).min(3),
  netPolygon: z.array(vec2).min(3).nullable().default(null),
  name: z.string().max(120),
  type: z.enum(ROOM_TYPES),
  source: z.enum(["auto", "manual"]),
});

const stair = z.object({
  id: z.string().min(1),
  type: z.enum(STAIR_TYPES),
  x: num,
  y: num,
  rotation: num,
  width: pos,
  riserCount: z.number().int().min(2).max(60),
  treadDepth: pos,
  landingDepth: num,
  gap: num,
  turn: z.enum(["left", "right"]),
  innerRadius: num,
  sweep: num,
});

const furniture = z.object({
  id: z.string().min(1),
  kind: z.enum(FURNITURE_KINDS),
  name: z.string().max(120),
  x: num,
  y: num,
  rotation: num,
  width: pos,
  depth: pos,
  height: pos,
});

const floor = z.object({
  id: z.string().min(1),
  name: z.string().max(120),
  height: pos,
  slabThickness: pos,
  walls: z.array(wall),
  rooms: z.array(room),
  openings: z.array(opening),
  stairs: z.array(stair),
  furniture: z.array(furniture).max(500).default([]),
});

const lot = z.object({
  imageId: z.string().nullable(),
  trace: z
    .object({
      points: z.array(vec2),
      pxPerMeter: pos,
      rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
    })
    .nullable(),
  polygon: z.array(vec2).min(3),
  edgeLengths: z.array(num.nullable()),
  certifiedArea: num.nullable(),
  parcelNo: z.string().max(200).default(""),
  mapSheetNo: z.string().max(200).default(""),
  address: z.string().max(500).default(""),
});

const finance = z.object({
  unitPrice: num,
  surchargePct: num,
  foundationPct: num,
  roofPct: num,
  areaOverride: num.nullable(),
  extraCosts: z.array(z.object({ id: z.string().min(1), name: z.string().max(200), amount: num })).max(100),
  contingencyPct: num,
  buildMonths: num,
  ownCapital: num,
  income: z.array(z.object({ id: z.string().min(1), name: z.string().max(200), quantity: num, unitPrice: num })).max(100),
  occupancyPct: num,
  rentGrowthPct: num,
  taxPct: num,
  opexMonthly: num,
  opexGrowthPct: num,
  loanRatePct: num,
  loanYears: num,
  scenario: z.enum(FINANCE_SCENARIOS),
});

export const projectSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(200),
  schemaVersion: z.literal(SCHEMA_VERSION),
  createdAt: z.string(),
  updatedAt: z.string(),
  lot,
  constraints: z.object({
    keepInsideLot: z.boolean(),
    setback: z.object({ enabled: z.boolean(), perEdge: z.array(num) }),
    roadCut: z
      .object({ enabled: z.boolean(), edge: z.number().int().min(0), depth: num, roadWidth: num.nullable() })
      .default({ enabled: false, edge: 0, depth: 0, roadWidth: null }),
    allowOverhang: z.boolean(),
    showStats: z.boolean(),
  }),
  floors: z.array(floor).min(1).max(100),
  defaults: z.object({ wallThickness: pos, exteriorWallThickness: pos }),
  // Added after v1 shipped: older documents get the default assumptions.
  finance: finance.default(defaultFinance),
});

export const EXPORT_FORMAT = "real-estate-builder";

export const exportFileSchema = z.object({
  format: z.literal(EXPORT_FORMAT),
  version: z.number().int(),
  exportedAt: z.string(),
  project: z.unknown(),
  image: z
    .object({
      mime: z.string().regex(/^image\/(png|jpeg|webp|gif|bmp)$/),
      dataUrl: z.string().startsWith("data:image/"),
    })
    .nullable()
    .default(null),
});

export class ProjectFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectFormatError";
  }
}

/** Upgrades older project documents to the current schema version. */
export function migrateProject(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") throw new ProjectFormatError("Dữ liệu dự án không hợp lệ.");
  const doc = raw as { schemaVersion?: unknown };
  const version = typeof doc.schemaVersion === "number" ? doc.schemaVersion : 0;
  if (version > SCHEMA_VERSION) {
    throw new ProjectFormatError("Tệp được tạo bởi phiên bản mới hơn của ứng dụng. Vui lòng cập nhật ứng dụng.");
  }
  // v0 -> v1: introduced explicit schemaVersion.
  if (version < 1) return { ...doc, schemaVersion: 1 };
  return doc;
}

/** Validates (and migrates) an unknown value into a Project, throwing a readable error. */
export function parseProject(raw: unknown): Project {
  const migrated = migrateProject(raw);
  const res = projectSchema.safeParse(migrated);
  if (!res.success) {
    const issue = res.error.issues[0];
    const path = issue?.path.join(".") || "(gốc)";
    throw new ProjectFormatError(`Dữ liệu dự án không hợp lệ tại "${path}": ${issue?.message ?? "lỗi không xác định"}`);
  }
  return res.data as Project;
}
