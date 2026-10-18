"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Plus, RotateCcw, Trash2 } from "lucide-react";
import { Box, Col, Row, Text, TextFaint, TextMuted } from "@/components/ui/BasePrimitives";
import { Button, IconButton } from "@/components/ui/Button";
import { NumberField, SegmentedControl, TextField } from "@/components/ui/Fields";
import { useProjectStore } from "@/store/projectStore";
import { newId } from "@/domain/factory";
import { computeFinance, fmtTr, fmtTy, SCENARIO_ADJUST, type FinanceResult } from "@/domain/finance";
import { fmtArea } from "@/domain/labels";
import { FINANCE_SCENARIOS, type CostItem, type FinanceInputs, type IncomeItem } from "@/domain/types";
import { CashflowChart, type ChartPoint } from "./CashflowChart";

type Goal = "equity" | "loan";

const SCENARIO_OPTIONS = FINANCE_SCENARIOS.map((s) => ({ value: s, label: SCENARIO_ADJUST[s].label }));
const GOAL_OPTIONS: { value: Goal; label: string }[] = [
  { value: "equity", label: "Hoàn vốn tự có" },
  { value: "loan", label: "Trả hết tiền vay" },
];

function useFinance() {
  const project = useProjectStore((s) => s.project)!;
  const set = useProjectStore((s) => s.setFinance);
  const result = useMemo(() => computeFinance(project), [project]);
  return { f: project.finance, set, result };
}

function Card({ title, children, className = "" }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <Box as="section" className={`rounded-lg border border-line bg-surface p-3 ${className}`}>
      {title && <h3 className="mb-2 text-sm font-semibold text-ink">{title}</h3>}
      {children}
    </Box>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="rounded-lg border border-line bg-surface px-3 pb-3 pt-1">
      <legend className="px-1 text-caption font-semibold uppercase tracking-wide text-ink-muted">{title}</legend>
      <Col className="gap-2">{children}</Col>
    </fieldset>
  );
}

/** Label on the left, compact number input on the right. */
function Num({
  label,
  hint,
  value,
  onCommit,
  suffix,
  min = 0,
  max,
  step = 1,
  decimals = 2,
}: {
  label: string;
  hint?: string;
  value: number;
  onCommit: (n: number) => void;
  suffix?: string;
  min?: number;
  max?: number;
  step?: number;
  decimals?: number;
}) {
  return (
    <Row className="items-center justify-between gap-2">
      <Text className="min-w-0 text-sm text-ink">
        {label}
        {hint && <TextFaint className="block text-xs">{hint}</TextFaint>}
      </Text>
      <NumberField
        aria-label={label}
        className="w-28 shrink-0"
        value={value}
        min={min}
        max={max}
        step={step}
        decimals={decimals}
        suffix={suffix}
        onCommit={(n) => onCommit(n ?? 0)}
      />
    </Row>
  );
}

function CostList({ items, onChange }: { items: CostItem[]; onChange: (items: CostItem[]) => void }) {
  const patch = (id: string, p: Partial<CostItem>) => onChange(items.map((c) => (c.id === id ? { ...c, ...p } : c)));
  return (
    <Col className="gap-1.5">
      {items.map((c) => (
        <Row key={c.id} className="items-center gap-1.5">
          <TextField className="min-w-0 flex-1" value={c.name} onCommit={(name) => patch(c.id, { name })} />
          <NumberField aria-label={`Số tiền: ${c.name}`} className="w-24 shrink-0" value={c.amount} min={0} step={10} decimals={1} suffix="tr" onCommit={(n) => patch(c.id, { amount: n ?? 0 })} />
          <IconButton label={`Xoá ${c.name}`} className="h-8 w-8" onClick={() => onChange(items.filter((x) => x.id !== c.id))}>
            <Trash2 size={14} />
          </IconButton>
        </Row>
      ))}
      <Button size="sm" variant="ghost" icon={<Plus size={14} />} className="self-start" onClick={() => onChange([...items, { id: newId("c_"), name: "Hạng mục mới", amount: 0 }])}>
        Thêm hạng mục
      </Button>
    </Col>
  );
}

