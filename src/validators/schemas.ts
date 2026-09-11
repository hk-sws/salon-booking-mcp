// Zod schemas for every request. Controllers pull the parsed, typed value off
// res.locals so handlers never touch raw req.query / req.body.

import { z } from 'zod';

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');
const timeStr = z.string().regex(/^\d{2}:\d{2}$/, 'expected HH:mm');
const phoneStr = z.string().min(6).max(20);

export const companyIdQuery = z.object({
  companyId: z.string().min(1),
});

export const servicesQuery = z.object({
  companyId: z.string().min(1),
  bookableOnly: z.coerce.boolean().optional(),
});

export const stylistsQuery = z.object({
  companyId: z.string().min(1),
  serviceId: z.string().optional(),
});

export const availabilityQuery = z
  .object({
    companyId: z.string().min(1),
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
  companyId: z.string().min(1),
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
    companyId: z.string().min(1),
    phone: phoneStr.optional(),
    reference: z.string().optional(),
  })
  .refine((v) => v.phone || v.reference, {
    message: 'provide phone or reference',
  });

export const cancelBookingBody = z.object({
  companyId: z.string().min(1),
  reason: z.string().min(1),
});

export const rescheduleBookingBody = z.object({
  companyId: z.string().min(1),
  date: dateStr,
  start: timeStr,
  stylistId: z.string().min(1),
});

export const createMessageBody = z.object({
  companyId: z.string().min(1),
  category: z.enum(['bridal', 'complaint', 'health_query', 'reschedule_late', 'other']),
  name: z.string().min(1),
  phone: phoneStr,
  email: z.string().email().optional(),
  note: z.string().min(1).max(1000),
});

export const confirmationBody = z.object({
  companyId: z.string().min(1),
  bookingId: z.string().min(1),
  channels: z.array(z.enum(['email', 'sms'])).min(1),
});

export const resolveDateBody = z.object({
  companyId: z.string().min(1),
  phrase: z.string().min(1),
});

// ── Admin ──────────────────────────────────────────────────────────────
export const adminBookingsQuery = z.object({
  companyId: z.string().min(1),
  from: dateStr.optional(),
  to: dateStr.optional(),
  status: z.enum(['confirmed', 'cancelled', 'completed', 'no_show']).optional(),
});

export const adminMessagesQuery = z.object({
  companyId: z.string().min(1),
  status: z.enum(['open', 'handled']).optional(),
});

export const adminBlockBody = z.object({
  companyId: z.string().min(1),
  stylistId: z.string().nullable().optional(),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  reason: z.string().min(1),
});

export const adminSeedQuery = z.object({
  companyId: z.string().min(1),
});
