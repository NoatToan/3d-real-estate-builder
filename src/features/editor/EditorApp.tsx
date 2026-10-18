"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Box, Col, Row, TextMuted } from "@/components/ui/BasePrimitives";
import { Button } from "@/components/ui/Button";
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
import { Inspector } from "./Inspector";
import { SidePanels } from "./SidePanels";
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
        {view !== "finance" && (
          <aside aria-label="Thuộc tính và kiểm tra" className="w-80 shrink-0 overflow-y-auto border-l border-line bg-surface">
            <Inspector />
            <SidePanels issues={issues} />
          </aside>
        )}
      </Row>
      {lotWizardOpen && <LotWizard onClose={() => useEditorStore.getState().setLotWizardOpen(false)} />}
    </Col>
  );
}
