// The core endpoint's engine. Pure-ish: fetches company/service/stylists/
// bookings/blocks, then computes bookable slots per the spec's algorithm.

import { collections } from '../models/collections';
import { Block, Booking, Company, DayHours, Service, Stylist } from '../models/types';
import { ApiError } from '../lib/errors';
import {
  DateTime, Weekday, dateRange, localToUtcISO, minutesToTime, timeToMinutes, weekdayOf,
} from '../lib/time';
import { dateToWords, durationToWords, timeToWords } from '../lib/spoken';
import { requireCompany } from './company.service';
import { requireService } from './service.service';

export interface Slot {
  date: string;
  start: string;
  end: string;
  stylistId: string;
  stylistName: string;
  startMs: number;
  endMs: number;
  spoken: string;
}

type PartOfDay = 'morning' | 'afternoon' | 'evening';

export interface AvailabilityParams {
  companyId: string;
  serviceId: string;
  date?: string;
  dateFrom?: string;
  dateTo?: string;
  stylistId?: string;
  partOfDay?: PartOfDay;
  limit: number;
}

/** Business hours for a day, overridden by a stylist's own schedule if present. */
function effectiveHours(
  company: Company,
  stylist: Stylist,
  day: Weekday
): DayHours | null {
  const override = stylist.hoursOverride.find((h) => h.day === day);
  const base = company.hours.find((h) => h.day === day);
  const hours = override ?? base;
  if (!hours || !hours.openTime || !hours.closeTime) return null; // closed
  return hours;
}

