import type { Vec2 } from "@/domain/types";
import { isSimplePolygon, signedArea } from "./polygon";
import { add, normalize, perp, scale, sub } from "./vec";
import { lineIntersection } from "./segment";

/**
 * Moves every edge of a simple polygon inwards by its own distance and returns the
 * polygon formed by the shifted edge lines. Negative distances move edges outwards.
 * Returns null when the result degenerates (setback too large, self-intersection).
 */
export function insetPolygon(poly: readonly Vec2[], distances: readonly number[] | number): Vec2[] | null {
  const n = poly.length;
  if (n < 3) return null;
  const d = (i: number) => (typeof distances === "number" ? distances : (distances[i] ?? 0));
  const orientation = Math.sign(signedArea(poly));
  if (orientation === 0) return null;

  const lines = poly.map((a, i) => {
    const b = poly[(i + 1) % n];
    const dir = normalize(sub(b, a));
    // For positive signed area the interior lies on the +perp side.
    const inward = scale(perp(dir), orientation);
    return { p: add(a, scale(inward, d(i))), dir };
  });

  const out: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const prev = lines[(i - 1 + n) % n];
    const cur = lines[i];
    const hit = lineIntersection(prev.p, prev.dir, cur.p, cur.dir);
    if (hit) {
      out.push(hit);
    } else {
      // Collinear neighbouring edges: keep the vertex shifted along the current edge normal.
      const inward = scale(perp(cur.dir), orientation);
      out.push(add(poly[i], scale(inward, d(i))));
    }
  }

  const resultArea = signedArea(out);
  if (Math.sign(resultArea) !== orientation || Math.abs(resultArea) < 1e-9) return null;
  // An over-sized inset can turn the polygon inside out (edges reverse direction).
  for (let i = 0; i < n; i++) {
    const e = sub(out[(i + 1) % n], out[i]);
    if (e.x * lines[i].dir.x + e.y * lines[i].dir.y < -1e-9) return null;
  }
  if (!isSimplePolygon(out)) return null;
  return out;
}
