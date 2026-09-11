import { Router } from 'express';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../middleware/errorHandler';
import { adminBookingsQuery, adminMessagesQuery, adminBlockBody } from '../validators/schemas';
import {
  getAdminBookings, getAdminMessages, postAdminBlock, postAdminSeed,
} from '../controllers/admin.controller';

const router = Router();

/**
 * @openapi
 * /admin/bookings:
 *   get:
 *     tags: [Admin]
 *     summary: Full booking list for humans (not agents).
 *     description: >
 *       Returns bookings of any status, sorted by start time — for dashboards/ops, not
 *       for voice agents. All filters are optional and combine (AND).
 *     parameters:
 *       - name: from
 *         in: query
 *         required: false
 *         schema: { type: string, example: '2026-09-01' }
 *         description: Only bookings starting on/after this date, `YYYY-MM-DD`.
 *       - name: to
 *         in: query
 *         required: false
 *         schema: { type: string, example: '2026-09-30' }
 *         description: Only bookings starting on/before this date, `YYYY-MM-DD`.
 *       - name: status
 *         in: query
 *         required: false
 *         schema: { type: string, enum: [confirmed, cancelled, completed, no_show] }
 *         description: Filter by booking status. Omit for all statuses.
 *     responses:
 *       200: { description: "`{ bookings[], count }`." }
 */
router.get('/admin/bookings', validate(adminBookingsQuery, 'query'), asyncHandler(getAdminBookings));

/**
 * @openapi
 * /admin/messages:
 *   get:
 *     tags: [Admin]
 *     summary: Escalation messages for staff.
 *     description: Lists messages taken via /messages, newest first.
 *     parameters:
 *       - name: status
 *         in: query
 *         required: false
 *         schema: { type: string, enum: [open, handled] }
 *         description: Filter by handling status. `open` = not yet actioned. Omit for all.
 *     responses:
 *       200: { description: "`{ messages[], count }`." }
 */
router.get('/admin/messages', validate(adminMessagesQuery, 'query'), asyncHandler(getAdminMessages));

/**
 * @openapi
 * /admin/blocks:
 *   post:
 *     tags: [Admin]
 *     summary: Add a holiday, sick day, or break.
 *     description: >
 *       Creates a block that removes overlapping slots from availability. Scope it to
 *       one stylist or the whole business. Times are absolute UTC instants.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [startAt, endAt, reason]
 *             properties:
 *               stylistId:
 *                 type: string
 *                 nullable: true
 *                 example: sty_priya
 *                 description: Stylist this block applies to. `null`/omitted = whole business closed.
 *               startAt:
 *                 type: string
 *                 format: date-time
 *                 example: '2026-09-20T04:30:00.000Z'
 *                 description: Block start as an ISO-8601 UTC timestamp.
 *               endAt:
 *                 type: string
 *                 format: date-time
 *                 example: '2026-09-20T14:30:00.000Z'
 *                 description: Block end as an ISO-8601 UTC timestamp.
 *               reason:
 *                 type: string
 *                 example: Priya on leave
 *                 description: Human-readable reason (for staff/audit).
 *     responses:
 *       201: { description: "`{ blockId, block }`." }
 */
router.post('/admin/blocks', validate(adminBlockBody, 'body'), asyncHandler(postAdminBlock));

/**
 * @openapi
 * /admin/seed:
 *   post:
 *     tags: [Admin]
 *     summary: Reset the tenant to seed data (workshops/demos).
 *     description: >
 *       DESTRUCTIVE. Deletes this tenant's services, stylists, bookings, blocks, and
 *       messages, then re-creates the Bloom Salon fixture (with fresh future bookings).
 *       Also clears the read cache. Takes no parameters.
 *     responses:
 *       200: { description: "`{ ok: true, message }`." }
 */
router.post('/admin/seed', asyncHandler(postAdminSeed));

export default router;
