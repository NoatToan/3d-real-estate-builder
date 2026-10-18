"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { PanelLeftOpen } from "lucide-react";
import { Box, Col, Row, TextMuted } from "@/components/ui/BasePrimitives";
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
  const [panelOpen, setPanelOpen] = useState(true);
  const saveStatus = useAutosave();
  useShortcuts(state === "ready");

  useEffect(() => {
    let cancelled = false;
    loadProject(projectId)
      .then((p) => {
        if (cancelled) return;
        if (!p) return setState("missing");
        useEditorStore.getState().reset();
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
      useProjectStore.getState().close();
    };
  }, [projectId, startWithLot]);

  useEffect(
    () =>
      useProjectStore.subscribe((st, prev) => {
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
      <Row className="min-h-0 flex-1">
        {view === "finance" ? (
          <Box className="relative min-w-0 flex-1">
            <ErrorBoundary fallback={(e, r) => <PaneError title="Lỗi tài chính" error={e} reset={r} />}>
              <FinanceView />
            </ErrorBoundary>
          </Box>
        ) : (
          <>
            <Toolbar />
            {/* Properties sit right next to the tools, so the eye and mouse stay on the left. */}
            {panelOpen ? (
              <ControlPanel issues={issues} onCollapse={() => setPanelOpen(false)} />
            ) : (
              <Box className="shrink-0 border-r border-line bg-surface p-1">
                <IconButton label="Mở bảng điều khiển" onClick={() => setPanelOpen(true)}>
                  <PanelLeftOpen size={16} />
                </IconButton>
              </Box>
            )}
            <Col className="min-w-0 flex-1">
              <FloorBar />
              <Row className="min-h-0 flex-1">
                {view !== "3d" && (
                  <Box className="relative min-w-0 flex-1">
                    <ErrorBoundary fallback={(e, r) => <PaneError title="Lỗi mặt bằng 2D" error={e} reset={r} />}>
                      <PlanCanvas issues={issues} />
                    </ErrorBoundary>
                  </Box>
                )}
                {view !== "2d" && (
                  <Box className={`relative min-w-0 flex-1 ${view === "split" ? "border-l border-line" : ""}`}>
                    <ErrorBoundary fallback={(e, r) => <PaneError title="Lỗi xem 3D" error={e} reset={r} />}>
                      <Viewer3D />
                    </ErrorBoundary>
                  </Box>
                )}
              </Row>
            </Col>
          </>
        )}
      </Row>
      {lotWizardOpen && <LotWizard onClose={() => useEditorStore.getState().setLotWizardOpen(false)} />}
      {quickFloorOpen && <QuickFloorDialog onClose={() => useEditorStore.getState().setQuickFloorOpen(false)} />}
      {roomPlacerOpen && <RoomPlacerDialog onClose={() => useEditorStore.getState().setRoomPlacerOpen(false)} />}
      {guideOpen && <GuideDialog onClose={() => useEditorStore.getState().setGuideOpen(false)} />}
    </Col>
  );
}
