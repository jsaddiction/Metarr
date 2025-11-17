import { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import { RATE_LIMITS } from '../config/constants.js';

export const securityMiddleware = [
  // Basic security headers
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  }),
];

export const rateLimitByIp = (windowMs: number, maxRequests: number) => {
  const requests = new Map<string, number[]>();

  // Periodic cleanup of old IPs (every 2x window duration)
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    const cutoff = now - windowMs;

    // Remove IPs with no recent requests
    for (const [ip, timestamps] of requests.entries()) {
      // If all timestamps are older than the window, remove the IP
      if (timestamps.length === 0 || timestamps[timestamps.length - 1] < cutoff) {
        requests.delete(ip);
      }
    }

    // Additional safety: if we still have too many IPs, remove oldest entries
    if (requests.size > RATE_LIMITS.MAX_TRACKED_IPS) {
      const sortedEntries = Array.from(requests.entries())
        .sort((a, b) => {
          const aLast = a[1][a[1].length - 1] || 0;
          const bLast = b[1][b[1].length - 1] || 0;
          return aLast - bLast;
        });

      // Remove oldest 10% of IPs
      const toRemove = Math.ceil(requests.size * 0.1);
      for (let i = 0; i < toRemove; i++) {
        requests.delete(sortedEntries[i][0]);
      }
    }
  }, windowMs * 2);

  // Ensure cleanup interval doesn't prevent process exit
  if (cleanupInterval.unref) {
    cleanupInterval.unref();
  }

  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const now = Date.now();
    const windowStart = now - windowMs;

    if (!requests.has(ip)) {
      requests.set(ip, []);
    }

    const ipRequests = requests.get(ip)!;

    // Remove old requests outside the window
    const recentRequests = ipRequests.filter(timestamp => timestamp > windowStart);
    requests.set(ip, recentRequests);

    // Add standard rate limit headers
    const remaining = Math.max(0, maxRequests - recentRequests.length);
    const oldestRequest = recentRequests.length > 0 ? recentRequests[0] : now;
    const resetTime = oldestRequest + windowMs;
    const resetSeconds = Math.ceil((resetTime - now) / 1000);

    res.setHeader('X-RateLimit-Limit', maxRequests.toString());
    res.setHeader('X-RateLimit-Remaining', remaining.toString());
    res.setHeader('X-RateLimit-Reset', resetSeconds.toString());

    if (recentRequests.length >= maxRequests) {
      res.setHeader('Retry-After', resetSeconds.toString());
      res.status(429).json({
        error: 'Too many requests',
        retryAfter: resetSeconds,
        limit: maxRequests,
        windowMs,
      });
      return;
    }

    // Add current request
    recentRequests.push(now);
    next();
  };
};
