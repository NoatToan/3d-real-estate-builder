"use client";

import { useMemo, useState } from "react";
import { Check, X } from "lucide-react";
import { Box, Col, Row, Text, TextFaint, TextMuted } from "@/components/ui/BasePrimitives";
import { Button } from "@/components/ui/Button";
import { NumberField, SegmentedControl } from "@/components/ui/Fields";
import { Modal } from "@/components/ui/Modal";
import { toast } from "@/components/ui/Toast";
import { useProjectStore } from "@/store/projectStore";
import { useEditorStore } from "@/store/editorStore";
import { useActiveFloor } from "@/features/plan/hooks";
import { applyRoomPlacement, autoPlaceRooms, ensureShell, findRoomPlacements, FREE_ROOM_TYPES, ROOM_PROGRAMMES, ROOM_TEMPLATES, roomTemplate, type RoomPlacement } from "@/domain/roomPlacer";
import { furnitureRect } from "@/domain/furniture";
import { fmtArea, ROOM_TYPE_COLORS } from "@/domain/labels";
import type { Floor, Vec2 } from "@/domain/types";
import { bbox, centroid } from "@/geometry/polygon";
import { generateStair } from "@/geometry/stairs";

type Mode = "one" | "set";

const pts = (poly: readonly Vec2[]) => poly.map((p) => `${p.x},${p.y}`).join(" ");

/** Plan of the floor with the candidate spots (numbered) or the rooms placed by "Tự xếp". */
function Preview({ floor, candidates, selected, highlight }: { floor: Floor; candidates: RoomPlacement[]; selected: number; highlight: RoomPlacement[] }) {
  const all = floor.walls.flatMap((w) => [w.a, w.b]);
  if (!all.length) return null;
  const b = bbox(all);
  const pad = 0.6;
  return (
    <svg viewBox={`${b.minX - pad} ${b.minY - pad} ${b.maxX - b.minX + 2 * pad} ${b.maxY - b.minY + 2 * pad}`} className="h-96 w-full rounded-md border border-line bg-canvas" role="img" aria-label="Xem trước vị trí phòng">
      {floor.rooms.map((r) => (
        <polygon key={r.id} points={pts(r.polygon)} fill={ROOM_TYPE_COLORS[r.type]} fillOpacity={FREE_ROOM_TYPES.includes(r.type) ? 0.25 : 0.7} />
      ))}
      {floor.stairs.map((s) => (
        <polygon key={s.id} points={pts(generateStair(s, floor.height).footprint)} fill="#ede9fe" stroke="#7c3aed" strokeWidth={0.04} />
      ))}
      {floor.furniture.map((f) => (
        <polygon key={f.id} points={pts(furnitureRect(f))} fill="#fff" stroke="#64748b" strokeWidth={0.03} />
      ))}
      {floor.walls.map((w) => (
        <line key={w.id} x1={w.a.x} y1={w.a.y} x2={w.b.x} y2={w.b.y} stroke="#334155" strokeWidth={w.thickness} strokeLinecap="square" />
      ))}
      {highlight.map((h) => (
        <polygon key={h.key} points={pts(h.rect)} fill="none" stroke="#2563eb" strokeWidth={0.08} />
      ))}
      {candidates.map((c, i) =>
        i === selected ? null : <polygon key={c.key} points={pts(c.rect)} fill="#93c5fd" fillOpacity={0.25} stroke="#3b82f6" strokeWidth={0.05} strokeDasharray="0.25 0.15" />,
      )}
      {candidates[selected] && (
        <g>
          <polygon points={pts(candidates[selected].rect)} fill="#bfdbfe" fillOpacity={0.6} stroke="#1d4ed8" strokeWidth={0.08} />
          {candidates[selected].furniture.map((f) => (
            <polygon key={f.id} points={pts(furnitureRect(f))} fill="#fff" stroke="#1e3a8a" strokeWidth={0.03} />
          ))}
          {candidates[selected].walls.map((w) => (
            <line key={w.id} x1={w.a.x} y1={w.a.y} x2={w.b.x} y2={w.b.y} stroke="#1d4ed8" strokeWidth={w.thickness} strokeLinecap="square" />
          ))}
        </g>
      )}
      {candidates.map((c, i) => {
        const at = centroid(c.rect);
        return (
          <text key={c.key} x={at.x} y={at.y} fontSize={0.7} textAnchor="middle" dominantBaseline="middle" fill={i === selected ? "#1e3a8a" : "#2563eb"} fontWeight={700} stroke="#fff" strokeWidth={0.15} paintOrder="stroke">
            {i + 1}
          </text>
        );
      })}
      {highlight.map((h) => (
        <text key={h.key} x={h.label.at.x} y={h.label.at.y} fontSize={0.4} textAnchor="middle" dominantBaseline="middle" fill="#0f172a" fontWeight={600} stroke="#fff" strokeWidth={0.12} paintOrder="stroke">
          {h.label.name}
        </text>
      ))}
    </svg>
  );
}

