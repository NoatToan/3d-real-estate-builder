"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { FileImage, Ruler, Sparkles } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Col, Row, TextMuted, TextPrimary } from "@/components/ui/BasePrimitives";
import { NumberField, TextField } from "@/components/ui/Fields";
import { toast } from "@/components/ui/Toast";
import { createLot, createProject, rectPolygon } from "@/domain/factory";
import { saveProject } from "@/persistence/db";

type Method = "image" | "rect" | "sample";

export function NewProjectDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("Nhà phố mới");
  const [address, setAddress] = useState("");
  const [method, setMethod] = useState<Method>("rect");
  const [width, setWidth] = useState<number | null>(5);
  const [depth, setDepth] = useState<number | null>(20);
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (method === "sample") {
      onClose();
      document.getElementById("nha-mau")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (method === "rect" && (!width || !depth)) return;
    setBusy(true);
    try {
      const w = width ?? 5;
      const d = depth ?? 20;
      const p = createProject(name, createLot(rectPolygon(w, d), { address, edgeLengths: [w, d, w, d] }));
      await saveProject(p);
      // Post-action redirect to the newly created project.
      router.push(`/editor/?id=${encodeURIComponent(p.id)}${method === "image" ? "&lot=1" : ""}`);
    } catch (err) {
      console.error(err);
      toast.error("Không tạo được dự án. Vui lòng thử lại.");
      setBusy(false);
    }
  };

  const option = (m: Method, icon: ReactNode, title: string, desc: string) => (
    <button
      type="button"
      role="radio"
      aria-checked={method === m}
      onClick={() => setMethod(m)}
      className={`flex flex-1 flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors ${
        method === m ? "border-brand-500 bg-brand-50 ring-2 ring-brand-200" : "border-line hover:bg-surface-muted"
      }`}
    >
      <TextPrimary className="flex items-center gap-2 text-sm font-semibold">
        {icon}
        {title}
      </TextPrimary>
      <TextMuted className="text-xs">{desc}</TextMuted>
    </button>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Tạo dự án mới"
      footer={
        <>
          <Button onClick={onClose}>Huỷ</Button>
          <Button variant="primary" onClick={create} disabled={busy || !name.trim()}>
            {busy ? "Đang tạo…" : method === "sample" ? "Xem nhà mẫu" : "Tạo dự án"}
          </Button>
        </>
      }
    >
      <Col className="gap-4">
        <TextField label="Tên dự án" value={name} onCommit={setName} live autoFocus />
        <TextField label="Địa chỉ thửa đất (tuỳ chọn)" value={address} onCommit={setAddress} live />
        <Row role="radiogroup" aria-label="Cách bắt đầu" className="flex-col gap-2 sm:flex-row sm:gap-3">
          {option("rect", <Ruler size={16} />, "Nhập kích thước", "Nhanh nhất: rộng × sâu, sửa lại sau được.")}
          {option("image", <FileImage size={16} />, "Từ ảnh sổ đỏ", "Tải ảnh, vẽ ranh, đọc kích thước bằng OCR.")}
          {option("sample", <Sparkles size={16} />, "Từ nhà mẫu", "Mở một nhà dựng sẵn rồi sửa theo ý mình.")}
        </Row>
        {method === "rect" && (
          <Row className="gap-3">
            <NumberField className="flex-1" label="Mặt tiền (rộng)" value={width} onCommit={setWidth} min={1} max={500} suffix="m" />
            <NumberField className="flex-1" label="Chiều sâu" value={depth} onCommit={setDepth} min={1} max={500} suffix="m" />
          </Row>
        )}
      </Col>
    </Modal>
  );
}
