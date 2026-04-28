/* CryptoPulse Terminal — main app */
const { useState, useEffect, useMemo, useRef, useCallback } = React;

/* ──────────────────────────────────────────────────────────
   TWEAK DEFAULTS  (host-persisted)
   ────────────────────────────────────────────────────────── */
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "type": "mono"
}/*EDITMODE-END*/;

/* ──────────────────────────────────────────────────────────
   Helpers
   ────────────────────────────────────────────────────────── */
const fmt = {
  usd(n, d = 2) {
    if (n == null || isNaN(n)) return "—";
    const a = Math.abs(n);
    if (a >= 1e12) return "$" + (n / 1e12).toFixed(d) + "T";
    if (a >= 1e9)  return "$" + (n / 1e9).toFixed(d) + "B";
    if (a >= 1e6)  return "$" + (n / 1e6).toFixed(d) + "M";
    if (a >= 1e3)  return "$" + (n / 1e3).toFixed(d) + "K";
    if (a >= 1)    return "$" + n.toFixed(d);
    return "$" + n.toFixed(6);
  },
  num(n, d = 2) {
    if (n == null || isNaN(n)) return "—";
    return n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
  },
  pct(n, d = 2) {
    if (n == null || isNaN(n)) return "—";
    return (n >= 0 ? "+" : "") + n.toFixed(d) + "%";
  },
  compact(n) {
    if (n == null) return "—";
    const a = Math.abs(n);
    if (a >= 1e12) return (n / 1e12).toFixed(2) + "T";
    if (a >= 1e9)  return (n / 1e9).toFixed(2) + "B";
    if (a >= 1e6)  return (n / 1e6).toFixed(2) + "M";
    if (a >= 1e3)  return (n / 1e3).toFixed(2) + "K";
    return n.toFixed(2);
  },
  time(d = new Date()) {
    return d.toISOString().substr(11, 8);
  },
  date(d = new Date()) {
    return d.toISOString().substr(0, 10).replace(/-/g, "·");
  }
};

const seededRand = (seed) => {
  let s = seed | 0;
  return () => {
    s = (s * 1664525 + 1013904223) | 0;
    return ((s >>> 0) % 100000) / 100000;
  };
};

/* ──────────────────────────────────────────────────────────
   Mock fallbacks (used if APIs fail)
   ────────────────────────────────────────────────────────── */
const MOCK_GLOBAL = {
  total_market_cap: { usd: 2380000000000 },
  total_volume: { usd: 78400000000 },
  market_cap_percentage: { btc: 51.4, eth: 17.2 },
  market_cap_change_percentage_24h_usd: 1.23,
  active_cryptocurrencies: 12483
};
const MOCK_COINS = [
  { id:"bitcoin", symbol:"btc", name:"Bitcoin", current_price:67423.12, market_cap:1.32e12, total_volume:32.1e9, price_change_percentage_1h_in_currency:0.21, price_change_percentage_24h_in_currency:1.42, price_change_percentage_7d_in_currency:4.2, sparkline_in_7d:{price:Array.from({length:168},(_,i)=>65000+Math.sin(i/8)*1500+Math.random()*500)} },
  { id:"ethereum", symbol:"eth", name:"Ethereum", current_price:3211.55, market_cap:3.85e11, total_volume:14.2e9, price_change_percentage_1h_in_currency:-0.12, price_change_percentage_24h_in_currency:2.18, price_change_percentage_7d_in_currency:6.1, sparkline_in_7d:{price:Array.from({length:168},(_,i)=>3100+Math.sin(i/6)*120+Math.random()*40)} },
  { id:"tether", symbol:"usdt", name:"Tether", current_price:1.0001, market_cap:1.05e11, total_volume:48.3e9, price_change_percentage_1h_in_currency:0.01, price_change_percentage_24h_in_currency:0.02, price_change_percentage_7d_in_currency:-0.01, sparkline_in_7d:{price:Array.from({length:168},()=>1+Math.random()*0.002-0.001)} },
  { id:"solana", symbol:"sol", name:"Solana", current_price:165.42, market_cap:7.6e10, total_volume:3.4e9, price_change_percentage_1h_in_currency:0.85, price_change_percentage_24h_in_currency:-3.21, price_change_percentage_7d_in_currency:8.7, sparkline_in_7d:{price:Array.from({length:168},(_,i)=>160+Math.sin(i/5)*8+Math.random()*3)} },
  { id:"binancecoin", symbol:"bnb", name:"BNB", current_price:592.18, market_cap:8.7e10, total_volume:1.8e9, price_change_percentage_1h_in_currency:0.32, price_change_percentage_24h_in_currency:0.91, price_change_percentage_7d_in_currency:2.4, sparkline_in_7d:{price:Array.from({length:168},(_,i)=>590+Math.sin(i/7)*8+Math.random()*2)} },
  { id:"ripple", symbol:"xrp", name:"XRP", current_price:0.5121, market_cap:2.85e10, total_volume:1.2e9, price_change_percentage_1h_in_currency:-0.15, price_change_percentage_24h_in_currency:-1.12, price_change_percentage_7d_in_currency:3.4, sparkline_in_7d:{price:Array.from({length:168},(_,i)=>0.51+Math.sin(i/4)*0.02+Math.random()*0.005)} },
  { id:"dogecoin", symbol:"doge", name:"Dogecoin", current_price:0.1623, market_cap:2.36e10, total_volume:1.4e9, price_change_percentage_1h_in_currency:1.21, price_change_percentage_24h_in_currency:5.43, price_change_percentage_7d_in_currency:12.1, sparkline_in_7d:{price:Array.from({length:168},(_,i)=>0.155+Math.sin(i/3)*0.008+Math.random()*0.003)} },
  { id:"cardano", symbol:"ada", name:"Cardano", current_price:0.4502, market_cap:1.6e10, total_volume:512e6, price_change_percentage_1h_in_currency:-0.42, price_change_percentage_24h_in_currency:-2.18, price_change_percentage_7d_in_currency:-1.2, sparkline_in_7d:{price:Array.from({length:168},(_,i)=>0.45+Math.sin(i/9)*0.015+Math.random()*0.005)} },
  { id:"avalanche-2", symbol:"avax", name:"Avalanche", current_price:35.21, market_cap:1.4e10, total_volume:480e6, price_change_percentage_1h_in_currency:0.55, price_change_percentage_24h_in_currency:1.82, price_change_percentage_7d_in_currency:5.3, sparkline_in_7d:{price:Array.from({length:168},(_,i)=>34.5+Math.sin(i/6)*1.2+Math.random()*0.5)} },
  { id:"chainlink", symbol:"link", name:"Chainlink", current_price:14.82, market_cap:8.7e9, total_volume:380e6, price_change_percentage_1h_in_currency:0.18, price_change_percentage_24h_in_currency:3.42, price_change_percentage_7d_in_currency:7.1, sparkline_in_7d:{price:Array.from({length:168},(_,i)=>14.4+Math.sin(i/7)*0.4+Math.random()*0.15)} },
  { id:"polkadot", symbol:"dot", name:"Polkadot", current_price:6.12, market_cap:8.5e9, total_volume:215e6, price_change_percentage_1h_in_currency:-0.08, price_change_percentage_24h_in_currency:-0.81, price_change_percentage_7d_in_currency:-2.4, sparkline_in_7d:{price:Array.from({length:168},(_,i)=>6.1+Math.sin(i/5)*0.18+Math.random()*0.08)} },
  { id:"matic-network", symbol:"matic", name:"Polygon", current_price:0.6815, market_cap:6.7e9, total_volume:218e6, price_change_percentage_1h_in_currency:0.42, price_change_percentage_24h_in_currency:2.31, price_change_percentage_7d_in_currency:4.8, sparkline_in_7d:{price:Array.from({length:168},(_,i)=>0.67+Math.sin(i/4)*0.02+Math.random()*0.008)} },
  { id:"litecoin", symbol:"ltc", name:"Litecoin", current_price:81.42, market_cap:6.1e9, total_volume:415e6, price_change_percentage_1h_in_currency:0.12, price_change_percentage_24h_in_currency:0.88, price_change_percentage_7d_in_currency:1.5, sparkline_in_7d:{price:Array.from({length:168},(_,i)=>81+Math.sin(i/8)*1.2+Math.random()*0.4)} },
  { id:"uniswap", symbol:"uni", name:"Uniswap", current_price:8.92, market_cap:5.4e9, total_volume:152e6, price_change_percentage_1h_in_currency:0.65, price_change_percentage_24h_in_currency:4.21, price_change_percentage_7d_in_currency:9.3, sparkline_in_7d:{price:Array.from({length:168},(_,i)=>8.6+Math.sin(i/3)*0.25+Math.random()*0.1)} },
  { id:"shiba-inu", symbol:"shib", name:"Shiba Inu", current_price:0.0000242, market_cap:1.43e10, total_volume:680e6, price_change_percentage_1h_in_currency:1.42, price_change_percentage_24h_in_currency:8.21, price_change_percentage_7d_in_currency:18.4, sparkline_in_7d:{price:Array.from({length:168},(_,i)=>0.000023+Math.sin(i/2)*0.0000015+Math.random()*0.0000005)} }
];
const MOCK_FG = { value: 64, classification: "Greed", history: [42, 48, 51, 55, 58, 61, 64] };

