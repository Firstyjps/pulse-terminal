/**
 * Lightweight Charts time formatters anchored on Asia/Bangkok (ICT, GMT+7).
 *
 * Lightweight Charts v4 stores time as Unix seconds and renders the time
 * scale in UTC by default. To make the X-axis ticks and crosshair tooltip
 * read in the project owner's timezone (ICT), we provide a tickMarkFormatter
 * + a localization.timeFormatter that re-format the same UTC instants.
 *
 * Tick positions remain unchanged — only the labels reflect ICT.
 */

import type { Time } from "lightweight-charts";

const TZ = "Asia/Bangkok";

const _hm = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: TZ,
});
const _hms = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
  timeZone: TZ,
});
const _dayMonth = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  timeZone: TZ,
});
const _monthYear = new Intl.DateTimeFormat("en-GB", {
  month: "short",
  year: "2-digit",
  timeZone: TZ,
});
const _year = new Intl.DateTimeFormat("en-GB", {
  year: "numeric",
  timeZone: TZ,
});
const _full = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: TZ,
});

function _toDate(time: Time): Date | null {
  if (typeof time === "number") return new Date(time * 1000);
  if (typeof time === "string") return new Date(time);
  if (time && typeof time === "object" && "year" in time) {
    return new Date(Date.UTC(time.year, time.month - 1, time.day));
  }
  return null;
}

/**
 * X-axis tick label formatter. tickMarkType:
 *   0 = Year, 1 = Month, 2 = DayOfMonth, 3 = Time, 4 = TimeWithSeconds.
 */
export function ictTickFormatter(time: Time, tickMarkType: number): string {
  const d = _toDate(time);
  if (!d) return "";
  switch (tickMarkType) {
    case 0:
      return _year.format(d);
    case 1:
      return _monthYear.format(d);
    case 2:
      return _dayMonth.format(d);
    case 3:
      return _hm.format(d);
    case 4:
      return _hms.format(d);
    default:
      return _hm.format(d);
  }
}

/** Crosshair tooltip "time" label — date + HH:MM in ICT. */
export function ictTimeFormatter(time: Time): string {
  const d = _toDate(time);
  return d ? _full.format(d) : "";
}
