import { afterEach, describe, expect, it } from "vitest";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { aiContextFor, aiLayoutSchema, aiRequestSchema, aiSystemPrompt, aiToZones, aiUserPrompt, type AiLayout } from "./aiLayout";
import { planQuickFloor } from "./quickFloor";
import { createLot, createProject, rectPolygon } from "./factory";
import { POST } from "@/app/api/ai-layout/route";

const layout: AiLayout = {
  summary: "Phương án thử",
  withStair: true,
  tips: [],
  zones: [
    { name: "Để xe", type: "garage", depth: 5.4, stair: false, furniture: ["car"], side: null },
    { name: "Cầu thang", type: "corridor", depth: 3.8, stair: true, furniture: [], side: { name: "WC", type: "wc", width: 9, furniture: ["toilet"] } },
    { name: "Thang phụ", type: "corridor", depth: -2, stair: true, furniture: [], side: null },
    { name: "  ", type: "kitchen", depth: 0, stair: false, furniture: ["kitchenCounter"], side: null },
  ],
};

describe("aiToZones", () => {
  it("keeps one stair, clamps sizes and fills blank names", () => {
    const { zones, withStair } = aiToZones(layout, 19.78);
    expect(zones.filter((z) => z.stair)).toHaveLength(1);
    expect(zones[1].side!.width).toBe(3);
    expect(zones[2].depth).toBe(0);
    expect(zones[3].name).toBe("Phòng");
    expect(withStair).toBe(true);
  });

  it("produces a floor the generator can build", () => {
    const { zones, withStair } = aiToZones(layout, 19.78);
    const plan = planQuickFloor(rectPolygon(5, 20), zones, { frontEdge: 0, withStair, isGround: true, floorHeight: 3.6, exteriorThickness: 0.22, interiorThickness: 0.11 });
    expect(plan!.stairs).toHaveLength(1);
    expect(plan!.labels.map((l) => l.name)).toContain("WC");
  });

  it("drops the stair flag when no band has one", () => {
    expect(aiToZones({ ...layout, zones: [layout.zones[0]] }, 20).withStair).toBe(false);
  });
});

describe("prompts and schemas", () => {
  it("turns into a structured-output JSON schema", () => {
    expect(() => betaZodOutputFormat(aiLayoutSchema)).not.toThrow();
  });

  it("describes the lot, other floors and the catalogue", () => {
    const p = createProject("Nhà", createLot(rectPolygon(5, 20)));
    p.floors[0].rooms = [{ id: "r", polygon: rectPolygon(1, 1), netPolygon: null, name: "Phòng khách", type: "living", source: "auto" }];
    p.floors.push({ ...p.floors[0], id: "f2", name: "Tầng 2", rooms: [] });
    const ctx = aiContextFor(p, 1, { width: 4.78, depth: 19.78 });
    expect(ctx.otherFloors).toEqual([{ name: p.floors[0].name, rooms: ["Phòng khách"] }]);
    const user = aiUserPrompt("hai phòng ngủ", ctx);
    expect(user).toContain("4.78 m × sâu 19.78 m");
    expect(user).toContain("<yeu_cau>\nhai phòng ngủ\n</yeu_cau>");
    expect(aiSystemPrompt()).toContain("bedDouble: Giường đôi 1m8 1.8×2.1 m");
    expect(aiRequestSchema.safeParse({ prompt: "x", context: ctx }).success).toBe(false);
    expect(aiRequestSchema.safeParse({ prompt: "hai phòng ngủ", context: ctx }).success).toBe(true);
  });
});

describe("POST /api/ai-layout", () => {
  const saved = process.env.ANTHROPIC_API_KEY;
  afterEach(() => {
    process.env.ANTHROPIC_API_KEY = saved;
  });
  const req = (body: unknown) => new Request("http://x/api/ai-layout/", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });

  it("explains when the server has no API key", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const res = await POST(req({ prompt: "abc" }));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toContain("ANTHROPIC_API_KEY");
  });

  it("rejects malformed briefs before calling the API", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    const res = await POST(req({ prompt: "" }));
    expect(res.status).toBe(400);
  });
});
