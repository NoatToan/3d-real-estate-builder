"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FullScreenMessage } from "./FullScreenMessage";

// The editor relies on canvas, WebGL and IndexedDB — browser only.
const EditorApp = dynamic(() => import("./EditorApp").then((m) => m.EditorApp), {
  ssr: false,
  loading: () => <FullScreenMessage>Đang tải trình thiết kế…</FullScreenMessage>,
});

export function EditorRoute() {
  const params = useSearchParams();
  const id = params.get("id");
  if (!id) {
    return (
      <FullScreenMessage
        action={
          <Link href="/" className="text-sm font-medium text-brand-600 hover:underline">
            Về danh sách dự án
          </Link>
        }
      >
        Thiếu mã dự án trong đường dẫn.
      </FullScreenMessage>
    );
  }
  return <EditorApp key={id} projectId={id} startWithLot={params.get("lot") === "1"} />;
}
