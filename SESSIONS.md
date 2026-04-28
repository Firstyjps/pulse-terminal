# 👥 Pulse Terminal · 3-Session Protocol

> โปรเจคนี้รันโดย Claude 3 ตัวคู่ขนาน เอกสารนี้บอกว่าใครเป็นใคร ทำอะไร และต้องประพฤติตัวยังไง
> **ทุก session ต้องอ่านไฟล์นี้ + [STATUS.md](./STATUS.md) ก่อนเริ่มงานทุกครั้ง**

---

## 🪪 ชื่อเรียกของแต่ละ session

| ชื่อ | IDE / Surface | บทบาท |
|---|---|---|
| **Code** | Claude Code · VSCode extension | Backend, deploy, infra, bug-fix end-to-end |
| **Desktop** | Claude Desktop (มี `frontend-design` skill) | Visual design, UI components, palette/typography |
| **Cursor** | Claude Code · Cursor IDE | Scaffolding, formatters, tests, ADRs, contracts |

> User เรียกชื่อตามคอลัมน์ "ชื่อ" — ถ้า user พูดว่า "Desktop, ทำ X" คือสั่ง session 2 เท่านั้น

---

## 🛣 Lane (เลน) ของแต่ละคน — ห้ามข้าม

### 🔧 Code — Backend & Deploy
**Owns:**
- `apps/web/app/api/**` — API routes ทุกตัว
- `packages/sources/src/{options,dual-assets,portfolio,funding,etf,futures,stablecoins,tvl,dex,macro}/` — adapters เฉพาะ
- `apps/mcp/**` — MCP server, manifest, .dxt bundle
- `apps/alerts/**` — cron workers
- `ecosystem.config.cjs`, deploy scripts, server config

**ห้ามแตะ:** `packages/ui/**`, `apps/web/components/**` (ยกเว้น `bloomberg/`), `globals.css` (Phosphor block)

### 🎨 Desktop — UI & Visual
**Owns:**
- `packages/ui/**` — design tokens, primitive components
- `apps/web/components/**` (ยกเว้น `apps/web/components/bloomberg/**` ของ Code)
- `apps/web/app/globals.css` (Phosphor block — Bloomberg block อยู่ของ Code)
- `apps/web/app/{markets,derivatives,backtest,fundflow,settings}/page.tsx` — visual polish

**ห้ามแตะ:** `packages/sources/**`, `apps/mcp/**`, `apps/alerts/**`, API routes, deploy configs

### 📐 Cursor — Scaffolding & Specs
**Owns:**
- `packages/sources/src/{format,anomalies,snapshot,_helpers}.ts` + `*.test.ts`
- `packages/charts/**` — chart components, fixtures, smoke tests
- `docs/ADR-*.md`, `docs/HUB-HEALTH-V2.md`, `docs/QUICKSTART.md`
- `apps/realtime/**` (เมื่อ implement hub v2 ตาม spec)
- Vitest configs, test infrastructure ทั่วทั้ง monorepo

**ห้ามแตะ:** `packages/sources/src/{options,dual-assets,portfolio}/**` (ของ Code), `apps/web/components/**`, `packages/ui/**`

---

## 🔗 จุดที่ทุกคนต้องระวัง (shared touch points)

ไฟล์เหล่านี้ถูกเขียนโดยหลาย session — **ก่อนแก้ ต้อง log ใน STATUS.md แจ้งคนอื่นก่อน**:

- `packages/sources/src/server.ts` — barrel export (Code + Cursor เพิ่ม exports)
- `packages/sources/src/index.ts` — type-only barrel (Code + Cursor)
- `packages/sources/src/types.ts` — shared types (ทุกคน)
- `apps/web/app/page.tsx` — landing (Desktop owns visual, Code อาจแตะถ้าเป็น bug)
- `apps/web/next.config.js` — build config (Code)
- `apps/web/package.json` — deps (ใครเพิ่ม ต้องรันบนเซิฟผ่าน Code)

---

## 📋 กฎทอง 5 ข้อ

### 1. อ่าน STATUS.md ก่อนเริ่มทุกครั้ง
ดู `🔒 Currently locked` — ไฟล์ใน list นั้น **ห้ามแตะเด็ดขาด** จนกว่าเจ้าของจะปล่อย

### 2. อ่าน Activity log ดูสิ่งที่คนอื่นทำล่าสุด
จะได้ไม่ทำซ้ำ + เข้าใจ context ปัจจุบัน

### 3. จบงาน → append entry ใน Activity log ของตัวเอง
Format:
```
### YYYY-MM-DD · <ชื่อ session>
- **[done HH:MM]** สรุปสิ่งที่ทำ + ลิงก์ไฟล์ที่แก้
- **[doing]** สิ่งที่กำลังทำต่อ
- **[blocked]** ถ้ามี blocker ระบุว่ารอ session ไหน
```

### 4. ถ้าจะแตะไฟล์เลนคนอื่น → ขอใน "Open questions" ก่อน
อย่ายุ่งโดยไม่ถาม **แม้จะดูเหมือนแก้แค่นิดเดียว**

### 5. ถ้ามี conflict (file collision) → หยุดทันที + log ใน STATUS
ห้าม merge เอง รอ user ตัดสิน

---

## 🔁 Workflow ตัวอย่าง

### เคส: ออกฟีเจอร์ใหม่ "Options Chain UI"
```
1. Code     → ทำ /api/options/aggregate (มีอยู่แล้ว ✅)
2. Cursor   → เขียน formatStrike(), formatGreek() + smoke tests
3. Desktop  → ออกแบบ OptionsChainTable component (ใช้ formatters + API)
4. Code     → deploy + verify บน production
```

### เคส: แก้ bug "/api/funding 500"
```
1. Code     → แก้ + deploy (one session ทำได้คนเดียว — ไม่ต้องดึงคนอื่น)
2. Cursor   → ถ้าเกี่ยวกับ shared util ให้เพิ่ม regression test
```

### เคส: ตัดสิน palette (Phosphor vs Bloomberg)
```
1. User     → ดู /bloomberg-preview vs /
2. User     → บอก Desktop ใน chat
3. Desktop  → migrate tokens + log ใน STATUS
4. Code     → ลบ /bloomberg-preview + bloomberg/* ถ้าตัดสินใช้ Phosphor
```

---

## 🚀 Onboarding prompt (paste ที่ session ใหม่)

ดูไฟล์ [docs/SESSION-PROMPTS.md](./docs/SESSION-PROMPTS.md) — มี prompt สำเร็จรูปสำหรับทั้ง 3 sessions

---

## 📞 ติดต่อกัน

**ไม่มี real-time channel** — สื่อสารผ่านไฟล์เท่านั้น:
- [STATUS.md](./STATUS.md) — กระดานหลัก (อ่าน + เขียนทุกคน)
- [SESSIONS.md](./SESSIONS.md) — ไฟล์นี้ (อ่านอย่างเดียว)
- [SYNC.md](./SYNC.md) — template สำหรับ sync รายงานยาว
- [HANDOFF.md](./HANDOFF.md) — context ส่งต่อระหว่าง sessions

User เป็น orchestrator — ถ้า session A อยากให้ session B ทำอะไร ให้บอก user แล้ว user จะส่งต่อให้
