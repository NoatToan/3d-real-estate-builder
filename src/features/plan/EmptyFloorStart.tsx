"use client";

import type { ReactNode } from "react";
import { BedDouble, BrickWall, PenLine, Wand2 } from "lucide-react";
import { Box, Col, Text, TextMuted } from "@/components/ui/BasePrimitives";
import { toast } from "@/components/ui/Toast";
import { useEditorStore } from "@/store/editorStore";
import { useProjectStore } from "@/store/projectStore";

function Choice({ icon, title, desc, onClick, primary }: { icon: ReactNode; title: string; desc: string; onClick: () => void; primary?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-start gap-3 rounded-xl border p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-brand-500 ${
        primary ? "border-brand-500 bg-brand-50 hover:bg-brand-100" : "border-line bg-surface hover:bg-surface-muted"
      }`}
    >
      <Text className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${primary ? "bg-brand-600 text-white" : "bg-surface-muted text-ink"}`}>{icon}</Text>
      <Col className="min-w-0">
        <Text className="text-sm font-semibold text-ink">{title}</Text>
        <TextMuted className="text-xs">{desc}</TextMuted>
      </Col>
    </button>
  );
}

/** Shown on an empty floor: the 4 ways to start, instead of a blank grid. */
export function EmptyFloorStart({ floorId, floorName }: { floorId: string; floorName: string }) {
  const ed = useEditorStore.getState();
  return (
    <Box className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-4">
      <Col role="region" aria-label="Bắt đầu dựng tầng" className="pointer-events-auto w-full max-w-md gap-2 rounded-2xl border border-line bg-surface/95 p-4 shadow-xl backdrop-blur">
        <Text className="text-base font-semibold text-ink">{floorName} còn trống — bắt đầu thế nào?</Text>
        <Choice primary icon={<Wand2 size={18} />} title="Dựng nhanh cả tầng" desc="Chọn mẫu (trệt, phòng ngủ, văn phòng…) hoặc mô tả bằng lời cho AI. Có tường, cửa, thang, nội thất." onClick={() => ed.setQuickFloorOpen(true)} />
        <Choice icon={<BedDouble size={18} />} title="Đặt từng phòng mẫu" desc="Phòng ngủ, WC, bếp… theo kích thước chuẩn, app tự tìm chỗ hợp lý." onClick={() => ed.setRoomPlacerOpen(true)} />
        <Choice
          icon={<BrickWall size={18} />}
          title="Chỉ dựng tường bao"
          desc="Tường bao theo ranh đất, rồi tự chia phòng sau."
          onClick={() => {
            if (!useProjectStore.getState().generateExteriorWalls(floorId, "lot")) toast.error("Không tạo được tường bao từ ranh đất.");
          }}
        />
        <Choice icon={<PenLine size={18} />} title="Tự vẽ tường" desc="Bấm từng điểm trên mặt bằng; gõ số để nhập độ dài." onClick={() => ed.setTool("wall")} />
      </Col>
    </Box>
  );
}
