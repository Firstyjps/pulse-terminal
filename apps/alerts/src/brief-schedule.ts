export type BriefProfile = "morning" | "newyork";

export interface BkkSchedule {
  hour: number;
  minute: number;
  key: string;
  profile: BriefProfile;
}

export interface BriefScheduleState {
  dateBkk: string | null;
  firedSlotKeys: Set<string>;
}

export function parseBkkSchedules(opts: {
  times?: string;
  legacyHour?: string;
  legacyMinute?: string;
}): BkkSchedule[] {
  if (opts.legacyHour != null || opts.legacyMinute != null) {
    const hour = parseBoundedInt(opts.legacyHour, 6, 0, 23);
    const minute = parseBoundedInt(opts.legacyMinute, 30, 0, 59);
    return [makeSchedule("morning", hour, minute)];
  }

  const parsed = (opts.times ?? "")
    .split(",")
    .map((raw) => parseScheduleToken(raw))
    .filter((x): x is BkkSchedule => x != null);

  if (parsed.length > 0) return dedupeSchedules(parsed);

  return [
    makeSchedule("morning", 6, 30),
    makeSchedule("newyork", 19, 0),
  ];
}

export function claimDueBriefSlot(
  now: number,
  schedules: BkkSchedule[],
  state: BriefScheduleState,
): BkkSchedule | null {
  const bkkNow = new Date(now + 7 * 60 * 60_000);
  const dateBkk = bkkNow.toISOString().slice(0, 10);
  const hour = bkkNow.getUTCHours();
  const minute = bkkNow.getUTCMinutes();

  if (state.dateBkk !== dateBkk) {
    state.dateBkk = dateBkk;
    state.firedSlotKeys.clear();
  }

  const due = dedupeSchedules(schedules).find(
    (schedule) =>
      schedule.hour === hour &&
      minute >= schedule.minute &&
      !state.firedSlotKeys.has(schedule.key),
  );

  if (!due) return null;
  state.firedSlotKeys.add(due.key);
  return due;
}

function parseScheduleToken(raw: string): BkkSchedule | null {
  const token = raw.trim();
  if (token === "") return null;

  const parts = token.split("@").map((part) => part.trim());
  if (parts.length === 2) {
    const leftProfile = parseProfile(parts[0]);
    if (leftProfile) return parseExplicitSchedule(leftProfile, parts[1]);

    const rightProfile = parseProfile(parts[1]);
    if (rightProfile) return parseExplicitSchedule(rightProfile, parts[0]);

    return null;
  }

  if (parts.length !== 1) return null;

  const time = parseBkkTime(parts[0]);
  if (!time) return null;
  const profile: BriefProfile = time.hour === 19 && time.minute === 0 ? "newyork" : "morning";
  return makeSchedule(profile, time.hour, time.minute);
}

function parseExplicitSchedule(profile: BriefProfile, rawTime: string): BkkSchedule | null {
  const time = parseBkkTime(rawTime);
  if (!time) return null;
  return makeSchedule(profile, time.hour, time.minute);
}

function parseProfile(raw: string): BriefProfile | null {
  const normalized = raw.trim().toLowerCase();
  return normalized === "morning" || normalized === "newyork" ? normalized : null;
}

function parseBkkTime(raw: string): { hour: number; minute: number } | null {
  const m = raw.trim().match(/^(\d{1,2})(?::(\d{1,2}))?$/);
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = m[2] == null ? 0 : Number(m[2]);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null;
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

function dedupeSchedules(schedules: BkkSchedule[]): BkkSchedule[] {
  const byKey = new Map<string, BkkSchedule>();
  for (const schedule of schedules) {
    if (!byKey.has(schedule.key)) byKey.set(schedule.key, schedule);
  }
  return [...byKey.values()].sort(
    (a, b) => a.hour - b.hour || a.minute - b.minute || profileRank(a.profile) - profileRank(b.profile),
  );
}

function profileRank(profile: BriefProfile): number {
  return profile === "morning" ? 0 : 1;
}

function parseBoundedInt(raw: string | undefined, fallback: number, min: number, max: number): number {
  if (raw == null || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) return fallback;
  return n;
}

function makeSchedule(profile: BriefProfile, hour: number, minute: number): BkkSchedule {
  const time = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  return { hour, minute, key: `${profile}@${time}`, profile };
}
