# 🔄 Pulse Terminal · Cross-Session Sync

> Template สำหรับ sync ระหว่าง Claude Code sessions ที่ทำงานคู่ขนาน (VSCode extension ↔ Cursor IDE)
> วาง report ใน Claude อีกฝั่งให้สถานะตรงกัน · อัปเดต-และ-ส่งเมื่อมีอะไรเปลี่ยนแปลงสำคัญเท่านั้น (ไม่ต้อง spam)
> โครงสร้างซ้อนกับ AGENTS.md role protocol ของโปรเจค

---

## Full template

```markdown
# 🔄 Sync · <HH:MM TZ> · <Side> · Role <N>

## 1 · Who / When
- **Side:** [VSCode extension (orchestrator) | Cursor IDE (coder)]
- **Date:** YYYY-MM-DD HH:MM UTC+7
- **AGENTS.md role:** [1-Foundation | 2-UI | 3-Sources | 4-Charts | 5-i18n | 6-Web | 7-Realtime | 8-MCP | cross-cutting]
- **Git:** [no git yet | branch `feat/xyz` @ commit abc123]

## 2 · Δ Changes (since last sync)
**Edits — `file:line, reason ≤ 1 บรรทัด`:**
- `apps/web/components/Foo.tsx:42` — added X because Y
- `packages/sources/src/funding.ts:18` — fixed Z

**Verification run:**
- `pnpm -r typecheck` → ✓ / ✗ (เหตุผล)
- `curl localhost:3000/api/...` → 200 / N bytes
- หรือ "ไม่ได้ test"

## 3 · Runtime status
- **web** :3000 → [up | down | not running]
- **realtime** :8080 → [up | down | not running]
- **alerts** cron → [up · N ticks | down]
- **Last error:** stack trace 1-2 บรรทัด ถ้ามี

## 4 · 🔒 Files locked (ฝั่งอื่นอย่าแตะ)
- `packages/sources/src/anomalies.ts`

## 5 · ✅ Open for other side
- `apps/realtime/**`, `packages/i18n/**`

## 6 · ❓ Open questions / blockers
- _ไม่มี_  **หรือ**
- "Should X return shape A หรือ B?" — รอคำตอบเพื่อ unblock งาน Y

## 7 · → Next intent (≤ 3)
1. Add Vitest + 3 smoke tests ใน `packages/sources/`
2. Wire prompt caching ใน `/api/analyze`
3. ส่ง sync ใหม่หลังเสร็จ #2

## 8 · Notes (free-text)
- "Turbopack ใช้ไม่ได้ — ต้อง `next dev --webpack` เพราะ ..."
- "อย่าลบ `apps/alerts/data/alerts.jsonl` — backtest ต้องใช้ history"
```

---

## TL;DR variant (ใช้เมื่อมีการเปลี่ยนแปลงเล็กน้อย)

```markdown
# 🔄 Sync · 14:32 · Cursor · Role 6

**Δ:** `apps/web/app/api/analyze/route.ts:88` — added Anthropic prompt caching · typecheck ✓
**🔒 locked:** that file (still tweaking)
**→ next:** measure cost reduction in 30min, then unlock
**?:** ไม่มี
```

---

## วิธีใช้

1. **ก่อนเริ่ม batch ใหม่:** ขอให้ Claude อีกฝั่งส่ง sync report ก่อน — `"ส่ง sync report ตาม SYNC.md"`
2. **ระหว่างทำงาน:** ส่งซ้ำทุกครั้งที่ commit / refactor / เปลี่ยน contract
3. **ก่อนเลิก session:** ส่ง final sync บอกว่าจบที่ไหน + ค้างอะไร

เพื่อให้ฝั่งรับเข้าใจง่าย ส่งพร้อมข้อความสั้น เช่น
> "นี่คือ sync report จากฝั่ง Cursor ตอนนี้ฝั่งนี้กำลังทำ X อยู่ คุณช่วย Y ได้ไหม"

หรือ
> "ฝั่ง Cursor พึ่งทำเสร็จตามนี้ ตอนนี้กลับไปทำ Z ต่อได้ไหม"

---

## Conventions

- **เวลา:** UTC+7 เสมอ (Asia/Bangkok) — ไม่ต้องเดา
- **Lock conventions:** lock เฉพาะไฟล์ที่กำลังแก้จริง เพื่อให้ฝั่งอื่นทำงานต่อได้สูงสุด
- **Δ format:** `path:line — reason` คือ minimum, เพิ่ม "expected behaviour" ได้ถ้าเปลี่ยน contract
- **Verification:** ระบุชัดว่ารันอะไร ผลเป็นยังไง — "ไม่ได้ test" ก็โอเคถ้าจริง อย่ามั่ว
- **Role assignment:** ถ้าจะแย่ง role ใน AGENTS.md ขอใน section 6 (Open questions) ก่อน อย่าทำเงียบ
