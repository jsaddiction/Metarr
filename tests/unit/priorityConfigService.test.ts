import { TestDatabase, createTestDatabase } from '../utils/testDatabase.js';
import { PriorityConfigService } from '../../src/services/priorityConfigService.js';
import { UpdateAssetTypePriorityRequest, UpdateMetadataFieldPriorityRequest } from '../../src/types/provider.js';
import { FORCED_LOCAL_FIELDS } from '../../src/config/providerMetadata.js';
import { DatabaseConnection } from '../../src/types/database.js';

describe('PriorityConfigService', () => {
  let testDb: TestDatabase;
  let db: DatabaseConnection;
  let service: PriorityConfigService;

  beforeEach(async () => {
    testDb = await createTestDatabase();
    db = await testDb.create();
    service = new PriorityConfigService(db);
  });

  afterEach(async () => {
    await testDb.destroy();
  });

  describe('getAllAssetTypePriorities', () => {
    it('should return empty array when no priorities configured', async () => {
      const result = await service.getAllAssetTypePriorities();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });

    it('should return all configured asset type priorities', async () => {
      await service.upsertAssetTypePriority({
        assetType: 'poster',
        providerOrder: ['fanart_tv', 'tmdb', 'local']
      });

      await service.upsertAssetTypePriority({
        assetType: 'fanart',
        providerOrder: ['tmdb', 'fanart_tv', 'local']
      });

      const result = await service.getAllAssetTypePriorities();

      expect(result.length).toBeGreaterThanOrEqual(2);
      const assetTypes = result.map(p => p.assetType);
      expect(assetTypes).toContain('poster');
      expect(assetTypes).toContain('fanart');
    });

    it('should return priorities sorted by asset type', async () => {
      await service.upsertAssetTypePriority({
        assetType: 'fanart',
        providerOrder: ['tmdb']
      });

      await service.upsertAssetTypePriority({
        assetType: 'banner',
        providerOrder: ['tvdb']
      });

      const result = await service.getAllAssetTypePriorities();
      const types = result.map(p => p.assetType);

      // Should be alphabetically sorted
      const sortedTypes = [...types].sort();
      expect(types).toEqual(sortedTypes);
    });
  });

  describe('getAssetTypePriority', () => {
    it('should return null for non-existent asset type', async () => {
      const result = await service.getAssetTypePriority('non_existent');
      expect(result).toBeNull();
    });

    it('should return asset type priority by type', async () => {
      await service.upsertAssetTypePriority({
        assetType: 'poster',
        providerOrder: ['fanart_tv', 'tmdb', 'tvdb', 'local']
      });

      const result = await service.getAssetTypePriority('poster');

      expect(result).not.toBeNull();
      expect(result?.assetType).toBe('poster');
      expect(result?.providerOrder).toEqual(['fanart_tv', 'tmdb', 'tvdb', 'local']);
    });
  });

  describe('upsertAssetTypePriority', () => {
    it('should create new asset type priority', async () => {
      const data: UpdateAssetTypePriorityRequest = {
        assetType: 'poster',
        providerOrder: ['fanart_tv', 'tmdb', 'local']
      };

      const result = await service.upsertAssetTypePriority(data);

      expect(result.assetType).toBe('poster');
      expect(result.providerOrder).toEqual(['fanart_tv', 'tmdb', 'local']);
      expect(result.createdAt).toBeInstanceOf(Date);
      expect(result.updatedAt).toBeInstanceOf(Date);
    });

    it('should update existing asset type priority', async () => {
      // Create initial priority
      await service.upsertAssetTypePriority({
        assetType: 'poster',
        providerOrder: ['tmdb', 'local']
      });

      // Update priority
      const updated = await service.upsertAssetTypePriority({
        assetType: 'poster',
        providerOrder: ['fanart_tv', 'tmdb', 'tvdb', 'local']
      });

      expect(updated.providerOrder).toEqual(['fanart_tv', 'tmdb', 'tvdb', 'local']);
    });

    it('should switch active preset to custom when manually updating', async () => {
      // Apply a preset
      await service.applyPreset('quality_first');

      // Manually update a priority
      await service.upsertAssetTypePriority({
        assetType: 'poster',
        providerOrder: ['tmdb', 'local']
      });

      // Check that active preset is now custom
      const activePreset = await service.getActivePreset();
      expect(activePreset?.presetId).toBe('custom');
    });

    it('should preserve id when updating', async () => {
      const initial = await service.upsertAssetTypePriority({
        assetType: 'poster',
        providerOrder: ['tmdb']
      });

      const updated = await service.upsertAssetTypePriority({
        assetType: 'poster',
        providerOrder: ['fanart_tv', 'tmdb']
      });

      expect(updated.id).toBe(initial.id);
    });

    it('should handle empty provider order', async () => {
      const result = await service.upsertAssetTypePriority({
        assetType: 'poster',
        providerOrder: []
      });

      expect(result.providerOrder).toEqual([]);
    });

    it('should handle single provider in order', async () => {
      const result = await service.upsertAssetTypePriority({
        assetType: 'poster',
        providerOrder: ['local']
      });

      expect(result.providerOrder).toEqual(['local']);
    });
  });

  describe('getAllMetadataFieldPriorities', () => {
    it('should return forced local fields from migration', async () => {
      const result = await service.getAllMetadataFieldPriorities();

      // Should have forced fields from migration
      expect(result.length).toBeGreaterThan(0);

      const forcedFields = result.filter(p => p.forcedProvider === 'local');
      expect(forcedFields.length).toBeGreaterThan(0);

      // Check specific forced fields
      const fieldNames = forcedFields.map(f => f.fieldName);
      expect(fieldNames).toContain('runtime');
      expect(fieldNames).toContain('video_codec');
    });

    it('should return user-configured field priorities', async () => {
      await service.upsertMetadataFieldPriority({
        fieldName: 'rating',
        providerOrder: ['imdb', 'tmdb', 'tvdb']
      });

      const result = await service.getAllMetadataFieldPriorities();
      const rating = result.find(p => p.fieldName === 'rating');

      expect(rating).toBeDefined();
      expect(rating?.providerOrder).toEqual(['imdb', 'tmdb', 'tvdb']);
    });

    it('should return priorities sorted by field name', async () => {
      await service.upsertMetadataFieldPriority({
        fieldName: 'plot',
        providerOrder: ['tmdb']
      });

      await service.upsertMetadataFieldPriority({
        fieldName: 'genres',
        providerOrder: ['tmdb']
      });

      const result = await service.getAllMetadataFieldPriorities();
      const fieldNames = result.map(p => p.fieldName);

      // Should be alphabetically sorted
      const sortedNames = [...fieldNames].sort();
      expect(fieldNames).toEqual(sortedNames);
    });
  });

  describe('getMetadataFieldPriority', () => {
    it('should return forced local field priority', async () => {
      const result = await service.getMetadataFieldPriority('runtime');

      expect(result).not.toBeNull();
      expect(result?.fieldName).toBe('runtime');
      expect(result?.providerOrder).toEqual(['local']);
      expect(result?.forcedProvider).toBe('local');
    });

    it('should return user-configured field priority', async () => {
      await service.upsertMetadataFieldPriority({
        fieldName: 'rating',
        providerOrder: ['imdb', 'tmdb']
      });

      const result = await service.getMetadataFieldPriority('rating');

      expect(result).not.toBeNull();
      expect(result?.fieldName).toBe('rating');
      expect(result?.providerOrder).toEqual(['imdb', 'tmdb']);
      expect(result?.forcedProvider).toBeUndefined();
    });

    it('should return null for non-existent field', async () => {
      const result = await service.getMetadataFieldPriority('non_existent_field');
      expect(result).toBeNull();
    });
  });

  describe('upsertMetadataFieldPriority', () => {
    it('should create new metadata field priority', async () => {
      const data: UpdateMetadataFieldPriorityRequest = {
        fieldName: 'rating',
        providerOrder: ['imdb', 'tmdb', 'tvdb']
      };

      const result = await service.upsertMetadataFieldPriority(data);

      expect(result.fieldName).toBe('rating');
      expect(result.providerOrder).toEqual(['imdb', 'tmdb', 'tvdb']);
      expect(result.forcedProvider).toBeUndefined();
      expect(result.createdAt).toBeInstanceOf(Date);
      expect(result.updatedAt).toBeInstanceOf(Date);
    });

    it('should update existing metadata field priority', async () => {
      // Create initial priority
      await service.upsertMetadataFieldPriority({
        fieldName: 'rating',
        providerOrder: ['tmdb']
      });

      // Update priority
      const updated = await service.upsertMetadataFieldPriority({
        fieldName: 'rating',
        providerOrder: ['imdb', 'tmdb']
      });

      expect(updated.providerOrder).toEqual(['imdb', 'tmdb']);
    });

    it('should throw error when trying to update forced local field', async () => {
      await expect(
        service.upsertMetadataFieldPriority({
          fieldName: 'runtime',
          providerOrder: ['tmdb', 'local']
        })
      ).rejects.toThrow('forced to use Local provider');
    });

    it('should reject all forced local fields', async () => {
      for (const field of FORCED_LOCAL_FIELDS) {
        await expect(
          service.upsertMetadataFieldPriority({
            fieldName: field,
            providerOrder: ['tmdb']
          })
        ).rejects.toThrow();
      }
    });

    it('should switch active preset to custom when manually updating', async () => {
      // Apply a preset
      await service.applyPreset('quality_first');

      // Manually update a priority
      await service.upsertMetadataFieldPriority({
        fieldName: 'rating',
        providerOrder: ['tmdb', 'imdb']
      });

      // Check that active preset is now custom
      const activePreset = await service.getActivePreset();
      expect(activePreset?.presetId).toBe('custom');
    });
  });

  describe('getActivePreset', () => {
    it('should return default preset (quality_first) from migration', async () => {
      const result = await service.getActivePreset();

      expect(result).not.toBeNull();
      expect(result?.presetId).toBe('quality_first');
      expect(result?.isActive).toBe(true);
    });

    it('should return updated preset after applying new one', async () => {
      await service.applyPreset('speed_first');

      const result = await service.getActivePreset();

      expect(result?.presetId).toBe('speed_first');
      expect(result?.isActive).toBe(true);
    });

    it('should return null if no preset is active', async () => {
      // Clear all presets (would not normally happen in production)
      await db.execute('DELETE FROM priority_presets');

      const result = await service.getActivePreset();
      expect(result).toBeNull();
    });
  });

  describe('setActivePreset', () => {
    it('should set a valid preset as active', async () => {
      await service.setActivePreset('speed_first');

      const result = await service.getActivePreset();
      expect(result?.presetId).toBe('speed_first');
    });

    it('should allow setting custom preset', async () => {
      await service.setActivePreset('custom');

      const result = await service.getActivePreset();
      expect(result?.presetId).toBe('custom');
    });

    it('should throw error for invalid preset', async () => {
      await expect(service.setActivePreset('invalid_preset')).rejects.toThrow(
        'Unknown preset: invalid_preset'
      );
    });

    it('should deactivate previous preset when setting new one', async () => {
      await service.setActivePreset('quality_first');
      await service.setActivePreset('speed_first');

      const allPresets = await db.query<{ preset_id: string; is_active: number }>(
        'SELECT preset_id, is_active FROM priority_presets'
      );

      const activePresets = allPresets.filter((p: { preset_id: string; is_active: number }) => p.is_active === 1);
      expect(activePresets.length).toBe(1);
      expect(activePresets[0].preset_id).toBe('speed_first');
    });
  });

  describe('applyPreset', () => {
    it('should apply quality_first preset successfully', async () => {
      await service.applyPreset('quality_first');

      const activePreset = await service.getActivePreset();
      expect(activePreset?.presetId).toBe('quality_first');

      // Check that asset type priorities were created
      const assetPriorities = await service.getAllAssetTypePriorities();
      expect(assetPriorities.length).toBeGreaterThan(0);

      // Check specific priority (poster should prefer fanart_tv in quality_first)
      const posterPriority = await service.getAssetTypePriority('poster');
      expect(posterPriority?.providerOrder[0]).toBe('fanart_tv');
    });

    it('should apply speed_first preset successfully', async () => {
      await service.applyPreset('speed_first');

      const activePreset = await service.getActivePreset();
      expect(activePreset?.presetId).toBe('speed_first');

      // Check specific priority (poster should prefer tmdb in speed_first)
      const posterPriority = await service.getAssetTypePriority('poster');
      expect(posterPriority?.providerOrder[0]).toBe('tmdb');
    });

    it('should apply tmdb_primary preset successfully', async () => {
      await service.applyPreset('tmdb_primary');

      const activePreset = await service.getActivePreset();
      expect(activePreset?.presetId).toBe('tmdb_primary');
    });

    it('should apply tvdb_primary preset successfully', async () => {
      await service.applyPreset('tvdb_primary');

      const activePreset = await service.getActivePreset();
      expect(activePreset?.presetId).toBe('tvdb_primary');
    });

    it('should clear existing priorities when applying preset', async () => {
      // Manually create some priorities
      await service.upsertAssetTypePriority({
        assetType: 'custom_type',
        providerOrder: ['custom_provider']
      });

      // Apply preset
      await service.applyPreset('quality_first');

      // Custom priority should be gone
      const customPriority = await service.getAssetTypePriority('custom_type');
      expect(customPriority).toBeNull();
    });

    it('should not override forced local fields', async () => {
      await service.applyPreset('quality_first');

      // Check that forced field still exists and is forced to local
      const runtimePriority = await service.getMetadataFieldPriority('runtime');
      expect(runtimePriority?.forcedProvider).toBe('local');
      expect(runtimePriority?.providerOrder).toEqual(['local']);
    });

    it('should throw error for invalid preset', async () => {
      await expect(service.applyPreset('invalid_preset')).rejects.toThrow(
        'Unknown preset: invalid_preset'
      );
    });
  });

  describe('getAvailablePresets', () => {
    it('should return all available presets', async () => {
      const presets = service.getAvailablePresets();

      expect(Array.isArray(presets)).toBe(true);
      expect(presets.length).toBeGreaterThan(0);

      const presetIds = presets.map(p => p.id);
      expect(presetIds).toContain('quality_first');
      expect(presetIds).toContain('speed_first');
      expect(presetIds).toContain('tmdb_primary');
      expect(presetIds).toContain('tvdb_primary');
    });

    it('should return presets with complete data', async () => {
      const presets = service.getAvailablePresets();

      for (const preset of presets) {
        expect(preset.id).toBeDefined();
        expect(preset.label).toBeDefined();
        expect(preset.description).toBeDefined();
        expect(preset.assetTypePriorities).toBeDefined();
        expect(preset.metadataFieldPriorities).toBeDefined();
      }
    });
  });

  describe('getProviderOrderForAssetType', () => {
    it('should return configured order for asset type', async () => {
      await service.upsertAssetTypePriority({
        assetType: 'poster',
        providerOrder: ['fanart_tv', 'tmdb', 'local']
      });

      const order = await service.getProviderOrderForAssetType('poster');
      expect(order).toEqual(['fanart_tv', 'tmdb', 'local']);
    });

    it('should return preset order when no custom priority configured', async () => {
      await service.applyPreset('quality_first');

      const order = await service.getProviderOrderForAssetType('poster');
      expect(order).toBeDefined();
      expect(Array.isArray(order)).toBe(true);
      expect(order.length).toBeGreaterThan(0);
    });

    it('should return fallback order for unknown asset type', async () => {
      const order = await service.getProviderOrderForAssetType('unknown_type');

      expect(Array.isArray(order)).toBe(true);
      expect(order.length).toBeGreaterThan(0);
    });
  });

  describe('getProviderOrderForField', () => {
    it('should return configured order for field', async () => {
      await service.upsertMetadataFieldPriority({
        fieldName: 'rating',
        providerOrder: ['imdb', 'tmdb', 'tvdb']
      });

      const order = await service.getProviderOrderForField('rating');
      expect(order).toEqual(['imdb', 'tmdb', 'tvdb']);
    });

    it('should return forced order for forced fields', async () => {
      const order = await service.getProviderOrderForField('runtime');
      expect(order).toEqual(['local']);
    });

    it('should return preset order when no custom priority configured', async () => {
      await service.applyPreset('quality_first');

      const order = await service.getProviderOrderForField('rating');
      expect(order).toBeDefined();
      expect(Array.isArray(order)).toBe(true);
      expect(order.length).toBeGreaterThan(0);
    });

    it('should return fallback order for unknown field', async () => {
      const order = await service.getProviderOrderForField('unknown_field');

      expect(Array.isArray(order)).toBe(true);
      expect(order.length).toBeGreaterThan(0);
    });
  });

  describe('Edge cases', () => {
    it('should handle rapid preset switching', async () => {
      const presets = ['quality_first', 'speed_first', 'tmdb_primary', 'tvdb_primary'];

      for (const preset of presets) {
        await service.applyPreset(preset);
      }

      const activePreset = await service.getActivePreset();
      expect(activePreset?.presetId).toBe('tvdb_primary');
    });

    it('should handle very long provider orders', async () => {
      const longOrder = ['provider1', 'provider2', 'provider3', 'provider4', 'provider5'];

      const result = await service.upsertAssetTypePriority({
        assetType: 'poster',
        providerOrder: longOrder
      });

      expect(result.providerOrder).toEqual(longOrder);
    });

    it('should handle asset type names with special characters', async () => {
      const result = await service.upsertAssetTypePriority({
        assetType: 'type_with-special.chars',
        providerOrder: ['provider1']
      });

      expect(result.assetType).toBe('type_with-special.chars');
    });

    it('should maintain order of providers exactly as specified', async () => {
      const order = ['provider3', 'provider1', 'provider2'];

      const result = await service.upsertAssetTypePriority({
        assetType: 'poster',
        providerOrder: order
      });

      expect(result.providerOrder).toEqual(order);
      expect(result.providerOrder[0]).toBe('provider3');
      expect(result.providerOrder[1]).toBe('provider1');
      expect(result.providerOrder[2]).toBe('provider2');
    });
  });

  describe('Data integrity', () => {
    it('should properly parse JSON provider orders', async () => {
      await service.upsertAssetTypePriority({
        assetType: 'poster',
        providerOrder: ['fanart_tv', 'tmdb', 'tvdb', 'local']
      });

      const result = await service.getAssetTypePriority('poster');
      expect(Array.isArray(result?.providerOrder)).toBe(true);
      expect(result?.providerOrder).toHaveLength(4);
      expect(result?.providerOrder).toContain('fanart_tv');
      expect(result?.providerOrder).toContain('tmdb');
    });

    it('should handle duplicates in provider order gracefully', async () => {
      const result = await service.upsertAssetTypePriority({
        assetType: 'poster',
        providerOrder: ['tmdb', 'tmdb', 'local']
      });

      // Should store exactly what was provided (validation happens at UI layer)
      expect(result.providerOrder).toEqual(['tmdb', 'tmdb', 'local']);
    });
  });

  describe('Concurrent operations', () => {
    it('should handle sequential preset applications', async () => {
      // Preset applications should be sequential, not concurrent
      // (they clear and recreate tables)
      await service.applyPreset('quality_first');
      await service.applyPreset('speed_first');
      await service.applyPreset('tmdb_primary');

      const activePreset = await service.getActivePreset();
      expect(activePreset).not.toBeNull();
      expect(activePreset?.presetId).toBe('tmdb_primary');
    });

    it('should handle multiple asset type priority updates', async () => {
      const operations = [
        service.upsertAssetTypePriority({
          assetType: 'poster',
          providerOrder: ['provider1']
        }),
        service.upsertAssetTypePriority({
          assetType: 'fanart',
          providerOrder: ['provider2']
        }),
        service.upsertAssetTypePriority({
          assetType: 'banner',
          providerOrder: ['provider3']
        })
      ];

      await Promise.all(operations);

      const priorities = await service.getAllAssetTypePriorities();
      expect(priorities.length).toBeGreaterThanOrEqual(3);
    });
  });
});
