"use client";

import { useMemo } from "react";
import { CircleCheck, CircleX, Compass, TriangleAlert, Wrench } from "lucide-react";
import { Box, Col, Row, Text, TextFaint, TextMuted } from "@/components/ui/BasePrimitives";
import { Button } from "@/components/ui/Button";
import { NumberField, SegmentedControl, Toggle } from "@/components/ui/Fields";
import { useProjectStore } from "@/store/projectStore";
import { useEditorStore } from "@/store/editorStore";
import { analyzeFengShui, DIRECTION_LABELS, kuaNumber, KUA_LABELS, starOf, STAR_INFO, type CheckLevel, type FengShuiCheck } from "@/domain/fengShui";
import type { Direction } from "@/domain/types";

/** 3×3 compass: the 8 directions around the centre, laid out like a map (north on top). */
const ROSE: (Direction | null)[] = ["NW", "N", "NE", "W", null, "E", "SW", "S", "SE"];

const LEVEL_ICON: Record<CheckLevel, React.ReactNode> = {
  good: <CircleCheck size={14} className="mt-0.5 shrink-0 text-success-600" />,
  warn: <TriangleAlert size={14} className="mt-0.5 shrink-0 text-warning-600" />,
  bad: <CircleX size={14} className="mt-0.5 shrink-0 text-danger-600" />,
};

function CheckRow({ c }: { c: FengShuiCheck }) {
  const select = () => {
    if (!c.floorId) return;
    const ed = useEditorStore.getState();
    ed.setActiveFloor(c.floorId);
    if (c.entityIds?.length) ed.select({ floorId: c.floorId, ids: c.entityIds });
  };
  return (
    <li className="flex items-start gap-1.5">
      {LEVEL_ICON[c.level]}
      <Col className="min-w-0 flex-1">
        <button type="button" onClick={select} className="text-left text-xs font-medium text-ink hover:underline">
          {c.title}
        </button>
        <TextMuted className="text-xs">{c.detail}</TextMuted>
        {c.fix && (
          <Button
            size="sm"
            variant="ghost"
            className="self-start"
            icon={<Wrench size={12} />}
            onClick={() => useProjectStore.getState().updateStair(c.fix!.floorId, c.fix!.stairId, { riserCount: c.fix!.riserCount })}
          >
            {c.fix.label}
          </Button>
        )}
      </Col>
    </li>
  );
}

/** "Phong thuỷ" section: owner's year + house facing → cung mệnh, good/bad directions, checks. */
export function FengShuiPanel() {
  const project = useProjectStore((s) => s.project)!;
  const fs = project.fengShui;
  const set = useProjectStore.getState().setFengShui;
  const showSectors = useEditorStore((s) => s.show.fengShui);
  const result = useMemo(() => analyzeFengShui(project), [project]);
  const kua = fs.birthYear ? kuaNumber(fs.birthYear, fs.gender) : null;

  return (
    <Col className="gap-2">
      <Row className="items-end gap-2">
        <NumberField className="flex-1" label="Năm sinh gia chủ (âm lịch)" value={fs.birthYear} allowEmpty min={1900} max={2100} step={1} decimals={0} placeholder="vd 1990" onCommit={(birthYear) => set({ birthYear })} />
        <SegmentedControl
          label="Giới tính"
          value={fs.gender}
          options={[
            { value: "male", label: "Nam" },
            { value: "female", label: "Nữ" },
          ]}
          onChange={(gender) => set({ gender })}
        />
      </Row>
      <TextFaint className="text-xs">Sinh tháng 1–2 dương lịch (trước Tết) thì lấy năm trước.</TextFaint>

      <Text className="text-sm text-ink">Hướng nhà (đứng trong nhà nhìn ra cửa chính)</Text>
      <Box role="radiogroup" aria-label="Hướng nhà" className="grid grid-cols-3 gap-1">
        {ROSE.map((d, i) => {
          if (!d)
            return (
              <Text key={i} className="flex flex-col items-center justify-center text-ink-muted">
                <Compass size={20} />
                {kua && <Text className="text-micro">{KUA_LABELS[kua].name}</Text>}
              </Text>
            );
          const star = kua ? starOf(kua, d) : null;
          const good = star ? STAR_INFO[star].good : null;
          const active = fs.facing === d;
          return (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={DIRECTION_LABELS[d]}
              onClick={() => set({ facing: d })}
              className={`flex flex-col items-center rounded-md border px-1 py-1 text-xs leading-tight ${
                active ? "border-brand-600 ring-2 ring-brand-200" : "border-line"
              } ${good == null ? "bg-surface" : good ? "bg-success-50 text-success-800" : "bg-danger-50 text-danger-800"}`}
            >
              <Text className="font-semibold">{DIRECTION_LABELS[d]}</Text>
              {star && <Text className="text-micro">{STAR_INFO[star].label}</Text>}
            </button>
          );
        })}
      </Box>

      {result ? (
        <>
          <Row className="items-center gap-2 rounded-md bg-surface-muted px-2 py-1.5">
            <Text className="text-sm font-semibold text-ink">
              Cung {result.kuaName} · {result.group}
            </Text>
            <Text className={`ml-auto rounded-full px-2 text-xs font-bold text-white ${result.score >= 80 ? "bg-success-600" : result.score >= 55 ? "bg-warning-600" : "bg-danger-600"}`}>{result.score}/100</Text>
          </Row>
          {!fs.facing && <TextMuted className="text-xs">Chọn hướng nhà để kiểm tra vị trí bếp, WC, bàn thờ, phòng ngủ.</TextMuted>}
          <Toggle label="Hiện 8 cung trên mặt bằng" checked={showSectors} onChange={(fengShui) => useEditorStore.getState().setShow({ fengShui })} />
          <ul aria-label="Kết quả phong thuỷ" className="flex flex-col gap-2">
            {result.checks.map((c) => (
              <CheckRow key={c.id} c={c} />
            ))}
          </ul>
          <TextFaint className="text-xs">Theo Bát trạch, mang tính tham khảo. Cung tính từ tâm nhà của từng tầng.</TextFaint>
        </>
      ) : (
        <TextMuted className="text-xs">Nhập năm sinh để xem cung mệnh, hướng tốt/xấu và kiểm tra bố trí.</TextMuted>
      )}
    </Col>
  );
}
