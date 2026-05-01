import { describe, expect, it } from "vitest";
import { writeFileSync, unlinkSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadCatalystsForToday } from "./catalysts.js";

// 2026-05-04 02:00 UTC = 09:00 BKK Mon
const MON = new Date("2026-05-04T02:00:00.000Z").getTime();
// 2026-05-05 02:00 UTC = 09:00 BKK Tue
const TUE = new Date("2026-05-05T02:00:00.000Z").getTime();
// 2026-05-09 = Sat (no entries in fixture)
const SAT_EMPTY = new Date("2026-05-09T02:00:00.000Z").getTime();

function tmpJson(content: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), "cat-"));
  const path = join(dir, "catalysts.json");
  writeFileSync(path, JSON.stringify(content), "utf-8");
  return path;
}

describe("loadCatalystsForToday", () => {
  it("returns array for matching BKK date", () => {
    const path = tmpJson({
      "2026-05-04": ["19:30 BKK — US CPI", "21:00 BKK — Powell"],
    });
    const out = loadCatalystsForToday({ now: MON, filePath: path });
    expect(out).toEqual(["19:30 BKK — US CPI", "21:00 BKK — Powell"]);
    unlinkSync(path);
  });

  it("returns empty array when key missing", () => {
    const path = tmpJson({ "2026-05-04": ["only mon"] });
    const out = loadCatalystsForToday({ now: TUE, filePath: path });
    expect(out).toEqual([]);
    unlinkSync(path);
  });

  it("returns empty array when explicit empty list", () => {
    const path = tmpJson({ "2026-05-09": [] });
    const out = loadCatalystsForToday({ now: SAT_EMPTY, filePath: path });
    expect(out).toEqual([]);
    unlinkSync(path);
  });

  it("returns empty array when file missing", () => {
    const out = loadCatalystsForToday({ now: MON, filePath: "/nonexistent/path.json" });
    expect(out).toEqual([]);
  });

  it("returns empty array when JSON malformed", () => {
    const dir = mkdtempSync(join(tmpdir(), "cat-"));
    const path = join(dir, "broken.json");
    writeFileSync(path, "{not json", "utf-8");
    const out = loadCatalystsForToday({ now: MON, filePath: path });
    expect(out).toEqual([]);
    unlinkSync(path);
  });

  it("filters non-string entries silently", () => {
    const path = tmpJson({
      "2026-05-04": ["valid string", 42, null, "another valid"],
    });
    const out = loadCatalystsForToday({ now: MON, filePath: path });
    expect(out).toEqual(["valid string", "another valid"]);
    unlinkSync(path);
  });

  it("uses BKK timezone (UTC+7) for date key", () => {
    // 2026-05-04 18:00 UTC = 2026-05-05 01:00 BKK (Tue)
    const path = tmpJson({
      "2026-05-04": ["mon entry"],
      "2026-05-05": ["tue entry"],
    });
    const out = loadCatalystsForToday({
      now: new Date("2026-05-04T18:00:00.000Z").getTime(),
      filePath: path,
    });
    expect(out).toEqual(["tue entry"]);
    unlinkSync(path);
  });
});
