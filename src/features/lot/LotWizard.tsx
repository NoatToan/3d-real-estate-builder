"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Crop, FileImage, PenLine, RotateCw, ScanText, Sparkles, Trash2, Upload, X } from "lucide-react";
import { Box, Col, Row, Text, TextFaint, TextMuted, TextPrimary } from "@/components/ui/BasePrimitives";
import { Button, IconButton } from "@/components/ui/Button";
import { NumberField, TextField } from "@/components/ui/Fields";
import { Modal, confirmDialog } from "@/components/ui/Modal";
import { toast } from "@/components/ui/Toast";
import type { Lot, Vec2 } from "@/domain/types";
import { fmtArea, fmtLength } from "@/domain/labels";
import { useProjectStore } from "@/store/projectStore";
import { useEditorStore } from "@/store/editorStore";
import { deleteImage, loadImage, saveImage } from "@/persistence/db";
import { ACCEPTED_IMAGE_TYPES, MAX_IMAGE_BYTES, rotatedCanvas } from "@/ocr/image";
import { autoAssignNumbers, type OcrNumber } from "@/ocr/parse";
import type { OcrProgress } from "@/ocr/ocr";
import { solveLot, normalizeOrigin } from "@/geometry/lotSolver";
import { area, edgeLengths, isSimplePolygon } from "@/geometry/polygon";
import { dist } from "@/geometry/vec";
import { TraceCanvas, edgeName } from "./TraceCanvas";
import { LotPreview } from "./LotPreview";
import { ManualLotEditor } from "./ManualLotEditor";

type Step = "source" | "trace" | "review" | "manual";
type Rotation = 0 | 90 | 180 | 270;

const STEP_LABELS: { key: Step; label: string }[] = [
  { key: "source", label: "1. Ảnh sổ đỏ" },
  { key: "trace", label: "2. Vẽ ranh & kích thước" },
  { key: "review", label: "3. Kiểm tra" },
];