/* ──────────────────────────────────────────────────────────
   Generators (anomalies, macro, funding)
   ────────────────────────────────────────────────────────── */
const ANOMALY_TYPES = [
  { tag: "WHALE", tmpl: (s) => `${s.amount.toLocaleString()} ${s.sym} moved · ${s.from} → ${s.to}` },
  { tag: "LIQ",   tmpl: (s) => `Liquidation cascade ${s.sym} · ${fmt.usd(s.size,1)} cleared @ ${fmt.usd(s.price)}` },
  { tag: "FLOW",  tmpl: (s) => `${fmt.usd(s.size,1)} netflow → ${s.exch} · ${s.sym}` },
  { tag: "OI",    tmpl: (s) => `OI surge ${s.sym} · +${s.pct.toFixed(1)}% in 1h on ${s.exch}` },
  { tag: "PUMP",  tmpl: (s) => `${s.sym} +${s.pct.toFixed(1)}% in ${s.window} · vol ${s.volX.toFixed(1)}x` },
  { tag: "NEWS",  tmpl: (s) => s.headline }
];
const NEWS = [
  "Hong Kong approves spot ETH ETF — trading begins Friday",
  "Tether mints $1.0B USDT on Tron · sequence #4892",
  "Coinbase derivatives volume hits $14B — 7-day high",
  "BlackRock IBIT records 11th straight day of inflows",
  "Bitfinex whale closes 2.4k BTC short · realized +$48M",
  "MicroStrategy adds 8,400 BTC at avg $63,180",
  "Solana network restart proposal vote opens · 81% quorum",
  "Binance lists FET perp · 75x leverage cap",
  "Aave V3 governance: GHO peg module activated",
  "Lido stETH redemption queue clears · ~$120M unstaked"
];
const EXCHANGES = ["Binance", "Coinbase", "Kraken", "OKX", "Bybit", "Bitfinex", "Upbit"];
const ADDRS = ["0x3a4f...e211", "0xb12c...77a1", "bc1q...gz5d", "0xe8f0...091c", "0x4c19...d8af"];

function genAnomaly(rand, syms) {
  const t = ANOMALY_TYPES[Math.floor(rand()*ANOMALY_TYPES.length)];
  const sym = syms[Math.floor(rand()*syms.length)].toUpperCase();
  const ex = EXCHANGES[Math.floor(rand()*EXCHANGES.length)];
  const ex2 = EXCHANGES[Math.floor(rand()*EXCHANGES.length)];
  const seed = {
    sym, exch: ex,
    amount: Math.floor(50 + rand()*4500),
    from: ADDRS[Math.floor(rand()*ADDRS.length)],
    to: ex,
    size: 5e5 + rand()*42e6,
    price: 100 + rand()*70000,
    pct: 5 + rand()*45,
    window: ["5m","15m","1h"][Math.floor(rand()*3)],
    volX: 2 + rand()*15,
    headline: NEWS[Math.floor(rand()*NEWS.length)]
  };
  return {
    id: Math.random().toString(36).slice(2,10),
    ts: new Date(),
    tag: t.tag,
    text: t.tmpl(seed)
  };
}

/* ──────────────────────────────────────────────────────────
   Sparkline / chart components
   ────────────────────────────────────────────────────────── */
