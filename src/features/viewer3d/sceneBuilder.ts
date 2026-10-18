import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { ExtrudePolygon } from "@babylonjs/core/Meshes/Builders/polygonBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { PointerEventTypes } from "@babylonjs/core/Events/pointerEvents";
import "@babylonjs/core/Culling/ray";
import earcut from "earcut";
import type { Floor, Project, Stair, Vec2 } from "@/domain/types";
import { ROOM_TYPE_COLORS } from "@/domain/labels";
import { floorElevations } from "@/domain/stats";
import { roadCutGeometry } from "@/domain/roadCut";
import { furnitureSpec, furnitureToPlan } from "@/domain/furniture";
import { sceneColors } from "@/theme/tokens";
import { bbox, centroid, ensureClockwise, ensureCounterClockwise, pointInPolygon } from "@/geometry/polygon";
import { buildingOutlines } from "@/geometry/wallGraph";
import { connectedEndpoints } from "@/geometry/hitTest";
import { clampOpening, pointAlongWall, wallLength, wallPieces } from "@/geometry/openings";
import { generateStair } from "@/geometry/stairs";

export interface SceneInput {
  project: Project;
  activeFloorId: string | null;
  selectedIds: ReadonlySet<string>;
  hiddenFloorIds: readonly string[];
  explode: number;
  upToActive: boolean;
  roof: boolean;
  cutaway: boolean;
}

export interface PickTarget {
  floorId: string;
  id: string;
}

interface FloorEntry {
  floorRef: Floor;
  belowStairs: readonly Stair[] | null;
  selKey: string;
  roof: boolean;
  cut: boolean;
  node: TransformNode;
}

/** Plan (x, y) → world (x, 0, -y): y is "down" on the plan, world Z points away. */
const v3 = (p: Vec2, y = 0) => new Vector3(p.x, y, -p.y);

export class HouseScene {
  readonly engine: Engine;
  readonly scene: Scene;
  readonly camera: ArcRotateCamera;
  private shadow: ShadowGenerator;
  private mats = new Map<string, StandardMaterial>();
  private floors = new Map<string, FloorEntry>();
  private groundNode: TransformNode | null = null;
  /** Lot outline + road cut the ground was built for. */
  private lotKey: string | null = null;
  private lastInput: SceneInput | null = null;
  onPick: ((t: PickTarget | null) => void) | null = null;

