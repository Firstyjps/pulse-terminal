// Telegram Bot API wrapper — sendMessage, sendPhoto, callback handler stub.
// Used by the morning brief cron. v2 adds inline keyboards + photo attachment.
// API ref: https://core.telegram.org/bots/api

export interface InlineKeyboardButton {
  text: string;
  url?: string;
  callback_data?: string;
}

export interface InlineKeyboard {
  inline_keyboard: InlineKeyboardButton[][];
}

export interface SendMessageOpts {
  replyMarkup?: InlineKeyboard;
}

export interface TelegramResult {
  ok: boolean;
  /** Truncated to 200 chars on failure. */
  error?: string;
  messageId?: number;
}

interface TelegramApiResponse {
  ok: boolean;
  description?: string;
  result?: { message_id?: number };
}

const SEND_TIMEOUT_MS = 10_000;

type FetchLike = typeof fetch;

// ─────────────────────────────────────────────────────────────────────────
// sendMessage
// ─────────────────────────────────────────────────────────────────────────

export async function sendTelegram(
  token: string,
  chatId: string,
  text: string,
  opts: SendMessageOpts = {},
  fetchImpl: FetchLike = fetch,
): Promise<TelegramResult> {
  if (!token) return { ok: false, error: "missing bot token" };
  if (!chatId) return { ok: false, error: "missing chat id" };

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), SEND_TIMEOUT_MS);

  const body: Record<string, unknown> = {
    chat_id: chatId,
    text,
    parse_mode: "MarkdownV2",
    disable_web_page_preview: true,
  };
  if (opts.replyMarkup) body.reply_markup = opts.replyMarkup;

  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    return await readResult(res);
  } catch (err) {
    return { ok: false, error: (err as Error).message.slice(0, 200) };
  } finally {
    clearTimeout(t);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// sendPhoto — multipart upload, used after sendMessage to attach the chart
// ─────────────────────────────────────────────────────────────────────────

export async function sendTelegramPhoto(
  token: string,
  chatId: string,
  png: Uint8Array,
  caption: string | undefined,
  fetchImpl: FetchLike = fetch,
): Promise<TelegramResult> {
  if (!token) return { ok: false, error: "missing bot token" };
  if (!chatId) return { ok: false, error: "missing chat id" };

  const url = `https://api.telegram.org/bot${token}/sendPhoto`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), SEND_TIMEOUT_MS * 2); // photos take longer

  const form = new FormData();
  form.append("chat_id", chatId);
  if (caption) {
    form.append("caption", caption);
    form.append("parse_mode", "MarkdownV2");
  }
  // Buffer extends Uint8Array and satisfies BlobPart (Uint8Array<ArrayBufferLike>
  // doesn't unify directly under TS strict).
  form.append(
    "photo",
    new Blob([Buffer.from(png)], { type: "image/png" }),
    "btc-etf.png",
  );

  try {
    const res = await fetchImpl(url, {
      method: "POST",
      body: form,
      signal: ctrl.signal,
    });
    return await readResult(res);
  } catch (err) {
    return { ok: false, error: (err as Error).message.slice(0, 200) };
  } finally {
    clearTimeout(t);
  }
}

async function readResult(res: Response): Promise<TelegramResult> {
  const body = (await res.json().catch(() => null)) as TelegramApiResponse | null;
  if (!res.ok || !body?.ok) {
    const desc = body?.description ?? `HTTP ${res.status}`;
    return { ok: false, error: desc.slice(0, 200) };
  }
  return { ok: true, messageId: body.result?.message_id };
}

// ─────────────────────────────────────────────────────────────────────────
// Inline keyboard helper — keeps the morning brief defaults in one place
// ─────────────────────────────────────────────────────────────────────────

export function buildMorningBriefKeyboard(dashboardUrl: string): InlineKeyboard {
  return {
    inline_keyboard: [
      [{ text: "📊 Open Dashboard", url: dashboardUrl }],
      [
        { text: "🔇 Snooze tomorrow", callback_data: "snooze_1" },
        { text: "📈 BTC chart", callback_data: "chart_btc" },
      ],
    ],
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Callback handler stub — logs only in v2. Wire to real action in v3.
//
// To hook this up, add a webhook endpoint (e.g. apps/web /api/telegram-callback)
// that POSTs the callback_query body to handleTelegramCallback().
// ─────────────────────────────────────────────────────────────────────────

export interface TelegramCallback {
  callback_data: string;
  chat_id?: string;
  user_id?: number;
}

export function handleTelegramCallback(cb: TelegramCallback): void {
  // v2: log-only. Real dispatchers (snooze persistence, chart re-render) land in v3.
  console.log(
    `[morning-brief] callback received: ${cb.callback_data} (chat=${cb.chat_id ?? "?"} user=${cb.user_id ?? "?"})`,
  );
}
