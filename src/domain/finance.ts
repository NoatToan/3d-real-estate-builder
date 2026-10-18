import type { FinanceScenario, Project } from "./types";
import { floorGrossArea } from "./stats";

/** Cash-flow horizon shown in the chart and the yearly table. */
export const FINANCE_HORIZON_YEARS = 20;

/** How each scenario shifts the base assumptions (applied on top of the inputs). */
export const SCENARIO_ADJUST: Record<FinanceScenario, { label: string; income: number; occupancy: number; growth: number }> = {
  low: { label: "Thấp", income: 0.7, occupancy: -10, growth: -2 },
  base: { label: "Cơ sở", income: 1, occupancy: 0, growth: 0 },
  high: { label: "Cao", income: 1.3, occupancy: 5, growth: 1 },
};

export interface EquivalentArea {
  /** Area actually used for pricing (override or computed). */
  total: number;
  computed: number;
  overridden: boolean;
  parts: { label: string; area: number; factor: number }[];
}

/**
 * Equivalent floor area (diện tích quy đổi) the way Vietnamese contractors price turnkey
 * builds: foundation as a share of the ground floor, every floor at 100%, roof as a share
 * of the top floor.
 */
export function equivalentArea(p: Project): EquivalentArea {
  const f = p.finance;
  const gross = p.floors.map(floorGrossArea);
  const parts: EquivalentArea["parts"] = [];
  if (gross.length) parts.push({ label: "Móng", area: gross[0], factor: f.foundationPct / 100 });
  p.floors.forEach((fl, i) => parts.push({ label: fl.name, area: gross[i], factor: 1 }));
  if (gross.length) parts.push({ label: "Mái", area: gross[gross.length - 1], factor: f.roofPct / 100 });
  const computed = parts.reduce((s, x) => s + x.area * x.factor, 0);
  const overridden = f.areaOverride != null;
  return { total: overridden ? f.areaOverride! : computed, computed, overridden, parts };
}

export interface FinanceYear {
  year: number;
  /** Potential revenue before vacancy. */
  gross: number;
  collected: number;
  tax: number;
  opex: number;
  /** Net operating income: collected − tax − opex. */
  noi: number;
  debt: number;
  cash: number;
  cumulative: number;
}

export interface LoanYear {
  year: number;
  /** Net income paid to the bank that year. */
  paid: number;
  interest: number;
  balance: number;
}

export interface FinanceResult {
  area: EquivalentArea;
  costs: { name: string; amount: number }[];
  construction: number;
  contingency: number;
  total: number;
  ownUsed: number;
  loan: number;
  surplus: number;
  monthlyPayment: number;
  /** Interest during construction (on half the loan, drawn down evenly). */
  constructionInterest: number;
  /** Monthly revenue at 100% occupancy, year 1, after the scenario. */
  monthlyRevenue: number;
  occupancy: number;
  rentGrowth: number;
  incomeFactor: number;
  year0: number;
  years: FinanceYear[];
  /** First year the cumulative cash flow turns positive, or null within the horizon. */
  breakEvenYear: number | null;
  /** First year cumulative NOI covers total cost + construction interest. */
  paybackYear: number | null;
  /** Loan start balance (loan + construction interest). */
  loanStart: number;
  loanYears: LoanYear[];
  /** When the loan is cleared if every NOI đồng goes to the bank (year index from first rental year, month 1–12). */
  loanPayoff: { year: number; month: number } | null;
  /** Year-1 NOI / total cost. */
  yieldYear1: number;
}

/** Monthly annuity payment. */
export function annuity(principal: number, annualRatePct: number, years: number): number {
  if (principal <= 0) return 0;
  const n = Math.max(1, Math.round(years * 12));
  const r = annualRatePct / 100 / 12;
  return r > 0 ? (principal * r) / (1 - Math.pow(1 + r, -n)) : principal / n;
}

