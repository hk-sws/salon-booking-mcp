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
 *     summary: Create a booking. Re-validates the slot server-side. Idempotent.
 *     parameters:
 *       - { in: header, name: Idempotency-Key, schema: { type: string } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [companyId, serviceId, stylistId, date, start, customer]
 *             properties:
 *               companyId: { type: string, example: salon-01 }
 *               serviceId: { type: string, example: svc_highlights }
 *               stylistId: { type: string, example: sty_priya }
 *               date: { type: string, example: '2026-09-15' }
 *               start: { type: string, example: '10:00' }
 *               customer:
 *                 type: object
 *                 properties:
 *                   name: { type: string }
 *                   phone: { type: string }
 *                   email: { type: string }
 *               notes: { type: string }
 *               source: { type: string, enum: [voice_agent, manual, web] }
 *     responses:
 *       201: { description: Confirmed booking }
 *       409: { description: Slot taken, with alternatives }
 */
router.post('/bookings',
  validate(createBookingBody, 'body'), idempotency('create_booking'), asyncHandler(postBooking));

/**
 * @openapi
 * /bookings/find:
 *   get:
 *     tags: [Bookings]
 *     summary: Upcoming confirmed bookings for a phone number (or exact reference).
 *     parameters:
 *       - $ref: '#/components/parameters/companyId'
 *       - { name: phone, in: query, schema: { type: string } }
 *       - { name: reference, in: query, schema: { type: string } }
 *     responses:
 *       200: { description: Bookings with withinCancellationWindow computed }
 */
router.get('/bookings/find',
  validate(findBookingQuery, 'query'), asyncHandler(getFindBookings));

/**
 * @openapi
 * /bookings/{id}/cancel:
 *   post:
 *     tags: [Bookings]
 *     summary: Cancel a booking. 422 with action=CREATE_MESSAGE if inside the window.
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: string } }
 *       - { in: header, name: Idempotency-Key, schema: { type: string } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [companyId, reason]
 *             properties:
 *               companyId: { type: string }
 *               reason: { type: string }
 *     responses:
 *       200: { description: Cancelled }
 *       422: { description: Within cancellation window }
 */
router.post('/bookings/:id/cancel',
  validate(cancelBookingBody, 'body'), idempotency('cancel_booking'), asyncHandler(postCancel));

/**
 * @openapi
 * /bookings/{id}/reschedule:
 *   post:
 *     tags: [Bookings]
 *     summary: Move a booking atomically to a new validated slot.
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: string } }
 *       - { in: header, name: Idempotency-Key, schema: { type: string } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [companyId, date, start, stylistId]
 *             properties:
 *               companyId: { type: string }
 *               date: { type: string }
 *               start: { type: string }
 *               stylistId: { type: string }
 *     responses:
 *       200: { description: Rescheduled }
 *       422: { description: Within cancellation window }
 */
router.post('/bookings/:id/reschedule',
  validate(rescheduleBookingBody, 'body'), idempotency('reschedule_booking'), asyncHandler(postReschedule));

export default router;
