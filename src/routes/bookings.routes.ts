import { Router } from 'express';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../middleware/errorHandler';
import { idempotency } from '../middleware/idempotency';
import {
  createBookingBody, findBookingQuery, cancelBookingBody, rescheduleBookingBody,
} from '../validators/schemas';
import {
  postBooking, getFindBookings, postCancel, postReschedule,
} from '../controllers/bookings.controller';

const router = Router();

/**
 * @openapi
 * /bookings:
 *   post:
 *     tags: [Bookings]
 *     summary: Create a booking (server re-validates the slot; idempotent).
 *     description: >
 *       Books an appointment. The server re-checks everything — stylist performs the
 *       service, the day is open, the slot fits business hours, it is not in the past,
 *       and it is still free (inside a transaction) — because an agent may send a
 *       slot taken seconds ago. On conflict returns `409 SLOT_TAKEN` with `alternatives`.
 *       Send an `Idempotency-Key` header so a retried call returns the original booking
 *       instead of creating a duplicate.
 *     parameters:
 *       - in: header
 *         name: Idempotency-Key
 *         required: false
 *         schema: { type: string, example: booking-abc-123 }
 *         description: >
 *           Unique key for this booking attempt. On replay with the same key, the
 *           original 201 response is returned and no second booking is made. Strongly
 *           recommended for voice agents (calls drop and retry mid-turn).
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [serviceId, stylistId, date, start, customer]
 *             properties:
 *               serviceId:
 *                 type: string
 *                 example: svc_highlights
 *                 description: Service to book; sets the appointment duration.
 *               stylistId:
 *                 type: string
 *                 example: sty_priya
 *                 description: Stylist to book. Must perform `serviceId`, else 400 STYLIST_SERVICE_MISMATCH.
 *               date:
 *                 type: string
 *                 example: '2026-09-15'
 *                 description: Local appointment date, `YYYY-MM-DD` (tenant timezone).
 *               start:
 *                 type: string
 *                 example: '10:00'
 *                 description: Local start time, `HH:mm` (24h). End time is derived from the service duration.
 *               customer:
 *                 type: object
 *                 required: [name, phone]
 *                 description: Who the appointment is for.
 *                 properties:
 *                   name: { type: string, description: "Customer's name (used in the confirmation)." }
 *                   phone: { type: string, description: "Contact phone; also the key for /bookings/find." }
 *                   email: { type: string, description: "Optional; required only if you later email a confirmation." }
 *               notes:
 *                 type: string
 *                 description: Optional free-text note (max 500 chars), e.g. "first visit".
 *               source:
 *                 type: string
 *                 enum: [voice_agent, manual, web]
 *                 description: Where the booking originated. Defaults to `voice_agent`.
 *     responses:
 *       201: { description: "`{ bookingId, reference, referenceSpoken, status, confirmedSpoken }`." }
 *       400: { description: "Validation error, closed day, outside hours, or STYLIST_SERVICE_MISMATCH." }
 *       409: { description: "SLOT_TAKEN — includes `alternatives[]` to offer instead." }
 */
router.post('/bookings',
  validate(createBookingBody, 'body'), idempotency('create_booking'), asyncHandler(postBooking));

/**
 * @openapi
 * /bookings/find:
 *   get:
 *     tags: [Bookings]
 *     summary: Find a caller's upcoming confirmed bookings.
 *     description: >
 *       Returns upcoming confirmed bookings, soonest first. Look up by `phone`
 *       (all upcoming for that number) or `reference` (one exact booking) — at least
 *       one is required. Each result includes `withinCancellationWindow` and
 *       `hoursUntil`, computed server-side so the agent never does date math.
 *     parameters:
 *       - name: phone
 *         in: query
 *         required: false
 *         schema: { type: string, example: '9876543210' }
 *         description: Customer phone number. Returns all their upcoming bookings.
 *       - name: reference
 *         in: query
 *         required: false
 *         schema: { type: string, example: B729 }
 *         description: Short human reference (e.g. "B729") for an exact-match lookup.
 *     responses:
 *       200: { description: "`{ bookings[], count }`. `withinCancellationWindow=true` ⇒ agent must escalate to cancel." }
 *       400: { description: "Neither phone nor reference supplied." }
 */
router.get('/bookings/find',
  validate(findBookingQuery, 'query'), asyncHandler(getFindBookings));

/**
 * @openapi
 * /bookings/{id}/cancel:
 *   post:
 *     tags: [Bookings]
 *     summary: Cancel a booking (escalates if inside the cancellation window).
 *     description: >
 *       Cancels the booking. If it starts within the tenant's cancellation window
 *       (e.g. 24h), it is NOT cancelled — returns `422 WITHIN_CANCELLATION_WINDOW`
 *       with `details.action = "CREATE_MESSAGE"`, telling the agent to take a message
 *       for staff instead. Accepts an `Idempotency-Key`.
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, example: bkg_7fa2c1 }
 *         description: The booking id (from create or /bookings/find).
 *       - in: header
 *         name: Idempotency-Key
 *         required: false
 *         schema: { type: string }
 *         description: Optional replay-safe key; a repeat returns the original response.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [reason]
 *             properties:
 *               reason:
 *                 type: string
 *                 example: Caller cancelled by phone
 *                 description: Why it's being cancelled (stored for staff/audit).
 *     responses:
 *       200: { description: "`{ bookingId, status: 'cancelled', spoken }`." }
 *       404: { description: "BOOKING_NOT_FOUND." }
 *       422: { description: "WITHIN_CANCELLATION_WINDOW — escalate via /messages." }
 */
router.post('/bookings/:id/cancel',
  validate(cancelBookingBody, 'body'), idempotency('cancel_booking'), asyncHandler(postCancel));

/**
 * @openapi
 * /bookings/{id}/reschedule:
 *   post:
 *     tags: [Bookings]
 *     summary: Move a booking to a new, re-validated slot (atomic).
 *     description: >
 *       Validates the new slot (stylist performs the service, open day, fits hours,
 *       not in the past, still free) and then moves the booking. The same
 *       cancellation-window rule as cancel applies (422 if too close). Atomic — the
 *       caller is never left with zero bookings if the new slot fails.
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, example: bkg_7fa2c1 }
 *         description: The booking id to move.
 *       - in: header
 *         name: Idempotency-Key
 *         required: false
 *         schema: { type: string }
 *         description: Optional replay-safe key.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [date, start, stylistId]
 *             properties:
 *               date: { type: string, example: '2026-09-18', description: "New local date, `YYYY-MM-DD`." }
 *               start: { type: string, example: '11:00', description: "New local start time, `HH:mm`." }
 *               stylistId:
 *                 type: string
 *                 example: sty_priya
 *                 description: Stylist for the new slot (may differ from the original; must perform the service).
 *     responses:
 *       200: { description: "`{ bookingId, status: 'confirmed', rescheduledSpoken }`." }
 *       409: { description: "SLOT_TAKEN — the requested new slot is not free." }
 *       422: { description: "WITHIN_CANCELLATION_WINDOW." }
 */
router.post('/bookings/:id/reschedule',
  validate(rescheduleBookingBody, 'body'), idempotency('reschedule_booking'), asyncHandler(postReschedule));

export default router;