  constructor(private canvas: HTMLCanvasElement) {
    this.engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true, antialias: true }, true);
    this.scene = new Scene(this.engine);
    this.scene.clearColor = Color4.FromHexString(`${sceneColors.sky}ff`);

    this.camera = new ArcRotateCamera("cam", -Math.PI / 2.6, Math.PI / 3.2, 40, Vector3.Zero(), this.scene);
    this.camera.lowerRadiusLimit = 2;
    this.camera.upperRadiusLimit = 500;
    this.camera.upperBetaLimit = Math.PI / 2 - 0.02;
    this.camera.wheelDeltaPercentage = 0.02;
    this.camera.panningSensibility = 60;
    this.camera.minZ = 0.1;
    this.camera.attachControl(canvas, true);

    const hemi = new HemisphericLight("hemi", new Vector3(0, 1, 0), this.scene);
    hemi.intensity = 0.65;
    hemi.groundColor = new Color3(0.55, 0.55, 0.6);
    const sun = new DirectionalLight("sun", new Vector3(-0.5, -1, 0.35), this.scene);
    sun.position = new Vector3(40, 80, -40);
    sun.intensity = 0.75;
    this.shadow = new ShadowGenerator(2048, sun);
    this.shadow.usePercentageCloserFiltering = true;
    this.shadow.bias = 0.0005;
    this.shadow.normalBias = 0.02;

    // The shadow map only needs re-rendering when geometry changes (see invalidate()).
    const shadowMap = this.shadow.getShadowMap();
    if (shadowMap) shadowMap.refreshRate = 0;

    // Camera inputs are only processed while rendering, so any interaction wakes the loop.
    canvas.addEventListener("keydown", this.onCanvasKey);
    this.scene.onPointerObservable.add((info) => {
      this.requestRender();
      if (info.type !== PointerEventTypes.POINTERTAP) return;
      const meta = info.pickInfo?.pickedMesh?.metadata as PickTarget | undefined;
      this.onPick?.(meta?.id ? meta : null);
    });

    // Render on demand: only when the camera moves or the scene changed.
    this.camera.onViewMatrixChangedObservable.add(() => this.requestRender());
    this.engine.runRenderLoop(() => {
      if (this.framesToRender <= 0 || !this.scene.activeCamera) return;
      this.framesToRender--;
      this.scene.render();
    });
  }

  private framesToRender = 2;
  private onCanvasKey = () => this.requestRender();

  /** Schedules a couple of frames (one extra lets inertia/shadows settle). */
  requestRender() {
    this.framesToRender = Math.max(this.framesToRender, 2);
  }

  private invalidate() {
    this.shadow.getShadowMap()?.resetRefreshCounter();
    this.requestRender();
  }

  private mat(key: string, hex: string, alpha = 1): StandardMaterial {
    const k = `${key}|${hex}|${alpha}`;
    let m = this.mats.get(k);
    if (!m) {
      m = new StandardMaterial(k, this.scene);
      m.diffuseColor = Color3.FromHexString(hex);
      m.specularColor = new Color3(0.08, 0.08, 0.08);
      m.alpha = alpha;
      // Single-sided geometry lit correctly from both sides, independent of winding.
      m.backFaceCulling = false;
      m.twoSidedLighting = true;
      this.mats.set(k, m);
    }
    return m;
  }

  private addMesh(mesh: Mesh, parent: TransformNode, opts: { cast?: boolean; receive?: boolean; pick?: PickTarget } = {}) {
    mesh.parent = parent;
    mesh.receiveShadows = opts.receive ?? true;
    if (opts.cast !== false) this.shadow.addShadowCaster(mesh, false);
    mesh.isPickable = !!opts.pick;
    if (opts.pick) mesh.metadata = opts.pick;
  }

  private disposeNode(node: TransformNode) {
    for (const m of node.getChildMeshes()) this.shadow.removeShadowCaster(m as AbstractMesh, false);
    node.dispose(false, false);
  }

  private extrude(name: string, poly: Vec2[], depth: number, holes: Vec2[][] = []): Mesh | null {
    if (poly.length < 3) return null;
    try {
      // Babylon extrudes downwards from y = 0; the cap faces up when the (x, z) outline
      // has positive signed area. Holes run the opposite way.
      const shape = ensureClockwise(poly.map((p) => ({ x: p.x, y: -p.y }))).map((p) => new Vector3(p.x, 0, p.y));
      const holeV = holes.map((h) => ensureCounterClockwise(h.map((p) => ({ x: p.x, y: -p.y }))).map((p) => new Vector3(p.x, 0, p.y)));
      return ExtrudePolygon(name, { shape, holes: holeV, depth }, this.scene, earcut);
    } catch (err) {
      console.warn("extrude failed", name, err);
      return null;
    }
  }

  private buildGround(project: Project) {
    const key = JSON.stringify([project.lot.polygon, project.constraints.roadCut]);
    if (this.lotKey === key && this.groundNode) return;
    if (this.groundNode) this.disposeNode(this.groundNode);
    this.lotKey = key;
    const cut = roadCutGeometry(project);
    const node = new TransformNode("ground", this.scene);
    const b = bbox(project.lot.polygon);
    const size = Math.max(60, (b.maxX - b.minX) * 4, (b.maxY - b.minY) * 4);
    const c = centroid(project.lot.polygon);
    const ground = CreateGround("groundPlane", { width: size, height: size }, this.scene);
    ground.position = v3(c, -0.03);
    ground.material = this.mat("ground", sceneColors.ground);
    this.addMesh(ground, node, { cast: false });
    const lot = this.extrude("lot", cut?.remaining ?? project.lot.polygon, 0.02);
    if (lot) {
      lot.position.y = -0.005;
      lot.material = this.mat("lot", sceneColors.lot);
      this.addMesh(lot, node, { cast: false });
    }
    const taken = cut && this.extrude("roadCut", cut.cut, 0.02);
    if (taken) {
      taken.position.y = -0.005;
      taken.material = this.mat("roadCut", sceneColors.roadCut);
      this.addMesh(taken, node, { cast: false });
    }
    this.groundNode = node;
  }

  private buildFloor(floor: Floor, below: Floor | null, selected: ReadonlySet<string>, roof: boolean, cut: boolean): TransformNode {
    const node = new TransformNode(`floor-${floor.id}`, this.scene);
    // Walls and openings hang off their own node so a cutaway can squash them to 1.2 m.
    const wallNode = new TransformNode(`walls-${floor.id}`, this.scene);
    wallNode.parent = node;
    if (cut) wallNode.scaling.y = Math.min(1, 1.2 / floor.height);
    const outlines = buildingOutlines(floor.walls);
    const voids = below ? below.stairs.map((s) => generateStair(s, below.height).footprint) : [];

    // Slab with stair openings from the floor below.
    outlines.forEach((o, i) => {
      const holes = voids.filter((v) => pointInPolygon(centroid(v), o));
      const slab = this.extrude(`slab-${floor.id}-${i}`, o, floor.slabThickness, holes);
      if (slab) {
        slab.material = this.mat("slab", sceneColors.slab);
        // Slabs sit millimetres under the room finishes: casting would cause shadow acne.
        this.addMesh(slab, node, { cast: false });
      }
      if (roof) {
        const r = this.extrude(`roof-${floor.id}-${i}`, o, 0.15);
        if (r) {
          r.position.y = floor.height;
          r.material = this.mat("roof", sceneColors.roof);
          this.addMesh(r, node);
        }
      }
    });

    // Floor finish per room.
    for (const room of floor.rooms) {
      const m = this.extrude(`room-${room.id}`, room.netPolygon ?? room.polygon, 0.01);
      if (!m) continue;
      m.position.y = 0.012;
      m.material = this.mat("room", ROOM_TYPE_COLORS[room.type]);
      this.addMesh(m, node, { cast: false, pick: { floorId: floor.id, id: room.id } });
    }

    // Walls, split around openings.
    const conn = connectedEndpoints(floor.walls);
    const wallMat = this.mat("wall", sceneColors.wall);
    const wallSel = this.mat("wallSel", sceneColors.wallSelected);
    for (const w of floor.walls) {
      const L = wallLength(w);
      if (L < 1e-3) continue;
      const dir = { x: (w.b.x - w.a.x) / L, y: (w.b.y - w.a.y) / L };
      const angle = Math.atan2(dir.y, dir.x);
      const c = conn.get(w.id) ?? { a: false, b: false };
      const ext = w.thickness / 2;
      wallPieces(w, floor.openings, floor.height).forEach((p, k) => {
        const start = p.start - (p.start <= 1e-6 && c.a ? ext : 0);
        const end = p.end + (p.end >= L - 1e-6 && c.b ? ext : 0);
        const len = end - start;
        const h = p.top - p.bottom;
        if (len < 1e-3 || h < 1e-3) return;
        const box = CreateBox(`w-${w.id}-${k}`, { width: len, height: h, depth: w.thickness }, this.scene);
        const mid = (start + end) / 2;
        box.position = v3({ x: w.a.x + dir.x * mid, y: w.a.y + dir.y * mid }, p.bottom + h / 2);
        box.rotation.y = angle;
        box.material = selected.has(w.id) ? wallSel : wallMat;
        this.addMesh(box, wallNode, { pick: { floorId: floor.id, id: w.id } });
      });
    }

    // Door leaves and glazing.
    const walls = new Map(floor.walls.map((w) => [w.id, w]));
    for (const raw of floor.openings) {
      const w = walls.get(raw.wallId);
      if (!w) continue;
      const o = clampOpening(raw, w);
      const L = wallLength(w);
      const angle = Math.atan2((w.b.y - w.a.y) / L, (w.b.x - w.a.x) / L);
      const c = pointAlongWall(w, o.offset);
      const isDoor = o.kind === "door";
      const h = Math.min(o.height, floor.height - o.sill);
      const panel = CreateBox(`o-${o.id}`, { width: Math.max(0.05, o.width - 0.04), height: Math.max(0.05, h - 0.02), depth: isDoor ? 0.04 : 0.02 }, this.scene);
      panel.position = v3(c, o.sill + h / 2);
      panel.rotation.y = angle;
      panel.material = selected.has(o.id) ? wallSel : isDoor ? this.mat("door", sceneColors.door) : this.mat("glass", sceneColors.glass, 0.4);
      this.addMesh(panel, wallNode, { cast: isDoor, pick: { floorId: floor.id, id: o.id } });
    }

    // Stairs rising from this floor.
    for (const s of floor.stairs) {
      const g = generateStair(s, floor.height);
      const mat = selected.has(s.id) ? wallSel : this.mat("stair", sceneColors.stair);
      g.steps.forEach((st, k) => {
        const th = s.type === "spiral" ? 0.05 : st.kind === "landing" ? 0.15 : Math.min(st.top, g.riserHeight + 0.12);
        const m = this.extrude(`st-${s.id}-${k}`, st.polygon, th);
        if (!m) return;
        m.position.y = st.top;
        m.material = mat;
        this.addMesh(m, node, { pick: { floorId: floor.id, id: s.id } });
      });
      if (s.type === "spiral") {
        const col = CreateCylinder(`col-${s.id}`, { diameter: Math.max(0.08, s.innerRadius * 2), height: floor.height }, this.scene);
        col.position = v3({ x: s.x, y: s.y }, floor.height / 2);
        col.material = mat;
        this.addMesh(col, node, { pick: { floorId: floor.id, id: s.id } });
      }
    }

    // Furniture: each catalog part becomes a box, cylinder or sphere.
    for (const f of floor.furniture) {
      const spec = furnitureSpec(f.kind);
      const angle = (f.rotation * Math.PI) / 180;
      spec.parts.forEach((p, k) => {
        const w = Math.max(0.01, (p.u1 - p.u0) * f.width);
        const d = Math.max(0.01, (p.v1 - p.v0) * f.depth);
        const h = Math.max(0.01, (p.z1 - p.z0) * f.height);
        const c = furnitureToPlan(f, ((p.u0 + p.u1) / 2 - 0.5) * f.width, ((p.v0 + p.v1) / 2 - 0.5) * f.depth);
        const name = `fu-${f.id}-${k}`;
        const mesh =
          p.shape === "cylinder"
            ? CreateCylinder(name, { diameter: 1, height: h, tessellation: 20 }, this.scene)
            : p.shape === "sphere"
              ? CreateSphere(name, { diameter: 1, segments: 12 }, this.scene)
              : CreateBox(name, { width: w, height: h, depth: d }, this.scene);
        if (p.shape === "cylinder") mesh.scaling.set(w, 1, d);
        if (p.shape === "sphere") mesh.scaling.set(w, h, d);
        mesh.position = v3(c, p.z0 * f.height + h / 2);
        mesh.rotation.y = angle;
        mesh.material = selected.has(f.id) ? wallSel : this.mat("fu", p.color ?? spec.color, p.opacity ?? 1);
        this.addMesh(mesh, node, { cast: (p.opacity ?? 1) === 1, pick: { floorId: floor.id, id: f.id } });
      });
    }

    for (const m of node.getChildMeshes()) m.freezeWorldMatrix();
    return node;
  }

  update(input: SceneInput) {
    this.lastInput = input;
    const { project } = input;
    this.buildGround(project);
    const elevations = floorElevations(project.floors);
    const activeIndex = Math.max(0, project.floors.findIndex((f) => f.id === input.activeFloorId));
    const topVisible = (() => {
      let top = -1;
      project.floors.forEach((f, i) => {
        if (!input.hiddenFloorIds.includes(f.id) && (!input.upToActive || i <= activeIndex)) top = i;
      });
      return top;
    })();

    const seen = new Set<string>();
    project.floors.forEach((f, i) => {
      seen.add(f.id);
      const below = i > 0 ? project.floors[i - 1] : null;
      const selKey = [...input.selectedIds].filter((id) => f.walls.some((w) => w.id === id) || f.openings.some((o) => o.id === id) || f.stairs.some((s) => s.id === id) || f.furniture.some((x) => x.id === id)).sort().join(",");
      const roof = input.roof && !input.cutaway && i === topVisible;
      const cut = input.cutaway && i === topVisible;
      let entry = this.floors.get(f.id);
      if (!entry || entry.floorRef !== f || entry.belowStairs !== (below?.stairs ?? null) || entry.selKey !== selKey || entry.roof !== roof || entry.cut !== cut) {
        if (entry) this.disposeNode(entry.node);
        entry = { floorRef: f, belowStairs: below?.stairs ?? null, selKey, roof, cut, node: this.buildFloor(f, below, input.selectedIds, roof, cut) };
        this.floors.set(f.id, entry);
      }
      entry.node.position.y = elevations[i] + i * input.explode;
      for (const m of entry.node.getChildMeshes()) {
        m.unfreezeWorldMatrix();
        m.computeWorldMatrix(true);
        m.freezeWorldMatrix();
      }
      entry.node.setEnabled(!input.hiddenFloorIds.includes(f.id) && (!input.upToActive || i <= activeIndex));
    });
    for (const [id, entry] of this.floors) {
      if (!seen.has(id)) {
        this.disposeNode(entry.node);
        this.floors.delete(id);
      }
    }
    this.invalidate();
  }

  /** Frames the whole lot and building. */
  fit() {
    const p = this.lastInput?.project;
    if (!p) return;
    const pts: Vec2[] = [...p.lot.polygon];
    for (const f of p.floors) for (const w of f.walls) pts.push(w.a, w.b);
    const b = bbox(pts);
    const height = p.floors.reduce((s, f) => s + f.height, 0);
    const span = Math.max(b.maxX - b.minX, b.maxY - b.minY, height, 5);
    this.camera.setTarget(v3({ x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 }, height / 3));
    this.camera.radius = span * 1.9;
    this.camera.alpha = -Math.PI / 2.6;
    this.camera.beta = Math.PI / 4;
    this.requestRender();
  }

  topView() {
    this.fit();
    this.camera.beta = 0.01;
    this.camera.alpha = -Math.PI / 2;
    this.requestRender();
  }

  async screenshot(): Promise<string> {
    this.scene.render();
    return this.canvas.toDataURL("image/png");
  }

  resize() {
    this.engine.resize();
    this.requestRender();
  }

  dispose() {
    this.canvas.removeEventListener("keydown", this.onCanvasKey);
    this.engine.stopRenderLoop();
    this.scene.dispose();
    this.engine.dispose();
  }
}
