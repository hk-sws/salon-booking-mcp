// Resolve fuzzy spoken date phrases server-side. The agent must never do date
// arithmetic itself. "Now" is in the tenant timezone.

import { DateTime } from 'luxon';
import { dateToWords } from '../lib/spoken';
import { requireCompany } from './company.service';

const WEEKDAYS: Record<string, number> = {
  monday: 1, tuesday: 2, wednesday: 3, thursday: 4,
  friday: 5, saturday: 6, sunday: 7,
  mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 7,
};

interface Resolved {
  date: string | null;
  dateSpoken: string | null;
  confident: boolean;
  clarifySpoken?: string;
}

function ok(dt: DateTime): Resolved {
  const date = dt.toFormat('yyyy-MM-dd');
  return { date, dateSpoken: dateToWords(date), confident: true };
}

export async function resolveDate(companyId: string, phrase: string): Promise<Resolved> {
  const company = await requireCompany(companyId);
  const now = DateTime.now().setZone(company.timezone).startOf('day');
  const p = phrase.trim().toLowerCase();

  if (p === 'today') return ok(now);
  if (p === 'tomorrow') return ok(now.plus({ days: 1 }));
  if (p === 'day after tomorrow' || p === 'the day after tomorrow') return ok(now.plus({ days: 2 }));
  if (p === 'yesterday') return ok(now.minus({ days: 1 }));

  // "in N days"
  const inDays = p.match(/^in (\d+) days?$/);
  if (inDays) return ok(now.plus({ days: Number(inDays[1]) }));

  // ISO date passthrough
  const iso = p.match(/^\d{4}-\d{2}-\d{2}$/);
  if (iso) {
    const dt = DateTime.fromISO(p, { zone: company.timezone });
    if (dt.isValid) return ok(dt);
  }

  // weekday phrases: "thursday", "this thursday", "next thursday"
  const wd = p.match(/^(this|next|coming)?\s*(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)$/);
  if (wd) {
    const modifier = wd[1];
    const target = WEEKDAYS[wd[2]];
    let delta = (target - now.weekday + 7) % 7;
    if (delta === 0) delta = 7; // never "today" for a named weekday
    if (modifier === 'next') {
      // "next X": the X in the following week if this week's is close.
      if (delta <= 6 && !modifier) delta += 7;
      if (delta < 7) delta += 7;
    }
    return ok(now.plus({ days: delta }));
  }

  return {
    date: null,
    dateSpoken: null,
    confident: false,
    clarifySpoken: `Sorry, I did not catch the day. Could you give me a date, like the fifteenth?`,
  };
}
