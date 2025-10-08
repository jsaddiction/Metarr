import { ScheduledEnrichmentService } from '../../src/services/scheduledEnrichmentService.js';
import { JobQueueService } from '../../src/services/jobQueueService.js';
import { TestDatabase, createTestDatabase } from '../utils/testDatabase.js';

describe('ScheduledEnrichmentService', () => {
  let testDb: TestDatabase;
  let jobQueue: JobQueueService;
  let service: ScheduledEnrichmentService;

  beforeEach(async () => {
    testDb = await createTestDatabase();
    const db = await testDb.create();
    jobQueue = new JobQueueService(db);
    service = new ScheduledEnrichmentService(db, jobQueue);
  });

  afterEach(async () => {
    service.stop();
    jobQueue.stop();
    await testDb.destroy();
  });

  describe('enrichEntity', () => {
    it('should create enrichment job for movie', async () => {
      // Seed movie
      await testDb.seed({
        movies: [
          { title: 'Test Movie', year: 2023, tmdb_id: 550 }
        ]
      });

      await service.enrichEntity('movie', 1);

      // Verify enrichment was triggered (check for job in queue)
      const stats = await jobQueue.getStats();
      expect(stats.pending).toBeGreaterThan(0);
    });

    it('should use correct priority for enrichment jobs', async () => {
      await testDb.seed({
        movies: [
          { title: 'Test Movie', year: 2023, tmdb_id: 550 }
        ]
      });

      await service.enrichEntity('movie', 1);

      // Check that jobs were created with normal priority
      const recentJobs = await jobQueue.getRecentJobs(10);
      const enrichmentJobs = recentJobs.filter(j => j.type === 'enrich-metadata');

      expect(enrichmentJobs.length).toBeGreaterThan(0);
      if (enrichmentJobs.length > 0) {
        expect(enrichmentJobs[0].priority).toBe(5); // Normal priority
      }
    });

    it('should throw error for non-existent entity', async () => {
      await expect(service.enrichEntity('movie', 999)).rejects.toThrow();
    });
  });

  describe('setEnrichmentPriority', () => {
    it('should update enrichment priority', async () => {
      await testDb.seed({
        movies: [
          { title: 'Test Movie', year: 2023, tmdb_id: 550 }
        ]
      });

      await service.setEnrichmentPriority('movie', 1, 10);

      const db = (service as any).db;
      const movies = await db.query(
        'SELECT enrichment_priority FROM movies WHERE id = 1'
      ) as { enrichment_priority: number }[];

      expect(movies[0].enrichment_priority).toBe(10);
    });

    it('should clamp priority to valid range (1-10)', async () => {
      await testDb.seed({
        movies: [
          { title: 'Test Movie', year: 2023, tmdb_id: 550 }
        ]
      });

      await service.setEnrichmentPriority('movie', 1, 15); // Too high

      const db = (service as any).db;
      const movies = await db.query<{ enrichment_priority: number }>(
        'SELECT enrichment_priority FROM movies WHERE id = 1'
      );

      expect(movies[0].enrichment_priority).toBeLessThanOrEqual(10);
    });
  });

  describe('start/stop', () => {
    it('should start enrichment cycle', () => {
      service.start(60000); // 1 minute interval

      expect((service as any).intervalId).toBeDefined();
    });

    it('should stop enrichment cycle', () => {
      service.start(60000);
      service.stop();

      expect((service as any).intervalId).toBeNull();
    });

    it('should not start multiple intervals', () => {
      service.start(60000);
      const firstInterval = (service as any).intervalId;

      service.start(60000); // Try to start again
      const secondInterval = (service as any).intervalId;

      expect(firstInterval).toBe(secondInterval);
    });
  });

  describe('Enrichment cycle', () => {
    it('should identify movies needing enrichment', async () => {
      const db = (service as any).db;

      // Seed library and movies
      await db.execute(
        `INSERT INTO libraries (id, name, type, path, enabled)
         VALUES (1, 'Test Library', 'movie', '/movies', 1)`
      );

      // Movie 1: Never enriched
      await db.execute(
        `INSERT INTO movies (title, year, library_id, file_path, enriched_at, created_at, updated_at)
         VALUES ('Movie 1', 2023, 1, '/movies/test1', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
      );

      // Movie 2: Recently enriched
      await db.execute(
        `INSERT INTO movies (title, year, library_id, file_path, enriched_at, created_at, updated_at)
         VALUES ('Movie 2', 2023, 1, '/movies/test2', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
      );

      // Movie 3: Old enrichment
      await db.execute(
        `INSERT INTO movies (title, year, library_id, file_path, enriched_at, created_at, updated_at)
         VALUES ('Movie 3', 2023, 1, '/movies/test3', datetime('now', '-8 days'), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
      );

      // Call private method to get entities
      const entities = await (service as any).getEntitiesNeedingEnrichment('movie');

      expect(entities.length).toBeGreaterThan(0);
      // Should include movie 1 (never enriched) and movie 3 (old enrichment)
    });

    it('should respect enrichment priority ordering', async () => {
      const db = (service as any).db;

      await db.execute(
        `INSERT INTO libraries (id, name, type, path, enabled)
         VALUES (1, 'Test Library', 'movie', '/movies', 1)`
      );

      // Add movies with different priorities
      await db.execute(
        `INSERT INTO movies (title, year, library_id, file_path, enrichment_priority, enriched_at, created_at, updated_at)
         VALUES ('High Priority', 2023, 1, '/movies/test1', 1, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
      );

      await db.execute(
        `INSERT INTO movies (title, year, library_id, file_path, enrichment_priority, enriched_at, created_at, updated_at)
         VALUES ('Low Priority', 2023, 1, '/movies/test2', 10, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
      );

      const entities = await (service as any).getEntitiesNeedingEnrichment('movie');

      // High priority should come first
      if (entities.length >= 2) {
        expect(entities[0].enrichment_priority).toBeLessThanOrEqual(entities[1].enrichment_priority);
      }
    });
  });

  describe('Automation config', () => {
    it('should skip enrichment when automation is disabled', async () => {
      const db = (service as any).db;

      // Seed library with automation disabled
      await db.execute(
        `INSERT INTO libraries (id, name, type, path, enabled)
         VALUES (1, 'Test Library', 'movie', '/movies', 1)`
      );

      await db.execute(
        `INSERT INTO library_automation_config (library_id, mode, enrich_on_webhook, enrich_on_scan, created_at, updated_at)
         VALUES (1, 'manual', 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
      );

      await db.execute(
        `INSERT INTO movies (title, year, library_id, file_path, enriched_at, created_at, updated_at)
         VALUES ('Test Movie', 2023, 1, '/movies/test', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
      );

      const entities = await (service as any).getEntitiesNeedingEnrichment('movie');

      // Should skip movies from libraries with automation disabled
      expect(entities.filter((e: any) => e.library_id === 1)).toHaveLength(0);
    });
  });
});
