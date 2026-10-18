"use client";

import { Box, Col, Text, TextFaint } from "@/components/ui/BasePrimitives";
import { FURNITURE_CATALOG, FURNITURE_CATEGORY_LABELS, type FurnitureCategory, type FurnitureSpec } from "@/domain/furniture";
import { useEditorStore } from "@/store/editorStore";

/** Small top-view drawing of a catalog item, from the same parts as the 3D model. */
export function FurnitureIcon({ spec, size = 40 }: { spec: FurnitureSpec; size?: number }) {
  const k = Math.min(1 / spec.width, 1 / spec.depth) * 0.9;
  const w = spec.width * k;
  const d = spec.depth * k;
  const ox = (1 - w) / 2;
  const oy = (1 - d) / 2;
  return (
    <svg viewBox="0 0 1 1" width={size} height={size} aria-hidden className="shrink-0">
      <rect x={ox} y={oy} width={w} height={d} rx={0.02} fill="#fff" stroke="#94a3b8" strokeWidth={0.02} />
      {spec.parts.map((p, i) =>
        p.shape === "cylinder" || p.shape === "sphere" ? (
          <ellipse
            key={i}
            cx={ox + ((p.u0 + p.u1) / 2) * w}
            cy={oy + ((p.v0 + p.v1) / 2) * d}
            rx={((p.u1 - p.u0) * w) / 2}
            ry={((p.v1 - p.v0) * d) / 2}
            fill={p.color ?? spec.color}
            fillOpacity={0.55}
            stroke="#475569"
            strokeWidth={0.015}
          />
        ) : (
          <rect
            key={i}
            x={ox + p.u0 * w}
            y={oy + p.v0 * d}
            width={(p.u1 - p.u0) * w}
            height={(p.v1 - p.v0) * d}
            fill={p.color ?? spec.color}
            fillOpacity={(p.opacity ?? 1) * 0.55}
            stroke="#475569"
            strokeWidth={0.015}
          />
        ),
      )}
    </svg>
  );
}

const CATEGORIES = Object.keys(FURNITURE_CATEGORY_LABELS) as FurnitureCategory[];

/** Pick-a-piece grid: choosing an item arms the furniture tool; the next click on the plan places it. */
export function FurnitureCatalog() {
  const kind = useEditorStore((s) => s.furnitureKind);
  const tool = useEditorStore((s) => s.tool);
  const pick = useEditorStore((s) => s.pickFurniture);
  return (
    <Col className="gap-3">
      {CATEGORIES.map((cat) => (
        <Box key={cat}>
          <TextFaint className="mb-1 block text-caption font-semibold uppercase">{FURNITURE_CATEGORY_LABELS[cat]}</TextFaint>
          <Box className="grid grid-cols-2 gap-1.5">
            {FURNITURE_CATALOG.filter((s) => s.category === cat).map((s) => {
              const active = tool === "furniture" && kind === s.kind;
              return (
                <button
                  key={s.kind}
                  type="button"
                  aria-pressed={active}
                  onClick={() => pick(s.kind)}
                  className={`flex items-center gap-1.5 rounded-md border p-1 text-left transition-colors ${active ? "border-brand-500 bg-brand-50 ring-2 ring-brand-200" : "border-line hover:bg-surface-muted"}`}
                >
                  <FurnitureIcon spec={s} size={34} />
                  <Box className="min-w-0">
                    <Text className="block truncate text-xs font-medium text-ink">{s.label}</Text>
                    <TextFaint className="block text-micro tabular-nums">
                      {s.width.toLocaleString("vi-VN")} × {s.depth.toLocaleString("vi-VN")} m
                    </TextFaint>
                  </Box>
                </button>
              );
            })}
          </Box>
        </Box>
      ))}
    </Col>
  );
}
