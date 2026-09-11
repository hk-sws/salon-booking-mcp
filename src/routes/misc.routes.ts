import { Router } from 'express';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../middleware/errorHandler';
import { idempotency } from '../middleware/idempotency';
import { createMessageBody, confirmationBody, resolveDateBody } from '../validators/schemas';
import { postMessage, postConfirmation, postResolveDate, getHealth } from '../controllers/misc.controller';

const router = Router();

/**
 * @openapi
 * /messages:
 *   post:
 *     tags: [Escalation]
 *     summary: Take a message for staff (the escalation catch-all).
 *     description: >
 *       Records anything the agent cannot handle — bridal enquiries, complaints,
 *       health/scalp questions, late cancellations, or other. Stored with status
 *       `open` for staff to action. Accepts an `Idempotency-Key`.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [category, name, phone, note]
 *             properties:
 *               category:
 *                 type: string
 *                 enum: [bridal, complaint, health_query, reschedule_late, other]
 *                 description: >
 *                   Reason bucket. `bridal` = package enquiry, `complaint`,
 *                   `health_query` = scalp/allergy/medical, `reschedule_late` = a
 *                   change refused for being inside the window, `other` = anything else.
 *               name: { type: string, description: "Caller's name." }
 *               phone: { type: string, description: "Callback number." }
 *               email: { type: string, description: "Optional callback email." }
 *               note:
 *                 type: string
 *                 description: What the caller wants, in their words (max 1000 chars).
 *     responses:
 *       201: { description: "`{ messageId, spoken }` — confirm a callback to the caller." }
 */
router.post('/messages',
  validate(createMessageBody, 'body'), idempotency('create_message'), asyncHandler(postMessage));

/**
 * @openapi
 * /notifications/confirmation:
 *   post:
 *     tags: [Notifications]
 *     summary: Send a booking confirmation email.
 *     description: >
 *       Renders and sends a confirmation for an existing booking via the configured
 *       provider (console / SMTP / Brevo). Kept separate from booking creation so a
 *       send failure never rolls back a valid booking — failures are reported
 *       per-channel with `ok: false`. Accepts an `Idempotency-Key`.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [bookingId]
 *             properties:
 *               bookingId:
 *                 type: string
 *                 example: bkg_7fa2c1
 *                 description: The booking to confirm. Its customer email is the recipient.
 *               channels:
 *                 type: array
 *                 items: { type: string, enum: [email] }
 *                 default: [email]
 *                 description: >
 *                   Delivery channels. Currently only `email` is supported; defaults
 *                   to `["email"]` if omitted.
 *     responses:
 *       202: { description: "`{ bookingId, results[], spoken }` — per-channel send status." }
 *       404: { description: "BOOKING_NOT_FOUND." }
 */
router.post('/notifications/confirmation',
  validate(confirmationBody, 'body'), idempotency('send_confirmation'), asyncHandler(postConfirmation));

/**
 * @openapi
 * /resolve-date:
 *   post:
 *     tags: [Helper]
 *     summary: Turn a spoken date phrase into a calendar date.
 *     description: >
 *       Resolves phrases like "today", "tomorrow", "the day after tomorrow",
 *       "next Thursday", "in 3 days", or an ISO date, using the tenant timezone as
 *       "now". Call this before `/availability` whenever the caller does not give an
 *       exact date — the agent must never compute dates itself. Ambiguous input
 *       returns `confident: false` with a `clarifySpoken` prompt to read back.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [phrase]
 *             properties:
 *               phrase:
 *                 type: string
 *                 example: next Thursday
 *                 description: The caller's spoken date phrase, verbatim.
 *     responses:
 *       200: { description: "`{ date, dateSpoken, confident }`, or `confident:false` + `clarifySpoken`." }
 */
router.post('/resolve-date', validate(resolveDateBody, 'body'), asyncHandler(postResolveDate));

/**
 * @openapi
 * /health:
 *   get:
 *     tags: [Ops]
 *     summary: Liveness probe.
 *     description: Returns service status, uptime in seconds, and the active Firestore mode. No parameters.
 *     responses:
 *       200: { description: "`{ status: 'ok', uptime, firestore }`." }
 */
router.get('/health', getHealth);

export default router;
