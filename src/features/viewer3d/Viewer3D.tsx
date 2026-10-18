"use client";

import { useEffect, useRef, useState } from "react";
import { Layers, Maximize2, ScanEye, Scissors, View } from "lucide-react";
import { Box, Col, Row, TextMuted } from "@/components/ui/BasePrimitives";
import { IconButton } from "@/components/ui/Button";
import { useProjectStore } from "@/store/projectStore";
import { useEditorStore } from "@/store/editorStore";
import { exportRegistry } from "@/features/plan/hooks";
import type { HouseScene, SceneInput } from "./sceneBuilder";

function readInput(): SceneInput | null {
  const project = useProjectStore.getState().project;
  if (!project) return null;
  const ed = useEditorStore.getState();
  return {
    project,
    activeFloorId: ed.activeFloorId,
    selectedIds: new Set(ed.selection?.ids ?? []),
    hiddenFloorIds: ed.viewer.hiddenFloorIds,
    explode: ed.viewer.explode,
    upToActive: ed.viewer.upToActive,
    roof: ed.viewer.roof,
    cutaway: ed.viewer.cutaway,
  };
}

export function Viewer3D() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<HouseScene | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cutaway = useEditorStore((s) => s.viewer.cutaway);
  const upToActive = useEditorStore((s) => s.viewer.upToActive);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;
    let raf = 0;
    const cleanups: (() => void)[] = [];

    void import("./sceneBuilder")
      .then(({ HouseScene }) => {
        if (disposed) return;
        let hs: HouseScene;
        try {
          hs = new HouseScene(canvas);
        } catch (err) {
          console.error(err);
          setError("Trình duyệt không hỗ trợ WebGL — không thể hiển thị 3D.");
          return;
        }
        sceneRef.current = hs;
        hs.onPick = (t) => {
          const ed = useEditorStore.getState();
          if (!t) return;
          if (ed.activeFloorId !== t.floorId) ed.setActiveFloor(t.floorId);
          ed.select({ floorId: t.floorId, ids: [t.id] });
        };
        hs.engine.onContextLostObservable.add(() => setError("Mất ngữ cảnh WebGL — hãy tải lại trang."));

        const push = () => {
          raf = 0;
          const input = readInput();
          if (input) {
            try {
              hs.update(input);
            } catch (err) {
              console.error("3D update failed", err);
            }
          }
        };
        const schedule = () => {
          if (!raf) raf = requestAnimationFrame(push);
        };
        push();
        hs.fit();

        cleanups.push(useProjectStore.subscribe((s, prev) => s.project !== prev.project && schedule()));
        cleanups.push(
          useEditorStore.subscribe((s, prev) => {
            if (s.fitRequest !== prev.fitRequest) hs.fit();
            if (s.selection !== prev.selection || s.viewer !== prev.viewer || s.activeFloorId !== prev.activeFloorId) schedule();
          }),
        );
        const ro = new ResizeObserver(() => hs.resize());
        ro.observe(canvas);
        cleanups.push(() => ro.disconnect());
        exportRegistry.scene = () => hs.screenshot();
        cleanups.push(() => {
          exportRegistry.scene = null;
        });
      })
      .catch((err) => {
        console.error(err);
        setError("Không tải được mô-đun 3D.");
      });

    return () => {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      cleanups.forEach((c) => c());
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
  }, []);

  if (error) {
    return (
      <Col className="h-full items-center justify-center p-6 text-center">
        <TextMuted as="p" className="text-sm">
          {error}
        </TextMuted>
      </Col>
    );
  }

  return (
    <Box className="absolute inset-0">
      <canvas ref={canvasRef} className="block h-full w-full touch-none outline-none focus-visible:shadow-focus" aria-label="Mô hình 3D của ngôi nhà" />
      <Row className="absolute right-2 top-2 gap-1 rounded-lg border border-line bg-surface/90 p-1 shadow-sm">
        <IconButton label="Vừa khung nhìn" onClick={() => sceneRef.current?.fit()}>
          <Maximize2 size={16} />
        </IconButton>
        <IconButton label="Nhìn từ trên xuống" onClick={() => sceneRef.current?.topView()}>
          <ScanEye size={16} />
        </IconButton>
        <IconButton label="Phối cảnh" onClick={() => sceneRef.current?.fit()}>
          <View size={16} />
        </IconButton>
        <IconButton label="Hạ tường để nhìn vào trong" active={cutaway} onClick={() => useEditorStore.getState().setViewer({ cutaway: !cutaway })}>
          <Scissors size={16} />
        </IconButton>
        <IconButton label="Chỉ hiện đến tầng đang chọn" active={upToActive} onClick={() => useEditorStore.getState().setViewer({ upToActive: !upToActive })}>
          <Layers size={16} />
        </IconButton>
      </Row>
      <TextMuted className="pointer-events-none absolute bottom-2 left-2 rounded bg-surface/80 px-2 py-0.5 text-xs">
        Kéo chuột trái: xoay · Chuột phải: cuộn · Lăn: phóng to · Nhấp: chọn
      </TextMuted>
    </Box>
  );
}
