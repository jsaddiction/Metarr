import { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';

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

    if (recentRequests.length >= maxRequests) {
      res.status(429).json({
        error: 'Too many requests',
        retryAfter: Math.ceil(windowMs / 1000),
      });
      return;
    }

    // Add current request
    recentRequests.push(now);
    next();
  };
};
