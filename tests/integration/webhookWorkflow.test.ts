import { JobQueueService } from '../../src/services/jobQueueService.js';
import { WebhookService } from '../../src/services/webhookService.js';
import { AssetSelectionService } from '../../src/services/assetSelectionService.js';
import { TestDatabase, createTestDatabase } from '../utils/testDatabase.js';

/**
 * Integration Test: Webhook to Asset Selection Workflow
 *
 * Tests the complete flow:
 * 1. Radarr sends webhook (movie downloaded)
 * 2. Webhook creates job in queue
 * 3. Job creates movie entry in database
 * 4. Asset discovery would run (mocked here)
 * 5. Asset selection (manual or auto)
 */

describe('Webhook Workflow Integration', () => {
  let testDb: TestDatabase;
  let jobQueue: JobQueueService;
  let webhookService: WebhookService;
  let assetSelection: AssetSelectionService;

  beforeEach(async () => {
    testDb = await createTestDatabase();
    const db = await testDb.create();

    jobQueue = new JobQueueService(db);
    webhookService = new WebhookService(jobQueue);
    assetSelection = new AssetSelectionService(db);
  });

  afterEach(async () => {
    jobQueue.stop();
    await testDb.destroy();
  });

  it('should process Radarr webhook and create job', async () => {
    // Simulate Radarr Download webhook
    const webhook = {
      eventType: 'Download' as const,
      movie: {
        id: 123,
        title: 'Test Movie',
        year: 2023,
        folderPath: '/movies/Test Movie (2023)',
        tmdbId: 550,
        imdbId: 'tt0137523'
      },
      movieFile: {
        id: 456,
        relativePath: 'Test Movie (2023).mkv',
        path: '/movies/Test Movie (2023)/Test Movie (2023).mkv',
        quality: '1080p',
        qualityVersion: 1,
        releaseGroup: 'TEST',
        sceneName: 'test.movie.2023.1080p'
      }
    };

    const jobId = await webhookService.processRadarrWebhook(webhook);

    expect(jobId).toBeGreaterThan(0);

    // Verify job was created
    const job = await jobQueue.getJob(jobId);
    expect(job).toBeDefined();
    expect(job?.type).toBe('webhook');
    expect(job?.priority).toBe(1); // Critical priority
    expect(job?.state).toBe('pending');
    expect(job?.payload.source).toBe('radarr');
    expect(job?.payload.movie.title).toBe('Test Movie');
  });

  it('should handle test webhook without creating job', async () => {
    const webhook = {
      eventType: 'Test' as const,
      movie: {
        id: 1,
        title: 'Test',
        year: 2023,
        folderPath: '/test',
        tmdbId: 1,
        imdbId: 'tt0000001'
      }
    };

    const jobId = await webhookService.processRadarrWebhook(webhook);

    expect(jobId).toBe(-1); // Test webhooks return -1
  });

  it('should process complete workflow: webhook → movie → assets → selection', async () => {
    // Step 1: Receive webhook
    const webhook = {
      eventType: 'Download' as const,
      movie: {
        id: 123,
        title: 'The Matrix',
        year: 1999,
        folderPath: '/movies/The Matrix (1999)',
        tmdbId: 603,
        imdbId: 'tt0133093'
      },
      movieFile: {
        id: 456,
        relativePath: 'The Matrix (1999).mkv',
        path: '/movies/The Matrix (1999)/The Matrix (1999).mkv',
        quality: '1080p',
        qualityVersion: 1,
        releaseGroup: 'RELEASE',
        sceneName: 'the.matrix.1999.1080p'
      }
    };

    await webhookService.processRadarrWebhook(webhook);

    // Step 2: Simulate movie creation (normally done by job handler)
    const db = await testDb.create();

    // Seed library first
    await db.execute(
      `INSERT INTO libraries (id, name, type, path, enabled)
       VALUES (1, 'Test Library', 'movie', '/movies', 1)`
    );

    await db.execute(
      `INSERT INTO movies (title, year, tmdb_id, imdb_id, library_id, file_path, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [webhook.movie.title, webhook.movie.year, webhook.movie.tmdbId, webhook.movie.imdbId, webhook.movie.folderPath]
    );

    const movieResult = await db.query<{ id: number }>('SELECT id FROM movies WHERE tmdb_id = ?', [webhook.movie.tmdbId]);
    const movieId = movieResult[0].id;

    // Step 3: Simulate asset discovery (add candidates)
    await db.execute(
      `INSERT INTO asset_candidates (entity_type, entity_id, asset_type, provider, provider_url, auto_score, created_at, updated_at)
       VALUES ('movie', ?, 'poster', 'tmdb', 'http://image1.jpg', 85, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [movieId]
    );
    await db.execute(
      `INSERT INTO asset_candidates (entity_type, entity_id, asset_type, provider, provider_url, auto_score, created_at, updated_at)
       VALUES ('movie', ?, 'poster', 'tmdb', 'http://image2.jpg', 90, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [movieId]
    );

    // Step 4: Get candidates
    const candidates = await assetSelection.getCandidates('movie', movieId, 'poster');
    expect(candidates).toHaveLength(2);

    // Step 5: Auto-select best poster (YOLO mode)
    const selectionResult = await assetSelection.selectAssetYOLO({
      entityType: 'movie',
      entityId: movieId,
      assetType: 'poster',
      mode: 'yolo'
    });

    expect(selectionResult.selected).toBe(true);

    // Step 6: Verify selection
    const selected = await assetSelection.getSelectedAssets('movie', movieId);
    expect(selected).toHaveLength(1);
    expect(selected[0].asset_type).toBe('poster');

    // Verify highest scored poster was selected
    const selectedCandidate = candidates.find(c => c.id === selectionResult.candidateId);
    expect(selectedCandidate?.auto_score).toBe(90);
  });

  it('should handle queue statistics correctly', async () => {
    // Add multiple jobs with different priorities
    await webhookService.processRadarrWebhook({
      eventType: 'Download',
      movie: {
        id: 1,
        title: 'Movie 1',
        year: 2023,
        folderPath: '/movies/Movie1',
        tmdbId: 1,
        imdbId: 'tt0000001'
      }
    });

    await webhookService.processRadarrWebhook({
      eventType: 'Download',
      movie: {
        id: 2,
        title: 'Movie 2',
        year: 2023,
        folderPath: '/movies/Movie2',
        tmdbId: 2,
        imdbId: 'tt0000002'
      }
    });

    // Check stats
    const stats = await jobQueue.getStats();
    expect(stats.pending).toBe(2);
    expect(stats.processing).toBe(0);
    expect(stats.completed).toBe(0);
  });
});
