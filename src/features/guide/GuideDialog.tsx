"use client";

import type { ReactNode } from "react";
import { Route } from "lucide-react";
import { useEditorStore } from "@/store/editorStore";
import { Box, Col, Text, TextMuted } from "@/components/ui/BasePrimitives";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";

function H({ children }: { children: ReactNode }) {
  return <h3 className="mt-2 text-sm font-semibold text-ink">{children}</h3>;
}

function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-line bg-surface-muted px-1 font-sans text-xs">{children}</kbd>;
}

const TERMS: [string, string][] = [
  ["Ranh đất", "Đường bao thửa đất theo sổ đỏ. Có thể vẽ lại từ ảnh sổ hoặc nhập kích thước."],
  ["Giải phóng mặt bằng / lộ giới", "Phần đất phía mặt đường bị thu hồi để mở rộng đường. Chỉ được xây trên phần còn lại."],
  ["Khoảng lùi / chỉ giới xây dựng", "Khoảng cách tối thiểu từ ranh đất đến mặt ngoài công trình theo quy định địa phương."],
  ["Mật độ xây dựng", "Diện tích tầng 1 chia cho diện tích đất (đất còn lại nếu có giải phóng)."],
  ["Hệ số sử dụng đất", "Tổng diện tích sàn các tầng chia cho diện tích đất."],
  ["Vách 110 / tường 220", "Độ dày tường: 110 mm cho vách ngăn trong nhà, 220 mm cho tường bao."],
  ["Diện tích quy đổi", "Cách nhà thầu tính giá trọn gói: móng + các sàn + mái, mỗi phần nhân một hệ số."],
];

/** Plain-language manual for first-time users, with the jargon explained. */
export function GuideDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="Hướng dẫn sử dụng"
      footer={
        <>
          <Button
            icon={<Route size={16} />}
            onClick={() => {
              useEditorStore.getState().setTourDone(false);
              onClose();
            }}
          >
            Xem lại hướng dẫn nhanh
          </Button>
          <Button variant="primary" onClick={onClose}>
            Đã hiểu
          </Button>
        </>
      }
    >
      <Col className="gap-1 text-sm text-ink">
        <TextMuted as="p">Mọi thứ được lưu tự động trong trình duyệt. Bấm Ctrl+Z để hoàn tác bất kỳ lúc nào. Muốn bắt đầu nhanh thì mở một <b>nhà mẫu</b> ở trang danh sách dự án rồi sửa lại.</TextMuted>
        <H>1. Lô đất</H>
        <Text as="p">Bấm “Ranh đất” ở thanh trên cùng để tải ảnh sổ đỏ hoặc nhập kích thước. Nếu nhà bị giải phóng đường, bật mục “Giải phóng mặt bằng” trong mục “Ràng buộc” của Bảng điều khiển (cột bên trái).</Text>
        <H>2. Dựng mặt sàn nhanh</H>
        <Text as="p">
          Bấm <b>Tạo nhanh</b> (cây đũa phép ở thanh công cụ trái), chọn mẫu như “Tầng trệt nhà ở” hay “Văn phòng cho thuê”. Ứng dụng tự dựng tường, cửa, cầu thang, WC và nội thất vừa lô đất. Muốn đổi kích thước phòng thì sửa chiều sâu trong hộp thoại. Muốn thêm từng phòng (phòng ngủ, WC, bếp…) vào phần sàn còn trống thì bấm <b>Phòng mẫu</b>: ứng dụng tự tìm chỗ có cửa sổ, yên tĩnh, không chắn lối đi và giải thích vì sao.
        </Text>
        <H>3. Chỉnh sửa</H>
        <Text as="p">
          Dùng công cụ <b>Chọn</b> rồi bấm vào vách, cửa, phòng hay đồ nội thất. Bảng điều khiển bên trái hiện thông số để sửa. Kéo để di chuyển (đồ nội thất và cầu thang kéo được cả trong 3D), <Kbd>R</Kbd> để xoay, <Kbd>Delete</Kbd> để xoá, phím mũi tên để dịch từng chút.
        </Text>
        <H>4. Nội thất</H>
        <Text as="p">Bấm “Nội thất”, chọn món đồ trong danh sách ở Bảng điều khiển, rồi bấm lên mặt bằng để đặt. Đồ nội thất hiện cả ở 2D và 3D.</Text>
        <H>5. Thêm tầng, xem 3D, tài chính</H>
        <Text as="p">
          Dấu <b>+</b> trên thanh tầng để thêm tầng (giữ tường bao). Chọn “3D” hoặc “2D + 3D” ở góc trên để xem phối cảnh; “Tài chính” để tính chi phí xây và dòng tiền cho thuê. Trong Tài chính có bảng <b>bóc khối lượng & dự toán vật tư</b> (gạch, xi măng, thép, sơn, gạch lát, cửa, nhân công) đọc từ bản vẽ, sửa được đơn giá và xuất Excel.
        </Text>
        <H>6. Phong thuỷ</H>
        <Text as="p">Mở mục “Phong thuỷ” trong Bảng điều khiển, nhập năm sinh (âm lịch) và giới tính gia chủ, chọn hướng nhà. Ứng dụng tính cung mệnh, tô 8 cung tốt/xấu lên mặt bằng và kiểm tra hướng nhà, vị trí bếp, WC, bàn thờ, phòng ngủ, số bậc cầu thang (Sinh – Lão – Bệnh – Tử), kèm nút sửa nhanh.</Text>
        <H>Chuột & phím tắt</H>
        <Box as="article" className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          <Text>Lăn chuột</Text>
          <TextMuted>Phóng to / thu nhỏ</TextMuted>
          <Text>Kéo vùng trống / giữ Space</Text>
          <TextMuted>Cuộn khung nhìn</TextMuted>
          <Text>
            <Kbd>V</Kbd> <Kbd>W</Kbd> <Kbd>E</Kbd> <Kbd>D</Kbd> <Kbd>N</Kbd> <Kbd>S</Kbd> <Kbd>I</Kbd> <Kbd>M</Kbd>
          </Text>
          <TextMuted>Chọn, vách, phòng, cửa đi, cửa sổ, thang, nội thất, đo</TextMuted>
          <Text>
            <Kbd>1</Kbd> <Kbd>2</Kbd> <Kbd>3</Kbd> <Kbd>4</Kbd>
          </Text>
          <TextMuted>2D, 2D + 3D, 3D, Tài chính</TextMuted>
          <Text>
            <Kbd>Esc</Kbd>
          </Text>
          <TextMuted>Huỷ thao tác / bỏ chọn</TextMuted>
        </Box>
        <H>Thuật ngữ</H>
        <dl className="grid grid-cols-[minmax(8rem,auto)_1fr] gap-x-3 gap-y-1.5 text-xs">
          {TERMS.map(([t, d]) => (
            <Box key={t} className="contents">
              <dt className="font-semibold text-ink">{t}</dt>
              <dd className="text-ink-muted">{d}</dd>
            </Box>
          ))}
        </dl>
      </Col>
    </Modal>
  );
}
