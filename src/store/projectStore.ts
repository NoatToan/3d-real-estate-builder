import { create } from "zustand";
import { current, isDraft, produce, type Draft } from "immer";
import type { Constraints, FinanceInputs, Floor, Furniture, Id, Lot, Opening, Project, Room, Stair, Vec2, Wall } from "@/domain/types";
import { createFloor, createWall, newId } from "@/domain/factory";
import { reconcileRooms } from "@/domain/rooms";
import { buildablePolygon } from "@/domain/stats";
import { siteLotPolygon } from "@/domain/roadCut";
import type { QuickFloorPlan } from "@/domain/quickFloor";
import { pointInPolygon } from "@/geometry/polygon";
import { clampOpening } from "@/geometry/openings";
import { insetPolygon } from "@/geometry/offset";
import { dist } from "@/geometry/vec";

const HISTORY_LIMIT = 200;

type Recipe = (draft: Draft<Project>) => void;

export interface ProjectState {
  project: Project | null;
  past: Project[];
  future: Project[];
  /** Snapshot taken by begin(); while set, mutations are not recorded individually. */
  txBase: Project | null;

  load: (p: Project) => void;
  close: () => void;
  mutate: (recipe: Recipe) => void;
  undo: () => void;
  redo: () => void;
  /** Start a gesture (drag): intermediate changes collapse into one undo step. */
  begin: () => void;
  commit: () => void;
  cancel: () => void;

  rename: (name: string) => void;
  setLot: (lot: Lot) => void;
  setConstraints: (patch: Partial<Constraints>) => void;
  setFinance: (patch: Partial<FinanceInputs>) => void;

  addFloor: (opts?: { copyFromId?: Id; copyWalls?: boolean }) => Id | null;
  removeFloor: (id: Id) => void;
  moveFloor: (id: Id, dir: -1 | 1) => void;
  updateFloor: (id: Id, patch: Partial<Pick<Floor, "name" | "height" | "slabThickness">>) => void;

  addWalls: (floorId: Id, walls: Wall[]) => void;
  updateWall: (floorId: Id, id: Id, patch: Partial<Omit<Wall, "id">>) => void;
  moveWallEndpoint: (floorId: Id, from: Vec2, to: Vec2, onlyWallId?: Id) => void;
  splitWall: (floorId: Id, id: Id, at: Vec2) => void;
  generateExteriorWalls: (floorId: Id, source: "lot" | "buildable") => boolean;

  addOpening: (floorId: Id, o: Opening) => void;
  updateOpening: (floorId: Id, id: Id, patch: Partial<Omit<Opening, "id">>) => void;

  addStair: (floorId: Id, s: Stair) => void;
  updateStair: (floorId: Id, id: Id, patch: Partial<Omit<Stair, "id">>) => void;

  /** Replaces everything on a floor with a generated layout (one undo step). */
  applyQuickFloor: (floorId: Id, plan: QuickFloorPlan) => void;
  /** Replaces a floor's layout (walls, rooms, openings, stairs, furniture) in one undo step. */
  setFloorLayout: (floorId: Id, layout: Pick<Floor, "walls" | "rooms" | "openings" | "stairs" | "furniture">) => void;
  addFurniture: (floorId: Id, f: Furniture) => void;
  updateFurniture: (floorId: Id, id: Id, patch: Partial<Omit<Furniture, "id">>) => void;

  addRoom: (floorId: Id, room: Room) => void;
  updateRoom: (floorId: Id, id: Id, patch: Partial<Pick<Room, "name" | "type" | "polygon">>) => void;

  removeEntities: (floorId: Id, ids: readonly Id[]) => void;
}

function findFloor(d: Draft<Project>, id: Id): Draft<Floor> | undefined {
  return d.floors.find((f) => f.id === id);
}

const plain = <T,>(v: T): T => (isDraft(v) ? (current(v as Draft<T>) as T) : v);

/** Re-derives rooms and clamps openings after walls changed. */
function syncFloor(f: Draft<Floor>): void {
  const walls = plain(f.walls) as Wall[];
  f.rooms = reconcileRooms(plain(f.rooms) as Room[], walls) as Draft<Room>[];
  const byId = new Map(walls.map((w) => [w.id, w]));
  f.openings = f.openings
    .filter((o) => byId.has(o.wallId))
    .map((o) => clampOpening(plain(o) as Opening, byId.get(o.wallId)!)) as Draft<Opening>[];
}

