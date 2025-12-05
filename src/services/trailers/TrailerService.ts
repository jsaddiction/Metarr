/**
 * TrailerService
 *
 * Core business logic for trailer operations. Coordinates between trailer candidates,
 * download service, and selection service to provide a complete trailer management system.
 *
 * Responsibilities:
 * - CRUD operations for trailer candidates
 * - Selection/deselection of trailers
 * - User-provided URL handling (auto-select with auto-lock on entity)
 * - File upload handling for local trailers
 * - Coordination with TrailerDownloadService for downloads
 * - Coordination with TrailerSelectionService for scoring
 *
 * Database Tables:
 * - trailer_candidates: Stores all trailer candidates (provider, user, upload sources)
 *   - Tracks selection state (is_selected)
 *   - Links to cache_video_files when downloaded
 *   - Tracks download failures and retry logic
 * - movies: Has trailer_locked field to prevent automation from changing selection
 *
 * Lock Architecture:
 * - Lock is on the ENTITY (movies.trailer_locked), NOT on candidates
 * - When user manually selects a trailer, auto-lock the trailer field
 * - Automation can only change selection if trailer_locked = 0
 * - User can unlock via UI to allow automation to find better trailers
 *
 * @see docs/architecture/TRAILER_SYSTEM.md
 */

import { DatabaseManager } from '../../database/DatabaseManager.js';
import { logger } from '../../middleware/logging.js';
import { createErrorLogContext } from '../../utils/errorHandling.js';
import {
  ResourceNotFoundError,
  ValidationError,
} from '../../errors/index.js';
import { SqlParam } from '../../types/database.js';

/**
 * Trailer candidate from database
 */
export interface TrailerCandidate {
  id: number;
  entity_type: 'movie' | 'episode';
  entity_id: number;

  // Source info
  source_type: 'provider' | 'user' | 'upload';
  source_url: string | null;
  provider_name: string | null;
  provider_video_id: string | null;

  // TMDB metadata (from provider_cache_videos)
  tmdb_name: string | null;
  tmdb_official: boolean;
  tmdb_language: string | null;

  // yt-dlp enriched metadata
  analyzed: boolean;
  ytdlp_metadata: string | null;
  title: string | null;
  duration_seconds: number | null;
  best_width: number | null;
  best_height: number | null;
  estimated_size_bytes: number | null;
  thumbnail_url: string | null;

  // Selection state
  score: number | null;
  is_selected: boolean;
  selected_at: string | null;
  selected_by: string | null;

  // Download state
  cache_video_file_id: number | null;
  downloaded_at: string | null;

  // Failure tracking
  failed_at: string | null;
  failure_reason: string | null;
  retry_after: string | null;

  // Timestamps
  created_at: string;
  updated_at: string;
}

/**
 * Minimal trailer info for current selection
 */
export interface CurrentTrailer {
  id: number;
  source_type: 'provider' | 'user' | 'upload';
  source_url: string | null;
  provider_name: string | null;
  title: string | null;
  duration_seconds: number | null;
  is_locked: boolean;
  cache_video_file_id: number | null;
  cache_file_path: string | null;
}

/**
 * Result from adding a user URL
 */
export interface AddUrlResult {
  candidateId: number;
  isNew: boolean;
  wasSelected: boolean;
}

/**
 * Result from uploading a trailer
 */
export interface UploadResult {
  candidateId: number;
  cacheFileId: number;
  filePath: string;
}

/**
 * TrailerService handles all trailer CRUD operations
 */
export class TrailerService {
  constructor(private readonly db: DatabaseManager) {}

