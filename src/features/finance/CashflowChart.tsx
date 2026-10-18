"use client";

import { useState } from "react";
import { Box, Text } from "@/components/ui/BasePrimitives";
import { fmtTy } from "@/domain/finance";

export interface ChartPoint {
  year: number;
  /** Bar: cash flow (or amount repaid) that year, million VND. */
  bar: number;
  /** Line: cumulative position (or −loan balance), million VND. */
  line: number;
}

const W = 680;
const H = 270;
const PAD = { l: 48, r: 12, t: 14, b: 30 };

function niceStep(range: number): number {
  const raw = range / 5;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / p;
  return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p;
}

/** Bars for yearly cash flow (positive/negative) with a cumulative line, in billion VND. */
export function CashflowChart({
  points,
  marker,
  barLabel,
  lineLabel,
}: {
  points: ChartPoint[];
  marker: { year: number; label: string } | null;
  barLabel: string;
  lineLabel: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const vals = points.flatMap((d) => [d.bar, d.line, 0]).map((v) => v / 1000);
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  const pad = (hi - lo) * 0.08 || 1;
  lo -= pad;
  hi += pad;
  const step = niceStep(hi - lo);
  lo = Math.floor(lo / step) * step;
  hi = Math.ceil(hi / step) * step;

  const slot = (W - PAD.l - PAD.r) / points.length;
  const x = (i: number) => PAD.l + (i + 0.5) * slot;
  const y = (v: number) => PAD.t + ((hi - v) / (hi - lo)) * (H - PAD.t - PAD.b);
  const bw = slot * 0.62;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + 1e-9; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  const markerIdx = marker ? points.findIndex((p) => p.year === marker.year) : -1;
  const hovered = hover != null ? points[hover] : null;

  return (
    <Box className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Biểu đồ: ${barLabel}, ${lineLabel}`} className="block h-auto max-h-80 w-full">
        {ticks.map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} className="stroke-line" strokeWidth={1} strokeDasharray={Math.abs(v) < 1e-9 ? undefined : "2 3"} />
            <text x={PAD.l - 6} y={y(v) + 3.5} textAnchor="end" fontSize={10} className="fill-ink-muted tabular-nums">
              {v.toLocaleString("vi-VN")}
            </text>
          </g>
        ))}
        {points.map((d, i) => {
          const v = d.bar / 1000;
          const top = Math.min(y(v), y(0));
          const h = Math.max(1, Math.abs(y(v) - y(0)));
          return (
            <g key={d.year}>
              <rect x={x(i) - bw / 2} y={top} width={bw} height={h} rx={Math.min(3, h / 2)} className={v >= 0 ? "fill-brand-600" : "fill-danger-600"} />
              {(i % 5 === 0 || i === points.length - 1) && (
                <text x={x(i)} y={H - PAD.b + 16} textAnchor="middle" fontSize={10} className="fill-ink-muted">
                  {d.year}
                </text>
              )}
            </g>
          );
        })}
        <polyline fill="none" strokeWidth={2} strokeLinejoin="round" className="stroke-ink" points={points.map((d, i) => `${x(i)},${y(d.line / 1000)}`).join(" ")} />
        {marker && markerIdx >= 0 ? (
          <g>
            <circle cx={x(markerIdx)} cy={y(points[markerIdx].line / 1000)} r={5} strokeWidth={2} className="fill-ink stroke-surface" />
            <text x={x(markerIdx) - 8} y={y(points[markerIdx].line / 1000) - 10} textAnchor="end" fontSize={11} fontWeight={600} className="fill-ink">
              {marker.label}
            </text>
          </g>
        ) : (
          <text x={W - PAD.r} y={PAD.t + 10} textAnchor="end" fontSize={11} className="fill-ink-muted">
            Chưa đạt trong {points.length - 1} năm
          </text>
        )}
        <text x={(W + PAD.l) / 2} y={H - 2} textAnchor="middle" fontSize={10} className="fill-ink-muted">
          Năm
        </text>
        {points.map((d, i) => (
          <rect
            key={d.year}
            x={x(i) - slot / 2}
            y={PAD.t}
            width={slot}
            height={H - PAD.t - PAD.b}
            className={hover === i ? "fill-ink/5" : "fill-transparent"}
            onPointerEnter={() => setHover(i)}
            onPointerLeave={() => setHover(null)}
          />
        ))}
      </svg>
      {hovered && hover != null && (
        <Box
          className="pointer-events-none absolute top-4 whitespace-nowrap rounded-md border border-line bg-surface px-2 py-1.5 text-xs tabular-nums text-ink shadow"
          style={{ left: `min(calc(${(x(hover) / W) * 100}% + 10px), calc(100% - 11rem))` }}
        >
          <Text className="block font-semibold">Năm {hovered.year}</Text>
          <Text className="block">
            {barLabel}: {fmtTy(hovered.bar)}
          </Text>
          <Text className="block">
            {lineLabel}: {fmtTy(hovered.line)}
          </Text>
        </Box>
      )}
    </Box>
  );
}
