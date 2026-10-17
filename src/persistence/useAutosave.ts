"use client";

import { useEffect, useRef, useState } from "react";
import { useProjectStore } from "@/store/projectStore";
import { saveProject } from "./db";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

/** Debounced autosave of the open project to IndexedDB; also flushes on page hide. */
export function useAutosave(delay = 600): SaveStatus {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef(false);

  useEffect(() => {
    const flush = async () => {
      const p = useProjectStore.getState().project;
      if (!p || !pending.current) return;
      pending.current = false;
      setStatus("saving");
      try {
        await saveProject(p);
        setStatus("saved");
      } catch (err) {
        console.error("Autosave failed", err);
        setStatus("error");
      }
    };

    const unsub = useProjectStore.subscribe((s, prev) => {
      if (!s.project || s.project === prev.project || s.txBase) return;
      if (prev.project && prev.project.id !== s.project.id) return;
      if (!prev.project) return;
      pending.current = true;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, delay);
    });

    const onHide = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flush);
    return () => {
      unsub();
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flush);
      if (timer.current) clearTimeout(timer.current);
      void flush();
    };
  }, [delay]);

  return status;
}
