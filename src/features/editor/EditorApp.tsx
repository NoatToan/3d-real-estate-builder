"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { PanelLeftOpen, SlidersHorizontal } from "lucide-react";
import { Box, Col, TextMuted } from "@/components/ui/BasePrimitives";
import { Button, IconButton } from "@/components/ui/Button";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { useProjectStore } from "@/store/projectStore";
import { useEditorStore } from "@/store/editorStore";
import { loadProject } from "@/persistence/db";
import { useAutosave } from "@/persistence/useAutosave";
import { validateProject } from "@/domain/validation";
import { PlanCanvas } from "@/features/plan/PlanCanvas";
import { EditorHeader } from "./EditorHeader";
import { Toolbar } from "./Toolbar";
import { FloorBar } from "./FloorBar";
import { ControlPanel } from "./ControlPanel";
import { useIsMobile, MOBILE_QUERY } from "./useIsMobile";
import { bindUiPrefs } from "@/store/uiPrefs";
import { FirstRunTour } from "@/features/guide/FirstRunTour";
import { FullScreenMessage } from "./FullScreenMessage";
import { useShortcuts } from "./useShortcuts";

const Viewer3D = dynamic(() => import("@/features/viewer3d/Viewer3D").then((m) => m.Viewer3D), {
  ssr: false,
  loading: () => <PaneMessage>Đang tải 3D…</PaneMessage>,
});

const FinanceView = dynamic(() => import("@/features/finance/FinanceView").then((m) => m.FinanceView), {
  ssr: false,
  loading: () => <PaneMessage>Đang tải tài chính…</PaneMessage>,
});

const RoomPlacerDialog = dynamic(() => import("@/features/roomplacer/RoomPlacerDialog").then((m) => m.RoomPlacerDialog), { ssr: false });
const QuickFloorDialog = dynamic(() => import("@/features/quickfloor/QuickFloorDialog").then((m) => m.QuickFloorDialog), { ssr: false });
const GuideDialog = dynamic(() => import("@/features/guide/GuideDialog").then((m) => m.GuideDialog), { ssr: false });

const LotWizard = dynamic(() => import("@/features/lot/LotWizard").then((m) => m.LotWizard), { ssr: false });

function PaneMessage({ children }: { children: React.ReactNode }) {
  return (
    <Col className="h-full items-center justify-center p-4 text-center">
      <TextMuted className="text-sm">{children}</TextMuted>
    </Col>
  );
}

function PaneError({ title, error, reset }: { title: string; error: Error; reset: () => void }) {
  return (
    <Col className="h-full items-center justify-center gap-3 p-4 text-center">
      <TextMuted as="p" className="text-sm">
        {title}: {error.message}
      </TextMuted>
      <Button size="sm" onClick={reset}>
        Thử lại
      </Button>
    </Col>
  );
}

type LoadState = "loading" | "ready" | "missing" | "error";

