import { expect, test, type Page } from "@playwright/test";

/**
 * Bảng điều khiển through a longer editing session: switching objects mid-edit, picking tools
 * while something is selected, undo with a multi-selection. The panel must always describe
 * what is selected now, and edits must land on the object they were typed for.
 */

async function plan(page: Page) {
  const box = (await page.locator("canvas").first().boundingBox())!;
  return (fx: number, fy: number) => page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
}

test("bảng điều khiển luôn khớp với đối tượng đang chọn", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Dùng mẫu Nhà phố 5×20, 4 tầng có gara" }).click();
  await page.waitForURL(/\/editor\/\?id=/);
  await page.getByRole("dialog", { name: "Hướng dẫn nhanh" }).getByRole("button", { name: "Bỏ qua" }).click();
  await page.getByRole("radio", { name: "2D", exact: true }).click();
  const panel = page.getByRole("complementary", { name: "Bảng điều khiển" });
  const tools = page.getByRole("navigation", { name: "Công cụ" });
  const click = await plan(page);

  // Place a sofa, then pick the furniture tool again while it is still selected: the catalog shows, not the sofa.
  await tools.getByRole("button", { name: /Nội thất/ }).click();
  await panel.getByRole("button", { name: /Sofa 3 chỗ/ }).click();
  await click(0.35, 0.3);
  await expect(panel.getByLabel("Tên")).toHaveValue("Sofa 3 chỗ");
  await tools.getByRole("button", { name: /Nội thất/ }).click();
  await expect(panel.getByText("Công cụ: Nội thất")).toBeVisible();
  await panel.getByRole("button", { name: /Ghế bành/ }).click();
  await click(0.65, 0.7);
  await expect(panel.getByLabel("Tên")).toHaveValue("Ghế bành");

  // Type a name without pressing Enter, then click another object on the plan.
  await click(0.35, 0.3);
  await expect(panel.getByLabel("Tên")).toHaveValue("Sofa 3 chỗ");
  await panel.getByLabel("Tên").fill("Sofa phòng khách");
  await click(0.65, 0.7);
  await expect(panel.getByLabel("Tên")).toHaveValue("Ghế bành");
  await click(0.35, 0.3);
  await expect(panel.getByLabel("Tên")).toHaveValue("Sofa phòng khách");

  // Multi-select, then undo the armchair: the panel falls back to the one object left.
  await page.keyboard.down("Shift");
  await click(0.65, 0.7);
  await page.keyboard.up("Shift");
  await expect(panel.getByText("Đã chọn 2 đối tượng")).toBeVisible();
  await page.keyboard.press("ControlOrMeta+z"); // rename
  await page.keyboard.press("ControlOrMeta+z"); // armchair
  await expect(panel.getByText("Đã chọn 2 đối tượng")).toBeHidden();
  await expect(panel.getByLabel("Tên")).toHaveValue("Sofa 3 chỗ");
});
