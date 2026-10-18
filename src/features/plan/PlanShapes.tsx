"use client";

import { memo, useMemo } from "react";
import { Arrow, Group, Line, Rect, Shape, Text as KText } from "react-konva";
import type { Floor, Opening, Room, Stair, Vec2, Wall } from "@/domain/types";
import { ROOM_TYPE_COLORS, fmtArea, fmtLength } from "@/domain/labels";
import { roomNetArea } from "@/domain/rooms";
import { canvasColors as C } from "@/theme/tokens";
import { centroid, edgeLengths, pointInPolygon, signedArea } from "@/geometry/polygon";
import { connectedEndpoints, wallRenderQuad } from "@/geometry/hitTest";
import { clampOpening, pointAlongWall, wallDirection, wallLength, wallNormal } from "@/geometry/openings";
import { generateStair } from "@/geometry/stairs";
import { dist, mid, normalize, perp, sub } from "@/geometry/vec";

export interface Viewport {
  scale: number;
  x: number;
  y: number;
}

export const flat = (pts: readonly Vec2[]): number[] => pts.flatMap((p) => [p.x, p.y]);

/** Keeps text upright when rotated along a direction. */
function uprightAngle(d: Vec2): number {
  let a = (Math.atan2(d.y, d.x) * 180) / Math.PI;
  if (a > 90) a -= 180;
  if (a < -90) a += 180;
  return a;
}

export function Label({ at, text, scale, size = 11, color = C.text, angle = 0, bold = false }: { at: Vec2; text: string; scale: number; size?: number; color?: string; angle?: number; bold?: boolean }) {
  const fs = size / scale;
  const w = (text.length * size * 0.62 + 8) / scale;
  return (
    <KText
      x={at.x}
      y={at.y}
      width={w}
      offsetX={w / 2}
      offsetY={fs / 2}
      rotation={angle}
      text={text}
      fontSize={fs}
      fontStyle={bold ? "bold" : "normal"}
      fill={color}
      align="center"
      listening={false}
      perfectDrawEnabled={false}
    />
  );
}

const GRID_STEPS = [
  { minor: 0.1, major: 1 },
  { minor: 0.5, major: 5 },
  { minor: 1, major: 5 },
  { minor: 5, major: 25 },
  { minor: 10, major: 50 },
];

export const GridShape = memo(function GridShape({ vp, width, height }: { vp: Viewport; width: number; height: number }) {
  const step = GRID_STEPS.find((s) => s.minor * vp.scale >= 10) ?? GRID_STEPS[GRID_STEPS.length - 1];
  return (
    <Shape
      listening={false}
      perfectDrawEnabled={false}
      sceneFunc={(ctx) => {
        const x0 = -vp.x / vp.scale;
        const y0 = -vp.y / vp.scale;
        const x1 = x0 + width / vp.scale;
        const y1 = y0 + height / vp.scale;
        const draw = (s: number, color: string, w: number) => {
          ctx.beginPath();
          for (let x = Math.floor(x0 / s) * s; x <= x1; x += s) {
            ctx.moveTo(x, y0);
            ctx.lineTo(x, y1);
          }
          for (let y = Math.floor(y0 / s) * s; y <= y1; y += s) {
            ctx.moveTo(x0, y);
            ctx.lineTo(x1, y);
          }
          ctx.strokeStyle = color;
          ctx.lineWidth = w / vp.scale;
          ctx.stroke();
        };
        draw(step.minor, C.gridMinor, 1);
        draw(step.major, C.gridMajor, 1);
      }}
    />
  );
});

