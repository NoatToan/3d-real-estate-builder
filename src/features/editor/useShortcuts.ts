"use client";

import { useEffect } from "react";
import { useProjectStore } from "@/store/projectStore";
import { useEditorStore, type Tool } from "@/store/editorStore";

const TOOL_KEYS: Record<string, Tool> = { v: "select", h: "pan", w: "wall", e: "room", d: "door", n: "window", s: "stair", m: "measure" };

export function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT";
}

/** Global editor shortcuts (tools, undo/redo, delete, fit). Canvas-specific keys live in PlanCanvas. */
export function useShortcuts(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || e.defaultPrevented) return;
      const editor = useEditorStore.getState();
      if (editor.lotWizardOpen) return;
      const store = useProjectStore.getState();
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      if (mod && key === "z") {
        e.preventDefault();
        if (e.shiftKey) store.redo();
        else store.undo();
        return;
      }
      if (mod && key === "y") {
        e.preventDefault();
        store.redo();
        return;
      }
      if (mod) return;

      if ((e.key === "Delete" || e.key === "Backspace") && editor.selection) {
        e.preventDefault();
        store.removeEntities(editor.selection.floorId, editor.selection.ids);
        editor.select(null);
        return;
      }
      if (key === "f") {
        editor.requestFit();
        return;
      }
      if (key === "1") editor.setView("2d");
      else if (key === "2") editor.setView("split");
      else if (key === "3") editor.setView("3d");
      else if (key === "4") editor.setView("finance");
      else if (TOOL_KEYS[key] && !e.altKey && (editor.view === "2d" || editor.view === "split")) editor.setTool(TOOL_KEYS[key]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
}
