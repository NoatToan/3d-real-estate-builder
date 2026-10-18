import type { ReactNode } from "react";
import { Col, TextMuted } from "@/components/ui/BasePrimitives";

export function FullScreenMessage({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <Col className="h-screen items-center justify-center gap-4 bg-canvas p-6 text-center">
      <TextMuted as="p" className="max-w-md text-sm">
        {children}
      </TextMuted>
      {action}
    </Col>
  );
}
