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
 *     summary: Static tenant facts (hours, address, walk-in policy). Cache aggressively.
 *     responses:
 *       200: { description: Business info with spoken hours }
 */
router.get('/business', asyncHandler(getBusiness));

/**
 * @openapi
 * /services:
 *   get:
 *     tags: [Read]
 *     summary: Service menu with prices, durations, and the stylists who perform each.
 *     parameters:
 *       - { name: bookableOnly, in: query, schema: { type: boolean }, description: Only phone-bookable services }
 *     responses:
 *       200: { description: Services list }
 */
router.get('/services', validate(servicesQuery, 'query'), asyncHandler(getServices));

/**
 * @openapi
 * /stylists:
 *   get:
 *     tags: [Read]
 *     summary: Stylists and their skills. Never returns availability.
 *     parameters:
 *       - { name: serviceId, in: query, schema: { type: string }, description: Filter to those who perform it }
 *     responses:
 *       200: { description: Stylists list }
 */
router.get('/stylists', validate(stylistsQuery, 'query'), asyncHandler(getStylists));

export default router;
