"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Box, Col, Row, Text, TextFaint, TextMuted } from "@/components/ui/BasePrimitives";
import { Button, IconButton } from "@/components/ui/Button";
import { NumberField, SelectField, TextField, Toggle } from "@/components/ui/Fields";
import { Modal } from "@/components/ui/Modal";
import { toast } from "@/components/ui/Toast";
import { useProjectStore } from "@/store/projectStore";
import { useEditorStore } from "@/store/editorStore";
import { useActiveFloor } from "@/features/plan/hooks";
import { planQuickFloor, QUICK_TEMPLATES, quickFloorOutline, type QuickFloorPlan, type QuickZone } from "@/domain/quickFloor";
import { furnitureRect } from "@/domain/furniture";
import { fmtLength, ROOM_TYPE_COLORS, ROOM_TYPE_LABELS } from "@/domain/labels";
import { ROOM_TYPES, type Vec2 } from "@/domain/types";
import { bbox, edgeLengths } from "@/geometry/polygon";
import { generateStair } from "@/geometry/stairs";

/** Schematic of the generated floor: walls, stair, furniture and room names. */
function Preview({ plan, outline, floorHeight }: { plan: QuickFloorPlan; outline: Vec2[]; floorHeight: number }) {
  const b = bbox(outline);
  const pad = 0.6;
  const pts = (poly: Vec2[]) => poly.map((p) => `${p.x},${p.y}`).join(" ");
  return (
    <svg viewBox={`${b.minX - pad} ${b.minY - pad} ${b.maxX - b.minX + 2 * pad} ${b.maxY - b.minY + 2 * pad}`} className="h-72 w-full rounded-md border border-line bg-canvas" role="img" aria-label="Xem trước mặt sàn">
      <polygon points={pts(outline)} fill="#f0fdf4" stroke="#16a34a" strokeWidth={0.05} strokeDasharray="0.2 0.12" />
      {plan.stairs.map((s) => (
        <polygon key={s.id} points={pts(generateStair(s, floorHeight).footprint)} fill="#ede9fe" stroke="#7c3aed" strokeWidth={0.04} />
      ))}
      {plan.furniture.map((f) => (
        <polygon key={f.id} points={pts(furnitureRect(f))} fill="#fff" stroke="#64748b" strokeWidth={0.03} />
      ))}
      {plan.walls.map((w) => (
        <line key={w.id} x1={w.a.x} y1={w.a.y} x2={w.b.x} y2={w.b.y} stroke="#334155" strokeWidth={w.thickness} strokeLinecap="square" />
      ))}
      {plan.labels.map((l, i) => (
        <text key={i} x={l.at.x} y={l.at.y} fontSize={0.42} textAnchor="middle" dominantBaseline="middle" fill="#0f172a" fontWeight={600} stroke="#fff" strokeWidth={0.12} paintOrder="stroke">
          {l.name}
        </text>
      ))}
    </svg>
  );
}

function ZoneRow({ zone, index, count, onChange, onRemove, onMove }: { zone: QuickZone; index: number; count: number; onChange: (z: QuickZone) => void; onRemove: () => void; onMove: (dir: -1 | 1) => void }) {
  return (
    <Row className="items-end gap-1.5">
      <Text className="mb-2 h-3 w-3 shrink-0 rounded-sm border border-line" style={{ background: ROOM_TYPE_COLORS[zone.type] }} />
      <TextField className="min-w-0 flex-1" label={index === 0 ? "Phòng (từ mặt tiền vào)" : undefined} value={zone.name} onCommit={(name) => onChange({ ...zone, name })} />
      <SelectField className="w-32" label={index === 0 ? "Công năng" : undefined} value={zone.type} options={ROOM_TYPES.map((t) => ({ value: t, label: ROOM_TYPE_LABELS[t] }))} onChange={(type) => onChange({ ...zone, type })} />
      <NumberField
        className="w-24"
        label={index === 0 ? "Chiều sâu" : undefined}
        aria-label={`Chiều sâu ${zone.name}`}
        value={zone.depth > 0 ? zone.depth : null}
        allowEmpty
        placeholder="tự chia"
        min={0}
        max={50}
        suffix="m"
        onCommit={(n) => onChange({ ...zone, depth: n ?? 0 })}
      />
      <IconButton label="Lên" className="h-8 w-7" disabled={index === 0} onClick={() => onMove(-1)}>
        <ArrowUp size={14} />
      </IconButton>
      <IconButton label="Xuống" className="h-8 w-7" disabled={index === count - 1} onClick={() => onMove(1)}>
        <ArrowDown size={14} />
      </IconButton>
      <IconButton label={`Xoá ${zone.name}`} className="h-8 w-7" disabled={count <= 1} onClick={onRemove}>
        <Trash2 size={14} />
      </IconButton>
    </Row>
  );
}

