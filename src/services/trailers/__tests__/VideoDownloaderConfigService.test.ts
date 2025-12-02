import { VideoDownloaderConfigService } from '../VideoDownloaderConfigService.js';
import os from 'os';

describe('VideoDownloaderConfigService', () => {
  let service: VideoDownloaderConfigService;

  // Note: These are unit tests that verify the service structure and basic validation.
  // Full integration tests with database would be in a separate integration test suite.

  describe('service instantiation', () => {
    it('should create service instance', () => {
      // This test just verifies the service can be imported and basic structure is correct
      expect(VideoDownloaderConfigService).toBeDefined();
    });
  });

  describe('writeCookiesToTempFile', () => {
    const validCookies = `# Netscape HTTP Cookie File
.youtube.com\tTRUE\t/\tTRUE\t0\ttest\tvalue`;

    it('should write cookies to temp file and clean up', async () => {
      // Create a minimal mock for this specific test
      const mockDbManager = {
        getConnection: () => ({
          query: async () => [],
          execute: async () => ({ affectedRows: 1 }),
        }),
      } as any;

      service = new VideoDownloaderConfigService(mockDbManager);

      const tempFile = await service.writeCookiesToTempFile(validCookies);

      expect(tempFile).toMatch(/metarr-cookies-[a-f0-9]+\.txt$/);
      expect(tempFile).toContain(os.tmpdir());

      // Clean up
      await service.cleanupTempFile(tempFile);
    });
  });

  describe('cleanupTempFile', () => {
    it('should remove temp file without throwing', async () => {
      const mockDbManager = {
        getConnection: () => ({
          query: async () => [],
          execute: async () => ({ affectedRows: 1 }),
        }),
      } as any;

      service = new VideoDownloaderConfigService(mockDbManager);

      // Should not throw even if file doesn't exist
      await expect(
        service.cleanupTempFile('/tmp/nonexistent-metarr-test-file.txt')
      ).resolves.not.toThrow();
    });
  });
});
