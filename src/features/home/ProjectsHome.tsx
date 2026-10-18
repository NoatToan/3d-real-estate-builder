"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Building2, Copy, Download, FileUp, Layers, MapPin, Plus, Trash2, TriangleAlert } from "lucide-react";
import { Button, IconButton } from "@/components/ui/Button";
import { Box, Col, Row, Text, TextFaint, TextMuted, TextPrimary } from "@/components/ui/BasePrimitives";
import { confirmDialog } from "@/components/ui/Modal";
import { toast } from "@/components/ui/Toast";
import { fmtArea } from "@/domain/labels";
import type { ProjectMeta } from "@/domain/types";
import { newId } from "@/domain/factory";
import { deleteProject, isPersistent, listProjects, loadImage, loadProject, saveImage, saveProject } from "@/persistence/db";
import { exportProjectFile, parseProjectFile } from "@/persistence/serialize";
import { downloadBlob, slugify } from "@/ocr/image";
import { NewProjectDialog } from "./NewProjectDialog";
import { SampleGallery } from "./SampleGallery";

const dateFmt = new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" });

export async function exportProjectById(id: string) {
  const p = await loadProject(id);
  if (!p) throw new Error("not found");
  const image = p.lot.imageId ? await loadImage(p.lot.imageId) : null;
  const text = await exportProjectFile(p, image);
  downloadBlob(new Blob([text], { type: "application/json" }), `${slugify(p.name)}.reb.json`);
}