export function QuickFloorDialog({ onClose }: { onClose: () => void }) {
  const project = useProjectStore((s) => s.project)!;
  const { floor, index } = useActiveFloor();
  const [templateId, setTemplateId] = useState(index === 0 ? "ground" : "bedrooms");
  const [zones, setZones] = useState<QuickZone[]>(() => QUICK_TEMPLATES.find((t) => t.id === templateId)!.zones.map((z) => ({ ...z })));
  const [frontEdge, setFrontEdge] = useState(project.constraints.roadCut.enabled ? project.constraints.roadCut.edge : 0);
  const [withStair, setWithStair] = useState(true);

  const outline = useMemo(() => quickFloorOutline(project), [project]);
  const lens = edgeLengths(project.lot.polygon);
  const plan = useMemo(
    () =>
      floor
        ? planQuickFloor(outline, zones, {
            frontEdge,
            withStair,
            isGround: index === 0,
            floorHeight: floor.height,
            exteriorThickness: project.defaults.exteriorWallThickness,
            interiorThickness: project.defaults.wallThickness,
          })
        : null,
    [outline, zones, frontEdge, withStair, index, floor, project.defaults],
  );
  if (!floor) return null;

  const hasContent = floor.walls.length + floor.furniture.length + floor.stairs.length > 0;
  const pickTemplate = (id: string) => {
    setTemplateId(id);
    setZones(QUICK_TEMPLATES.find((t) => t.id === id)!.zones.map((z) => ({ ...z })));
  };
  const apply = () => {
    if (!plan) return;
    useProjectStore.getState().applyQuickFloor(floor.id, plan);
    useEditorStore.getState().select(null);
    useEditorStore.getState().setTool("select");
    useEditorStore.getState().requestFit();
    toast.success(`Đã dựng ${floor.name}. Bấm vào phòng, cửa hay đồ nội thất để chỉnh.`);
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={`Tạo nhanh mặt sàn · ${floor.name}`}
      footer={
        <>
          {hasContent && <TextMuted className="mr-auto text-xs">Vách, cửa, thang và nội thất hiện có của tầng này sẽ được thay thế (có thể hoàn tác bằng Ctrl+Z).</TextMuted>}
          <Button onClick={onClose}>Huỷ</Button>
          <Button variant="primary" onClick={apply} disabled={!plan}>
            Dựng mặt sàn
          </Button>
        </>
      }
    >
      <Col className="gap-3">
        <TextMuted as="p" className="text-sm">
          Chọn một mẫu bố trí, chỉnh tên và chiều sâu từng phòng nếu muốn. Ứng dụng tự dựng tường bao, vách ngăn, cửa, cầu thang, WC và đồ nội thất vừa với lô đất.
        </TextMuted>
        <Box className="grid grid-cols-2 gap-2 md:grid-cols-3">
          {QUICK_TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={templateId === t.id}
              onClick={() => pickTemplate(t.id)}
              className={`rounded-lg border p-2 text-left transition-colors ${templateId === t.id ? "border-brand-500 bg-brand-50 ring-2 ring-brand-200" : "border-line hover:bg-surface-muted"}`}
            >
              <Text className="block text-sm font-semibold text-ink">{t.label}</Text>
              <TextMuted className="block text-xs">{t.description}</TextMuted>
            </button>
          ))}
        </Box>
        <Box className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <Col className="gap-2">
            {zones.map((z, i) => (
              <ZoneRow
                key={i}
                zone={z}
                index={i}
                count={zones.length}
                onChange={(nz) => setZones(zones.map((x, k) => (k === i ? nz : x)))}
                onRemove={() => setZones(zones.filter((_, k) => k !== i))}
                onMove={(dir) => {
                  const next = [...zones];
                  [next[i], next[i + dir]] = [next[i + dir], next[i]];
                  setZones(next);
                }}
              />
            ))}
            <Button size="sm" variant="ghost" icon={<Plus size={14} />} className="self-start" onClick={() => setZones([...zones, { name: "Phòng mới", type: "other", depth: 0 }])}>
              Thêm phòng
            </Button>
            <SelectField
              label="Mặt tiền (phía giáp đường)"
              value={String(frontEdge)}
              options={lens.map((L, i) => ({ value: String(i), label: `Cạnh ${i + 1} (${fmtLength(L)})` }))}
              onChange={(v) => setFrontEdge(Number(v))}
            />
            <Toggle label="Có cầu thang lên tầng trên" hint="Đặt ở dải có tên Cầu thang, sát vách hông" checked={withStair} onChange={setWithStair} />
          </Col>
          <Col className="gap-1">
            {plan ? (
              <>
                <Preview plan={plan} outline={outline} floorHeight={floor.height} />
                <TextFaint className="text-xs">
                  Khu đất xây được ≈ {fmtLength(plan.width)} × {fmtLength(plan.depth)} · {plan.furniture.length} món nội thất · để trống chiều sâu = tự chia đều phần còn lại
                </TextFaint>
              </>
            ) : (
              <TextMuted className="text-sm">Không dựng được với ranh đất hiện tại — hãy kiểm tra lại ranh đất hoặc khoảng lùi.</TextMuted>
            )}
          </Col>
        </Box>
      </Col>
    </Modal>
  );
}
