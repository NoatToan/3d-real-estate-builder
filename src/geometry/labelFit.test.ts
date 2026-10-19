import { describe, expect, it } from "vitest";
import { fitLabel, labelRoom, MIN_LABEL_PX, textWidthPx } from "./labelFit";

const sq = (s: number) => [
  { x: 0, y: 0 },
  { x: s, y: 0 },
  { x: s, y: s },
  { x: 0, y: s },
];

describe("fitLabel", () => {
  it("keeps the preferred size when there is room", () => {
    expect(fitLabel([{ text: "Phòng ngủ", size: 12 }], 500, 500)).toBe(1);
  });

  it("shrinks to the available width", () => {
    const w = textWidthPx("3.20 m", 10);
    expect(fitLabel([{ text: "3.20 m", size: 10 }], w * 0.9)).toBeCloseTo(0.9);
  });

  it("shrinks to the height of stacked lines", () => {
    // 12 + 10 px at 1.2 line height = 26.4 px
    expect(fitLabel([{ text: "A", size: 12 }, { text: "B", size: 10 }], 1000, 26.4 * 0.9)).toBeCloseTo(0.9);
  });

  it("hides the label when it would be unreadable", () => {
    const w = textWidthPx("Phòng khách", 10);
    expect(fitLabel([{ text: "Phòng khách", size: 10 }], (w * (MIN_LABEL_PX - 1)) / 10)).toBe(0);
    expect(fitLabel([{ text: "x", size: 10 }], 0)).toBe(0);
    expect(fitLabel([], 100)).toBe(0);
  });

  it("checks the smallest line against the minimum", () => {
    // k = 0.75 → 12 px line reads at 9 px, 8 px line at 6 px (too small)
    const lines = [{ text: "AAAA", size: 12 }, { text: "B", size: 8 }];
    expect(fitLabel(lines, textWidthPx("AAAA", 12) * 0.75)).toBe(0);
  });
});

describe("labelRoom", () => {
  it("measures room around the centre of a square", () => {
    expect(labelRoom(sq(4), { x: 2, y: 2 })).toEqual({ width: 4, height: 4 });
  });

  it("is limited by the nearer side when off-centre", () => {
    const r = labelRoom(sq(4), { x: 1, y: 3 });
    expect(r.width).toBeCloseTo(2);
    expect(r.height).toBeCloseTo(2);
  });

  it("uses the local span of an L-shaped room", () => {
    const L = [
      { x: 0, y: 0 },
      { x: 6, y: 0 },
      { x: 6, y: 2 },
      { x: 2, y: 2 },
      { x: 2, y: 6 },
      { x: 0, y: 6 },
    ];
    const r = labelRoom(L, { x: 1, y: 4 });
    expect(r.width).toBeCloseTo(2);
    expect(r.height).toBeCloseTo(4);
  });

  it("returns zero for points outside or degenerate polygons", () => {
    expect(labelRoom(sq(4), { x: 10, y: 2 })).toEqual({ width: 0, height: 0 });
    expect(labelRoom([{ x: 0, y: 0 }], { x: 0, y: 0 })).toEqual({ width: 0, height: 0 });
  });
});
