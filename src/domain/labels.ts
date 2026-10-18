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

/** Plain-language meaning of the jargon shown next to figures (tooltips). */
export const TERM_HINTS: Record<string, string> = {
  "Diện tích đất (tính)": "Diện tích tính từ ranh đất đã vẽ, để so với số ghi trên sổ.",
  "Giải phóng đường": "Phần đất phía mặt đường bị thu hồi để mở rộng đường (lộ giới). Không được xây lên phần này.",
  "Còn lại để xây": "Diện tích đất sau khi trừ phần giải phóng đường.",
  "Lộ giới đường": "Bề rộng đường theo quy hoạch, tính cả vỉa hè hai bên.",
  "Diện tích trong chỉ giới": "Phần đất được phép xây sau khi chừa khoảng lùi theo quy định.",
  "Diện tích xây dựng (tầng 1)": "Diện tích mặt sàn tầng trệt, tính theo mép ngoài tường.",
  "Mật độ xây dựng": "Diện tích xây dựng tầng 1 chia cho diện tích đất. Mỗi địa phương có mức tối đa, nhà phố nhỏ thường được 100%.",
  "Tổng diện tích sàn": "Cộng diện tích sàn của tất cả các tầng.",
  "Hệ số sử dụng đất": "Tổng diện tích sàn chia cho diện tích đất. Ví dụ 3,0 nghĩa là sàn gấp 3 lần đất.",
  "Chiều cao công trình": "Tổng chiều cao các tầng (chưa tính mái, tum).",
};
