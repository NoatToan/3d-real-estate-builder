"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { create } from "zustand";
import { X } from "lucide-react";
import { Button } from "./Button";
import { Box, Col, Row, TextMuted } from "./BasePrimitives";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}

const SIZES = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-3xl", xl: "max-w-6xl" };

export function Modal({ open, onClose, title, children, footer, size = "md" }: ModalProps) {
  const panel = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const first = panel.current?.querySelector<HTMLElement>("input, select, textarea, button:not([data-close])");
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
      }
      if (e.key === "Tab" && panel.current) {
        const items = panel.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex='-1'])");
        if (!items.length) return;
        const firstEl = items[0];
        const lastEl = items[items.length - 1];
        if (e.shiftKey && document.activeElement === firstEl) {
          e.preventDefault();
          lastEl.focus();
        } else if (!e.shiftKey && document.activeElement === lastEl) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      prev?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  return (
    <Row className="fixed inset-0 z-50 items-center justify-center bg-overlay p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <Col
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`max-h-[92vh] w-full ${SIZES[size]} overflow-hidden rounded-xl bg-surface shadow-2xl`}
      >
        <Row className="items-center justify-between border-b border-line px-5 py-3">
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          <button data-close type="button" aria-label="Đóng" onClick={onClose} className="rounded p-1 text-ink-muted hover:bg-surface-muted">
            <X size={18} />
          </button>
        </Row>
        <Box className="min-h-0 flex-1 overflow-auto px-5 py-4">{children}</Box>
        {footer && <Row className="justify-end gap-2 border-t border-line px-5 py-3">{footer}</Row>}
      </Col>
    </Row>
  );
}

interface ConfirmRequest {
  title: string;
  message: ReactNode;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  resolve: (ok: boolean) => void;
}

const useConfirmStore = create<{ req: ConfirmRequest | null; set: (r: ConfirmRequest | null) => void }>((set) => ({
  req: null,
  set: (req) => set({ req }),
}));

/** Promise-based confirmation dialog. */
export function confirmDialog(opts: Omit<ConfirmRequest, "resolve">): Promise<boolean> {
  return new Promise((resolve) => useConfirmStore.getState().set({ ...opts, resolve }));
}

export function ConfirmHost() {
  const { req, set } = useConfirmStore();
  const close = (ok: boolean) => {
    req?.resolve(ok);
    set(null);
  };
  return (
    <Modal
      open={!!req}
      onClose={() => close(false)}
      title={req?.title ?? ""}
      size="sm"
      footer={
        <>
          <Button onClick={() => close(false)}>{req?.cancelText ?? "Huỷ"}</Button>
          <Button variant={req?.danger ? "danger" : "primary"} onClick={() => close(true)}>
            {req?.confirmText ?? "Đồng ý"}
          </Button>
        </>
      }
    >
      <TextMuted as="p" className="text-sm">
        {req?.message}
      </TextMuted>
    </Modal>
  );
}
