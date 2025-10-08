import { WebhookService } from '../../src/services/webhookService.js';
import { JobQueueService } from '../../src/services/jobQueueService.js';
import { TestDatabase, createTestDatabase } from '../utils/testDatabase.js';

describe('WebhookService', () => {
  let testDb: TestDatabase;
  let jobQueue: JobQueueService;
  let service: WebhookService;

  beforeEach(async () => {
    testDb = await createTestDatabase();
    const db = await testDb.create();
    jobQueue = new JobQueueService(db);
    service = new WebhookService(jobQueue);
  });

  afterEach(async () => {
    jobQueue.stop();
    await testDb.destroy();
  });

  describe('processRadarrWebhook', () => {
    it('should create job for Download event', async () => {
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
          releaseGroup: 'RELEASE',
          sceneName: 'test.movie.2023.1080p'
        }
      };

      const jobId = await service.processRadarrWebhook(webhook);

      expect(jobId).toBeGreaterThan(0);

      // Verify job was created
      const job = await jobQueue.getJob(jobId);
      expect(job).toBeDefined();
      expect(job?.type).toBe('webhook');
      expect(job?.priority).toBe(1); // Critical priority
      expect(job?.payload.source).toBe('radarr');
      expect(job?.payload.movie.title).toBe('Test Movie');
    });

    it('should handle Test webhook without creating job', async () => {
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

      const jobId = await service.processRadarrWebhook(webhook);

      expect(jobId).toBe(-1); // Test webhooks return -1
    });

    it('should create job for Rename event', async () => {
      const webhook = {
        eventType: 'Rename' as const,
        movie: {
          id: 123,
          title: 'Test Movie',
          year: 2023,
          folderPath: '/movies/Test Movie (2023)',
          tmdbId: 550,
          imdbId: 'tt0137523'
        }
      };

      const jobId = await service.processRadarrWebhook(webhook);

      expect(jobId).toBeGreaterThan(0);

      const job = await jobQueue.getJob(jobId);
      expect(job?.payload.event).toBe('Rename');
    });

    it('should create job for Grab event', async () => {
      const webhook = {
        eventType: 'Grab' as const,
        movie: {
          id: 123,
          title: 'Test Movie',
          year: 2023,
          folderPath: '/movies/Test Movie (2023)',
          tmdbId: 550,
          imdbId: 'tt0137523'
        }
      };

      const jobId = await service.processRadarrWebhook(webhook);

      expect(jobId).toBeGreaterThan(0);

      const job = await jobQueue.getJob(jobId);
      expect(job?.payload.event).toBe('Grab');
    });

    it('should include movie file info in payload when present', async () => {
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
          releaseGroup: 'RELEASE',
          sceneName: 'test.movie.2023.1080p'
        }
      };

      const jobId = await service.processRadarrWebhook(webhook);
      const job = await jobQueue.getJob(jobId);

      expect(job?.payload.movieFile).toBeDefined();
      expect(job?.payload.movieFile.path).toBe('/movies/Test Movie (2023)/Test Movie (2023).mkv');
      expect(job?.payload.movieFile.quality).toBe('1080p');
    });
  });

  describe('processSonarrWebhook', () => {
    it('should create job for Download event', async () => {
      const webhook = {
        eventType: 'Download' as const,
        series: {
          id: 456,
          title: 'Test Series',
          year: 2023,
          path: '/tv/Test Series',
          tvdbId: 12345,
          tvMazeId: 67890,
          type: 'series'
        },
        episodes: [
          {
            id: 1,
            episodeNumber: 1,
            seasonNumber: 1,
            title: 'Pilot',
            airDate: '2023-01-01',
            airDateUtc: '2023-01-01T00:00:00Z'
          }
        ]
      };

      const jobId = await service.processSonarrWebhook(webhook);

      expect(jobId).toBeGreaterThan(0);

      const job = await jobQueue.getJob(jobId);
      expect(job?.type).toBe('webhook');
      expect(job?.payload.source).toBe('sonarr');
      expect(job?.payload.series.title).toBe('Test Series');
    });

    it('should handle Test webhook', async () => {
      const webhook = {
        eventType: 'Test' as const,
        series: {
          id: 1,
          title: 'Test',
          year: 2023,
          path: '/test',
          tvdbId: 1,
          tvMazeId: 1,
          type: 'series'
        }
      };

      const jobId = await service.processSonarrWebhook(webhook);

      expect(jobId).toBe(-1);
    });

    it('should handle Rename event', async () => {
      const webhook = {
        eventType: 'Rename' as const,
        series: {
          id: 456,
          title: 'Test Series',
          year: 2023,
          path: '/tv/Test Series',
          tvdbId: 12345,
          tvMazeId: 67890,
          type: 'series'
        }
      };

      const jobId = await service.processSonarrWebhook(webhook);

      expect(jobId).toBeGreaterThan(0);

      const job = await jobQueue.getJob(jobId);
      expect(job?.payload.event).toBe('Rename');
    });
  });

  describe('processLidarrWebhook', () => {
    it('should create job for Download event', async () => {
      const webhook = {
        eventType: 'Download' as const,
        artist: {
          id: 789,
          name: 'Test Artist',
          path: '/music/Test Artist',
          mbId: 'mbid-12345'
        },
        albums: [
          {
            id: 1,
            title: 'Test Album',
            releaseDate: '2023-01-01',
            mbId: 'mbid-album-1',
            trackCount: 12
          }
        ]
      };

      const jobId = await service.processLidarrWebhook(webhook);

      expect(jobId).toBeGreaterThan(0);

      const job = await jobQueue.getJob(jobId);
      expect(job?.type).toBe('webhook');
      expect(job?.payload.source).toBe('lidarr');
      expect(job?.payload.artist.name).toBe('Test Artist');
    });

    it('should handle Test webhook', async () => {
      const webhook = {
        eventType: 'Test' as const,
        artist: {
          id: 1,
          name: 'Test',
          path: '/test',
          mbId: 'test'
        }
      };

      const jobId = await service.processLidarrWebhook(webhook);

      expect(jobId).toBe(-1);
    });

    it('should handle Grab event', async () => {
      const webhook = {
        eventType: 'Grab' as const,
        artist: {
          id: 789,
          name: 'Test Artist',
          path: '/music/Test Artist',
          mbId: 'mbid-12345'
        }
      };

      const jobId = await service.processLidarrWebhook(webhook);

      expect(jobId).toBeGreaterThan(0);

      const job = await jobQueue.getJob(jobId);
      expect(job?.payload.event).toBe('Grab');
    });
  });

  describe('Job Creation', () => {
    it('should create jobs with critical priority (1)', async () => {
      const webhook = {
        eventType: 'Download' as const,
        movie: {
          id: 123,
          title: 'Test Movie',
          year: 2023,
          folderPath: '/movies/Test Movie (2023)',
          tmdbId: 550,
          imdbId: 'tt0137523'
        }
      };

      const jobId = await service.processRadarrWebhook(webhook);
      const job = await jobQueue.getJob(jobId);

      expect(job?.priority).toBe(1); // Webhooks are critical
    });

    it('should create jobs with proper payload structure', async () => {
      const webhook = {
        eventType: 'Download' as const,
        movie: {
          id: 123,
          title: 'Test Movie',
          year: 2023,
          folderPath: '/movies/Test Movie (2023)',
          tmdbId: 550,
          imdbId: 'tt0137523'
        }
      };

      const jobId = await service.processRadarrWebhook(webhook);
      const job = await jobQueue.getJob(jobId);

      expect(job?.payload).toHaveProperty('source');
      expect(job?.payload).toHaveProperty('event');
      expect(job?.payload).toHaveProperty('movie');
    });
  });
});
