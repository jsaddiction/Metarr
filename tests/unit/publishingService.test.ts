import { PublishingService } from '../../src/services/publishingService.js';
import { TestDatabase, createTestDatabase } from '../utils/testDatabase.js';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('PublishingService', () => {
  let testDb: TestDatabase;
  let service: PublishingService;
  let tempDir: string;

  beforeEach(async () => {
    testDb = await createTestDatabase();
    const db = await testDb.create();
    service = new PublishingService(db);

    // Create temp directory for testing
    tempDir = path.join(process.cwd(), 'test_temp', `publish_${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });

    // Seed library
    await testDb.seed({
      libraries: [
        { name: 'Test Library', type: 'movie', path: tempDir }
      ],
      movies: [
        { title: 'Test Movie', year: 2023, tmdb_id: 550, imdb_id: 'tt0137523', library_id: 1 }
      ]
    });

    // Update movie with metadata
    const movieDb = (service as any).db;
    await movieDb.execute(
      `UPDATE movies SET plot = ?, tagline = ?, file_path = ? WHERE id = 1`,
      ['A test plot', 'Test tagline', tempDir]
    );
  });

  afterEach(async () => {
    await testDb.destroy();

    // Cleanup temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('needsPublishing', () => {
    it('should return true for entities with unpublished changes', async () => {
      const db = (service as any).db;
      await db.execute(
        `UPDATE movies SET has_unpublished_changes = 1 WHERE id = 1`
      );

      const needs = await service.needsPublishing('movie', 1);
      expect(needs).toBe(true);
    });

    it('should return false for published entities', async () => {
      const db = (service as any).db;
      await db.execute(
        `UPDATE movies SET has_unpublished_changes = 0 WHERE id = 1`
      );

      const needs = await service.needsPublishing('movie', 1);
      expect(needs).toBe(false);
    });

    it('should return false for non-existent entities', async () => {
      const needs = await service.needsPublishing('movie', 999);
      expect(needs).toBe(false);
    });
  });

  describe('getEntitiesNeedingPublish', () => {
    it('should return list of entity IDs needing publish', async () => {
      const db = (service as any).db;

      // Add more movies
      await db.execute(
        `INSERT INTO movies (title, year, library_id, file_path, has_unpublished_changes, created_at, updated_at)
         VALUES ('Movie 2', 2024, 1, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [tempDir]
      );
      await db.execute(
        `INSERT INTO movies (title, year, library_id, file_path, has_unpublished_changes, created_at, updated_at)
         VALUES ('Movie 3', 2024, 1, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [tempDir]
      );

      // Mark first movie as needing publish
      await db.execute(
        `UPDATE movies SET has_unpublished_changes = 1 WHERE id = 1`
      );

      const entities = await service.getEntitiesNeedingPublish('movie');

      expect(entities.length).toBeGreaterThan(0);
      expect(entities).toContain(1);
      expect(entities).toContain(2);
      expect(entities).not.toContain(3); // This one is published
    });

    it('should return empty array when no entities need publish', async () => {
      const db = (service as any).db;
      await db.execute(
        `UPDATE movies SET has_unpublished_changes = 0 WHERE id = 1`
      );

      const entities = await service.getEntitiesNeedingPublish('movie');
      expect(entities).toHaveLength(0);
    });
  });

  describe('publish', () => {
    it('should publish entity with NFO generation', async () => {
      const result = await service.publish({
        entityType: 'movie',
        entityId: 1,
        libraryPath: tempDir,
        mediaFilename: 'Test Movie (2023)'
      });

      expect(result.success).toBe(true);
      expect(result.nfoGenerated).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should write NFO file to library path', async () => {
      await service.publish({
        entityType: 'movie',
        entityId: 1,
        libraryPath: tempDir,
        mediaFilename: 'Test Movie (2023)'
      });

      const nfoPath = path.join(tempDir, 'Test Movie (2023).nfo');
      const nfoExists = await fs.access(nfoPath)
        .then(() => true)
        .catch(() => false);

      expect(nfoExists).toBe(true);
    });

    it('should generate valid NFO XML content', async () => {
      await service.publish({
        entityType: 'movie',
        entityId: 1,
        libraryPath: tempDir,
        mediaFilename: 'Test Movie (2023)'
      });

      const nfoPath = path.join(tempDir, 'Test Movie (2023).nfo');
      const nfoContent = await fs.readFile(nfoPath, 'utf-8');

      expect(nfoContent).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(nfoContent).toContain('<movie>');
      expect(nfoContent).toContain('<title>Test Movie</title>');
      expect(nfoContent).toContain('<year>2023</year>');
      expect(nfoContent).toContain('</movie>');
    });

    it('should update has_unpublished_changes flag', async () => {
      const db = (service as any).db;
      await db.execute(
        `UPDATE movies SET has_unpublished_changes = 1 WHERE id = 1`
      );

      await service.publish({
        entityType: 'movie',
        entityId: 1,
        libraryPath: tempDir,
        mediaFilename: 'Test Movie (2023)'
      });

      const movies = await db.query(
        'SELECT has_unpublished_changes FROM movies WHERE id = 1'
      ) as { has_unpublished_changes: number }[];

      expect(movies[0].has_unpublished_changes).toBe(0);
    });

    it('should log publication', async () => {
      await service.publish({
        entityType: 'movie',
        entityId: 1,
        libraryPath: tempDir,
        mediaFilename: 'Test Movie (2023)'
      });

      const db = (service as any).db;
      const logs = await db.query(
        'SELECT * FROM publish_log WHERE entity_type = ? AND entity_id = ?',
        ['movie', 1]
      );

      expect(logs.length).toBeGreaterThan(0);
    });

    it('should return error for non-existent entity', async () => {
      const result = await service.publish({
        entityType: 'movie',
        entityId: 999,
        libraryPath: tempDir,
        mediaFilename: 'Fake Movie'
      });

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Entity not found');
    });

    it('should handle publish with selected assets', async () => {
      const db = (service as any).db;

      // Add asset candidate and mark as selected
      await db.execute(
        `INSERT INTO asset_candidates (entity_type, entity_id, asset_type, provider, provider_url, is_selected, content_hash, created_at, updated_at)
         VALUES ('movie', 1, 'poster', 'tmdb', 'http://poster.jpg', 1, 'abc123', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
      );

      // Create cache directory and file
      const cacheDir = path.join(tempDir, 'cache');
      await fs.mkdir(cacheDir, { recursive: true });
      const cachePath = path.join(cacheDir, 'poster_abc123.jpg');
      await fs.writeFile(cachePath, 'fake poster data');

      // Add to cache inventory
      await db.execute(
        `INSERT INTO cache_inventory (asset_type, content_hash, file_path, file_size, first_used_at)
         VALUES ('poster', 'abc123', ?, 100, CURRENT_TIMESTAMP)`,
        [cachePath]
      );

      const result = await service.publish({
        entityType: 'movie',
        entityId: 1,
        libraryPath: tempDir,
        mediaFilename: 'Test Movie (2023)'
      });

      expect(result.success).toBe(true);
      expect(result.assetsPublished).toBeGreaterThan(0);
    });
  });
});
