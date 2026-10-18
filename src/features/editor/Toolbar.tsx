"use client";

import type { ReactNode } from "react";
import { AppWindow, BrickWall, DoorOpen, Footprints, Hand, Maximize2, MousePointer2, Ruler, SquareDashed } from "lucide-react";
import { Box, Col } from "@/components/ui/BasePrimitives";
import { IconButton } from "@/components/ui/Button";
import { useEditorStore, type Tool } from "@/store/editorStore";

export const TOOLS: { tool: Tool; label: string; key: string; icon: ReactNode; hint: string }[] = [
  { tool: "select", label: "Chọn / di chuyển", key: "V", icon: <MousePointer2 size={18} />, hint: "Nhấp để chọn, kéo để di chuyển. Kéo vùng trống để cuộn." },
  { tool: "pan", label: "Cuộn khung nhìn", key: "H", icon: <Hand size={18} />, hint: "Kéo để cuộn. Lăn chuột để phóng to/thu nhỏ." },
  { tool: "wall", label: "Vẽ vách", key: "W", icon: <BrickWall size={18} />, hint: "Nhấp từng điểm. Gõ số để nhập độ dài. Enter / nhấp đúp để kết thúc, Esc để huỷ. Giữ Shift để khoá góc." },
  { tool: "room", label: "Vẽ phòng (đa giác)", key: "E", icon: <SquareDashed size={18} />, hint: "Nhấp các đỉnh phòng, nhấp lại điểm đầu hoặc Enter để khép kín." },
  { tool: "door", label: "Cửa đi", key: "D", icon: <DoorOpen size={18} />, hint: "Nhấp lên vách để đặt cửa đi." },
  { tool: "window", label: "Cửa sổ", key: "N", icon: <AppWindow size={18} />, hint: "Nhấp lên vách để đặt cửa sổ." },
  { tool: "stair", label: "Cầu thang", key: "S", icon: <Footprints size={18} />, hint: "Nhấp để đặt cầu thang. R để xoay 90°." },
  { tool: "measure", label: "Đo khoảng cách", key: "M", icon: <Ruler size={18} />, hint: "Nhấp hai điểm để đo." },
];

export function Toolbar() {
  const tool = useEditorStore((s) => s.tool);
  const view = useEditorStore((s) => s.view);
  const setTool = useEditorStore((s) => s.setTool);
  const requestFit = useEditorStore((s) => s.requestFit);
  const disabled = view === "3d";

  return (
    <nav aria-label="Công cụ" className="flex w-12 shrink-0 flex-col items-center gap-1 border-r border-line bg-surface py-2">
      <Col role="toolbar" aria-orientation="vertical" className="items-center gap-1">
        {TOOLS.map((t) => (
          <IconButton key={t.tool} label={t.label} shortcut={t.key} active={tool === t.tool} disabled={disabled} onClick={() => setTool(t.tool)}>
            {t.icon}
          </IconButton>
        ))}
      </Col>
      <Box className="my-1 h-px w-8 bg-line" />
      <IconButton label="Vừa khung nhìn" shortcut="F" onClick={requestFit}>
        <Maximize2 size={18} />
      </IconButton>
    </nav>
  );
}
