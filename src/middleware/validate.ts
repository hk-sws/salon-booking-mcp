import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';
import { ApiError } from '../lib/errors';

type Source = 'query' | 'body' | 'params';

/** Validate one request source with a Zod schema; parsed value -> res.locals[source]. */
export function validate(schema: ZodSchema, source: Source) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const first = result.error.issues[0];
      const field = first.path.join('.') || source;
      // Log the raw payload so unexpected caller shapes (e.g. LiveKit) are visible.
      console.warn(`[validate] ${req.method} ${req.originalUrl} ${source} rejected:`,
        JSON.stringify(req[source]));
      throw new ApiError(
        'VALIDATION_ERROR',
        `Invalid ${source}: ${field} — ${first.message}`,
        'Sorry, I did not catch that correctly. Could you say it again?',
        { issues: result.error.issues }
      );
    }
    res.locals[source] = result.data;
    next();
  };
}
