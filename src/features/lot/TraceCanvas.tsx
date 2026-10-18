"use client";

import { useRef, useState } from "react";
import { Circle, Group, Image as KImage, Layer, Line, Rect, Stage, Text as KText } from "react-konva";
import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import { Box } from "@/components/ui/BasePrimitives";
import type { Vec2 } from "@/domain/types";
import type { OcrNumber } from "@/ocr/parse";
import { canvasColors as C } from "@/theme/tokens";
import { projectOnSegment } from "@/geometry/segment";
import { dist } from "@/geometry/vec";
import { useElementSize } from "@/features/plan/hooks";
import { flat } from "@/features/plan/PlanShapes";

export const vertexName = (i: number): string => (i < 26 ? String.fromCharCode(65 + i) : `P${i + 1}`);
export const edgeName = (i: number, n: number): string => `${vertexName(i)}${vertexName((i + 1) % n)}`;

export interface TraceCanvasProps {
  image: HTMLCanvasElement | null;
  /** Fallback drawing area (px) when there is no image. */
  points: Vec2[];
  onChange: (pts: Vec2[], commit: boolean) => void;
  numbers: OcrNumber[];
  assigned: ReadonlySet<string>;
  selectedEdge: number | null;
  onSelectEdge: (i: number | null) => void;
  onNumberClick: (n: OcrNumber) => void;
  regionMode: boolean;
  onRegion: (r: { left: number; top: number; width: number; height: number }) => void;
  lengths: (number | null)[];
}

