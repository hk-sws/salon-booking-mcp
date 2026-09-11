// Idempotency for POST endpoints. Voice calls drop mid-turn and agents retry;
// without this one caller gets three bookings.
//
// Usage: attach `idempotency(endpointName)` to a POST route. On a repeated
// Idempotency-Key (same tenant + endpoint) we replay the stored status+body.
// A handler records its result by calling res.locals.saveIdempotent(status, body).

import { Request, Response, NextFunction } from 'express';
import { collections } from '../models/collections';
import { DateTime } from 'luxon';

const TTL_HOURS = 24;

export function idempotency(endpoint: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const key = req.header('Idempotency-Key');
    const companyId = (req.body && req.body.companyId) || 'unknown';

    if (!key) {
      // No key: proceed without replay protection but keep the API shape.
      res.locals.saveIdempotent = async () => {};
      return next();
    }

    const docId = `${companyId}:${endpoint}:${key}`;
    const ref = collections.idempotency().doc(docId);
    const snap = await ref.get();

    if (snap.exists) {
      const rec = snap.data()!;
      const age = DateTime.utc().diff(DateTime.fromISO(rec.createdAt), 'hours').hours;
      if (age <= TTL_HOURS) {
        res.status(rec.statusCode).json(rec.response);
        return; // replay — do not run the handler again
      }
      await ref.delete(); // stale, fall through
    }

    res.locals.saveIdempotent = async (statusCode: number, response: unknown) => {
      await ref.set({
        key,
        companyId,
        endpoint,
        response,
        statusCode,
        createdAt: DateTime.utc().toISO()!,
      });
    };
    next();
  };
}
