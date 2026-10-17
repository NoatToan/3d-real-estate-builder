import { createStore, del, get, set, type UseStore } from "idb-keyval";
import type { Project, ProjectMeta } from "@/domain/types";
import { projectMeta, newId } from "@/domain/factory";
import { parseProject } from "@/domain/schema";

/**
 * Local persistence in IndexedDB. Falls back to an in-memory map when IndexedDB is
 * unavailable (private browsing, blocked storage) so the app keeps working.
 */

interface KV {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  del(key: string): Promise<void>;
}

class MemoryKV implements KV {
  private map = new Map<string, unknown>();
  async get<T>(key: string) {
    return this.map.get(key) as T | undefined;
  }
  async set(key: string, value: unknown) {
    this.map.set(key, value);
  }
  async del(key: string) {
    this.map.delete(key);
  }
}

class IdbKV implements KV {
  constructor(private store: UseStore) {}
  get<T>(key: string) {
    return get<T>(key, this.store);
  }
  set(key: string, value: unknown) {
    return set(key, value, this.store);
  }
  del(key: string) {
    return del(key, this.store);
  }
}

let kvPromise: Promise<{ kv: KV; persistent: boolean }> | null = null;

async function openKV(): Promise<{ kv: KV; persistent: boolean }> {
  if (typeof indexedDB === "undefined") return { kv: new MemoryKV(), persistent: false };
  try {
    const kv = new IdbKV(createStore("reb-db", "kv"));
    await kv.get("__probe__");
    return { kv, persistent: true };
  } catch {
    return { kv: new MemoryKV(), persistent: false };
  }
}

function kv() {
  kvPromise ??= openKV();
  return kvPromise;
}

export async function isPersistent(): Promise<boolean> {
  return (await kv()).persistent;
}

const INDEX = "index";
const projectKey = (id: string) => `project:${id}`;
const imageKey = (id: string) => `image:${id}`;

export async function listProjects(): Promise<ProjectMeta[]> {
  const { kv: s } = await kv();
  const list = (await s.get<ProjectMeta[]>(INDEX)) ?? [];
  return [...list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function loadProject(id: string): Promise<Project | null> {
  const { kv: s } = await kv();
  const raw = await s.get<unknown>(projectKey(id));
  return raw ? parseProject(raw) : null;
}

/** Serialises writes so concurrent autosaves cannot interleave index updates. */
let queue: Promise<unknown> = Promise.resolve();
function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const run = queue.then(job, job);
  queue = run.catch(() => undefined);
  return run;
}

export function saveProject(p: Project): Promise<void> {
  return enqueue(async () => {
    const { kv: s } = await kv();
    await s.set(projectKey(p.id), p);
    const list = (await s.get<ProjectMeta[]>(INDEX)) ?? [];
    const meta = projectMeta(p);
    await s.set(INDEX, [meta, ...list.filter((m) => m.id !== p.id)]);
  });
}

export function deleteProject(id: string): Promise<void> {
  return enqueue(async () => {
    const { kv: s } = await kv();
    const raw = await s.get<Project>(projectKey(id));
    if (raw?.lot?.imageId) await s.del(imageKey(raw.lot.imageId));
    await s.del(projectKey(id));
    const list = (await s.get<ProjectMeta[]>(INDEX)) ?? [];
    await s.set(
      INDEX,
      list.filter((m) => m.id !== id),
    );
  });
}

export async function saveImage(blob: Blob): Promise<string> {
  const { kv: s } = await kv();
  const id = newId("img_");
  await s.set(imageKey(id), blob);
  return id;
}

export async function loadImage(id: string): Promise<Blob | null> {
  const { kv: s } = await kv();
  return (await s.get<Blob>(imageKey(id))) ?? null;
}

export async function deleteImage(id: string): Promise<void> {
  const { kv: s } = await kv();
  await s.del(imageKey(id));
}

/** Test helper: reset the cached store. */
export function __resetForTests() {
  kvPromise = null;
}
