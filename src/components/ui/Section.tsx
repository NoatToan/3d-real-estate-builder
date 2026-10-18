"use client";

import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Box, Row } from "./BasePrimitives";

export function Section({
  title,
  open,
  onToggle,
  actions,
  children,
  badge,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  actions?: ReactNode;
  children: ReactNode;
  badge?: ReactNode;
}) {
  return (
    <section className="border-b border-line">
      <Row className="items-center gap-1 px-3 py-2">
        <button type="button" aria-expanded={open} onClick={onToggle} className="flex flex-1 items-center gap-1.5 text-left text-xs font-semibold uppercase tracking-wide text-ink-muted hover:text-ink">
          <ChevronDown size={14} className={`transition-transform ${open ? "" : "-rotate-90"}`} />
          {title}
          {badge}
        </button>
        {actions}
      </Row>
      {open && <Box className="px-3 pb-3">{children}</Box>}
    </section>
  );
}
