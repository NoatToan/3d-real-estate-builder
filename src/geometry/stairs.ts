import type { Stair, Vec2 } from "@/domain/types";
import { circlePolygon } from "./polygon";
import { rotate } from "./vec";

export interface StepGeom {
  /** Plan polygon in world coordinates. */
  polygon: Vec2[];
  /** Height of the walking surface above the floor. */
  top: number;
  kind: "step" | "landing";
}

export interface StairGeometry {
  steps: StepGeom[];
  /** Outline used to cut the slab of the floor above. */
  footprint: Vec2[];
  /** Walking line from bottom to top (for the 2D arrow). */
  walkline: Vec2[];
  riserHeight: number;
  /** Tread depth measured on the walking line. */
  going: number;
  warnings: string[];
}

type Local = { u: number; v: number };

function rect(u0: number, u1: number, v0: number, v1: number): Local[] {
  return [
    { u: u0, v: v0 },
    { u: u1, v: v0 },
    { u: u1, v: v1 },
    { u: u0, v: v1 },
  ];
}

/**
 * Local frame: u = direction of travel of the first flight, v = across the flight.
 * Right-turning stairs turn towards +v; left-turning stairs are mirrored across the
 * first flight's centre line.
 */
function toWorld(s: Stair, pts: Local[], mirror: boolean, keepOrder = false): Vec2[] {
  const out = pts.map((p) => {
    const v = mirror ? s.width - p.v : p.v;
    return rotate({ x: s.x + p.u, y: s.y + v }, s.rotation, { x: s.x, y: s.y });
  });
  // Mirroring flips polygon winding; restore it unless the order is meaningful (paths).
  return mirror && !keepOrder ? out.reverse() : out;
}

/** Splits the risers between two flights; the landing takes one riser. */
export function splitFlights(riserCount: number): { first: number; second: number } {
  const remaining = Math.max(2, riserCount - 1);
  const first = Math.ceil(remaining / 2);
  return { first, second: remaining - first };
}

/** Generates the step/landing geometry of a stair rising by `rise` metres. */
export function generateStair(s: Stair, rise: number): StairGeometry {
  const n = Math.max(2, Math.round(s.riserCount));
  if (s.type === "spiral") return generateSpiral(s, rise, n);

  const R = rise / n;
  const G = s.treadDepth;
  const W = s.width;
  const mirror = s.type !== "straight" && s.turn === "left";
  const steps: StepGeom[] = [];
  let footprint: Local[];
  let walk: Local[];

  if (s.type === "straight") {
    for (let i = 0; i < n; i++) {
      steps.push({ polygon: toWorld(s, rect(i * G, (i + 1) * G, 0, W), false), top: (i + 1) * R, kind: "step" });
    }
    footprint = rect(0, n * G, 0, W);
    walk = [
      { u: 0, v: W / 2 },
      { u: n * G, v: W / 2 },
    ];
  } else if (s.type === "L") {
    const { first, second } = splitFlights(n);
    const L = s.landingDepth > 0 ? s.landingDepth : W;
    for (let i = 0; i < first; i++) {
      steps.push({ polygon: toWorld(s, rect(i * G, (i + 1) * G, 0, W), mirror), top: (i + 1) * R, kind: "step" });
    }
    const u0 = first * G;
    steps.push({ polygon: toWorld(s, rect(u0, u0 + W, 0, L), mirror), top: (first + 1) * R, kind: "landing" });
    for (let j = 0; j < second; j++) {
      steps.push({
        polygon: toWorld(s, rect(u0, u0 + W, L + j * G, L + (j + 1) * G), mirror),
        top: (first + 2 + j) * R,
        kind: "step",
      });
    }
    const vEnd = L + second * G;
    footprint = [
      { u: 0, v: 0 },
      { u: u0 + W, v: 0 },
      { u: u0 + W, v: vEnd },
      { u: u0, v: vEnd },
      { u: u0, v: W },
      { u: 0, v: W },
    ];
    walk = [
      { u: 0, v: W / 2 },
      { u: u0 + W / 2, v: W / 2 },
      { u: u0 + W / 2, v: vEnd },
    ];
  } else {
    // U-shaped: the second flight runs back parallel to the first.
    const { first, second } = splitFlights(n);
    const L = s.landingDepth > 0 ? s.landingDepth : W;
    const gap = Math.max(0, s.gap);
    const total = 2 * W + gap;
    for (let i = 0; i < first; i++) {
      steps.push({ polygon: toWorld(s, rect(i * G, (i + 1) * G, 0, W), mirror), top: (i + 1) * R, kind: "step" });
    }
    const u0 = first * G;
    steps.push({ polygon: toWorld(s, rect(u0, u0 + L, 0, total), mirror), top: (first + 1) * R, kind: "landing" });
    for (let j = 0; j < second; j++) {
      steps.push({
        polygon: toWorld(s, rect(u0 - (j + 1) * G, u0 - j * G, W + gap, total), mirror),
        top: (first + 2 + j) * R,
        kind: "step",
      });
    }
    const uMin = Math.min(0, u0 - second * G);
    footprint = rect(uMin, u0 + L, 0, total);
    walk = [
      { u: 0, v: W / 2 },
      { u: u0 + L / 2, v: W / 2 },
      { u: u0 + L / 2, v: W + gap + W / 2 },
      { u: u0 - second * G, v: W + gap + W / 2 },
    ];
  }

  return {
    steps,
    footprint: toWorld(s, footprint, mirror),
    walkline: toWorld(s, walk, mirror, true),
    riserHeight: R,
    going: G,
    warnings: stairWarnings(s, R, G),
  };
}