function IncomeList({ items, onChange }: { items: IncomeItem[]; onChange: (items: IncomeItem[]) => void }) {
  const patch = (id: string, p: Partial<IncomeItem>) => onChange(items.map((c) => (c.id === id ? { ...c, ...p } : c)));
  return (
    <Col className="gap-2">
      {items.map((c) => (
        <Col key={c.id} className="gap-1 rounded-md bg-surface-muted p-1.5">
          <Row className="items-center gap-1.5">
            <TextField className="min-w-0 flex-1" value={c.name} onCommit={(name) => patch(c.id, { name })} />
            <IconButton label={`Xoá ${c.name}`} className="h-8 w-8" onClick={() => onChange(items.filter((x) => x.id !== c.id))}>
              <Trash2 size={14} />
            </IconButton>
          </Row>
          <Row className="items-center gap-1.5">
            <NumberField aria-label={`Số lượng: ${c.name}`} className="w-20" value={c.quantity} min={0} step={1} decimals={2} suffix="×" onCommit={(n) => patch(c.id, { quantity: n ?? 0 })} />
            <NumberField aria-label={`Đơn giá: ${c.name}`} className="flex-1" value={c.unitPrice} min={0} step={0.5} decimals={2} suffix="tr/th" onCommit={(n) => patch(c.id, { unitPrice: n ?? 0 })} />
            <TextMuted className="w-16 shrink-0 text-right text-xs tabular-nums">{fmtTr(c.quantity * c.unitPrice)}</TextMuted>
          </Row>
        </Col>
      ))}
      <Button size="sm" variant="ghost" icon={<Plus size={14} />} className="self-start" onClick={() => onChange([...items, { id: newId("i_"), name: "Nguồn thu mới", quantity: 1, unitPrice: 0 }])}>
        Thêm nguồn thu
      </Button>
    </Col>
  );
}

function Inputs() {
  const { f, set, result } = useFinance();
  const up = <K extends keyof FinanceInputs>(k: K) => (v: FinanceInputs[K]) => set({ [k]: v } as Partial<FinanceInputs>);
  return (
    <Col className="gap-3">
      <SegmentedControl label="Kịch bản" value={f.scenario} options={SCENARIO_OPTIONS} onChange={up("scenario")} />
      <TextFaint as="p" className="-mt-1 text-xs">
        Kịch bản điều chỉnh trên số liệu nhập: thấp = thu ×0,7, lấp đầy −10 điểm, tăng giá −2 điểm; cao = thu ×1,3, lấp đầy +5, tăng giá +1.
      </TextFaint>

      <Group title="Xây dựng">
        <Row className="items-center justify-between gap-2">
          <Text className="min-w-0 text-sm text-ink">
            Diện tích quy đổi
            <TextFaint className="block text-xs">
              {result.area.overridden ? `Tự nhập · theo bản vẽ ${fmtArea(result.area.computed)}` : "Tính từ các tầng đã vẽ"}
            </TextFaint>
          </Text>
          <Row className="shrink-0 items-center gap-1">
            {result.area.overridden && (
              <IconButton label="Tính lại theo bản vẽ" className="h-8 w-8" onClick={() => set({ areaOverride: null })}>
                <RotateCcw size={14} />
              </IconButton>
            )}
            <NumberField
              aria-label="Diện tích quy đổi"
              className="w-28"
              value={Math.round(result.area.total * 10) / 10}
              min={0}
              step={10}
              decimals={1}
              suffix="m²"
              onCommit={(n) => set({ areaOverride: n })}
            />
          </Row>
        </Row>
        <Num label="Đơn giá trọn gói" hint="triệu / m² quy đổi" value={f.unitPrice} step={0.05} onCommit={up("unitPrice")} suffix="tr" />
        <Num label="Phụ phí" hint="ví dụ +5% lô hẹp, hẻm nhỏ" value={f.surchargePct} max={100} onCommit={up("surchargePct")} suffix="%" />
        <Num label="Hệ số móng" hint="% diện tích tầng 1" value={f.foundationPct} max={200} step={5} onCommit={up("foundationPct")} suffix="%" />
        <Num label="Hệ số mái" hint="% diện tích tầng trên cùng" value={f.roofPct} max={200} step={5} onCommit={up("roofPct")} suffix="%" />
        <Num label="Thời gian thi công" value={f.buildMonths} max={120} decimals={0} onCommit={up("buildMonths")} suffix="th" />
      </Group>

      <Group title="Chi phí khác">
        <CostList items={f.extraCosts} onChange={up("extraCosts")} />
        <Num label="Dự phòng" value={f.contingencyPct} max={100} onCommit={up("contingencyPct")} suffix="%" />
      </Group>

      <Group title="Nguồn vốn & vay">
        <Num label="Vốn tự có" hint="tiết kiệm, tiền đền bù… phần thiếu sẽ vay" value={f.ownCapital / 1000} step={0.1} onCommit={(n) => set({ ownCapital: n * 1000 })} suffix="tỷ" />
        <Num label="Lãi suất vay" value={f.loanRatePct} max={50} step={0.1} onCommit={up("loanRatePct")} suffix="%/n" />
        <Num label="Thời hạn vay" value={f.loanYears} min={1} max={35} decimals={0} onCommit={up("loanYears")} suffix="năm" />
      </Group>

      <Group title="Cho thuê (mỗi tháng)">
        <IncomeList items={f.income} onChange={up("income")} />
        <Num label="Tỷ lệ lấp đầy" value={f.occupancyPct} max={100} onCommit={up("occupancyPct")} suffix="%" />
        <Num label="Tăng giá thuê" value={f.rentGrowthPct} min={-20} max={50} step={0.5} onCommit={up("rentGrowthPct")} suffix="%/n" />
        <Num label="Thuế cho thuê" hint="% doanh thu" value={f.taxPct} max={100} step={0.5} onCommit={up("taxPct")} suffix="%" />
        <Num label="Chi phí vận hành" hint="điện nước chung, bảo trì, quản lý" value={f.opexMonthly} step={0.5} onCommit={up("opexMonthly")} suffix="tr/th" />
        <Num label="Tăng chi phí vận hành" value={f.opexGrowthPct} min={-20} max={50} step={0.5} onCommit={up("opexGrowthPct")} suffix="%/n" />
      </Group>
    </Col>
  );
}