  /**
   * Get current selected trailer for a movie/episode
   *
   * Returns the currently selected trailer with its cache file path if downloaded.
   * The is_locked field comes from the entity (movies.trailer_locked), not from candidates.
   * Returns null if no trailer is selected.
   *
   * @param entityType - Entity type ('movie' or 'episode')
   * @param entityId - Entity ID
   * @returns Current selected trailer or null
   */
  async getTrailer(entityType: 'movie' | 'episode', entityId: number): Promise<CurrentTrailer | null> {
    const conn = this.db.getConnection();

    try {
      // For movies, join with movies table to get trailer_locked
      // For episodes, would join with episodes table (TODO when episodes support trailers)
      if (entityType === 'movie') {
        const result = await conn.get<CurrentTrailer>(
          `SELECT
            tc.id,
            tc.source_type,
            tc.source_url,
            tc.provider_name,
            tc.title,
            tc.duration_seconds,
            m.trailer_locked as is_locked,
            tc.cache_video_file_id,
            cvf.file_path as cache_file_path
           FROM trailer_candidates tc
           LEFT JOIN cache_video_files cvf ON tc.cache_video_file_id = cvf.id
           LEFT JOIN movies m ON tc.entity_id = m.id
           WHERE tc.entity_type = ? AND tc.entity_id = ? AND tc.is_selected = 1`,
          [entityType, entityId]
        );

        return result || null;
      } else {
        // Episodes: no trailer_locked column yet, return is_locked as false
        const result = await conn.get<CurrentTrailer>(
          `SELECT
            tc.id,
            tc.source_type,
            tc.source_url,
            tc.provider_name,
            tc.title,
            tc.duration_seconds,
            0 as is_locked,
            tc.cache_video_file_id,
            cvf.file_path as cache_file_path
           FROM trailer_candidates tc
           LEFT JOIN cache_video_files cvf ON tc.cache_video_file_id = cvf.id
           WHERE tc.entity_type = ? AND tc.entity_id = ? AND tc.is_selected = 1`,
          [entityType, entityId]
        );

        return result || null;
      }
    } catch (error) {
      logger.error('Failed to get current trailer', createErrorLogContext(error, {
        entityType,
        entityId
      }));
      throw error;
    }
  }

  /**
   * Get all trailer candidates for a movie/episode
   *
   * Returns all candidates including selected, unselected, analyzed, and failed.
   * Ordered by score descending (best trailers first), then by selection status.
   *
   * @param entityType - Entity type ('movie' or 'episode')
   * @param entityId - Entity ID
   * @returns Array of trailer candidates
   */
  async getCandidates(entityType: 'movie' | 'episode', entityId: number): Promise<TrailerCandidate[]> {
    const conn = this.db.getConnection();

    try {
      const results = await conn.query<TrailerCandidate>(
        `SELECT * FROM trailer_candidates
         WHERE entity_type = ? AND entity_id = ?
         ORDER BY is_selected DESC, score DESC NULLS LAST, created_at DESC`,
        [entityType, entityId]
      );

      return results;
    } catch (error) {
      logger.error('Failed to get trailer candidates', createErrorLogContext(error, {
        entityType,
        entityId
      }));
      throw error;
    }
  }