function Sparkline({ data, color = "var(--amber)", height = 18, fill = false }) {
  if (!data || data.length < 2) return <div style={{ height, opacity: 0.3 }} />;
  const min = Math.min(...data), max = Math.max(...data), range = (max - min) || 1;
  const w = 100;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = height - ((v - min) / range) * height;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  const d = "M " + pts.join(" L ");
  const dFill = d + ` L ${w},${height} L 0,${height} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" style={{ width: "100%", height: height }}>
      {fill && <path d={dFill} fill={color} opacity="0.12" />}
      <path d={d} fill="none" stroke={color} strokeWidth="1" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function PriceChart({ data, color = "var(--amber)" }) {
  const wrapRef = useRef(null);
  const [tip, setTip] = useState(null);
  const [size, setSize] = useState({ w: 600, h: 280 });

  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver((es) => {
      const r = es[0].contentRect;
      setSize({ w: Math.max(r.width, 200), h: Math.max(r.height, 160) });
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  if (!data || data.length < 2) {
    return <div ref={wrapRef} className="chart-wrap" style={{display:"flex",alignItems:"center",justifyContent:"center",color:"var(--mid)"}}>
      <span className="blink">▒ AWAITING FEED ▒</span>
    </div>;
  }

  const padL = 50, padR = 8, padT = 12, padB = 22;
  const W = size.w, H = size.h;
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const xs = data.map(d => d[0]);
  const ys = data.map(d => d[1]);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const yRange = (maxY - minY) || 1;
  const minX = xs[0], maxX = xs[xs.length-1];
  const xRange = (maxX - minX) || 1;

  const px = (t) => padL + ((t - minX) / xRange) * innerW;
  const py = (v) => padT + innerH - ((v - minY) / yRange) * innerH;

  const path = data.map((d,i)=>`${i===0?"M":"L"} ${px(d[0]).toFixed(1)} ${py(d[1]).toFixed(1)}`).join(" ");
  const fillPath = path + ` L ${px(maxX)} ${padT+innerH} L ${px(minX)} ${padT+innerH} Z`;

  // y gridlines
  const yTicks = 5;
  const yLines = Array.from({ length: yTicks }, (_, i) => {
    const v = minY + (yRange * i) / (yTicks - 1);
    return { v, y: py(v) };
  });
  // x ticks
  const xTicks = 6;
  const xLines = Array.from({ length: xTicks }, (_, i) => {
    const t = minX + (xRange * i) / (xTicks - 1);
    return { t, x: px(t) };
  });

  function onMove(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    if (mx < padL || mx > W - padR) { setTip(null); return; }
    const t = minX + ((mx - padL) / innerW) * xRange;
    let idx = 0, best = Infinity;
    for (let i = 0; i < data.length; i++) {
      const dx = Math.abs(data[i][0] - t);
      if (dx < best) { best = dx; idx = i; }
    }
    const d = data[idx];
    setTip({ x: px(d[0]), y: py(d[1]), t: d[0], v: d[1] });
  }

  const fmtTick = (t) => {
    const span = maxX - minX;
    const d = new Date(t);
    if (span < 24*3600*1000) return d.toISOString().substr(11,5);
    if (span < 8*24*3600*1000) return d.toISOString().substr(5,5).replace("-","·");
    return d.toISOString().substr(2,8).replace(/-/g,"·");
  };

  const last = data[data.length-1][1];
  const first = data[0][1];
  const chgPct = ((last - first) / first) * 100;
  const chgColor = chgPct >= 0 ? "var(--green)" : "var(--red)";

  return (
    <div ref={wrapRef} className="chart-wrap" onMouseMove={onMove} onMouseLeave={() => setTip(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        {yLines.map((l, i) => (
          <g key={i}>
            <line x1={padL} y1={l.y} x2={W - padR} y2={l.y} stroke="var(--line)" strokeDasharray="2 3" />
            <text x={padL - 6} y={l.y + 3} textAnchor="end" fontSize="9" fontFamily="JetBrains Mono" fill="var(--mid)">
              {fmt.usd(l.v, l.v < 1 ? 4 : 0)}
            </text>
          </g>
        ))}
        {xLines.map((l, i) => (
          <g key={i}>
            <line x1={l.x} y1={padT} x2={l.x} y2={padT + innerH} stroke="var(--line)" strokeDasharray="2 3" opacity="0.5" />
            <text x={l.x} y={H - 8} textAnchor="middle" fontSize="9" fontFamily="JetBrains Mono" fill="var(--mid)">
              {fmtTick(l.t)}
            </text>
          </g>
        ))}
        <path d={fillPath} fill={chgColor} opacity="0.08" />
        <path d={path} fill="none" stroke={chgColor} strokeWidth="1.4" />
        {tip && (
          <g>
            <line x1={tip.x} y1={padT} x2={tip.x} y2={padT + innerH} stroke="var(--amber)" strokeDasharray="2 2" />
            <line x1={padL} y1={tip.y} x2={W - padR} y2={tip.y} stroke="var(--amber)" strokeDasharray="2 2" />
            <circle cx={tip.x} cy={tip.y} r="3" fill="var(--amber)" />
          </g>
        )}
        {/* current price label */}
        <g>
          <rect x={W - padR - 60} y={py(last) - 7} width="60" height="14" fill={chgColor} />
          <text x={W - padR - 4} y={py(last) + 3} textAnchor="end" fontSize="10" fontFamily="JetBrains Mono" fill="#000" fontWeight="600">
            {fmt.usd(last, last < 1 ? 4 : 0)}
          </text>
        </g>
      </svg>
      {tip && (
        <div className="tooltip" style={{
          left: Math.min(tip.x + 10, W - 160),
          top: Math.max(tip.y - 50, 8)
        }}>
          <div className="tk">{new Date(tip.t).toISOString().replace("T"," ").substr(0,16)}</div>
          <div className="tv" style={{ fontSize: 14, marginTop: 2 }}>{fmt.usd(tip.v, tip.v < 1 ? 4 : 2)}</div>
          <div style={{ color: chgPct >= 0 ? "var(--green)" : "var(--red)", marginTop: 2 }}>
            {fmt.pct(chgPct)} from start
          </div>
        </div>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────
   Fear & Greed Gauge
   ────────────────────────────────────────────────────────── */
function FearGreedGauge({ value = 50, label = "Neutral", history = [] }) {
  const ang = -90 + (value / 100) * 180;
  const color = value < 25 ? "var(--red)" : value < 45 ? "#ff8a4d" : value < 55 ? "var(--amber)" : value < 75 ? "#9ade2f" : "var(--green)";
  const r = 70, cx = 95, cy = 80;
  const arcStart = -180, arcEnd = 0;
  const segs = 5;
  const segLabels = ["EXTREME FEAR","FEAR","NEUTRAL","GREED","EXTREME GREED"];
  const segColors = ["var(--red)","#ff8a4d","var(--amber)","#9ade2f","var(--green)"];

  const polar = (a) => {
    const r2 = (a * Math.PI) / 180;
    return [cx + r * Math.cos(r2), cy + r * Math.sin(r2)];
  };
  const arc = (s, e) => {
    const [x1, y1] = polar(s), [x2, y2] = polar(e);
    return `M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`;
  };

  const labels7 = ["7d","6d","5d","4d","3d","2d","NOW"];

  return (
    <div className="fg-gauge">
      <svg viewBox="0 0 190 110" width="100%" style={{ maxHeight: 110 }}>
        {Array.from({length: segs}).map((_, i) => {
          const s = arcStart + (i * 180) / segs;
          const e = arcStart + ((i + 1) * 180) / segs - 1.5;
          return <path key={i} d={arc(s, e)} stroke={segColors[i]} strokeWidth="10" fill="none" opacity="0.5" />;
        })}
        {/* needle */}
        <g transform={`rotate(${ang} ${cx} ${cy})`}>
          <line x1={cx} y1={cy} x2={cx} y2={cy - r + 4} stroke="var(--fg-1)" strokeWidth="2" />
          <circle cx={cx} cy={cy - r + 4} r="3" fill="var(--fg-1)" />
        </g>
        <circle cx={cx} cy={cy} r="4" fill="var(--bg)" stroke="var(--amber)" strokeWidth="1.5" />
      </svg>
      <div className="fg-value" style={{ color }}>{value}</div>
      <div className="fg-label" style={{ color }}>{label.toUpperCase()}</div>
      <div className="fg-bars">
        {history.slice(-7).map((v, i) => (
          <div className="fg-bar" key={i}>
            <div className="b" style={{ "--h": `${v}%` }} />
            <div className="l">{labels7[i] || ""}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────
   Top status bar + ticker
   ────────────────────────────────────────────────────────── */
function StatusBar({ apiStatus, time }) {
  return (
    <div className="statusbar">
      <div className="seg brand">◆ CRYPTOPULSE</div>
      <div className="seg"><span className="dim">VER</span> 4.12.0</div>
      <div className="seg"><span className="dim">USR</span> ANALYST</div>
      <div className="seg"><span className="dim">DESK</span> MACRO·INTEL</div>
      <div className="right">
        <div className="seg">
          <span className={`dot ${apiStatus === "live" ? "" : apiStatus === "stale" ? "amber" : "red"}`} />
          <span>{apiStatus === "live" ? "FEED LIVE" : apiStatus === "stale" ? "FEED STALE" : "FEED OFFLINE"}</span>
        </div>
        <div className="seg"><span className="dim">UTC</span> {fmt.time(time)}</div>
        <div className="seg"><span className="dim">DATE</span> {fmt.date(time)}</div>
        <div className="seg"><span className="dim">SESS</span> US·EU OVERLAP</div>
      </div>
    </div>
  );
}

function TickerTape({ coins }) {
  if (!coins || !coins.length) return <div className="ticker"></div>;
  const items = [...coins.slice(0, 18), ...coins.slice(0, 18)];
  return (
    <div className="ticker">
      <div className="ticker-track">
        {items.map((c, i) => {
          const ch = c.price_change_percentage_24h_in_currency || 0;
          return (
            <span key={i} className="ticker-item">
              <span className="sym">{c.symbol.toUpperCase()}</span>
              <span className="num">{fmt.usd(c.current_price, c.current_price < 1 ? 4 : 2)}</span>
              <span className={`num ${ch >= 0 ? "up" : "down"}`}>{ch >= 0 ? "▲" : "▼"} {fmt.pct(ch)}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────
   Left nav
   ────────────────────────────────────────────────────────── */
const NAV_ITEMS = [
  { section: "INTEL" },
  { id: "overview",    label: "Overview",    key: "F1" },
  { id: "markets",     label: "Markets",     key: "F2" },
  { id: "fundflow",    label: "Fundflow",    key: "F3" },
  { section: "TRADING" },
  { id: "derivatives", label: "Derivatives", key: "F4" },
  { id: "backtest",    label: "Backtest",    key: "F5" },
  { section: "SYSTEM" },
  { id: "alerts",      label: "Alerts",      key: "F6" },
  { id: "settings",    label: "Settings",    key: "F7" }
];
function Nav({ active, onChange }) {
  return (
    <div className="nav">
      {NAV_ITEMS.map((it, i) => it.section ? (
        <div key={i} className="nav-section">— {it.section} —</div>
      ) : (
        <div key={i} className={`nav-item ${active === it.id ? "active" : ""}`} onClick={() => onChange(it.id)}>
          <span className="key">{it.key}</span>
          <span>{it.label}</span>
        </div>
      ))}
      <div style={{ flex: 1 }} />
      <div style={{ padding: "8px 10px", fontSize: 9, color: "var(--dim)", borderTop: "1px solid var(--line)" }}>
        <div>● UPLINK 14ms</div>
        <div>● 12 ALERTS ARMED</div>
        <div>● 3 STREAMS</div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────
   Stats / movers / drill-down / feed / macro / funding
   ────────────────────────────────────────────────────────── */
function StatBlock({ label, value, delta, deltaColor, sub }) {
  return (
    <div className="stat">
      <div className="label">{label}</div>
      <div className="value num">{value}</div>
      {delta != null && <div className="delta" style={{ color: deltaColor }}>{delta}</div>}
      {sub && <div className="delta dim">{sub}</div>}
    </div>
  );
}

function MoversTable({ coins, onPick, active, query, setQuery }) {
  const [sort, setSort] = useState({ key: "market_cap", dir: "desc" });
  const filtered = useMemo(() => {
    let xs = coins;
    if (query) {
      const q = query.toLowerCase();
      xs = xs.filter(c => c.name.toLowerCase().includes(q) || c.symbol.toLowerCase().includes(q));
    }
    xs = [...xs].sort((a, b) => {
      const av = a[sort.key], bv = b[sort.key];
      if (av == null) return 1; if (bv == null) return -1;
      return sort.dir === "desc" ? bv - av : av - bv;
    });
    return xs;
  }, [coins, query, sort]);

  const cols = [
    { k: "rank", l: "#", left: true },
    { k: "name", l: "Asset", left: true },
    { k: "current_price", l: "Last" },
    { k: "price_change_percentage_1h_in_currency", l: "1h%" },
    { k: "price_change_percentage_24h_in_currency", l: "24h%" },
    { k: "price_change_percentage_7d_in_currency", l: "7d%" },
    { k: "total_volume", l: "Vol·24h" },
    { k: "market_cap", l: "Mkt Cap" },
    { k: "spark", l: "7d Trend", noSort: true }
  ];

  return (
    <table className="t">
      <thead>
        <tr>
          {cols.map(c => (
            <th key={c.k} className={c.left ? "left" : ""} onClick={() => !c.noSort && setSort(s => ({ key: c.k, dir: s.key === c.k && s.dir === "desc" ? "asc" : "desc" }))}>
              {c.l}
              {sort.key === c.k && <span className="arr">{sort.dir === "desc" ? "▼" : "▲"}</span>}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {filtered.map((c, i) => {
          const ch24 = c.price_change_percentage_24h_in_currency || 0;
          const ch1 = c.price_change_percentage_1h_in_currency || 0;
          const ch7 = c.price_change_percentage_7d_in_currency || 0;
          return (
            <tr key={c.id} className={active === c.id ? "active" : ""} onClick={() => onPick(c.id)}>
              <td className="left dim">{c.market_cap_rank || i+1}</td>
              <td className="left">
                <span className="sym-pill">
                  <span className="ic">{c.symbol[0].toUpperCase()}</span>
                  <span className="amber" style={{fontWeight:600}}>{c.symbol.toUpperCase()}</span>
                  <span className="dim" style={{fontSize:10}}>{c.name}</span>
                </span>
              </td>
              <td>{fmt.usd(c.current_price, c.current_price < 1 ? 4 : 2)}</td>
              <td className={ch1 >= 0 ? "up" : "down"}>{fmt.pct(ch1)}</td>
              <td className={ch24 >= 0 ? "up" : "down"}>{fmt.pct(ch24)}</td>
              <td className={ch7 >= 0 ? "up" : "down"}>{fmt.pct(ch7)}</td>
              <td className="dim">{fmt.usd(c.total_volume, 1)}</td>
              <td>{fmt.usd(c.market_cap, 1)}</td>
              <td style={{ width: 110, padding: "0 8px" }}>
                <Sparkline data={c.sparkline_in_7d?.price || []} color={ch7 >= 0 ? "var(--green)" : "var(--red)"} fill />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function DrillDown({ coin }) {
  if (!coin) return (
    <div style={{ padding: 16, color: "var(--mid)", fontSize: 11, textAlign: "center" }}>
      <div className="blink amber">▮</div>
      <div style={{ marginTop: 8 }}>SELECT ASSET FROM TABLE</div>
      <div style={{ marginTop: 4, fontSize: 9 }} className="dim">CLICK ANY ROW TO LOAD INSPECTOR</div>
    </div>
  );
  const ch24 = coin.price_change_percentage_24h_in_currency || 0;
  const ath = coin.current_price * (1 + Math.random() * 0.4);
  const atl = coin.current_price * (0.3 + Math.random() * 0.3);
  return (
    <div>
      <div style={{ padding: "8px 10px", borderBottom: "1px solid var(--line)" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span className="amber" style={{ fontSize: 14, fontWeight: 600 }}>{coin.symbol.toUpperCase()}</span>
          <span className="dim" style={{ fontSize: 10 }}>{coin.name}</span>
          <span className="dim" style={{ fontSize: 9, marginLeft: "auto" }}>RANK #{coin.market_cap_rank || "—"}</span>
        </div>
        <div style={{ marginTop: 4, display: "flex", alignItems: "baseline", gap: 8 }}>
          <span className="num" style={{ fontSize: 22, color: "var(--fg-1)" }}>{fmt.usd(coin.current_price, coin.current_price < 1 ? 4 : 2)}</span>
          <span className={`num ${ch24 >= 0 ? "up" : "down"}`} style={{ fontSize: 12 }}>{ch24 >= 0 ? "▲" : "▼"} {fmt.pct(ch24)}</span>
        </div>
      </div>
      <div className="drill-grid">
        <div className="kv"><span className="k">Mkt Cap</span><span className="v">{fmt.usd(coin.market_cap, 2)}</span></div>
        <div className="kv"><span className="k">Vol 24h</span><span className="v">{fmt.usd(coin.total_volume, 2)}</span></div>
        <div className="kv"><span className="k">High 24h</span><span className="v">{fmt.usd(coin.high_24h || coin.current_price * 1.02, 2)}</span></div>
        <div className="kv"><span className="k">Low 24h</span><span className="v">{fmt.usd(coin.low_24h || coin.current_price * 0.98, 2)}</span></div>
        <div className="kv"><span className="k">Vol/Mcap</span><span className="v">{((coin.total_volume / coin.market_cap) * 100).toFixed(2)}%</span></div>
        <div className="kv"><span className="k">Circ Supply</span><span className="v">{fmt.compact(coin.circulating_supply || coin.market_cap / coin.current_price)}</span></div>
        <div className="kv"><span className="k">ATH·est</span><span className="v amber">{fmt.usd(ath, 2)}</span></div>
        <div className="kv"><span className="k">ATL·est</span><span className="v">{fmt.usd(atl, 2)}</span></div>
        <div className="kv"><span className="k">7d</span><span className={`v ${(coin.price_change_percentage_7d_in_currency || 0) >= 0 ? "up" : "down"}`}>{fmt.pct(coin.price_change_percentage_7d_in_currency || 0)}</span></div>
        <div className="kv"><span className="k">1h</span><span className={`v ${(coin.price_change_percentage_1h_in_currency || 0) >= 0 ? "up" : "down"}`}>{fmt.pct(coin.price_change_percentage_1h_in_currency || 0)}</span></div>
      </div>
      <div style={{ padding: "0 10px 10px" }}>
        <div className="dim" style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>7D Sparkline</div>
        <Sparkline data={coin.sparkline_in_7d?.price || []} height={48} fill color={ch24 >= 0 ? "var(--green)" : "var(--red)"} />
      </div>
    </div>
  );
}

function AnomalyFeed({ items }) {
  return (
    <div className="feed">
      {items.length === 0 && (
        <div style={{ padding: 16, color: "var(--mid)", textAlign: "center", fontSize: 10 }}>
          <span className="blink">▒ MONITORING ▒</span>
        </div>
      )}
      {items.map(it => (
        <div key={it.id} className="feed-row">
          <span className="ts">{fmt.time(it.ts)}</span>
          <span className={`tag ${it.tag}`}>{it.tag}</span>
          <span style={{ color: "var(--fg)" }}>{it.text}</span>
          <span className="vdim" style={{ fontSize: 9 }}>▸</span>
        </div>
      ))}
    </div>
  );
}

function MacroOverlay({ data }) {
  return (
    <div>
      {data.map(m => (
        <div key={m.sym} className="macro-row">
          <div className="sym">{m.sym}</div>
          <div className="macro-spark">
            <Sparkline data={m.series} color={m.chg >= 0 ? "var(--green)" : "var(--red)"} fill height={18} />
          </div>
          <div className="num" style={{ textAlign: "right" }}>{fmt.num(m.value, m.value < 10 ? 3 : 2)}</div>
          <div className={`num ${m.chg >= 0 ? "up" : "down"}`} style={{ textAlign: "right" }}>{fmt.pct(m.chg)}</div>
        </div>
      ))}
      <div style={{ padding: "8px 10px", borderTop: "1px solid var(--line)", fontSize: 9, color: "var(--dim)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
        Correlation BTC · 30d
      </div>
      <div style={{ padding: "0 10px 8px", display: "grid", gap: 4 }}>
        {data.map(m => (
          <div key={m.sym} style={{ display: "grid", gridTemplateColumns: "50px 1fr 50px", gap: 8, alignItems: "center", fontSize: 10 }}>
            <span className="amber">{m.sym}</span>
            <div style={{ height: 8, background: "var(--bg-3)", position: "relative" }}>
              <div style={{
                position: "absolute",
                left: m.corr >= 0 ? "50%" : `${50 + m.corr * 50}%`,
                width: `${Math.abs(m.corr) * 50}%`,
                top: 0, bottom: 0,
                background: m.corr >= 0 ? "var(--green)" : "var(--red)",
                opacity: 0.7
              }} />
              <div style={{ position: "absolute", left: "50%", top: -1, bottom: -1, width: 1, background: "var(--mid)" }} />
            </div>
            <span className="num" style={{ textAlign: "right", color: m.corr >= 0 ? "var(--green)" : "var(--red)" }}>
              {(m.corr >= 0 ? "+" : "") + m.corr.toFixed(2)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function FundingHeatmap({ rows }) {
  const exchanges = ["BIN", "OKX", "BYB", "DRBT", "CB"];
  return (
    <div className="heat">
      <div className="h">Asset</div>
      {exchanges.map(e => <div key={e} className="h">{e}</div>)}
      {rows.map(r => (
        <React.Fragment key={r.sym}>
          <div className="left">{r.sym}</div>
          {r.rates.map((v, i) => {
            const intensity = Math.min(Math.abs(v) / 0.05, 1);
            const color = v >= 0 ? `rgba(25,210,122,${0.08 + intensity*0.5})` : `rgba(255,77,94,${0.08 + intensity*0.5})`;
            return (
              <div key={i} style={{ background: color, color: "var(--fg-1)" }}>
                {(v >= 0 ? "+" : "") + (v * 100).toFixed(3) + "%"}
              </div>
            );
          })}
        </React.Fragment>
      ))}
      <div style={{ gridColumn: "1 / -1", padding: "4px 6px", textAlign: "left", color: "var(--dim)", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em" }}>
        ▸ 8h Annualized · Negative = shorts pay
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────
   Stub screens
   ────────────────────────────────────────────────────────── */
function StubScreen({ id }) {
  const titles = {
    markets: "MARKETS · Deep asset analysis",
    fundflow: "FUNDFLOW · Stablecoin & exchange netflows",
    derivatives: "DERIVATIVES · Futures, options, OI heatmaps",
    backtest: "BACKTEST · Historical strategy simulator",
    alerts: "ALERTS · Custom triggers & notifications",
    settings: "SETTINGS · Workspace & feed configuration"
  };
  return (
    <div className="stub">
      <pre className="ascii">{`
   ╔═══════════════════════╗
   ║  MODULE NOT INSTALLED ║
   ╚═══════════════════════╝
`}</pre>
      <h2>{titles[id] || id.toUpperCase()}</h2>
      <p className="dim">
        This terminal module is part of the extended workspace.
        Press <span className="amber">F1</span> to return to the Overview.
      </p>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────
   Main App
   ────────────────────────────────────────────────────────── */
function App() {
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [active, setActive] = useState("overview");
  const [now, setNow] = useState(new Date());
  const [global, setGlobal] = useState(null);
  const [coins, setCoins] = useState([]);
  const [fg, setFg] = useState(null);
  const [chartData, setChartData] = useState(null);
  const [chartCoin, setChartCoin] = useState("bitcoin");
  const [tf, setTf] = useState("1D");
  const [activeCoinId, setActiveCoinId] = useState("bitcoin");
  const [query, setQuery] = useState("");
  const [feed, setFeed] = useState([]);
  const [apiStatus, setApiStatus] = useState("connecting");
  const [macro, setMacro] = useState([]);
  const [funding, setFunding] = useState([]);

  // typography
  useEffect(() => {
    document.body.classList.toggle("sans", tweaks.type === "sans");
  }, [tweaks.type]);

  // clock
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // fetch global + coins
  useEffect(() => {
    let cancel = false;
    async function load() {
      try {
        const [g, c] = await Promise.all([
          fetch("https://api.coingecko.com/api/v3/global").then(r => r.json()),
          fetch("https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=20&page=1&sparkline=true&price_change_percentage=1h,24h,7d").then(r => r.json())
        ]);
        if (cancel) return;
        if (g && g.data) setGlobal(g.data);
        if (Array.isArray(c) && c.length) setCoins(c);
        setApiStatus("live");
      } catch (e) {
        if (cancel) return;
        console.warn("API failed, falling back to mock:", e);
        setGlobal(MOCK_GLOBAL);
        setCoins(MOCK_COINS);
        setApiStatus("offline");
      }
    }
    load();
    const id = setInterval(load, 60000);
    return () => { cancel = true; clearInterval(id); };
  }, []);

  // fetch fear & greed
  useEffect(() => {
    let cancel = false;
    async function load() {
      try {
        const r = await fetch("https://api.alternative.me/fng/?limit=7");
        const j = await r.json();
        if (cancel) return;
        if (j && j.data) {
          const latest = j.data[0];
          setFg({
            value: parseInt(latest.value, 10),
            classification: latest.value_classification,
            history: j.data.slice().reverse().map(d => parseInt(d.value, 10))
          });
        }
      } catch (e) {
        if (cancel) return;
        setFg(MOCK_FG);
      }
    }
    load();
    const id = setInterval(load, 5 * 60 * 1000);
    return () => { cancel = true; clearInterval(id); };
  }, []);

  // fetch chart data for selected coin and timeframe
  useEffect(() => {
    let cancel = false;
    const days = { "1H": 1, "24H": 1, "7D": 7, "30D": 30, "1Y": 365, "1D": 1 }[tf] || 7;
    const interval = tf === "1H" ? "" : tf === "1Y" ? "&interval=daily" : "";
    setChartData(null);
    async function load() {
      try {
        const r = await fetch(`https://api.coingecko.com/api/v3/coins/${chartCoin}/market_chart?vs_currency=usd&days=${days}${interval}`);
        const j = await r.json();
        if (cancel) return;
        if (j && Array.isArray(j.prices)) {
          let pts = j.prices;
          if (tf === "1H" && pts.length > 12) pts = pts.slice(-12);
          setChartData(pts);
        }
      } catch (e) {
        if (cancel) return;
        // fallback synthetic
        const rand = seededRand(chartCoin.length * days);
        const base = (MOCK_COINS.find(c => c.id === chartCoin) || MOCK_COINS[0]).current_price;
        const n = days * 24;
        const pts = [];
        const start = Date.now() - days * 86400000;
        let v = base;
        for (let i = 0; i < n; i++) {
          v = v * (1 + (rand() - 0.5) * 0.012);
          pts.push([start + (i * (days * 86400000) / n), v]);
        }
        setChartData(pts);
      }
    }
    load();
    return () => { cancel = true; };
  }, [chartCoin, tf]);

  // macro overlay (synthesized — free real data not reliable)
  useEffect(() => {
    const rand = seededRand(42);
    const macroSyms = [
      { sym: "DXY", base: 104.32, vol: 0.003 },
      { sym: "SPX", base: 5210.42, vol: 0.008 },
      { sym: "GLD", base: 2342.10, vol: 0.006 },
      { sym: "TNX", base: 4.612, vol: 0.012 },
      { sym: "WTI", base: 78.42, vol: 0.014 },
      { sym: "BTC.D", base: 51.4, vol: 0.005 }
    ];
    const tick = () => {
      setMacro(prev => macroSyms.map((m, i) => {
        const old = prev[i];
        const n = 60;
        const series = old?.series ? [...old.series.slice(1)] : Array.from({ length: n }, () => m.base);
        const last = series[series.length - 1] || m.base;
        const next = last * (1 + (rand() - 0.5) * m.vol);
        series.push(next);
        const chg = ((next - series[0]) / series[0]) * 100;
        const corr = old?.corr != null ? Math.max(-1, Math.min(1, old.corr + (rand() - 0.5) * 0.04)) : (rand() - 0.5) * 1.6;
        return { sym: m.sym, value: next, chg, series, corr: Math.max(-0.95, Math.min(0.95, corr)) };
      }));
    };
    tick();
    const id = setInterval(tick, 4000);
    return () => clearInterval(id);
  }, []);

  // funding rates (synthesized)
  useEffect(() => {
    const rand = seededRand(7);
    const syms = ["BTC", "ETH", "SOL", "BNB", "XRP", "DOGE", "AVAX", "LINK"];
    const tick = () => {
      setFunding(syms.map(s => ({
        sym: s,
        rates: Array.from({ length: 5 }, () => (rand() - 0.42) * 0.08)
      })));
    };
    tick();
    const id = setInterval(tick, 7000);
    return () => clearInterval(id);
  }, []);

  // anomaly feed stream
  useEffect(() => {
    const rand = seededRand(Math.floor(Date.now() / 100000));
    const syms = ["btc","eth","sol","doge","xrp","ada","matic","link","avax","shib","uni"];
    const push = () => {
      setFeed(prev => [genAnomaly(rand, syms), ...prev].slice(0, 50));
    };
    // initial seed
    for (let i = 0; i < 8; i++) push();
    const id = setInterval(push, 3500);
    return () => clearInterval(id);
  }, []);

  const activeCoin = useMemo(() => coins.find(c => c.id === activeCoinId), [coins, activeCoinId]);

  // keyboard shortcuts
  useEffect(() => {
    const map = { F1: "overview", F2: "markets", F3: "fundflow", F4: "derivatives", F5: "backtest", F6: "alerts", F7: "settings" };
    const onKey = (e) => {
      if (map[e.key]) { e.preventDefault(); setActive(map[e.key]); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // derived stats
  const stats = useMemo(() => {
    if (!global) return null;
    const mc = global.total_market_cap?.usd;
    const vol = global.total_volume?.usd;
    const btcD = global.market_cap_percentage?.btc;
    const ethD = global.market_cap_percentage?.eth;
    const chg = global.market_cap_change_percentage_24h_usd;
    return { mc, vol, btcD, ethD, chg, active: global.active_cryptocurrencies };
  }, [global]);

  return (
    <div className="app">
      <StatusBar apiStatus={apiStatus} time={now} />
      <TickerTape coins={coins} />

      <div className="main">
        <Nav active={active} onChange={setActive} />

        <div className="workspace" key={active}>
          {active === "overview" ? (
            <>
              {/* Row 1 — Stats */}
              <div className="ws-row h-stats">
                <div className="panel c-12">
                  <div className="panel-header">
                    <span className="title">▸ MARKET PULSE</span>
                    <span className="badge">GLOBAL</span>
                    <div className="right">
                      <span className="dim">{fmt.time(now)}·UTC</span>
                      <span className={`dot ${apiStatus === "live" ? "" : "amber"}`} />
                    </div>
                  </div>
                  <div className="panel-body flush">
                    <div className="stats" style={{ gridTemplateColumns: "repeat(6, 1fr)" }}>
                      <StatBlock
                        label="Total Market Cap"
                        value={stats ? fmt.usd(stats.mc, 2) : "—"}
                        delta={stats ? fmt.pct(stats.chg) : ""}
                        deltaColor={stats?.chg >= 0 ? "var(--green)" : "var(--red)"}
                        sub="24h Δ"
                      />
                      <StatBlock label="Volume · 24h" value={stats ? fmt.usd(stats.vol, 2) : "—"} sub={stats ? `${((stats.vol/stats.mc)*100).toFixed(2)}% of cap` : ""} />
                      <StatBlock label="BTC Dominance" value={stats ? stats.btcD.toFixed(2) + "%" : "—"} sub="ETH " delta={stats ? stats.ethD.toFixed(2) + "%" : ""} deltaColor="var(--cyan)" />
                      <StatBlock label="Active Assets" value={stats ? stats.active.toLocaleString() : "—"} sub="tracked across feeds" />
                      <StatBlock label="Fear & Greed" value={fg ? fg.value : "—"} delta={fg ? fg.classification.toUpperCase() : ""} deltaColor="var(--amber)" sub="alternative.me · 24h" />
                      <StatBlock label="Session" value={"US·EU"} sub="overlap window" delta="OPEN" deltaColor="var(--green)" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Row 2 — Chart + Fear&Greed */}
              <div className="ws-row h-chart">
                <div className="panel c-8">
                  <div className="panel-header">
                    <span className="title">▸ {chartCoin.toUpperCase()} · USD</span>
                    <select
                      className="search"
                      style={{ width: 100, fontSize: 9, padding: "1px 4px" }}
                      value={chartCoin}
                      onChange={(e) => setChartCoin(e.target.value)}
                    >
                      {coins.slice(0, 15).map(c => <option key={c.id} value={c.id}>{c.symbol.toUpperCase()}</option>)}
                    </select>
                    <div className="right">
                      <div className="seg-control">
                        {["1H","24H","7D","30D","1Y"].map(t => (
                          <button key={t} className={tf === t ? "active" : ""} onClick={() => setTf(t)}>{t}</button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="panel-body flush" style={{ display: "flex" }}>
                    <PriceChart data={chartData} />
                  </div>
                </div>

                <div className="panel c-4">
                  <div className="panel-header">
                    <span className="title">▸ FEAR & GREED INDEX</span>
                    <span className="badge">SENTIMENT</span>
                  </div>
                  <div className="panel-body" style={{ padding: "4px 0 12px" }}>
                    {fg ? <FearGreedGauge value={fg.value} label={fg.classification} history={fg.history} /> : <div className="skel" style={{ margin: 24 }} />}
                  </div>
                </div>
              </div>

              {/* Row 3 — Movers + Inspector */}
              <div className="ws-row h-table">
                <div className="panel c-8">
                  <div className="panel-header">
                    <span className="title">▸ TOP MOVERS</span>
                    <span className="badge">{coins.length} ASSETS</span>
                    <div className="right">
                      <input className="search" placeholder="search asset…" value={query} onChange={e => setQuery(e.target.value)} />
                    </div>
                  </div>
                  <div className="panel-body flush" style={{ overflow: "auto" }}>
                    <MoversTable coins={coins} active={activeCoinId} onPick={setActiveCoinId} query={query} setQuery={setQuery} />
                  </div>
                </div>

                <div className="panel c-4">
                  <div className="panel-header">
                    <span className="title">▸ ASSET INSPECTOR</span>
                    {activeCoin && <span className="badge">{activeCoin.symbol.toUpperCase()}</span>}
                  </div>
                  <div className="panel-body flush" style={{ overflow: "auto" }}>
                    <DrillDown coin={activeCoin} />
                  </div>
                </div>
              </div>

              {/* Row 4 — Feed + Macro + Funding */}
              <div className="ws-row h-feed">
                <div className="panel c-5">
                  <div className="panel-header">
                    <span className="title">▸ LIVE ANOMALY FEED</span>
                    <span className="badge"><span className="blink up">●</span> STREAMING</span>
                    <div className="right">
                      <span className="dim">{feed.length} EVTS</span>
                    </div>
                  </div>
                  <div className="panel-body flush" style={{ overflow: "auto" }}>
                    <AnomalyFeed items={feed} />
                  </div>
                </div>

                <div className="panel c-4">
                  <div className="panel-header">
                    <span className="title">▸ MACRO OVERLAY</span>
                    <span className="badge">DXY·SPX·GLD</span>
                  </div>
                  <div className="panel-body flush" style={{ overflow: "auto" }}>
                    <MacroOverlay data={macro} />
                  </div>
                </div>

                <div className="panel c-3">
                  <div className="panel-header">
                    <span className="title">▸ FUNDING RATES</span>
                    <span className="badge">PERP</span>
                  </div>
                  <div className="panel-body" style={{ padding: 6, overflow: "auto" }}>
                    <FundingHeatmap rows={funding} />
                  </div>
                </div>
              </div>
            </>
          ) : (
            <StubScreen id={active} />
          )}
        </div>
      </div>

      {/* bottom bar */}
      <div className="botbar">
        <div className="seg"><span className="dot" /> READY</div>
        <div className="seg"><span className="dim">CMD</span> :overview</div>
        <div className="seg"><span className="dim">PROFILE</span> Macro·Default</div>
        <div className="seg"><span className="dim">LATENCY</span> 14ms</div>
        <div className="right">
          <div className="seg"><span className="dim">F1</span> Help</div>
          <div className="seg"><span className="dim">F8</span> Hotkeys</div>
          <div className="seg"><span className="dim">⌘K</span> Command Palette</div>
          <div className="seg amber">© CRYPTOPULSE INTEL</div>
        </div>
      </div>

      {/* Tweaks */}
      <TweaksPanel title="Tweaks">
        <TweakSection title="Typography">
          <TweakRadio
            label="Type System"
            value={tweaks.type}
            options={[
              { value: "mono", label: "Mono" },
              { value: "sans", label: "Sans" }
            ]}
            onChange={(v) => setTweak("type", v)}
          />
          <div style={{ fontSize: 10, color: "var(--mid, #888)", marginTop: 6, lineHeight: 1.5 }}>
            Mono = full Bloomberg terminal feel. Sans = softer dashboard variant; numerics stay mono.
          </div>
        </TweakSection>
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
