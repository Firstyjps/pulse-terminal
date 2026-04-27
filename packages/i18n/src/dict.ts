// Bilingual dictionary — Thai (th) + English (en).
// Keys are dot-paths; new keys must include both languages.

export type Locale = "th" | "en";

export interface Entry {
  th: string;
  en: string;
}

export const dict = {
  // Brand
  "brand.title": { th: "PULSE COMMAND", en: "PULSE COMMAND" },
  "brand.subtitle": {
    th: "ศูนย์ข้อมูลตลาดคริปโตเชิงมหภาค",
    en: "Crypto Macro Intelligence Terminal",
  },

  // Top nav tabs
  "nav.overview": { th: "ภาพรวม", en: "OVERVIEW" },
  "nav.markets": { th: "ตลาด", en: "MARKETS" },
  "nav.fundflow": { th: "กระแสเงินทุน", en: "FUNDFLOW" },
  "nav.derivatives": { th: "ตราสารอนุพันธ์", en: "DERIVATIVES" },
  "nav.analyst": { th: "AI วิเคราะห์", en: "AI ANALYST" },

  // Common labels
  "common.loading": { th: "กำลังโหลด…", en: "Loading…" },
  "common.error": { th: "เกิดข้อผิดพลาด", en: "Error" },
  "common.live": { th: "สด", en: "LIVE" },
  "common.last_updated": { th: "อัปเดตล่าสุด", en: "Last updated" },
  "common.source": { th: "แหล่งข้อมูล", en: "Source" },
  "common.show_more": { th: "ดูเพิ่มเติม", en: "Show more" },

  // Market overview
  "market.total_cap": { th: "มูลค่าตลาดรวม", en: "TOTAL MARKET CAP" },
  "market.volume_24h": { th: "ปริมาณซื้อขาย 24 ชม.", en: "24H VOLUME" },
  "market.btc_dominance": { th: "ส่วนแบ่งของ BTC", en: "BTC DOMINANCE" },
  "market.eth_dominance": { th: "ส่วนแบ่งของ ETH", en: "ETH DOMINANCE" },
  "market.fear_greed": { th: "ดัชนีความกลัว/โลภ", en: "FEAR & GREED" },
  "market.active_assets": { th: "เหรียญที่ใช้งาน", en: "ACTIVE ASSETS" },

  // Funding / OI
  "deriv.funding_rate": { th: "อัตราดอกเบี้ย Perp", en: "FUNDING RATE" },
  "deriv.open_interest": { th: "สถานะเปิด (OI)", en: "OPEN INTEREST" },
  "deriv.long_short": { th: "อัตรา Long/Short", en: "LONG/SHORT RATIO" },
  "deriv.exchange": { th: "เอ็กซ์เชนจ์", en: "EXCHANGE" },
  "deriv.symbol": { th: "สัญลักษณ์", en: "SYMBOL" },
  "deriv.next_funding": { th: "Funding ครั้งถัดไป", en: "NEXT FUNDING" },

  // ETF
  "etf.btc_flows": { th: "กระแสเงิน BTC ETF", en: "BTC ETF FLOWS" },
  "etf.eth_flows": { th: "กระแสเงิน ETH ETF", en: "ETH ETF FLOWS" },
  "etf.cumulative": { th: "ยอดสะสม", en: "CUMULATIVE" },
  "etf.last_session": { th: "ล่าสุด", en: "LAST SESSION" },
  "etf.7d_sum": { th: "รวม 7 วัน", en: "7D SUM" },
  "etf.30d_sum": { th: "รวม 30 วัน", en: "30D SUM" },

  // Stablecoins
  "stable.total_supply": { th: "อุปทานรวม Stablecoin", en: "TOTAL STABLECOIN SUPPLY" },
  "stable.usdt": { th: "USDT (Tether)", en: "USDT" },
  "stable.usdc": { th: "USDC (Circle)", en: "USDC" },
  "stable.dai": { th: "DAI (MakerDAO)", en: "DAI" },
  "stable.others": { th: "อื่นๆ", en: "OTHERS" },
  "stable.7d_change": { th: "เปลี่ยนแปลง 7 วัน", en: "7D CHANGE" },
  "stable.30d_change": { th: "เปลี่ยนแปลง 30 วัน", en: "30D CHANGE" },

  // TVL / DEX
  "tvl.total": { th: "TVL รวมทุกเชน", en: "TOTAL TVL" },
  "tvl.by_chain": { th: "TVL ตามเชน", en: "TVL BY CHAIN" },
  "dex.volume_24h": { th: "ปริมาณ DEX 24 ชม.", en: "DEX VOLUME 24H" },
  "dex.leaderboard": { th: "อันดับ DEX", en: "DEX LEADERBOARD" },

  // Charts
  "chart.1h": { th: "1 ชม.", en: "1H" },
  "chart.4h": { th: "4 ชม.", en: "4H" },
  "chart.1d": { th: "1 วัน", en: "1D" },
  "chart.1w": { th: "1 สัปดาห์", en: "1W" },
  "chart.1m": { th: "1 เดือน", en: "1M" },

  // Analyst
  "analyst.signal": { th: "สัญญาณ", en: "SIGNAL" },
  "analyst.bullish": { th: "เป็นบวก", en: "BULLISH" },
  "analyst.bearish": { th: "เป็นลบ", en: "BEARISH" },
  "analyst.neutral": { th: "เป็นกลาง", en: "NEUTRAL" },
  "analyst.confidence": { th: "ความมั่นใจ", en: "CONFIDENCE" },
  "analyst.thesis": { th: "วิทยานิพนธ์", en: "THESIS" },
  "analyst.run": { th: "วิเคราะห์ใหม่", en: "RE-ANALYZE" },

  // Locale toggle
  "locale.toggle": { th: "EN", en: "ไทย" },
} as const satisfies Record<string, Entry>;

export type DictKey = keyof typeof dict;
