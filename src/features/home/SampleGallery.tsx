"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Layers, Ruler, Sparkles } from "lucide-react";
import { Box, Col, Row, Text, TextMuted } from "@/components/ui/BasePrimitives";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { buildSample, SAMPLE_HOUSES, type SampleHouse } from "@/domain/samples";
import { fmtArea, ROOM_TYPE_COLORS } from "@/domain/labels";
import { computeStats } from "@/domain/stats";
import type { Floor } from "@/domain/types";
import { bbox } from "@/geometry/polygon";
import { saveProject } from "@/persistence/db";

const pts = (poly: readonly { x: number; y: number }[]) => poly.map((p) => `${p.x},${p.y}`).join(" ");

/** Coloured plan of one floor, drawn sideways (street on the left) to fit a card. */
function FloorThumb({ floor }: { floor: Floor }) {
  const all = floor.walls.flatMap((w) => [w.a, w.b]);
  if (!all.length) return null;
  const b = bbox(all);
  const pad = 0.4;
  return (
    <svg viewBox={`${b.minY - pad} ${-b.maxX - pad} ${b.maxY - b.minY + 2 * pad} ${b.maxX - b.minX + 2 * pad}`} className="h-24 w-full" aria-hidden>
      <g transform="rotate(-90)">
        {floor.rooms.map((r) => (
          <polygon key={r.id} points={pts(r.polygon)} fill={ROOM_TYPE_COLORS[r.type]} />
        ))}
        {floor.walls.map((w) => (
          <line key={w.id} x1={w.a.x} y1={w.a.y} x2={w.b.x} y2={w.b.y} stroke="#334155" strokeWidth={w.thickness} strokeLinecap="square" />
        ))}
      </g>
    </svg>
  );
}

function SampleCard({ sample }: { sample: SampleHouse }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const preview = useMemo(() => buildSample(sample), [sample]);
  const stats = useMemo(() => computeStats(preview), [preview]);
  const lot = bbox(sample.lot);
  const shown = preview.floors.reduce((best, f) => (f.rooms.length > best.rooms.length ? f : best), preview.floors[0]);

  const use = async () => {
    setBusy(true);
    try {
      // Fresh ids every time, so the same sample can be opened twice.
      const p = buildSample(sample);
      await saveProject(p);
      router.push(`/editor/?id=${encodeURIComponent(p.id)}`);
    } catch (err) {
      console.error(err);
      toast.error("Không tạo được dự án từ mẫu.");
      setBusy(false);
    }
  };

  return (
    <li className="flex flex-col rounded-xl border border-line bg-surface shadow-sm transition-shadow hover:shadow-md">
      <Box className="rounded-t-xl border-b border-line bg-canvas px-3 py-2">
        <FloorThumb floor={shown} />
      </Box>
      <Col className="flex-1 gap-1 p-3">
        <Text className="font-semibold text-ink">{sample.label}</Text>
        <TextMuted as="p" className="text-xs">
          {sample.description}
        </TextMuted>
        <Row className="mt-1 flex-wrap gap-3 text-xs text-ink-muted">
          <Text className="flex items-center gap-1">
            <Ruler size={12} />
            {(lot.maxX - lot.minX).toLocaleString("vi-VN")} × {(lot.maxY - lot.minY).toLocaleString("vi-VN")} m
          </Text>
          <Text className="flex items-center gap-1">
            <Layers size={12} />
            {preview.floors.length} tầng · sàn {fmtArea(stats.totalFloorArea)}
          </Text>
        </Row>
      </Col>
      <Row className="justify-end border-t border-line px-2 py-1.5">
        <Button size="sm" variant="primary" icon={<Sparkles size={14} />} disabled={busy} onClick={() => void use()} aria-label={`Dùng mẫu ${sample.label}`}>
          {busy ? "Đang mở…" : "Dùng mẫu này"}
        </Button>
      </Row>
    </li>
  );
}

/** "Nhà mẫu": open a ready-made house and edit it instead of starting from a blank lot. */
export function SampleGallery() {
  return (
    <section aria-label="Nhà mẫu" className="mt-10">
      <Row className="mb-3 items-center gap-2">
        <Sparkles size={18} className="text-brand-600" />
        <h2 className="text-base font-semibold text-ink">Nhà mẫu — mở ra dùng ngay</h2>
      </Row>
      <TextMuted as="p" className="mb-4 text-sm">
        Đã có sẵn tường, cửa, cầu thang, phòng và nội thất. Mở một mẫu rồi sửa theo ý mình: kích thước lô, phòng, đồ đạc, tài chính…
      </TextMuted>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SAMPLE_HOUSES.map((s) => (
          <SampleCard key={s.id} sample={s} />
        ))}
      </ul>
    </section>
  );
}
