import { describe, expect, it } from "vitest";
import {
  claimDueBriefSlot,
  parseBkkSchedules,
  type BriefScheduleState,
} from "./brief-schedule.js";

function utcForBkk(isoDate: string, hour: number, minute: number): number {
  return Date.UTC(
    Number(isoDate.slice(0, 4)),
    Number(isoDate.slice(5, 7)) - 1,
    Number(isoDate.slice(8, 10)),
    hour - 7,
    minute,
  );
}

function state(): BriefScheduleState {
  return { dateBkk: null, firedSlotKeys: new Set() };
}

describe("parseBkkSchedules", () => {
  it("defaults to morning 06:30 and newyork 19:00", () => {
    expect(parseBkkSchedules({})).toEqual([
      { hour: 6, minute: 30, key: "morning@06:30", profile: "morning" },
      { hour: 19, minute: 0, key: "newyork@19:00", profile: "newyork" },
    ]);
  });

  it("maps plain 06:30 to morning and 19:00 to newyork", () => {
    expect(parseBkkSchedules({ times: "06:30,19:00" })).toEqual([
      { hour: 6, minute: 30, key: "morning@06:30", profile: "morning" },
      { hour: 19, minute: 0, key: "newyork@19:00", profile: "newyork" },
    ]);
  });

  it("parses explicit profile mappings in both directions", () => {
    expect(parseBkkSchedules({ times: "newyork@06:30,06:30@morning,morning@19:00" })).toEqual([
      { hour: 6, minute: 30, key: "morning@06:30", profile: "morning" },
      { hour: 6, minute: 30, key: "newyork@06:30", profile: "newyork" },
      { hour: 19, minute: 0, key: "morning@19:00", profile: "morning" },
    ]);
  });

  it("legacy hour/minute returns one morning schedule", () => {
    expect(parseBkkSchedules({ times: "06:30,19:00", legacyHour: "8", legacyMinute: "5" })).toEqual([
      { hour: 8, minute: 5, key: "morning@08:05", profile: "morning" },
    ]);
  });

  it("deduplicates by profile and time, then sorts by time and profile", () => {
    expect(parseBkkSchedules({ times: "19:00,newyork@19:00,morning@06:30,06:30@morning,newyork@06:30" })).toEqual([
      { hour: 6, minute: 30, key: "morning@06:30", profile: "morning" },
      { hour: 6, minute: 30, key: "newyork@06:30", profile: "newyork" },
      { hour: 19, minute: 0, key: "newyork@19:00", profile: "newyork" },
    ]);
  });
});

describe("claimDueBriefSlot", () => {
  it("claims 06:30 as morning and does not duplicate the same slot", () => {
    const schedules = parseBkkSchedules({});
    const s = state();
    const first = claimDueBriefSlot(utcForBkk("2026-05-08", 6, 30), schedules, s);
    const second = claimDueBriefSlot(utcForBkk("2026-05-08", 6, 31), schedules, s);

    expect(first?.profile).toBe("morning");
    expect(first?.key).toBe("morning@06:30");
    expect(second).toBeNull();
  });

  it("allows morning and newyork slots on the same BKK date", () => {
    const schedules = parseBkkSchedules({});
    const s = state();

    const morning = claimDueBriefSlot(utcForBkk("2026-05-08", 6, 30), schedules, s);
    const newyork = claimDueBriefSlot(utcForBkk("2026-05-08", 19, 0), schedules, s);
    const duplicateNewyork = claimDueBriefSlot(utcForBkk("2026-05-08", 19, 1), schedules, s);

    expect(morning?.profile).toBe("morning");
    expect(newyork?.profile).toBe("newyork");
    expect(duplicateNewyork).toBeNull();
  });
});
