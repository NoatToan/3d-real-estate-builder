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
  await expect(page.getByText("Các bước dựng nhà")).toBeVisible();
  await shot(page, "03-editor");

  // 3. Road cut (giải phóng mặt bằng): 2 m taken from the front edge
  await page.getByRole("button", { name: "Ràng buộc (tuỳ chọn)" }).click();
  await page.getByRole("switch", { name: "Giải phóng mặt bằng (lộ giới)" }).click();
  const depth = page.getByLabel("Chiều sâu thu hồi");
  await depth.fill("2");
  await depth.press("Enter");
  await expect(page.getByText("Giải phóng đường")).toBeVisible();
  await shot(page, "04-road-cut");

  // 4. Describe the floor in words → Claude (mocked) → preview → build
  await page.getByRole("button", { name: "Tạo nhanh mặt sàn từ mẫu hoặc mô tả bằng AI" }).click();
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
  type Probe = { id: string; x: number; y: number; screen: { x: number; y: number } } | null;
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

  // 10. Built-in user guide
  await page.getByRole("button", { name: "Hướng dẫn sử dụng" }).click();
  const guide = page.getByRole("dialog");
  await expect(guide).toBeVisible();
  await shot(page, "13-guide");
  await page.keyboard.press("Escape");
  await expect(guide).toBeHidden();

  // 11. Finance
  await page.getByRole("radio", { name: "Tài chính" }).click();
  await expect(page.getByText(/Diện tích quy đổi/).first()).toBeVisible();
  await shot(page, "14-finance");

  if (capture) {
    const video = page.video();
    await page.close();
    await video?.saveAs(path.join(OUT, "tour.webm"));
  }
});
