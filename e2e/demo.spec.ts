import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";

/**
 * Feature tour used as the README showcase. Every step asserts what the user should see,
 * and with DEMO_CAPTURE=1 (`pnpm demo`) it also writes docs/demo/<name>.png and a video.
 * New user-facing features get a step here (see AGENTS.md → "Feature showcase").
 */

const OUT = path.join(__dirname, "..", "docs", "demo");
const capture = !!process.env.DEMO_CAPTURE;

async function shot(page: Page, name: string) {
  if (!capture) return;
  mkdirSync(OUT, { recursive: true });
  // Toasts would cover the side panel in the image.
  for (const close of await page.getByRole("button", { name: "Đóng thông báo" }).all()) await close.click({ timeout: 1000 }).catch(() => {}); // may auto-dismiss meanwhile
  // Let transitions / canvas redraws settle so the image matches what a user sees.
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
}

/** Canned Claude answer, so the AI step runs without ANTHROPIC_API_KEY and always looks the same. */
const AI_LAYOUT = {
  summary:
    "Tầng trệt chia 4 dải từ mặt tiền vào: chỗ để ô tô sát đường, phòng khách, lõi cầu thang kèm WC ở giữa nhà, bếp và bàn ăn phía sau lấy sáng từ sân sau.",
  zones: [
    { name: "Để xe", type: "garage", depth: 5, stair: false, furniture: ["car", "motorbike"], side: null },
    { name: "Phòng khách", type: "living", depth: 4.5, stair: false, furniture: ["sofa", "coffeeTable", "tvUnit"], side: null },
    { name: "Cầu thang", type: "corridor", depth: 3, stair: true, furniture: [], side: { name: "WC", type: "wc", width: 1.5, furniture: ["toilet", "basin"] } },
    { name: "Bếp + ăn", type: "kitchen", depth: 0, stair: false, furniture: ["kitchenCounter", "fridge", "diningTable6"], side: null },
  ],
  withStair: true,
  tips: ["Chừa giếng trời ở lõi thang để thông gió.", "Cửa WC không mở thẳng ra bếp."],
};