export const LotShape = memo(function LotShape({
  polygon,
  buildable,
  scale,
  showDims,
}: {
  polygon: Vec2[];
  buildable: Vec2[] | null;
  scale: number;
  showDims: boolean;
}) {
  const lens = edgeLengths(polygon);
  const orient = Math.sign(signedArea(polygon)) || 1;
  return (
    <Group listening={false}>
      <Line points={flat(polygon)} closed fill={C.lotFill} stroke={C.lotStroke} strokeWidth={2} dash={[10, 5]} strokeScaleEnabled={false} />
      {buildable && <Line points={flat(buildable)} closed fill={C.setbackFill} stroke={C.setbackStroke} strokeWidth={1.5} dash={[6, 4]} strokeScaleEnabled={false} />}
      {showDims &&
        polygon.map((p, i) => {
          const q = polygon[(i + 1) % polygon.length];
          const d = normalize(sub(q, p));
          const out = perp(d);
          const off = (-orient * 14) / scale;
          const m = mid(p, q);
          return <Label key={i} at={{ x: m.x + out.x * off, y: m.y + out.y * off }} text={fmtLength(lens[i])} scale={scale} color={C.lotStroke} angle={uprightAngle(d)} bold />;
        })}
    </Group>
  );
});

function DoorSymbol({ o, w }: { o: Opening; w: Wall }) {
  const u = wallDirection(w);
  const n = wallNormal(w);
  const c = pointAlongWall(w, o.offset);
  const s0 = { x: c.x - (u.x * o.width) / 2, y: c.y - (u.y * o.width) / 2 };
  const s1 = { x: c.x + (u.x * o.width) / 2, y: c.y + (u.y * o.width) / 2 };
  const hinge = o.hinge === "start" ? s0 : s1;
  const closedEnd = o.hinge === "start" ? s1 : s0;
  const side = o.swing === "left" ? 1 : -1;
  const faceOffset = (w.thickness / 2) * side;
  const h = { x: hinge.x + n.x * faceOffset, y: hinge.y + n.y * faceOffset };
  const leafEnd = { x: h.x + n.x * side * o.width, y: h.y + n.y * side * o.width };
  const closed = { x: closedEnd.x + n.x * faceOffset, y: closedEnd.y + n.y * faceOffset };
  const a0 = Math.atan2(leafEnd.y - h.y, leafEnd.x - h.x);
  let a1 = Math.atan2(closed.y - h.y, closed.x - h.x);
  if (a1 - a0 > Math.PI) a1 -= 2 * Math.PI;
  if (a0 - a1 > Math.PI) a1 += 2 * Math.PI;
  const arc: Vec2[] = [];
  for (let k = 0; k <= 16; k++) {
    const a = a0 + ((a1 - a0) * k) / 16;
    arc.push({ x: h.x + Math.cos(a) * o.width, y: h.y + Math.sin(a) * o.width });
  }
  return (
    <>
      <Line points={flat([h, leafEnd])} stroke={C.door} strokeWidth={2} strokeScaleEnabled={false} />
      <Line points={flat(arc)} stroke={C.door} strokeWidth={1} dash={[4, 3]} strokeScaleEnabled={false} />
    </>
  );
}

function WindowSymbol({ o, w }: { o: Opening; w: Wall }) {
  const u = wallDirection(w);
  const n = wallNormal(w);
  const c = pointAlongWall(w, o.offset);
  const hw = o.width / 2;
  const ht = w.thickness / 2;
  const corner = (su: number, sn: number) => ({ x: c.x + u.x * hw * su + n.x * ht * sn, y: c.y + u.y * hw * su + n.y * ht * sn });
  return (
    <>
      <Line points={flat([corner(-1, 1), corner(1, 1), corner(1, -1), corner(-1, -1)])} closed stroke={C.window} strokeWidth={1} strokeScaleEnabled={false} />
      <Line points={flat([corner(-1, 0), corner(1, 0)])} stroke={C.window} strokeWidth={2} strokeScaleEnabled={false} />
    </>
  );
}

export function openingCover(o: Opening, w: Wall): Vec2[] {
  const u = wallDirection(w);
  const n = wallNormal(w);
  const c = pointAlongWall(w, o.offset);
  const hw = o.width / 2;
  const ht = w.thickness / 2 + 0.01;
  return [
    { x: c.x - u.x * hw + n.x * ht, y: c.y - u.y * hw + n.y * ht },
    { x: c.x + u.x * hw + n.x * ht, y: c.y + u.y * hw + n.y * ht },
    { x: c.x + u.x * hw - n.x * ht, y: c.y + u.y * hw - n.y * ht },
    { x: c.x - u.x * hw - n.x * ht, y: c.y - u.y * hw - n.y * ht },
  ];
}

