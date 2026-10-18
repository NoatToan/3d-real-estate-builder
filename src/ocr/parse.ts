export interface Bbox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface OcrWord {
  text: string;
  confidence: number;
  bbox: Bbox;
}

export interface OcrNumber {
  id: string;
  value: number;
  text: string;
  confidence: number;
  bbox: Bbox;
}

/** Common OCR confusions inside numeric tokens. */
const CONFUSIONS: Record<string, string> = { O: "0", o: "0", D: "0", l: "1", I: "1", "|": "1", S: "5", B: "8", Z: "2" };

/** Fixes letter/digit confusions only when the token is mostly digits. */
export function normalizeNumericToken(raw: string): string {
  const token = raw.trim().replace(/m²|m2|m$/i, "");
  const digits = (token.match(/\d/g) ?? []).length;
  if (digits === 0 || digits < token.replace(/[.,]/g, "").length / 2) return token;
  return token
    .split("")
    .map((ch) => CONFUSIONS[ch] ?? ch)
    .join("");
}

const NUMBER_RE = /\d{1,4}(?:[.,]\d{1,3})?/g;

/**
 * Extracts plausible boundary lengths (metres) from OCR words.
 * Decimals are preferred; bare integers are accepted only below 100 to avoid parcel /
 * sheet numbers and years.
 */
export function extractNumbers(words: readonly OcrWord[], { min = 0.3, max = 500 } = {}): OcrNumber[] {
  const out: OcrNumber[] = [];
  words.forEach((w, wi) => {
    const token = normalizeNumericToken(w.text);
    const matches = token.match(NUMBER_RE) ?? [];
    matches.forEach((m, mi) => {
      const hasDecimal = /[.,]/.test(m);
      const value = Number(m.replace(",", "."));
      if (!Number.isFinite(value) || value < min || value > max) return;
      if (!hasDecimal && value >= 100) return;
      out.push({ id: `n${wi}_${mi}`, value, text: m, confidence: w.confidence, bbox: w.bbox });
    });
  });
  return out;
}

const AREA_NUM = String.raw`(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)`;
const AREA_RES = [
  new RegExp(String.raw`di[eệêẹ]n\s*t[ií]ch[^\d]{0,30}?${AREA_NUM}\s*(?:m²|m2|m\b)`, "i"),
  new RegExp(String.raw`${AREA_NUM}\s*(?:m²|m2)`, "i"),
];

/** Parses Vietnamese-formatted numbers ("1.250,5" or "85,5" or "85.5"). */
export function parseVnNumber(s: string): number {
  const t = s.includes(",") && s.includes(".") ? s.replace(/\./g, "").replace(",", ".") : /^\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, "") : s.replace(",", ".");
  return Number(t);
}

/** Finds the certified area ("Diện tích: 85,5 m²") in the OCR text. */
export function parseCertifiedArea(text: string): number | null {
  for (const re of AREA_RES) {
    const m = re.exec(text);
    if (m) {
      const v = parseVnNumber(m[1]);
      if (Number.isFinite(v) && v > 1 && v < 1e6) return v;
    }
  }
  return null;
}

/** Extracts parcel and map sheet numbers ("Thửa đất số: 123, tờ bản đồ số: 45"). */
export function parseParcelInfo(text: string): { parcelNo: string; mapSheetNo: string } {
  const parcel = /th[uửư]a\s*(?:đ[aấ]t\s*)?s[oố]\s*[:.]?\s*(\d+[a-z]?)/i.exec(text);
  const sheet = /t[oờ]\s*b[aả]n\s*đ[oồ]\s*s[oố]\s*[:.]?\s*(\d+[a-z]?)/i.exec(text);
  return { parcelNo: parcel?.[1] ?? "", mapSheetNo: sheet?.[1] ?? "" };
}

export const bboxCenter = (b: Bbox) => ({ x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 });

interface P {
  x: number;
  y: number;
}

function distToSegment(p: P, a: P, b: P): { d: number; t: number } {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const l2 = abx * abx + aby * aby;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / l2));
  return { d: Math.hypot(p.x - (a.x + abx * t), p.y - (a.y + aby * t)), t };
}

/**
 * Matches OCR numbers to traced edges: a label is a candidate for an edge when it sits
 * close to the edge's middle part. Greedy unique assignment by distance.
 * Returns, per edge, the id of the assigned number (or null).
 */
export function autoAssignNumbers(points: readonly P[], numbers: readonly OcrNumber[], minRadius = 40): (string | null)[] {
  const n = points.length;
  const out: (string | null)[] = Array.from({ length: n }, () => null);
  if (n < 2) return out;
  const pairs: { e: number; id: string; d: number }[] = [];
  for (let e = 0; e < n; e++) {
    const a = points[e];
    const b = points[(e + 1) % n];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const radius = Math.max(minRadius, len * 0.2);
    for (const num of numbers) {
      const { d, t } = distToSegment(bboxCenter(num.bbox), a, b);
      if (d <= radius && t > 0.1 && t < 0.9) pairs.push({ e, id: num.id, d });
    }
  }
  pairs.sort((p, q) => p.d - q.d);
  const used = new Set<string>();
  for (const p of pairs) {
    if (out[p.e] || used.has(p.id)) continue;
    out[p.e] = p.id;
    used.add(p.id);
  }
  return out;
}