function ms(iso: string): number {
  return DateTime.fromISO(iso, { zone: 'utc' }).toMillis();
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

function partOfDayOf(hhmm: string): PartOfDay {
  const h = Number(hhmm.split(':')[0]);
  return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
}

/** Generate candidate slots for one stylist on one local date. */
function slotsForStylistDate(
  company: Company,
  stylist: Stylist,
  duration: number,
  date: string,
  bookings: Booking[],
  blocks: Block[],
  nowMs: number
): Slot[] {
  const day = weekdayOf(date, company.timezone);
  const hours = effectiveHours(company, stylist, day);
  if (!hours) return [];

  const open = timeToMinutes(hours.openTime!);
  const close = timeToMinutes(hours.closeTime!);
  const step = company.slotStepMinutes;

  const out: Slot[] = [];
  for (let t = open; t + duration <= close; t += step) {
    const start = minutesToTime(t);
    const end = minutesToTime(t + duration);
    const startMs = ms(localToUtcISO(date, start, company.timezone));
    const endMs = ms(localToUtcISO(date, end, company.timezone));

    if (startMs < nowMs) continue; // past slot

    const clash =
      bookings.some((b) => overlaps(startMs, endMs, ms(b.startAt), ms(b.endAt))) ||
      blocks.some((bl) => overlaps(startMs, endMs, ms(bl.startAt), ms(bl.endAt)));
    if (clash) continue;

    out.push({
      date,
      start,
      end,
      stylistId: stylist.id,
      stylistName: stylist.name,
      startMs,
      endMs,
      spoken: `${dateToWords(date)} at ${timeToWords(start)} with ${stylist.name}`,
    });
  }
  return out;
}

/** Resolve service + candidate stylists, validating bookability & skill match. */
async function resolveContext(companyId: string, serviceId: string, stylistId?: string) {
  const company = await requireCompany(companyId);
  const service = await requireService(companyId, serviceId);

  if (!service.bookableByPhone) {
    throw new ApiError(
      'SERVICE_NOT_BOOKABLE',
      `Service ${serviceId} is not bookable by phone`,
      service.escalationReason
        ? `That one ${service.escalationReason}, so I will pass it to a team member.`
        : 'That service needs a team member to arrange.',
      { escalationReason: service.escalationReason }
    );
  }
  if (service.durationMinutes == null) {
    throw new ApiError(
      'SERVICE_NOT_BOOKABLE',
      `Service ${serviceId} has no duration`,
      'That service is by consultation only.'
    );
  }

  const stySnap = await collections.stylists().where('companyId', '==', companyId).get();
  let candidates = stySnap.docs
    .map((d) => d.data())
    .filter((s) => s.active && s.serviceIds.includes(serviceId));

  if (stylistId) {
    const chosen = candidates.find((s) => s.id === stylistId);
    if (!chosen) {
      // Distinguish "does not perform" from "does not exist".
      const exists = stySnap.docs.some((d) => d.id === stylistId);
      throw new ApiError(
        exists ? 'STYLIST_SERVICE_MISMATCH' : 'STYLIST_NOT_FOUND',
        exists
          ? `Stylist ${stylistId} does not perform service ${serviceId}`
          : `Stylist ${stylistId} not found`,
        exists
          ? `They do not do that service. ${candidates.map((c) => c.name).join(' or ')} can, if you like.`
          : 'Sorry, I could not find that stylist.',
        { qualifiedStylists: candidates.map((c) => c.id) }
      );
    }
    candidates = [chosen];
  }

  return { company, service, candidates };
}

async function fetchBookingsAndBlocks(companyId: string) {
  const [bSnap, blSnap] = await Promise.all([
    collections.bookings()
      .where('companyId', '==', companyId)
      .where('status', '==', 'confirmed')
      .get(),
    collections.blocks().where('companyId', '==', companyId).get(),
  ]);
  return {
    bookings: bSnap.docs.map((d) => d.data()),
    blocks: blSnap.docs.map((d) => d.data()),
  };
}

/** Compute slots across dates & stylists, deduped and truncated. */
function computeSlots(
  company: Company,
  service: Service,
  candidates: Stylist[],
  dates: string[],
  bookings: Booking[],
  blocks: Block[],
  params: AvailabilityParams,
  nowMs: number
): Slot[] {
  const all: Slot[] = [];
  for (const date of dates) {
    for (const sty of candidates) {
      const styBookings = bookings.filter((b) => b.stylistId === sty.id);
      const styBlocks = blocks.filter((bl) => bl.stylistId === null || bl.stylistId === sty.id);
      all.push(
        ...slotsForStylistDate(
          company, sty, service.durationMinutes!, date, styBookings, styBlocks, nowMs
        )
      );
    }
  }

  let slots = params.partOfDay
    ? all.filter((s) => partOfDayOf(s.start) === params.partOfDay)
    : all;

  // Sort by time, then dedupe (date+start) keeping the earliest-listed stylist.
  slots.sort((a, b) => a.startMs - b.startMs);
  const seen = new Set<string>();
  const deduped: Slot[] = [];
  for (const s of slots) {
    const key = `${s.date}T${s.start}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(s);
  }
  return deduped;
}

function stripSlot(s: Slot) {
  return {
    date: s.date, start: s.start, end: s.end,
    stylistId: s.stylistId, stylistName: s.stylistName, spoken: s.spoken,
  };
}

export async function getAvailability(params: AvailabilityParams) {
  const { company, service, candidates } = await resolveContext(
    params.companyId, params.serviceId, params.stylistId
  );
  const { bookings, blocks } = await fetchBookingsAndBlocks(params.companyId);
  const nowMs = DateTime.now().setZone(company.timezone).toMillis();

  const dates = params.date ? [params.date] : dateRange(params.dateFrom!, params.dateTo!);
  if (dates.length > 14) {
    throw new ApiError(
      'VALIDATION_ERROR',
      'Date span exceeds 14 days',
      'That is too big a range. Could you narrow it to a couple of weeks?'
    );
  }

  const found = computeSlots(company, service, candidates, dates, bookings, blocks, params, nowMs);
  const slots = found.slice(0, params.limit);

  const base = {
    serviceId: service.id,
    serviceName: service.name,
    durationSpoken: durationToWords(service.durationMinutes),
  };

  if (slots.length > 0) {
    return { ...base, slots: slots.map(stripSlot), count: slots.length };
  }

  // Empty is a 200 with a counter-offer: scan forward up to 30 days.
  const lastDate = dates[dates.length - 1];
  let nextAvailable: { date: string; start: string; spoken: string } | undefined;
  let cursor = DateTime.fromISO(lastDate).plus({ days: 1 });
  for (let i = 0; i < 30 && !nextAvailable; i += 14) {
    const scanDates = dateRange(
      cursor.toFormat('yyyy-MM-dd'),
      cursor.plus({ days: 13 }).toFormat('yyyy-MM-dd')
    );
    const more = computeSlots(
      company, service, candidates, scanDates, bookings, blocks,
      { ...params, partOfDay: undefined }, nowMs
    );
    if (more.length) {
      const n = more[0];
      nextAvailable = {
        date: n.date,
        start: n.start,
        spoken: `${dateToWords(n.date)} at ${timeToWords(n.start)}`,
      };
    }
    cursor = cursor.plus({ days: 14 });
  }

  return {
    ...base,
    slots: [],
    count: 0,
    reason: 'NO_SLOTS_IN_RANGE',
    spoken: 'I do not have anything open for that on those days.',
    ...(nextAvailable ? { nextAvailable } : {}),
  };
}

// Exposed for the booking service to re-validate a specific slot server-side.
export { resolveContext, fetchBookingsAndBlocks, slotsForStylistDate };
