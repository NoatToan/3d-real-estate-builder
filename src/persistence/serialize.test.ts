import { describe, expect, it } from "vitest";
import { createProject } from "@/domain/factory";
import { ProjectFormatError } from "@/domain/schema";
import { blobToDataUrl, dataUrlToBlob, exportProjectFile, parseProjectFile } from "./serialize";
import { deleteProject, listProjects, loadImage, loadProject, saveImage, saveProject, __resetForTests } from "./db";

describe("serialize", () => {
  it("round-trips a project with an embedded image", async () => {
    const p = createProject("Nhà phố");
    const img = new Blob([new Uint8Array([137, 80, 78, 71, 1, 2, 3])], { type: "image/png" });
    const text = await exportProjectFile(p, img);
    const out = parseProjectFile(text);
    expect(out.project).toEqual(p);
    expect(out.image?.type).toBe("image/png");
    expect(new Uint8Array(await out.image!.arrayBuffer())).toEqual(new Uint8Array([137, 80, 78, 71, 1, 2, 3]));
  });

  it("renames on id collision", async () => {
    const p = createProject("A");
    const out = parseProjectFile(await exportProjectFile(p, null), new Set([p.id]));
    expect(out.project.id).not.toBe(p.id);
    expect(out.project.name).toContain("bản nhập");
    expect(out.image).toBeNull();
  });

  it("rejects bad files", () => {
    expect(() => parseProjectFile("not json")).toThrow(ProjectFormatError);
    expect(() => parseProjectFile(JSON.stringify({ format: "other" }))).toThrow(/định dạng/);
    expect(() => dataUrlToBlob("data:nope")).toThrow(ProjectFormatError);
  });

  it("converts blobs to data URLs", async () => {
    const url = await blobToDataUrl(new Blob(["hi"], { type: "text/plain" }));
    expect(url).toBe("data:text/plain;base64,aGk=");
  });
});

describe("db (memory fallback in node)", () => {
  it("saves, lists, loads and deletes projects and images", async () => {
    __resetForTests();
    const p = createProject("Một");
    p.lot.imageId = await saveImage(new Blob(["x"], { type: "image/png" }));
    await saveProject(p);
    await saveProject({ ...p, name: "Một (sửa)", updatedAt: new Date(Date.now() + 1000).toISOString() });
    const list = await listProjects();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe("Một (sửa)");
    expect((await loadProject(p.id))?.name).toBe("Một (sửa)");
    expect(await loadImage(p.lot.imageId)).not.toBeNull();
    await deleteProject(p.id);
    expect(await listProjects()).toHaveLength(0);
    expect(await loadImage(p.lot.imageId)).toBeNull();
    expect(await loadProject(p.id)).toBeNull();
  });
});