export const WallsShape = memo(function WallsShape({
  walls,
  openings,
  selected,
  errors,
  hoverId,
  ghost = false,
}: {
  walls: Wall[];
  openings: Opening[];
  selected: ReadonlySet<string>;
  errors: ReadonlySet<string>;
  hoverId: string | null;
  ghost?: boolean;
}) {
  const conn = useMemo(() => connectedEndpoints(walls), [walls]);
  const byId = useMemo(() => new Map(walls.map((w) => [w.id, w])), [walls]);
  return (
    <Group listening={false}>
      {walls.map((w) => {
        const c = conn.get(w.id) ?? { a: false, b: false };
        const fill = ghost ? C.ghost : selected.has(w.id) ? C.wallSelected : errors.has(w.id) ? C.wallError : C.wall;
        return (
          <Line
            key={w.id}
            points={flat(wallRenderQuad(w, c.a, c.b))}
            closed
            fill={fill}
            stroke={hoverId === w.id ? C.selection : undefined}
            strokeWidth={hoverId === w.id ? 2 : 0}
            strokeScaleEnabled={false}
            perfectDrawEnabled={false}
          />
        );
      })}
      {!ghost &&
        openings.map((raw) => {
          const w = byId.get(raw.wallId);
          if (!w) return null;
          const o = clampOpening(raw, w);
          const sel = selected.has(o.id) || hoverId === o.id;
          return (
            <Group key={o.id}>
              <Line points={flat(openingCover(o, w))} closed fill={C.opening} stroke={sel ? C.selection : C.openingStroke} strokeWidth={sel ? 2 : 0.75} strokeScaleEnabled={false} />
              {o.kind === "door" ? <DoorSymbol o={o} w={w} /> : <WindowSymbol o={o} w={w} />}
            </Group>
          );
        })}
    </Group>
  );
});

export const WallDimensions = memo(function WallDimensions({ walls, scale }: { walls: Wall[]; scale: number }) {
  return (
    <Group listening={false}>
      {walls.map((w) => {
        const L = wallLength(w);
        if (L * scale < 40) return null;
        const n = wallNormal(w);
        const off = w.thickness / 2 + 9 / scale;
        const m = mid(w.a, w.b);
        return <Label key={w.id} at={{ x: m.x + n.x * off, y: m.y + n.y * off }} text={fmtLength(L)} scale={scale} size={10} color={C.dimension} angle={uprightAngle(wallDirection(w))} />;
      })}
    </Group>
  );
});

/** Label position: centroid, or the first vertex-average point inside for concave rooms. */
function labelPoint(poly: Vec2[]): Vec2 {
  const c = centroid(poly);
  if (pointInPolygon(c, poly)) return c;
  for (let i = 0; i < poly.length; i++) {
    const p = mid(mid(poly[i], poly[(i + 1) % poly.length]), mid(poly[(i + 2) % poly.length], poly[(i + 3) % poly.length]));
    if (pointInPolygon(p, poly)) return p;
  }
  return c;
}

export const RoomsShape = memo(function RoomsShape({
  rooms,
  selected,
  hoverId,
  showLabels,
  scale,
}: {
  rooms: Room[];
  selected: ReadonlySet<string>;
  hoverId: string | null;
  showLabels: boolean;
  scale: number;
}) {
  return (
    <Group listening={false}>
      {rooms.map((r) => {
        const poly = r.netPolygon ?? r.polygon;
        const sel = selected.has(r.id);
        return (
          <Line
            key={r.id}
            points={flat(poly)}
            closed
            fill={ROOM_TYPE_COLORS[r.type]}
            opacity={0.75}
            stroke={sel || hoverId === r.id ? C.selection : r.source === "manual" ? C.textMuted : undefined}
            strokeWidth={sel ? 2.5 : hoverId === r.id ? 1.5 : r.source === "manual" ? 1 : 0}
            dash={r.source === "manual" && !sel ? [5, 3] : undefined}
            strokeScaleEnabled={false}
            perfectDrawEnabled={false}
          />
        );
      })}
      {showLabels &&
        rooms.map((r) => {
          const poly = r.netPolygon ?? r.polygon;
          const p = labelPoint(poly);
          return (
            <Group key={`l-${r.id}`}>
              <Label at={{ x: p.x, y: p.y - 7 / scale }} text={r.name} scale={scale} size={12} bold />
              <Label at={{ x: p.x, y: p.y + 8 / scale }} text={fmtArea(roomNetArea(r))} scale={scale} size={10} color={C.textMuted} />
            </Group>
          );
        })}
    </Group>
  );
});

