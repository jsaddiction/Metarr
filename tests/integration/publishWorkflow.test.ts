import { PublishingService } from '../../src/services/publishingService.js';
import { AssetSelectionService } from '../../src/services/assetSelectionService.js';
import { TestDatabase, createTestDatabase } from '../utils/testDatabase.js';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Integration Test: Complete Publishing Workflow
 *
 * Tests the full flow:
 * 1. Movie with metadata exists
 * 2. Assets are discovered and added as candidates
 * 3. Assets are selected (manual or YOLO)
 * 4. Assets are cached
 * 5. Publishing generates NFO and copies assets to library
 * 6. Dirty state is cleared
 */

describe('Publish Workflow Integration', () => {
  let testDb: TestDatabase;
  let publishingService: PublishingService;
  let assetSelection: AssetSelectionService;
  let tempDir: string;

  beforeEach(async () => {
    testDb = await createTestDatabase();
    const db = await testDb.create();

    publishingService = new PublishingService(db);
    assetSelection = new AssetSelectionService(db);

    // Create temp directory for testing
    tempDir = path.join(process.cwd(), 'test_temp', `publish_int_${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });

    // Create subdirectories
    const cacheDir = path.join(tempDir, 'cache');
    const movieDir = path.join(tempDir, 'The Matrix (1999)');
    await fs.mkdir(cacheDir, { recursive: true });
    await fs.mkdir(movieDir, { recursive: true });

    // Seed library
    await db.execute(
      `INSERT INTO libraries (id, name, type, path, enabled, created_at, updated_at)
       VALUES (1, 'Test Library', 'movie', ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [tempDir]
    );

    // Seed movie with full metadata
    await db.execute(
      `INSERT INTO movies (
        id, title, year, plot, tagline,
        tmdb_id, imdb_id,
        library_id, file_path, has_unpublished_changes,
        created_at, updated_at
      ) VALUES (
        1, 'The Matrix', 1999,
        'A computer hacker learns the truth about his reality.',
        'Free your mind',
        603, 'tt0133093',
        1, ?, 1,
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )`,
      [movieDir]
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

  it('should complete full publish workflow without assets', async () => {
    // Step 1: Verify entity needs publishing
    const needsPublish = await publishingService.needsPublishing('movie', 1);
    expect(needsPublish).toBe(true);

    // Step 2: Publish entity (no assets selected)
    const result = await publishingService.publish({
      entityType: 'movie',
      entityId: 1,
      libraryPath: path.join(tempDir, 'The Matrix (1999)'),
      mediaFilename: 'The Matrix (1999)'
    });

    expect(result.success).toBe(true);
    expect(result.nfoGenerated).toBe(true);
    expect(result.assetsPublished).toBe(0);
    expect(result.errors).toHaveLength(0);

    // Step 3: Verify NFO was created
    const nfoPath = path.join(tempDir, 'The Matrix (1999)', 'The Matrix (1999).nfo');
    const nfoExists = await fs.access(nfoPath)
      .then(() => true)
      .catch(() => false);

    expect(nfoExists).toBe(true);

    // Step 4: Verify NFO content
    const nfoContent = await fs.readFile(nfoPath, 'utf-8');
    expect(nfoContent).toContain('<movie>');
    expect(nfoContent).toContain('<title>The Matrix</title>');
    expect(nfoContent).toContain('<year>1999</year>');
    expect(nfoContent).toContain('<plot>A computer hacker learns the truth about his reality.</plot>');

    // Step 5: Verify dirty flag is cleared
    const db = (publishingService as any).db;
    const movies = await db.query(
      'SELECT has_unpublished_changes FROM movies WHERE id = 1'
    ) as { has_unpublished_changes: number }[];
    expect(movies[0].has_unpublished_changes).toBe(0);

    // Step 6: Verify entity no longer needs publishing
    const stillNeedsPublish = await publishingService.needsPublishing('movie', 1);
    expect(stillNeedsPublish).toBe(false);
  });

  it('should complete full workflow with asset selection and publishing', async () => {
    const db = (assetSelection as any).db;

    // Step 1: Add asset candidates
    await db.execute(
      `INSERT INTO asset_candidates (entity_type, entity_id, asset_type, provider, provider_url, auto_score, created_at, updated_at)
       VALUES ('movie', 1, 'poster', 'tmdb', 'http://poster1.jpg', 85, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
    );
    await db.execute(
      `INSERT INTO asset_candidates (entity_type, entity_id, asset_type, provider, provider_url, auto_score, created_at, updated_at)
       VALUES ('movie', 1, 'poster', 'tmdb', 'http://poster2.jpg', 95, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
    );
    await db.execute(
      `INSERT INTO asset_candidates (entity_type, entity_id, asset_type, provider, provider_url, auto_score, created_at, updated_at)
       VALUES ('movie', 1, 'fanart', 'tmdb', 'http://fanart1.jpg', 80, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
    );

    // Step 2: Get candidates
    const candidates = await assetSelection.getCandidates('movie', 1);
    expect(candidates.length).toBe(3);

    // Step 3: Select assets using YOLO mode (auto-select highest scored)
    const posterResult = await assetSelection.selectAssetYOLO({
      entityType: 'movie',
      entityId: 1,
      assetType: 'poster',
      mode: 'yolo'
    });
    expect(posterResult.selected).toBe(true);

    const fanartResult = await assetSelection.selectAssetYOLO({
      entityType: 'movie',
      entityId: 1,
      assetType: 'fanart',
      mode: 'yolo'
    });
    expect(fanartResult.selected).toBe(true);

    // Step 4: Verify selections
    const selected = await assetSelection.getSelectedAssets('movie', 1);
    expect(selected.length).toBe(2);

    // Step 5: Create dummy cache files
    const cacheDir = path.join(tempDir, 'cache');
    const posterCachePath = path.join(cacheDir, 'poster_hash123.jpg');
    const fanartCachePath = path.join(cacheDir, 'fanart_hash456.jpg');

    await fs.writeFile(posterCachePath, 'fake poster data');
    await fs.writeFile(fanartCachePath, 'fake fanart data');

    // Add to cache inventory
    const posterCandidate = selected.find(s => s.asset_type === 'poster');
    const fanartCandidate = selected.find(s => s.asset_type === 'fanart');

    await db.execute(
      `UPDATE asset_candidates SET content_hash = 'hash123', is_downloaded = 1 WHERE id = ?`,
      [posterCandidate?.id]
    );
    await db.execute(
      `UPDATE asset_candidates SET content_hash = 'hash456', is_downloaded = 1 WHERE id = ?`,
      [fanartCandidate?.id]
    );

    await db.execute(
      `INSERT INTO cache_inventory (asset_type, content_hash, file_path, file_size, first_used_at)
       VALUES ('poster', 'hash123', ?, 100, CURRENT_TIMESTAMP)`,
      [posterCachePath]
    );
    await db.execute(
      `INSERT INTO cache_inventory (asset_type, content_hash, file_path, file_size, first_used_at)
       VALUES ('fanart', 'hash456', ?, 200, CURRENT_TIMESTAMP)`,
      [fanartCachePath]
    );

    // Step 6: Publish
    const publishResult = await publishingService.publish({
      entityType: 'movie',
      entityId: 1,
      libraryPath: path.join(tempDir, 'The Matrix (1999)'),
      mediaFilename: 'The Matrix (1999)'
    });

    expect(publishResult.success).toBe(true);
    expect(publishResult.nfoGenerated).toBe(true);
    expect(publishResult.assetsPublished).toBe(2);

    // Step 7: Verify assets were copied to library
    const libraryPosterPath = path.join(tempDir, 'The Matrix (1999)', 'The Matrix (1999)-poster.jpg');
    const libraryFanartPath = path.join(tempDir, 'The Matrix (1999)', 'The Matrix (1999)-fanart.jpg');

    const posterExists = await fs.access(libraryPosterPath)
      .then(() => true)
      .catch(() => false);
    const fanartExists = await fs.access(libraryFanartPath)
      .then(() => true)
      .catch(() => false);

    expect(posterExists).toBe(true);
    expect(fanartExists).toBe(true);
  });

  it('should handle re-publishing with changes', async () => {
    const db = (publishingService as any).db;

    // First publish
    await publishingService.publish({
      entityType: 'movie',
      entityId: 1,
      libraryPath: path.join(tempDir, 'The Matrix (1999)'),
      mediaFilename: 'The Matrix (1999)'
    });

    // Make changes to metadata
    await db.execute(
      `UPDATE movies SET plot = 'Updated plot description', has_unpublished_changes = 1 WHERE id = 1`
    );

    // Verify needs republishing
    const needsPublish = await publishingService.needsPublishing('movie', 1);
    expect(needsPublish).toBe(true);

    // Re-publish
    const result = await publishingService.publish({
      entityType: 'movie',
      entityId: 1,
      libraryPath: path.join(tempDir, 'The Matrix (1999)'),
      mediaFilename: 'The Matrix (1999)'
    });

    expect(result.success).toBe(true);

    // Verify NFO was updated
    const nfoPath = path.join(tempDir, 'The Matrix (1999)', 'The Matrix (1999).nfo');
    const nfoContent = await fs.readFile(nfoPath, 'utf-8');
    expect(nfoContent).toContain('<plot>Updated plot description</plot>');
  });

  it('should track publish history', async () => {
    // Publish twice
    await publishingService.publish({
      entityType: 'movie',
      entityId: 1,
      libraryPath: path.join(tempDir, 'The Matrix (1999)'),
      mediaFilename: 'The Matrix (1999)'
    });

    const db = (publishingService as any).db;
    await db.execute(
      `UPDATE movies SET has_unpublished_changes = 1 WHERE id = 1`
    );

    await publishingService.publish({
      entityType: 'movie',
      entityId: 1,
      libraryPath: path.join(tempDir, 'The Matrix (1999)'),
      mediaFilename: 'The Matrix (1999)'
    });

    // Check publish log
    const logs = await db.query(
      'SELECT COUNT(*) as count FROM publish_log WHERE entity_type = ? AND entity_id = ?',
      ['movie', 1]
    );

    expect(logs[0].count).toBe(2);
  });

  it('should identify entities needing publish', async () => {
    const db = (publishingService as any).db;

    // Add more movies
    await db.execute(
      `INSERT INTO movies (title, year, library_id, file_path, has_unpublished_changes, created_at, updated_at)
       VALUES ('Movie 2', 2024, 1, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [path.join(tempDir, 'Movie 2 (2024)')]
    );
    await db.execute(
      `INSERT INTO movies (title, year, library_id, file_path, has_unpublished_changes, created_at, updated_at)
       VALUES ('Movie 3', 2024, 1, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [path.join(tempDir, 'Movie 3 (2024)')]
    );

    const entities = await publishingService.getEntitiesNeedingPublish('movie');

    expect(entities).toContain(1); // The Matrix
    expect(entities).toContain(2); // Movie 2
    expect(entities).not.toContain(3); // Movie 3 is already published
  });
});
