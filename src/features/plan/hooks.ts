"use client";

import { useEffect, useState, type RefObject } from "react";
import type { Floor, Project } from "@/domain/types";
import { useProjectStore } from "@/store/projectStore";
import { useEditorStore } from "@/store/editorStore";
import { loadImage } from "@/persistence/db";
import { rotatedCanvas } from "@/ocr/image";

/** Observes an element's content-box size. */
export function useElementSize(ref: RefObject<HTMLElement | null>): { width: number; height: number } {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize((s) => (s.width === Math.round(width) && s.height === Math.round(height) ? s : { width: Math.round(width), height: Math.round(height) }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

/** Active floor (falls back to the ground floor if the stored id is stale). */
export function activeFloorOf(project: Project | null, activeId: string | null): { floor: Floor | null; index: number } {
  if (!project) return { floor: null, index: -1 };
  const index = project.floors.findIndex((f) => f.id === activeId);
  return index >= 0 ? { floor: project.floors[index], index } : { floor: project.floors[0] ?? null, index: 0 };
}

export function useActiveFloor(): { floor: Floor | null; index: number } {
  const project = useProjectStore((s) => s.project);
  const activeId = useEditorStore((s) => s.activeFloorId);
  return activeFloorOf(project, activeId);
}

/** Loads the certificate image from IndexedDB, rotated as it was traced. */
export function useLotImage(imageId: string | null, rotation: 0 | 90 | 180 | 270): HTMLCanvasElement | null {
  const key = imageId ? `${imageId}|${rotation}` : null;
  const [loaded, setLoaded] = useState<{ key: string; canvas: HTMLCanvasElement } | null>(null);
  useEffect(() => {
    if (!imageId || !key) return;
    let cancelled = false;
    (async () => {
      const blob = await loadImage(imageId);
      if (!blob || cancelled) return;
      const bmp = await createImageBitmap(blob);
      if (!cancelled) setLoaded({ key, canvas: rotatedCanvas(bmp, rotation) });
      bmp.close();
    })().catch((err) => console.error("Cannot load lot image", err));
    return () => {
      cancelled = true;
    };
  }, [imageId, rotation, key]);
  return loaded && loaded.key === key ? loaded.canvas : null;
}

/** Cross-component handles for exporting the 2D plan and 3D view as images. */
export const exportRegistry: {
  plan: (() => string | null) | null;
  scene: (() => Promise<string | null>) | null;
} = { plan: null, scene: null };
