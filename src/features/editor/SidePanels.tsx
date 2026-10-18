"use client";

import { useMemo } from "react";
import { CircleAlert, Info, TriangleAlert } from "lucide-react";
import { Box, Col, Row, Text, TextFaint, TextMuted } from "@/components/ui/BasePrimitives";
import { NumberField, Toggle } from "@/components/ui/Fields";
import { Section } from "@/components/ui/Section";
import { useProjectStore } from "@/store/projectStore";
import { useEditorStore } from "@/store/editorStore";
import type { Issue } from "@/domain/validation";
import { computeStats } from "@/domain/stats";
import { fmtArea, fmtLength, fmtPercent } from "@/domain/labels";
import { edgeLengths } from "@/geometry/polygon";

const LEVEL_ICON = {
  error: <CircleAlert size={14} className="mt-0.5 shrink-0 text-danger-600" />,
  warning: <TriangleAlert size={14} className="mt-0.5 shrink-0 text-warning-600" />,
  info: <Info size={14} className="mt-0.5 shrink-0 text-brand-600" />,
};

function IssuesList({ issues }: { issues: Issue[] }) {
  if (!issues.length)
    return (
      <TextMuted as="p" className="text-xs">
        Không có vấn đề nào.
      </TextMuted>
    );
  return (
    <ul className="flex flex-col gap-1">
      {issues.map((i) => (
        <li key={i.id}>
          <button
            type="button"
            onClick={() => {
              const ed = useEditorStore.getState();
              if (i.floorId) ed.setActiveFloor(i.floorId);
              if (i.floorId && i.entityIds?.length) ed.select({ floorId: i.floorId, ids: i.entityIds });
            }}
            className="flex w-full items-start gap-1.5 rounded px-1.5 py-1 text-left text-xs text-ink hover:bg-surface-muted"
          >
            {LEVEL_ICON[i.level]}
            <Text>{i.message}</Text>
          </button>
        </li>
      ))}
    </ul>
  );
}

function StatRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <Row className="justify-between py-0.5 text-xs">
      <TextMuted>{label}</TextMuted>
      <Text tone="primary" className={`tabular-nums ${strong ? "font-semibold" : ""}`}>
        {value}
      </Text>
    </Row>
  );
}

function Stats() {
  const project = useProjectStore((s) => s.project)!;
  const s = useMemo(() => computeStats(project), [project]);
  return (
    <Col>
      <StatRow label="Diện tích đất (tính)" value={fmtArea(s.lotArea)} strong />
      {s.certifiedArea != null && <StatRow label="Diện tích trên sổ" value={fmtArea(s.certifiedArea)} />}
      {s.buildableArea != null && <StatRow label="Diện tích trong chỉ giới" value={fmtArea(s.buildableArea)} />}
      <StatRow label="Diện tích xây dựng (tầng 1)" value={fmtArea(s.footprintArea)} />
      <StatRow label="Mật độ xây dựng" value={fmtPercent(s.coverage)} strong />
      <StatRow label="Tổng diện tích sàn" value={fmtArea(s.totalFloorArea)} strong />
      <StatRow label="Hệ số sử dụng đất" value={s.floorAreaRatio.toFixed(2).replace(".", ",")} />
      <StatRow label="Chiều cao công trình" value={fmtLength(s.totalHeight)} />
      <Box className="mt-2 border-t border-line pt-2">
        {s.floors.map((f) => (
          <Row key={f.id} className="justify-between py-0.5 text-xs">
            <TextMuted className="truncate">
              {f.name} <TextFaint>(+{f.elevation.toFixed(2).replace(".", ",")} m)</TextFaint>
            </TextMuted>
            <Text tone="primary" className="tabular-nums">
              {fmtArea(f.grossArea)} · {f.roomCount} phòng
            </Text>
          </Row>
        ))}
      </Box>
    </Col>
  );
}

