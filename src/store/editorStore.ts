import { create } from "zustand";
import type { Id, StairType } from "@/domain/types";

export type Tool = "select" | "pan" | "wall" | "room" | "door" | "window" | "stair" | "measure";
export type ViewMode = "2d" | "3d" | "split";

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
  wallThickness: number | null;
  roomCreatesWalls: boolean;

  snap: { enabled: boolean; grid: number; angleStep: number };
  show: { ghostBelow: boolean; dimensions: boolean; lotImage: boolean; grid: boolean; roomLabels: boolean };
  viewer: { hiddenFloorIds: Id[]; explode: number; upToActive: boolean; roof: boolean };
  panels: { issues: boolean; stats: boolean; constraints: boolean };

  setView: (v: ViewMode) => void;
  setTool: (t: Tool) => void;
  setActiveFloor: (id: Id | null) => void;
  select: (sel: Selection | null) => void;
  toggleSelect: (floorId: Id, id: Id) => void;
  setStairType: (t: StairType) => void;
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
  wallThickness: null,
  roomCreatesWalls: true,
  snap: { enabled: true, grid: 0.05, angleStep: 15 },
  show: { ghostBelow: true, dimensions: true, lotImage: false, grid: true, roomLabels: true },
  viewer: { hiddenFloorIds: [] as Id[], explode: 0, upToActive: false, roof: false },
  panels: { issues: true, stats: true, constraints: false },
};

export const useEditorStore = create<EditorState>()((set, get) => ({
  ...initial,
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
