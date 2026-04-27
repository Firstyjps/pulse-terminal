import Anthropic from "@anthropic-ai/sdk";
import { summarizeSnapshot, type FundflowSnapshot } from "@pulse/sources";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SYSTEM_PROMPT = `คุณคือ Senior Crypto Market Analyst เชี่ยวชาญด้าน Fund Flow Analysis, On-chain Analytics และ Derivatives Market Structure วิเคราะห์ตลาดคริปโตให้กับเทรดเดอร์มืออาชีพ

หลักการวิเคราะห์:
- Stablecoin Mcap = "dry powder" — เพิ่มขึ้น = เงินรอเข้า, ลดลง = เงินไหลออก
- Spot ETF Flows = institutional sentiment
- OI ↑ พร้อมราคา ↑ = momentum จริง / OI ↑ พร้อมราคา ↓ = leverage long trapped
- Funding > 0.05% = overheated long / < -0.02% = overheated short
- DEX Volume = retail / altcoin activity
- TVL = capital deployed in DeFi

รูปแบบการตอบ:
- ใช้ภาษาไทยเป็นหลัก (ศัพท์เทคนิคอังกฤษได้)
- Markdown headers, bullet points, tables
- หาความเชื่อมโยง / divergence ระหว่าง signals
- ปิดด้วย "Key Levels to Watch" และ "What Would Change My View"
- ไม่ใช่ financial advice — ให้เป็น scenarios + probability
`;

interface AnalyzeRequest {
  snapshot: FundflowSnapshot;
  question?: string;
  mode?: "overview" | "deep" | "scenario";
}

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "ANTHROPIC_API_KEY missing — set in .env.local then restart" },
      { status: 500 },
    );
  }

  const body = (await req.json()) as AnalyzeRequest;
  const mode = body.mode ?? "overview";
  const dataSummary = summarizeSnapshot(body.snapshot, mode);

  const userPrompt =
    body.question?.trim() ||
    (mode === "overview"
      ? "วิเคราะห์ภาพรวม Fund Flow ขณะนี้ ระบุ signals สำคัญ confluence และ scenario 1-2 สัปดาห์"
      : mode === "deep"
        ? "วิเคราะห์เจาะลึก market structure: leverage, ETF trends, stablecoin dynamics, DeFi rotation — ตลาดอยู่ phase ไหน, อะไร mispriced"
        : "สร้าง 3 scenarios (Bull/Base/Bear) สำหรับ 30 วัน — probability, triggers, levels, invalidation");

  const client = new Anthropic({ apiKey });
  const stream = client.messages.stream({
    model: "claude-opus-4-7",
    max_tokens: 16000,
    thinking: { type: "adaptive", display: "summarized" },
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: dataSummary },
          { type: "text", text: `\n---\n\n**คำถาม:** ${userPrompt}` },
        ],
      },
    ],
  });

  const encoder = new TextEncoder();
  const responseStream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (event.type === "content_block_delta") {
            if (event.delta.type === "text_delta") {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: "text", text: event.delta.text })}\n\n`),
              );
            } else if (event.delta.type === "thinking_delta") {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: "thinking", text: event.delta.thinking })}\n\n`),
              );
            }
          } else if (event.type === "message_delta" && event.usage) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "usage", usage: event.usage })}\n\n`),
            );
          }
        }
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`));
        controller.close();
      } catch (err) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "error", error: (err as Error).message })}\n\n`),
        );
        controller.close();
      }
    },
  });

  return new Response(responseStream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