test("tour: lô đất → AI thiết kế mặt sàn → phòng mẫu → 3D → tài chính", async ({ page }) => {
  await page.route("**/api/ai-layout/", (route) => route.fulfill({ json: { layout: AI_LAYOUT } }));

  // 1. Projects home
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Real Estate Builder" })).toBeVisible();
  await shot(page, "01-home");

  // 2. New project from lot dimensions (5 × 20 m)
  await page.getByRole("button", { name: "Dự án mới" }).click();
  const dialog = page.getByRole("dialog", { name: "Tạo dự án mới" });
  await dialog.getByLabel("Tên dự án").fill("Nhà phố 5×20 (demo)");
  await dialog.getByRole("radio", { name: /Nhập kích thước/ }).click();
  await shot(page, "02-new-project");
  await dialog.getByRole("button", { name: "Tạo dự án" }).click();
  await page.waitForURL(/\/editor\/\?id=/);
  // First visit: 4 coach marks point at the main areas (shown once, skippable).
  const tour = page.getByRole("dialog", { name: "Hướng dẫn nhanh" });
  await expect(tour).toContainText("Bắt đầu ở đây");
  await shot(page, "03a-first-run-tour");
  for (const title of ["Bảng điều khiển", "Xem 2D, 3D, tài chính", "Các tầng"]) {
    await tour.getByRole("button", { name: "Tiếp" }).click();
    await expect(tour).toContainText(title);
  }
  await tour.getByRole("button", { name: "Bắt đầu dùng" }).click();
  await expect(tour).toBeHidden();
  await expect(page.getByText("Các bước dựng nhà")).toBeVisible();
  // Empty floor: the plan offers the ways to start instead of a blank grid.
  const startCard = page.getByRole("region", { name: "Bắt đầu dựng tầng" });
  await expect(startCard).toBeVisible();
  await shot(page, "03-editor");

  // 3. Road cut (giải phóng mặt bằng): 2 m taken from the front edge
  await page.getByRole("tab", { name: "Cài đặt" }).click();
  await page.getByRole("switch", { name: "Giải phóng mặt bằng (lộ giới)" }).click();
  const depth = page.getByLabel("Chiều sâu thu hồi");
  await depth.fill("2");
  await depth.press("Enter");
  await page.getByRole("tab", { name: /Kiểm tra/ }).click();
  await expect(page.getByText("Giải phóng đường")).toBeVisible();
  await shot(page, "04-road-cut");

  // 4. Describe the floor in words → Claude (mocked) → preview → build (from the empty-floor card)
  await startCard.getByRole("button", { name: /Dựng nhanh cả tầng/ }).click();
  const quick = page.getByRole("dialog", { name: /Tạo nhanh mặt sàn/ });
  await quick.getByLabel("Mô tả mặt sàn mong muốn").fill("Tầng trệt để 1 ô tô, phòng khách nhìn ra đường, bếp và bàn ăn 6 người phía sau, có WC cạnh cầu thang.");
  await quick.getByRole("button", { name: "Thiết kế bằng AI" }).click();
  await expect(quick.getByText(AI_LAYOUT.summary)).toBeVisible();
  await expect(quick.getByRole("img", { name: "Xem trước mặt sàn" })).toBeVisible();
  await shot(page, "05-ai-design");
  await quick.getByRole("button", { name: "Dựng mặt sàn" }).click();
  await expect(quick).toBeHidden();
  await page.getByRole("radio", { name: "2D", exact: true }).click();
  await shot(page, "06-plan-2d");

  // 5. Second floor from a template: open floor with a WC core, rooms placed next
  await page.getByRole("tab", { name: /Bắt đầu/ }).click();
  await page.getByRole("button", { name: "Thêm tầng trên" }).click();
  await page.getByRole("button", { name: "Tạo nhanh mặt sàn từ mẫu hoặc mô tả bằng AI" }).click();
  const quick2 = page.getByRole("dialog", { name: /Tạo nhanh mặt sàn/ });
  await quick2.getByRole("radio", { name: /Sàn trống/ }).click();
  // Top floor: no stair up.
  await quick2.getByRole("switch", { name: /Có cầu thang lên tầng trên/ }).click();
  await shot(page, "07-template");
  await quick2.getByRole("button", { name: "Dựng mặt sàn" }).click();
  await expect(quick2).toBeHidden();

  // 6. Standard room: the app ranks spots for a master bedroom and explains why
  await page.getByRole("button", { name: "Thêm phòng mẫu: tự tìm vị trí phù hợp" }).click();
  const placer = page.getByRole("dialog", { name: /Phòng mẫu/ });
  await placer.getByRole("radio", { name: /Phòng ngủ master/ }).click();
  const spots = placer.getByRole("radiogroup", { name: "Vị trí đề xuất" });
  await expect(spots.getByRole("radio").first()).toContainText("phù hợp nhất");
  await expect(spots.getByRole("radio").first()).toContainText("mở được cửa sổ");
  await shot(page, "08-room-placer");

  // 7. Fill the floor with a set of rooms in one go
  await placer.getByRole("radio", { name: "Tự xếp nhiều phòng" }).click();
  await placer.getByRole("radio", { name: /Master \+ phòng ngủ đơn \+ WC/ }).click();
  await expect(placer.getByText("Không đủ chỗ cho")).toBeHidden();
  await shot(page, "09-auto-rooms");
  await placer.getByRole("button", { name: "Xếp các phòng" }).click();
  await expect(placer).toBeHidden();
  await expect(page.getByText("Đã xếp 3 phòng trên Tầng 2.")).toBeVisible();
  await page.getByRole("radio", { name: "2D", exact: true }).click();
  await shot(page, "10-rooms-plan");

  // 8. 3D view
  await page.getByRole("radio", { name: "3D", exact: true }).click();
  await expect(page.locator("canvas").first()).toBeVisible();
  await page.waitForTimeout(2500);
  await shot(page, "11-viewer-3d");

  // 9. Move furniture in 3D: drag the bed, the 2D plan beside it follows
  await page.getByRole("radio", { name: "2D + 3D", exact: true }).click();
  await page.getByRole("button", { name: "Nhìn từ trên xuống" }).click();
  await page.waitForTimeout(800);
  type Probe = { id: string; x: number; y: number; rotation: number; width: number; screen: { x: number; y: number } } | null;
  const probe = () => page.evaluate(() => (window as unknown as { __reb3d: { furniture: (k: string) => Probe } }).__reb3d.furniture("bedDouble"));
  const bed = await probe();
  expect(bed).not.toBeNull();
  const canvas3d = page.getByRole("img", { name: "Mô hình 3D của ngôi nhà" }).or(page.locator('canvas[aria-label="Mô hình 3D của ngôi nhà"]')).first();
  const cb = (await canvas3d.boundingBox())!;
  const sx = cb.x + bed!.screen.x;
  const sy = cb.y + bed!.screen.y;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  for (let k = 1; k <= 6; k++) await page.mouse.move(sx, sy + 5 * k);
  await page.mouse.up();
  const moved = await probe();
  expect(Math.hypot(moved!.x - bed!.x, moved!.y - bed!.y)).toBeGreaterThan(0.3);
  await shot(page, "12-drag-3d");
  // One undo puts it back.
  await page.getByRole("button", { name: "Hoàn tác" }).click();
  const back = await probe();
  expect(Math.hypot(back!.x - bed!.x, back!.y - bed!.y)).toBeLessThan(0.01);
  await page.getByRole("button", { name: "Làm lại" }).click();

  // 10. Actions right next to the selected object, in 2D and in 3D: rotate, size, duplicate, delete
  const bars = page.getByRole("toolbar", { name: "Thao tác nhanh với đối tượng" });
  await expect(bars).toHaveCount(2);
  const bar3d = bars.last();
  await expect(bar3d).toContainText("Giường đôi 1m8");
  await bar3d.getByRole("button", { name: "Xoay phải" }).click();
  expect((await probe())!.rotation).toBe((bed!.rotation + 90) % 360);
  await bars.first().getByRole("button", { name: "Kích thước" }).click();
  const widthField = bars.first().getByLabel("Rộng");
  await widthField.fill("1,6");
  await widthField.press("Enter");
  await expect.poll(async () => (await probe())!.width).toBeCloseTo(1.6);
  await shot(page, "13-object-actions");
  await bars.first().getByRole("button", { name: "Đóng" }).click();

  // 11. Built-in user guide
  await page.getByRole("button", { name: "Hướng dẫn sử dụng" }).click();
  const guide = page.getByRole("dialog");
  await expect(guide).toBeVisible();
  await shot(page, "14-guide");
  await page.keyboard.press("Escape");
  await expect(guide).toBeHidden();

  // 12. Phong thuỷ: owner's year + house facing → cung mệnh, 8 sectors on the plan, checks with fixes
  await page.getByRole("radio", { name: "2D", exact: true }).click();
  await page.getByRole("tab", { name: "Phong thuỷ" }).click();
  const year = page.getByLabel("Năm sinh gia chủ (âm lịch)");
  await year.fill("1990");
  await year.press("Enter");
  await page.getByRole("radiogroup", { name: "Hướng nhà" }).getByRole("radio", { name: "Đông Nam", exact: true }).click();
  await expect(page.getByText("Cung Khảm · Đông tứ mệnh")).toBeVisible();
  const checks = page.getByRole("list", { name: "Kết quả phong thuỷ" });
  await expect(checks).toContainText("Hướng nhà Đông Nam: Sinh Khí");
  const fixes = page.getByRole("button", { name: /Đổi thành \d+ bậc/ });
  const before = await fixes.count();
  if (before > 0) {
    await fixes.first().click();
    await expect(fixes).toHaveCount(before - 1);
  }
  await page.getByRole("tab", { name: /Tầng 1/ }).first().click();
  await shot(page, "15-feng-shui");

  // 13. Finance + quantities read off the drawing, exported to Excel
  await page.getByRole("radio", { name: "Tài chính" }).click();
  await expect(page.getByText(/Diện tích quy đổi/).first()).toBeVisible();
  await shot(page, "16-finance");
  const boq = page.getByRole("table", { name: "Dự toán vật tư" });
  await boq.scrollIntoViewIfNeeded();
  await expect(boq).toContainText("Gạch ống");
  await expect(boq).toContainText("Tổng dự toán");
  const [xlsx] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Xuất Excel" }).click()]);
  expect(xlsx.suggestedFilename()).toMatch(/du-toan\.xlsx$/);
  await page.waitForTimeout(300);
  await shot(page, "17-quantities");

  if (capture) {
    const video = page.video();
    await page.close();
    await video?.saveAs(path.join(OUT, "tour.webm"));
  }
});

