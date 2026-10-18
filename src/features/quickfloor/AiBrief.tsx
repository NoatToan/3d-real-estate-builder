"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Mic, MicOff, Sparkles } from "lucide-react";
import { Box, Col, Row, Text, TextFaint, TextMuted } from "@/components/ui/BasePrimitives";
import { Button } from "@/components/ui/Button";
import { AI_PROMPT_MAX, type AiLayout, type AiLayoutContext } from "@/domain/aiLayout";

const EXAMPLES = [
  "Nhà cho gia đình 4 người: để 1 ô tô và 2 xe máy, phòng khách, bếp ăn rộng phía sau",
  "Tầng ngủ: phòng master phía trước có tủ đồ lớn, phòng con phía sau, 1 WC chung",
  "Văn phòng cho thuê khoảng 12 chỗ ngồi, có phòng họp nhỏ và WC",
  "Tầng trên cùng: phòng thờ phía trước, sân giặt phơi phía sau, không cần cầu thang",
];

/** Minimal Web Speech API surface (Chrome/Edge/Safari prefix it; not in the TS DOM lib). */
interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
}
type RecognitionCtor = new () => Recognition;

function speechCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Brief box: type or speak what the floor should be, Claude proposes the bands. */
export function AiBrief({ context, onLayout }: { context: AiLayoutContext; onLayout: (l: AiLayout) => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AiLayout | null>(null);
  const [listening, setListening] = useState(false);
  // The dialog is client-only (loaded with ssr: false), so the browser API can be read directly.
  const [canSpeak] = useState(() => speechCtor() !== null);
  const rec = useRef<Recognition | null>(null);

  useEffect(() => () => rec.current?.stop(), []);

  const toggleMic = () => {
    if (listening) return rec.current?.stop();
    const Ctor = speechCtor();
    if (!Ctor) return;
    const r = new Ctor();
    r.lang = "vi-VN";
    r.interimResults = false;
    r.continuous = true;
    const base = text ? `${text.trim()} ` : "";
    let heard = "";
    r.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) heard += e.results[i][0].transcript;
      setText((base + heard).slice(0, AI_PROMPT_MAX));
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    rec.current = r;
    r.start();
    setListening(true);
  };

  const run = async () => {
    rec.current?.stop();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/ai-layout/", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: text, context }),
      });
      const data = (await res.json().catch(() => ({}))) as { layout?: AiLayout; error?: string };
      if (!res.ok || !data.layout) throw new Error(data.error ?? `Lỗi ${res.status}`);
      setResult(data.layout);
      onLayout(data.layout);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không gọi được AI.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Col className="gap-2 rounded-lg border border-brand-200 bg-brand-50/60 p-3">
      <Row className="items-center gap-2">
        <Sparkles size={16} className="text-brand-600" />
        <Text className="text-sm font-semibold text-ink">Mô tả bằng lời, AI thiết kế giúp</Text>
      </Row>
      <Box className="relative">
        <textarea
          aria-label="Mô tả mặt sàn mong muốn"
          value={text}
          maxLength={AI_PROMPT_MAX}
          rows={3}
          placeholder="Ví dụ: tầng trệt để 1 ô tô, có phòng khách nhìn ra đường, bếp và bàn ăn 6 người phía sau…"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && text.trim().length >= 3 && !busy) void run();
          }}
          className="w-full resize-y rounded-md border border-line bg-surface px-2 py-1.5 pr-10 text-sm text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
        />
        {canSpeak && (
          <button
            type="button"
            onClick={toggleMic}
            aria-pressed={listening}
            aria-label={listening ? "Dừng ghi âm" : "Nói để nhập mô tả"}
            title={listening ? "Dừng ghi âm" : "Nói để nhập mô tả (tiếng Việt)"}
            className={`absolute right-1.5 top-1.5 inline-flex h-7 w-7 items-center justify-center rounded-full ${listening ? "animate-pulse bg-danger-600 text-white" : "text-ink-muted hover:bg-surface-muted"}`}
          >
            {listening ? <MicOff size={15} /> : <Mic size={15} />}
          </button>
        )}
      </Box>
      <Row className="flex-wrap gap-1">
        {EXAMPLES.map((ex) => (
          <button key={ex} type="button" onClick={() => setText(ex)} className="rounded-full border border-line bg-surface px-2 py-0.5 text-left text-xs text-ink-muted hover:bg-surface-muted">
            {ex}
          </button>
        ))}
      </Row>
      <Row className="items-center gap-2">
        <Button size="sm" variant="primary" icon={busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} disabled={busy || text.trim().length < 3} onClick={() => void run()}>
          {busy ? "AI đang thiết kế…" : "Thiết kế bằng AI"}
        </Button>
        <TextFaint className="text-xs">{busy ? "Thường mất 15–60 giây." : "Kết quả hiện ở danh sách phòng và hình xem trước bên dưới, bạn vẫn sửa được trước khi dựng."}</TextFaint>
      </Row>
      {error && (
        <Text as="p" className="rounded-md bg-danger-50 px-2 py-1.5 text-xs text-danger-700">
          {error}
        </Text>
      )}
      {result && !busy && (
        <Col className="gap-1 rounded-md bg-surface px-2 py-1.5">
          <Text as="p" className="text-xs text-ink">
            {result.summary}
          </Text>
          {result.tips.length > 0 && (
            <ul className="list-disc pl-4 text-xs text-ink-muted">
              {result.tips.slice(0, 4).map((t) => (
                <li key={t}>
                  <TextMuted>{t}</TextMuted>
                </li>
              ))}
            </ul>
          )}
        </Col>
      )}
    </Col>
  );
}
