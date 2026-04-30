// POST /api/notify/test
//
// Fires a test message to a Discord webhook OR Telegram bot. URL/token are
// passed in the request body — NOT stored server-side. The point of the
// route is just to bypass browser CORS (Discord & Telegram both 4xx
// browser-origin requests for security).
//
// Production alerts use ENV-driven channels in apps/alerts/notifier.ts —
// this route is purely a UI test helper.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface DiscordTestBody {
  channel: "discord";
  webhook: string;
  /** Optional sample title. Defaults to "Pulse Terminal · TEST". */
  title?: string;
  /** Optional sample body. */
  body?: string;
}
interface TelegramTestBody {
  channel: "telegram";
  token: string;
  chatId: string;
  title?: string;
  body?: string;
}
interface NtfyTestBody {
  channel: "ntfy";
  topic: string;
  title?: string;
  body?: string;
}
type TestBody = DiscordTestBody | TelegramTestBody | NtfyTestBody;

function isDiscordWebhook(url: string): boolean {
  try {
    const u = new URL(url);
    return (u.protocol === "https:" || u.protocol === "http:")
      && /^(canary\.|ptb\.)?discord(app)?\.com$/i.test(u.hostname)
      && u.pathname.startsWith("/api/webhooks/");
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  let body: TestBody;
  try {
    body = (await req.json()) as TestBody;
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }

  const title = body.title ?? "Pulse Terminal · TEST";
  const text = body.body ?? "If you can read this, your webhook is wired up correctly. ✅";

  try {
    if (body.channel === "discord") {
      if (!isDiscordWebhook(body.webhook)) {
        return Response.json({ ok: false, error: "Not a valid Discord webhook URL" }, { status: 400 });
      }
      const res = await fetch(body.webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "Pulse Terminal",
          embeds: [
            {
              title,
              description: text,
              color: 0x22d3ee,
              footer: { text: "test message · this is a one-shot" },
              timestamp: new Date().toISOString(),
            },
          ],
        }),
      });
      if (!res.ok) {
        return Response.json({ ok: false, error: `Discord HTTP ${res.status}` }, { status: 502 });
      }
      return Response.json({ ok: true, channel: "discord" });
    }

    if (body.channel === "telegram") {
      if (!body.token || !body.chatId) {
        return Response.json({ ok: false, error: "token + chatId required" }, { status: 400 });
      }
      const escaped = `*${escapeMd(title)}*\n${escapeMd(text)}`;
      const res = await fetch(
        `https://api.telegram.org/bot${encodeURIComponent(body.token)}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: body.chatId,
            text: escaped,
            parse_mode: "Markdown",
            disable_web_page_preview: true,
          }),
        },
      );
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string };
      if (!res.ok || json.ok === false) {
        return Response.json(
          { ok: false, error: json.description ?? `Telegram HTTP ${res.status}` },
          { status: 502 },
        );
      }
      return Response.json({ ok: true, channel: "telegram" });
    }

    if (body.channel === "ntfy") {
      if (!body.topic) return Response.json({ ok: false, error: "topic required" }, { status: 400 });
      const url = body.topic.startsWith("http")
        ? body.topic
        : `https://ntfy.sh/${body.topic}`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Title: title,
          Priority: "3",
          Tags: "bell,white_check_mark",
        },
        body: text,
      });
      if (!res.ok) return Response.json({ ok: false, error: `ntfy HTTP ${res.status}` }, { status: 502 });
      return Response.json({ ok: true, channel: "ntfy" });
    }

    return Response.json({ ok: false, error: "unknown channel" }, { status: 400 });
  } catch (err) {
    return Response.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}

function escapeMd(text: string): string {
  return text.replace(/([_*\[\]`])/g, "\\$1");
}
