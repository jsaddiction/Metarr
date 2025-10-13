import { z } from 'zod';

/**
 * Media Player Validation Schemas
 *
 * Zod schemas for validating media player-related requests
 */

/**
 * Valid media player types
 */
export const mediaPlayerTypeSchema = z.enum(['kodi', 'jellyfin', 'plex']);

/**
 * Create/update media player request body
 */
export const createMediaPlayerSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255).trim(),
  type: mediaPlayerTypeSchema,
  host: z.string().min(1, 'Host is required').max(255).trim(),
  port: z.number().int().min(1).max(65535, 'Port must be between 1 and 65535'),
  username: z.string().max(255).optional(),
  password: z.string().max(255).optional(),
  apiKey: z.string().max(500).optional(),
  useHttps: z.boolean().optional().default(false),
  enabled: z.boolean().optional().default(true),
});

/**
 * Update media player request body (all fields optional)
 */
export const updateMediaPlayerSchema = createMediaPlayerSchema.partial();

/**
 * Test connection request body (for testing before saving)
 */
export const testConnectionSchema = z.object({
  type: mediaPlayerTypeSchema,
  host: z.string().min(1).max(255).trim(),
  port: z.number().int().min(1).max(65535),
  username: z.string().max(255).optional(),
  password: z.string().max(255).optional(),
  apiKey: z.string().max(500).optional(),
  useHttps: z.boolean().optional().default(false),
});

/**
 * Notify player request body
 */
export const notifyPlayerSchema = z.object({
  action: z.enum(['scan', 'cleanLibrary', 'updateLibrary']),
  libraryPath: z.string().min(1).optional(),
});
