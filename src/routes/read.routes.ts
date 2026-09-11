import { Router } from 'express';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../middleware/errorHandler';
import { servicesQuery, stylistsQuery } from '../validators/schemas';
import { getBusiness, getServices, getStylists } from '../controllers/read.controller';

const router = Router();

/**
 * @openapi
 * /business:
 *   get:
 *     tags: [Read]
 *     summary: Static tenant facts — hours, address, walk-in policy.
 *     description: >
 *       Returns rarely-changing facts about the salon: opening hours (per day and as
 *       one collapsed spoken sentence), address, which services allow walk-ins, and
 *       the cancellation window. Every human-readable value has a `*Spoken` twin the
 *       voice agent reads verbatim. Safe to cache aggressively; changes weekly at most.
 *       Takes no parameters — the tenant is fixed server-side.
 *     responses:
 *       200:
 *         description: >
 *           Business info. Key fields: `hours[]` (per-day open/close + `spoken`),
 *           `hoursSpoken` (collapsed sentence), `address`/`addressSpoken`,
 *           `walkInServiceIds`/`walkInSpoken`, `cancellationWindowHours`.
 */
router.get('/business', asyncHandler(getBusiness));

/**
 * @openapi
 * /services:
 *   get:
 *     tags: [Read]
 *     summary: Service menu with prices, durations, and who performs each.
 *     description: >
 *       Lists active services. Each item includes `durationMinutes`/`durationSpoken`,
 *       `startingPrice`/`priceSpoken`, `bookableByPhone`, `walkInAllowed`, and
 *       `stylistIds` (so the agent can answer "who does highlights?" without a second
 *       call). Non-bookable services (e.g. bridal) include an `escalationReason`.
 *     parameters:
 *       - name: bookableOnly
 *         in: query
 *         required: false
 *         schema: { type: boolean }
 *         description: >
 *           When `true`, returns only services that can be booked over the phone
 *           (`bookableByPhone = true`), hiding consultation-only ones like bridal.
 *           Defaults to `false` (return everything).
 *     responses:
 *       200: { description: "Object with `services[]` and a `pricingNoteSpoken` disclaimer." }
 */
router.get('/services', validate(servicesQuery, 'query'), asyncHandler(getServices));

/**
 * @openapi
 * /stylists:
 *   get:
 *     tags: [Read]
 *     summary: Stylists and the services they perform. Never returns availability.
 *     description: >
 *       Lists active stylists with their speciality, the `serviceIds` they perform,
 *       and a `servicesSpoken` sentence. Skills are static; schedules are not — use
 *       `/availability` for open times, never this endpoint.
 *     parameters:
 *       - name: serviceId
 *         in: query
 *         required: false
 *         schema: { type: string, example: svc_highlights }
 *         description: >
 *           Optional service id filter. When provided, returns only stylists who
 *           perform that service (e.g. `svc_highlights` → just Priya). Omit to list
 *           the whole team.
 *     responses:
 *       200: { description: "Object with `stylists[]`." }
 */
router.get('/stylists', validate(stylistsQuery, 'query'), asyncHandler(getStylists));

export default router;
