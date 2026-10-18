"use client";

import type { Vec2 } from "@/domain/types";
import { fmtLength } from "@/domain/labels";
import { bbox, edgeLengths, signedArea } from "@/geometry/polygon";
import { canvasColors as C } from "@/theme/tokens";
import { vertexName } from "./TraceCanvas";

/** Static SVG preview of the fitted lot with per-edge residual colouring. */
export function LotPreview({ polygon, residuals, height = 320 }: { polygon: Vec2[]; residuals?: (number | null)[]; height?: number }) {
  if (polygon.length < 3) return null;
  const b = bbox(polygon);
  const w = Math.max(1, b.maxX - b.minX);
  const h = Math.max(1, b.maxY - b.minY);
  const pad = Math.max(w, h) * 0.18;
  const lens = edgeLengths(polygon);
  const orient = Math.sign(signedArea(polygon)) || 1;
  const fs = Math.max(w, h) * 0.035;
  const color = (r: number | null | undefined) => (r == null ? C.textMuted : Math.abs(r) < 0.02 ? C.lotStroke : Math.abs(r) < 0.1 ? C.setbackStroke : C.wallError);
  return (
    <svg viewBox={`${b.minX - pad} ${b.minY - pad} ${w + 2 * pad} ${h + 2 * pad}`} style={{ height, width: "100%" }} role="img" aria-label="Hình thửa đất sau khi khớp kích thước">
      <polygon points={polygon.map((p) => `${p.x},${p.y}`).join(" ")} fill={C.lotFill} stroke={C.lotStroke} strokeWidth={fs * 0.12} />
      {polygon.map((p, i) => {
        const q = polygon[(i + 1) % polygon.length];
        const mx = (p.x + q.x) / 2;
        const my = (p.y + q.y) / 2;
        const dx = q.x - p.x;
        const dy = q.y - p.y;
        const l = Math.hypot(dx, dy) || 1;
        const ox = (dy / l) * fs * 1.4 * orient;
        const oy = (-dx / l) * fs * 1.4 * orient;
        const r = residuals?.[i];
        return (
          <g key={i}>
            <text x={mx + ox} y={my + oy} fontSize={fs} textAnchor="middle" dominantBaseline="middle" fill={color(r)} fontWeight={600}>
              {fmtLength(lens[i])}
              {r != null && Math.abs(r) >= 0.005 ? ` (${r > 0 ? "+" : ""}${(r * 100).toFixed(0)} cm)` : ""}
            </text>
          </g>
        );
      })}
      {polygon.map((p, i) => (
        <g key={`v${i}`}>
          <circle cx={p.x} cy={p.y} r={fs * 0.25} fill={C.lotStroke} />
          <text x={p.x} y={p.y} dx={fs * 0.4} dy={-fs * 0.4} fontSize={fs * 0.9} fill={C.text} fontWeight={700}>
            {vertexName(i)}
          </text>
        </g>
      ))}
    </svg>
  );
}
