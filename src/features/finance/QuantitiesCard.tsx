"use client";

import { useMemo } from "react";
import { Calculator, FileSpreadsheet, RotateCcw, Wand2 } from "lucide-react";
import { Box, Row, Text, TextFaint, TextMuted } from "@/components/ui/BasePrimitives";
import { Button } from "@/components/ui/Button";
import { NumberField } from "@/components/ui/Fields";
import { toast } from "@/components/ui/Toast";
import { useProjectStore } from "@/store/projectStore";
import { computeQuantities, QUANTITY_GROUP_LABELS, type QuantityGroup, type QuantityLine, type QuantityResult } from "@/domain/quantities";
import { computeFinance, equivalentArea, fmtTr, fmtTy } from "@/domain/finance";
import { fmtArea } from "@/domain/labels";
import { buildXlsx } from "@/persistence/xlsx";
import { downloadBlob, slugify } from "@/ocr/image";

const nf0 = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 });
const qtyText = (l: QuantityLine) => (["viên", "bao", "bộ", "kg", "lít"].includes(l.unit) ? nf0 : nf1).format(l.qty);
const GROUPS = Object.keys(QUANTITY_GROUP_LABELS) as QuantityGroup[];

function exportXlsx(name: string, r: QuantityResult) {
  const rows: (string | number | null)[][] = [[`Dự toán vật tư sơ bộ — ${name}`], [`Tổng diện tích sàn: ${nf1.format(r.floorArea)} m²`], [], ["Hạng mục", "Khối lượng", "Đơn vị", "Đơn giá (đ)", "Thành tiền (triệu đ)", "Ghi chú"]];
  for (const g of GROUPS) {
    const lines = r.lines.filter((l) => l.group === g);
    if (!lines.length) continue;
    rows.push([QUANTITY_GROUP_LABELS[g]]);
    for (const l of lines) rows.push([l.name, Math.round(l.qty * 100) / 100, l.unit, l.unitPrice, Math.round(l.amount * 100) / 100, l.note ?? null]);
  }
  rows.push([], ["Tổng cộng", null, null, null, Math.round(r.total * 100) / 100], ["Bình quân / m² sàn (triệu đ)", null, null, null, Math.round(r.perM2 * 100) / 100]);
  const bytes = buildXlsx("Dự toán", rows, [44, 12, 8, 14, 18, 50]);
  downloadBlob(new Blob([bytes as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${slugify(name)}-du-toan.xlsx`);
}

/** "Bóc khối lượng & dự toán vật tư": quantities read off the drawing, editable unit prices. */
export function QuantitiesCard() {
  const project = useProjectStore((s) => s.project)!;
  const r = useMemo(() => computeQuantities(project), [project]);
  const finance = useMemo(() => computeFinance(project), [project]);
  const prices = project.finance.materialPrices;
  const setPrice = (key: string, v: number | null) => {
    const next = { ...prices };
    if (v == null) delete next[key];
    else next[key] = v;
    useProjectStore.getState().setFinance({ materialPrices: next });
  };
  const turnkey = finance.costs[0]?.amount ?? 0;
  const diff = r.total - turnkey;

  const applyToFinance = () => {
    const area = equivalentArea(project).total;
    if (!area || !r.total) return;
    const f = project.finance;
    useProjectStore.getState().setFinance({ unitPrice: Math.round((r.total / area / (1 + f.surchargePct / 100)) * 100) / 100 });
    toast.success("Đã cập nhật đơn giá trọn gói theo dự toán vật tư.");
  };

  if (!r.floorArea) {
    return (
      <TextMuted as="p" className="text-sm">
        Chưa có tường hay phòng nào — vẽ mặt bằng (hoặc mở một nhà mẫu) để bóc khối lượng.
      </TextMuted>
    );
  }

  return (
    <Box>
      <Row className="mb-2 flex-wrap items-center gap-2">
        <Text className="flex items-center gap-1.5 text-sm text-ink-muted">
          <Calculator size={14} /> Sàn {fmtArea(r.floorArea)} · tường xây {fmtArea(r.wallArea)}
        </Text>
        <Row className="ml-auto flex-wrap gap-1">
          <Button size="sm" icon={<FileSpreadsheet size={14} />} onClick={() => exportXlsx(project.name, r)}>
            Xuất Excel
          </Button>
          <Button size="sm" icon={<Wand2 size={14} />} onClick={applyToFinance}>
            Dùng làm đơn giá xây
          </Button>
          {Object.keys(prices).length > 0 && (
            <Button size="sm" variant="ghost" icon={<RotateCcw size={14} />} onClick={() => useProjectStore.getState().setFinance({ materialPrices: {} })}>
              Giá mặc định
            </Button>
          )}
        </Row>
      </Row>
      <Box className="overflow-x-auto">
        <table className="w-full border-collapse text-sm" aria-label="Dự toán vật tư">
          <thead>
            <tr className="border-b border-line text-left text-xs text-ink-muted">
              <th className="py-1 pr-2 font-medium">Hạng mục</th>
              <th className="py-1 pr-2 text-right font-medium">Khối lượng</th>
              <th className="w-36 py-1 pr-2 text-right font-medium">Đơn giá (đ)</th>
              <th className="py-1 text-right font-medium">Thành tiền</th>
            </tr>
          </thead>
          {GROUPS.map((g) => {
            const lines = r.lines.filter((l) => l.group === g);
            if (!lines.length) return null;
            return (
              <tbody key={g}>
                <tr>
                  <td colSpan={4} className="pb-0.5 pt-2 text-caption font-semibold uppercase tracking-wide text-ink-muted">
                    {QUANTITY_GROUP_LABELS[g]}
                  </td>
                </tr>
                {lines.map((l) => (
                  <tr key={l.key} className="border-b border-line/60 align-middle">
                    <td className="py-1 pr-2">
                      <Text className="text-ink">{l.name}</Text>
                      {l.note && <TextFaint className="block text-xs">{l.note}</TextFaint>}
                    </td>
                    <td className="whitespace-nowrap py-1 pr-2 text-right tabular-nums">
                      {qtyText(l)} {l.unit}
                    </td>
                    <td className="py-1 pr-2">
                      {l.price > 0 ? (
                        <NumberField aria-label={`Đơn giá ${l.name}`} className="w-36" value={l.unitPrice} min={0} max={1e9} step={1000} decimals={0} onCommit={(n) => setPrice(l.key, n)} />
                      ) : (
                        <TextFaint className="block text-right text-xs">quy ra vật liệu</TextFaint>
                      )}
                    </td>
                    <td className="whitespace-nowrap py-1 text-right tabular-nums">{l.price > 0 ? fmtTr(l.amount) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            );
          })}
          <tfoot className="font-semibold">
            <tr>
              <td className="pt-2">Tổng dự toán</td>
              <td colSpan={3} className="pt-2 text-right tabular-nums">
                {fmtTy(r.total)} <TextMuted className="font-normal">(≈ {nf1.format(r.perM2)} tr/m² sàn)</TextMuted>
              </td>
            </tr>
            <tr>
              <td className="font-normal text-ink-muted">So với giá trọn gói đang nhập ({fmtTy(turnkey)})</td>
              <td colSpan={3} className={`text-right tabular-nums ${diff > 0 ? "text-danger-600" : "text-success-600"}`}>
                {diff > 0 ? "+" : "−"} {fmtTy(Math.abs(diff))}
              </td>
            </tr>
          </tfoot>
        </table>
      </Box>
      <TextMuted as="p" className="mt-2 text-xs leading-relaxed">
        Khối lượng xây tô, sơn, gạch, cửa đọc từ bản vẽ; bê tông và thép ước theo m² sàn của nhà phố 3–5 tầng. Đơn giá tham khảo TP.HCM 2026, bấm vào ô để sửa theo báo giá. Chưa gồm nội thất, thang máy, PCCC (nhập ở &quot;Chi phí khác&quot;).
      </TextMuted>
    </Box>
  );
}
