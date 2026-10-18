import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Be_Vietnam_Pro } from "next/font/google";
import { Toaster } from "@/components/ui/Toast";
import { ConfirmHost } from "@/components/ui/Modal";
import "./globals.css";

const font = Be_Vietnam_Pro({
  variable: "--font-be-vietnam",
  subsets: ["vietnamese", "latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Real Estate Builder", template: "%s · Real Estate Builder" },
  description: "Thiết kế mặt bằng nhà nhiều tầng từ ảnh sổ đỏ, xem trước 3D — chạy hoàn toàn trên trình duyệt.",
  applicationName: "Real Estate Builder",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi" className={`${font.variable} h-full antialiased`}>
      <body className="h-full">
        {children}
        <Toaster />
        <ConfirmHost />
      </body>
    </html>
  );
}
