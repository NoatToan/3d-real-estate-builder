import { z } from "zod";
import { FURNITURE_KINDS, ROOM_TYPES, type FurnitureKind, type Project } from "./types";
import type { QuickZone } from "./quickFloor";
import { FURNITURE_CATALOG } from "./furniture";
import { ROOM_TYPE_LABELS } from "./labels";

/**
 * "Thiết kế bằng AI": Claude turns a spoken-style brief into the same band layout the
 * "Tạo nhanh" generator understands. Claude decides the programme (rooms, depths, stair/WC,
 * furniture); the geometry engine (planQuickFloor) builds walls, doors and the stair, so the
 * result always fits the lot and passes validation.
 */

const zoneSchema = z.object({
  name: z.string().describe("Tên phòng tiếng Việt, ngắn gọn"),
  type: z.enum(ROOM_TYPES),
  depth: z.number().describe("Chiều sâu dải phòng (m) tính dọc theo lô; 0 = chia đều phần còn lại"),
  stair: z.boolean().describe("true nếu đặt cầu thang chữ U ở dải này (tối đa 1 dải)"),
  furniture: z.array(z.enum(FURNITURE_KINDS)),
  side: z
    .object({
      name: z.string(),
      type: z.enum(ROOM_TYPES),
      width: z.number().describe("Bề rộng phòng phụ sát vách hông (m), thường 1.2–2.0"),
      furniture: z.array(z.enum(FURNITURE_KINDS)),
    })
    .nullable()
    .describe("Phòng nhỏ sát một vách hông trong cùng dải (vd WC cạnh cầu thang), null nếu không có"),
});

export const aiLayoutSchema = z.object({
  summary: z.string().describe("2–4 câu tiếng Việt giải thích phương án cho người không chuyên"),
  zones: z.array(zoneSchema).describe("Các dải phòng theo thứ tự từ mặt tiền vào trong"),
  withStair: z.boolean(),
  tips: z.array(z.string()).describe("Tối đa 4 lưu ý ngắn: công năng, thông gió, quy chuẩn…"),
});

export type AiLayout = z.infer<typeof aiLayoutSchema>;

export interface AiLayoutContext {
  floorName: string;
  floorIndex: number;
  floorCount: number;
  floorHeight: number;
  /** Usable size on wall centre lines, metres. */
  width: number;
  depth: number;
  roadWidth: number | null;
  /** Names of rooms already laid out on the other floors, to keep the house coherent. */
  otherFloors: { name: string; rooms: string[] }[];
}

export const AI_PROMPT_MAX = 2000;

export const aiRequestSchema = z.object({
  prompt: z.string().trim().min(3).max(AI_PROMPT_MAX),
  context: z.object({
    floorName: z.string().max(120),
    floorIndex: z.number().int().min(0).max(100),
    floorCount: z.number().int().min(1).max(100),
    floorHeight: z.number().min(2).max(10),
    width: z.number().min(1).max(200),
    depth: z.number().min(1).max(500),
    roadWidth: z.number().min(0).max(200).nullable(),
    otherFloors: z.array(z.object({ name: z.string().max(120), rooms: z.array(z.string().max(120)).max(40) })).max(30),
  }),
});

export function aiContextFor(p: Project, floorIndex: number, size: { width: number; depth: number }): AiLayoutContext {
  const f = p.floors[floorIndex];
  return {
    floorName: f.name,
    floorIndex,
    floorCount: p.floors.length,
    floorHeight: f.height,
    width: Math.round(size.width * 100) / 100,
    depth: Math.round(size.depth * 100) / 100,
    roadWidth: p.constraints.roadCut.enabled ? p.constraints.roadCut.roadWidth : null,
    otherFloors: p.floors.filter((_, i) => i !== floorIndex && p.floors[i].rooms.length).map((x) => ({ name: x.name, rooms: x.rooms.map((r) => r.name) })),
  };
}

