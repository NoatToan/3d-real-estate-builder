import { describe, expect, it } from "vitest";
import { placeCard } from "./placeCard";

const view = { width: 1440, height: 900 };

describe("placeCard", () => {
  it("goes to the right of a target on the left edge", () => {
    expect(placeCard({ left: 0, top: 100, right: 76, bottom: 200 }, view)).toEqual({ left: 88, top: 100 });
  });

  it("goes below a target near the right edge, kept inside the window", () => {
    const p = placeCard({ left: 1300, top: 10, right: 1430, bottom: 40 }, view);
    expect(p.top).toBe(52);
    expect(p.left + 320).toBeLessThanOrEqual(1440 - 8);
  });

  it("goes above a target at the bottom right of a phone screen", () => {
    const p = placeCard({ left: 0, top: 780, right: 390, bottom: 844 }, { width: 390, height: 844 });
    expect(p.top).toBeLessThan(780);
    expect(p.left).toBe(8);
  });
});
