import { describe, expect, it } from "vitest";
import { buildXlsx, crc32 } from "./xlsx";

describe("xlsx writer", () => {
  it("computes the standard CRC-32", () => {
    expect(crc32(new TextEncoder().encode("123456789")).toString(16)).toBe("cbf43926");
  });

  it("writes a zip with the workbook parts and escaped cells", () => {
    const bytes = buildXlsx("Dự toán", [["Hạng mục", "Số lượng"], ["Gạch <ống> & vữa", 12.5], [null, 3]]);
    expect(String.fromCharCode(bytes[0], bytes[1])).toBe("PK");
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain("xl/worksheets/sheet1.xml");
    expect(text).toContain("Gạch &lt;ống&gt; &amp; vữa");
    expect(text).toContain('<c r="B2"><v>12.5</v></c>');
    expect(text).toContain('<c r="B3"><v>3</v></c>');
  });
});
