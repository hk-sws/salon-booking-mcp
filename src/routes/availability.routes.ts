import { Router } from 'express';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../middleware/errorHandler';
import { availabilityQuery } from '../validators/schemas';
import { checkAvailability } from '../controllers/availability.controller';

const router = Router();

/**
 * @openapi
 * /availability:
 *   get:
 *     tags: [Availability]
 *     summary: Compute bookable slots — the only source of truth for open times.
 *     description: >
 *       Computes free slots for a service by intersecting business hours, stylist
 *       schedules, existing bookings, and blocks, then dropping past times. You must
 *       supply the date **either** as a single `date` **or** as a `dateFrom`+`dateTo`
 *       range (max 14 days). Results are sorted by time, de-duplicated across stylists
 *       (earliest kept), and truncated to `limit`. An empty result is a `200` (not an
 *       error) carrying `reason: "NO_SLOTS_IN_RANGE"` and a `nextAvailable` counter-offer.
 *     parameters:
 *       - name: serviceId
 *         in: query
 *         required: true
 *         schema: { type: string, example: svc_haircut }
 *         description: >
 *           Which service to book. Determines slot length (its duration) and the set
 *           of qualified stylists. If the service is consultation-only (not
 *           `bookableByPhone`), returns `403 SERVICE_NOT_BOOKABLE`.
 *       - name: date
 *         in: query
 *         required: false
 *         schema: { type: string, example: '2026-09-15' }
 *         description: >
 *           Single day to search, `YYYY-MM-DD`. Provide this OR `dateFrom`+`dateTo`,
 *           not both.
 *       - name: dateFrom
 *         in: query
 *         required: false
 *         schema: { type: string, example: '2026-09-15' }
 *         description: First day of a date range (inclusive), `YYYY-MM-DD`. Requires `dateTo`.
 *       - name: dateTo
 *         in: query
 *         required: false
 *         schema: { type: string, example: '2026-09-20' }
 *         description: >
 *           Last day of a date range (inclusive), `YYYY-MM-DD`. Requires `dateFrom`.
 *           The span may not exceed 14 days.
 *       - name: stylistId
 *         in: query
 *         required: false
 *         schema: { type: string, example: sty_priya }
 *         description: >
 *           Restrict to one stylist. If given and that stylist does not perform the
 *           service, returns `400 STYLIST_SERVICE_MISMATCH` listing who does. Omit to
 *           search all qualified stylists.
 *       - name: partOfDay
 *         in: query
 *         required: false
 *         schema: { type: string, enum: [morning, afternoon, evening] }
 *         description: >
 *           Optional time-of-day filter. `morning` = before 12:00, `afternoon` =
 *           12:00–16:59, `evening` = 17:00 onward.
 *       - name: limit
 *         in: query
 *         required: false
 *         schema: { type: integer, default: 6, minimum: 1, maximum: 50 }
 *         description: >
 *           Max slots to return (default 6). Keep it small so a voice call is not
 *           flooded with options.
 *     responses:
 *       200:
 *         description: >
 *           `{ serviceId, serviceName, durationSpoken, slots[], count }`. When empty:
 *           `slots: []`, `count: 0`, `reason`, `spoken`, and (if any exists) `nextAvailable`.
 *       400: { description: "Bad range (>14 days) or STYLIST_SERVICE_MISMATCH." }
 *       403: { description: "SERVICE_NOT_BOOKABLE — consultation-only service." }
 */
router.get('/availability', validate(availabilityQuery, 'query'), asyncHandler(checkAvailability));

export default router;
