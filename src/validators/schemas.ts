// Zod schemas for every request. Controllers pull the parsed, typed value off
// res.locals and inject the hardcoded COMPANY_ID (single-tenant) — so no request
// carries companyId.

import { z } from 'zod';

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');
const timeStr = z.string().regex(/^\d{2}:\d{2}$/, 'expected HH:mm');
const phoneStr = z.string().min(6).max(20);

export const servicesQuery = z.object({
  bookableOnly: z.coerce.boolean().optional(),
});

export const stylistsQuery = z.object({
  serviceId: z.string().optional(),
});

export const availabilityQuery = z
  .object({
    serviceId: z.string().min(1),
    date: dateStr.optional(),
    dateFrom: dateStr.optional(),
    dateTo: dateStr.optional(),
    stylistId: z.string().optional(),
    partOfDay: z.enum(['morning', 'afternoon', 'evening']).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(6),
  })
  .refine((v) => v.date || (v.dateFrom && v.dateTo), {
    message: 'provide either date, or both dateFrom and dateTo',
  });

export const createBookingBody = z.object({
  serviceId: z.string().min(1),
  stylistId: z.string().min(1),
  date: dateStr,
  start: timeStr,
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
  date: dateStr,
  start: timeStr,
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