test("nhà mẫu: mở một mẫu dựng sẵn và sửa tiếp", async ({ page }) => {
  await page.goto("/");
  const gallery = page.getByRole("region", { name: "Nhà mẫu" });
  await expect(gallery.getByRole("listitem")).toHaveCount(5);
  await gallery.scrollIntoViewIfNeeded();
  await shot(page, "18-samples");
  await gallery.getByRole("button", { name: "Dùng mẫu Nhà tóp hậu 5 tầng cho thuê" }).click();
  await page.waitForURL(/\/editor\/\?id=/);
  await page.getByRole("dialog", { name: "Hướng dẫn nhanh" }).getByRole("button", { name: "Bỏ qua" }).click();
  await expect(page.getByRole("tab", { name: /Tầng 5/ })).toBeVisible();
  // The tour stays dismissed and the open panel tab is remembered after a reload.
  await page.getByRole("tab", { name: "Phong thuỷ" }).click();
  await page.reload();
  await expect(page.getByRole("tab", { name: /Tầng 5/ })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Hướng dẫn nhanh" })).toBeHidden();
  await expect(page.getByRole("tab", { name: "Phong thuỷ" })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: /Bắt đầu/ }).click();
  await page.getByRole("radio", { name: "2D + 3D", exact: true }).click();
  await page.waitForTimeout(2500);
  await shot(page, "19-sample-open");
});

