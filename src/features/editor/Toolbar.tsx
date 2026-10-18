"use client";

import type { ReactNode } from "react";
import { AppWindow, BedDouble, BrickWall, CircleHelp, DoorOpen, Footprints, Hand, Maximize2, MousePointer2, Ruler, Sofa, SquareDashed, Wand2 } from "lucide-react";
import { Box, Col, Text } from "@/components/ui/BasePrimitives";
import { useEditorStore, type Tool } from "@/store/editorStore";

export const TOOLS: { tool: Tool; label: string; short: string; key: string; icon: ReactNode; hint: string }[] = [
  { tool: "select", label: "Chọn / di chuyển", short: "Chọn", key: "V", icon: <MousePointer2 size={18} />, hint: "Nhấp vào vách, cửa, đồ nội thất… để chọn và sửa ở bảng bên phải. Kéo để di chuyển, R để xoay, Delete để xoá." },
  { tool: "pan", label: "Cuộn khung nhìn", short: "Cuộn", key: "H", icon: <Hand size={18} />, hint: "Kéo để cuộn. Lăn chuột để phóng to/thu nhỏ." },
  { tool: "wall", label: "Vẽ vách", short: "Vách", key: "W", icon: <BrickWall size={18} />, hint: "Nhấp từng điểm để vẽ vách. Gõ số để nhập độ dài. Enter / nhấp đúp để kết thúc, Esc để huỷ. Giữ Shift để khoá góc." },
  { tool: "room", label: "Vẽ phòng (đa giác)", short: "Phòng", key: "E", icon: <SquareDashed size={18} />, hint: "Nhấp các góc của phòng, nhấp lại điểm đầu hoặc Enter để khép kín. Vách được tạo tự động." },
  { tool: "door", label: "Cửa đi", short: "Cửa đi", key: "D", icon: <DoorOpen size={18} />, hint: "Nhấp lên một vách để đặt cửa đi." },
  { tool: "window", label: "Cửa sổ", short: "Cửa sổ", key: "N", icon: <AppWindow size={18} />, hint: "Nhấp lên một vách để đặt cửa sổ." },
  { tool: "stair", label: "Cầu thang", short: "Thang", key: "S", icon: <Footprints size={18} />, hint: "Nhấp để đặt cầu thang. R để xoay 90°." },
  { tool: "furniture", label: "Nội thất", short: "Nội thất", key: "I", icon: <Sofa size={18} />, hint: "Chọn món đồ trong danh sách bên dưới, rồi nhấp lên mặt bằng để đặt. R để xoay trước khi đặt." },
  { tool: "measure", label: "Đo khoảng cách", short: "Đo", key: "M", icon: <Ruler size={18} />, hint: "Nhấp hai điểm để đo." },
];

function ToolButton({ label, short, shortcut, active, onClick, children }: { label: string; short: string; shortcut?: string; active?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={shortcut ? `${label} (${shortcut})` : label}
      onClick={onClick}
      className={`flex w-16 flex-col items-center gap-0.5 rounded-md px-1 py-1.5 transition-colors focus-visible:outline-2 focus-visible:outline-brand-500 ${
        active ? "bg-brand-600 text-white" : "text-ink hover:bg-surface-muted"
      }`}
    >
      {children}
      <Text className="text-micro font-medium leading-tight">{short}</Text>
    </button>
  );
}

export function Toolbar() {
  const tool = useEditorStore((s) => s.tool);
  const view = useEditorStore((s) => s.view);
  const setTool = (t: Tool) => {
    // Drawing tools work on the 2D plan: bring it into view when only 3D is showing.
    if (view === "3d" && t !== "select" && t !== "pan") useEditorStore.getState().setView("split");
    useEditorStore.getState().setTool(t);
  };
  const requestFit = useEditorStore((s) => s.requestFit);
  const ed = useEditorStore.getState();

  return (
    <nav aria-label="Công cụ" className="flex w-[4.75rem] shrink-0 flex-col items-center gap-0.5 overflow-y-auto border-r border-line bg-surface py-2">
      <ToolButton label="Tạo nhanh mặt sàn từ mẫu hoặc mô tả bằng AI" short="Tạo nhanh" onClick={() => ed.setQuickFloorOpen(true)}>
        <Wand2 size={18} />
      </ToolButton>
      <ToolButton label="Thêm phòng mẫu: tự tìm vị trí phù hợp" short="Phòng mẫu" onClick={() => ed.setRoomPlacerOpen(true)}>
        <BedDouble size={18} />
      </ToolButton>
      <Box className="my-1 h-px w-10 bg-line" />
      <Col role="toolbar" aria-orientation="vertical" className="items-center gap-0.5">
        {TOOLS.map((t) => (
          <ToolButton key={t.tool} label={t.label} short={t.short} shortcut={t.key} active={tool === t.tool} onClick={() => setTool(t.tool)}>
            {t.icon}
          </ToolButton>
        ))}
      </Col>
      <Box className="my-1 h-px w-10 bg-line" />
      <ToolButton label="Vừa khung nhìn" short="Vừa khung" shortcut="F" onClick={requestFit}>
        <Maximize2 size={18} />
      </ToolButton>
      <ToolButton label="Hướng dẫn sử dụng" short="Hướng dẫn" shortcut="?" onClick={() => ed.setGuideOpen(true)}>
        <CircleHelp size={18} />
      </ToolButton>
    </nav>
  );
}
