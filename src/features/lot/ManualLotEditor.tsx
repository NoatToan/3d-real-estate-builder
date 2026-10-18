"use client";

import { Plus, Trash2 } from "lucide-react";
import { Box, Col, Row, TextMuted } from "@/components/ui/BasePrimitives";
import { Button, IconButton } from "@/components/ui/Button";
import { NumberField } from "@/components/ui/Fields";
import type { Vec2 } from "@/domain/types";
import { rectPolygon } from "@/domain/factory";
import { fmtArea } from "@/domain/labels";
import { area, edgeLengths, isSimplePolygon } from "@/geometry/polygon";
import { LotPreview } from "./LotPreview";
import { vertexName } from "./TraceCanvas";

/** Edits the lot polygon directly by vertex coordinates (no certificate image). */
export function ManualLotEditor({ polygon, onChange }: { polygon: Vec2[]; onChange: (p: Vec2[]) => void }) {
  const lens = edgeLengths(polygon);
  const valid = polygon.length >= 3 && isSimplePolygon(polygon);
  const setPoint = (i: number, patch: Partial<Vec2>) => onChange(polygon.map((p, k) => (k === i ? { ...p, ...patch } : p)));

  return (
    <Row className="min-h-0 flex-1 gap-4">
      <Col className="w-96 shrink-0 gap-3 overflow-y-auto">
        <TextMuted as="p" className="text-xs">
          Nhập toạ độ các góc thửa đất theo mét (gốc toạ độ tuỳ chọn, trục y hướng xuống). Có thể bắt đầu từ hình chữ nhật mẫu.
        </TextMuted>
        <Row className="flex-wrap gap-1">
          {[
            [4, 16],
            [5, 20],
            [6, 18],
            [8, 20],
            [10, 25],
          ].map(([w, d]) => (
            <Button key={`${w}x${d}`} size="sm" onClick={() => onChange(rectPolygon(w, d))}>
              {w}×{d} m
            </Button>
          ))}
        </Row>
        <Box className="grid grid-cols-[2rem_1fr_1fr_4.5rem_2rem] items-end gap-2 text-xs">
          <TextMuted>Góc</TextMuted>
          <TextMuted>x (m)</TextMuted>
          <TextMuted>y (m)</TextMuted>
          <TextMuted>Cạnh tới</TextMuted>
          <Box />
          {polygon.map((p, i) => (
            <Row key={i} className="contents">
              <TextMuted className="pb-2 font-semibold">{vertexName(i)}</TextMuted>
              <NumberField aria-label={`x ${vertexName(i)}`} value={p.x} onCommit={(n) => n != null && setPoint(i, { x: n })} min={-1000} max={1000} />
              <NumberField aria-label={`y ${vertexName(i)}`} value={p.y} onCommit={(n) => n != null && setPoint(i, { y: n })} min={-1000} max={1000} />
              <TextMuted className="pb-2 tabular-nums">{lens[i].toFixed(2).replace(".", ",")}</TextMuted>
              <IconButton label={`Xoá góc ${vertexName(i)}`} disabled={polygon.length <= 3} onClick={() => onChange(polygon.filter((_, k) => k !== i))}>
                <Trash2 size={14} />
              </IconButton>
            </Row>
          ))}
        </Box>
        <Button
          size="sm"
          icon={<Plus size={14} />}
          onClick={() => {
            const a = polygon[polygon.length - 1];
            const b = polygon[0];
            onChange([...polygon, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }]);
          }}
        >
          Thêm góc
        </Button>
        <TextMuted as="p" className={`text-sm ${valid ? "" : "text-danger-600"}`}>
          {valid ? `Diện tích: ${fmtArea(area(polygon))}` : "Các cạnh đang cắt nhau — hãy sửa toạ độ."}
        </TextMuted>
      </Col>
      <Box className="min-w-0 flex-1 rounded-lg border border-line bg-surface p-2">
        <LotPreview polygon={polygon} height={460} />
      </Box>
    </Row>
  );
}
