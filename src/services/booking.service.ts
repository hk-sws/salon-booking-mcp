import { db } from '../config/firestore';
import { collections, getDoc } from '../models/collections';
import { Block, Booking, Company, Service, Stylist } from '../models/types';
import { ApiError } from '../lib/errors';
import { id, bookingReference } from '../lib/ids';
import {
  DateTime, dateRange, hoursUntil, localToUtcISO, timeToMinutes, weekdayOf,
} from '../lib/time';
import { dateToWords, referenceToWords, timeToWords } from '../lib/spoken';
import { requireCompany } from './company.service';
import { requireService } from './service.service';
import { requireStylist } from './stylist.service';
import { resolveContext, slotsForStylistDate } from './availability.service';

function toMs(iso: string): number {
  return DateTime.fromISO(iso, { zone: 'utc' }).toMillis();
}

/** Confirm the requested (date, start, stylist) is a real, open slot. */
function assertSlotIsValid(
  company: Company,
  service: Service,
  stylist: Stylist,
  date: string,
  start: string,
  bookings: Booking[],
  blocks: Block[]
): { startAt: string; endAt: string } {
  const nowMs = DateTime.now().setZone(company.timezone).toMillis();
  const day = weekdayOf(date, company.timezone);
  const hours = stylist.hoursOverride.find((h) => h.day === day) ??
    company.hours.find((h) => h.day === day);

  if (!hours || !hours.openTime || !hours.closeTime) {
    throw new ApiError('CLOSED_ON_DAY', `Closed on ${day}`,
      `We are closed that day. Shall I look at another day?`);
  }
  const startM = timeToMinutes(start);
  const endM = startM + service.durationMinutes!;
  if (startM < timeToMinutes(hours.openTime) || endM > timeToMinutes(hours.closeTime)) {
    throw new ApiError('OUTSIDE_BUSINESS_HOURS', `Slot ${start} outside hours`,
      'That time is outside our opening hours. Shall I suggest another?');
  }

  const startAt = localToUtcISO(date, start, company.timezone);
  const endAt = localToUtcISO(date, `${String(Math.floor(endM / 60)).padStart(2, '0')}:${String(endM % 60).padStart(2, '0')}`, company.timezone);

  if (toMs(startAt) < nowMs) {
    throw new ApiError('SLOT_IN_PAST', `Slot ${date} ${start} is in the past`,
      'That time has already passed. Shall I look for a later one?');
  }

  const sMs = toMs(startAt);
  const eMs = toMs(endAt);
  const clash =
    bookings.some((b) => b.stylistId === stylist.id && sMs < toMs(b.endAt) && toMs(b.startAt) < eMs) ||
    blocks.some((bl) => (bl.stylistId === null || bl.stylistId === stylist.id) &&
      sMs < toMs(bl.endAt) && toMs(bl.startAt) < eMs);
  if (clash) {
    const alternatives = alternativesFor(company, service, stylist, date, bookings, blocks, 2);
    throw new ApiError('SLOT_TAKEN', `Slot ${date} ${start} already taken`,
      alternatives.length
        ? 'That time was just taken. I have other options if you would like.'
        : 'That time was just taken, and I do not have another nearby. Shall I check other days?',
      { alternatives });
  }

  return { startAt, endAt };
}

/** A couple of nearby open slots for the same stylist, for counter-offers. */
function alternativesFor(
  company: Company, service: Service, stylist: Stylist,
  fromDate: string, bookings: Booking[], blocks: Block[], limit: number
) {
  const nowMs = DateTime.now().setZone(company.timezone).toMillis();
  const dates = dateRange(fromDate, DateTime.fromISO(fromDate).plus({ days: 4 }).toFormat('yyyy-MM-dd'));
  const styBookings = bookings.filter((b) => b.stylistId === stylist.id);
  const styBlocks = blocks.filter((bl) => bl.stylistId === null || bl.stylistId === stylist.id);
  const slots = dates.flatMap((d) =>
    slotsForStylistDate(company, stylist, service.durationMinutes!, d, styBookings, styBlocks, nowMs)
  );
  return slots.slice(0, limit).map((s) => ({
    date: s.date, start: s.start, stylistId: s.stylistId, spoken: s.spoken,
  }));
}

async function loadConfirmed(companyId: string) {
  const [bSnap, blSnap] = await Promise.all([
    collections.bookings().where('companyId', '==', companyId).where('status', '==', 'confirmed').get(),
    collections.blocks().where('companyId', '==', companyId).get(),
  ]);
  return { bookings: bSnap.docs.map((d) => d.data()), blocks: blSnap.docs.map((d) => d.data()) };
}

export interface CreateBookingInput {
  companyId: string; serviceId: string; stylistId: string;
  date: string; start: string;
  customer: { name: string; phone: string; email?: string };
  notes?: string; source: 'voice_agent' | 'manual' | 'web';
}

