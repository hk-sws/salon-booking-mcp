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
 *     summary: Compute bookable slots. The only source of truth for open times.
 *     description: >
 *       Provide either `date`, or both `dateFrom` and `dateTo` (max 14-day span).
 *       Empty result is a 200 with a `nextAvailable` counter-offer.
 *     parameters:
 *       - { name: serviceId, in: query, required: true, schema: { type: string } }
 *       - { name: date, in: query, schema: { type: string, example: '2026-09-15' } }
 *       - { name: dateFrom, in: query, schema: { type: string } }
 *       - { name: dateTo, in: query, schema: { type: string } }
 *       - { name: stylistId, in: query, schema: { type: string } }
 *       - { name: partOfDay, in: query, schema: { type: string, enum: [morning, afternoon, evening] } }
 *       - { name: limit, in: query, schema: { type: integer, default: 6 } }
 *     responses:
 *       200: { description: Slots (possibly empty with nextAvailable) }
 *       403: { description: Service not bookable by phone }
 *       400: { description: Stylist-service mismatch or bad range }
 */
router.get('/availability', validate(availabilityQuery, 'query'), asyncHandler(checkAvailability));

export default router;
