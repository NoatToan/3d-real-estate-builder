import type { Vec2 } from "@/domain/types";

export const EPS = 1e-9;

export const v = (x: number, y: number): Vec2 => ({ x, y });
export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, y: a.y * s });
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;
export const cross = (a: Vec2, b: Vec2): number => a.x * b.y - a.y * b.x;
export const len = (a: Vec2): number => Math.hypot(a.x, a.y);
export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);
export const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});
export const mid = (a: Vec2, b: Vec2): Vec2 => lerp(a, b, 0.5);

export function normalize(a: Vec2): Vec2 {
  const l = len(a);
  return l < EPS ? { x: 0, y: 0 } : { x: a.x / l, y: a.y / l };
}

/** Perpendicular vector (rotated +90°). */
export const perp = (a: Vec2): Vec2 => ({ x: -a.y, y: a.x });

export function rotate(p: Vec2, deg: number, origin: Vec2 = { x: 0, y: 0 }): Vec2 {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  const dx = p.x - origin.x;
  const dy = p.y - origin.y;
  return { x: origin.x + dx * c - dy * s, y: origin.y + dx * s + dy * c };
}

export const angleOf = (a: Vec2): number => Math.atan2(a.y, a.x);

export const nearlyEqual = (a: number, b: number, eps = 1e-6): boolean => Math.abs(a - b) <= eps;

export const samePoint = (a: Vec2, b: Vec2, eps = 1e-6): boolean => dist(a, b) <= eps;

export const round = (n: number, step: number): number => Math.round(n / step) * step;

export const roundTo = (n: number, decimals = 3): number => {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
};

export const clamp = (n: number, min: number, max: number): number => Math.min(max, Math.max(min, n));
