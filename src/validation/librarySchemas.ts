import { z } from 'zod';
import { filePathSchema, libraryTypeSchema } from '../middleware/validation.js';

/**
 * Library Validation Schemas
 *
 * Zod schemas for validating library-related requests
 */

/**
 * Create library request body
 */
export const createLibrarySchema = z.object({
  name: z.string()
    .min(1, 'Name is required')
    .max(255, 'Name must be 255 characters or less')
    .trim(),
  type: libraryTypeSchema,
  path: filePathSchema,
});

/**
 * Update library request body
 */
export const updateLibrarySchema = z.object({
  name: z.string()
    .min(1, 'Name is required')
    .max(255, 'Name must be 255 characters or less')
    .trim()
    .optional(),
  path: filePathSchema.optional(),
});

/**
 * Library scan request body
 */
export const scanLibrarySchema = z.object({
  force: z.boolean().optional().default(false),
  rescan: z.boolean().optional().default(false),
});

/**
 * Library stats query parameters
 */
export const libraryStatsQuery = z.object({
  includeUnknown: z.string()
    .optional()
    .transform(val => val === 'true' || val === '1'),
});
