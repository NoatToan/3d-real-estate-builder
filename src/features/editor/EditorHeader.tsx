"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Box as Box3D, Check, Coins, Columns2, Grid2x2, CloudOff, Download, FileJson, Image as ImageIcon, Loader2, Map as MapIcon, Redo2, Undo2 } from "lucide-react";
import { Box, Col, Row, Text } from "@/components/ui/BasePrimitives";
import { Button, IconButton } from "@/components/ui/Button";
import { SegmentedControl } from "@/components/ui/Fields";
import { toast } from "@/components/ui/Toast";
import { useProjectStore } from "@/store/projectStore";
import { useEditorStore, type ViewMode } from "@/store/editorStore";
import type { SaveStatus } from "@/persistence/useAutosave";
import { loadImage } from "@/persistence/db";
import { exportProjectFile } from "@/persistence/serialize";
import { downloadBlob, downloadDataUrl, slugify } from "@/ocr/image";
import { exportRegistry } from "@/features/plan/hooks";
import { useIsMobile } from "./useIsMobile";

const VIEWS: { value: ViewMode; label: string; icon: React.ReactNode }[] = [
  { value: "2d", label: "2D", icon: <Grid2x2 size={14} /> },
  { value: "split", label: "2D + 3D", icon: <Columns2 size={14} /> },
  { value: "3d", label: "3D", icon: <Box3D size={14} /> },
  { value: "finance", label: "Tài chính", icon: <Coins size={14} /> },
];

function SaveIndicator({ status }: { status: SaveStatus }) {
  if (status === "saving")
    return (
      <Text tone="muted" className="flex items-center gap-1 text-xs">
        <Loader2 size={14} className="animate-spin" /> Đang lưu…
      </Text>
    );
  if (status === "error")
    return (
      <Text className="flex items-center gap-1 text-xs text-danger-600">
        <CloudOff size={14} /> Lỗi lưu
      </Text>
    );
  if (status === "saved")
    return (
      <Text tone="muted" className="flex items-center gap-1 text-xs">
        <Check size={14} /> Đã lưu
      </Text>
    );
  return null;
}

function ProjectName() {
  const name = useProjectStore((s) => s.project?.name ?? "");
  // Remount the input when the stored name changes (undo, rename elsewhere).
  return <ProjectNameInput key={name} name={name} />;
}

function ProjectNameInput({ name }: { name: string }) {
  const rename = useProjectStore((s) => s.rename);
  const [text, setText] = useState(name);
  return (
    <input
      aria-label="Tên dự án"
      value={text}
      maxLength={200}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => text.trim() && text !== name && rename(text)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          setText(name);
          e.currentTarget.blur();
        }
      }}
      className="h-8 w-28 min-w-0 truncate sm:w-64 rounded-md border border-transparent bg-transparent px-2 text-sm font-semibold text-ink hover:border-line focus:border-brand-500 focus:outline-none focus-visible:shadow-focus"
    />
  );
}

function ExportMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  const project = useProjectStore((s) => s.project);
  const base = slugify(project?.name ?? "du-an");

  const run = async (kind: "json" | "plan" | "scene") => {
    setOpen(false);
    try {
      if (kind === "json" && project) {
        const img = project.lot.imageId ? await loadImage(project.lot.imageId) : null;
        downloadBlob(new Blob([await exportProjectFile(project, img)], { type: "application/json" }), `${base}.reb.json`);
      } else if (kind === "plan") {
        const url = exportRegistry.plan?.();
        if (!url) return toast.info("Hãy mở chế độ 2D để xuất ảnh mặt bằng.");
        downloadDataUrl(url, `${base}-mat-bang.png`);
      } else if (kind === "scene") {
        const url = await exportRegistry.scene?.();
        if (!url) return toast.info("Hãy mở chế độ 3D để chụp ảnh.");
        downloadDataUrl(url, `${base}-3d.png`);
      }
    } catch (err) {
      console.error(err);
      toast.error("Xuất tệp thất bại.");
    }
  };

  const item = (label: string, icon: React.ReactNode, kind: "json" | "plan" | "scene") => (
    <button type="button" role="menuitem" onClick={() => void run(kind)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink hover:bg-surface-muted">
      {icon}
      {label}
    </button>
  );

  return (
    <Box ref={ref} className="relative">
      <Button size="sm" icon={<Download size={16} />} aria-label="Xuất" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="hidden sm:inline">Xuất</span>
      </Button>
      {open && (
        <Col role="menu" className="absolute right-0 top-9 z-30 w-56 overflow-hidden rounded-lg border border-line bg-surface py-1 shadow-lg">
          {item("Tệp dự án (.json)", <FileJson size={16} />, "json")}
          {item("Ảnh mặt bằng tầng (.png)", <ImageIcon size={16} />, "plan")}
          {item("Ảnh 3D (.png)", <ImageIcon size={16} />, "scene")}
        </Col>
      )}
    </Box>
  );
}

export function EditorHeader({ saveStatus }: { saveStatus: SaveStatus }) {
  const canUndo = useProjectStore((s) => s.past.length > 0);
  const canRedo = useProjectStore((s) => s.future.length > 0);
  const undo = useProjectStore((s) => s.undo);
  const redo = useProjectStore((s) => s.redo);
  const view = useEditorStore((s) => s.view);
  const setView = useEditorStore((s) => s.setView);
  const mobile = useIsMobile();

  return (
    <header className="flex h-12 shrink-0 items-center gap-1 border-b border-line bg-surface px-1 sm:gap-2 sm:px-2">
      <Link href="/" aria-label="Về danh sách dự án" title="Về danh sách dự án" className="inline-flex h-9 w-9 items-center justify-center rounded-md text-ink hover:bg-surface-muted">
        <ArrowLeft size={18} />
      </Link>
      <ProjectName />
      {!mobile && <SaveIndicator status={saveStatus} />}
      <Row className={`items-center gap-0.5 border-l border-line ${mobile ? "ml-0.5 pl-0.5" : "ml-2 pl-2"}`}>
        <IconButton label="Hoàn tác" shortcut="Ctrl+Z" disabled={!canUndo} onClick={undo}>
          <Undo2 size={18} />
        </IconButton>
        <IconButton label="Làm lại" shortcut="Ctrl+Shift+Z" disabled={!canRedo} onClick={redo}>
          <Redo2 size={18} />
        </IconButton>
      </Row>
      <Box className="flex-1" />
      {mobile ? (
        <IconButton label="Ranh đất" onClick={() => useEditorStore.getState().setLotWizardOpen(true)}>
          <MapIcon size={18} />
        </IconButton>
      ) : (
        <Button size="sm" icon={<MapIcon size={16} />} onClick={() => useEditorStore.getState().setLotWizardOpen(true)}>
          Ranh đất
        </Button>
      )}
      <Box data-tour="views">
        <SegmentedControl label="Chế độ xem" value={view} options={VIEWS} onChange={setView} compact={mobile} />
      </Box>
      <ExportMenu />
    </header>
  );
}