export async function createBooking(input: CreateBookingInput) {
  const { company, service, candidates } = await resolveContext(
    input.companyId, input.serviceId, input.stylistId
  );
  const stylist = candidates[0];
  const { bookings, blocks } = await loadConfirmed(input.companyId);

  const { startAt, endAt } = assertSlotIsValid(
    company, service, stylist, input.date, input.start, bookings, blocks
  );

  // Transaction guards against a slot taken between validation and write.
  const bookingId = id('bkg');
  const reference = bookingReference();
  const booking: Booking = {
    id: bookingId, reference, companyId: input.companyId,
    serviceId: input.serviceId, stylistId: input.stylistId,
    startAt, endAt, status: 'confirmed',
    customerName: input.customer.name, customerPhone: input.customer.phone,
    customerEmail: input.customer.email ?? null, notes: input.notes ?? null,
    source: input.source, createdAt: DateTime.utc().toISO()!,
    cancelledAt: null, cancelReason: null,
  };

  await db.runTransaction(async (tx) => {
    const clashSnap = await tx.get(
      collections.bookings()
        .where('companyId', '==', input.companyId)
        .where('stylistId', '==', input.stylistId)
        .where('status', '==', 'confirmed')
    );
    const sMs = toMs(startAt), eMs = toMs(endAt);
    const clash = clashSnap.docs.some((d) => {
      const b = d.data();
      return sMs < toMs(b.endAt) && toMs(b.startAt) < eMs;
    });
    if (clash) {
      const alts = alternativesFor(company, service, stylist, input.date, bookings, blocks, 2);
      throw new ApiError('SLOT_TAKEN', 'Slot taken during write',
        'That time was just taken. I have other options if you would like.',
        { alternatives: alts });
    }
    tx.set(collections.bookings().doc(bookingId), booking);
  });

  return {
    bookingId,
    reference,
    referenceSpoken: referenceToWords(reference),
    status: 'confirmed' as const,
    confirmedSpoken: `${service.name} with ${stylist.name} on ${dateToWords(input.date)} at ${timeToWords(input.start)}`,
  };
}

export async function findBookings(companyId: string, phone?: string, reference?: string) {
  const company = await requireCompany(companyId);
  let q = collections.bookings().where('companyId', '==', companyId).where('status', '==', 'confirmed');
  if (phone) q = q.where('customerPhone', '==', phone);
  const snap = await q.get();

  const nowMs = Date.now();
  let rows = snap.docs.map((d) => d.data())
    .filter((b) => (reference ? b.reference === reference : true))
    .filter((b) => toMs(b.startAt) >= nowMs)
    .sort((a, b) => toMs(a.startAt) - toMs(b.startAt));

  const [svcSnap, stySnap] = await Promise.all([
    collections.services().where('companyId', '==', companyId).get(),
    collections.stylists().where('companyId', '==', companyId).get(),
  ]);
  const svcName = new Map(svcSnap.docs.map((d) => [d.id, d.data().name]));
  const styName = new Map(stySnap.docs.map((d) => [d.id, d.data().name]));

  const bookings = rows.map((b) => {
    const local = DateTime.fromISO(b.startAt, { zone: 'utc' }).setZone(company.timezone);
    const date = local.toFormat('yyyy-MM-dd');
    const start = local.toFormat('HH:mm');
    const hrs = hoursUntil(b.startAt);
    return {
      bookingId: b.id, reference: b.reference,
      serviceName: svcName.get(b.serviceId) ?? b.serviceId,
      stylistName: styName.get(b.stylistId) ?? b.stylistId,
      date, start,
      spoken: `${svcName.get(b.serviceId)} with ${styName.get(b.stylistId)} on ${dateToWords(date)} at ${timeToWords(start)}`,
      withinCancellationWindow: hrs <= company.cancellationWindowHours,
      hoursUntil: hrs,
    };
  });

  return { bookings, count: bookings.length };
}

async function requireBooking(companyId: string, bookingId: string): Promise<Booking> {
  const b = await getDoc(collections.bookings(), bookingId);
  if (!b || b.companyId !== companyId) {
    throw new ApiError('BOOKING_NOT_FOUND', `Booking ${bookingId} not found`,
      'I could not find that appointment.');
  }
  return b;
}

export async function cancelBooking(companyId: string, bookingId: string, reason: string) {
  const company = await requireCompany(companyId);
  const booking = await requireBooking(companyId, bookingId);

  if (hoursUntil(booking.startAt) <= company.cancellationWindowHours) {
    throw new ApiError('WITHIN_CANCELLATION_WINDOW',
      `Booking ${bookingId} within cancellation window`,
      `That appointment is within ${company.cancellationWindowHours} hours, so I will pass this to a team member to sort out.`,
      { action: 'CREATE_MESSAGE' });
  }

  await collections.bookings().doc(bookingId).update({
    status: 'cancelled', cancelledAt: DateTime.utc().toISO()!, cancelReason: reason,
  });

  return {
    bookingId, status: 'cancelled' as const,
    spoken: 'That is cancelled for you. Is there anything else?',
  };
}

export async function rescheduleBooking(
  companyId: string, bookingId: string,
  date: string, start: string, stylistId: string
) {
  const company = await requireCompany(companyId);
  const booking = await requireBooking(companyId, bookingId);

  if (hoursUntil(booking.startAt) <= company.cancellationWindowHours) {
    throw new ApiError('WITHIN_CANCELLATION_WINDOW',
      `Booking ${bookingId} within cancellation window`,
      `That appointment is within ${company.cancellationWindowHours} hours, so I will pass this to a team member to sort out.`,
      { action: 'CREATE_MESSAGE' });
  }

  const service = await requireService(companyId, booking.serviceId);
  const stylist = await requireStylist(companyId, stylistId);
  if (!stylist.serviceIds.includes(service.id)) {
    throw new ApiError('STYLIST_SERVICE_MISMATCH',
      `Stylist ${stylistId} does not perform ${service.id}`,
      `${stylist.name} does not do that service.`,
      { qualifiedStylists: [] });
  }

  const { bookings, blocks } = await loadConfirmed(companyId);
  const others = bookings.filter((b) => b.id !== bookingId);
  const { startAt, endAt } = assertSlotIsValid(company, service, stylist, date, start, others, blocks);

  await collections.bookings().doc(bookingId).update({ startAt, endAt, stylistId });

  return {
    bookingId, status: 'confirmed' as const,
    rescheduledSpoken: `Moved to ${dateToWords(date)} at ${timeToWords(start)} with ${stylist.name}`,
  };
}
