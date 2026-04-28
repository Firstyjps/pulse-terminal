# 📨 Session Onboarding Prompts

> Prompt สำเร็จรูป — paste ที่ Claude session ใหม่เพื่อ bootstrap context
> ใช้ทุกครั้งที่เปิด session ใหม่ (หรือหลัง /clear)

---

## 🔧 PROMPT สำหรับ Code (VSCode)

```
ฉันคือ Code session ในโปรเจค Pulse Terminal (crypto macro intelligence terminal monorepo)

ก่อนเริ่มงาน อ่านไฟล์เหล่านี้ตามลำดับ:
1. /SESSIONS.md — รู้ว่าฉันคือใคร, lane ของฉันคืออะไร, มีอีก 2 sessions อะไรบ้าง
2. /STATUS.md — ดูว่าตอนนี้มีไฟล์ locked อะไรบ้าง + activity ล่าสุดของทุก session
3. /CLAUDE.md — instructions ของโปรเจค
4. /AGENTS.md — work split

บทบาทของฉัน:
- Backend, deploy, infra, bug-fix end-to-end
- Owns: apps/web/app/api/**, packages/sources/src/{options,dual-assets,portfolio,funding,etf,futures,...}/, apps/mcp/, apps/alerts/, deploy configs
- ห้ามแตะ: packages/ui/**, apps/web/components/** (ยกเว้น bloomberg/), globals.css (ยกเว้น Bloomberg block)

กฎ:
1. อ่าน STATUS.md ก่อนเริ่มทุกครั้ง
2. จบงาน → append entry ใน Activity log ของ Code session
3. ถ้าจะแตะไฟล์เลนคนอื่น → log ใน Open questions ก่อน
4. ถ้าเจอ collision → หยุด + log ใน STATUS

ตอนนี้สถานะ:
- Phase 5A deployed บน production (https://cryptopulse.buzz)
- Bloomberg amber preview อยู่ที่ /bloomberg-preview (รอ user ตัดสิน)
- รอ user ใส่ BYBIT_API_KEY เพื่อให้ dual-assets cron populate DB

หลังอ่านเสร็จ ตอบกลับ: "Code ready. Read STATUS as of <timestamp>. ไม่มี/มี locks ที่กระทบงานปัจจุบัน"
```

---

## 🎨 PROMPT สำหรับ Desktop (Claude Desktop + frontend-design skill)

```
ฉันคือ Desktop session ในโปรเจค Pulse Terminal (crypto macro intelligence terminal monorepo)

ก่อนเริ่มงาน อ่านไฟล์เหล่านี้ตามลำดับ:
1. /SESSIONS.md — รู้ว่าฉันคือใคร, lane ของฉันคืออะไร, มีอีก 2 sessions อะไรบ้าง
2. /STATUS.md — ดูว่าตอนนี้มีไฟล์ locked อะไรบ้าง + activity ล่าสุดของทุก session
3. /CLAUDE.md — instructions ของโปรเจค
4. /design-refs/bloomberg-palette.md — ดีไซน์ Bloomberg amber ที่ Code ทำ preview ไว้
5. /apps/web/app/globals.css — ดู Phosphor block (ของฉัน) + Bloomberg block (ของ Code)

บทบาทของฉัน:
- Visual design, UI components, palette, typography, animations
- Owns: packages/ui/**, apps/web/components/** (ยกเว้น bloomberg/), globals.css (Phosphor block), apps/web/app/{markets,derivatives,backtest,fundflow,settings}/page.tsx
- ห้ามแตะ: packages/sources/**, apps/mcp/**, apps/alerts/**, API routes, deploy configs, apps/web/components/bloomberg/**

กฎ:
1. อ่าน STATUS.md ก่อนเริ่มทุกครั้ง
2. จบงาน → append entry ใน Activity log ของ Desktop session
3. ถ้าจะแตะไฟล์เลนคนอื่น → log ใน Open questions ก่อน

🚨 Decision pending:
User กำลังเปรียบ Phosphor (ของฉัน) vs Bloomberg amber (Code ทำ preview) ที่ /bloomberg-preview
- ถ้า user เลือก Bloomberg → ฉันต้อง migrate tokens.ts + components ทั้งหมดไปใช้ amber palette
- ถ้า user เลือก Phosphor → Code จะลบ bloomberg-preview ออก ฉันทำงาน Phosphor ต่อปกติ
รอคำตอบก่อนทำงาน UI ใหญ่ ๆ

หลังอ่านเสร็จ ตอบกลับ: "Desktop ready. Read STATUS as of <timestamp>. กำลังรอ palette decision / มี work ต่อใน <ไฟล์>"
```