export function TraceCanvas({ image, points, onChange, numbers, assigned, selectedEdge, onSelectEdge, onNumberClick, regionMode, onRegion, lengths }: TraceCanvasProps) {
  const ref = useRef<HTMLElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const size = useElementSize(ref);
  const [vp, setVp] = useState({ scale: 1, x: 0, y: 0 });
  const drag = useRef<{ kind: "vertex"; index: number } | { kind: "pan"; sx: number; sy: number; vx: number; vy: number } | { kind: "region"; start: Vec2 } | null>(null);
  const [region, setRegion] = useState<{ a: Vec2; b: Vec2 } | null>(null);
  const [hoverVertex, setHoverVertex] = useState<number | null>(null);

  const imgW = image?.width ?? 1000;
  const imgH = image?.height ?? 1000;

  // Re-fit when the container or image size changes (state adjusted during render).
  const fitKey = size.width && size.height ? `${size.width}x${size.height}|${imgW}x${imgH}` : "";
  const [fittedKey, setFittedKey] = useState("");
  if (fitKey && fitKey !== fittedKey) {
    setFittedKey(fitKey);
    const s = Math.min(size.width / imgW, size.height / imgH) * 0.95;
    setVp({ scale: s, x: (size.width - imgW * s) / 2, y: (size.height - imgH * s) / 2 });
  }

  const world = (): Vec2 | null => {
    const p = stageRef.current?.getPointerPosition();
    return p ? { x: (p.x - vp.x) / vp.scale, y: (p.y - vp.y) / vp.scale } : null;
  };
  const tol = 9 / vp.scale;

  const nearestEdge = (p: Vec2): number | null => {
    let best: { i: number; d: number } | null = null;
    for (let i = 0; i < points.length && points.length >= 2; i++) {
      const d = projectOnSegment(p, points[i], points[(i + 1) % points.length]).distance;
      if (d <= tol && (!best || d < best.d)) best = { i, d };
    }
    return best?.i ?? null;
  };

  const onDown = (e: KonvaEventObject<PointerEvent>) => {
    const p = world();
    if (!p) return;
    if (e.evt.button === 1 || e.evt.button === 2) {
      if (e.evt.button === 2) {
        const v = points.findIndex((q) => dist(q, p) <= tol);
        if (v >= 0) onChange(points.filter((_, i) => i !== v), true);
        return;
      }
      const sp = stageRef.current!.getPointerPosition()!;
      drag.current = { kind: "pan", sx: sp.x, sy: sp.y, vx: vp.x, vy: vp.y };
      return;
    }
    if (regionMode) {
      drag.current = { kind: "region", start: p };
      setRegion({ a: p, b: p });
      return;
    }
    const v = points.findIndex((q) => dist(q, p) <= tol);
    if (v >= 0) {
      if (e.evt.altKey) onChange(points.filter((_, i) => i !== v), true);
      else drag.current = { kind: "vertex", index: v };
      return;
    }
    const chip = numbers.find((n) => p.x >= n.bbox.x0 - 2 && p.x <= n.bbox.x1 + 2 && p.y >= n.bbox.y0 - 2 && p.y <= n.bbox.y1 + 2);
    if (chip) {
      onNumberClick(chip);
      return;
    }
    const edge = nearestEdge(p);
    if (edge != null) {
      if (e.evt.shiftKey) {
        const next = [...points];
        next.splice(edge + 1, 0, projectOnSegment(p, points[edge], points[(edge + 1) % points.length]).point);
        onChange(next, true);
      } else onSelectEdge(edge === selectedEdge ? null : edge);
      return;
    }
    if (p.x < -imgW * 0.1 || p.y < -imgH * 0.1 || p.x > imgW * 1.1 || p.y > imgH * 1.1) return;
    onChange([...points, p], true);
  };

  const onMove = () => {
    const p = world();
    if (!p) return;
    const d = drag.current;
    if (!d) {
      const v = points.findIndex((q) => dist(q, p) <= tol);
      setHoverVertex(v >= 0 ? v : null);
      return;
    }
    if (d.kind === "vertex") onChange(points.map((q, i) => (i === d.index ? p : q)), false);
    else if (d.kind === "pan") {
      const sp = stageRef.current!.getPointerPosition()!;
      setVp((v) => ({ ...v, x: d.vx + sp.x - d.sx, y: d.vy + sp.y - d.sy }));
    } else if (d.kind === "region") setRegion({ a: d.start, b: p });
  };

  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (d?.kind === "vertex") onChange(points, true);
    if (d?.kind === "region" && region) {
      const left = Math.max(0, Math.min(region.a.x, region.b.x));
      const top = Math.max(0, Math.min(region.a.y, region.b.y));
      const width = Math.min(imgW, Math.max(region.a.x, region.b.x)) - left;
      const height = Math.min(imgH, Math.max(region.a.y, region.b.y)) - top;
      setRegion(null);
      if (width > 10 && height > 10) onRegion({ left, top, width, height });
    }
  };

  const onWheel = (e: KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const p = stageRef.current?.getPointerPosition();
    if (!p) return;
    const next = Math.min(20, Math.max(0.05, vp.scale * Math.exp(-e.evt.deltaY * 0.0015)));
    const wx = (p.x - vp.x) / vp.scale;
    const wy = (p.y - vp.y) / vp.scale;
    setVp({ scale: next, x: p.x - wx * next, y: p.y - wy * next });
  };

  const fs = 13 / vp.scale;
  return (
    <Box ref={ref} className="touch-none-canvas relative h-full w-full overflow-hidden bg-surface-muted" style={{ cursor: regionMode ? "crosshair" : hoverVertex != null ? "move" : "copy" }}>
      {size.width > 0 && (
        <Stage
          ref={stageRef}
          width={size.width}
          height={size.height}
          scaleX={vp.scale}
          scaleY={vp.scale}
          x={vp.x}
          y={vp.y}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onWheel={onWheel}
          onContextMenu={(e) => e.evt.preventDefault()}
        >
          <Layer listening={false}>
            {image ? <KImage image={image} /> : <Rect width={imgW} height={imgH} fill={C.background} stroke={C.gridMajor} strokeWidth={1} strokeScaleEnabled={false} />}
          </Layer>
          <Layer listening={false}>
            {numbers.map((n) => (
              <Group key={n.id}>
                <Rect
                  x={n.bbox.x0 - 2}
                  y={n.bbox.y0 - 2}
                  width={n.bbox.x1 - n.bbox.x0 + 4}
                  height={n.bbox.y1 - n.bbox.y0 + 4}
                  stroke={assigned.has(n.id) ? C.ocrChipAssigned : C.ocrChip}
                  strokeWidth={2}
                  strokeScaleEnabled={false}
                  cornerRadius={2 / vp.scale}
                />
                <KText x={n.bbox.x0} y={n.bbox.y0 - fs * 1.2} text={String(n.value).replace(".", ",")} fontSize={fs} fontStyle="bold" fill={assigned.has(n.id) ? C.ocrChipAssigned : C.ocrChip} />
              </Group>
            ))}
            {points.length >= 2 &&
              points.map((p, i) => {
                const q = points[(i + 1) % points.length];
                if (points.length === 2 && i === 1) return null;
                const sel = selectedEdge === i;
                return (
                  <Group key={`e${i}`}>
                    <Line points={flat([p, q])} stroke={sel ? C.selection : C.traceStroke} strokeWidth={sel ? 4 : 2.5} strokeScaleEnabled={false} />
                    <KText
                      x={(p.x + q.x) / 2}
                      y={(p.y + q.y) / 2}
                      text={`${edgeName(i, points.length)}${lengths[i] != null ? ` = ${String(lengths[i]).replace(".", ",")} m` : ""}`}
                      fontSize={fs}
                      fontStyle="bold"
                      fill={sel ? C.selection : C.traceStroke}
                      offsetY={fs * 1.3}
                    />
                  </Group>
                );
              })}
            {points.length >= 3 && <Line points={flat(points)} closed fill={C.traceFill} />}
            {points.map((p, i) => (
              <Group key={`v${i}`}>
                <Circle x={p.x} y={p.y} radius={(hoverVertex === i ? 7 : 5) / vp.scale} fill={C.handle} stroke={C.traceStroke} strokeWidth={2} strokeScaleEnabled={false} />
                <KText x={p.x + 7 / vp.scale} y={p.y + 4 / vp.scale} text={vertexName(i)} fontSize={fs} fontStyle="bold" fill={C.text} />
              </Group>
            ))}
            {region && (
              <Rect
                x={Math.min(region.a.x, region.b.x)}
                y={Math.min(region.a.y, region.b.y)}
                width={Math.abs(region.b.x - region.a.x)}
                height={Math.abs(region.b.y - region.a.y)}
                stroke={C.selection}
                dash={[6, 4]}
                strokeWidth={1.5}
                strokeScaleEnabled={false}
              />
            )}
          </Layer>
        </Stage>
      )}
    </Box>
  );
}
