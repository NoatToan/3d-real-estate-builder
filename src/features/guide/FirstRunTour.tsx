"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Columns2, Layers, ListChecks, Wand2 } from "lucide-react";
import { Box, Col, Row, Text, TextMuted } from "@/components/ui/BasePrimitives";
import { Button } from "@/components/ui/Button";
import { useEditorStore } from "@/store/editorStore";
import { CARD_W, placeCard } from "./placeCard";

interface TourStep {
  /** `data-tour` value of the element to point at. */
  target: string;
  icon: ReactNode;
  title: string;
  body: string;
}

export const TOUR_STEPS: readonly TourStep[] = [
  { target: "create", icon: <Wand2 size={18} />, title: "Bắt đầu ở đây", body: "“Tạo nhanh” dựng cả một tầng từ mẫu hoặc từ lời mô tả. “Phòng mẫu” thêm từng phòng ngủ, WC, bếp… vào chỗ hợp lý." },
  { target: "panel", icon: <ListChecks size={18} />, title: "Bảng điều khiển", body: "Tab “Bắt đầu” là danh sách các bước. Bấm vào một vách, cửa hay đồ vật thì tab “Chỉnh sửa” mở ra để sửa thông số." },
  { target: "views", icon: <Columns2 size={18} />, title: "Xem 2D, 3D, tài chính", body: "Chuyển giữa mặt bằng, mô hình 3D (kéo đồ trực tiếp trong 3D được) và màn Tài chính có dự toán vật tư." },
  { target: "floors", icon: <Layers size={18} />, title: "Các tầng", body: "Bấm tên tầng để chuyển tầng, dấu + để thêm tầng mới. Mọi thay đổi tự lưu, Ctrl+Z để hoàn tác." },
];

/** First-run coach marks: 4 short steps pointing at the main areas; skippable, shown once. */
export function FirstRunTour() {
  const done = useEditorStore((s) => s.tourDone);
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const finish = useCallback(() => useEditorStore.getState().setTourDone(true), []);

  const measure = useCallback(() => {
    const el = document.querySelector(`[data-tour="${TOUR_STEPS[step].target}"]`);
    const r = el?.getBoundingClientRect();
    setRect(r && r.width > 0 && r.height > 0 ? r : null);
  }, [step]);

  useEffect(() => {
    if (done) return;
    // Measure after layout (and again on resize) so the highlight follows the target.
    const raf = requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", measure);
      window.removeEventListener("keydown", onKey);
    };
  }, [done, measure, finish]);

  if (done) return null;
  const s = TOUR_STEPS[step];
  const last = step === TOUR_STEPS.length - 1;
  const view = { width: window.innerWidth, height: window.innerHeight };
  const pos = rect ? placeCard(rect, view) : { left: (view.width - CARD_W) / 2, top: view.height / 3 };
  const pad = 6;

  return (
    <Box className="fixed inset-0 z-50" onPointerDown={(e) => e.stopPropagation()}>
      {/* Dimmed page with a hole around the target. */}
      {rect ? (
        <Box
          aria-hidden
          className="pointer-events-none absolute rounded-xl ring-2 ring-brand-400 transition-all duration-200"
          style={{ left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2, boxShadow: "0 0 0 9999px rgba(15, 23, 42, 0.55)" }}
        />
      ) : (
        <Box aria-hidden className="absolute inset-0 bg-slate-900/55" />
      )}
      <Col role="dialog" aria-modal="true" aria-label="Hướng dẫn nhanh" className="absolute gap-2 rounded-xl border border-line bg-surface p-4 shadow-2xl" style={{ left: pos.left, top: pos.top, width: Math.min(CARD_W, view.width - 16) }}>
        <Row className="items-center gap-2">
          <Text className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white">{s.icon}</Text>
          <Text className="flex-1 text-base font-semibold text-ink">{s.title}</Text>
          <TextMuted className="text-xs tabular-nums">
            {step + 1}/{TOUR_STEPS.length}
          </TextMuted>
        </Row>
        <TextMuted as="p" className="text-sm">
          {s.body}
        </TextMuted>
        <Row className="mt-1 items-center gap-2">
          <Button size="sm" variant="ghost" onClick={finish}>
            Bỏ qua
          </Button>
          <Box className="flex-1" />
          {step > 0 && (
            <Button size="sm" onClick={() => setStep(step - 1)}>
              Quay lại
            </Button>
          )}
          <Button size="sm" variant="primary" onClick={() => (last ? finish() : setStep(step + 1))}>
            {last ? "Bắt đầu dùng" : "Tiếp"}
          </Button>
        </Row>
      </Col>
    </Box>
  );
}