/** Fixed instructions + catalogue: identical on every request so it can be cached. */
export function aiSystemPrompt(): string {
  const rooms = ROOM_TYPES.map((t) => `${t} (${ROOM_TYPE_LABELS[t]})`).join(", ");
  const furniture = FURNITURE_CATALOG.map((s) => `${s.kind}: ${s.label} ${s.width}×${s.depth} m`).join("\n");
  return `Bạn là kiến trúc sư nhà phố Việt Nam, thiết kế công năng một mặt sàn cho người không chuyên mô tả bằng lời.

Cách mặt sàn được dựng: lô đất chia thành các DẢI nối tiếp nhau từ mặt tiền (giáp đường) vào trong; mỗi dải chạy hết bề ngang và là một phòng. Giữa hai dải có vách ngăn và một cửa đi ở lối đi chung. Một dải có thể có "side": phòng nhỏ sát vách hông trong cùng dải (thường là WC cạnh cầu thang). Dải có stair=true đặt cầu thang chữ U (rộng ~1.9 m, sâu ~3.5 m) sát vách hông bên kia. Nội thất được xếp thành một hàng sát phía sau của dải, theo thứ tự liệt kê; món nào không vừa sẽ bị bỏ qua.

Quy tắc:
- Tổng chiều sâu các dải có depth > 0 phải nhỏ hơn chiều sâu khả dụng; dùng depth = 0 cho dải được chia đều phần còn lại. Dải có ô tô cần sâu ≥ 5.4 m; dải cầu thang sâu 3.6–4.0 m; phòng ngủ ≥ 3.2 m.
- Nhà nhiều tầng hoặc người dùng muốn có tầng trên: đúng một dải có stair=true, nên đặt ở giữa nhà, thường kèm side là WC rộng 1.3–1.6 m. Đặt withStair=false chỉ khi người dùng nói rõ không cần cầu thang hoặc đây là tầng trên cùng/tum không lên nữa.
- Bề ngang hẹp: không xếp quá nhiều đồ trong một dải; tổng bề rộng đồ trong một dải nên nhỏ hơn bề ngang khả dụng trừ 1 m.
- Tầng trệt thường có chỗ để xe phía trước nếu người dùng không nói khác; tầng trên ưu tiên phòng ngủ có cửa sổ ở mặt tiền hoặc mặt sau.
- Tôn trọng yêu cầu của người dùng trước các quy tắc chung; nếu yêu cầu không khả thi với kích thước lô, làm phương án gần nhất và giải thích trong summary.
- Viết tên phòng, summary và tips bằng tiếng Việt, dễ hiểu.

Công năng phòng (type): ${rooms}

Nội thất có sẵn (kind: tên, rộng × sâu):
${furniture}`;
}

export function aiUserPrompt(prompt: string, c: AiLayoutContext): string {
  const others = c.otherFloors.length ? c.otherFloors.map((f) => `- ${f.name}: ${f.rooms.join(", ") || "(trống)"}`).join("\n") : "(chưa có)";
  return `Mặt sàn cần thiết kế: ${c.floorName} (tầng thứ ${c.floorIndex + 1}/${c.floorCount}, cao ${c.floorHeight} m).
Kích thước khả dụng (tim tường): ngang ${c.width} m × sâu ${c.depth} m.${c.roadWidth ? ` Mặt tiền giáp đường lộ giới ${c.roadWidth} m.` : ""}
Các tầng khác hiện có:
${others}

Yêu cầu của người dùng:
<yeu_cau>
${prompt}
</yeu_cau>`;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : lo));

/** Makes a model answer safe for the generator: bounded sizes, one stair band, sane counts. */
export function aiToZones(layout: AiLayout, depth: number): { zones: QuickZone[]; withStair: boolean } {
  let stairUsed = false;
  const zones = layout.zones.slice(0, 10).map<QuickZone>((z) => {
    const stair = z.stair && !stairUsed;
    stairUsed ||= stair;
    const furniture = z.furniture.slice(0, 8) as FurnitureKind[];
    return {
      name: z.name.trim().slice(0, 60) || "Phòng",
      type: z.type,
      depth: clamp(z.depth, 0, depth),
      stair,
      furniture,
      side: z.side ? { name: z.side.name.trim().slice(0, 60) || "WC", type: z.side.type, width: clamp(z.side.width, 0.8, 3), furniture: z.side.furniture.slice(0, 4) as FurnitureKind[] } : undefined,
    };
  });
  return { zones: zones.length ? zones : [{ name: "Không gian mở", type: "other", depth: 0 }], withStair: layout.withStair && stairUsed };
}
