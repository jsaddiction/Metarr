/**
 * MetadataEnrichmentService Integration Tests
 *
 * Tests metadata aggregation from multiple providers with rate limit handling,
 * field update logic, and completeness calculation.
 */

// @ts-nocheck - Test file with mock types
import { jest } from '@jest/globals';
import { MetadataEnrichmentService } from '../../src/services/enrichment/MetadataEnrichmentService.js';
import { DatabaseConnection } from '../../src/types/database.js';
import { OMDBProvider } from '../../src/services/providers/omdb/OMDBProvider.js';
import { TMDBClient } from '../../src/services/providers/tmdb/TMDBClient.js';
import { RateLimitError } from '../../src/errors/index.js';

describe('MetadataEnrichmentService', () => {
  let service: MetadataEnrichmentService;
  let mockDb: DatabaseConnection;
  let mockOmdbProvider: OMDBProvider;
  let mockTmdbClient: TMDBClient;

  // Mock movie data
  const mockMovie = {
    id: 1,
    title: 'The Matrix',
    original_title: null,
    plot: null,
    outline: null,
    tagline: null,
    imdb_rating: null,
    imdb_votes: null,
    rotten_tomatoes_score: null,
    metacritic_score: null,
    awards: null,
    release_date: null,
    runtime: null,
    content_rating: null,
    director: null,
    writer: null,
    actors: null,
    tmdb_id: 603,
    imdb_id: 'tt0133093',
    title_locked: 0,
    plot_locked: 0,
    outline_locked: 0,
    tagline_locked: 0,
    content_rating_locked: 0,
    release_date_locked: 0,
  };

  beforeEach(() => {
    // Mock database
    mockDb = {
      get: jest.fn(),
      execute: jest.fn(),
      query: jest.fn(),
      close: jest.fn(),
      beginTransaction: jest.fn(),
      commit: jest.fn(),
      rollback: jest.fn(),
    } as any;

    // Mock OMDB Provider
    mockOmdbProvider = {
      getMetadata: jest.fn(),
    } as any;

    // Mock TMDB Client
    mockTmdbClient = {
      getMovie: jest.fn(),
    } as any;

    // Create service instance
    service = new MetadataEnrichmentService(mockDb, mockOmdbProvider, mockTmdbClient);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Single Movie Enrichment (requireComplete=false)', () => {
    it('should enrich movie with OMDB and TMDB metadata', async () => {
      // Setup mocks
      (mockDb.get as jest.Mock).mockResolvedValueOnce(mockMovie);

      // OMDB provides ratings and plot
      (mockOmdbProvider.getMetadata as jest.Mock).mockResolvedValueOnce({
        providerId: 'omdb',
        providerResultId: 'tt0133093',
        fields: {
          title: 'The Matrix',
          plot: 'When a beautiful stranger leads computer hacker Neo to a forbidding underworld, he discovers the shocking truth--the life he knows is the elaborate deception of an evil cyber-intelligence.',
          outline: 'A computer hacker learns about the true nature of reality.',
          certification: 'R',
          runtime: 136,
          releaseDate: '1999-03-31',
          ratings: [
            { source: 'imdb', value: 8.7, votes: 1900000, maxValue: 10 },
            { source: 'rottentomatoes', value: 88, maxValue: 100 },
            { source: 'metacritic', value: 73, maxValue: 100 },
          ],
          directors: ['Lana Wachowski', 'Lilly Wachowski'],
          writers: ['Lana Wachowski', 'Lilly Wachowski'],
          actors: ['Keanu Reeves', 'Laurence Fishburne', 'Carrie-Anne Moss'],
          awards: 'Won 4 Oscars. 42 wins & 52 nominations total',
        },
        externalIds: { imdb: 'tt0133093' },
        completeness: 1.0,
        confidence: 1.0,
      });

      // TMDB provides tagline
      (mockTmdbClient.getMovie as jest.Mock).mockResolvedValueOnce({
        id: 603,
        title: 'The Matrix',
        overview: 'Set in the 22nd century, The Matrix tells the story of a computer hacker...',
        tagline: 'Welcome to the Real World',
        release_date: '1999-03-31',
        runtime: 136,
      });

      // Mock database updates
      (mockDb.execute as jest.Mock).mockResolvedValue({
        affectedRows: 1,
        insertId: undefined,
      });

      // Execute enrichment
      const result = await service.enrichMovie(1, false);

      // Verify result
      expect(result.updated).toBe(true);
      expect(result.partial).toBe(false);
      expect(result.rateLimitedProviders).toHaveLength(0);
      expect(result.changedFields).toBeDefined();
      expect(result.completeness).toBeGreaterThan(0);

      // Verify OMDB metadata was preferred over TMDB for overlapping fields
      const updateCall = (mockDb.execute as jest.Mock).mock.calls[0];
      const updateQuery = updateCall[0] as string;
      const updateValues = updateCall[1] as any[];

      // Check that OMDB plot was used (not TMDB overview)
      expect(updateQuery).toContain('plot = ?');
      expect(updateValues).toContain(
        'When a beautiful stranger leads computer hacker Neo to a forbidding underworld, he discovers the shocking truth--the life he knows is the elaborate deception of an evil cyber-intelligence.'
      );

      // Check that TMDB tagline was used (OMDB doesn't provide it)
      expect(updateQuery).toContain('tagline = ?');
      expect(updateValues).toContain('Welcome to the Real World');
    });

    it('should handle OMDB rate limit gracefully and use TMDB data', async () => {
      // Setup mocks
      (mockDb.get as jest.Mock).mockResolvedValueOnce(mockMovie);

      // OMDB is rate limited
      (mockOmdbProvider.getMetadata as jest.Mock).mockRejectedValueOnce(
        new RateLimitError('OMDB', 86400, 'Daily limit reached')
      );

      // TMDB succeeds
      (mockTmdbClient.getMovie as jest.Mock).mockResolvedValueOnce({
        id: 603,
        title: 'The Matrix',
        overview: 'A computer hacker learns from mysterious rebels...',
        tagline: 'Welcome to the Real World',
        release_date: '1999-03-31',
        runtime: 136,
      });

      // Mock database updates
      (mockDb.execute as jest.Mock).mockResolvedValue({
        affectedRows: 1,
        insertId: undefined,
      });

      // Execute enrichment (requireComplete=false allows partial data)
      const result = await service.enrichMovie(1, false);

      // Verify result
      expect(result.updated).toBe(true);
      expect(result.partial).toBe(true); // Partial because OMDB was rate limited
      expect(result.rateLimitedProviders).toContain('omdb');
      expect(result.changedFields).toBeDefined();

      // Verify TMDB data was used
      const updateCall = (mockDb.execute as jest.Mock).mock.calls[0];
      const updateValues = updateCall[1] as any[];
      expect(updateValues).toContain('A computer hacker learns from mysterious rebels...');
    });

    it('should respect field locks and not overwrite locked fields', async () => {
      // Movie with locked plot
      const lockedMovie = {
        ...mockMovie,
        plot: 'User-edited plot that should not be changed',
        plot_locked: 1, // Field is locked
      };

      (mockDb.get as jest.Mock).mockResolvedValueOnce(lockedMovie);

      // OMDB provides new plot
      (mockOmdbProvider.getMetadata as jest.Mock).mockResolvedValueOnce({
        providerId: 'omdb',
        providerResultId: 'tt0133093',
        fields: {
          title: 'The Matrix',
          plot: 'Different plot from OMDB',
          outline: 'Short plot',
          ratings: [{ source: 'imdb', value: 8.7, votes: 1900000, maxValue: 10 }],
        },
        externalIds: { imdb: 'tt0133093' },
        completeness: 1.0,
        confidence: 1.0,
      });

      (mockTmdbClient.getMovie as jest.Mock).mockResolvedValueOnce({
        id: 603,
        title: 'The Matrix',
        tagline: 'Welcome to the Real World',
      });

      (mockDb.execute as jest.Mock).mockResolvedValue({
        affectedRows: 1,
        insertId: undefined,
      });

      // Execute enrichment
      const result = await service.enrichMovie(1, false);

      // Verify that plot was NOT in changed fields (it's locked)
      expect(result.changedFields).not.toContain('plot');

      // Verify outline and tagline were updated (not locked)
      expect(result.changedFields).toContain('outline');
      expect(result.changedFields).toContain('tagline');
    });

    it('should apply "fill gaps, don\'t erase" logic', async () => {
      // Movie with existing plot
      const movieWithPlot = {
        ...mockMovie,
        plot: 'Existing plot',
      };

      (mockDb.get as jest.Mock).mockResolvedValueOnce(movieWithPlot);

      // OMDB provides empty plot (should not overwrite existing)
      (mockOmdbProvider.getMetadata as jest.Mock).mockResolvedValueOnce({
        providerId: 'omdb',
        providerResultId: 'tt0133093',
        fields: {
          title: 'The Matrix',
          plot: '', // Empty - should be rejected
          outline: 'New outline', // New field - should be accepted
        },
        externalIds: { imdb: 'tt0133093' },
        completeness: 0.5,
        confidence: 1.0,
      });

      (mockTmdbClient.getMovie as jest.Mock).mockResolvedValueOnce({
        id: 603,
        title: 'The Matrix',
      });

      (mockDb.execute as jest.Mock).mockResolvedValue({
        affectedRows: 1,
        insertId: undefined,
      });

      // Execute enrichment
      const result = await service.enrichMovie(1, false);

      // Verify plot was NOT updated (empty value rejected)
      expect(result.changedFields).not.toContain('plot');

      // Verify outline WAS updated (filling gap)
      expect(result.changedFields).toContain('outline');
    });
  });

  describe('Bulk Enrichment Mode (requireComplete=true)', () => {
    it('should skip enrichment if ANY provider is rate limited', async () => {
      (mockDb.get as jest.Mock).mockResolvedValueOnce(mockMovie);

      // OMDB is rate limited
      (mockOmdbProvider.getMetadata as jest.Mock).mockRejectedValueOnce(
        new RateLimitError('OMDB', 86400, 'Daily limit reached')
      );

      // TMDB succeeds
      (mockTmdbClient.getMovie as jest.Mock).mockResolvedValueOnce({
        id: 603,
        title: 'The Matrix',
        tagline: 'Welcome to the Real World',
      });

      // Execute enrichment (requireComplete=true)
      const result = await service.enrichMovie(1, true);

      // Verify enrichment was skipped
      expect(result.updated).toBe(false);
      expect(result.partial).toBe(false);
      expect(result.rateLimitedProviders).toContain('omdb');

      // Verify NO database updates were made
      expect(mockDb.execute).not.toHaveBeenCalled();
    });

    it('should complete enrichment if no rate limits detected', async () => {
      (mockDb.get as jest.Mock).mockResolvedValueOnce(mockMovie);

      // Both providers succeed
      (mockOmdbProvider.getMetadata as jest.Mock).mockResolvedValueOnce({
        providerId: 'omdb',
        providerResultId: 'tt0133093',
        fields: {
          title: 'The Matrix',
          plot: 'Full plot from OMDB',
          ratings: [{ source: 'imdb', value: 8.7, votes: 1900000, maxValue: 10 }],
        },
        externalIds: { imdb: 'tt0133093' },
        completeness: 1.0,
        confidence: 1.0,
      });

      (mockTmdbClient.getMovie as jest.Mock).mockResolvedValueOnce({
        id: 603,
        title: 'The Matrix',
        tagline: 'Welcome to the Real World',
      });

      (mockDb.execute as jest.Mock).mockResolvedValue({
        affectedRows: 1,
        insertId: undefined,
      });

      // Execute enrichment (requireComplete=true)
      const result = await service.enrichMovie(1, true);

      // Verify enrichment succeeded
      expect(result.updated).toBe(true);
      expect(result.partial).toBe(false);
      expect(result.rateLimitedProviders).toHaveLength(0);

      // Verify database was updated
      expect(mockDb.execute).toHaveBeenCalled();
    });
  });

  describe('Provider Priority', () => {
    it('should prioritize OMDB over TMDB for overlapping fields', async () => {
      (mockDb.get as jest.Mock).mockResolvedValueOnce(mockMovie);

      // OMDB provides plot
      (mockOmdbProvider.getMetadata as jest.Mock).mockResolvedValueOnce({
        providerId: 'omdb',
        providerResultId: 'tt0133093',
        fields: {
          title: 'The Matrix',
          plot: 'OMDB plot - this should win',
        },
        externalIds: { imdb: 'tt0133093' },
        completeness: 1.0,
        confidence: 1.0,
      });

      // TMDB also provides plot (but should be ignored)
      (mockTmdbClient.getMovie as jest.Mock).mockResolvedValueOnce({
        id: 603,
        title: 'The Matrix',
        overview: 'TMDB overview - this should be ignored',
      });

      (mockDb.execute as jest.Mock).mockResolvedValue({
        affectedRows: 1,
        insertId: undefined,
      });

      // Execute enrichment
      await service.enrichMovie(1, false);

      // Verify OMDB plot was used
      const updateCall = (mockDb.execute as jest.Mock).mock.calls[0];
      const updateValues = updateCall[1] as any[];
      expect(updateValues).toContain('OMDB plot - this should win');
      expect(updateValues).not.toContain('TMDB overview - this should be ignored');
    });
  });

  describe('Completeness Calculation', () => {
    it('should calculate and update completeness percentage', async () => {
      (mockDb.get as jest.Mock).mockResolvedValueOnce(mockMovie);

      // OMDB provides comprehensive metadata
      (mockOmdbProvider.getMetadata as jest.Mock).mockResolvedValueOnce({
        providerId: 'omdb',
        providerResultId: 'tt0133093',
        fields: {
          title: 'The Matrix',
          plot: 'Full plot',
          outline: 'Short plot',
          certification: 'R',
          runtime: 136,
          releaseDate: '1999-03-31',
          ratings: [
            { source: 'imdb', value: 8.7, votes: 1900000, maxValue: 10 },
            { source: 'rottentomatoes', value: 88, maxValue: 100 },
            { source: 'metacritic', value: 73, maxValue: 100 },
          ],
        },
        externalIds: { imdb: 'tt0133093' },
        completeness: 1.0,
        confidence: 1.0,
      });

      (mockTmdbClient.getMovie as jest.Mock).mockResolvedValueOnce({
        id: 603,
        title: 'The Matrix',
        tagline: 'Welcome to the Real World',
      });

      (mockDb.execute as jest.Mock).mockResolvedValue({
        affectedRows: 1,
        insertId: undefined,
      });

      // Execute enrichment
      const result = await service.enrichMovie(1, false);

      // Verify completeness was calculated
      expect(result.completeness).toBeGreaterThan(0);
      expect(result.completeness).toBeLessThanOrEqual(100);

      // Verify completeness was updated in database
      const calls = (mockDb.execute as jest.Mock).mock.calls;
      const completenessCall = calls.find((call: any[]) =>
        (call[0] as string).includes('completeness_pct')
      );
      expect(completenessCall).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle movie not found', async () => {
      (mockDb.get as jest.Mock).mockResolvedValueOnce(null);

      const result = await service.enrichMovie(999, false);

      expect(result.updated).toBe(false);
      expect(result.partial).toBe(false);
      expect(result.rateLimitedProviders).toHaveLength(0);
    });

    it('should handle all providers failing', async () => {
      (mockDb.get as jest.Mock).mockResolvedValueOnce(mockMovie);

      // Both providers fail (not rate limit - generic error)
      (mockOmdbProvider.getMetadata as jest.Mock).mockRejectedValueOnce(
        new Error('OMDB server error')
      );
      (mockTmdbClient.getMovie as jest.Mock).mockRejectedValueOnce(new Error('TMDB server error'));

      const result = await service.enrichMovie(1, false);

      expect(result.updated).toBe(false);
      expect(result.partial).toBe(false);
      expect(result.rateLimitedProviders).toHaveLength(0);
    });

    it('should handle missing external IDs gracefully', async () => {
      const movieNoIds = {
        ...mockMovie,
        tmdb_id: null,
        imdb_id: null,
      };

      (mockDb.get as jest.Mock).mockResolvedValueOnce(movieNoIds);

      const result = await service.enrichMovie(1, false);

      // No providers can be called without external IDs
      expect(result.updated).toBe(false);
      expect(mockOmdbProvider.getMetadata).not.toHaveBeenCalled();
      expect(mockTmdbClient.getMovie).not.toHaveBeenCalled();
    });
  });
});
