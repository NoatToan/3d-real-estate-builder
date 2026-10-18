"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Eye, EyeOff, Plus, Trash2 } from "lucide-react";
import { Box, Col, Row, Text } from "@/components/ui/BasePrimitives";
import { IconButton } from "@/components/ui/Button";
import { confirmDialog } from "@/components/ui/Modal";
import { useProjectStore } from "@/store/projectStore";
import { useEditorStore } from "@/store/editorStore";
import { activeFloorOf } from "@/features/plan/hooks";

function AddFloorMenu({ onAdd }: { onAdd: (mode: "empty" | "shell" | "copy") => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);
  const item = (mode: "empty" | "shell" | "copy", label: string, desc: string) => (
    <button
      type="button"
      role="menuitem"
      onClick={() => {
        setOpen(false);
        onAdd(mode);
      }}
      className="flex w-full flex-col items-start px-3 py-2 text-left hover:bg-surface-muted"
    >
      <Text tone="primary" className="text-sm">
        {label}
      </Text>
      <Text tone="faint" className="text-xs">
        {desc}
      </Text>
    </button>
  );
  return (
    <Box ref={ref} className="relative">
      <IconButton label="Thêm tầng" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Plus size={18} />
      </IconButton>
      {open && (
        <Col role="menu" className="absolute left-0 top-10 z-30 w-64 overflow-hidden rounded-lg border border-line bg-surface py-1 shadow-lg">
          {item("shell", "Sao chép tường bao", "Giữ tường ngoài của tầng đang chọn")}
          {item("copy", "Nhân bản toàn bộ tầng", "Sao chép vách, cửa và tên phòng")}
          {item("empty", "Tầng trống", "Bắt đầu từ mặt bằng trống")}
        </Col>
      )}
    </Box>
  );
}

export function FloorBar() {
  const project = useProjectStore((s) => s.project)!;
  const activeId = useEditorStore((s) => s.activeFloorId);
  const hidden = useEditorStore((s) => s.viewer.hiddenFloorIds);
  const { floor: active, index } = activeFloorOf(project, activeId);
  const setActive = useEditorStore((s) => s.setActiveFloor);
  const toggleVis = useEditorStore((s) => s.toggleFloorVisibility);

  const add = (mode: "empty" | "shell" | "copy") => {
    const id = useProjectStore.getState().addFloor(mode === "empty" ? {} : { copyFromId: active?.id, copyWalls: mode === "copy" });
    if (id) setActive(id);
  };

  const remove = async () => {
    if (!active || project.floors.length <= 1) return;
    const ok = await confirmDialog({
      title: `Xoá ${active.name}?`,
      message: "Toàn bộ vách, phòng, cửa và cầu thang của tầng này sẽ bị xoá (có thể hoàn tác).",
      confirmText: "Xoá tầng",
      danger: true,
    });
    if (!ok) return;
    const next = project.floors[index - 1] ?? project.floors[index + 1];
    useProjectStore.getState().removeFloor(active.id);
    setActive(next?.id ?? null);
  };

  return (
    <Row className="h-11 shrink-0 items-center gap-1 border-b border-line bg-surface px-2">
      <Row role="tablist" aria-label="Các tầng" className="min-w-0 flex-1 items-center gap-1 overflow-x-auto">
        {project.floors.map((f) => {
          const isActive = f.id === active?.id;
          const isHidden = hidden.includes(f.id);
          return (
            <Row key={f.id} className={`shrink-0 items-center rounded-md border ${isActive ? "border-brand-500 bg-brand-50" : "border-line"}`}>
              <button
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActive(f.id)}
                className={`h-8 px-3 text-sm ${isActive ? "font-semibold text-brand-700" : "text-ink-muted hover:text-ink"}`}
              >
                {f.name}
              </button>
              <button
                type="button"
                aria-label={isHidden ? `Hiện ${f.name} trong 3D` : `Ẩn ${f.name} trong 3D`}
                title={isHidden ? "Hiện trong 3D" : "Ẩn trong 3D"}
                onClick={() => toggleVis(f.id)}
                className="mr-1 rounded p-1 text-ink-faint hover:bg-surface-muted hover:text-ink"
              >
                {isHidden ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </Row>
          );
        })}
      </Row>
      <AddFloorMenu onAdd={add} />
      <IconButton label="Chuyển tầng xuống dưới" disabled={index <= 0} onClick={() => active && useProjectStore.getState().moveFloor(active.id, -1)}>
        <ChevronLeft size={18} />
      </IconButton>
      <IconButton label="Chuyển tầng lên trên" disabled={index >= project.floors.length - 1} onClick={() => active && useProjectStore.getState().moveFloor(active.id, 1)}>
        <ChevronRight size={18} />
      </IconButton>
      <IconButton label="Xoá tầng" disabled={project.floors.length <= 1} onClick={() => void remove()} className="hover:text-danger-600">
        <Trash2 size={18} />
      </IconButton>
    </Row>
  );
}
