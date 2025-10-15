import { Request, Response, NextFunction } from 'express';
import { z, ZodError, ZodSchema } from 'zod';
import { logger } from './logging.js';

/**
 * Validation Middleware
 *
 * Centralized request validation using Zod schemas.
 * Provides type-safe input validation for all API endpoints.
 */

/**
 * Validation target (where to validate)
 */
export type ValidationTarget = 'body' | 'query' | 'params';

/**
 * Create validation middleware for a Zod schema
 *
 * @param schema - Zod schema to validate against
 * @param target - Request property to validate (body, query, or params)
 * @returns Express middleware function
 *
 * @example
 * ```typescript
 * const createLibrarySchema = z.object({
 *   name: z.string().min(1).max(255),
 *   type: z.enum(['movies', 'tvshows', 'music']),
 *   path: z.string().min(1)
 * });
 *
 * router.post('/libraries',
 *   validateRequest(createLibrarySchema, 'body'),
 *   libraryController.create
 * );
 * ```
 */
export function validateRequest(schema: ZodSchema, target: ValidationTarget = 'body') {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      // Get the data to validate based on target
      const dataToValidate = req[target];

      // Validate the data
      const validated = schema.parse(dataToValidate);

      // Replace the request data with validated (and potentially transformed) data
      (req as any)[target] = validated;

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        // Format Zod validation errors for API response
        const formattedErrors = error.issues.map(err => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code,
        }));

        logger.warn('Request validation failed', {
          target,
          errors: formattedErrors,
          path: req.path,
          method: req.method,
        });

        res.status(400).json({
          error: 'Validation failed',
          details: formattedErrors,
        });
        return;
      }

      // Unexpected error during validation
      logger.error('Unexpected error during validation', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      res.status(500).json({
        error: 'Internal server error during validation',
      });
    }
  };
}

/**
 * Common validation schemas for reuse across controllers
 */
export const commonSchemas = {
  /**
   * Positive integer ID parameter
   */
  idParam: z.object({
    id: z.string().regex(/^\d+$/, 'ID must be a positive integer').transform(Number),
  }),

  /**
   * Library ID parameter
   */
  libraryIdParam: z.object({
    libraryId: z.string().regex(/^\d+$/, 'Library ID must be a positive integer').transform(Number),
  }),

  /**
   * Movie ID parameter
   */
  movieIdParam: z.object({
    movieId: z.string().regex(/^\d+$/, 'Movie ID must be a positive integer').transform(Number),
  }),

  /**
   * Pagination query parameters
   */
  paginationQuery: z.object({
    page: z.string().optional().transform(val => (val ? parseInt(val, 10) : 1)),
    limit: z.string().optional().transform(val => (val ? parseInt(val, 10) : 50)),
  }),

  /**
   * Boolean query parameter
   */
  booleanQuery: (key: string) =>
    z.object({
      [key]: z
        .string()
        .optional()
        .transform(val => val === 'true' || val === '1'),
    }),
};

/**
 * Path validation utility
 *
 * Validates file paths to prevent directory traversal attacks
 */
export function validatePath(filePath: string, allowedBasePath?: string): boolean {
  // Basic checks
  if (!filePath || typeof filePath !== 'string') {
    return false;
  }

  // Check for directory traversal patterns
  const dangerousPatterns = [
    /\.\.\//,  // ../
    /\.\.\\/,  // ..\
    /\/\.\./,  // /..
    /\\\.\./,  // \..
  ];

  if (dangerousPatterns.some(pattern => pattern.test(filePath))) {
    return false;
  }

  // If allowed base path provided, verify the resolved path starts with it
  if (allowedBasePath) {
    const path = require('path');
    const resolved = path.resolve(filePath);
    const allowed = path.resolve(allowedBasePath);

    if (!resolved.startsWith(allowed)) {
      return false;
    }
  }

  return true;
}

/**
 * Sanitize string input to prevent XSS and SQL injection
 *
 * Note: This is a basic sanitization. For HTML content, use a dedicated library like DOMPurify.
 */
export function sanitizeString(input: string): string {
  if (typeof input !== 'string') {
    return '';
  }

  // Remove null bytes
  let sanitized = input.replace(/\0/g, '');

  // Trim whitespace
  sanitized = sanitized.trim();

  return sanitized;
}

/**
 * Validate and sanitize file path
 */
export const filePathSchema = z
  .string()
  .min(1, 'Path is required')
  .refine(
    path => validatePath(path),
    'Invalid path: potential directory traversal detected'
  )
  .transform(sanitizeString);

/**
 * Validate library type
 */
export const libraryTypeSchema = z.enum(['movie', 'tv', 'music']);

/**
 * Validate asset type
 */
export const assetTypeSchema = z.enum(['poster', 'fanart', 'banner', 'logo', 'trailer']);