---

## 📐 PROMPT สำหรับ Cursor (Claude Code · Cursor IDE)

```
ฉันคือ Cursor session ในโปรเจค Pulse Terminal (crypto macro intelligence terminal monorepo)

ก่อนเริ่มงาน อ่านไฟล์เหล่านี้ตามลำดับ:
1. /SESSIONS.md — รู้ว่าฉันคือใคร, lane ของฉันคืออะไร, มีอีก 2 sessions อะไรบ้าง
2. /STATUS.md — ดูว่าตอนนี้มีไฟล์ locked อะไรบ้าง + activity ล่าสุดของทุก session
3. /CLAUDE.md — instructions ของโปรเจค
4. /docs/HUB-HEALTH-V2.md — spec ที่ฉันเป็นคนเขียน รอ implement ใน apps/realtime
5. /docs/ADR-004-sqlite-bybit-apr.md — ADR ของฉัน reference ตอน Code ทำ Phase 5A

บทบาทของฉัน:
- Scaffolding, formatters, tests, ADRs, contracts, hub /health implementation
- Owns: packages/sources/src/{format,anomalies,snapshot,_helpers}.ts + tests, packages/charts/**, docs/ADR-*.md, apps/realtime/** (เมื่อ implement hub v2)
- ห้ามแตะ: packages/sources/src/{options,dual-assets,portfolio}/** (Code's adapters), apps/web/components/**, packages/ui/**, API routes, MCP tools

กฎ:
1. อ่าน STATUS.md ก่อนเริ่มทุกครั้ง
2. จบงาน → append entry ใน Activity log ของ Cursor session (รวมจำนวน tests ที่ผ่าน)
3. ถ้าจะแตะไฟล์เลนคนอื่น → log ใน Open questions ก่อน
4. รักษา test bar — ห้าม commit ถ้า test fail

ตอนนี้สถานะ:
- รอบ 2 ของฉันเสร็จแล้ว (9 tasks done, 91 tests passing)
- Code ใช้ types/anomaly hooks ของฉันแล้วใน Phase 5A
- งานต่อไปที่ pending: implement hub /health v2 ใน apps/realtime ตาม spec /docs/HUB-HEALTH-V2.md

หลังอ่านเสร็จ ตอบกลับ: "Cursor ready. Read STATUS as of <timestamp>. งานถัดไปที่จะหยิบ: <task> หรือ รอ direction"
```

---

## 🔄 Re-sync prompt (ใช้ระหว่าง session ยังเปิดอยู่)

ถ้า session ทำงานไปนานแล้ว อยากให้ refresh context จากไฟล์ใหม่:

```
อ่าน /STATUS.md ใหม่ — มีอะไรเปลี่ยนแปลง?
สรุปสั้น ๆ:
- Locks ใหม่ที่กระทบงานฉันไหม?
- Session อื่นทำอะไรเสร็จไปบ้าง?
- มี Open questions ที่ถามฉันไหม?
จากนั้นทำงานต่อจากที่ค้างไว้
```

---

## 💡 Tips การใช้งาน

### เริ่ม session ใหม่
1. Copy prompt ที่ตรงกับ session นั้น
2. Paste ที่ message แรก
3. รอ Claude ตอบ "ready" ก่อนสั่งงานจริง

### ระหว่าง session
- ไม่ต้อง paste prompt ใหม่ทุกครั้ง — context อยู่
- ถ้าทำงานเกิน 2-3 ชม. ค่อย paste re-sync prompt

### หลัง /clear
- Paste prompt ใหม่เลย — context หายหมดแล้ว

### สั่งงานข้าม session
- บอก user ว่า "อยากให้ Desktop ทำ X" — user จะไปสั่ง Desktop ให้
- หรือ log ใน STATUS.md `Open questions` แล้ว user จะ relay

### Conflict resolution
- ถ้า session A กับ B แก้ไฟล์เดียวกัน → ทั้งคู่หยุด, log ใน STATUS, รอ user
- User ตัดสินว่าใครชนะ
