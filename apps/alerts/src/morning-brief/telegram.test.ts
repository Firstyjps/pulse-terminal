import { describe, expect, it, vi } from "vitest";
import {
  buildMorningBriefKeyboard,
  handleTelegramCallback,
  sendTelegram,
  sendTelegramPhoto,
} from "./telegram.js";

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe("sendTelegram", () => {
  it("posts to bot API URL with MarkdownV2 body shape", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      jsonResponse(200, { ok: true, result: { message_id: 42 } }),
    );
    const r = await sendTelegram("123:abc", "987", "*hello*", {}, fetchSpy);

    expect(r.ok).toBe(true);
    expect(r.messageId).toBe(42);

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://api.telegram.org/bot123:abc/sendMessage");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      chat_id: "987",
      text: "*hello*",
      parse_mode: "MarkdownV2",
      disable_web_page_preview: true,
    });
    expect(body.reply_markup).toBeUndefined();
  });

  it("attaches reply_markup when keyboard provided", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      jsonResponse(200, { ok: true, result: { message_id: 1 } }),
    );
    const kb = buildMorningBriefKeyboard("https://example.test/morning");
    await sendTelegram("t", "c", "x", { replyMarkup: kb }, fetchSpy);

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body as string);
    expect(body.reply_markup).toEqual(kb);
    // 3 buttons: Open Dashboard (url) + Snooze + Chart (callback)
    expect(body.reply_markup.inline_keyboard).toHaveLength(2);
    expect(body.reply_markup.inline_keyboard[0][0].url).toBe("https://example.test/morning");
    expect(body.reply_markup.inline_keyboard[1][0].callback_data).toBe("snooze_1");
    expect(body.reply_markup.inline_keyboard[1][1].callback_data).toBe("chart_btc");
  });

  it("returns ok=false with description on API rejection", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      jsonResponse(400, { ok: false, description: "Bad Request: chat not found" }),
    );
    const r = await sendTelegram("t", "c", "x", {}, fetchSpy);
    expect(r.ok).toBe(false);
    expect(r.error).toBe("Bad Request: chat not found");
  });

  it("short-circuits on empty token / chat", async () => {
    const fetchSpy = vi.fn();
    expect((await sendTelegram("", "c", "x", {}, fetchSpy)).error).toBe("missing bot token");
    expect((await sendTelegram("t", "", "x", {}, fetchSpy)).error).toBe("missing chat id");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("network error returns ok=false", async () => {
    const fetchSpy = vi.fn().mockRejectedValue(new Error("ENOTFOUND"));
    const r = await sendTelegram("t", "c", "x", {}, fetchSpy);
    expect(r.ok).toBe(false);
    expect(r.error).toContain("ENOTFOUND");
  });
});

describe("sendTelegramPhoto", () => {
  it("posts multipart/form-data to /sendPhoto with chat_id + photo blob", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      jsonResponse(200, { ok: true, result: { message_id: 99 } }),
    );
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]); // PNG magic
    const r = await sendTelegramPhoto("t", "c", png, undefined, fetchSpy);

    expect(r.ok).toBe(true);
    expect(r.messageId).toBe(99);

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://api.telegram.org/bott/sendPhoto");
    expect(init.method).toBe("POST");
    expect(init.body).toBeInstanceOf(FormData);
    const fd = init.body as FormData;
    expect(fd.get("chat_id")).toBe("c");
    expect(fd.get("photo")).toBeInstanceOf(Blob);
  });

  it("includes caption + parse_mode when caption passed", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true, result: {} }));
    const png = new Uint8Array([1, 2, 3]);
    await sendTelegramPhoto("t", "c", png, "BTC ETF *30d*", fetchSpy);

    const fd = fetchSpy.mock.calls[0][1].body as FormData;
    expect(fd.get("caption")).toBe("BTC ETF *30d*");
    expect(fd.get("parse_mode")).toBe("MarkdownV2");
  });

  it("returns ok=false on API rejection", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(jsonResponse(400, { ok: false, description: "PHOTO_INVALID" }));
    const r = await sendTelegramPhoto("t", "c", new Uint8Array([0]), undefined, fetchSpy);
    expect(r.ok).toBe(false);
    expect(r.error).toBe("PHOTO_INVALID");
  });
});

describe("buildMorningBriefKeyboard", () => {
  it("emits 3 buttons in 2 rows: Dashboard URL + Snooze + Chart callbacks", () => {
    const kb = buildMorningBriefKeyboard("https://my.dash/x");
    expect(kb.inline_keyboard).toHaveLength(2);
    expect(kb.inline_keyboard[0]).toEqual([{ text: "📊 Open Dashboard", url: "https://my.dash/x" }]);
    expect(kb.inline_keyboard[1]).toEqual([
      { text: "🔇 Snooze tomorrow", callback_data: "snooze_1" },
      { text: "📈 BTC chart", callback_data: "chart_btc" },
    ]);
  });
});

describe("handleTelegramCallback (stub)", () => {
  it("logs callback_data without throwing", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    handleTelegramCallback({ callback_data: "snooze_1", chat_id: "123", user_id: 456 });
    expect(spy).toHaveBeenCalled();
    expect(spy.mock.calls[0][0]).toContain("snooze_1");
    spy.mockRestore();
  });
});