function Tile({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: "good" | "bad" }) {
  const border = tone === "good" ? "border-l-4 border-l-success-600" : tone === "bad" ? "border-l-4 border-l-danger-600" : "";
  return (
    <Box className={`rounded-lg border border-line bg-surface px-3 py-2 ${border}`}>
      <TextMuted className="block text-xs">{label}</TextMuted>
      <Text className="mt-0.5 block text-lg font-bold tabular-nums text-ink">{value}</Text>
      {note && <TextFaint className="block text-xs">{note}</TextFaint>}
    </Box>
  );
}

const payoffText = (r: FinanceResult) =>
  !r.loanPayoff ? `> ${r.years.length} năm` : r.loanPayoff.year === 0 ? "Không vay" : `${r.loanPayoff.year - 1} năm ${r.loanPayoff.month} tháng`;

function Tiles({ r, goal }: { r: FinanceResult; goal: Goal }) {
  const f = useProjectStore((s) => s.project!.finance);
  const y1 = r.years[0];
  const monthNet = y1 ? y1.noi / 12 : 0;
  const monthAfter = y1 ? y1.cash / 12 : 0;
  return (
    <Box className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-2">
      <Tile label="Tổng chi phí đầu tư" value={fmtTy(r.total)} />
      <Tile label="Vốn tự có bỏ vào" value={fmtTy(r.ownUsed)} />
      {r.loan > 0 ? <Tile label="Cần vay thêm" value={fmtTy(r.loan)} tone="bad" /> : <Tile label="Dư sau khi xây" value={fmtTy(r.surplus)} tone="good" />}
      <Tile label="Trả góp mỗi tháng" value={fmtTr(r.monthlyPayment)} note={`${f.loanYears} năm, ${f.loanRatePct}%/năm`} />
      <Tile label="Thu ròng / tháng (năm 1)" value={fmtTr(monthNet)} note="sau trống, thuế, vận hành" />
      <Tile label="Còn dư sau trả nợ / tháng" value={fmtTr(monthAfter)} tone={monthAfter >= 0 ? "good" : "bad"} />
      <Tile label="Tỷ suất năm 1" value={`${(r.yieldYear1 * 100).toFixed(1).replace(".", ",")}%`} note="thu ròng / tổng chi phí" />
      {goal === "loan" ? (
        <Tile label="Trả hết tiền vay" value={payoffText(r)} note="dồn toàn bộ thu ròng trả ngân hàng" tone={r.loanPayoff ? "good" : "bad"} />
      ) : (
        <Tile label="Hoàn vốn toàn dự án" value={r.paybackYear ? `${r.paybackYear} năm` : `> ${r.years.length} năm`} note="thu ròng cộng dồn ≥ tổng chi phí" />
      )}
    </Box>
  );
}

function chartData(r: FinanceResult, goal: Goal): { points: ChartPoint[]; marker: { year: number; label: string } | null } {
  if (goal === "loan") {
    const points = [{ year: 0, bar: -r.loanStart, line: -r.loanStart }, ...r.loanYears.map((d) => ({ year: d.year, bar: d.paid, line: -d.balance }))];
    const p = r.loanPayoff;
    return { points, marker: p && p.year > 0 ? { year: p.year, label: `Trả hết vay: ${payoffText(r)}` } : null };
  }
  const points = [{ year: 0, bar: r.year0, line: r.year0 }, ...r.years.map((d) => ({ year: d.year, bar: d.cash, line: d.cumulative }))];
  return { points, marker: r.breakEvenYear ? { year: r.breakEvenYear, label: `Hòa vốn tiền mặt năm ${r.breakEvenYear}` } : null };
}

