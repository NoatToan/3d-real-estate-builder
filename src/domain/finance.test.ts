import { describe, expect, it } from "vitest";
import { annuity, computeFinance, equivalentArea, fmtTr, fmtTy } from "./finance";
import { createFloor, createLot, createProject, createWall, rectPolygon } from "./factory";
import { parseProject } from "./schema";
import type { FinanceInputs, Project } from "./types";

function boxWalls(w: number, h: number) {
  return [
    createWall({ x: 0, y: 0 }, { x: w, y: 0 }, 0.2),
    createWall({ x: w, y: 0 }, { x: w, y: h }, 0.2),
    createWall({ x: w, y: h }, { x: 0, y: h }, 0.2),
    createWall({ x: 0, y: h }, { x: 0, y: 0 }, 0.2),
  ];
}

function project(patch: Partial<FinanceInputs> = {}): Project {
  const p = createProject("Test", createLot(rectPolygon(6, 20)));
  p.finance = { ...p.finance, extraCosts: [], income: [], opexMonthly: 0, taxPct: 0, ...patch };
  return p;
}

describe("annuity", () => {
  it("matches the standard monthly payment formula", () => {
    expect(annuity(1000, 12, 1)).toBeCloseTo(88.849, 3);
    expect(annuity(1200, 0, 1)).toBe(100);
    expect(annuity(0, 10, 15)).toBe(0);
  });
});

describe("equivalentArea", () => {
  it("weights foundation and roof on top of every floor", () => {
    const p = project({ foundationPct: 50, roofPct: 50 });
    p.floors = [createFloor(0, { walls: boxWalls(5, 10) }), createFloor(1, { walls: boxWalls(5, 10) })];
    const a = equivalentArea(p);
    const floor = a.parts[1].area;
    expect(floor).toBeGreaterThan(49);
    expect(a.computed).toBeCloseTo(floor * 0.5 + floor * 2 + floor * 0.5, 6);
    expect(a.overridden).toBe(false);
  });

  it("uses the typed area when overridden", () => {
    const a = equivalentArea(project({ areaOverride: 781 }));
    expect(a.total).toBe(781);
    expect(a.overridden).toBe(true);
  });
});

describe("computeFinance", () => {
  it("prices construction, contingency and the loan", () => {
    const r = computeFinance(
      project({
        areaOverride: 100,
        unitPrice: 6,
        surchargePct: 5,
        extraCosts: [{ id: "c1", name: "Thang máy", amount: 370 }],
        contingencyPct: 10,
        ownCapital: 500,
        loanRatePct: 12,
        loanYears: 1,
        buildMonths: 12,
      }),
    );
    expect(r.construction).toBeCloseTo(630, 6);
    expect(r.total).toBeCloseTo(1100, 6);
    expect(r.loan).toBeCloseTo(600, 6);
    expect(r.surplus).toBe(0);
    expect(r.monthlyPayment).toBeCloseTo(annuity(600, 12, 1), 9);
    expect(r.constructionInterest).toBeCloseTo(36, 6);
    expect(r.year0).toBeCloseTo(-536, 6);
  });

  it("reports a surplus and no loan when own capital covers the cost", () => {
    const r = computeFinance(project({ areaOverride: 100, unitPrice: 5, surchargePct: 0, contingencyPct: 0, ownCapital: 800 }));
    expect(r.loan).toBe(0);
    expect(r.surplus).toBeCloseTo(300, 6);
    expect(r.ownUsed).toBeCloseTo(500, 6);
    expect(r.loanPayoff).toEqual({ year: 0, month: 0 });
  });

  it("grows rent, applies occupancy/tax/opex and finds the break-even year", () => {
    const r = computeFinance(
      project({
        areaOverride: 100,
        unitPrice: 6,
        surchargePct: 0,
        contingencyPct: 0,
        ownCapital: 600,
        income: [{ id: "i1", name: "Sàn", quantity: 2, unitPrice: 5 }],
        occupancyPct: 80,
        rentGrowthPct: 10,
        taxPct: 10,
        opexMonthly: 1,
        opexGrowthPct: 0,
      }),
    );
    const [y1, y2] = r.years;
    expect(y1.gross).toBeCloseTo(120, 6);
    expect(y1.collected).toBeCloseTo(96, 6);
    expect(y1.noi).toBeCloseTo(96 - 9.6 - 12, 6);
    expect(y2.gross).toBeCloseTo(132, 6);
    expect(r.years).toHaveLength(20);
    // No loan: cumulative = −600 + Σ NOI, so break-even and payback coincide.
    expect(r.breakEvenYear).not.toBeNull();
    expect(r.breakEvenYear).toBe(r.paybackYear);
    const be = r.breakEvenYear!;
    expect(r.years[be - 1].cumulative).toBeGreaterThanOrEqual(0);
    expect(r.years[be - 2].cumulative).toBeLessThan(0);
  });

  it("shifts income, occupancy and growth by scenario", () => {
    const base = { areaOverride: 0, income: [{ id: "i", name: "x", quantity: 1, unitPrice: 10 }], occupancyPct: 90, rentGrowthPct: 5 };
    const low = computeFinance(project({ ...base, scenario: "low" }));
    const high = computeFinance(project({ ...base, scenario: "high" }));
    expect(low.monthlyRevenue).toBeCloseTo(7, 6);
    expect(low.occupancy).toBeCloseTo(0.8, 6);
    expect(low.rentGrowth).toBeCloseTo(0.03, 6);
    expect(high.occupancy).toBeCloseTo(0.95, 6);
    expect(high.monthlyRevenue).toBeCloseTo(13, 6);
  });

  it("finds when the loan is cleared if all net income repays it", () => {
    const r = computeFinance(
      project({
        areaOverride: 100,
        unitPrice: 6,
        surchargePct: 0,
        contingencyPct: 0,
        ownCapital: 0,
        loanRatePct: 0,
        buildMonths: 0,
        income: [{ id: "i", name: "x", quantity: 1, unitPrice: 50 }],
        occupancyPct: 100,
        rentGrowthPct: 0,
      }),
    );
    // 600 owed, 50/month, no interest → cleared in month 12 of year 1.
    expect(r.loanPayoff).toEqual({ year: 1, month: 12 });
  });
});

describe("finance persistence", () => {
  it("fills default finance inputs for projects saved before the feature", () => {
    const old = JSON.parse(JSON.stringify(createProject("Cũ"))) as Record<string, unknown>;
    delete old.finance;
    const p = parseProject(old);
    expect(p.finance.unitPrice).toBeGreaterThan(0);
    expect(p.finance.scenario).toBe("base");
  });

  it("formats money", () => {
    expect(fmtTy(7190)).toBe("7,19 tỷ");
    expect(fmtTr(27.6)).toBe("27,6 tr");
  });
});