export function ProjectsHome() {
  const [projects, setProjects] = useState<ProjectMeta[] | null>(null);
  const [persistent, setPersistent] = useState(true);
  const [creating, setCreating] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      setProjects(await listProjects());
    } catch (err) {
      console.error(err);
      toast.error("Không đọc được danh sách dự án.");
      setProjects([]);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    listProjects()
      .then((list) => !cancelled && setProjects(list))
      .catch((err) => {
        console.error(err);
        if (cancelled) return;
        toast.error("Không đọc được danh sách dự án.");
        setProjects([]);
      });
    isPersistent().then((p) => !cancelled && setPersistent(p));
    return () => {
      cancelled = true;
    };
  }, []);

  const onImport = async (file: File) => {
    try {
      const text = await file.text();
      const ids = new Set((projects ?? []).map((p) => p.id));
      const { project, image } = parseProjectFile(text, ids);
      project.lot.imageId = image ? await saveImage(image) : null;
      await saveProject(project);
      toast.success(`Đã nhập "${project.name}".`);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Không nhập được tệp.");
    }
  };

  const onDuplicate = async (id: string) => {
    try {
      const p = await loadProject(id);
      if (!p) return;
      const img = p.lot.imageId ? await loadImage(p.lot.imageId) : null;
      const now = new Date().toISOString();
      const copy = { ...p, id: newId("p_"), name: `${p.name} (bản sao)`, createdAt: now, updatedAt: now, lot: { ...p.lot, imageId: img ? await saveImage(img) : null } };
      await saveProject(copy);
      toast.success("Đã nhân bản dự án.");
      await refresh();
    } catch (err) {
      console.error(err);
      toast.error("Không nhân bản được dự án.");
    }
  };

  const onDelete = async (meta: ProjectMeta) => {
    const ok = await confirmDialog({
      title: "Xoá dự án?",
      message: `Dự án "${meta.name}" sẽ bị xoá vĩnh viễn khỏi trình duyệt này. Hãy xuất tệp JSON nếu cần giữ lại.`,
      confirmText: "Xoá",
      danger: true,
    });
    if (!ok) return;
    await deleteProject(meta.id);
    toast.success("Đã xoá dự án.");
    await refresh();
  };

  return (
    <Box className="min-h-screen bg-canvas">
      <header className="border-b border-line bg-surface">
        <Row className="mx-auto max-w-6xl items-center gap-3 px-6 py-4">
          <Building2 className="text-brand-600" size={28} />
          <Col className="flex-1">
            <h1 className="text-lg font-semibold text-ink">Real Estate Builder</h1>
            <TextMuted as="p" className="text-xs">
              Từ sổ đỏ đến mặt bằng nhiều tầng và mô hình 3D — chạy hoàn toàn trên trình duyệt.
            </TextMuted>
          </Col>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            aria-label="Chọn tệp dự án JSON"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onImport(f);
              e.target.value = "";
            }}
          />
          <Button icon={<FileUp size={16} />} onClick={() => fileRef.current?.click()}>
            Nhập tệp
          </Button>
          <Button variant="primary" icon={<Plus size={16} />} onClick={() => setCreating(true)}>
            Dự án mới
          </Button>
        </Row>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        {!persistent && (
          <Row role="alert" className="mb-6 items-start gap-2 rounded-lg border border-warning-300 bg-warning-50 p-3 text-sm text-warning-800">
            <TriangleAlert size={16} className="mt-0.5 shrink-0" />
            Trình duyệt đang chặn bộ nhớ cục bộ (IndexedDB). Dữ liệu sẽ mất khi đóng tab — hãy xuất tệp JSON để lưu lại.
          </Row>
        )}

        {projects === null ? (
          <TextMuted as="p" className="text-sm">
            Đang tải…
          </TextMuted>
        ) : projects.length === 0 ? (
          <>
            <SampleGallery lead />
            <Row className="mt-6 flex-wrap items-center gap-3 rounded-xl border border-dashed border-line-strong bg-surface p-4">
              <Building2 size={28} className="text-ink-faint" />
              <Col className="min-w-0 flex-1">
                <TextPrimary as="p" className="font-medium">
                  Hoặc bắt đầu từ lô đất của bạn
                </TextPrimary>
                <TextMuted as="p" className="text-sm">
                  Nhập kích thước (rộng × sâu) hoặc tải ảnh sổ đỏ.
                </TextMuted>
              </Col>
              <Button variant="primary" icon={<Plus size={16} />} onClick={() => setCreating(true)}>
                Tạo dự án trống
              </Button>
            </Row>
          </>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => (
              <li key={p.id} className="group flex flex-col rounded-xl border border-line bg-surface shadow-sm transition-shadow hover:shadow-md">
                <Link href={`/editor/?id=${encodeURIComponent(p.id)}`} className="flex-1 p-4">
                  <h2 className="truncate font-semibold text-ink">{p.name}</h2>
                  {p.address && (
                    <TextMuted as="p" className="mt-1 flex items-center gap-1 truncate text-xs">
                      <MapPin size={12} />
                      {p.address}
                    </TextMuted>
                  )}
                  <Row className="mt-3 gap-4 text-xs text-ink-muted">
                    <Text>Đất: {fmtArea(p.lotArea)}</Text>
                    <Text className="flex items-center gap-1">
                      <Layers size={12} />
                      {p.floorCount} tầng
                    </Text>
                  </Row>
                  <TextFaint as="p" className="mt-2 text-xs">
                    Cập nhật {dateFmt.format(new Date(p.updatedAt))}
                  </TextFaint>
                </Link>
                <Row className="justify-end gap-1 border-t border-line px-2 py-1.5">
                  <IconButton label="Xuất JSON" onClick={() => exportProjectById(p.id).catch(() => toast.error("Không xuất được tệp."))}>
                    <Download size={16} />
                  </IconButton>
                  <IconButton label="Nhân bản" onClick={() => void onDuplicate(p.id)}>
                    <Copy size={16} />
                  </IconButton>
                  <IconButton label="Xoá" onClick={() => void onDelete(p)} className="hover:text-danger-600">
                    <Trash2 size={16} />
                  </IconButton>
                </Row>
              </li>
            ))}
          </ul>
        )}
        {!!projects?.length && <SampleGallery />}
      </main>
      <NewProjectDialog open={creating} onClose={() => setCreating(false)} />
    </Box>
  );
}
