"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Circle, Image as KImage, Layer, Line, Rect, Stage } from "react-konva";
import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import { Box, Row, Text, TextMuted } from "@/components/ui/BasePrimitives";
import { useProjectStore } from "@/store/projectStore";
import { useEditorStore } from "@/store/editorStore";
import type { Floor, Vec2, Wall } from "@/domain/types";
import type { Issue } from "@/domain/validation";
import { createOpening, createStair, createWall, newId } from "@/domain/factory";
import { createFurniture } from "@/domain/furniture";
import { buildablePolygon } from "@/domain/stats";
import { roadCutGeometry } from "@/domain/roadCut";
import { fmtLength } from "@/domain/labels";
import { canvasColors as C } from "@/theme/tokens";
import { bbox } from "@/geometry/polygon";
import { insetPolygon } from "@/geometry/offset";
import { projectOnSegment } from "@/geometry/segment";
import { snapPoint, type SnapContext, type SnapResult } from "@/geometry/snapping";
import { hitTest, nearestWall } from "@/geometry/hitTest";
import { pointAlongWall, wallLength } from "@/geometry/openings";
import { add, dist, normalize, round, samePoint, scale as vscale, sub } from "@/geometry/vec";
import { isTypingTarget } from "@/features/editor/useShortcuts";
import { ObjectActions } from "@/features/editor/ObjectActions";
import { EmptyFloorStart } from "./EmptyFloorStart";
import { entityOutline, findEntity } from "@/domain/selection";
import { DIRECTION_LABELS, sectorWedges, STAR_INFO } from "@/domain/fengShui";
import { exportRegistry, activeFloorOf, useElementSize, useLotImage } from "./hooks";
import {
  flat,
  FurnitureGlyph,
  FurnitureShape,
  GridShape,
  Handle,
  Label,
  LotShape,
  openingCover,
  RoomsShape,
  StairGlyph,
  StairsShape,
  VoidsShape,
  WallDimensions,
  WallsShape,
  type Viewport,
} from "./PlanShapes";

type Drag =
  | { kind: "pan"; startScreen: Vec2; startVp: Viewport }
  | { kind: "endpoint"; current: Vec2; began: boolean }
  | { kind: "wall"; startWorld: Vec2; a0: Vec2; b0: Vec2; curA: Vec2; curB: Vec2; began: boolean }
  | { kind: "stair"; id: string; startWorld: Vec2; x0: number; y0: number; began: boolean }
  | { kind: "furniture"; id: string; startWorld: Vec2; x0: number; y0: number; began: boolean }
  | { kind: "opening"; id: string; wallId: string; began: boolean }
  | { kind: "roomVertex"; roomId: string; index: number; polygon: Vec2[]; began: boolean };

const EMPTY: ReadonlySet<string> = new Set();
const SNAP_LABEL: Record<string, string> = {
  endpoint: "Đầu vách",
  midpoint: "Trung điểm",
  wall: "Trên vách",
  "lot-vertex": "Góc thửa",
  "lot-edge": "Cạnh thửa",
  angle: "Góc",
  grid: "Lưới",
  none: "",
};

/** True if the segment a-b is already fully covered by collinear walls. */
function edgeCovered(a: Vec2, b: Vec2, walls: readonly Wall[]): boolean {
  const L = dist(a, b);
  if (L < 1e-6) return true;
  const ab = sub(b, a);
  /** Signed parameter along a-b and perpendicular distance to the a-b line. */
  const along = (p: Vec2) => {
    const ap = sub(p, a);
    return { t: (ap.x * ab.x + ap.y * ab.y) / (L * L), off: Math.abs(ab.x * ap.y - ab.y * ap.x) / L };
  };
  const spans: [number, number][] = [];
  for (const w of walls) {
    const pa = along(w.a);
    const pb = along(w.b);
    if (pa.off > 0.01 || pb.off > 0.01) continue;
    spans.push([Math.max(0, Math.min(pa.t, pb.t)), Math.min(1, Math.max(pa.t, pb.t))]);
  }
  spans.sort((p, q) => p[0] - q[0]);
  let reach = 0;
  for (const [s, e] of spans) {
    if (s > reach + 0.01) return false;
    reach = Math.max(reach, e);
  }
  return reach >= 0.99;
}

