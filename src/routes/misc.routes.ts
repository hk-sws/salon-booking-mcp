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
 *     summary: Escalation catch-all (bridal, complaint, health query, late reschedule).
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [category, name, phone, note]
 *             properties:
 *               category: { type: string, enum: [bridal, complaint, health_query, reschedule_late, other] }
 *               name: { type: string }
 *               phone: { type: string }
 *               email: { type: string }
 *               note: { type: string }
 *     responses:
 *       201: { description: Message stored }
 */
router.post('/messages',
  validate(createMessageBody, 'body'), idempotency('create_message'), asyncHandler(postMessage));

/**
 * @openapi
 * /notifications/confirmation:
 *   post:
 *     tags: [Notifications]
 *     summary: Send a booking confirmation email. Pluggable providers; failure never fails a booking.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [bookingId]
 *             properties:
 *               bookingId: { type: string }
 *               channels: { type: array, items: { type: string, enum: [email] }, default: [email] }
 *     responses:
 *       202: { description: Per-channel send status }
 */
router.post('/notifications/confirmation',
  validate(confirmationBody, 'body'), idempotency('send_confirmation'), asyncHandler(postConfirmation));

/**
 * @openapi
 * /resolve-date:
 *   post:
 *     tags: [Helper]
 *     summary: Resolve a spoken date phrase ("next Thursday") to an ISO date.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [phrase]
 *             properties:
 *               phrase: { type: string, example: 'next Thursday' }
 *     responses:
 *       200: { description: Resolved date, or confident=false with clarifySpoken }
 */
router.post('/resolve-date', validate(resolveDateBody, 'body'), asyncHandler(postResolveDate));

/**
 * @openapi
 * /health:
 *   get:
 *     tags: [Ops]
 *     summary: Liveness probe.
 *     responses:
 *       200: { description: ok }
 */
router.get('/health', getHealth);

export default router;