test.describe("điện thoại", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });

  test("công cụ ở thanh dưới, bảng điều khiển dạng ngăn kéo", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Dùng mẫu Nhà phố 5×20, 4 tầng có gara" }).click();
    await page.waitForURL(/\/editor\/\?id=/);
    const tour = page.getByRole("dialog", { name: "Hướng dẫn nhanh" });
    await expect(tour).toBeVisible();
    await tour.getByRole("button", { name: "Bỏ qua" }).click();

    // Tools at the bottom of the screen, within thumb reach.
    const tools = page.getByRole("navigation", { name: "Công cụ" });
    const box = (await tools.boundingBox())!;
    expect(box.y + box.height).toBeGreaterThan(800);
    expect(box.width).toBeGreaterThan(380);
    await expect(page.getByRole("radio", { name: "2D + 3D" })).toBeVisible();
    await page.getByRole("radio", { name: "2D", exact: true }).click();
    await shot(page, "20-mobile-plan");

    // Control panel opens as a bottom sheet and closes again.
    await page.getByRole("button", { name: "Bảng điều khiển" }).click();
    const sheet = page.getByRole("complementary", { name: "Bảng điều khiển" });
    await expect(sheet).toBeVisible();
    await sheet.getByRole("tab", { name: /Kiểm tra/ }).click();
    await expect(sheet).toContainText("Thống kê diện tích");
    await shot(page, "21-mobile-panel");
    await sheet.getByRole("button", { name: "Thu gọn bảng điều khiển" }).click();
    await expect(sheet).toBeHidden();
  });
});