function arc(cx: number, cy: number, r: number, a0: number, a1: number, segments: number): Vec2[] {
  const pts: Vec2[] = [];
  for (let k = 0; k <= segments; k++) {
    const a = a0 + ((a1 - a0) * k) / segments;
    pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return pts;
}

/** Spiral stair centred on (x, y); the first step starts at `rotation` degrees. */
function generateSpiral(s: Stair, rise: number, n: number): StairGeometry {
  const R = rise / n;
  const ri = Math.max(0.05, s.innerRadius);
  const ro = ri + s.width;
  const dir = s.turn === "left" ? -1 : 1;
  const sweep = (Math.max(90, Math.min(720, s.sweep)) * Math.PI) / 180;
  const step = sweep / n;
  const a0 = (s.rotation * Math.PI) / 180;
  const steps: StepGeom[] = [];
  for (let i = 0; i < n; i++) {
    const s0 = a0 + dir * i * step;
    const s1 = a0 + dir * (i + 1) * step;
    const outer = arc(s.x, s.y, ro, s0, s1, 4);
    const inner = arc(s.x, s.y, ri, s1, s0, 2);
    const poly = [...outer, ...inner];
    steps.push({ polygon: dir < 0 ? poly.reverse() : poly, top: (i + 1) * R, kind: "step" });
  }
  const rWalk = ri + s.width / 2;
  const going = rWalk * step;
  return {
    steps,
    footprint: circlePolygon({ x: s.x, y: s.y }, ro + 0.05, 40),
    walkline: arc(s.x, s.y, rWalk, a0, a0 + dir * sweep, Math.max(8, n * 2)),
    riserHeight: R,
    going,
    warnings: stairWarnings(s, R, going),
  };
}

/** Comfort / code checks (TCVN 4451 and common practice). */
export function stairWarnings(s: Stair, R: number, G: number): string[] {
  const w: string[] = [];
  if (R > 0.19) w.push(`Chiều cao bậc ${(R * 100).toFixed(1)} cm > 19 cm — nên tăng số bậc.`);
  if (R < 0.14) w.push(`Chiều cao bậc ${(R * 100).toFixed(1)} cm < 14 cm — nên giảm số bậc.`);
  if (G < 0.24) w.push(`Mặt bậc ${(G * 100).toFixed(0)} cm < 24 cm — bậc hẹp, khó đi.`);
  const blondel = 2 * R + G;
  if (blondel < 0.58 || blondel > 0.66) w.push(`2R + G = ${(blondel * 100).toFixed(0)} cm (nên trong khoảng 58–66 cm).`);
  if (s.width < 0.75) w.push(`Bề rộng vế ${(s.width * 100).toFixed(0)} cm < 75 cm.`);
  return w;
}
