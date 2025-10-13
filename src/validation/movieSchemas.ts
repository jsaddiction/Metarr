import { z } from 'zod';
import { assetTypeSchema } from '../middleware/validation.js';

/**
 * Movie Validation Schemas
 *
 * Zod schemas for validating movie-related requests
 */

/**
 * Update movie metadata request body
 */
export const updateMovieMetadataSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  year: z.number().int().min(1800).max(2100).nullable().optional(),
  plot: z.string().max(10000).nullable().optional(),
  tagline: z.string().max(500).nullable().optional(),
  runtime: z.number().int().min(0).nullable().optional(),
  rating: z.number().min(0).max(10).nullable().optional(),
  votes: z.number().int().min(0).nullable().optional(),
  mpaa_rating: z.string().max(50).nullable().optional(),
  imdb_id: z.string().max(50).nullable().optional(),
  tmdb_id: z.number().int().min(1).nullable().optional(),
  genres: z.array(z.string().max(100)).optional(),
  studios: z.array(z.string().max(255)).optional(),
  directors: z.array(z.string().max(255)).optional(),
  writers: z.array(z.string().max(255)).optional(),
  actors: z.array(z.string().max(255)).optional(),
});

/**
 * Search movies query parameters
 */
export const searchMoviesQuery = z.object({
  query: z.string().min(1, 'Search query is required').max(500),
  year: z.string().optional().transform(val => (val ? parseInt(val, 10) : undefined)),
});

/**
 * Filter movies query parameters
 */
export const filterMoviesQuery = z.object({
  libraryId: z.string().optional().transform(val => (val ? parseInt(val, 10) : undefined)),
  year: z.string().optional().transform(val => (val ? parseInt(val, 10) : undefined)),
  genre: z.string().max(100).optional(),
  rating: z.string().optional().transform(val => (val ? parseFloat(val) : undefined)),
  hasMetadata: z.string()
    .optional()
    .transform(val => val === 'true' || val === '1'),
});

/**
 * Save assets request body
 */
export const saveAssetsSchema = z.object({
  selections: z.record(
    assetTypeSchema,
    z.object({
      url: z.string().url('Invalid asset URL'),
      provider: z.string().min(1, 'Provider is required'),
      width: z.number().int().min(1).optional(),
      height: z.number().int().min(1).optional(),
      language: z.string().max(10).nullable().optional(),
      rating: z.number().min(0).max(10).nullable().optional(),
    })
  ),
  metadata: updateMovieMetadataSchema.optional(),
});

/**
 * Assign unknown file request body
 */
export const assignUnknownFileSchema = z.object({
  fileId: z.number().int().min(1, 'File ID must be a positive integer'),
  fileType: z.enum(['video', 'subtitle', 'nfo']),
});

/**
 * Refresh metadata request body
 */
export const refreshMetadataSchema = z.object({
  force: z.boolean().optional().default(false),
  providers: z.array(z.string().min(1)).optional(),
});

/**
 * Match movie request body
 */
export const matchMovieSchema = z.object({
  providerId: z.string().min(1, 'Provider ID is required').max(100),
  providerName: z.string().min(1, 'Provider name is required').max(100),
  title: z.string().min(1).max(500),
  year: z.number().int().min(1800).max(2100).nullable().optional(),
});