  /**
   * Select a trailer candidate
   *
   * Marks a candidate as the selected trailer for the entity.
   * Automatically deselects any previously selected trailer (only one can be selected).
   * Does NOT set is_locked - caller controls lock state.
   *
   * Selection Rules:
   * - Only one trailer can be selected per entity
   * - Previous selection is automatically deselected
   * - Lock state must be managed by caller (UI vs automation)
   *
   * @param entityType - Entity type ('movie' or 'episode')
   * @param entityId - Entity ID
   * @param candidateId - Candidate ID to select
   * @param selectedBy - User or system identifier (e.g., 'user:john', 'enrichment')
   * @returns Success status
   */
  async selectTrailer(
    entityType: 'movie' | 'episode',
    entityId: number,
    candidateId: number,
    selectedBy: string = 'user'
  ): Promise<{ success: boolean }> {
    const conn = this.db.getConnection();

    try {
      // Verify candidate exists and belongs to this entity
      const candidate = await conn.get(
        `SELECT id, entity_type, entity_id FROM trailer_candidates WHERE id = ?`,
        [candidateId]
      );

      if (!candidate) {
        throw new ResourceNotFoundError(
          'trailer_candidate',
          candidateId,
          'Trailer candidate not found',
          { service: 'TrailerService', operation: 'selectTrailer', metadata: { entityType, entityId } }
        );
      }

      if (candidate.entity_type !== entityType || candidate.entity_id !== entityId) {
        throw new ValidationError(
          'Candidate does not belong to the specified entity',
          {
            service: 'TrailerService',
            operation: 'selectTrailer',
            metadata: {
              field: 'candidateId',
              candidateEntityType: candidate.entity_type,
              candidateEntityId: candidate.entity_id,
              requestedEntityType: entityType,
              requestedEntityId: entityId
            }
          }
        );
      }

      // Deselect any currently selected trailer for this entity
      await conn.execute(
        `UPDATE trailer_candidates
         SET is_selected = 0, selected_at = NULL, selected_by = NULL
         WHERE entity_type = ? AND entity_id = ? AND is_selected = 1`,
        [entityType, entityId]
      );

      // Select the new trailer
      await conn.execute(
        `UPDATE trailer_candidates
         SET is_selected = 1, selected_at = CURRENT_TIMESTAMP, selected_by = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [selectedBy, candidateId]
      );

      logger.info('Trailer selected', {
        entityType,
        entityId,
        candidateId,
        selectedBy
      });

      return { success: true };
    } catch (error) {
      logger.error('Failed to select trailer', createErrorLogContext(error, {
        entityType,
        entityId,
        candidateId
      }));
      throw error;
    }
  }

  /**
   * Add user-provided URL as trailer candidate
   *
   * Creates a new trailer candidate from a user-provided URL.
   * Automatically selects it and locks the trailer field on the entity.
   *
   * User URL Rules:
   * - Creates new candidate with source_type = 'user'
   * - Automatically selected (is_selected = 1)
   * - Locks trailer field on entity (e.g., movies.trailer_locked = 1)
   * - Deduplicates by source_url (returns existing if found)
   *
   * @param entityType - Entity type ('movie' or 'episode')
   * @param entityId - Entity ID
   * @param url - Video URL (YouTube, Vimeo, etc.)
   * @param selectedBy - User identifier (e.g., 'user:john')
   * @returns Result with candidateId and status flags
   */
  async addUrl(
    entityType: 'movie' | 'episode',
    entityId: number,
    url: string,
    selectedBy: string = 'user'
  ): Promise<AddUrlResult> {
    const conn = this.db.getConnection();

    try {
      // Check if this URL already exists for this entity
      const existing = await conn.get<{ id: number; is_selected: boolean }>(
        `SELECT id, is_selected FROM trailer_candidates
         WHERE entity_type = ? AND entity_id = ? AND source_url = ?`,
        [entityType, entityId, url]
      );

      if (existing) {
        // URL already exists - select it if not already selected
        if (!existing.is_selected) {
          await this.selectTrailer(entityType, entityId, existing.id, selectedBy);
        }
        // Lock the trailer field on entity
        await this.lockTrailerField(entityType, entityId);

        logger.info('User URL already exists, reusing candidate', {
          entityType,
          entityId,
          candidateId: existing.id,
          url
        });

        return {
          candidateId: existing.id,
          isNew: false,
          wasSelected: existing.is_selected
        };
      }

      // Create new candidate (no is_locked - lock is on entity)
      const result = await conn.execute(
        `INSERT INTO trailer_candidates (
          entity_type, entity_id, source_type, source_url,
          is_selected, selected_at, selected_by,
          created_at, updated_at
        ) VALUES (?, ?, 'user', ?, 1, CURRENT_TIMESTAMP, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [entityType, entityId, url, selectedBy]
      );

      const candidateId = result.insertId!;

      // Deselect any previously selected trailer
      await conn.execute(
        `UPDATE trailer_candidates
         SET is_selected = 0, selected_at = NULL, selected_by = NULL
         WHERE entity_type = ? AND entity_id = ? AND id != ? AND is_selected = 1`,
        [entityType, entityId, candidateId]
      );

      // Lock the trailer field on entity
      await this.lockTrailerField(entityType, entityId);

      logger.info('User URL added as trailer candidate', {
        entityType,
        entityId,
        candidateId,
        url,
        selectedBy
      });

      return {
        candidateId,
        isNew: true,
        wasSelected: false
      };
    } catch (error) {
      logger.error('Failed to add user URL', createErrorLogContext(error, {
        entityType,
        entityId,
        url
      }));
      throw error;
    }
  }

  /**
   * Upload a local trailer file
   *
   * Handles user-uploaded trailer files by:
   * 1. Creating cache_video_files entry with content-addressed storage
   * 2. Creating trailer candidate with source_type = 'upload'
   * 3. Auto-selecting and locking the trailer field on entity
   *
   * Upload Rules:
   * - Creates cache_video_files entry first
   * - Creates candidate with source_type = 'upload'
   * - Automatically selected (is_selected = 1)
   * - Locks trailer field on entity (e.g., movies.trailer_locked = 1)
   * - Links to cache_video_file_id
   *
   * NOTE: Caller is responsible for:
   * - Moving file to proper cache location
   * - Computing file hash and metadata
   * - Transaction management if needed
   *
   * @param entityType - Entity type ('movie' or 'episode')
   * @param entityId - Entity ID
   * @param cacheFileId - ID of created cache_video_files entry
   * @param fileName - Original filename for metadata
   * @param selectedBy - User identifier (e.g., 'user:john')
   * @returns Upload result with candidateId and cacheFileId
   */
  async uploadTrailer(
    entityType: 'movie' | 'episode',
    entityId: number,
    cacheFileId: number,
    fileName: string,
    selectedBy: string = 'user'
  ): Promise<UploadResult> {
    const conn = this.db.getConnection();

    try {
      // Verify cache file exists
      const cacheFile = await conn.get<{ id: number; file_path: string }>(
        `SELECT id, file_path FROM cache_video_files WHERE id = ?`,
        [cacheFileId]
      );

      if (!cacheFile) {
        throw new ResourceNotFoundError(
          'cache_video_file',
          cacheFileId,
          'Cache video file not found',
          { service: 'TrailerService', operation: 'uploadTrailer', metadata: { entityType, entityId } }
        );
      }

      // Create trailer candidate for uploaded file (no is_locked - lock is on entity)
      const result = await conn.execute(
        `INSERT INTO trailer_candidates (
          entity_type, entity_id, source_type,
          cache_video_file_id, downloaded_at,
          title, is_selected,
          selected_at, selected_by,
          created_at, updated_at
        ) VALUES (?, ?, 'upload', ?, CURRENT_TIMESTAMP, ?, 1, CURRENT_TIMESTAMP, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [entityType, entityId, cacheFileId, fileName, selectedBy]
      );

      const candidateId = result.insertId!;

      // Deselect any previously selected trailer
      await conn.execute(
        `UPDATE trailer_candidates
         SET is_selected = 0, selected_at = NULL, selected_by = NULL
         WHERE entity_type = ? AND entity_id = ? AND id != ? AND is_selected = 1`,
        [entityType, entityId, candidateId]
      );

      // Lock the trailer field on entity
      await this.lockTrailerField(entityType, entityId);

      logger.info('Trailer uploaded and selected', {
        entityType,
        entityId,
        candidateId,
        cacheFileId,
        fileName,
        selectedBy
      });

      return {
        candidateId,
        cacheFileId,
        filePath: cacheFile.file_path
      };
    } catch (error) {
      logger.error('Failed to upload trailer', createErrorLogContext(error, {
        entityType,
        entityId,
        cacheFileId,
        fileName
      }));
      throw error;
    }
  }

  /**
   * Deselect the currently selected trailer
   *
   * Clears the selection state without removing the candidate.
   * The trailer remains available for re-selection in the candidates list.
   *
   * Deselection Rules:
   * - Only deselects the current trailer (sets is_selected = 0)
   * - Clears is_locked to allow automation
   * - Does NOT delete the candidate (keeps it for re-selection)
   * - Returns success even if no trailer was selected (idempotent)
   *
   * @param entityType - Entity type ('movie' or 'episode')
   * @param entityId - Entity ID
   * @returns Success status with deselected candidate ID if any
   */
  async deselectTrailer(entityType: 'movie' | 'episode', entityId: number): Promise<{ success: boolean; deselectedId: number | null }> {
    const conn = this.db.getConnection();

    try {
      // Find currently selected trailer
      const selected = await conn.get<{ id: number }>(
        `SELECT id FROM trailer_candidates
         WHERE entity_type = ? AND entity_id = ? AND is_selected = 1`,
        [entityType, entityId]
      );

      if (!selected) {
        // No trailer selected - that's fine, nothing to deselect
        logger.debug('No trailer to deselect', { entityType, entityId });
        return { success: true, deselectedId: null };
      }

      // Deselect the trailer (keep it as a candidate)
      await conn.execute(
        `UPDATE trailer_candidates
         SET is_selected = 0, selected_at = NULL, selected_by = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [selected.id]
      );

      // Unlock the trailer field on entity to allow automation
      await this.unlockTrailerField(entityType as 'movie' | 'episode', entityId);

      logger.info('Trailer deselected', {
        entityType,
        entityId,
        candidateId: selected.id
      });

      return { success: true, deselectedId: selected.id };
    } catch (error) {
      logger.error('Failed to deselect trailer', createErrorLogContext(error, {
        entityType,
        entityId
      }));
      throw error;
    }
  }

  /**
   * Delete selected trailer (legacy - calls deselectTrailer for backward compatibility)
   *
   * @deprecated Use deselectTrailer() instead for deselection, or deleteCandidate() for permanent removal
   * @param entityType - Entity type ('movie' or 'episode')
   * @param entityId - Entity ID
   * @returns Success status
   */
  async deleteTrailer(entityType: 'movie' | 'episode', entityId: number): Promise<{ success: boolean }> {
    // For backward compatibility, just deselect instead of deleting
    const result = await this.deselectTrailer(entityType, entityId);
    return { success: result.success };
  }

  /**
   * Delete a specific trailer candidate
   *
   * Removes a trailer candidate by ID.
   * If the deleted candidate was selected, clears selection for the entity.
   *
   * @param candidateId - Candidate ID to delete
   * @returns Success status with wasSelected flag
   */
  async deleteCandidate(candidateId: number): Promise<{ success: boolean; wasSelected: boolean }> {
    const conn = this.db.getConnection();

    try {
      // Get candidate info before deletion
      const candidate = await conn.get<{ id: number; is_selected: boolean; entity_type: string; entity_id: number }>(
        `SELECT id, is_selected, entity_type, entity_id FROM trailer_candidates WHERE id = ?`,
        [candidateId]
      );

      if (!candidate) {
        throw new ResourceNotFoundError(
          'trailer_candidate',
          candidateId,
          'Trailer candidate not found',
          { service: 'TrailerService', operation: 'deleteCandidate' }
        );
      }

      // Delete the candidate
      await conn.execute(`DELETE FROM trailer_candidates WHERE id = ?`, [candidateId]);

      logger.info('Trailer candidate deleted', {
        candidateId,
        entityType: candidate.entity_type,
        entityId: candidate.entity_id,
        wasSelected: candidate.is_selected
      });

      return {
        success: true,
        wasSelected: candidate.is_selected
      };
    } catch (error) {
      logger.error('Failed to delete candidate', createErrorLogContext(error, { candidateId }));
      throw error;
    }
  }

  /**
   * Lock the trailer field on an entity
   *
   * Sets trailer_locked = 1 on the entity (movie/episode) to prevent
   * automation from changing trailer selection.
   *
   * @param entityType - Entity type ('movie' or 'episode')
   * @param entityId - Entity ID
   * @returns Success status
   */
  async lockTrailerField(
    entityType: 'movie' | 'episode',
    entityId: number
  ): Promise<{ success: boolean }> {
    const conn = this.db.getConnection();

    try {
      if (entityType === 'movie') {
        await conn.execute(
          `UPDATE movies SET trailer_locked = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [entityId]
        );
      }
      // TODO: Add episode support when episodes table has trailer_locked

      logger.info('Trailer field locked', { entityType, entityId });
      return { success: true };
    } catch (error) {
      logger.error('Failed to lock trailer field', createErrorLogContext(error, {
        entityType,
        entityId
      }));
      throw error;
    }
  }

  /**
   * Unlock the trailer field on an entity
   *
   * Sets trailer_locked = 0 on the entity to allow automation
   * to find and select better trailers.
   *
   * @param entityType - Entity type ('movie' or 'episode')
   * @param entityId - Entity ID
   * @returns Success status
   */
  async unlockTrailerField(entityType: 'movie' | 'episode', entityId: number): Promise<{ success: boolean }> {
    const conn = this.db.getConnection();

    try {
      if (entityType === 'movie') {
        await conn.execute(
          `UPDATE movies SET trailer_locked = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [entityId]
        );
      }
      // TODO: Add episode support when episodes table has trailer_locked

      logger.info('Trailer field unlocked', { entityType, entityId });
      return { success: true };
    } catch (error) {
      logger.error('Failed to unlock trailer field', createErrorLogContext(error, {
        entityType,
        entityId
      }));
      throw error;
    }
  }

  /**
   * Check if entity has trailer field locked
   *
   * Used by automation to determine if it can modify trailer selection.
   * Checks the trailer_locked field on the entity (movie/episode).
   *
   * @param entityType - Entity type ('movie' or 'episode')
   * @param entityId - Entity ID
   * @returns True if trailer field is locked
   */
  async isTrailerLocked(entityType: 'movie' | 'episode', entityId: number): Promise<boolean> {
    const conn = this.db.getConnection();

    try {
      if (entityType === 'movie') {
        const result = await conn.get<{ trailer_locked: number }>(
          `SELECT trailer_locked FROM movies WHERE id = ?`,
          [entityId]
        );
        return (result?.trailer_locked || 0) === 1;
      }
      // Episodes don't have trailer_locked yet
      return false;
    } catch (error) {
      logger.error('Failed to check trailer lock', createErrorLogContext(error, {
        entityType,
        entityId
      }));
      throw error;
    }
  }

  /**
   * @deprecated Use lockTrailerField instead - lock is now on entity, not candidate
   */
  async lockTrailer(
    entityType: 'movie' | 'episode',
    entityId: number,
    _candidateId: number
  ): Promise<{ success: boolean }> {
    return this.lockTrailerField(entityType, entityId);
  }

  /**
   * @deprecated Use unlockTrailerField instead - lock is now on entity, not candidate
   */
  async unlockTrailer(entityType: 'movie' | 'episode', entityId: number): Promise<{ success: boolean }> {
    return this.unlockTrailerField(entityType, entityId);
  }

  /**
   * @deprecated Use isTrailerLocked instead - lock is now on entity, not candidate
   */
  async hasLockedTrailer(entityType: 'movie' | 'episode', entityId: number): Promise<boolean> {
    return this.isTrailerLocked(entityType, entityId);
  }

  /**
   * Update trailer candidate with analysis results
   *
   * Called after yt-dlp analysis to store video metadata.
   * Updates fields like title, duration, resolution, estimated size.
   *
   * Analysis Update:
   * - Sets analyzed = 1
   * - Stores yt-dlp JSON metadata
   * - Updates video properties (title, duration, dimensions, size)
   * - Does NOT modify selection or lock state
   *
   * @param candidateId - Candidate ID to update
   * @param metadata - Analysis metadata from yt-dlp
   * @returns Success status
   */
  async updateCandidateMetadata(
    candidateId: number,
    metadata: {
      ytdlp_metadata?: string;
      title?: string;
      duration_seconds?: number;
      best_width?: number;
      best_height?: number;
      estimated_size_bytes?: number;
      thumbnail_url?: string;
    }
  ): Promise<{ success: boolean }> {
    const conn = this.db.getConnection();

    try {
      // Build dynamic update query
      const fields: string[] = ['analyzed = 1', 'updated_at = CURRENT_TIMESTAMP'];
      const values: SqlParam[] = [];

      if (metadata.ytdlp_metadata !== undefined) {
        fields.push('ytdlp_metadata = ?');
        values.push(metadata.ytdlp_metadata);
      }
      if (metadata.title !== undefined) {
        fields.push('title = ?');
        values.push(metadata.title);
      }
      if (metadata.duration_seconds !== undefined) {
        fields.push('duration_seconds = ?');
        values.push(metadata.duration_seconds);
      }
      if (metadata.best_width !== undefined) {
        fields.push('best_width = ?');
        values.push(metadata.best_width);
      }
      if (metadata.best_height !== undefined) {
        fields.push('best_height = ?');
        values.push(metadata.best_height);
      }
      if (metadata.estimated_size_bytes !== undefined) {
        fields.push('estimated_size_bytes = ?');
        values.push(metadata.estimated_size_bytes);
      }
      if (metadata.thumbnail_url !== undefined) {
        fields.push('thumbnail_url = ?');
        values.push(metadata.thumbnail_url);
      }

      values.push(candidateId);

      await conn.execute(
        `UPDATE trailer_candidates SET ${fields.join(', ')} WHERE id = ?`,
        values
      );

      logger.info('Trailer candidate metadata updated', { candidateId });

      return { success: true };
    } catch (error) {
      logger.error('Failed to update candidate metadata', createErrorLogContext(error, { candidateId }));
      throw error;
    }
  }

  /**
   * Link trailer candidate to downloaded cache file
   *
   * Updates candidate with cache_video_file_id and downloaded_at timestamp.
   * Called after successful download by TrailerDownloadService.
   *
   * Download Linkage:
   * - Sets cache_video_file_id
   * - Sets downloaded_at timestamp
   * - Clears failure tracking fields
   *
   * @param candidateId - Candidate ID
   * @param cacheFileId - Cache video file ID
   * @returns Success status
   */
  async linkCacheFile(candidateId: number, cacheFileId: number): Promise<{ success: boolean }> {
    const conn = this.db.getConnection();

    try {
      await conn.execute(
        `UPDATE trailer_candidates
         SET cache_video_file_id = ?,
             downloaded_at = CURRENT_TIMESTAMP,
             failed_at = NULL,
             failure_reason = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [cacheFileId, candidateId]
      );

      logger.info('Cache file linked to trailer candidate', { candidateId, cacheFileId });

      return { success: true };
    } catch (error) {
      logger.error('Failed to link cache file', createErrorLogContext(error, {
        candidateId,
        cacheFileId
      }));
      throw error;
    }
  }

  /**
   * Record download failure for trailer candidate
   *
   * Updates failure tracking fields for retry logic.
   *
   * Failure Types:
   * - 'unavailable': Video confirmed gone via oEmbed - permanent, never retry automatically
   * - 'rate_limited': Provider rate limit - transient, retry on next scheduled run
   * - 'download_error': Network/unknown - transient, retry on next enrichment cycle
   *
   * With proactive verification, we know immediately WHY a failure occurred.
   * No need for retry counts - the failure reason tells us everything.
   *
   * @param candidateId - Candidate ID
   * @param reason - Failure reason ('unavailable', 'rate_limited', 'download_error')
   * @returns Success status
   */
  async recordFailure(
    candidateId: number,
    reason: string
  ): Promise<{ success: boolean }> {
    const conn = this.db.getConnection();

    try {
      await conn.execute(
        `UPDATE trailer_candidates
         SET failed_at = CURRENT_TIMESTAMP,
             failure_reason = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [reason, candidateId]
      );

      logger.warn('Trailer download failure recorded', {
        candidateId,
        reason,
      });

      return { success: true };
    } catch (error) {
      logger.error('Failed to record failure', createErrorLogContext(error, {
        candidateId,
        reason
      }));
      throw error;
    }
  }

  /**
   * Clear failure state for a candidate
   *
   * Called when:
   * - Download succeeds after previous failures
   * - User force-retries and it succeeds
   * - Re-verification shows video is available again
   *
   * @param candidateId - Candidate ID
   * @returns Success status
   */
  async clearFailure(candidateId: number): Promise<{ success: boolean }> {
    const conn = this.db.getConnection();

    try {
      await conn.execute(
        `UPDATE trailer_candidates
         SET failed_at = NULL,
             failure_reason = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [candidateId]
      );

      logger.info('Trailer failure state cleared', { candidateId });
      return { success: true };
    } catch (error) {
      logger.error('Failed to clear failure state', createErrorLogContext(error, {
        candidateId
      }));
      throw error;
    }
  }
}
