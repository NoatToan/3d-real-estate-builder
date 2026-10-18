import { create } from "zustand";
import type { FurnitureKind, Id, StairType } from "@/domain/types";

export type Tool = "select" | "pan" | "wall" | "room" | "door" | "window" | "stair" | "furniture" | "measure";
/** "finance" swaps the drawing panes for the feasibility (dự toán & dòng tiền) view. */
export type ViewMode = "2d" | "3d" | "split" | "finance";

export interface Selection {
  floorId: Id;
  ids: Id[];
}

export interface EditorState {
  view: ViewMode;
  tool: Tool;
  activeFloorId: Id | null;
  selection: Selection | null;

  stairType: StairType;
  /** Item placed by the furniture tool. */
  furnitureKind: FurnitureKind;
  wallThickness: number | null;
  roomCreatesWalls: boolean;

  snap: { enabled: boolean; grid: number; angleStep: number };
  show: { ghostBelow: boolean; dimensions: boolean; lotImage: boolean; grid: boolean; roomLabels: boolean };
  /** cutaway: the top visible floor shows walls 1.2 m high so its rooms and furniture can be seen. */
  viewer: { hiddenFloorIds: Id[]; explode: number; upToActive: boolean; roof: boolean; cutaway: boolean };
  panels: { guide: boolean; issues: boolean; stats: boolean; constraints: boolean; display: boolean };
  /** Incremented to ask the 2D/3D views to zoom to fit. */
  fitRequest: number;
  lotWizardOpen: boolean;
  /** Step-by-step help dialog. */
  guideOpen: boolean;
  quickFloorOpen: boolean;

  requestFit: () => void;
  setLotWizardOpen: (open: boolean) => void;
  setGuideOpen: (open: boolean) => void;
  setQuickFloorOpen: (open: boolean) => void;
  setView: (v: ViewMode) => void;
  setTool: (t: Tool) => void;
  setActiveFloor: (id: Id | null) => void;
  select: (sel: Selection | null) => void;
  toggleSelect: (floorId: Id, id: Id) => void;
  setStairType: (t: StairType) => void;
  /** Picks a catalog item and arms the furniture tool. */
  pickFurniture: (k: FurnitureKind) => void;
  setWallThickness: (t: number | null) => void;
  setRoomCreatesWalls: (v: boolean) => void;
  setSnap: (patch: Partial<EditorState["snap"]>) => void;
  setShow: (patch: Partial<EditorState["show"]>) => void;
  setViewer: (patch: Partial<EditorState["viewer"]>) => void;
  toggleFloorVisibility: (id: Id) => void;
  togglePanel: (p: keyof EditorState["panels"]) => void;
  reset: () => void;
}

const initial = {
  view: "split" as ViewMode,
  tool: "select" as Tool,
  activeFloorId: null,
  selection: null,
  stairType: "U" as StairType,
  furnitureKind: "sofa" as FurnitureKind,
  wallThickness: null,
  roomCreatesWalls: true,
  snap: { enabled: true, grid: 0.05, angleStep: 15 },
  show: { ghostBelow: true, dimensions: true, lotImage: false, grid: true, roomLabels: true },
  viewer: { hiddenFloorIds: [] as Id[], explode: 0, upToActive: false, roof: false, cutaway: true },
  panels: { guide: true, issues: true, stats: true, constraints: false, display: false },
  fitRequest: 0,
  lotWizardOpen: false,
  guideOpen: false,
  quickFloorOpen: false,
};

export const useEditorStore = create<EditorState>()((set, get) => ({
  ...initial,
  requestFit: () => set({ fitRequest: get().fitRequest + 1 }),
  setLotWizardOpen: (lotWizardOpen) => set({ lotWizardOpen }),
  setGuideOpen: (guideOpen) => set({ guideOpen }),
  setQuickFloorOpen: (quickFloorOpen) => set({ quickFloorOpen }),
  setView: (view) => set({ view }),
  setTool: (tool) => set({ tool }),
  setActiveFloor: (activeFloorId) => set({ activeFloorId, selection: null }),
  select: (selection) => set({ selection: selection && selection.ids.length ? selection : null }),
  toggleSelect: (floorId, id) => {
    const sel = get().selection;
    if (!sel || sel.floorId !== floorId) return set({ selection: { floorId, ids: [id] } });
    const ids = sel.ids.includes(id) ? sel.ids.filter((x) => x !== id) : [...sel.ids, id];
    set({ selection: ids.length ? { floorId, ids } : null });
  },
  setStairType: (stairType) => set({ stairType }),
  pickFurniture: (furnitureKind) => set({ furnitureKind, tool: "furniture", selection: null }),
  setWallThickness: (wallThickness) => set({ wallThickness }),
  setRoomCreatesWalls: (roomCreatesWalls) => set({ roomCreatesWalls }),
  setSnap: (patch) => set({ snap: { ...get().snap, ...patch } }),
  setShow: (patch) => set({ show: { ...get().show, ...patch } }),
  setViewer: (patch) => set({ viewer: { ...get().viewer, ...patch } }),
  toggleFloorVisibility: (id) => {
    const hidden = get().viewer.hiddenFloorIds;
    set({ viewer: { ...get().viewer, hiddenFloorIds: hidden.includes(id) ? hidden.filter((x) => x !== id) : [...hidden, id] } });
  },
  togglePanel: (p) => set({ panels: { ...get().panels, [p]: !get().panels[p] } }),
  reset: () => set({ ...initial }),
}));
