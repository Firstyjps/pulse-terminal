/**
 * Time formatting helpers — Pulse Terminal is anchored on ICT (Asia/Bangkok,
 * GMT+7) since the project owner trades from that timezone. All user-facing
 * clocks, timestamps, and date strings should route through these helpers
 * unless the surface is explicitly UTC-anchored (e.g. a session-window label
 * that names UTC hours by definition).
 */

const TZ = "Asia/Bangkok";

const _hms = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
  timeZone: TZ,
});

const _hm = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: TZ,
});

const _date = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: TZ,
});

/** "HH:MM:SS" in ICT. */
export function fmtTimeICT(d: Date | number | string): string {
  return _hms.format(new Date(d));
}

/** "HH:MM" in ICT. */
export function fmtTimeShortICT(d: Date | number | string): string {
  return _hm.format(new Date(d));
}

/** "YYYY·MM·DD" in ICT (centered-dot separator matches terminal status bar). */
export function fmtDateICT(d: Date | number | string): string {
  return _date.format(new Date(d)).replace(/-/g, "·");
}

/** "YYYY-MM-DD" in ICT (ISO-style separator). */
export function fmtDateIsoICT(d: Date | number | string): string {
  return _date.format(new Date(d));
}

/** Hour 0-23 in ICT (used for session windows / hourly buckets). */
export function getHourICT(d: Date | number | string): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: TZ }).format(
      new Date(d),
    ),
  );
}
