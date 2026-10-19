import { create } from "zustand";
import type { FurnitureKind, Id, Project, StairType } from "@/domain/types";

export type Tool = "select" | "pan" | "wall" | "room" | "door" | "window" | "stair" | "furniture" | "measure";
/** "finance" swaps the drawing panes for the feasibility (dự toán & dòng tiền) view. */
export type ViewMode = "2d" | "3d" | "split" | "finance";

/** Tabs of the control panel (Bảng điều khiển). */
export type PanelTab = "start" | "edit" | "check" | "fengshui" | "settings";

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
  show: { ghostBelow: boolean; dimensions: boolean; lotImage: boolean; grid: boolean; roomLabels: boolean; fengShui: boolean };
  /** cutaway: the top visible floor shows walls 1.2 m high so its rooms and furniture can be seen. */
  viewer: { hiddenFloorIds: Id[]; explode: number; upToActive: boolean; roof: boolean; cutaway: boolean };
  /** Tab shown in the control panel; switches to "edit" when something is selected or a drawing tool is picked. */
  panelTab: PanelTab;
  /** Control panel shown (desktop: column next to the tools; phone: bottom sheet). */
  panelOpen: boolean;
  /** First-run coach marks already seen or skipped. */
  tourDone: boolean;
  panels: { guide: boolean; issues: boolean; stats: boolean; constraints: boolean; display: boolean; fengShui: boolean };
  /** Incremented to ask the 2D/3D views to zoom to fit. */
  fitRequest: number;
  lotWizardOpen: boolean;
  /** Step-by-step help dialog. */
  guideOpen: boolean;
  quickFloorOpen: boolean;
  roomPlacerOpen: boolean;

  requestFit: () => void;
  setLotWizardOpen: (open: boolean) => void;
  setGuideOpen: (open: boolean) => void;
  setQuickFloorOpen: (open: boolean) => void;
  setRoomPlacerOpen: (open: boolean) => void;
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
  setPanelTab: (t: PanelTab) => void;
  setPanelOpen: (open: boolean) => void;
  setTourDone: (done: boolean) => void;
  /** Drops references to floors/objects that no longer exist (after undo, redo, delete, regenerated rooms…). */
  syncWithProject: (project: Project | null) => void;
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
  show: { ghostBelow: true, dimensions: true, lotImage: false, grid: true, roomLabels: true, fengShui: true },
  viewer: { hiddenFloorIds: [] as Id[], explode: 0, upToActive: false, roof: false, cutaway: true },
  panelTab: "start" as PanelTab,
  panelOpen: true,
  tourDone: false,
  panels: { guide: true, issues: true, stats: true, constraints: true, display: true, fengShui: true },
  fitRequest: 0,
  lotWizardOpen: false,
  guideOpen: false,
  quickFloorOpen: false,
  roomPlacerOpen: false,
};

export const useEditorStore = create<EditorState>()((set, get) => ({
  ...initial,
  requestFit: () => set({ fitRequest: get().fitRequest + 1 }),
  setLotWizardOpen: (lotWizardOpen) => set({ lotWizardOpen }),
  setGuideOpen: (guideOpen) => set({ guideOpen }),
  setQuickFloorOpen: (quickFloorOpen) => set({ quickFloorOpen }),
  setRoomPlacerOpen: (roomPlacerOpen) => set({ roomPlacerOpen }),
  setView: (view) => set({ view }),
  // A drawing tool replaces the selection, so "Chỉnh sửa" shows the tool's options instead of the old object.
  setTool: (tool) => set(tool === "select" || tool === "pan" ? { tool } : { tool, selection: null, panelTab: "edit" }),
  setActiveFloor: (activeFloorId) => set({ activeFloorId, selection: null }),
  select: (selection) => (selection && selection.ids.length ? set({ selection, panelTab: "edit" }) : set({ selection: null })),
  toggleSelect: (floorId, id) => {
    const sel = get().selection;
    if (!sel || sel.floorId !== floorId) return set({ selection: { floorId, ids: [id] }, panelTab: "edit" });
    const ids = sel.ids.includes(id) ? sel.ids.filter((x) => x !== id) : [...sel.ids, id];
    set({ selection: ids.length ? { floorId, ids } : null });
  },
  setStairType: (stairType) => set({ stairType }),
  pickFurniture: (furnitureKind) => set({ furnitureKind, tool: "furniture", selection: null, panelTab: "edit" }),
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
  setPanelTab: (panelTab) => set({ panelTab }),
  setPanelOpen: (panelOpen) => set({ panelOpen }),
  setTourDone: (tourDone) => set({ tourDone }),
  syncWithProject: (project) => {
    const patch = staleEditorRefs(get(), project);
    if (patch) set(patch);
  },
  reset: () => set({ ...initial }),
}));

function entityIds(floor: Project["floors"][number]): Set<Id> {
  return new Set([...floor.walls, ...floor.openings, ...floor.stairs, ...floor.furniture, ...floor.rooms].map((e) => e.id));
}

/** Patch that removes editor references to floors or objects missing from the project, or null when all are valid. */
export function staleEditorRefs(
  s: Pick<EditorState, "activeFloorId" | "selection" | "viewer">,
  project: Project | null,
): Partial<Pick<EditorState, "activeFloorId" | "selection" | "viewer">> | null {
  if (!project || !project.floors.length) return null;
  const patch: Partial<Pick<EditorState, "activeFloorId" | "selection" | "viewer">> = {};
  const floorIds = new Set(project.floors.map((f) => f.id));
  if (!s.activeFloorId || !floorIds.has(s.activeFloorId)) patch.activeFloorId = project.floors[0].id;
  if (s.selection) {
    const floor = project.floors.find((f) => f.id === s.selection!.floorId);
    const activeId = patch.activeFloorId ?? s.activeFloorId;
    if (!floor || floor.id !== activeId) patch.selection = null;
    else {
      const have = entityIds(floor);
      const ids = s.selection.ids.filter((id) => have.has(id));
      if (ids.length !== s.selection.ids.length) patch.selection = ids.length ? { floorId: floor.id, ids } : null;
    }
  }
  const hidden = s.viewer.hiddenFloorIds.filter((id) => floorIds.has(id));
  if (hidden.length !== s.viewer.hiddenFloorIds.length) patch.viewer = { ...s.viewer, hiddenFloorIds: hidden };
  return Object.keys(patch).length ? patch : null;
}
