import type { Metadata } from "next";
import { Suspense } from "react";
import { EditorRoute } from "@/features/editor/EditorRoute";
import { FullScreenMessage } from "@/features/editor/FullScreenMessage";

export const metadata: Metadata = { title: "Thiết kế" };

export default function EditorPage() {
  return (
    <Suspense fallback={<FullScreenMessage>Đang tải trình thiết kế…</FullScreenMessage>}>
      <EditorRoute />
    </Suspense>
  );
}
