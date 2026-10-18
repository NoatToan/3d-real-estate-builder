"use client";

import type { ReactNode } from "react";
import { AppWindow, BedDouble, Box as Box3D, BrickWall, Check, ChevronDown, Coins, DoorOpen, Footprints, Map as MapIcon, Plus, Sofa, Wand2 } from "lucide-react";
import { Box, Col, Row, Text, TextMuted } from "@/components/ui/BasePrimitives";
import { Button } from "@/components/ui/Button";
import { useProjectStore } from "@/store/projectStore";
import { useEditorStore } from "@/store/editorStore";
import { useActiveFloor } from "@/features/plan/hooks";

function Step({ n, done, title, children }: { n: number; done: boolean; title: string; children?: ReactNode }) {
  return (
    <Row className="gap-2">
      <Text
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-micro font-bold ${done ? "bg-success-600 text-white" : "border border-line-strong text-ink-muted"}`}
        aria-label={done ? "Đã xong" : `Bước ${n}`}
      >
        {done ? <Check size={12} /> : n}
      </Text>
      <Col className="min-w-0 flex-1 gap-1">
        <Text className={`text-sm font-medium ${done ? "text-ink-muted" : "text-ink"}`}>{title}</Text>
        {children && <Row className="flex-wrap gap-1">{children}</Row>}
      </Col>
    </Row>
  );
}

/** Checklist at the top of the side panel: what to do next, with one-click actions. */
export function GettingStarted() {
  const project = useProjectStore((s) => s.project)!;
  const { floor } = useActiveFloor();
  const open = useEditorStore((s) => s.panels.guide);
  const ed = useEditorStore.getState();
  if (!floor) return null;

  const hasWalls = project.floors.some((f) => f.walls.length > 0);
  const hasOpenings = project.floors.some((f) => f.openings.length > 0);
  const hasFurniture = project.floors.some((f) => f.furniture.length > 0);
  const multi = project.floors.length > 1;
  const steps = [true, hasWalls, hasOpenings, hasFurniture, multi];
  const doneCount = steps.filter(Boolean).length;

  return (
    <section className="border-b border-line bg-brand-50/60">
      <button type="button" aria-expanded={open} onClick={() => ed.togglePanel("guide")} className="flex w-full items-center gap-2 px-3 py-2 text-left">
        <Text className="flex-1 text-sm font-semibold text-ink">Các bước dựng nhà</Text>
        <TextMuted className="text-xs tabular-nums">
          {doneCount}/{steps.length}
        </TextMuted>
        <ChevronDown size={14} className={`text-ink-muted transition-transform ${open ? "" : "-rotate-90"}`} />
      </button>
      {open && (
        <Col className="gap-2.5 px-3 pb-3">
          <Step n={1} done title="Khai báo lô đất">
            <Button size="sm" variant="ghost" icon={<MapIcon size={14} />} onClick={() => ed.setLotWizardOpen(true)}>
              Sửa ranh đất
            </Button>
          </Step>
          <Step n={2} done={hasWalls} title="Dựng tường và chia phòng">
            <Button size="sm" variant="primary" icon={<Wand2 size={14} />} onClick={() => ed.setQuickFloorOpen(true)}>
              Mô tả bằng AI / mẫu
            </Button>
            <Button size="sm" variant="ghost" icon={<BedDouble size={14} />} onClick={() => ed.setRoomPlacerOpen(true)}>
              Thêm phòng mẫu
            </Button>
            <Button size="sm" variant="ghost" icon={<BrickWall size={14} />} onClick={() => ed.setTool("wall")}>
              Tự vẽ vách
            </Button>
          </Step>
          <Step n={3} done={hasOpenings} title="Thêm cửa, cửa sổ, cầu thang">
            <Button size="sm" variant="ghost" icon={<DoorOpen size={14} />} onClick={() => ed.setTool("door")}>
              Cửa đi
            </Button>
            <Button size="sm" variant="ghost" icon={<AppWindow size={14} />} onClick={() => ed.setTool("window")}>
              Cửa sổ
            </Button>
            <Button size="sm" variant="ghost" icon={<Footprints size={14} />} onClick={() => ed.setTool("stair")}>
              Cầu thang
            </Button>
          </Step>
          <Step n={4} done={hasFurniture} title="Bày nội thất">
            <Button size="sm" variant="ghost" icon={<Sofa size={14} />} onClick={() => ed.setTool("furniture")}>
              Mở thư viện nội thất
            </Button>
          </Step>
          <Step n={5} done={multi} title="Thêm tầng, xem 3D và tài chính">
            <Button
              size="sm"
              variant="ghost"
              icon={<Plus size={14} />}
              onClick={() => {
                const id = useProjectStore.getState().addFloor({ copyFromId: floor.id });
                if (id) ed.setActiveFloor(id);
              }}
            >
              Thêm tầng trên
            </Button>
            <Button size="sm" variant="ghost" icon={<Box3D size={14} />} onClick={() => ed.setView("3d")}>
              Xem 3D
            </Button>
            <Button size="sm" variant="ghost" icon={<Coins size={14} />} onClick={() => ed.setView("finance")}>
              Tài chính
            </Button>
          </Step>
          <Box>
            <button type="button" onClick={() => ed.setGuideOpen(true)} className="text-xs font-medium text-brand-700 hover:underline">
              Xem hướng dẫn chi tiết và giải thích thuật ngữ →
            </button>
          </Box>
        </Col>
      )}
    </section>
  );
}
