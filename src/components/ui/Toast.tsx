"use client";

import { create } from "zustand";
import { CheckCircle2, Info, TriangleAlert, X } from "lucide-react";
import { Col, Row, Text } from "./BasePrimitives";

type Kind = "success" | "error" | "info";
interface ToastItem {
  id: number;
  kind: Kind;
  message: string;
}

let seq = 0;
const useToasts = create<{ items: ToastItem[]; push: (k: Kind, m: string) => void; remove: (id: number) => void }>((set, get) => ({
  items: [],
  push: (kind, message) => {
    const id = ++seq;
    set({ items: [...get().items.slice(-4), { id, kind, message }] });
    setTimeout(() => get().remove(id), kind === "error" ? 7000 : 3500);
  },
  remove: (id) => set({ items: get().items.filter((t) => t.id !== id) }),
}));

export const toast = {
  success: (m: string) => useToasts.getState().push("success", m),
  error: (m: string) => useToasts.getState().push("error", m),
  info: (m: string) => useToasts.getState().push("info", m),
};

const STYLES: Record<Kind, string> = {
  success: "border-success-300 bg-success-50 text-success-800",
  error: "border-danger-300 bg-danger-50 text-danger-800",
  info: "border-brand-200 bg-brand-50 text-brand-800",
};

export function Toaster() {
  const { items, remove } = useToasts();
  return (
    <Col aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-[60] w-80 gap-2">
      {items.map((t) => (
        <Row key={t.id} role={t.kind === "error" ? "alert" : "status"} className={`pointer-events-auto items-start gap-2 rounded-lg border px-3 py-2 text-sm shadow-lg ${STYLES[t.kind]}`}>
          {t.kind === "success" ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> : t.kind === "error" ? <TriangleAlert size={16} className="mt-0.5 shrink-0" /> : <Info size={16} className="mt-0.5 shrink-0" />}
          <Text className="flex-1">{t.message}</Text>
          <button type="button" aria-label="Đóng thông báo" onClick={() => remove(t.id)} className="opacity-60 hover:opacity-100">
            <X size={14} />
          </button>
        </Row>
      ))}
    </Col>
  );
}