const td = "border-b border-line/60 py-1.5";
const tdn = `${td} text-right tabular-nums`;

function CostTable({ r }: { r: FinanceResult }) {
  const f = useProjectStore((s) => s.project!.finance);
  return (
    <table className="w-full border-collapse text-sm">
      <tbody>
        {r.costs.map((c, i) => (
          <tr key={i}>
            <td className={td}>{c.name}</td>
            <td className={tdn}>{fmtTy(c.amount)}</td>
          </tr>
        ))}
        <tr>
          <td className={td}>Dự phòng {f.contingencyPct}%</td>
          <td className={tdn}>{fmtTy(r.contingency)}</td>
        </tr>
      </tbody>
      <tfoot className="font-semibold">
        <tr>
          <td className="pt-2">Tổng</td>
          <td className="pt-2 text-right tabular-nums">{fmtTy(r.total)}</td>
        </tr>
        <tr>
          <td>Vốn tự có</td>
          <td className="text-right tabular-nums">− {fmtTy(r.ownUsed)}</td>
        </tr>
        <tr>
          <td>{r.loan > 0 ? "Cần vay" : "Còn dư"}</td>
          <td className={`text-right tabular-nums ${r.loan > 0 ? "text-danger-600" : ""}`}>{fmtTy(r.loan || r.surplus)}</td>
        </tr>
        <tr>
          <td>Lãi vay lúc thi công</td>
          <td className="text-right tabular-nums">{fmtTy(r.constructionInterest)}</td>
        </tr>
      </tfoot>
    </table>
  );
}

function MonthTable({ r }: { r: FinanceResult }) {
  const f = useProjectStore((s) => s.project!.finance);
  const y1 = r.years[0];
  if (!y1) return null;
  const m = (v: number) => fmtTr(v / 12);
  return (
    <table className="w-full border-collapse text-sm">
      <tbody>
        {f.income.map((i) => (
          <tr key={i.id}>
            <td className={td}>
              {i.name} {i.quantity !== 1 && <TextMuted>× {i.quantity.toLocaleString("vi-VN")}</TextMuted>}
            </td>
            <td className={tdn}>{fmtTr(i.quantity * i.unitPrice * r.incomeFactor)}</td>
          </tr>
        ))}
        <tr>
          <td className={td}>Trống {Math.round((1 - r.occupancy) * 100)}%</td>
          <td className={`${tdn} text-danger-600`}>− {m(y1.gross - y1.collected)}</td>
        </tr>
        <tr>
          <td className={td}>Thuế {f.taxPct}%</td>
          <td className={`${tdn} text-danger-600`}>− {m(y1.tax)}</td>
        </tr>
        <tr>
          <td className={td}>Vận hành</td>
          <td className={`${tdn} text-danger-600`}>− {m(y1.opex)}</td>
        </tr>
      </tbody>
      <tfoot className="font-semibold">
        <tr>
          <td className="pt-2">Thu ròng</td>
          <td className="pt-2 text-right tabular-nums">{m(y1.noi)}</td>
        </tr>
        <tr>
          <td>Trả góp</td>
          <td className="text-right tabular-nums text-danger-600">− {m(y1.debt)}</td>
        </tr>
        <tr>
          <td>Còn dư</td>
          <td className={`text-right tabular-nums ${y1.cash < 0 ? "text-danger-600" : ""}`}>{m(y1.cash)}</td>
        </tr>
      </tfoot>
    </table>
  );
}