export function computeFinance(p: Project, horizon = FINANCE_HORIZON_YEARS): FinanceResult {
  const f = p.finance;
  const adj = SCENARIO_ADJUST[f.scenario];
  const area = equivalentArea(p);

  const construction = area.total * f.unitPrice * (1 + f.surchargePct / 100);
  const costs = [{ name: `Xây trọn gói (${area.total.toFixed(0)} m² quy đổi)`, amount: construction }, ...f.extraCosts.map((c) => ({ name: c.name, amount: c.amount }))];
  const subtotal = costs.reduce((s, c) => s + c.amount, 0);
  const contingency = (subtotal * f.contingencyPct) / 100;
  const total = subtotal + contingency;

  const ownUsed = Math.min(Math.max(0, f.ownCapital), total);
  const loan = Math.max(0, total - f.ownCapital);
  const surplus = Math.max(0, f.ownCapital - total);
  const monthlyPayment = annuity(loan, f.loanRatePct, f.loanYears);
  const constructionInterest = loan * (f.loanRatePct / 100) * (f.buildMonths / 12) * 0.5;

  const incomeFactor = adj.income;
  const monthlyRevenue = f.income.reduce((s, i) => s + i.quantity * i.unitPrice, 0) * incomeFactor;
  const occupancy = Math.min(100, Math.max(0, f.occupancyPct + adj.occupancy)) / 100;
  const rentGrowth = (f.rentGrowthPct + adj.growth) / 100;

  const year0 = -(ownUsed + constructionInterest);
  let cumulative = year0;
  const years: FinanceYear[] = [];
  for (let y = 1; y <= horizon; y++) {
    const gross = monthlyRevenue * 12 * Math.pow(1 + rentGrowth, y - 1);
    const collected = gross * occupancy;
    const tax = (collected * f.taxPct) / 100;
    const opex = f.opexMonthly * 12 * Math.pow(1 + f.opexGrowthPct / 100, y - 1);
    const noi = collected - tax - opex;
    const debt = y <= f.loanYears ? monthlyPayment * 12 : 0;
    const cash = noi - debt;
    cumulative += cash;
    years.push({ year: y, gross, collected, tax, opex, noi, debt, cash, cumulative });
  }

  const breakEvenYear = years.find((d) => d.cumulative >= 0)?.year ?? null;
  let paybackYear: number | null = null;
  let acc = 0;
  for (const d of years) {
    acc += d.noi;
    if (acc >= total + constructionInterest) {
      paybackYear = d.year;
      break;
    }
  }

  const loanStart = loan > 0 ? loan + constructionInterest : 0;
  const r = f.loanRatePct / 100 / 12;
  let balance = loanStart;
  let loanPayoff: FinanceResult["loanPayoff"] = loanStart <= 0 ? { year: 0, month: 0 } : null;
  const loanYears: LoanYear[] = [];
  for (const d of years) {
    let interest = 0;
    for (let m = 1; m <= 12; m++) {
      const it = balance > 0 ? balance * r : 0;
      interest += it;
      balance += it - d.noi / 12;
      if (!loanPayoff && balance <= 0) loanPayoff = { year: d.year, month: m };
    }
    loanYears.push({ year: d.year, paid: d.noi, interest, balance });
  }

  return {
    area,
    costs,
    construction,
    contingency,
    total,
    ownUsed,
    loan,
    surplus,
    monthlyPayment,
    constructionInterest,
    monthlyRevenue,
    occupancy,
    rentGrowth,
    incomeFactor,
    year0,
    years,
    breakEvenYear,
    paybackYear,
    loanStart,
    loanYears,
    loanPayoff,
    yieldYear1: total > 0 && years.length ? years[0].noi / total : 0,
  };
}

const nfTy = new Intl.NumberFormat("vi-VN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nfTr = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 });

/** Million VND → "x,xx tỷ". */
export const fmtTy = (million: number): string => `${nfTy.format(million / 1000)} tỷ`;
/** Million VND → "x,x tr". */
export const fmtTr = (million: number): string => `${nfTr.format(million)} tr`;
