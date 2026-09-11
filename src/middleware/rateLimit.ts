import rateLimit from 'express-rate-limit';

// 100 requests / minute / IP by default (env-tunable).
export const rateLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000),
  max: Number(process.env.RATE_LIMIT_MAX ?? 100),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      error: 'RATE_LIMITED',
      message: 'Too many requests',
      spoken: 'Sorry, things are busy right now. Please try again in a moment.',
    });
  },
});