const EPS_POINT = 1e-4;

export const useProjectStore = create<ProjectState>()((set, get) => ({
  project: null,
  past: [],
  future: [],
  txBase: null,

  load: (p) => set({ project: p, past: [], future: [], txBase: null }),
  close: () => set({ project: null, past: [], future: [], txBase: null }),

  mutate: (recipe) => {
    const prev = get().project;
    if (!prev) return;
    let next = produce(prev, recipe);
    if (next === prev) return;
    next = { ...next, updatedAt: new Date().toISOString() };
    if (get().txBase) {
      set({ project: next });
    } else {
      set({ project: next, past: [...get().past, prev].slice(-HISTORY_LIMIT), future: [] });
    }
  },

  undo: () => {
    const { past, project, future, txBase } = get();
    if (txBase || !past.length || !project) return;
    set({ project: past[past.length - 1], past: past.slice(0, -1), future: [project, ...future] });
  },

  redo: () => {
    const { past, project, future, txBase } = get();
    if (txBase || !future.length || !project) return;
    set({ project: future[0], future: future.slice(1), past: [...past, project].slice(-HISTORY_LIMIT) });
  },

  begin: () => {
    if (!get().txBase) set({ txBase: get().project });
  },
  commit: () => {
    const { txBase, project, past } = get();
    if (!txBase) return;
    if (project && project !== txBase) set({ txBase: null, past: [...past, txBase].slice(-HISTORY_LIMIT), future: [] });
    else set({ txBase: null });
  },
  cancel: () => {
    const { txBase } = get();
    if (txBase) set({ project: txBase, txBase: null });
  },

  rename: (name) =>
    get().mutate((d) => {
      d.name = name.trim().slice(0, 200) || d.name;
    }),

  setLot: (lot) =>
    get().mutate((d) => {
      const edgeCountChanged = d.lot.polygon.length !== lot.polygon.length;
      d.lot = lot as Draft<Lot>;
      if (edgeCountChanged) {
        d.constraints.setback.perEdge = lot.polygon.map(() => 0);
        // Edge indices no longer match the new outline.
        d.constraints.roadCut = { ...d.constraints.roadCut, enabled: false, edge: 0 };
      }
    }),

  setConstraints: (patch) =>
    get().mutate((d) => {
      Object.assign(d.constraints, patch);
    }),

  setFinance: (patch) =>
    get().mutate((d) => {
      Object.assign(d.finance, patch);
    }),

  addFloor: (opts = {}) => {
    let id: Id | null = null;
    get().mutate((d) => {
      const src = opts.copyFromId ? d.floors.find((f) => f.id === opts.copyFromId) : undefined;
      const floor = createFloor(d.floors.length);
      if (src) {
        const map = new Map<string, string>();
        floor.height = src.height;
        floor.slabThickness = src.slabThickness;
        floor.walls = plain(src.walls).map((w) => {
          const nw = { ...w, id: newId("w_") };
          map.set(w.id, nw.id);
          return nw;
        });
        if (!opts.copyWalls) {
          // keep only the outer shell, drop partitions
          const ext = d.defaults.exteriorWallThickness;
          floor.walls = floor.walls.filter((w) => w.thickness >= ext - 1e-6);
        }
        const kept = new Set(floor.walls.map((w) => w.id));
        if (opts.copyWalls) {
          floor.openings = plain(src.openings)
            .filter((o) => kept.has(map.get(o.wallId) ?? ""))
            .map((o) => ({ ...o, id: newId("o_"), wallId: map.get(o.wallId)! }));
        }
        if (opts.copyWalls) floor.furniture = plain(src.furniture).map((x) => ({ ...x, id: newId("fu_") }));
        floor.rooms = reconcileRooms([], floor.walls);
        if (opts.copyWalls) {
          const srcRooms = plain(src.rooms);
          floor.rooms = floor.rooms.map((r, i) => {
            const match = srcRooms.find((s) => s.source === "auto" && s.polygon.length === r.polygon.length && dist(s.polygon[0], r.polygon[0]) < 1e-3);
            return match ? { ...r, name: match.name, type: match.type } : { ...r, name: r.name || `Phòng ${i + 1}` };
          });
        }
      }
      d.floors.push(floor as Draft<Floor>);
      id = floor.id;
    });
    return id;
  },

  removeFloor: (id) =>
    get().mutate((d) => {
      if (d.floors.length <= 1) return;
      d.floors = d.floors.filter((f) => f.id !== id);
    }),

  moveFloor: (id, dir) =>
    get().mutate((d) => {
      const i = d.floors.findIndex((f) => f.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= d.floors.length) return;
      const [f] = d.floors.splice(i, 1);
      d.floors.splice(j, 0, f);
    }),

  updateFloor: (id, patch) =>
    get().mutate((d) => {
      const f = findFloor(d, id);
      if (!f) return;
      if (patch.name !== undefined) f.name = patch.name.slice(0, 120);
      if (patch.height !== undefined && patch.height > 1.5 && patch.height < 20) f.height = patch.height;
      if (patch.slabThickness !== undefined && patch.slabThickness > 0.04 && patch.slabThickness < 1) f.slabThickness = patch.slabThickness;
    }),

  addWalls: (floorId, walls) =>
    get().mutate((d) => {
      const f = findFloor(d, floorId);
      if (!f) return;
      const valid = walls.filter((w) => dist(w.a, w.b) > 0.02 && w.thickness > 0);
      if (!valid.length) return;
      f.walls.push(...(valid as Draft<Wall>[]));
      syncFloor(f);
    }),

  updateWall: (floorId, id, patch) =>
    get().mutate((d) => {
      const f = findFloor(d, floorId);
      const w = f?.walls.find((x) => x.id === id);
      if (!f || !w) return;
      if (patch.a) w.a = { ...patch.a };
      if (patch.b) w.b = { ...patch.b };
      if (patch.thickness !== undefined && patch.thickness >= 0.05 && patch.thickness <= 1) w.thickness = patch.thickness;
      syncFloor(f);
    }),

  moveWallEndpoint: (floorId, from, to, onlyWallId) =>
    get().mutate((d) => {
      const f = findFloor(d, floorId);
      if (!f) return;
      for (const w of f.walls) {
        if (onlyWallId && w.id !== onlyWallId) continue;
        if (dist(w.a, from) < EPS_POINT) w.a = { ...to };
        if (dist(w.b, from) < EPS_POINT) w.b = { ...to };
      }
      f.walls = f.walls.filter((w) => dist(w.a, w.b) > 0.02);
      syncFloor(f);
    }),

  splitWall: (floorId, id, at) =>
    get().mutate((d) => {
      const f = findFloor(d, floorId);
      const w = f?.walls.find((x) => x.id === id);
      if (!f || !w) return;
      if (dist(w.a, at) < 0.05 || dist(w.b, at) < 0.05) return;
      const second = createWall(at, plain(w.b), w.thickness);
      const L1 = dist(w.a, at);
      for (const o of f.openings) {
        if (o.wallId === w.id && o.offset > L1) {
          o.wallId = second.id;
          o.offset -= L1;
        }
      }
      w.b = { ...at };
      f.walls.push(second as Draft<Wall>);
      syncFloor(f);
    }),

  generateExteriorWalls: (floorId, source) => {
    const p = get().project;
    if (!p) return false;
    const base = source === "buildable" ? buildablePolygon(p) : siteLotPolygon(p);
    if (!base) return false;
    const t = p.defaults.exteriorWallThickness;
    // Centre line half a wall inside the boundary so the outer face sits on it.
    const centre = insetPolygon(base, t / 2);
    if (!centre) return false;
    const walls = centre.map((a, i) => createWall(a, centre[(i + 1) % centre.length], t));
    get().addWalls(floorId, walls);
    return true;
  },

  addOpening: (floorId, o) =>
    get().mutate((d) => {
      const f = findFloor(d, floorId);
      const w = f?.walls.find((x) => x.id === o.wallId);
      if (!f || !w) return;
      f.openings.push(clampOpening(o, plain(w)) as Draft<Opening>);
    }),

  updateOpening: (floorId, id, patch) =>
    get().mutate((d) => {
      const f = findFloor(d, floorId);
      const i = f?.openings.findIndex((x) => x.id === id) ?? -1;
      if (!f || i < 0) return;
      const merged = { ...plain(f.openings[i]), ...patch } as Opening;
      const w = f.walls.find((x) => x.id === merged.wallId);
      if (!w) return;
      f.openings[i] = clampOpening(merged, plain(w)) as Draft<Opening>;
    }),

  addStair: (floorId, s) =>
    get().mutate((d) => {
      findFloor(d, floorId)?.stairs.push(s as Draft<Stair>);
    }),

  updateStair: (floorId, id, patch) =>
    get().mutate((d) => {
      const s = findFloor(d, floorId)?.stairs.find((x) => x.id === id);
      if (!s) return;
      Object.assign(s, patch);
      s.riserCount = Math.min(60, Math.max(2, Math.round(s.riserCount)));
      s.width = Math.min(5, Math.max(0.4, s.width));
      s.treadDepth = Math.min(0.6, Math.max(0.12, s.treadDepth));
      s.rotation = ((s.rotation % 360) + 360) % 360;
    }),

  setFloorLayout: (floorId, layout) =>
    get().mutate((d) => {
      const f = findFloor(d, floorId);
      if (!f) return;
      f.walls = layout.walls as Draft<Wall>[];
      f.rooms = layout.rooms as Draft<Room>[];
      f.openings = layout.openings as Draft<Opening>[];
      f.stairs = layout.stairs as Draft<Stair>[];
      f.furniture = layout.furniture as Draft<Furniture>[];
      syncFloor(f);
    }),

  applyQuickFloor: (floorId, plan) =>
    get().mutate((d) => {
      const f = findFloor(d, floorId);
      if (!f) return;
      f.walls = plan.walls as Draft<Wall>[];
      f.openings = plan.openings as Draft<Opening>[];
      f.stairs = plan.stairs as Draft<Stair>[];
      f.furniture = plan.furniture as Draft<Furniture>[];
      f.rooms = [];
      syncFloor(f);
      for (const l of plan.labels) {
        const r = f.rooms.find((x) => pointInPolygon(l.at, x.polygon));
        if (r) {
          r.name = l.name;
          r.type = l.type;
        }
      }
    }),

  addFurniture: (floorId, f) =>
    get().mutate((d) => {
      findFloor(d, floorId)?.furniture.push(f as Draft<Furniture>);
    }),

  updateFurniture: (floorId, id, patch) =>
    get().mutate((d) => {
      const f = findFloor(d, floorId)?.furniture.find((x) => x.id === id);
      if (!f) return;
      Object.assign(f, patch);
      f.width = Math.min(20, Math.max(0.1, f.width));
      f.depth = Math.min(20, Math.max(0.1, f.depth));
      f.height = Math.min(10, Math.max(0.05, f.height));
      f.rotation = ((f.rotation % 360) + 360) % 360;
    }),

  addRoom: (floorId, room) =>
    get().mutate((d) => {
      const f = findFloor(d, floorId);
      if (!f || room.polygon.length < 3) return;
      f.rooms.push(room as Draft<Room>);
      syncFloor(f);
    }),

  updateRoom: (floorId, id, patch) =>
    get().mutate((d) => {
      const f = findFloor(d, floorId);
      const r = f?.rooms.find((x) => x.id === id);
      if (!f || !r) return;
      if (patch.name !== undefined) r.name = patch.name.slice(0, 120);
      if (patch.type !== undefined) r.type = patch.type;
      if (patch.polygon && r.source === "manual" && patch.polygon.length >= 3) {
        r.polygon = patch.polygon.map((p) => ({ ...p }));
        r.netPolygon = null;
      }
    }),

  removeEntities: (floorId, ids) =>
    get().mutate((d) => {
      const f = findFloor(d, floorId);
      if (!f || !ids.length) return;
      const del = new Set(ids);
      const wallsBefore = f.walls.length;
      f.walls = f.walls.filter((w) => !del.has(w.id));
      f.openings = f.openings.filter((o) => !del.has(o.id));
      f.stairs = f.stairs.filter((s) => !del.has(s.id));
      f.furniture = f.furniture.filter((x) => !del.has(x.id));
      f.rooms = f.rooms.filter((r) => !(r.source === "manual" && del.has(r.id)));
      if (f.walls.length !== wallsBefore || ids.some((id) => f.rooms.some((r) => r.id === id))) syncFloor(f);
    }),
}));

/** Non-reactive accessor for event handlers. */
export const projectStore = useProjectStore;