function Reasons({ pl }: { pl: RoomPlacement }) {
  return (
    <ul className="flex flex-col gap-0.5 text-xs">
      {pl.pros.map((t) => (
        <li key={t} className="flex items-start gap-1 text-success-600">
          <Check size={12} className="mt-0.5 shrink-0" />
          <TextMuted>{t}</TextMuted>
        </li>
      ))}
      {pl.cons.map((t) => (
        <li key={t} className="flex items-start gap-1 text-danger-600">
          <X size={12} className="mt-0.5 shrink-0" />
          <TextMuted>{t}</TextMuted>
        </li>
      ))}
    </ul>
  );
}

export function RoomPlacerDialog({ onClose }: { onClose: () => void }) {
  const project = useProjectStore((s) => s.project)!;
  const { floor, index } = useActiveFloor();
  const [mode, setMode] = useState<Mode>("one");
  const [templateId, setTemplateId] = useState("master");
  const [width, setWidth] = useState<number | null>(roomTemplate("master").width);
  const [depth, setDepth] = useState<number | null>(roomTemplate("master").depth);
  const [selected, setSelected] = useState(0);
  const [programmeId, setProgrammeId] = useState(ROOM_PROGRAMMES[0].id);

  const template = roomTemplate(templateId);
  const base = useMemo(() => (floor ? ensureShell(project, floor) : null), [project, floor]);
  const candidates = useMemo(
    () => (base && mode === "one" ? findRoomPlacements(project, base.floor, { template, width: width ?? template.width, depth: depth ?? template.depth }, 3) : []),
    [project, base, mode, template, width, depth],
  );
  const programme = ROOM_PROGRAMMES.find((p) => p.id === programmeId)!;
  const auto = useMemo(() => (floor && mode === "set" ? autoPlaceRooms(project, floor, programme.rooms.map((id) => ({ template: roomTemplate(id) }))) : null), [project, floor, mode, programme]);
  if (!floor || !base) return null;

  const hasFree = base.floor.rooms.some((r) => FREE_ROOM_TYPES.includes(r.type));
  const pick = (id: string) => {
    const t = roomTemplate(id);
    setTemplateId(id);
    setWidth(t.width);
    setDepth(t.depth);
    setSelected(0);
  };
  const w = width ?? template.width;
  const d = depth ?? template.depth;
  const tooSmall = Math.min(w, d) < template.minWidth || w * d < template.minArea;
  const lowFloor = index === 0 && project.floors.length > 1 && (template.type === "bedroom" || mode === "set");
  const chosen = candidates[Math.min(selected, candidates.length - 1)];

  const apply = () => {
    const next = mode === "one" ? (chosen ? applyRoomPlacement(base.floor, chosen) : null) : auto?.placed.length ? auto.floor : null;
    if (!next) return;
    useProjectStore.getState().setFloorLayout(floor.id, next);
    useEditorStore.getState().select(null);
    useEditorStore.getState().setTool("select");
    useEditorStore.getState().requestFit();
    toast.success(mode === "one" ? `Đã đặt ${chosen!.label.name}. Bấm vào phòng hoặc đồ nội thất để chỉnh.` : `Đã xếp ${auto!.placed.length} phòng trên ${floor.name}.`);
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={`Phòng mẫu · ${floor.name}`}
      footer={
        <>
          <TextMuted className="mr-auto text-xs">Có thể hoàn tác bằng Ctrl+Z.</TextMuted>
          <Button onClick={onClose}>Huỷ</Button>
          <Button variant="primary" onClick={apply} disabled={mode === "one" ? !chosen : !auto?.placed.length}>
            {mode === "one" ? "Đặt phòng" : "Xếp các phòng"}
          </Button>
        </>
      }
    >
      <Col className="gap-3">
        <TextMuted as="p" className="text-sm">
          Chọn một phòng theo kích thước thông dụng, ứng dụng tìm chỗ hợp lý trên mặt sàn (phòng ngủ cần tường mặt tiền/mặt sau để mở cửa sổ, ưu tiên phía sau yên tĩnh, gần WC, tránh bếp và chỗ để xe, không chắn lối đi) rồi tự dựng vách, cửa, cửa sổ và nội thất. Chỉ đặt vào phần sàn chưa có công năng (loại &quot;Khác&quot;).
        </TextMuted>
        <SegmentedControl
          label="Cách đặt"
          value={mode}
          options={[
            { value: "one", label: "Đặt 1 phòng" },
            { value: "set", label: "Tự xếp nhiều phòng" },
          ]}
          onChange={setMode}
        />
        {base.added && <Text className="rounded-md bg-brand-50 px-2 py-1.5 text-xs text-ink">Tầng này chưa có tường: sẽ tự dựng tường bao theo ranh đất (hoặc chỉ giới xây dựng) trước khi đặt phòng.</Text>}
        {lowFloor && <Text className="rounded-md bg-warning-50 px-2 py-1.5 text-xs text-warning-800">Tầng trệt thường để xe, kinh doanh, phòng khách; phòng ngủ nên đặt ở tầng trên cho yên tĩnh và riêng tư.</Text>}

        <Box className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <Col className="gap-2">
            {mode === "one" ? (
              <>
                <Box className="grid grid-cols-2 gap-2">
                  {ROOM_TEMPLATES.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      role="radio"
                      aria-checked={templateId === t.id}
                      onClick={() => pick(t.id)}
                      className={`rounded-lg border p-2 text-left transition-colors ${templateId === t.id ? "border-brand-500 bg-brand-50 ring-2 ring-brand-200" : "border-line hover:bg-surface-muted"}`}
                    >
                      <Text className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                        <Text className="h-3 w-3 shrink-0 rounded-sm border border-line" style={{ background: ROOM_TYPE_COLORS[t.type] }} />
                        {t.label}
                      </Text>
                      <TextMuted className="block text-xs">
                        {t.width.toLocaleString("vi-VN")} × {t.depth.toLocaleString("vi-VN")} m · {t.description}
                      </TextMuted>
                    </button>
                  ))}
                </Box>
                <Row className="gap-2">
                  <NumberField className="flex-1" label="Rộng (lọt lòng)" value={width} onCommit={(v) => {
                    setWidth(v);
                    setSelected(0);
                  }} min={0.8} max={15} suffix="m" />
                  <NumberField className="flex-1" label="Dài (lọt lòng)" value={depth} onCommit={(v) => {
                    setDepth(v);
                    setSelected(0);
                  }} min={0.8} max={15} suffix="m" />
                </Row>
                <TextFaint className="text-xs">
                  Diện tích ≈ {fmtArea(w * d)} · khuyến nghị rộng ≥ {template.minWidth.toLocaleString("vi-VN")} m, ≥ {template.minArea} m²
                </TextFaint>
                {tooSmall && <Text className="rounded-md bg-warning-50 px-2 py-1.5 text-xs text-warning-800">Nhỏ hơn kích thước khuyến nghị cho {template.label.toLowerCase()}.</Text>}
              </>
            ) : (
              <>
                <Box className="grid grid-cols-1 gap-2">
                  {ROOM_PROGRAMMES.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      role="radio"
                      aria-checked={programmeId === p.id}
                      onClick={() => setProgrammeId(p.id)}
                      className={`rounded-lg border p-2 text-left transition-colors ${programmeId === p.id ? "border-brand-500 bg-brand-50 ring-2 ring-brand-200" : "border-line hover:bg-surface-muted"}`}
                    >
                      <Text className="block text-sm font-semibold text-ink">{p.label}</Text>
                      <TextMuted className="block text-xs">{p.rooms.map((id) => roomTemplate(id).label).join(" · ")}</TextMuted>
                    </button>
                  ))}
                </Box>
                <TextFaint className="text-xs">Các phòng được đặt lần lượt, mỗi phòng vào chỗ tốt nhất còn lại.</TextFaint>
              </>
            )}
          </Col>

          <Col className="gap-2">
            {!hasFree ? (
              <TextMuted className="text-sm">Không còn phần sàn trống: mọi phòng trên tầng đã có công năng. Đổi một phòng về loại &quot;Khác&quot; ở bảng bên phải, hoặc dùng mẫu &quot;Sàn trống&quot; trong Tạo nhanh.</TextMuted>
            ) : mode === "one" ? (
              <>
                <Preview floor={base.floor} candidates={candidates} selected={Math.min(selected, candidates.length - 1)} highlight={[]} />
                {candidates.length ? (
                  <Col role="radiogroup" aria-label="Vị trí đề xuất" className="gap-1.5">
                    {candidates.map((c, i) => (
                      <button
                        key={c.key}
                        type="button"
                        role="radio"
                        aria-checked={i === selected}
                        onClick={() => setSelected(i)}
                        className={`rounded-lg border p-2 text-left ${i === selected ? "border-brand-500 bg-brand-50" : "border-line hover:bg-surface-muted"}`}
                      >
                        <Row className="items-center justify-between">
                          <Text className="text-sm font-semibold text-ink">
                            Vị trí {i + 1}
                            {i === 0 ? " · phù hợp nhất" : ""}
                          </Text>
                          <TextFaint className="text-xs tabular-nums">{Math.round(c.score)} điểm</TextFaint>
                        </Row>
                        <Reasons pl={c} />
                      </button>
                    ))}
                  </Col>
                ) : (
                  <TextMuted className="text-sm">Không tìm được chỗ đủ rộng mà vẫn giữ lối đi. Thử giảm kích thước hoặc xoay phòng (đổi rộng ↔ dài).</TextMuted>
                )}
              </>
            ) : (
              auto && (
                <>
                  <Preview floor={auto.floor} candidates={[]} selected={-1} highlight={auto.placed} />
                  <Col className="gap-1.5">
                    {auto.placed.map((p) => (
                      <Col key={p.key} className="rounded-lg border border-line p-2">
                        <Text className="text-sm font-semibold text-ink">{p.label.name}</Text>
                        <Reasons pl={p} />
                      </Col>
                    ))}
                    {auto.failed.length > 0 && (
                      <Text className="rounded-md bg-warning-50 px-2 py-1.5 text-xs text-warning-800">Không đủ chỗ cho: {auto.failed.map((r) => r.template.label).join(", ")}.</Text>
                    )}
                  </Col>
                </>
              )
            )}
          </Col>
        </Box>
      </Col>
    </Modal>
  );
}
