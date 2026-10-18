import { useEditorStore, type PanelTab } from "./editorStore";

/**
 * Small UI preferences kept between visits (per browser): which control-panel tab was open,
 * whether the panel was collapsed, and whether the first-run tour was seen.
 */
export interface UiPrefs {
  panelTab: PanelTab;
  panelOpen: boolean;
  tourDone: boolean;
}

const KEY = "reb-ui-v1";
const TABS: readonly PanelTab[] = ["start", "edit", "check", "fengshui", "settings"];

/** Keeps only well-formed fields from stored JSON. */
export function parseUiPrefs(raw: string | null): Partial<UiPrefs> {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw) as Record<string, unknown>;
    const out: Partial<UiPrefs> = {};
    if (typeof v.panelTab === "string" && (TABS as readonly string[]).includes(v.panelTab)) out.panelTab = v.panelTab as PanelTab;
    if (typeof v.panelOpen === "boolean") out.panelOpen = v.panelOpen;
    if (typeof v.tourDone === "boolean") out.tourDone = v.tourDone;
    return out;
  } catch {
    return {};
  }
}

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function loadUiPrefs(): Partial<UiPrefs> {
  return parseUiPrefs(storage()?.getItem(KEY) ?? null);
}

/** Applies stored prefs to the editor store and saves later changes. Returns the unsubscribe. */
export function bindUiPrefs(): () => void {
  const p = loadUiPrefs();
  const ed = useEditorStore.getState();
  if (p.panelTab) ed.setPanelTab(p.panelTab);
  if (p.panelOpen != null) ed.setPanelOpen(p.panelOpen);
  if (p.tourDone != null) ed.setTourDone(p.tourDone);
  return useEditorStore.subscribe((s, prev) => {
    if (s.panelTab === prev.panelTab && s.panelOpen === prev.panelOpen && s.tourDone === prev.tourDone) return;
    try {
      storage()?.setItem(KEY, JSON.stringify({ panelTab: s.panelTab, panelOpen: s.panelOpen, tourDone: s.tourDone }));
    } catch {
      // Private mode / quota: preferences just don't persist.
    }
  });
}