export function LotWizard({ onClose }: { onClose: () => void }) {
  const project = useProjectStore((s) => s.project)!;
  const lot = project.lot;

  const [step, setStep] = useState<Step>(lot.imageId ? "trace" : "source");
  const [blob, setBlob] = useState<Blob | null>(null);
  const [isNewImage, setIsNewImage] = useState(false);
  const [rotation, setRotation] = useState<Rotation>(lot.trace?.rotation ?? 0);
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const [points, setPoints] = useState<Vec2[]>(lot.trace?.points ?? []);
  const [lengths, setLengths] = useState<(number | null)[]>(lot.trace ? lot.edgeLengths : []);
  const [numbers, setNumbers] = useState<OcrNumber[]>([]);
  const [assignedIds, setAssignedIds] = useState<(string | null)[]>([]);
  const [selectedEdge, setSelectedEdge] = useState<number | null>(null);
  const [regionMode, setRegionMode] = useState(false);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [progress, setProgress] = useState<OcrProgress | null>(null);
  const [certifiedArea, setCertifiedArea] = useState<number | null>(lot.certifiedArea);
  const [parcelNo, setParcelNo] = useState(lot.parcelNo);
  const [mapSheetNo, setMapSheetNo] = useState(lot.mapSheetNo);
  const [address, setAddress] = useState(lot.address);
  const [manualPoly, setManualPoly] = useState<Vec2[]>(lot.polygon);
  const fileRef = useRef<HTMLInputElement>(null);

  // Load the existing certificate image.
  useEffect(() => {
    if (!lot.imageId) return;
    let cancelled = false;
    loadImage(lot.imageId).then((b) => !cancelled && b && setBlob(b));
    return () => {
      cancelled = true;
    };
  }, [lot.imageId]);

  useEffect(() => {
    if (!blob) return;
    let cancelled = false;
    let bmp: ImageBitmap | null = null;
    createImageBitmap(blob)
      .then((b) => {
        bmp = b;
        if (!cancelled) setBitmap(b);
        else b.close();
      })
      .catch(() => toast.error("Không đọc được ảnh."));
    return () => {
      cancelled = true;
      bmp?.close();
    };
  }, [blob]);

  const canvas = useMemo(() => (bitmap ? rotatedCanvas(bitmap, rotation) : null), [bitmap, rotation]);

  // Free the OCR worker when the wizard closes.
  useEffect(
    () => () => {
      void import("@/ocr/ocr").then((m) => m.disposeOcr());
    },
    [],
  );

  const setPointsKeepLengths = useCallback((pts: Vec2[]) => {
    setPoints((prev) => {
      if (pts.length !== prev.length) {
        setLengths((l) => pts.map((_, i) => l[i] ?? null));
        setAssignedIds((a) => pts.map((_, i) => a[i] ?? null));
      }
      return pts;
    });
  }, []);

  const onFile = (f: File) => {
    if (!ACCEPTED_IMAGE_TYPES.includes(f.type)) return toast.error("Định dạng ảnh không được hỗ trợ (PNG, JPG, WEBP).");
    if (f.size > MAX_IMAGE_BYTES) return toast.error("Ảnh quá lớn (tối đa 25 MB).");
    setBlob(f);
    setIsNewImage(true);
    setPoints([]);
    setLengths([]);
    setNumbers([]);
    setAssignedIds([]);
    setRotation(0);
    setStep("trace");
  };

  const rotate = () => {
    if (points.length && canvas) {
      // Rotate the traced points with the image (90° clockwise).
      const h = canvas.height;
      setPoints(points.map((p) => ({ x: h - p.y, y: p.x })));
    }
    setNumbers([]);
    setRotation(((rotation + 90) % 360) as Rotation);
  };

  const runOcr = async (region?: { left: number; top: number; width: number; height: number }) => {
    if (!canvas) return;
    setOcrBusy(true);
    setProgress({ status: "Đang chuẩn bị…", progress: 0 });
    try {
      const { recognizeCertificate } = await import("@/ocr/ocr");
      const res = await recognizeCertificate(canvas, { region, onProgress: setProgress });
      const tag = region ? `_${Math.round(region.left)}_${Math.round(region.top)}` : "";
      const found = res.numbers.map((n) => ({ ...n, id: `${n.id}${tag}` }));
      setNumbers((prev) => (region ? [...prev, ...found] : found));
      if (res.certifiedArea && certifiedArea == null) setCertifiedArea(res.certifiedArea);
      if (res.parcelNo && !parcelNo) setParcelNo(res.parcelNo);
      if (res.mapSheetNo && !mapSheetNo) setMapSheetNo(res.mapSheetNo);
      toast.info(found.length ? `Đọc được ${found.length} số. Chọn cạnh rồi bấm vào số để gán.` : "Không đọc được số nào — thử khoanh vùng, xoay ảnh hoặc nhập tay.");
    } catch (err) {
      console.error(err);
      toast.error("OCR thất bại. Bạn vẫn có thể nhập kích thước bằng tay.");
    } finally {
      setOcrBusy(false);
      setProgress(null);
      setRegionMode(false);
    }
  };

  const setEdge = (edge: number, value: number | null, id: string | null) => {
    setLengths(points.map((_, i) => (i === edge ? value : (lengths[i] ?? null))));
    setAssignedIds(points.map((_, i) => (i === edge ? id : (assignedIds[i] ?? null))));
  };

  const assignNumber = (n: OcrNumber) => {
    let edge = selectedEdge;
    if (edge == null) {
      edge = points.findIndex((_, i) => (lengths[i] ?? null) == null);
      if (edge < 0) return toast.info("Hãy chọn một cạnh trước (bấm vào cạnh trên ảnh hoặc trong bảng).");
    }
    setEdge(edge, n.value, n.id);
    const nextEmpty = points.findIndex((_, i) => i > edge! && (lengths[i] ?? null) == null);
    setSelectedEdge(nextEmpty >= 0 ? nextEmpty : null);
  };

  const autoAssign = () => {
    const ids = autoAssignNumbers(points, numbers);
    const byId = new Map(numbers.map((n) => [n.id, n]));
    const nextLengths = points.map((_, i) => lengths[i] ?? null);
    const nextIds = points.map((_, i) => assignedIds[i] ?? null);
    let count = 0;
    ids.forEach((id, i) => {
      if (id && nextLengths[i] == null) {
        nextLengths[i] = byId.get(id)!.value;
        nextIds[i] = id;
        count++;
      }
    });
    setLengths(nextLengths);
    setAssignedIds(nextIds);
    toast.info(count ? `Đã ghép ${count} cạnh — hãy kiểm tra lại.` : "Không tìm được số nằm cạnh các đường ranh.");
  };

  const solved = useMemo(() => (points.length >= 3 ? solveLot(points, lengths) : null), [points, lengths]);
  const knownCount = lengths.filter((l) => l != null && l > 0).length;
  const traceValid = points.length >= 3 && isSimplePolygon(points);
  const scale = solved?.pxPerMeter ?? null;
  const assignedSet = useMemo(() => new Set(assignedIds.filter((x): x is string => !!x)), [assignedIds]);

  const apply = async (polygon: Vec2[], fromTrace: boolean) => {
    if (polygon.length < 3 || !isSimplePolygon(polygon)) return toast.error("Ranh giới không hợp lệ.");
    const hasContent = project.floors.some((f) => f.walls.length || f.stairs.length);
    if (hasContent) {
      const ok = await confirmDialog({
        title: "Cập nhật ranh đất?",
        message: "Các vách, cầu thang hiện có sẽ giữ nguyên vị trí — hãy kiểm tra lại sau khi đổi ranh đất.",
        confirmText: "Cập nhật",
      });
      if (!ok) return;
    }
    try {
      let imageId = lot.imageId;
      if (fromTrace && blob && isNewImage) {
        imageId = await saveImage(blob);
        if (lot.imageId) await deleteImage(lot.imageId).catch(() => undefined);
      }
      const next: Lot = {
        imageId,
        trace: fromTrace && scale ? { points, pxPerMeter: scale, rotation } : null,
        polygon,
        edgeLengths: fromTrace ? points.map((_, i) => lengths[i] ?? null) : edgeLengths(polygon),
        certifiedArea,
        parcelNo: parcelNo.trim(),
        mapSheetNo: mapSheetNo.trim(),
        address: address.trim(),
      };
      useProjectStore.getState().setLot(next);
      useEditorStore.getState().requestFit();
      toast.success("Đã cập nhật ranh đất.");
      onClose();
    } catch (err) {
      console.error(err);
      toast.error("Không lưu được ranh đất.");
    }
  };

  const certificateFields = (
    <Col className="gap-2">
      <NumberField label="Diện tích trên sổ" value={certifiedArea} onCommit={setCertifiedArea} allowEmpty min={1} max={1e6} suffix="m²" />
      <Row className="gap-2">
        <TextField className="flex-1" label="Thửa số" value={parcelNo} onCommit={setParcelNo} />
        <TextField className="flex-1" label="Tờ bản đồ" value={mapSheetNo} onCommit={setMapSheetNo} />
      </Row>
      <TextField label="Địa chỉ" value={address} onCommit={setAddress} maxLength={500} />
    </Col>
  );

  const footer =
    step === "trace" ? (
      <>
        <Button onClick={() => setStep("source")}>Quay lại</Button>
        <Button variant="primary" disabled={!traceValid || knownCount === 0 || !solved} onClick={() => setStep("review")}>
          Tiếp tục
        </Button>
      </>
    ) : step === "review" ? (
      <>
        <Button onClick={() => setStep("trace")}>Quay lại</Button>
        <Button variant="primary" disabled={!solved} onClick={() => solved && void apply(solved.polygon, true)}>
          Áp dụng ranh đất
        </Button>
      </>
    ) : step === "manual" ? (
      <>
        <Button onClick={() => setStep("source")}>Quay lại</Button>
        <Button variant="primary" disabled={manualPoly.length < 3 || !isSimplePolygon(manualPoly)} onClick={() => void apply(normalizeOrigin(manualPoly), false)}>
          Áp dụng ranh đất
        </Button>
      </>
    ) : (
      <Button onClick={onClose}>Đóng</Button>
    );

  return (
    <Modal open onClose={onClose} title="Ranh giới thửa đất" size="xl" footer={footer}>
      <Col className="h-[70vh] gap-3">
        {step !== "manual" && (
          <Row className="gap-2 text-xs" aria-label="Các bước">
            {STEP_LABELS.map((s) => (
              <Text key={s.key} className={`rounded-full px-3 py-1 ${s.key === step ? "bg-brand-600 text-white" : "bg-surface-muted text-ink-muted"}`}>
                {s.label}
              </Text>
            ))}
          </Row>
        )}

        {step === "source" && (
          <Row className="min-h-0 flex-1 gap-4">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (f) onFile(f);
              }}
              className="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-line-strong bg-surface-muted p-6 text-center hover:border-brand-500 hover:bg-brand-50"
            >
              <Upload size={36} className="text-brand-600" />
              <TextPrimary className="font-semibold">Tải ảnh sổ đỏ / sơ đồ thửa đất</TextPrimary>
              <TextMuted className="text-sm">Kéo thả hoặc bấm để chọn ảnh (PNG, JPG, WEBP — tối đa 25 MB). Ảnh chỉ được xử lý trên máy bạn.</TextMuted>
              {lot.imageId && <TextFaint className="text-xs">Dự án đã có ảnh — chọn ảnh mới để thay thế.</TextFaint>}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPTED_IMAGE_TYPES.join(",")}
              className="hidden"
              aria-label="Chọn ảnh sổ đỏ"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFile(f);
                e.target.value = "";
              }}
            />
            <Col className="w-80 gap-3">
              {blob && (
                <Button icon={<FileImage size={16} />} onClick={() => setStep("trace")}>
                  Tiếp tục với ảnh hiện có
                </Button>
              )}
              <button type="button" onClick={() => setStep("manual")} className="flex flex-col items-start gap-1 rounded-xl border border-line p-4 text-left hover:bg-surface-muted">
                <TextPrimary className="flex items-center gap-2 font-semibold">
                  <PenLine size={16} /> Nhập toạ độ thủ công
                </TextPrimary>
                <TextMuted className="text-sm">Không có ảnh? Nhập kích thước / toạ độ các góc thửa đất.</TextMuted>
              </button>
              {certificateFields}
            </Col>
          </Row>
        )}

        {step === "manual" && <ManualLotEditor polygon={manualPoly} onChange={setManualPoly} />}

        {step === "trace" && (
          <Row className="min-h-0 flex-1 gap-3">
            <Col className="min-w-0 flex-1 gap-2">
              <Row className="flex-wrap items-center gap-1">
                <Button size="sm" icon={<RotateCw size={14} />} onClick={rotate} disabled={!canvas}>
                  Xoay 90°
                </Button>
                <Button size="sm" variant="primary" icon={<ScanText size={14} />} disabled={!canvas || ocrBusy} onClick={() => void runOcr()}>
                  Đọc số (OCR)
                </Button>
                <Button size="sm" icon={<Crop size={14} />} variant={regionMode ? "primary" : "secondary"} disabled={!canvas || ocrBusy} onClick={() => setRegionMode((m) => !m)}>
                  {regionMode ? "Kéo để khoanh vùng…" : "OCR theo vùng"}
                </Button>
                <Button size="sm" icon={<Sparkles size={14} />} disabled={!numbers.length || points.length < 3} onClick={autoAssign}>
                  Tự ghép số vào cạnh
                </Button>
                <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} disabled={!points.length} onClick={() => setPointsKeepLengths([])}>
                  Xoá ranh
                </Button>
                {progress && (
                  <Row className="ml-2 items-center gap-2 text-xs text-ink-muted" role="status">
                    <Box className="h-1.5 w-32 overflow-hidden rounded bg-surface-muted">
                      <Box className="h-full bg-brand-600 transition-all" style={{ width: `${Math.round(progress.progress * 100)}%` }} />
                    </Box>
                    {progress.status}
                  </Row>
                )}
              </Row>
              <Box className="min-h-0 flex-1 overflow-hidden rounded-lg border border-line">
                <TraceCanvas
                  image={canvas}
                  points={points}
                  onChange={(p) => setPointsKeepLengths(p)}
                  numbers={numbers}
                  assigned={assignedSet}
                  selectedEdge={selectedEdge}
                  onSelectEdge={setSelectedEdge}
                  onNumberClick={assignNumber}
                  regionMode={regionMode}
                  onRegion={(r) => void runOcr(r)}
                  lengths={lengths}
                />
              </Box>
              <TextFaint as="p" className="text-xs">
                Nhấp vào ảnh để thêm góc thửa theo thứ tự · Kéo góc để chỉnh · Chuột phải / Alt+nhấp để xoá góc · Shift+nhấp lên cạnh để chèn góc · Lăn chuột để phóng to, chuột giữa để cuộn.
              </TextFaint>
            </Col>
            <Col className="w-80 shrink-0 gap-3 overflow-y-auto">
              <Col className="gap-1">
                <TextPrimary className="text-sm font-semibold">Kích thước các cạnh (theo sổ)</TextPrimary>
                {points.length < 3 ? (
                  <TextMuted className="text-xs">Vẽ ít nhất 3 góc của thửa đất trên ảnh.</TextMuted>
                ) : (
                  points.map((p, i) => {
                    const px = dist(p, points[(i + 1) % points.length]);
                    const est = scale ? px / scale : null;
                    return (
                      <Row key={i} className={`items-center gap-2 rounded-md px-1.5 py-1 ${selectedEdge === i ? "bg-brand-50 ring-1 ring-brand-300" : ""}`} onClick={() => setSelectedEdge(i)}>
                        <Text tone="primary" className="w-9 text-xs font-semibold">
                          {edgeName(i, points.length)}
                        </Text>
                        <NumberField
                          className="flex-1"
                          aria-label={`Độ dài cạnh ${edgeName(i, points.length)}`}
                          value={lengths[i] ?? null}
                          allowEmpty
                          min={0.1}
                          max={1000}
                          suffix="m"
                          placeholder={est ? `≈ ${est.toFixed(2)}` : "chưa có"}
                          onCommit={(n) => setEdge(i, n, null)}
                        />
                        <IconButton
                          label="Xoá độ dài"
                          disabled={lengths[i] == null}
                          onClick={(e) => {
                            e.stopPropagation();
                            setEdge(i, null, null);
                          }}
                        >
                          <X size={14} />
                        </IconButton>
                      </Row>
                    );
                  })
                )}
                {points.length >= 3 && !traceValid && <Text className="text-xs text-danger-600">Các cạnh đang cắt nhau — hãy chỉnh lại thứ tự góc.</Text>}
                {points.length >= 3 && knownCount === 0 && <TextMuted className="text-xs">Cần ít nhất 1 cạnh có kích thước để tính tỉ lệ.</TextMuted>}
              </Col>
              {certificateFields}
            </Col>
          </Row>
        )}

        {step === "review" && solved && (
          <Row className="min-h-0 flex-1 gap-4">
            <Box className="min-w-0 flex-1 rounded-lg border border-line bg-surface p-2">
              <LotPreview polygon={solved.polygon} residuals={solved.residuals} height={480} />
            </Box>
            <Col className="w-80 shrink-0 gap-2 text-sm">
              <Row className="justify-between">
                <TextMuted>Diện tích tính được</TextMuted>
                <TextPrimary className="font-semibold">{fmtArea(area(solved.polygon))}</TextPrimary>
              </Row>
              {certifiedArea != null && (
                <Row className="justify-between">
                  <TextMuted>Diện tích trên sổ</TextMuted>
                  <TextPrimary>
                    {fmtArea(certifiedArea)} ({(((area(solved.polygon) - certifiedArea) / certifiedArea) * 100).toFixed(1).replace(".", ",")}%)
                  </TextPrimary>
                </Row>
              )}
              <Row className="justify-between">
                <TextMuted>Sai lệch cạnh lớn nhất</TextMuted>
                <Text className={solved.maxError < 0.02 ? "text-success-600" : solved.maxError < 0.1 ? "text-warning-600" : "text-danger-600"}>{fmtLength(solved.maxError)}</Text>
              </Row>
              <Row className="justify-between">
                <TextMuted>Tỉ lệ ảnh</TextMuted>
                <TextPrimary>{solved.pxPerMeter.toFixed(1)} px/m</TextPrimary>
              </Row>
              <TextFaint as="p" className="mt-2 text-xs">
                Hình dạng được giữ theo nét vẽ trên ảnh và co giãn để khớp kích thước ghi trên sổ. Cạnh màu đỏ/cam có sai lệch lớn — kiểm tra lại số hoặc vị trí góc. Các cạnh chưa có số được giữ theo tỉ lệ ảnh.
              </TextFaint>
              {solved.maxError >= 0.1 && (
                <TextMuted as="p" className="rounded-md bg-warning-50 p-2 text-xs text-warning-800">
                  Các kích thước không khép kín được với hình đã vẽ. Có thể một số bị đọc sai hoặc gán nhầm cạnh.
                </TextMuted>
              )}
            </Col>
          </Row>
        )}
      </Col>
    </Modal>
  );
}