export function StairGlyph({ stair, rise, selected, hover, scale, preview = false }: { stair: Stair; rise: number; selected?: boolean; hover?: boolean; scale: number; preview?: boolean }) {
  const g = generateStair(stair, rise);
  const start = g.walkline[0];
  const second = g.walkline[1] ?? start;
  const d = dist(start, second) > 1e-6 ? normalize(sub(second, start)) : { x: 1, y: 0 };
  return (
    <Group listening={false} opacity={preview ? 0.55 : 1}>
      {g.steps.map((s, i) => (
        <Line key={i} points={flat(s.polygon)} closed fill={s.kind === "landing" ? C.void : C.stairFill} opacity={s.kind === "landing" ? 0.25 : 1} stroke={C.stair} strokeWidth={1} strokeScaleEnabled={false} perfectDrawEnabled={false} />
      ))}
      <Arrow points={flat(g.walkline)} stroke={C.stair} fill={C.stair} strokeWidth={1.5} pointerLength={8 / scale} pointerWidth={7 / scale} strokeScaleEnabled={false} />
      <Label at={{ x: start.x - d.x * (12 / scale), y: start.y - d.y * (12 / scale) }} text="LÊN" scale={scale} size={10} color={C.stair} bold />
      {(selected || hover) && <Line points={flat(g.footprint)} closed stroke={C.selection} strokeWidth={selected ? 2.5 : 1.5} strokeScaleEnabled={false} />}
    </Group>
  );
}

export const StairsShape = memo(function StairsShape({ floor, selected, hoverId, scale }: { floor: Floor; selected: ReadonlySet<string>; hoverId: string | null; scale: number }) {
  return (
    <>
      {floor.stairs.map((s) => (
        <StairGlyph key={s.id} stair={s} rise={floor.height} selected={selected.has(s.id)} hover={hoverId === s.id} scale={scale} />
      ))}
    </>
  );
});

/** Openings in this floor's slab created by the stairs of the floor below. */
export const VoidsShape = memo(function VoidsShape({ below, scale }: { below: Floor | null; scale: number }) {
  if (!below) return null;
  return (
    <Group listening={false}>
      {below.stairs.map((s) => {
        const fp = generateStair(s, below.height).footprint;
        const c = centroid(fp);
        return (
          <Group key={s.id}>
            <Line points={flat(fp)} closed stroke={C.void} strokeWidth={1.5} dash={[6, 4]} fill={C.stairFill} strokeScaleEnabled={false} />
            {fp.length === 4 && <Line points={flat([fp[0], fp[2]])} stroke={C.void} strokeWidth={1} strokeScaleEnabled={false} />}
            {fp.length === 4 && <Line points={flat([fp[1], fp[3]])} stroke={C.void} strokeWidth={1} strokeScaleEnabled={false} />}
            <Label at={c} text="Ô cầu thang" scale={scale} size={10} color={C.stair} />
          </Group>
        );
      })}
    </Group>
  );
});

export function Handle({ at, scale, color = C.selection }: { at: Vec2; scale: number; color?: string }) {
  return <Rect x={at.x} y={at.y} width={9 / scale} height={9 / scale} offsetX={4.5 / scale} offsetY={4.5 / scale} fill={C.handle} stroke={color} strokeWidth={1.5} strokeScaleEnabled={false} listening={false} />;
}
