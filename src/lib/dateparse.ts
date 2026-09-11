// Tolerant date/time coercion for callers we don't control (e.g. LiveKit sends
// full timestamps like "7:07:27 PM September 11, 2026" or ISO datetimes, under
// varying param names). We normalise anything reasonable to YYYY-MM-DD / HH:mm.

import { DateTime } from 'luxon';

const YMD_ANYWHERE = /(\d{4}-\d{2}-\d{2})/;

const DATE_FORMATS = [
  'yyyy-LL-dd', 'LL/dd/yyyy', 'L/d/yyyy', 'dd/LL/yyyy', 'd/L/yyyy',
  'LLLL d, yyyy', 'LLL d, yyyy', 'LLLL d yyyy', 'LLL d yyyy',
  'd LLLL yyyy', 'd LLL yyyy',
  "h:mm:ss a LLLL d, yyyy", "h:mm a LLLL d, yyyy",
  "h:mm:ss a LLLL d yyyy", "h:mm a LLLL d yyyy",
];

/** Coerce arbitrary date-ish input to "YYYY-MM-DD", or undefined if unparseable. */
export function coerceDate(input: unknown): string | undefined {
  if (input == null) return undefined;
  const s = String(input).trim();
  if (!s) return undefined;

  // An ISO date (or datetime) — take the date part directly, no timezone shift.
  const embedded = s.match(YMD_ANYWHERE);
  if (embedded) return embedded[1];

  // Try ISO first, then a battery of common human formats.
  let dt = DateTime.fromISO(s);
  if (dt.isValid) return dt.toFormat('yyyy-LL-dd');
  for (const f of DATE_FORMATS) {
    dt = DateTime.fromFormat(s, f);
    if (dt.isValid) return dt.toFormat('yyyy-LL-dd');
  }

  // Last resort: JS Date (handles many locale strings), then a "Month d, yyyy" slice.
  const js = new Date(s);
  if (!Number.isNaN(js.getTime())) return DateTime.fromJSDate(js).toFormat('yyyy-LL-dd');
  const slice = s.match(/([A-Za-z]{3,9}\.?\s+\d{1,2},?\s+\d{4})/);
  if (slice) {
    const d2 = new Date(slice[1]);
    if (!Number.isNaN(d2.getTime())) return DateTime.fromJSDate(d2).toFormat('yyyy-LL-dd');
  }
  return undefined;
}

/** Coerce arbitrary time-ish input to 24h "HH:mm", or undefined if unparseable. */
export function coerceTime(input: unknown): string | undefined {
  if (input == null) return undefined;
  const s = String(input).trim();
  if (/^\d{2}:\d{2}$/.test(s)) return s;

  // ISO datetime -> take the time part.
  if (/\dT\d/.test(s)) {
    const iso = DateTime.fromISO(s);
    if (iso.isValid) return iso.toFormat('HH:mm');
  }

  // "7:07 PM", "7:07:27 PM ...", "19:07", "7 pm"
  const m = s.match(/(\d{1,2})(?::(\d{2}))?(?::\d{2})?\s*([AaPp][Mm])?/);
  if (m) {
    let h = parseInt(m[1], 10);
    const min = m[2] ?? '00';
    const ap = m[3]?.toLowerCase();
    if (ap === 'pm' && h < 12) h += 12;
    if (ap === 'am' && h === 12) h = 0;
    if (h >= 0 && h <= 23) return `${String(h).padStart(2, '0')}:${min}`;
  }
  return undefined;
}

/** First non-empty value among the given keys of an object. */
export function pick(obj: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) {
    const v = obj?.[k];
    if (v != null && String(v).trim() !== '') return v;
  }
  return undefined;
}
