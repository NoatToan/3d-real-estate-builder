"use client";

import { useEffect, useRef, useState } from "react";
import { Layers, Maximize2, ScanEye, Scissors, View } from "lucide-react";
import { Box, Col, Row, TextMuted } from "@/components/ui/BasePrimitives";
import { IconButton } from "@/components/ui/Button";
import { useProjectStore } from "@/store/projectStore";
import { useEditorStore } from "@/store/editorStore";
import { exportRegistry } from "@/features/plan/hooks";
import type { HouseScene, SceneInput } from "./sceneBuilder";
import { ObjectActions, type ActionAnchor } from "@/features/editor/ObjectActions";
import { entityOutline, findEntity } from "@/domain/selection";

/** Grid (m) furniture and stairs snap to while dragged in 3D. */
const DRAG_SNAP = 0.05;

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
  const [actions, setActions] = useState<{ anchor: ActionAnchor; width: number; height: number } | null>(null);
  const selFloor = useProjectStore((s) => {
    const fid = useEditorStore.getState().selection?.floorId;
    return fid ? s.project?.floors.find((f) => f.id === fid) : undefined;
  });
  useEditorStore((s) => s.selection);
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
        // Drag furniture / stairs in 3D: one undo step per drag, the 2D plan follows the same store.
        let origin: { x: number; y: number } | null = null;
        hs.onDrag = {
          start: (t) => {
            const f = useProjectStore.getState().project?.floors.find((x) => x.id === t.floorId);
            const item = t.kind === "stair" ? f?.stairs.find((x) => x.id === t.id) : f?.furniture.find((x) => x.id === t.id);
            if (!item) return false;
            origin = { x: item.x, y: item.y };
            const ed = useEditorStore.getState();
            if (ed.activeFloorId !== t.floorId) ed.setActiveFloor(t.floorId);
            ed.select({ floorId: t.floorId, ids: [t.id] });
            useProjectStore.getState().begin();
            return true;
          },
          move: (t, dx, dy) => {
            if (!origin) return;
            const snap = (v: number) => Math.round(v / DRAG_SNAP) * DRAG_SNAP;
            const at = { x: snap(origin.x + dx), y: snap(origin.y + dy) };
            const ps = useProjectStore.getState();
            if (t.kind === "stair") ps.updateStair(t.floorId, t.id, at);
            else ps.updateFurniture(t.floorId, t.id, at);
          },
          end: () => {
            origin = null;
            useProjectStore.getState().commit();
          },
        };
        hs.engine.onContextLostObservable.add(() => setError("Mất ngữ cảnh WebGL — hãy tải lại trang."));

        // Screen box of the selection, so the floating actions bar sits next to it in 3D.
        let araf = 0;
        const placeActions = () => {
          araf = 0;
          const sel = useEditorStore.getState().selection;
          const floor = sel && useProjectStore.getState().project?.floors.find((f) => f.id === sel.floorId);
          if (!sel || !floor || useEditorStore.getState().viewer.hiddenFloorIds.includes(floor.id)) return setActions(null);
          const pts: { x: number; y: number }[] = [];
          for (const id of sel.ids) {
            const e = findEntity(floor, id);
            if (!e) continue;
            const o = entityOutline(floor, e);
            for (const p of o.points) pts.push(hs.toScreen(floor.id, p, 0), hs.toScreen(floor.id, p, o.height));
          }
          if (!pts.length) return setActions(null);
          const xs = pts.map((p) => p.x);
          const ys = pts.map((p) => p.y);
          setActions({ anchor: { x: (Math.min(...xs) + Math.max(...xs)) / 2, top: Math.min(...ys), bottom: Math.max(...ys) }, width: canvas.clientWidth, height: canvas.clientHeight });
        };
        const scheduleActions = () => {
          if (!araf) araf = requestAnimationFrame(placeActions);
        };
        hs.camera.onViewMatrixChangedObservable.add(scheduleActions);
        cleanups.push(() => cancelAnimationFrame(araf));

        const push = () => {
          raf = 0;
          scheduleActions();
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
        // Automated browsers only: lets the e2e tour find a piece of furniture on screen to drag it.
        if (navigator.webdriver) {
          (window as unknown as { __reb3d?: unknown }).__reb3d = {
            furniture: (kind: string) => {
              const p = useProjectStore.getState().project;
              const floorId = useEditorStore.getState().activeFloorId;
              const f = p?.floors.find((x) => x.id === floorId)?.furniture.find((x) => x.kind === kind);
              if (!f || !floorId) return null;
              hs.scene.render();
              return { id: f.id, x: f.x, y: f.y, rotation: f.rotation, width: f.width, screen: hs.toScreen(floorId, f, f.height * 0.8) };
            },
          };
          cleanups.push(() => delete (window as unknown as { __reb3d?: unknown }).__reb3d);
        }
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
      {selFloor && actions && <ObjectActions floor={selFloor} anchor={actions.anchor} bounds={actions} />}
      <TextMuted className="pointer-events-none absolute bottom-2 left-2 rounded bg-surface/80 px-2 py-0.5 text-xs">
        Kéo nền: xoay · Kéo nội thất / cầu thang: di chuyển · Chuột phải: cuộn · Lăn: phóng to · Nhấp: chọn
      </TextMuted>
    </Box>
  );
}