export function PlanCanvas({ issues }: { issues: Issue[] }) {
  const containerRef = useRef<HTMLElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const size = useElementSize(containerRef);

  const project = useProjectStore((s) => s.project)!;
  const activeId = useEditorStore((s) => s.activeFloorId);
  const tool = useEditorStore((s) => s.tool);
  const selection = useEditorStore((s) => s.selection);
  const snapCfg = useEditorStore((s) => s.snap);
  const show = useEditorStore((s) => s.show);
  const stairType = useEditorStore((s) => s.stairType);
  const furnitureKind = useEditorStore((s) => s.furnitureKind);
  const wallThickness = useEditorStore((s) => s.wallThickness);
  const roomCreatesWalls = useEditorStore((s) => s.roomCreatesWalls);
  const fitRequest = useEditorStore((s) => s.fitRequest);

  const { floor, index } = activeFloorOf(project, activeId);
  const below: Floor | null = index > 0 ? project.floors[index - 1] : null;
  const lotPoly = project.lot.polygon;
  const buildable = useMemo(() => buildablePolygon(project), [project]);
  const roadCut = useMemo(() => roadCutGeometry(project), [project]);

  const [vp, setVp] = useState<Viewport>({ scale: 30, x: 40, y: 40 });
  const [cursor, setCursor] = useState<SnapResult | null>(null);
  const [rawCursor, setRawCursor] = useState<Vec2 | null>(null);
  const [draft, setDraft] = useState<Vec2[]>([]);
  const [measure, setMeasure] = useState<{ a: Vec2; b?: Vec2 } | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [stairRot, setStairRot] = useState(0);
  const [furnitureRot, setFurnitureRot] = useState(0);
  const [lengthText, setLengthText] = useState<string | null>(null);
  const [spaceDown, setSpaceDown] = useState(false);
  const drag = useRef<Drag | null>(null);
  const shiftRef = useRef(false);
  const altRef = useRef(false);

  const lotImage = useLotImage(show.lotImage ? project.lot.imageId : null, project.lot.trace?.rotation ?? 0);

  const selectedIds = useMemo(() => (selection && floor && selection.floorId === floor.id ? new Set(selection.ids) : EMPTY), [selection, floor]);
  const errorIds = useMemo(() => {
    const s = new Set<string>();
    for (const i of issues) if (i.level === "error" && i.floorId === floor?.id) i.entityIds?.forEach((id) => s.add(id));
    return s;
  }, [issues, floor?.id]);

  // Reset transient state when switching floor or tool (state adjusted during render).
  const resetKey = `${tool}|${floor?.id ?? ""}`;
  const [prevResetKey, setPrevResetKey] = useState(resetKey);
  if (prevResetKey !== resetKey) {
    setPrevResetKey(resetKey);
    setDraft([]);
    setMeasure(null);
    setLengthText(null);
    setHoverId(null);
  }

  const computeFit = (): Viewport | null => {
    if (!size.width || !size.height) return null;
    const pts: Vec2[] = [...lotPoly];
    for (const f of project.floors) for (const w of f.walls) pts.push(w.a, w.b);
    if (!pts.length) return null;
    const b = bbox(pts);
    const bw = Math.max(1, b.maxX - b.minX);
    const bh = Math.max(1, b.maxY - b.minY);
    const s = Math.min(size.width / bw, size.height / bh) * 0.82;
    return { scale: s, x: size.width / 2 - ((b.minX + b.maxX) / 2) * s, y: size.height / 2 - ((b.minY + b.maxY) / 2) * s };
  };

  // Fit once the container has a size, and whenever a fit is requested.
  const fitKey = size.width > 0 ? fitRequest : -1;
  const [handledFitKey, setHandledFitKey] = useState(-1);
  if (fitKey !== -1 && fitKey !== handledFitKey) {
    setHandledFitKey(fitKey);
    const next = computeFit();
    if (next) setVp(next);
  }

  useEffect(() => {
    exportRegistry.plan = () => stageRef.current?.toDataURL({ pixelRatio: 2 }) ?? null;
    return () => {
      exportRegistry.plan = null;
    };
  }, []);

  const toWorld = useCallback((sx: number, sy: number): Vec2 => ({ x: (sx - vp.x) / vp.scale, y: (sy - vp.y) / vp.scale }), [vp]);

  const thickness = wallThickness ?? project.defaults.wallThickness;

  const snapCtx = useCallback(
    (anchor: Vec2 | null, ignore?: Set<string>, extra?: Vec2[]): SnapContext => ({
      walls: floor?.walls ?? [],
      lot: lotPoly,
      extraPoints: extra,
      grid: snapCfg.grid,
      tolerance: 10 / vp.scale,
      anchor,
      angleStep: snapCfg.angleStep,
      forceAngle: shiftRef.current,
      ignoreWallIds: ignore,
      enabled: snapCfg.enabled && !altRef.current,
    }),
    [floor?.walls, lotPoly, snapCfg, vp.scale],
  );

  const gridDelta = (d: Vec2): Vec2 => (snapCfg.enabled && !altRef.current ? { x: round(d.x, snapCfg.grid), y: round(d.y, snapCfg.grid) } : d);

  const store = useProjectStore.getState;
  const editor = useEditorStore.getState;

  // ---- drafting helpers -------------------------------------------------------------
  const finishRoom = useCallback(
    (pts: Vec2[]) => {
      if (!floor || pts.length < 3) return;
      const net = roomCreatesWalls ? insetPolygon(pts, thickness / 2) : null;
      const roomId = newId("r_");
      const room = { id: roomId, polygon: pts, netPolygon: net, name: `Phòng ${floor.rooms.length + 1}`, type: "other" as const, source: "manual" as const };
      const s = store();
      s.begin();
      s.addRoom(floor.id, room);
      if (roomCreatesWalls) {
        const walls = pts
          .map((a, i) => [a, pts[(i + 1) % pts.length]] as const)
          .filter(([a, b]) => !edgeCovered(a, b, floor.walls))
          .map(([a, b]) => createWall(a, b, thickness));
        s.addWalls(floor.id, walls);
      }
      s.commit();
      editor().select({ floorId: floor.id, ids: [roomId] });
      setDraft([]);
    },
    [floor, roomCreatesWalls, thickness, store, editor],
  );

  const placeWallTo = useCallback(
    (p: Vec2) => {
      if (!floor) return;
      if (!draft.length) {
        setDraft([p]);
        return;
      }
      const last = draft[draft.length - 1];
      if (dist(p, last) < 0.02) return;
      store().addWalls(floor.id, [createWall(last, p, thickness)]);
      if (draft.length >= 2 && samePoint(p, draft[0], 1e-4)) setDraft([]);
      else setDraft([...draft, p]);
    },
    [floor, draft, thickness, store],
  );

  const applyTypedLength = useCallback(() => {
    if (lengthText == null || !draft.length) return;
    const L = Number(lengthText.replace(",", "."));
    setLengthText(null);
    if (!Number.isFinite(L) || L <= 0) return;
    const last = draft[draft.length - 1];
    const target = cursor?.point ?? rawCursor;
    const dir = target && dist(target, last) > 1e-6 ? normalize(sub(target, last)) : { x: 1, y: 0 };
    const p = add(last, vscale(dir, L));
    if (tool === "wall") placeWallTo(p);
    else setDraft([...draft, p]);
  }, [lengthText, draft, cursor, rawCursor, tool, placeWallTo]);

  // ---- keyboard ---------------------------------------------------------------------
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      shiftRef.current = e.shiftKey;
      altRef.current = e.altKey;
      if (isTypingTarget(e.target) || useEditorStore.getState().lotWizardOpen) return;
      const drafting = draft.length > 0 && (tool === "wall" || tool === "room");
      if (e.key === " " && !spaceDown) {
        setSpaceDown(true);
        e.preventDefault();
        return;
      }
      if (drafting && (/^[0-9]$/.test(e.key) || e.key === "." || e.key === ",")) {
        e.preventDefault();
        setLengthText((t) => (t ?? "") + e.key);
        return;
      }
      if (e.key === "Escape") {
        if (lengthText != null) setLengthText(null);
        else if (drag.current && drag.current.kind !== "pan") {
          store().cancel();
          drag.current = null;
        } else if (draft.length) setDraft([]);
        else if (measure) setMeasure(null);
        else if (useEditorStore.getState().selection) editor().select(null);
        else editor().setTool("select");
        return;
      }
      if (e.key === "Enter") {
        if (lengthText != null) applyTypedLength();
        else if (tool === "room" && draft.length >= 3) finishRoom(draft);
        else if (draft.length) setDraft([]);
        return;
      }
      if (e.key === "Backspace" && (drafting || lengthText != null)) {
        e.preventDefault();
        if (lengthText != null) setLengthText(lengthText.length > 1 ? lengthText.slice(0, -1) : null);
        else setDraft(draft.slice(0, -1));
        return;
      }
      if (e.key.toLowerCase() === "r" && !e.ctrlKey && !e.metaKey) {
        if (tool === "stair") setStairRot((r) => (r + 90) % 360);
        else if (tool === "furniture") setFurnitureRot((r) => (r + 90) % 360);
        else if (floor && selectedIds.size === 1) {
          const s = floor.stairs.find((x) => selectedIds.has(x.id));
          if (s) store().updateStair(floor.id, s.id, { rotation: s.rotation + 90 });
          const fu = floor.furniture.find((x) => selectedIds.has(x.id));
          if (fu) store().updateFurniture(floor.id, fu.id, { rotation: fu.rotation + 90 });
        }
        return;
      }
      if (e.key.startsWith("Arrow") && floor && selectedIds.size && !drafting) {
        e.preventDefault();
        const step = e.shiftKey ? 0.5 : snapCfg.grid || 0.05;
        const d = { x: e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0, y: e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0 };
        const s = store();
        s.begin();
        for (const st of floor.stairs) if (selectedIds.has(st.id)) s.updateStair(floor.id, st.id, { x: st.x + d.x, y: st.y + d.y });
        for (const fu of floor.furniture) if (selectedIds.has(fu.id)) s.updateFurniture(floor.id, fu.id, { x: fu.x + d.x, y: fu.y + d.y });
        for (const w of floor.walls) {
          if (!selectedIds.has(w.id)) continue;
          const cur = s.project!.floors[index].walls.find((x) => x.id === w.id);
          if (!cur) continue;
          s.moveWallEndpoint(floor.id, cur.a, add(cur.a, d));
          const cur2 = s.project!.floors[index].walls.find((x) => x.id === w.id);
          if (cur2) s.moveWallEndpoint(floor.id, cur2.b, add(cur2.b, d));
        }
        s.commit();
      }
    };
    const onUp = (e: KeyboardEvent) => {
      shiftRef.current = e.shiftKey;
      altRef.current = e.altKey;
      if (e.key === " ") setSpaceDown(false);
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, [draft, tool, lengthText, measure, floor, index, selectedIds, snapCfg.grid, spaceDown, applyTypedLength, finishRoom, store, editor]);

  // ---- pointer ----------------------------------------------------------------------
  const pointer = (): { screen: Vec2; world: Vec2 } | null => {
    const p = stageRef.current?.getPointerPosition();
    return p ? { screen: p, world: toWorld(p.x, p.y) } : null;
  };

  const onPointerDown = (e: KonvaEventObject<PointerEvent>) => {
    if (!floor) return;
    const pt = pointer();
    if (!pt) return;
    shiftRef.current = e.evt.shiftKey;
    altRef.current = e.evt.altKey;
    const btn = e.evt.button;
    if (btn === 2) return;
    if (btn === 1 || tool === "pan" || spaceDown) {
      drag.current = { kind: "pan", startScreen: pt.screen, startVp: vp };
      return;
    }
    const tol = 8 / vp.scale;
    const anchor = draft.length ? draft[draft.length - 1] : null;

    switch (tool) {
      case "wall": {
        placeWallTo(snapPoint(pt.world, snapCtx(anchor, undefined, draft)).point);
        return;
      }
      case "room": {
        const p = snapPoint(pt.world, snapCtx(anchor, undefined, draft)).point;
        if (draft.length >= 3 && dist(p, draft[0]) <= tol) finishRoom(draft);
        else if (!draft.length || dist(p, draft[draft.length - 1]) > 0.02) setDraft([...draft, p]);
        return;
      }
      case "door":
      case "window": {
        const hit = nearestWall(floor.walls, pt.world, tol);
        if (!hit) return;
        const o = createOpening(tool, hit.wall.id, hit.offset);
        store().addOpening(floor.id, o);
        editor().select({ floorId: floor.id, ids: [o.id] });
        return;
      }
      case "stair": {
        const p = snapPoint(pt.world, snapCtx(null)).point;
        const s = createStair(stairType, p, stairRot);
        store().addStair(floor.id, s);
        editor().select({ floorId: floor.id, ids: [s.id] });
        editor().setTool("select");
        return;
      }
      case "furniture": {
        const p = snapPoint(pt.world, snapCtx(null)).point;
        const f = createFurniture(furnitureKind, p, furnitureRot);
        store().addFurniture(floor.id, f);
        editor().select({ floorId: floor.id, ids: [f.id] });
        editor().setTool("select");
        return;
      }
      case "measure": {
        const p = snapPoint(pt.world, snapCtx(measure && !measure.b ? measure.a : null)).point;
        setMeasure(!measure || measure.b ? { a: p } : { a: measure.a, b: p });
        return;
      }
      case "select": {
        // 1. handles of the current single selection
        if (selectedIds.size === 1) {
          const id = [...selectedIds][0];
          const w = floor.walls.find((x) => x.id === id);
          if (w) {
            for (const end of [w.a, w.b]) {
              if (dist(end, pt.world) <= tol) {
                drag.current = { kind: "endpoint", current: end, began: false };
                return;
              }
            }
          }
          const r = floor.rooms.find((x) => x.id === id && x.source === "manual");
          if (r) {
            const k = r.polygon.findIndex((v) => dist(v, pt.world) <= tol);
            if (k >= 0) {
              drag.current = { kind: "roomVertex", roomId: r.id, index: k, polygon: r.polygon, began: false };
              return;
            }
          }
        }
        // 2. entities
        const hit = hitTest(floor, pt.world, 6 / vp.scale);
        if (hit) {
          if (e.evt.shiftKey) {
            editor().toggleSelect(floor.id, hit.id);
            return;
          }
          if (!selectedIds.has(hit.id)) editor().select({ floorId: floor.id, ids: [hit.id] });
          if (hit.kind === "wall") {
            const w = floor.walls.find((x) => x.id === hit.id)!;
            drag.current = { kind: "wall", startWorld: pt.world, a0: w.a, b0: w.b, curA: w.a, curB: w.b, began: false };
          } else if (hit.kind === "furniture") {
            const f = floor.furniture.find((x) => x.id === hit.id)!;
            drag.current = { kind: "furniture", id: f.id, startWorld: pt.world, x0: f.x, y0: f.y, began: false };
          } else if (hit.kind === "stair") {
            const s = floor.stairs.find((x) => x.id === hit.id)!;
            drag.current = { kind: "stair", id: s.id, startWorld: pt.world, x0: s.x, y0: s.y, began: false };
          } else if (hit.kind === "opening") {
            const o = floor.openings.find((x) => x.id === hit.id)!;
            drag.current = { kind: "opening", id: o.id, wallId: o.wallId, began: false };
          }
          return;
        }
        if (!e.evt.shiftKey) editor().select(null);
        drag.current = { kind: "pan", startScreen: pt.screen, startVp: vp };
        return;
      }
      default:
        return;
    }
  };

  const onPointerMove = (e: KonvaEventObject<PointerEvent>) => {
    const pt = pointer();
    if (!pt || !floor) return;
    shiftRef.current = e.evt.shiftKey;
    altRef.current = e.evt.altKey;
    setRawCursor(pt.world);
    const d = drag.current;
    const s = store();

    if (d) {
      const ensureBegun = () => {
        if (d.kind !== "pan" && !d.began) {
          s.begin();
          d.began = true;
        }
      };
      switch (d.kind) {
        case "pan":
          setVp({ ...d.startVp, x: d.startVp.x + pt.screen.x - d.startScreen.x, y: d.startVp.y + pt.screen.y - d.startScreen.y });
          return;
        case "endpoint": {
          const sharing = new Set(floor.walls.filter((w) => samePoint(w.a, d.current, 1e-4) || samePoint(w.b, d.current, 1e-4)).map((w) => w.id));
          const snapped = snapPoint(pt.world, snapCtx(null, sharing));
          setCursor(snapped);
          if (!samePoint(snapped.point, d.current, 1e-6)) {
            ensureBegun();
            s.moveWallEndpoint(floor.id, d.current, snapped.point);
            d.current = snapped.point;
          }
          return;
        }
        case "wall": {
          const delta = gridDelta(sub(pt.world, d.startWorld));
          const na = add(d.a0, delta);
          const nb = add(d.b0, delta);
          if (samePoint(na, d.curA, 1e-6)) return;
          ensureBegun();
          s.moveWallEndpoint(floor.id, d.curA, na);
          s.moveWallEndpoint(floor.id, d.curB, nb);
          d.curA = na;
          d.curB = nb;
          return;
        }
        case "stair": {
          const delta = gridDelta(sub(pt.world, d.startWorld));
          ensureBegun();
          s.updateStair(floor.id, d.id, { x: d.x0 + delta.x, y: d.y0 + delta.y });
          return;
        }
        case "furniture": {
          const delta = gridDelta(sub(pt.world, d.startWorld));
          ensureBegun();
          s.updateFurniture(floor.id, d.id, { x: d.x0 + delta.x, y: d.y0 + delta.y });
          return;
        }
        case "opening": {
          const w = floor.walls.find((x) => x.id === d.wallId);
          if (!w) return;
          const pr = projectOnSegment(pt.world, w.a, w.b);
          ensureBegun();
          s.updateOpening(floor.id, d.id, { offset: pr.t * wallLength(w) });
          return;
        }
        case "roomVertex": {
          const snapped = snapPoint(pt.world, snapCtx(null));
          setCursor(snapped);
          ensureBegun();
          const poly = d.polygon.map((p, i) => (i === d.index ? snapped.point : p));
          s.updateRoom(floor.id, d.roomId, { polygon: poly });
          d.polygon = poly;
          return;
        }
      }
    }

    // hover / previews
    if (tool === "select") {
      setHoverId(hitTest(floor, pt.world, 6 / vp.scale)?.id ?? null);
      setCursor(null);
    } else if (tool === "wall" || tool === "room" || tool === "measure" || tool === "stair" || tool === "furniture") {
      const anchor = tool === "measure" ? (measure && !measure.b ? measure.a : null) : draft.length ? draft[draft.length - 1] : null;
      setCursor(snapPoint(pt.world, snapCtx(tool === "stair" || tool === "furniture" ? null : anchor, undefined, draft)));
    } else {
      setCursor(null);
    }
  };

  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (d && d.kind !== "pan" && d.began) store().commit();
  };

  const onWheel = (e: KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const p = stageRef.current?.getPointerPosition();
    if (!p) return;
    const factor = Math.exp(-e.evt.deltaY * (e.evt.ctrlKey ? 0.01 : 0.0015));
    const next = Math.min(600, Math.max(2, vp.scale * factor));
    const w = toWorld(p.x, p.y);
    setVp({ scale: next, x: p.x - w.x * next, y: p.y - w.y * next });
  };

  const onDblClick = () => {
    if (tool === "room" && draft.length >= 3) finishRoom(draft);
    else if (tool === "wall") setDraft([]);
  };

  const onContextMenu = (e: KonvaEventObject<PointerEvent>) => {
    e.evt.preventDefault();
    if (tool === "room" && draft.length >= 3) finishRoom(draft);
    else if (draft.length) setDraft([]);
  };

  if (!floor) return null;

  // ---- previews ---------------------------------------------------------------------
  const cursorPt = cursor?.point ?? rawCursor;
  const previewOpening =
    (tool === "door" || tool === "window") && rawCursor
      ? (() => {
          const hit = nearestWall(floor.walls, rawCursor, 8 / vp.scale);
          if (!hit) return null;
          const o = createOpening(tool, hit.wall.id, hit.offset);
          return { o, w: hit.wall };
        })()
      : null;
  const previewStair = tool === "stair" && cursorPt ? createStair(stairType, cursorPt, stairRot) : null;
  const previewFurniture = tool === "furniture" && cursorPt ? createFurniture(furnitureKind, cursorPt, furnitureRot) : null;
  const draftLen = draft.length && cursorPt ? dist(draft[draft.length - 1], cursorPt) : 0;
  const imgTransform = (() => {
    const t = project.lot.trace;
    if (!lotImage || !t || t.points.length !== lotPoly.length) return null;
    const s = 1 / t.pxPerMeter;
    const n = lotPoly.length;
    const cx = lotPoly.reduce((a, p) => a + p.x, 0) / n - (t.points.reduce((a, p) => a + p.x, 0) / n) * s;
    const cy = lotPoly.reduce((a, p) => a + p.y, 0) / n - (t.points.reduce((a, p) => a + p.y, 0) / n) * s;
    return { x: cx, y: cy, s };
  })();

  const singleWall = selectedIds.size === 1 ? floor.walls.find((w) => selectedIds.has(w.id)) : undefined;
  const singleManualRoom = selectedIds.size === 1 ? floor.rooms.find((r) => selectedIds.has(r.id) && r.source === "manual") : undefined;

  // Bát trạch sectors around the centre of this floor (Phong thuỷ overlay).
  const wedges = show.fengShui && project.fengShui.facing ? sectorWedges(project, floor) : [];

  // Floating actions next to the selection (rotate, size, duplicate, delete…), in screen px.
  const actionAnchor = (() => {
    if (tool !== "select" || !selectedIds.size) return null;
    const pts = [...selectedIds].flatMap((id) => {
      const e = findEntity(floor, id);
      return e ? entityOutline(floor, e).points : [];
    });
    if (!pts.length) return null;
    const xs = pts.map((p) => p.x * vp.scale + vp.x);
    const ys = pts.map((p) => p.y * vp.scale + vp.y);
    return { x: (Math.min(...xs) + Math.max(...xs)) / 2, top: Math.min(...ys), bottom: Math.max(...ys) };
  })();

  const cursorStyle = spaceDown || tool === "pan" ? "grab" : tool === "select" ? (hoverId ? "move" : "default") : "crosshair";

  return (
    <Box ref={containerRef} className="touch-none-canvas absolute inset-0 overflow-hidden bg-canvas" style={{ cursor: cursorStyle }}>
      {size.width > 0 && (
        <Stage
          ref={stageRef}
          width={size.width}
          height={size.height}
          scaleX={vp.scale}
          scaleY={vp.scale}
          x={vp.x}
          y={vp.y}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={() => {
            setRawCursor(null);
            setCursor(null);
          }}
          onWheel={onWheel}
          onDblClick={onDblClick}
          onContextMenu={onContextMenu}
        >
          <Layer listening={false}>
            <Rect x={-vp.x / vp.scale} y={-vp.y / vp.scale} width={size.width / vp.scale} height={size.height / vp.scale} fill={C.background} />
            {imgTransform && lotImage && <KImage image={lotImage} x={imgTransform.x} y={imgTransform.y} scaleX={imgTransform.s} scaleY={imgTransform.s} opacity={0.45} />}
            {show.grid && <GridShape vp={vp} width={size.width} height={size.height} />}
            <LotShape polygon={lotPoly} buildable={buildable} roadCut={roadCut} scale={vp.scale} showDims={show.dimensions} />
            {wedges.map((w) => {
              const color = w.star == null ? "#64748b" : STAR_INFO[w.star].good ? "#16a34a" : "#dc2626";
              return <Line key={w.dir} points={flat(w.polygon)} closed fill={color} opacity={0.07} stroke={color} strokeWidth={1} dash={[4, 4]} strokeScaleEnabled={false} />;
            })}
            {wedges.map((w) => {
              const text = `${DIRECTION_LABELS[w.dir]}${w.star ? ` · ${STAR_INFO[w.star].label}` : ""}`;
              // Push side labels out by half their width so they don't run over the house.
              const dx = w.labelAt.x - w.polygon[0].x;
              const half = (text.length * 11 * 0.62 + 8) / vp.scale / 2;
              const at = Math.abs(dx) > 0.3 ? { x: w.labelAt.x + Math.sign(dx) * half, y: w.labelAt.y } : w.labelAt;
              return <Label key={`l-${w.dir}`} at={at} text={text} scale={vp.scale} size={11} color={w.star == null ? "#475569" : STAR_INFO[w.star].good ? "#15803d" : "#b91c1c"} bold />;
            })}
            {show.ghostBelow && below && <WallsShape walls={below.walls} openings={[]} selected={EMPTY} errors={EMPTY} hoverId={null} ghost />}
          </Layer>
          <Layer listening={false}>
            <RoomsShape rooms={floor.rooms} selected={selectedIds} hoverId={hoverId} showLabels={show.roomLabels} scale={vp.scale} />
            <VoidsShape below={below} scale={vp.scale} />
            <StairsShape floor={floor} selected={selectedIds} hoverId={hoverId} scale={vp.scale} />
            <FurnitureShape items={floor.furniture} selected={selectedIds} hoverId={hoverId} scale={vp.scale} />
            <WallsShape walls={floor.walls} openings={floor.openings} selected={selectedIds} errors={errorIds} hoverId={hoverId} />
            {show.dimensions && <WallDimensions walls={floor.walls} scale={vp.scale} />}
          </Layer>
          <Layer listening={false}>
            {singleWall && (
              <>
                <Handle at={singleWall.a} scale={vp.scale} />
                <Handle at={singleWall.b} scale={vp.scale} />
              </>
            )}
            {singleManualRoom?.polygon.map((p, i) => <Handle key={i} at={p} scale={vp.scale} />)}

            {draft.length > 0 && cursorPt && (
              <>
                {tool === "room" && <Line points={flat([...draft, cursorPt])} closed fill={C.traceFill} stroke={C.draft} strokeWidth={1.5} dash={[6, 4]} strokeScaleEnabled={false} />}
                {tool === "wall" && <Line points={flat([...draft, cursorPt])} stroke={C.draft} strokeWidth={Math.max(2, thickness * vp.scale)} opacity={0.5} lineCap="round" lineJoin="round" strokeScaleEnabled={false} />}
                {draft.map((p, i) => (
                  <Circle key={i} x={p.x} y={p.y} radius={3.5 / vp.scale} fill={C.draft} />
                ))}
                <Label at={{ x: cursorPt.x + 14 / vp.scale, y: cursorPt.y - 14 / vp.scale }} text={lengthText != null ? `${lengthText} m ⏎` : fmtLength(draftLen)} scale={vp.scale} size={12} color={C.draft} bold />
              </>
            )}

            {previewOpening && <Line points={flat(openingCover(previewOpening.o, previewOpening.w))} closed fill={tool === "door" ? C.door : C.window} opacity={0.5} />}
            {previewOpening && <Circle x={pointAlongWall(previewOpening.w, previewOpening.o.offset).x} y={pointAlongWall(previewOpening.w, previewOpening.o.offset).y} radius={3 / vp.scale} fill={C.snap} />}
            {previewStair && <StairGlyph stair={previewStair} rise={floor.height} scale={vp.scale} preview />}
            {previewFurniture && <FurnitureGlyph item={previewFurniture} scale={vp.scale} preview />}

            {measure && (measure.b || cursorPt) && (
              <>
                <Line points={flat([measure.a, measure.b ?? cursorPt!])} stroke={C.measure} strokeWidth={2} dash={[8, 4]} strokeScaleEnabled={false} />
                <Label at={{ x: ((measure.b ?? cursorPt!).x + measure.a.x) / 2, y: ((measure.b ?? cursorPt!).y + measure.a.y) / 2 - 12 / vp.scale }} text={fmtLength(dist(measure.a, measure.b ?? cursorPt!))} scale={vp.scale} size={12} color={C.measure} bold />
              </>
            )}

            {cursor && cursor.kind !== "none" && (
              <>
                {cursor.guideFrom && <Line points={flat([cursor.guideFrom, cursor.point])} stroke={C.guide} strokeWidth={1} dash={[4, 4]} strokeScaleEnabled={false} />}
                <Circle x={cursor.point.x} y={cursor.point.y} radius={4 / vp.scale} stroke={C.snap} strokeWidth={1.5} strokeScaleEnabled={false} />
              </>
            )}
          </Layer>
        </Stage>
      )}
      <ObjectActions floor={floor} anchor={actionAnchor} bounds={size} />
      {floor.walls.length === 0 && floor.furniture.length === 0 && tool === "select" && draft.length === 0 && <EmptyFloorStart floorId={floor.id} floorName={floor.name} />}
      <Row className="pointer-events-none absolute bottom-0 left-0 right-0 items-center gap-4 border-t border-line bg-surface/90 px-3 py-1 text-xs">
        <TextMuted className="tabular-nums">
          {rawCursor ? `x ${rawCursor.x.toFixed(2).replace(".", ",")}  y ${rawCursor.y.toFixed(2).replace(".", ",")} m` : "—"}
        </TextMuted>
        {cursor && SNAP_LABEL[cursor.kind] && <Text className="rounded bg-surface-muted px-1.5 font-medium text-ink">{SNAP_LABEL[cursor.kind]}</Text>}
        <TextMuted className="tabular-nums">1 m = {vp.scale.toFixed(0)} px</TextMuted>
        <TextMuted className="ml-auto truncate">{floor.name}</TextMuted>
      </Row>
    </Box>
  );
}
