import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../lib/errors';

/** Wrap an async handler so thrown errors reach the error middleware. */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ApiError) {
    res.status(err.statusCode).json(err.toResponse());
    return;
  }
  // Never leak a stack trace into `spoken`.
  console.error('[unhandled]', err);
  res.status(500).json({
    error: 'INTERNAL_ERROR',
    message: err instanceof Error ? err.message : 'Unknown error',
    spoken: 'Something went wrong on my side. Please try again in a moment.',
  });
}

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({
    error: 'NOT_FOUND',
    message: 'Route not found',
    spoken: 'I could not find what you were looking for.',
  });
}