function Constraints() {
  const project = useProjectStore((s) => s.project)!;
  const set = useProjectStore((s) => s.setConstraints);
  const c = project.constraints;
  const lens = edgeLengths(project.lot.polygon);
  return (
    <Col className="gap-1">
      <Toggle label="Không cho xây ra ngoài ranh đất" checked={c.keepInsideLot} onChange={(keepInsideLot) => set({ keepInsideLot })} />
      <Toggle label="Khoảng lùi xây dựng" hint="Nhập khoảng lùi cho từng cạnh thửa đất" checked={c.setback.enabled} onChange={(enabled) => set({ setback: { ...c.setback, enabled } })} />
      {c.setback.enabled && (
        <Box className="grid grid-cols-2 gap-2 pl-1">
          {lens.map((L, i) => (
            <NumberField
              key={i}
              label={`Cạnh ${i + 1} (${fmtLength(L)})`}
              value={c.setback.perEdge[i] ?? 0}
              min={0}
              max={50}
              suffix="m"
              onCommit={(n) => {
                const perEdge = lens.map((_, k) => (k === i ? (n ?? 0) : (c.setback.perEdge[k] ?? 0)));
                set({ setback: { ...c.setback, perEdge } });
              }}
            />
          ))}
        </Box>
      )}
      <Toggle label="Cho phép tầng trên đua ra / ban công" hint="Tầng trên được vượt chỉ giới (vẫn trong ranh đất)" checked={c.allowOverhang} onChange={(allowOverhang) => set({ allowOverhang })} />
      <Toggle label="Hiện thống kê diện tích" checked={c.showStats} onChange={(showStats) => set({ showStats })} />
    </Col>
  );
}

function Display() {
  const show = useEditorStore((s) => s.show);
  const viewer = useEditorStore((s) => s.viewer);
  const snap = useEditorStore((s) => s.snap);
  const hasImage = useProjectStore((s) => !!s.project?.lot.imageId && !!s.project?.lot.trace);
  const ed = useEditorStore.getState();
  return (
    <Col className="gap-1">
      <TextFaint className="text-caption font-semibold uppercase">Mặt bằng 2D</TextFaint>
      <Toggle label="Bắt điểm (snap)" checked={snap.enabled} onChange={(enabled) => ed.setSnap({ enabled })} />
      <Toggle label="Lưới" checked={show.grid} onChange={(grid) => ed.setShow({ grid })} />
      <Toggle label="Kích thước vách" checked={show.dimensions} onChange={(dimensions) => ed.setShow({ dimensions })} />
      <Toggle label="Tên & diện tích phòng" checked={show.roomLabels} onChange={(roomLabels) => ed.setShow({ roomLabels })} />
      <Toggle label="Hiện mờ tầng dưới" checked={show.ghostBelow} onChange={(ghostBelow) => ed.setShow({ ghostBelow })} />
      {hasImage && <Toggle label="Ảnh sổ đỏ làm nền" checked={show.lotImage} onChange={(lotImage) => ed.setShow({ lotImage })} />}
      <TextFaint className="mt-2 text-caption font-semibold uppercase">Xem 3D</TextFaint>
      <Toggle label="Chỉ hiện đến tầng đang chọn" checked={viewer.upToActive} onChange={(upToActive) => ed.setViewer({ upToActive })} />
      <Toggle label="Mái bằng trên cùng" checked={viewer.roof} onChange={(roof) => ed.setViewer({ roof })} />
      <label className="mt-1 text-sm text-ink" htmlFor="explode">
        Tách tầng: {viewer.explode.toFixed(1).replace(".", ",")} m
      </label>
      <input id="explode" type="range" min={0} max={4} step={0.1} value={viewer.explode} onChange={(e) => ed.setViewer({ explode: Number(e.target.value) })} className="accent-brand-600" />
    </Col>
  );
}

export function SidePanels({ issues }: { issues: Issue[] }) {
  const panels = useEditorStore((s) => s.panels);
  const toggle = useEditorStore((s) => s.togglePanel);
  const showStats = useProjectStore((s) => s.project?.constraints.showStats ?? true);
  const errors = issues.filter((i) => i.level === "error").length;
  const warnings = issues.filter((i) => i.level === "warning").length;
  return (
    <>
      <Section
        title="Kiểm tra"
        open={panels.issues}
        onToggle={() => toggle("issues")}
        badge={
          errors + warnings > 0 ? (
            <Text className={`ml-1 rounded-full px-1.5 text-micro font-semibold text-white ${errors ? "bg-danger-600" : "bg-warning-600"}`}>{errors + warnings}</Text>
          ) : undefined
        }
      >
        <IssuesList issues={issues} />
      </Section>
      {showStats && (
        <Section title="Thống kê diện tích" open={panels.stats} onToggle={() => toggle("stats")}>
          <Stats />
        </Section>
      )}
      <Section title="Ràng buộc (tuỳ chọn)" open={panels.constraints} onToggle={() => toggle("constraints")}>
        <Constraints />
      </Section>
      <Section title="Hiển thị" open={panels.display} onToggle={() => toggle("display")}>
        <Display />
      </Section>
    </>
  );
}
