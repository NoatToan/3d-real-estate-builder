import type { Id, Vec2, Wall } from "@/domain/types";
import { area, centroid, pointInPolygon, signedArea, simplifyPolygon } from "./polygon";
import { projectOnSegment, segmentIntersection } from "./segment";
import { dist, lerp } from "./vec";
import { insetPolygon } from "./offset";

export interface GraphEdge {
  u: number;
  v: number;
  wallId: Id;
  thickness: number;
}

export interface WallGraph {
  nodes: Vec2[];
  edges: GraphEdge[];
}

/** Tolerance (m) for merging nodes and detecting T-junctions. */
export const GRAPH_EPS = 0.01;

/**
 * Builds a planar graph from wall centre lines: walls are split at every crossing and
 * T-junction, nearby endpoints are merged and duplicated (overlapping) edges removed.
 */
export function buildWallGraph(walls: readonly Wall[], eps = GRAPH_EPS): WallGraph {
  const segs = walls.filter((w) => dist(w.a, w.b) > eps);
  const splits: number[][] = segs.map(() => [0, 1]);

  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    const len = dist(s.a, s.b);
    for (let j = 0; j < segs.length; j++) {
      if (i === j) continue;
      const o = segs[j];
      // Endpoints of the other wall lying on this wall (T-junctions, overlaps).
      for (const p of [o.a, o.b]) {
        const pr = projectOnSegment(p, s.a, s.b);
        if (pr.distance <= eps && pr.t * len > eps && (1 - pr.t) * len > eps) splits[i].push(pr.t);
      }
      if (j > i) {
        const hit = segmentIntersection(s.a, s.b, o.a, o.b);
        if (hit) {
          splits[i].push(hit.t);
          splits[j].push(hit.u);
        }
      }
    }
  }

  const nodes: Vec2[] = [];
  const nodeIndex = (p: Vec2): number => {
    for (let k = 0; k < nodes.length; k++) if (dist(nodes[k], p) <= eps) return k;
    nodes.push({ x: p.x, y: p.y });
    return nodes.length - 1;
  };

  const edges: GraphEdge[] = [];
  const seen = new Set<string>();
  segs.forEach((s, i) => {
    const ts = [...new Set(splits[i].map((t) => Math.round(t * 1e9) / 1e9))].sort((a, b) => a - b);
    for (let k = 0; k < ts.length - 1; k++) {
      const u = nodeIndex(lerp(s.a, s.b, ts[k]));
      const v = nodeIndex(lerp(s.a, s.b, ts[k + 1]));
      if (u === v) continue;
      const key = u < v ? `${u}:${v}` : `${v}:${u}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ u, v, wallId: s.id, thickness: s.thickness });
    }
  });

  return { nodes, edges };
}

/** Removes dangling edges (filaments) that cannot bound a face. */
export function pruneFilaments(graph: WallGraph): WallGraph {
  let edges = graph.edges;
  let changed = true;
  while (changed) {
    changed = false;
    const degree = new Map<number, number>();
    for (const e of edges) {
      degree.set(e.u, (degree.get(e.u) ?? 0) + 1);
      degree.set(e.v, (degree.get(e.v) ?? 0) + 1);
    }
    const kept = edges.filter((e) => (degree.get(e.u) ?? 0) > 1 && (degree.get(e.v) ?? 0) > 1);
    if (kept.length !== edges.length) {
      edges = kept;
      changed = true;
    }
  }
  return { nodes: graph.nodes, edges };
}

export interface Face {
  /** Centre-line polygon. */
  polygon: Vec2[];
  /** Graph edges along the polygon, edgeRefs[i] spans polygon[i] -> polygon[i+1]. */
  edgeRefs: GraphEdge[];
  signedArea: number;
}

/**
 * Enumerates all faces of the planar graph. Bounded faces have positive signed area,
 * the outer boundary of every connected component has negative signed area.
 */
export function enumerateFaces(graph: WallGraph): Face[] {
  const { nodes, edges } = graph;
  const out = new Map<number, { to: number; angle: number; edge: GraphEdge }[]>();
  for (const e of edges) {
    const a = nodes[e.u];
    const b = nodes[e.v];
    if (!out.has(e.u)) out.set(e.u, []);
    if (!out.has(e.v)) out.set(e.v, []);
    out.get(e.u)!.push({ to: e.v, angle: Math.atan2(b.y - a.y, b.x - a.x), edge: e });
    out.get(e.v)!.push({ to: e.u, angle: Math.atan2(a.y - b.y, a.x - b.x), edge: e });
  }
  for (const list of out.values()) list.sort((p, q) => p.angle - q.angle);

  const visited = new Set<string>();
  const faces: Face[] = [];
  for (const e of edges) {
    for (const [start, next] of [
      [e.u, e.v],
      [e.v, e.u],
    ]) {
      if (visited.has(`${start}>${next}`)) continue;
      const poly: Vec2[] = [];
      const refs: GraphEdge[] = [];
      let from = start;
      let to = next;
      let guard = 0;
      let ok = true;
      while (!visited.has(`${from}>${to}`)) {
        visited.add(`${from}>${to}`);
        poly.push(nodes[from]);
        const list = out.get(to)!;
        const k = list.findIndex((h) => h.to === from);
        refs.push(list[k].edge);
        const h = list[(k - 1 + list.length) % list.length];
        from = to;
        to = h.to;
        if (++guard > edges.length * 2 + 2) {
          ok = false;
          break;
        }
      }
      if (ok && poly.length >= 3) faces.push({ polygon: poly, edgeRefs: refs, signedArea: signedArea(poly) });
    }
  }
  return faces;
}

export interface DetectedRoom {
  polygon: Vec2[];
  /** Net (inside-the-walls) polygon, null if walls are thicker than the room. */
  netPolygon: Vec2[] | null;
  area: number;
  netArea: number;
}

/** Minimum enclosed area (m²) for a closed wall loop to count as a room. */
export const MIN_ROOM_AREA = 0.3;

/** Detects rooms as the bounded faces formed by the walls. */
export function detectRooms(walls: readonly Wall[], minArea = MIN_ROOM_AREA): DetectedRoom[] {
  const graph = pruneFilaments(buildWallGraph(walls));
  return enumerateFaces(graph)
    .filter((f) => f.signedArea > minArea)
    .map((f) => {
      const net = insetPolygon(
        f.polygon,
        f.edgeRefs.map((e) => e.thickness / 2),
      );
      return {
        polygon: simplifyPolygon(f.polygon),
        netPolygon: net ? simplifyPolygon(net) : null,
        area: area(f.polygon),
        netArea: net ? area(net) : 0,
      };
    });
}

/** Outer outlines (outside face of exterior walls) of every closed wall component. */
export function buildingOutlines(walls: readonly Wall[]): Vec2[][] {
  const graph = pruneFilaments(buildWallGraph(walls));
  const faces = enumerateFaces(graph).filter((f) => f.signedArea < -MIN_ROOM_AREA);
  const outlines: Vec2[][] = [];
  for (const f of faces) {
    // Outer faces run with negative area; outsetting = insetting by negative distances.
    const outer = insetPolygon(
      f.polygon,
      f.edgeRefs.map((e) => -e.thickness / 2),
    );
    outlines.push(simplifyPolygon(outer ?? f.polygon));
  }
  // Drop outlines nested inside another outline.
  return outlines.filter(
    (o, i) => !outlines.some((other, j) => j !== i && area(other) > area(o) && pointInPolygon(centroid(o), other)),
  );
}
