// Zod schemas for every request. Controllers pull the parsed, typed value off
// res.locals and inject the hardcoded COMPANY_ID (single-tenant) — so no request
// carries companyId.

import { z } from 'zod';
import { coerceDate, coerceTime, pick } from '../lib/dateparse';

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');
const timeStr = z.string().regex(/^\d{2}:\d{2}$/, 'expected HH:mm');
const phoneStr = z.string().min(6).max(20);

// Lenient wrappers: accept full datetimes / natural strings from callers we do
// not control, coercing to the canonical format before the strict check runs.
const flexibleDate = z.preprocess((v) => coerceDate(v) ?? v, dateStr);
const flexibleTime = z.preprocess((v) => coerceTime(v) ?? v, timeStr);

export const servicesQuery = z.object({
  bookableOnly: z.coerce.boolean().optional(),
});

export const stylistsQuery = z.object({
  serviceId: z.string().optional(),
});

// Availability accepts many caller-specific param names/shapes (LiveKit sends
// startTime/endTime as full timestamps, etc.). We normalise them here. If no date
// at all is supplied, the service defaults to the next 7 days — never a hard error.
export const availabilityQuery = z.preprocess((raw) => {
  const q = (raw ?? {}) as Record<string, unknown>;
  const date = coerceDate(pick(q, ['date', 'day', 'on', 'when', 'appointmentDate', 'appointment_date', 'dateISO']));
  const dateFrom = coerceDate(pick(q, ['dateFrom', 'date_from', 'from', 'startDate', 'start_date', 'start', 'startTime', 'start_time', 'startDateTime', 'startAt']));
  const dateTo = coerceDate(pick(q, ['dateTo', 'date_to', 'to', 'endDate', 'end_date', 'end', 'endTime', 'end_time', 'endDateTime', 'endAt']));

  const out: Record<string, unknown> = {
    serviceId: pick(q, ['serviceId', 'service', 'serviceID', 'service_id']),
    stylistId: pick(q, ['stylistId', 'stylist', 'stylistID', 'stylist_id']),
    partOfDay: pick(q, ['partOfDay', 'part_of_day', 'timeOfDay']),
    limit: pick(q, ['limit', 'count', 'max']),
  };
  if (date) out.date = date;
  if (dateFrom) out.dateFrom = dateFrom;
  if (dateTo) out.dateTo = dateTo;
  return out;
}, z.object({
  serviceId: z.string().min(1),
  date: dateStr.optional(),
  dateFrom: dateStr.optional(),
  dateTo: dateStr.optional(),
  stylistId: z.string().optional(),
  partOfDay: z.enum(['morning', 'afternoon', 'evening']).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(6),
}));

export const createBookingBody = z.object({
  serviceId: z.string().min(1),
  stylistId: z.string().min(1),
  date: flexibleDate,
  start: flexibleTime,
  customer: z.object({
    name: z.string().min(1),
    phone: phoneStr,
    email: z.string().email().optional(),
  }),
  notes: z.string().max(500).optional(),
  source: z.enum(['voice_agent', 'manual', 'web']).default('voice_agent'),
});

export const findBookingQuery = z
  .object({
    phone: phoneStr.optional(),
    reference: z.string().optional(),
  })
  .refine((v) => v.phone || v.reference, {
    message: 'provide phone or reference',
  });

export const cancelBookingBody = z.object({
  reason: z.string().min(1),
});

export const rescheduleBookingBody = z.object({
  date: flexibleDate,
  start: flexibleTime,
  stylistId: z.string().min(1),
});

export const createMessageBody = z.object({
  category: z.enum(['bridal', 'complaint', 'health_query', 'reschedule_late', 'other']),
  name: z.string().min(1),
  phone: phoneStr,
  email: z.string().email().optional(),
  note: z.string().min(1).max(1000),
});

export const confirmationBody = z.object({
  bookingId: z.string().min(1),
  channels: z.array(z.enum(['email'])).min(1).default(['email']),
});

export const resolveDateBody = z.object({
  phrase: z.string().min(1),
});

// ── Admin ──────────────────────────────────────────────────────────────
export const adminBookingsQuery = z.object({
  from: dateStr.optional(),
  to: dateStr.optional(),
  status: z.enum(['confirmed', 'cancelled', 'completed', 'no_show']).optional(),
});

export const adminMessagesQuery = z.object({
  status: z.enum(['open', 'handled']).optional(),
});

export const adminBlockBody = z.object({
  stylistId: z.string().nullable().optional(),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  reason: z.string().min(1),
});
