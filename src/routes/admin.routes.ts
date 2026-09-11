import { Router } from 'express';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../middleware/errorHandler';
import {
  adminBookingsQuery, adminMessagesQuery, adminBlockBody, adminSeedQuery,
} from '../validators/schemas';
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
 *     parameters:
 *       - $ref: '#/components/parameters/companyId'
 *       - { name: from, in: query, schema: { type: string } }
 *       - { name: to, in: query, schema: { type: string } }
 *       - { name: status, in: query, schema: { type: string, enum: [confirmed, cancelled, completed, no_show] } }
 *     responses:
 *       200: { description: Bookings }
 */
router.get('/admin/bookings', validate(adminBookingsQuery, 'query'), asyncHandler(getAdminBookings));

/**
 * @openapi
 * /admin/messages:
 *   get:
 *     tags: [Admin]
 *     summary: Escalation messages.
 *     parameters:
 *       - $ref: '#/components/parameters/companyId'
 *       - { name: status, in: query, schema: { type: string, enum: [open, handled] } }
 *     responses:
 *       200: { description: Messages }
 */
router.get('/admin/messages', validate(adminMessagesQuery, 'query'), asyncHandler(getAdminMessages));

/**
 * @openapi
 * /admin/blocks:
 *   post:
 *     tags: [Admin]
 *     summary: Add a holiday, sick day, or break.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [companyId, startAt, endAt, reason]
 *             properties:
 *               companyId: { type: string }
 *               stylistId: { type: string, nullable: true }
 *               startAt: { type: string, format: date-time }
 *               endAt: { type: string, format: date-time }
 *               reason: { type: string }
 *     responses:
 *       201: { description: Block created }
 */
router.post('/admin/blocks', validate(adminBlockBody, 'body'), asyncHandler(postAdminBlock));

/**
 * @openapi
 * /admin/seed:
 *   post:
 *     tags: [Admin]
 *     summary: Reset the tenant to seed data (workshops/demos).
 *     parameters:
 *       - $ref: '#/components/parameters/companyId'
 *     responses:
 *       200: { description: Reset done }
 */
router.post('/admin/seed', validate(adminSeedQuery, 'query'), asyncHandler(postAdminSeed));

export default router;