function YearTable({ r, goal }: { r: FinanceResult; goal: Goal }) {
  const th = "border-b border-line pb-1.5 text-right text-caption font-semibold uppercase tracking-wide text-ink-muted";
  const neg = (v: number) => (v < 0 ? "text-danger-600" : "");
  if (goal === "loan")
    return (
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className={`${th} text-left`}>Năm</th>
            <th className={th}>Thu ròng trả nợ</th>
            <th className={th}>Lãi phát sinh</th>
            <th className={th}>Dư nợ cuối năm</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className={td}>0</td>
            <td className={tdn}>–</td>
            <td className={tdn}>–</td>
            <td className={`${tdn} text-danger-600`}>{fmtTy(r.loanStart)}</td>
          </tr>
          {r.loanYears.map((d) => (
            <tr key={d.year}>
              <td className={td}>{d.year}</td>
              <td className={tdn}>{fmtTy(d.paid)}</td>
              <td className={tdn}>{fmtTy(d.interest)}</td>
              <td className={`${tdn} ${d.balance > 0 ? "text-danger-600" : ""}`}>{d.balance > 0 ? fmtTy(d.balance) : `Đã trả hết (dư ${fmtTy(-d.balance)})`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr>
          <th className={`${th} text-left`}>Năm</th>
          <th className={th}>Thu ròng</th>
          <th className={th}>Trả nợ</th>
          <th className={th}>Dòng tiền</th>
          <th className={th}>Lũy kế</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td className={td}>0</td>
          <td className={tdn}>–</td>
          <td className={tdn}>–</td>
          <td className={`${tdn} ${neg(r.year0)}`}>{fmtTy(r.year0)}</td>
          <td className={`${tdn} ${neg(r.year0)}`}>{fmtTy(r.year0)}</td>
        </tr>
        {r.years.map((d) => (
          <tr key={d.year}>
            <td className={td}>{d.year}</td>
            <td className={tdn}>{fmtTy(d.noi)}</td>
            <td className={tdn}>{d.debt ? `− ${fmtTy(d.debt)}` : "–"}</td>
            <td className={`${tdn} ${neg(d.cash)}`}>{fmtTy(d.cash)}</td>
            <td className={`${tdn} ${neg(d.cumulative)}`}>{fmtTy(d.cumulative)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Feasibility view: investment budget, loan, rental income and a 20-year cash flow. */
export function FinanceView() {
  const { result: r } = useFinance();
  const [goal, setGoal] = useState<Goal>("equity");
  const chart = chartData(r, goal);
  const barLabel = goal === "loan" ? "Trả nợ trong năm" : "Dòng tiền năm";
  const lineLabel = goal === "loan" ? "Dư nợ (âm)" : "Lũy kế từ vốn bỏ ra";
  return (
    <Box className="absolute inset-0 overflow-auto bg-canvas p-3">
      <Box className="grid items-start gap-3 xl:grid-cols-[22rem_minmax(0,1fr)]">
        <Inputs />
        <Col className="min-w-0 gap-3">
          <Tiles r={r} goal={goal} />
          <Card>
            <Row className="mb-1 flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-ink">Dòng tiền {r.years.length} năm (tỷ đồng)</h3>
              <SegmentedControl label="Mốc hòa vốn" value={goal} options={GOAL_OPTIONS} onChange={setGoal} />
            </Row>
            <Row className="mb-1 flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
              <Text className="inline-flex items-center gap-1.5">
                <Text className="inline-block h-2.5 w-3 rounded-sm bg-brand-600" /> {barLabel} (dương)
              </Text>
              <Text className="inline-flex items-center gap-1.5">
                <Text className="inline-block h-2.5 w-3 rounded-sm bg-danger-600" /> {barLabel} (âm)
              </Text>
              <Text className="inline-flex items-center gap-1.5">
                <Text className="inline-block h-0.5 w-3 bg-ink" /> {lineLabel}
              </Text>
            </Row>
            <CashflowChart points={chart.points} marker={chart.marker} barLabel={barLabel} lineLabel={lineLabel} />
          </Card>
          <Box className="grid gap-3 lg:grid-cols-2">
            <Card title="Chi phí đầu tư">
              <CostTable r={r} />
            </Card>
            <Card title="Thu chi năm đầu (mỗi tháng)">
              <MonthTable r={r} />
            </Card>
          </Box>
          <details className="rounded-lg border border-line bg-surface px-3 py-2">
            <summary className="cursor-pointer text-sm font-semibold text-ink">Bảng dòng tiền từng năm</summary>
            <Box className="mt-2 overflow-x-auto">
              <YearTable r={r} goal={goal} />
            </Box>
          </details>
          <TextMuted as="p" className="text-xs leading-relaxed">
            Năm 0 gồm vốn tự có bỏ vào và lãi vay trong lúc thi công (tính trên 50% khoản vay giải ngân bình quân, chưa có tiền thuê). Từ năm 1: thu ròng = doanh thu × lấp đầy − thuế − vận hành; trả góp đều theo lãi suất và thời hạn vay. Diện tích quy đổi = móng × tầng 1 + tổng sàn các tầng + mái × tầng trên cùng. Đơn giá mặc định là ước tính, cần báo giá thực tế.
          </TextMuted>
        </Col>
      </Box>
    </Box>
  );
}
