import { AssetSelectionService } from '../../src/services/assetSelectionService.js';
import { TestDatabase, createTestDatabase } from '../utils/testDatabase.js';

describe('AssetSelectionService', () => {
  let testDb: TestDatabase;
  let service: AssetSelectionService;

  beforeEach(async () => {
    testDb = await createTestDatabase();
    const db = await testDb.create();
    service = new AssetSelectionService(db);

    // Seed test data
    await testDb.seed({
      movies: [
        { title: 'Test Movie', year: 2023, tmdb_id: 12345 }
      ],
      assetCandidates: [
        { entity_type: 'movie', entity_id: 1, asset_type: 'poster', provider: 'tmdb', provider_url: 'http://image1.jpg' },
        { entity_type: 'movie', entity_id: 1, asset_type: 'poster', provider: 'tmdb', provider_url: 'http://image2.jpg' },
        { entity_type: 'movie', entity_id: 1, asset_type: 'fanart', provider: 'tmdb', provider_url: 'http://fanart1.jpg' }
      ]
    });
  });

  afterEach(async () => {
    await testDb.destroy();
  });

  describe('getCandidates', () => {
    it('should return all candidates for an entity', async () => {
      const candidates = await service.getCandidates('movie', 1);

      expect(candidates).toHaveLength(3);
      expect(candidates[0]).toHaveProperty('asset_type');
      expect(candidates[0]).toHaveProperty('provider');
    });

    it('should filter by asset type', async () => {
      const candidates = await service.getCandidates('movie', 1, 'poster');

      expect(candidates).toHaveLength(2);
      expect(candidates.every(c => c.asset_type === 'poster')).toBe(true);
    });

    it('should return empty array for non-existent entity', async () => {
      const candidates = await service.getCandidates('movie', 999);

      expect(candidates).toHaveLength(0);
    });
  });

  describe('selectAssetManually', () => {
    it('should select an asset and lock the type', async () => {
      const result = await service.selectAssetManually(1, 'test-user');

      expect(result.selected).toBe(true);
      expect(result.candidateId).toBe(1);

      // Verify selection
      const selected = await service.getSelectedAssets('movie', 1);
      expect(selected).toHaveLength(1);
      expect(selected[0].id).toBe(1);
      expect(selected[0].selected_by).toBe('test-user');
    });

    it('should deselect previously selected asset of same type', async () => {
      // Select first poster
      await service.selectAssetManually(1, 'test-user');

      // Select second poster
      await service.selectAssetManually(2, 'test-user');

      // Only second poster should be selected
      const selected = await service.getSelectedAssets('movie', 1);
      const posters = selected.filter(s => s.asset_type === 'poster');
      expect(posters).toHaveLength(1);
      expect(posters[0].id).toBe(2);
    });

    it('should return error for non-existent candidate', async () => {
      const result = await service.selectAssetManually(999, 'test-user');

      expect(result.selected).toBe(false);
      expect(result.reason).toBe('Candidate not found');
    });
  });

  describe('selectAssetYOLO', () => {
    it('should auto-select highest scored candidate', async () => {
      // Update scores using the service's database connection
      // Note: We need to access the db through the private property or add test data with scores
      // For now, let's reseed with proper scores
      await testDb.clear();
      await testDb.seed({
        movies: [
          { title: 'Test Movie', year: 2023, tmdb_id: 12345 }
        ],
        assetCandidates: [
          { entity_type: 'movie', entity_id: 1, asset_type: 'poster', provider: 'tmdb', provider_url: 'http://image1.jpg' },
          { entity_type: 'movie', entity_id: 1, asset_type: 'poster', provider: 'tmdb', provider_url: 'http://image2.jpg' }
        ]
      });

      // Now update scores directly via SQL (using a new query to the same db)
      const db = (service as any).db; // Access private db property
      await db.execute('UPDATE asset_candidates SET auto_score = 80 WHERE id = 1');
      await db.execute('UPDATE asset_candidates SET auto_score = 90 WHERE id = 2');

      const result = await service.selectAssetYOLO({
        entityType: 'movie',
        entityId: 1,
        assetType: 'poster',
        mode: 'yolo'
      });

      expect(result.selected).toBe(true);
      expect(result.candidateId).toBeDefined();

      // Verify it selected a candidate
      const selected = await service.getSelectedAssets('movie', 1);
      expect(selected).toHaveLength(1);
      expect(selected[0].asset_type).toBe('poster');
    });

    it('should return error when no candidates available', async () => {
      const result = await service.selectAssetYOLO({
        entityType: 'movie',
        entityId: 1,
        assetType: 'banner', // No banner candidates
        mode: 'yolo'
      });

      expect(result.selected).toBe(false);
      expect(result.reason).toBe('No candidates available');
    });
  });

  describe('unlockAssetType', () => {
    it('should unlock asset type and deselect candidates', async () => {
      // Select a poster
      await service.selectAssetManually(1, 'test-user');

      // Unlock poster
      const success = await service.unlockAssetType('movie', 1, 'poster');

      expect(success).toBe(true);

      // Verify no posters selected
      const selected = await service.getSelectedAssets('movie', 1);
      const posters = selected.filter(s => s.asset_type === 'poster');
      expect(posters).toHaveLength(0);
    });
  });

  describe('rejectAsset', () => {
    it('should mark asset as rejected', async () => {
      const success = await service.rejectAsset(1, 'test-user', 'Poor quality');

      expect(success).toBe(true);

      // Verify rejection
      const candidates = await service.getCandidates('movie', 1);
      const rejected = candidates.find(c => c.id === 1);
      expect(rejected?.is_rejected).toBe(1);
    });
  });
});
