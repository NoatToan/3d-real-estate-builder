import { describe, expect, it } from "vitest";
import { autoAssignNumbers, bboxCenter, extractNumbers, normalizeNumericToken, parseCertifiedArea, parseParcelInfo, parseVnNumber, type OcrNumber, type OcrWord } from "./parse";

describe("autoAssignNumbers", () => {
  const num = (id: string, x: number, y: number, value = 1): OcrNumber => ({ id, value, text: String(value), confidence: 90, bbox: { x0: x - 5, y0: y - 3, x1: x + 5, y1: y + 3 } });
  it("assigns labels sitting next to the middle of each edge", () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 400 },
      { x: 0, y: 400 },
    ];
    const res = autoAssignNumbers(pts, [num("top", 50, -10), num("right", 112, 200), num("far", 500, 500), num("bottom", 50, 412)]);
    expect(res).toEqual(["top", "right", "bottom", null]);
    expect(autoAssignNumbers(pts.slice(0, 1), [])).toEqual([null]);
  });
  it("parses Vietnamese numbers", () => {
    expect(parseVnNumber("1.250,5")).toBe(1250.5);
    expect(parseVnNumber("1.250")).toBe(1250);
    expect(parseVnNumber("85,5")).toBe(85.5);
  });
});

const word = (text: string, confidence = 90): OcrWord => ({ text, confidence, bbox: { x0: 0, y0: 0, x1: 10, y1: 4 } });

describe("ocr parse", () => {
  it("normalizes letter/digit confusions in numeric tokens only", () => {
    expect(normalizeNumericToken("5.O0")).toBe("5.00");
    expect(normalizeNumericToken("l2,5m")).toBe("12,5");
    expect(normalizeNumericToken("Lối")).toBe("Lối");
  });

  it("extracts plausible lengths", () => {
    const nums = extractNumbers([word("5.00"), word("20,15"), word("2019"), word("123"), word("45"), word("0.1"), word("abc")]);
    expect(nums.map((n) => n.value)).toEqual([5, 20.15, 45]);
  });

  it("parses certified area and parcel info", () => {
    expect(parseCertifiedArea("Diện tích: 85,5 m2 (Bằng chữ...)")).toBe(85.5);
    expect(parseCertifiedArea("Dien tich 102.30m²")).toBe(102.3);
    expect(parseCertifiedArea("1.250,5 m2")).toBe(1250.5);
    expect(parseCertifiedArea("không có")).toBeNull();
    expect(parseParcelInfo("Thửa đất số: 123, tờ bản đồ số: 45")).toEqual({ parcelNo: "123", mapSheetNo: "45" });
    expect(parseParcelInfo("")).toEqual({ parcelNo: "", mapSheetNo: "" });
    expect(bboxCenter({ x0: 0, y0: 0, x1: 10, y1: 4 })).toEqual({ x: 5, y: 2 });
  });
});