export function EditorApp({ projectId, startWithLot }: { projectId: string; startWithLot: boolean }) {
  const [state, setState] = useState<LoadState>("loading");
  const project = useProjectStore((s) => s.project);
  const view = useEditorStore((s) => s.view);
  const lotWizardOpen = useEditorStore((s) => s.lotWizardOpen);
  const quickFloorOpen = useEditorStore((s) => s.quickFloorOpen);
  const roomPlacerOpen = useEditorStore((s) => s.roomPlacerOpen);
  const guideOpen = useEditorStore((s) => s.guideOpen);
  const panelOpen = useEditorStore((s) => s.panelOpen);
  const mobile = useIsMobile();
  const setPanelOpen = useEditorStore((s) => s.setPanelOpen);
  const saveStatus = useAutosave();
  useShortcuts(state === "ready");

  useEffect(() => {
    let cancelled = false;
    let unbindPrefs: (() => void) | null = null;
    loadProject(projectId)
      .then((p) => {
        if (cancelled) return;
        if (!p) return setState("missing");
        useEditorStore.getState().reset();
        unbindPrefs?.();
        unbindPrefs = bindUiPrefs();
        // On a phone the panel would cover most of the plan: start with it closed.
        if (window.matchMedia(MOBILE_QUERY).matches) useEditorStore.getState().setPanelOpen(false);
        useProjectStore.getState().load(p);
        useEditorStore.getState().setActiveFloor(p.floors[0].id);
        // Nothing to look at in 3D yet on an empty project: start on the plan, 3D joins once walls exist.
        useEditorStore.getState().setView(p.floors.some((f) => f.walls.length) ? "split" : "2d");
        if (startWithLot) useEditorStore.getState().setLotWizardOpen(true);
        setState("ready");
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
      unbindPrefs?.();
      useProjectStore.getState().close();
    };
  }, [projectId, startWithLot]);

  useEffect(
    () =>
      useProjectStore.subscribe((st, prev) => {
        // Undo/redo, deletes and regenerated rooms can remove what the editor points at: keep the panel in step.
        if (st.project !== prev.project) useEditorStore.getState().syncWithProject(st.project);
        const had = prev.project?.floors.some((f) => f.walls.length);
        const has = st.project?.floors.some((f) => f.walls.length);
        if (prev.project && !had && has && useEditorStore.getState().view === "2d") useEditorStore.getState().setView("split");
      }),
    [],
  );

  useEffect(() => {
    if (project) document.title = `${project.name} · Real Estate Builder`;
  }, [project?.name, project]);

  const deferred = useDeferredValue(project);
  const issues = useMemo(() => (deferred ? validateProject(deferred) : []), [deferred]);

  if (state === "loading") return <FullScreenMessage>Đang mở dự án…</FullScreenMessage>;
  if (state !== "ready" || !project) {
    return (
      <FullScreenMessage
        action={
          <Link href="/" className="text-sm font-medium text-brand-600 hover:underline">
            Về danh sách dự án
          </Link>
        }
      >
        {state === "missing" ? "Không tìm thấy dự án trong trình duyệt này." : "Không mở được dự án (dữ liệu có thể bị hỏng)."}
      </FullScreenMessage>
    );
  }

  return (
    <Col className="h-screen overflow-hidden bg-canvas">
      <EditorHeader saveStatus={saveStatus} />
      <Box className={`flex min-h-0 flex-1 ${mobile ? "flex-col" : "flex-row"}`}>
        {view === "finance" ? (
          <Box className="relative min-w-0 flex-1">
            <ErrorBoundary fallback={(e, r) => <PaneError title="Lỗi tài chính" error={e} reset={r} />}>
              <FinanceView />
            </ErrorBoundary>
          </Box>
        ) : (
          <>
            {!mobile && <Toolbar />}
            {/* Properties sit right next to the tools, so the eye and mouse stay on the left. */}
            {!mobile &&
              (panelOpen ? (
                <ControlPanel issues={issues} onCollapse={() => setPanelOpen(false)} />
              ) : (
                <Box className="shrink-0 border-r border-line bg-surface p-1">
                  <IconButton label="Mở bảng điều khiển" onClick={() => setPanelOpen(true)}>
                    <PanelLeftOpen size={16} />
                  </IconButton>
                </Box>
              ))}
            <Col className="relative min-h-0 min-w-0 flex-1">
              <FloorBar />
              <Box className={`flex min-h-0 flex-1 ${mobile ? "flex-col" : "flex-row"}`}>
                {view !== "3d" && (
                  <Box className="relative min-h-0 min-w-0 flex-1">
                    <ErrorBoundary fallback={(e, r) => <PaneError title="Lỗi mặt bằng 2D" error={e} reset={r} />}>
                      <PlanCanvas issues={issues} />
                    </ErrorBoundary>
                  </Box>
                )}
                {view !== "2d" && (
                  <Box className={`relative min-h-0 min-w-0 flex-1 ${view === "split" ? (mobile ? "border-t border-line" : "border-l border-line") : ""}`}>
                    <ErrorBoundary fallback={(e, r) => <PaneError title="Lỗi xem 3D" error={e} reset={r} />}>
                      <Viewer3D />
                    </ErrorBoundary>
                  </Box>
                )}
              </Box>
              {/* Phones: the control panel is a bottom sheet over the drawing. */}
              {mobile &&
                (panelOpen ? (
                  <Box className="absolute inset-x-0 bottom-0 z-30 h-[62%] overflow-hidden rounded-t-2xl border-t border-line shadow-2xl">
                    <ControlPanel sheet issues={issues} onCollapse={() => setPanelOpen(false)} />
                  </Box>
                ) : (
                  <Button size="sm" variant="primary" className="absolute bottom-3 left-3 z-30 shadow-lg" icon={<SlidersHorizontal size={16} />} onClick={() => setPanelOpen(true)}>
                    Bảng điều khiển
                  </Button>
                ))}
            </Col>
            {mobile && <Toolbar />}
          </>
        )}
      </Box>
      {lotWizardOpen && <LotWizard onClose={() => useEditorStore.getState().setLotWizardOpen(false)} />}
      {quickFloorOpen && <QuickFloorDialog onClose={() => useEditorStore.getState().setQuickFloorOpen(false)} />}
      {roomPlacerOpen && <RoomPlacerDialog onClose={() => useEditorStore.getState().setRoomPlacerOpen(false)} />}
      {!lotWizardOpen && !quickFloorOpen && !roomPlacerOpen && !guideOpen && view !== "finance" && <FirstRunTour />}
      {guideOpen && <GuideDialog onClose={() => useEditorStore.getState().setGuideOpen(false)} />}
    </Col>
  );
}
