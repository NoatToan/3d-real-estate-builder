import type { Project } from "@/domain/types";
import { EXPORT_FORMAT, exportFileSchema, parseProject, ProjectFormatError } from "@/domain/schema";
import { newId } from "@/domain/factory";

export const MAX_IMPORT_BYTES = 40 * 1024 * 1024;

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return `data:${blob.type || "application/octet-stream"};base64,${bytesToBase64(bytes)}`;
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const m = /^data:([^;,]+);base64,([\s\S]*)$/.exec(dataUrl);
  if (!m) throw new ProjectFormatError("Ảnh nhúng trong tệp không hợp lệ.");
  return new Blob([base64ToBytes(m[2])], { type: m[1] });
}

/** Builds the JSON export document (the certificate image is embedded as a data URL). */
export async function exportProjectFile(project: Project, image: Blob | null): Promise<string> {
  const doc = {
    format: EXPORT_FORMAT,
    version: 1,
    exportedAt: new Date().toISOString(),
    project,
    image: image ? { mime: image.type || "image/png", dataUrl: await blobToDataUrl(image) } : null,
  };
  return JSON.stringify(doc);
}

export interface ImportedProject {
  project: Project;
  image: Blob | null;
}

/**
 * Parses and validates an exported file. The project gets a fresh id when `existingIds`
 * already contains it, so importing never silently overwrites local work.
 */
export function parseProjectFile(text: string, existingIds: ReadonlySet<string> = new Set()): ImportedProject {
  if (text.length > MAX_IMPORT_BYTES * 1.4) throw new ProjectFormatError("Tệp quá lớn.");
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new ProjectFormatError("Tệp không phải JSON hợp lệ.");
  }
  const file = exportFileSchema.safeParse(json);
  if (!file.success) throw new ProjectFormatError("Tệp không đúng định dạng dự án Real Estate Builder.");
  const project = parseProject(file.data.project);
  const image = file.data.image ? dataUrlToBlob(file.data.image.dataUrl) : null;
  if (existingIds.has(project.id)) {
    project.id = newId("p_");
    project.name = `${project.name} (bản nhập)`;
  }
  return { project, image };
}
