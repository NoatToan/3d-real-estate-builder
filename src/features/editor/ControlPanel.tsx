"use client";

import type { ReactNode } from "react";
import { ChevronDown, Compass, ListChecks, PanelLeftClose, Settings2, ShieldCheck, SquarePen } from "lucide-react";
import { Col, Row, Text } from "@/components/ui/BasePrimitives";
import { IconButton } from "@/components/ui/Button";
import { useEditorStore, type PanelTab } from "@/store/editorStore";
import { useProjectStore } from "@/store/projectStore";
import type { Issue } from "@/domain/validation";
import { GettingStarted } from "@/features/guide/GettingStarted";
import { Inspector } from "./Inspector";
import { ChecksTab, FengShuiTab, SettingsTab } from "./SidePanels";

const TABS: { id: PanelTab; label: string; icon: ReactNode; hint: string }[] = [
  { id: "start", label: "Bắt đầu", icon: <ListChecks size={17} />, hint: "Các bước dựng nhà" },
  { id: "edit", label: "Chỉnh sửa", icon: <SquarePen size={17} />, hint: "Thông số đối tượng đang chọn, công cụ, tầng" },
  { id: "check", label: "Kiểm tra", icon: <ShieldCheck size={17} />, hint: "Lỗi bản vẽ và thống kê diện tích" },
  { id: "fengshui", label: "Phong thuỷ", icon: <Compass size={17} />, hint: "Cung mệnh, hướng nhà, vị trí phòng" },
  { id: "settings", label: "Cài đặt", icon: <Settings2 size={17} />, hint: "Ràng buộc lô đất, hiển thị" },
];

/**
 * Bảng điều khiển: one topic at a time (tabs) instead of one long column, so a first-time user
 * sees a handful of choices. Selecting an object or picking a drawing tool opens "Chỉnh sửa".
 */
export function ControlPanel({ issues, onCollapse, sheet = false }: { issues: Issue[]; onCollapse: () => void; sheet?: boolean }) {
  const tab = useEditorStore((s) => s.panelTab);
  const setTab = useEditorStore((s) => s.setPanelTab);
  const project = useProjectStore((s) => s.project)!;
  const problems = issues.filter((i) => i.level !== "info").length;
  const hasErrors = issues.some((i) => i.level === "error");
  const stepsDone = [true, project.floors.some((f) => f.walls.length), project.floors.some((f) => f.openings.length), project.floors.some((f) => f.furniture.length), project.floors.length > 1].filter(Boolean).length;

  return (
    <aside data-tour="panel" aria-label="Bảng điều khiển" className={sheet ? "flex h-full w-full flex-col bg-surface" : "flex w-80 shrink-0 flex-col border-r border-line bg-surface"}>
      <Row className="items-center border-b border-line">
        <Row role="tablist" aria-label="Bảng điều khiển" className="min-w-0 flex-1">
          {TABS.map((t) => {
            const active = tab === t.id;
            const badge = t.id === "check" && problems ? problems : t.id === "start" && stepsDone < 5 ? `${stepsDone}/5` : null;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                title={t.hint}
                onClick={() => setTab(t.id)}
                className={`relative flex min-w-0 flex-1 flex-col items-center gap-0.5 border-b-2 px-0.5 pb-1 pt-1.5 text-micro font-medium transition-colors ${
                  active ? "border-brand-600 text-brand-700" : "border-transparent text-ink-muted hover:bg-surface-muted hover:text-ink"
                }`}
              >
                {t.icon}
                <Text className="truncate leading-tight">{t.label}</Text>
                {badge != null && (
                  <Text className={`absolute right-0.5 top-0.5 rounded-full px-1 text-[9px] font-bold leading-[14px] text-white ${t.id === "check" ? (hasErrors ? "bg-danger-600" : "bg-warning-600") : "bg-brand-600"}`}>{badge}</Text>
                )}
              </button>
            );
          })}
        </Row>
        <IconButton label="Thu gọn bảng điều khiển" className="mx-0.5 h-7 w-7 shrink-0" onClick={onCollapse}>
          {sheet ? <ChevronDown size={16} /> : <PanelLeftClose size={15} />}
        </IconButton>
      </Row>
      <Col role="tabpanel" aria-label={TABS.find((t) => t.id === tab)?.label} className="min-h-0 flex-1 overflow-y-auto">
        {tab === "start" && <GettingStarted embedded />}
        {tab === "edit" && <Inspector />}
        {tab === "check" && <ChecksTab issues={issues} />}
        {tab === "fengshui" && <FengShuiTab />}
        {tab === "settings" && <SettingsTab />}
      </Col>
    </aside>
  );
}
