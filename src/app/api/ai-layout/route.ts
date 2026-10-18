import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { aiLayoutSchema, aiRequestSchema, aiSystemPrompt, aiUserPrompt } from "@/domain/aiLayout";

// Claude may think for a while on a full floor brief.
export const maxDuration = 120;

const MODEL = process.env.AI_LAYOUT_MODEL || "claude-opus-5";
const SYSTEM = aiSystemPrompt();

// Best-effort per-instance throttle: the endpoint spends API credit on every call.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 6;
const hits = new Map<string, number[]>();
function throttled(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > MAX_PER_WINDOW;
}

const fail = (status: number, error: string) => Response.json({ error }, { status });

export async function POST(request: Request) {
  if (!process.env.ANTHROPIC_API_KEY) return fail(503, "Tính năng AI chưa được bật: máy chủ chưa có ANTHROPIC_API_KEY.");
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (throttled(ip)) return fail(429, "Bạn gửi yêu cầu hơi nhanh, hãy thử lại sau một phút.");

  const body = aiRequestSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return fail(400, "Yêu cầu không hợp lệ: hãy mô tả mặt sàn (3–2000 ký tự).");
  const { prompt, context } = body.data;

  const client = new Anthropic();
  try {
    const response = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      output_config: { effort: "medium", format: betaZodOutputFormat(aiLayoutSchema) },
      // Retry on the server-defined fallback model if the request is declined.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      cache_control: { type: "ephemeral" },
      system: SYSTEM,
      messages: [{ role: "user", content: aiUserPrompt(prompt, context) }],
    });
    if (response.stop_reason === "refusal") return fail(422, "AI từ chối yêu cầu này, hãy mô tả lại mặt sàn.");
    if (response.stop_reason === "max_tokens" || !response.parsed_output) return fail(502, "AI trả lời chưa trọn vẹn, hãy thử lại.");
    return Response.json({ layout: response.parsed_output });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) return fail(500, "Khoá ANTHROPIC_API_KEY trên máy chủ không hợp lệ.");
    if (err instanceof Anthropic.RateLimitError) return fail(429, "AI đang quá tải, hãy thử lại sau ít phút.");
    if (err instanceof Anthropic.APIError) {
      console.error("ai-layout", err.status, err.message);
      return fail(502, "Không gọi được AI, hãy thử lại.");
    }
    console.error("ai-layout", err);
    return fail(500, "Lỗi máy chủ khi thiết kế bằng AI.");
  }
}
