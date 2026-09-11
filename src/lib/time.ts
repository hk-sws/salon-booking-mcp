// Timezone helpers. Rule: store UTC ISO, present local date/time strings.
// All conversions go through luxon — never by hand.

import { DateTime } from 'luxon';

export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

const WEEKDAY_INDEX: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

/** "HH:mm" -> minutes since midnight. */
export function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** minutes since midnight -> "HH:mm". */
export function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Weekday key ("mon".."sun") for a local date in a timezone. */
export function weekdayOf(dateISO: string, timezone: string): Weekday {
  const dt = DateTime.fromISO(dateISO, { zone: timezone });
  // luxon weekday: 1 = Monday .. 7 = Sunday
  return WEEKDAY_INDEX[dt.weekday - 1];
}

/** Combine a local YYYY-MM-DD + HH:mm in a timezone into a UTC ISO string. */
export function localToUtcISO(date: string, time: string, timezone: string): string {
  const dt = DateTime.fromISO(`${date}T${time}`, { zone: timezone });
  return dt.toUTC().toISO()!;
}

/** UTC ISO -> { date: "YYYY-MM-DD", time: "HH:mm" } in the tenant timezone. */
export function utcToLocal(utcISO: string, timezone: string): { date: string; time: string } {
  const dt = DateTime.fromISO(utcISO, { zone: 'utc' }).setZone(timezone);
  return { date: dt.toFormat('yyyy-MM-dd'), time: dt.toFormat('HH:mm') };
}

/** "Now" in the tenant timezone as a luxon DateTime. */
export function nowInZone(timezone: string): DateTime {
  return DateTime.now().setZone(timezone);
}

/** Whole hours from now until a UTC instant (can be negative if in the past). */
export function hoursUntil(utcISO: string): number {
  const target = DateTime.fromISO(utcISO, { zone: 'utc' });
  const diff = target.diff(DateTime.utc(), 'hours').hours;
  return Math.round(diff);
}

/** Inclusive list of YYYY-MM-DD strings from `from` to `to`. */
export function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  let cur = DateTime.fromISO(from);
  const end = DateTime.fromISO(to);
  while (cur <= end) {
    out.push(cur.toFormat('yyyy-MM-dd'));
    cur = cur.plus({ days: 1 });
  }
  return out;
}

export { DateTime };
