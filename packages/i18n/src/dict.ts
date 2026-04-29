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
  "nav.flow_short": { th: "กระแส", en: "FLOW" },
  "nav.derivatives": { th: "ตราสารอนุพันธ์", en: "DERIVATIVES" },
  "nav.deriv_short": { th: "อนุพันธ์", en: "DERIV" },
  "nav.options": { th: "ออปชัน", en: "OPTIONS" },
  "nav.backtest": { th: "ทดสอบย้อนหลัง", en: "BACKTEST" },
  "nav.settings": { th: "ตั้งค่า", en: "SETTINGS" },
  "nav.bybit_apr": { th: "Bybit APR", en: "BYBIT APR" },
  "nav.analyst": { th: "AI วิเคราะห์", en: "AI ANALYST" },

  // Nav section headers
  "nav.intel": { th: "อินเทล", en: "INTEL" },
  "nav.trading": { th: "เทรด", en: "TRADING" },
  "nav.system": { th: "ระบบ", en: "SYSTEM" },

  // Status block (left rail)
  "status.title": { th: "สถานะ", en: "STATUS" },
  "status.alerts": { th: "การแจ้งเตือน", en: "ALERTS" },
  "status.streams": { th: "สตรีม", en: "STREAMS" },
  "status.uplink": { th: "การเชื่อมต่อ", en: "UPLINK" },
  "status.armed": { th: "พร้อม", en: "ARMED" },
  "status.socket_live": { th: "Socket สด", en: "SOCKET LIVE" },
  "status.mcp_ready": { th: "MCP พร้อม", en: "MCP READY" },

  // Shell — top status bar + bottom bar (most labels stay short / English by
  // terminal convention, but feed status + readouts get translated).
  "shell.feed_live": { th: "ฟีดสด", en: "FEED LIVE" },
  "shell.feed_stale": { th: "ฟีดล้าสมัย", en: "FEED STALE" },
  "shell.feed_offline": { th: "ฟีดออฟไลน์", en: "FEED OFFLINE" },
  "shell.feed_connecting": { th: "กำลังเชื่อมต่อ…", en: "CONNECTING…" },
  "shell.ready": { th: "พร้อม", en: "READY" },
  "shell.cmd": { th: "คำสั่ง", en: "CMD" },
  "shell.profile": { th: "โปรไฟล์", en: "PROFILE" },
  "shell.latency": { th: "หน่วงเวลา", en: "LATENCY" },
  "shell.help": { th: "ช่วยเหลือ", en: "Help" },
  "shell.hotkeys": { th: "ทางลัด", en: "Hotkeys" },
  "shell.cmd_palette": { th: "พาเลตคำสั่ง", en: "CMD Palette" },
  "shell.lang": { th: "ภาษา", en: "LANG" },
  "shell.session": { th: "เซสชัน", en: "SESS" },
  "shell.session_us_eu": { th: "US·EU เปิดซ้อน", en: "US·EU OVERLAP" },

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

  // Options — common
  "option.call": { th: "คอล", en: "CALL" },
  "option.put": { th: "พุต", en: "PUT" },
  "option.both": { th: "ทั้งสองฝั่ง", en: "BOTH" },
  "option.strike": { th: "ราคาใช้สิทธิ", en: "STRIKE" },
  "option.expiry": { th: "วันหมดอายุ", en: "EXPIRY" },
  "option.mark": { th: "ราคามาร์ก", en: "MARK" },
  "option.bid": { th: "เสนอซื้อ", en: "BID" },
  "option.ask": { th: "เสนอขาย", en: "ASK" },
  "option.spread": { th: "ส่วนต่างราคา", en: "SPREAD" },
  "option.size": { th: "ขนาด", en: "SIZE" },
  "option.volume": { th: "ปริมาณ", en: "VOLUME" },
  "option.oi": { th: "สถานะเปิด", en: "OPEN INTEREST" },
  "option.iv": { th: "ความผันผวนแฝง", en: "IMPLIED VOLATILITY" },
  "option.iv_short": { th: "IV", en: "IV" },
  "option.atm_iv": { th: "IV ที่ ATM", en: "ATM IV" },
  "option.put_call_ratio": { th: "อัตราพุต/คอล", en: "PUT/CALL RATIO" },
  "option.total_oi": { th: "OI รวม", en: "TOTAL OI" },
  "option.total_volume": { th: "ปริมาณรวม", en: "TOTAL VOLUME" },
  "option.exchange": { th: "เอ็กซ์เชนจ์", en: "EXCHANGE" },
  "option.asset": { th: "สินทรัพย์", en: "ASSET" },

  // Options — tabs
  "option.tab.best": { th: "ดีลที่ดีที่สุด", en: "BEST DEALS" },
  "option.tab.iv": { th: "เส้นโค้ง IV", en: "IV CURVE" },
  "option.tab.oi": { th: "OI ตามสไตรค์", en: "OI BY STRIKE" },
  "option.tab.chain": { th: "ตารางออปชัน", en: "OPTION CHAIN" },
  "option.tab.arbitrage": { th: "อาร์บิเทรจ", en: "ARBITRAGE" },
  "option.tab.position": { th: "สร้างพอร์ต", en: "POSITION BUILDER" },
  "option.tab.greeks": { th: "Greeks", en: "GREEKS" },

  // Options — Greeks
  "greeks.delta": { th: "เดลต้า", en: "DELTA" },
  "greeks.gamma": { th: "แกมม่า", en: "GAMMA" },
  "greeks.theta": { th: "ทีต้า", en: "THETA" },
  "greeks.vega": { th: "เวก้า", en: "VEGA" },
  "greeks.rho": { th: "โร", en: "RHO" },

  // Options — arbitrage
  "arb.buy_exchange": { th: "ซื้อที่", en: "BUY @" },
  "arb.sell_exchange": { th: "ขายที่", en: "SELL @" },
  "arb.spread_pct": { th: "ส่วนต่าง %", en: "SPREAD %" },
  "arb.opportunity": { th: "โอกาสอาร์บิเทรจ", en: "OPPORTUNITY" },
  "arb.no_opportunity": { th: "ยังไม่มีโอกาสตอนนี้", en: "No opportunities right now" },

  // Options — position builder
  "position.leg": { th: "ขา", en: "LEG" },
  "position.add_leg": { th: "เพิ่มขา", en: "ADD LEG" },
  "position.buy": { th: "ซื้อ", en: "BUY" },
  "position.sell": { th: "ขาย", en: "SELL" },
  "position.quantity": { th: "จำนวน", en: "QUANTITY" },
  "position.premium": { th: "พรีเมียม", en: "PREMIUM" },
  "position.payoff": { th: "ผลตอบแทน", en: "PAYOFF" },
  "position.breakeven": { th: "จุดคุ้มทุน", en: "BREAKEVEN" },
  "position.max_profit": { th: "กำไรสูงสุด", en: "MAX PROFIT" },
  "position.max_loss": { th: "ขาดทุนสูงสุด", en: "MAX LOSS" },

  // Bybit — Dual Asset / APR tracker
  "bybit.dual_asset": { th: "Dual Asset", en: "DUAL ASSET" },
  "bybit.apr": { th: "APR", en: "APR" },
  "bybit.apr_pct": { th: "APR (%)", en: "APR %" },
  "bybit.target_price": { th: "ราคาเป้าหมาย", en: "TARGET PRICE" },
  "bybit.index_price": { th: "ราคาดัชนี", en: "INDEX PRICE" },
  "bybit.duration": { th: "ระยะเวลา", en: "DURATION" },
  "bybit.settlement": { th: "วันชำระ", en: "SETTLEMENT" },
  "bybit.direction": { th: "ทิศทาง", en: "DIRECTION" },
  "bybit.buy_low": { th: "ซื้อราคาต่ำ", en: "BUY LOW" },
  "bybit.sell_high": { th: "ขายราคาสูง", en: "SELL HIGH" },
  "bybit.coin_pair": { th: "คู่เหรียญ", en: "COIN PAIR" },
  "bybit.vip_only": { th: "เฉพาะ VIP", en: "VIP ONLY" },
  "bybit.hour_ict": { th: "ชั่วโมง (ICT)", en: "HOUR (ICT)" },
  "bybit.best_hour": { th: "ชั่วโมงที่ APR สูงสุด", en: "BEST HOUR" },
  "bybit.worst_hour": { th: "ชั่วโมงที่ APR ต่ำสุด", en: "WORST HOUR" },
  "bybit.avg_apr": { th: "APR เฉลี่ย", en: "AVG APR" },
  "bybit.max_apr": { th: "APR สูงสุด", en: "MAX APR" },
  "bybit.min_apr": { th: "APR ต่ำสุด", en: "MIN APR" },
  "bybit.samples": { th: "จำนวนตัวอย่าง", en: "SAMPLES" },
  "bybit.snapshot": { th: "สแน็ปช็อต", en: "SNAPSHOT" },
  "bybit.daily_summary": { th: "สรุปรายวัน", en: "DAILY SUMMARY" },
  "bybit.hourly_avg": { th: "ค่าเฉลี่ยรายชั่วโมง", en: "HOURLY AVERAGE" },

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
