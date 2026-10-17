import type { OpeningKind, RoomType, StairType } from "./types";
import { palette } from "@/theme/tokens";

export const ROOM_TYPE_LABELS: Record<RoomType, string> = {
  living: "Phòng khách",
  bedroom: "Phòng ngủ",
  kitchen: "Bếp",
  dining: "Phòng ăn",
  bathroom: "Phòng tắm",
  wc: "WC",
  worship: "Phòng thờ",
  garage: "Gara",
  storage: "Kho",
  balcony: "Ban công",
  corridor: "Hành lang",
  office: "Phòng làm việc",
  laundry: "Giặt phơi",
  other: "Khác",
};

/** Fill colours for room types (plan + 3D floor finish). */
export const ROOM_TYPE_COLORS: Record<RoomType, string> = {
  living: palette.amber200,
  bedroom: palette.blue200,
  kitchen: palette.red200,
  dining: palette.orange200,
  bathroom: palette.cyan200,
  wc: palette.teal200,
  worship: palette.fuchsia200,
  garage: palette.stone300,
  storage: palette.stone200,
  balcony: palette.green200,
  corridor: palette.slate100,
  office: palette.indigo200,
  laundry: palette.teal100,
  other: palette.gray200,
};

export const STAIR_TYPE_LABELS: Record<StairType, string> = {
  straight: "Thẳng 1 vế",
  L: "Chữ L",
  U: "Chữ U",
  spiral: "Xoắn ốc",
};

export const OPENING_LABELS: Record<OpeningKind, string> = {
  door: "Cửa đi",
  window: "Cửa sổ",
};

const nf2 = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
const nf1 = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 });

export const fmtLength = (m: number): string => `${nf2.format(m)} m`;
export const fmtArea = (m2: number): string => `${nf2.format(m2)} m²`;
export const fmtPercent = (ratio: number): string => `${nf1.format(ratio * 100)}%`;
export const fmtNumber = (n: number): string => nf2.format(n);
