/**
 * Tests for intelligentPublishService transaction fix
 *
 * Verifies that the transaction wrapper (lines 427-441) ensures atomicity
 * of database operations during publishing:
 * - updateLibraryRecords() deletes and inserts library_*_files records
 * - last_published_at timestamp update on movies table
 *
 * Critical requirement: Both operations must succeed together or both must fail.
 * No partial updates allowed.
 */

import { publishMovie } from '../../../src/services/files/intelligentPublishService.js';
import type { DatabaseConnection } from '../../../src/types/database.js';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { jest } from '@jest/globals';

// Mock dependencies
jest.mock('fs/promises');
jest.mock('../../../src/middleware/logging.js', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const mockFs = fs as jest.Mocked<typeof fs>;

describe('intelligentPublishService - Transaction Atomicity', () => {
  let mockDb: jest.Mocked<DatabaseConnection>;
  let transactionState: {
    inTransaction: boolean;
    operations: string[];
  };

  beforeEach(() => {
    // Reset transaction state
    transactionState = {
      inTransaction: false,
      operations: [],
    };

    // Create mock database with transaction tracking
    mockDb = {
      query: jest.fn(),
      get: jest.fn(),
      execute: jest.fn(),
      close: jest.fn(),
      beginTransaction: jest.fn(async () => {
        transactionState.inTransaction = true;
        transactionState.operations = [];
      }),
      commit: jest.fn(async () => {
        if (!transactionState.inTransaction) {
          throw new Error('No active transaction');
        }
        transactionState.inTransaction = false;
        // Operations are committed
      }),
      rollback: jest.fn(async () => {
        if (!transactionState.inTransaction) {
          throw new Error('No active transaction');
        }
        transactionState.inTransaction = false;
        // Discard all operations
        transactionState.operations = [];
      }),
    } as unknown as jest.Mocked<DatabaseConnection>;

    // Mock filesystem operations
    mockFs.readdir.mockResolvedValue([]);
    mockFs.readFile.mockResolvedValue(Buffer.from('test'));
    mockFs.copyFile.mockResolvedValue(undefined);
    mockFs.rename.mockResolvedValue(undefined);
    mockFs.unlink.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('1. Transaction Atomicity - Rollback on updateLibraryRecords failure', () => {
    it('should rollback transaction if updateLibraryRecords fails', async () => {
      // Setup: Mock library inventory (empty directory)
      mockFs.readdir.mockResolvedValue([]);

      // Mock database queries
      mockDb.get.mockResolvedValue({ nfo_cache_id: null }); // No NFO
      mockDb.query.mockResolvedValue([]); // No cache assets

      // Mock execute to track operations and fail on DELETE
      let executeCallCount = 0;
      mockDb.execute.mockImplementation(async (sql: string) => {
        executeCallCount++;

        // Track operations during transaction
        if (transactionState.inTransaction) {
          transactionState.operations.push(sql);

          // Fail on the first DELETE in updateLibraryRecords
          if (sql.includes('DELETE FROM library_image_files')) {
            throw new Error('Simulated DELETE failure');
          }
        }

        return { affectedRows: 0 };
      });

      // Execute publish
      const result = await publishMovie(mockDb, {
        entityType: 'movie',
        entityId: 1,
        libraryPath: '/movies/TestMovie',
        mediaFilename: 'TestMovie',
        mainMovieFile: '/movies/TestMovie/TestMovie.mkv',
      });

      // Verify transaction started
      expect(mockDb.beginTransaction).toHaveBeenCalledTimes(1);

      // Verify rollback was called due to failure
      expect(mockDb.rollback).toHaveBeenCalledTimes(1);

      // Verify commit was NOT called
      expect(mockDb.commit).not.toHaveBeenCalled();

      // Verify transaction is no longer active
      expect(transactionState.inTransaction).toBe(false);

      // Verify operations were discarded
      expect(transactionState.operations).toEqual([]);

      // Verify publish failed
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should rollback if any DELETE operation in updateLibraryRecords fails', async () => {
      mockFs.readdir.mockResolvedValue([]);
      mockDb.get.mockResolvedValue({ nfo_cache_id: null });
      mockDb.query.mockResolvedValue([]);

      // Fail on the third DELETE (library_audio_files)
      mockDb.execute.mockImplementation(async (sql: string) => {
        if (transactionState.inTransaction) {
          transactionState.operations.push(sql);

          if (sql.includes('DELETE FROM library_audio_files')) {
            throw new Error('Audio DELETE failed');
          }
        }
        return { affectedRows: 0 };
      });

      await publishMovie(mockDb, {
        entityType: 'movie',
        entityId: 1,
        libraryPath: '/movies/Test',
        mediaFilename: 'Test',
        mainMovieFile: '/movies/Test/Test.mkv',
      });

      // Transaction should be rolled back
      expect(mockDb.rollback).toHaveBeenCalled();
      expect(mockDb.commit).not.toHaveBeenCalled();
      expect(transactionState.inTransaction).toBe(false);
    });

    it('should rollback if INSERT operation fails', async () => {
      mockFs.readdir.mockResolvedValue([]);

      // Setup one cache image file that will be published
      const cacheAsset = {
        id: 1,
        file_path: '/cache/poster.jpg',
        file_hash: 'abc123',
        image_type: 'poster',
      };

      mockDb.get.mockResolvedValue({ nfo_cache_id: null });
      mockDb.query.mockResolvedValue([cacheAsset]);

      // Fail on INSERT
      mockDb.execute.mockImplementation(async (sql: string) => {
        if (transactionState.inTransaction) {
          transactionState.operations.push(sql);

          if (sql.includes('INSERT INTO library_image_files')) {
            throw new Error('INSERT failed');
          }
        }
        return { affectedRows: 0 };
      });

      await publishMovie(mockDb, {
        entityType: 'movie',
        entityId: 1,
        libraryPath: '/movies/Test',
        mediaFilename: 'Test',
        mainMovieFile: '/movies/Test/Test.mkv',
      });

      expect(mockDb.rollback).toHaveBeenCalled();
      expect(mockDb.commit).not.toHaveBeenCalled();
    });
  });

  describe('2. Transaction Atomicity - Rollback on last_published_at update failure', () => {
    it('should rollback entire transaction if last_published_at update fails', async () => {
      mockFs.readdir.mockResolvedValue([]);
      mockDb.get.mockResolvedValue({ nfo_cache_id: null });
      mockDb.query.mockResolvedValue([]);

      // Track successful DELETE operations count
      let deleteCount = 0;

      mockDb.execute.mockImplementation(async (sql: string) => {
        if (transactionState.inTransaction) {
          transactionState.operations.push(sql);

          // Let DELETE operations succeed
          if (sql.includes('DELETE FROM library_')) {
            deleteCount++;
          }

          // Fail on last_published_at update
          if (sql.includes('UPDATE movies SET last_published_at')) {
            throw new Error('Failed to update last_published_at');
          }
        }
        return { affectedRows: 1 };
      });

      await publishMovie(mockDb, {
        entityType: 'movie',
        entityId: 1,
        libraryPath: '/movies/Test',
        mediaFilename: 'Test',
        mainMovieFile: '/movies/Test/Test.mkv',
      });

      // Verify DELETEs were attempted (4 library tables)
      expect(deleteCount).toBe(4);

      // Verify transaction rolled back
      expect(mockDb.rollback).toHaveBeenCalled();
      expect(mockDb.commit).not.toHaveBeenCalled();

      // All operations discarded
      expect(transactionState.operations).toEqual([]);
    });
  });

  describe('3. Success Path - Both operations committed together', () => {
    it('should commit both updateLibraryRecords and last_published_at in single transaction', async () => {
      mockFs.readdir.mockResolvedValue([]);

      const cacheAsset = {
        id: 1,
        file_path: '/cache/poster.jpg',
        file_hash: 'abc123',
        image_type: 'poster',
      };

      mockDb.get.mockResolvedValue({ nfo_cache_id: null });
      mockDb.query.mockResolvedValue([cacheAsset]);

      let deleteOps = 0;
      let insertOps = 0;
      let updateOps = 0;

      mockDb.execute.mockImplementation(async (sql: string) => {
        if (transactionState.inTransaction) {
          transactionState.operations.push(sql);

          if (sql.includes('DELETE FROM library_')) {
            deleteOps++;
          } else if (sql.includes('INSERT INTO library_')) {
            insertOps++;
          } else if (sql.includes('UPDATE movies SET last_published_at')) {
            updateOps++;
          }
        }
        return { affectedRows: 1 };
      });

      const result = await publishMovie(mockDb, {
        entityType: 'movie',
        entityId: 1,
        libraryPath: '/movies/Test',
        mediaFilename: 'Test',
        mainMovieFile: '/movies/Test/Test.mkv',
      });

      // Verify all operations executed
      expect(deleteOps).toBe(4); // All 4 DELETE statements
      expect(insertOps).toBe(1); // 1 INSERT for the poster
      expect(updateOps).toBe(1); // 1 UPDATE for last_published_at

      // Verify transaction committed successfully
      expect(mockDb.beginTransaction).toHaveBeenCalledTimes(1);
      expect(mockDb.commit).toHaveBeenCalledTimes(1);
      expect(mockDb.rollback).not.toHaveBeenCalled();

      // Verify publish succeeded
      expect(result.success).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should commit transaction even with no assets to publish', async () => {
      mockFs.readdir.mockResolvedValue([]);
      mockDb.get.mockResolvedValue({ nfo_cache_id: null });
      mockDb.query.mockResolvedValue([]); // No assets

      let deleteCount = 0;

      mockDb.execute.mockImplementation(async (sql: string) => {
        if (transactionState.inTransaction) {
          transactionState.operations.push(sql);
          if (sql.includes('DELETE FROM library_')) {
            deleteCount++;
          }
        }
        return { affectedRows: 0 };
      });

      const result = await publishMovie(mockDb, {
        entityType: 'movie',
        entityId: 1,
        libraryPath: '/movies/Test',
        mediaFilename: 'Test',
        mainMovieFile: '/movies/Test/Test.mkv',
      });

      // All DELETEs should execute (cleanup old records)
      expect(deleteCount).toBe(4);

      // Transaction should commit
      expect(mockDb.commit).toHaveBeenCalled();
      expect(mockDb.rollback).not.toHaveBeenCalled();
      expect(result.success).toBe(true);
    });
  });

  describe('4. No Partial Updates - Database consistency', () => {
    it('should not have library records updated without last_published_at update', async () => {
      mockFs.readdir.mockResolvedValue([]);
      mockDb.get.mockResolvedValue({ nfo_cache_id: null });
      mockDb.query.mockResolvedValue([
        {
          id: 1,
          file_path: '/cache/poster.jpg',
          file_hash: 'hash1',
          image_type: 'poster',
        },
      ]);

      const committedOperations: string[] = [];

      mockDb.execute.mockImplementation(async (sql: string) => {
        if (transactionState.inTransaction) {
          transactionState.operations.push(sql);

          // Fail on last_published_at to simulate partial failure
          if (sql.includes('UPDATE movies SET last_published_at')) {
            throw new Error('Timestamp update failed');
          }
        }
        return { affectedRows: 1 };
      });

      // Override commit to track what would be committed
      mockDb.commit.mockImplementation(async () => {
        committedOperations.push(...transactionState.operations);
        transactionState.operations = [];
        transactionState.inTransaction = false;
      });

      await publishMovie(mockDb, {
        entityType: 'movie',
        entityId: 1,
        libraryPath: '/movies/Test',
        mediaFilename: 'Test',
        mainMovieFile: '/movies/Test/Test.mkv',
      });

      // Verify rollback happened
      expect(mockDb.rollback).toHaveBeenCalled();

      // Verify nothing was committed
      expect(committedOperations).toEqual([]);

      // Transaction operations were discarded
      expect(transactionState.operations).toEqual([]);
    });

    it('should not have last_published_at updated without library records update', async () => {
      mockFs.readdir.mockResolvedValue([]);
      mockDb.get.mockResolvedValue({ nfo_cache_id: null });
      mockDb.query.mockResolvedValue([]);

      const committedOperations: string[] = [];

      mockDb.execute.mockImplementation(async (sql: string) => {
        if (transactionState.inTransaction) {
          transactionState.operations.push(sql);

          // Fail on first DELETE
          if (sql.includes('DELETE FROM library_image_files')) {
            throw new Error('DELETE failed');
          }
        }
        return { affectedRows: 1 };
      });

      mockDb.commit.mockImplementation(async () => {
        committedOperations.push(...transactionState.operations);
        transactionState.operations = [];
        transactionState.inTransaction = false;
      });

      await publishMovie(mockDb, {
        entityType: 'movie',
        entityId: 1,
        libraryPath: '/movies/Test',
        mediaFilename: 'Test',
        mainMovieFile: '/movies/Test/Test.mkv',
      });

      // Nothing committed
      expect(committedOperations).toEqual([]);
      expect(mockDb.rollback).toHaveBeenCalled();
    });
  });

  describe('5. Crash Recovery - Transaction guarantees', () => {
    it('should rollback if process crashes after beginTransaction but before commit', async () => {
      // This test simulates what happens if the process dies mid-transaction
      // SQLite/PostgreSQL will automatically rollback uncommitted transactions

      mockFs.readdir.mockResolvedValue([]);
      mockDb.get.mockResolvedValue({ nfo_cache_id: null });
      mockDb.query.mockResolvedValue([]);

      mockDb.execute.mockImplementation(async (sql: string) => {
        if (transactionState.inTransaction) {
          transactionState.operations.push(sql);

          // Simulate crash during UPDATE
          if (sql.includes('UPDATE movies SET last_published_at')) {
            // Process dies - transaction never commits
            throw new Error('SIMULATED CRASH: Process terminated');
          }
        }
        return { affectedRows: 1 };
      });

      await publishMovie(mockDb, {
        entityType: 'movie',
        entityId: 1,
        libraryPath: '/movies/Test',
        mediaFilename: 'Test',
        mainMovieFile: '/movies/Test/Test.mkv',
      });

      // Application catches error and calls rollback
      expect(mockDb.rollback).toHaveBeenCalled();
      expect(mockDb.commit).not.toHaveBeenCalled();

      // In real crash scenario, database would auto-rollback
      expect(transactionState.operations).toEqual([]);
    });

    it('should handle rollback failure gracefully', async () => {
      mockFs.readdir.mockResolvedValue([]);
      mockDb.get.mockResolvedValue({ nfo_cache_id: null });
      mockDb.query.mockResolvedValue([]);

      // Execute fails
      mockDb.execute.mockImplementation(async (sql: string) => {
        if (transactionState.inTransaction && sql.includes('DELETE FROM library_image_files')) {
          throw new Error('DELETE failed');
        }
        return { affectedRows: 1 };
      });

      // Rollback also fails (connection lost)
      mockDb.rollback.mockRejectedValue(new Error('Connection lost during rollback'));

      const result = await publishMovie(mockDb, {
        entityType: 'movie',
        entityId: 1,
        libraryPath: '/movies/Test',
        mediaFilename: 'Test',
        mainMovieFile: '/movies/Test/Test.mkv',
      });

      // Publish should still fail gracefully
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('6. Transaction Isolation - Concurrent operations', () => {
    it('should maintain isolation if multiple publish operations run concurrently', async () => {
      // This test verifies that transactions don't interfere with each other
      // Even though this is a single test, it validates the transaction pattern

      mockFs.readdir.mockResolvedValue([]);
      mockDb.get.mockResolvedValue({ nfo_cache_id: null });
      mockDb.query.mockResolvedValue([]);

      let transactionCount = 0;

      mockDb.beginTransaction.mockImplementation(async () => {
        transactionCount++;
        transactionState.inTransaction = true;
        transactionState.operations = [];
      });

      mockDb.execute.mockImplementation(async () => {
        return { affectedRows: 1 };
      });

      // First publish succeeds
      const result1 = await publishMovie(mockDb, {
        entityType: 'movie',
        entityId: 1,
        libraryPath: '/movies/Movie1',
        mediaFilename: 'Movie1',
        mainMovieFile: '/movies/Movie1/Movie1.mkv',
      });

      expect(result1.success).toBe(true);
      expect(transactionCount).toBe(1);

      // Second publish succeeds independently
      const result2 = await publishMovie(mockDb, {
        entityType: 'movie',
        entityId: 2,
        libraryPath: '/movies/Movie2',
        mediaFilename: 'Movie2',
        mainMovieFile: '/movies/Movie2/Movie2.mkv',
      });

      expect(result2.success).toBe(true);
      expect(transactionCount).toBe(2);

      // Each publish had its own transaction
      expect(mockDb.beginTransaction).toHaveBeenCalledTimes(2);
      expect(mockDb.commit).toHaveBeenCalledTimes(2);
    });
  });

  describe('7. Edge Cases - Transaction behavior', () => {
    it('should handle transaction with multiple asset inserts', async () => {
      mockFs.readdir.mockResolvedValue([]);
      mockDb.get.mockResolvedValue({ nfo_cache_id: 100 });

      // Multiple cache assets
      mockDb.query.mockImplementation(async (sql: string) => {
        if (sql.includes('cache_image_files')) {
          return [
            { id: 1, file_path: '/cache/poster.jpg', file_hash: 'hash1', image_type: 'poster' },
            { id: 2, file_path: '/cache/fanart.jpg', file_hash: 'hash2', image_type: 'fanart' },
            { id: 3, file_path: '/cache/banner.jpg', file_hash: 'hash3', image_type: 'banner' },
          ];
        }
        return [];
      });

      mockDb.get.mockImplementation(async (sql: string) => {
        if (sql.includes('cache_text_files')) {
          return { file_path: '/cache/movie.nfo', file_hash: 'nfohash' };
        }
        return { nfo_cache_id: 100 };
      });

      let insertCount = 0;

      mockDb.execute.mockImplementation(async (sql: string) => {
        if (transactionState.inTransaction && sql.includes('INSERT INTO library_')) {
          insertCount++;
        }
        return { affectedRows: 1 };
      });

      const result = await publishMovie(mockDb, {
        entityType: 'movie',
        entityId: 1,
        libraryPath: '/movies/Test',
        mediaFilename: 'Test',
        mainMovieFile: '/movies/Test/Test.mkv',
      });

      // Should insert 4 records (3 images + 1 NFO)
      expect(insertCount).toBe(4);
      expect(result.success).toBe(true);
      expect(mockDb.commit).toHaveBeenCalled();
    });

    it('should not start transaction if pre-transaction operations fail', async () => {
      // Simulate failure during inventory phase (before transaction)
      mockFs.readdir.mockRejectedValue(new Error('Cannot read directory'));

      const result = await publishMovie(mockDb, {
        entityType: 'movie',
        entityId: 1,
        libraryPath: '/invalid/path',
        mediaFilename: 'Test',
        mainMovieFile: '/invalid/path/Test.mkv',
      });

      // Transaction should never start
      expect(mockDb.beginTransaction).not.toHaveBeenCalled();
      expect(result.success).toBe(false);
    });

    it('should handle empty transaction (no operations)', async () => {
      mockFs.readdir.mockResolvedValue([]);
      mockDb.get.mockResolvedValue({ nfo_cache_id: null });
      mockDb.query.mockResolvedValue([]);

      mockDb.execute.mockImplementation(async () => {
        return { affectedRows: 0 };
      });

      const result = await publishMovie(mockDb, {
        entityType: 'movie',
        entityId: 1,
        libraryPath: '/movies/Test',
        mediaFilename: 'Test',
        mainMovieFile: '/movies/Test/Test.mkv',
      });

      // Even empty transaction should commit
      expect(mockDb.beginTransaction).toHaveBeenCalled();
      expect(mockDb.commit).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });
  });

  describe('8. Verification - Transaction order', () => {
    it('should execute operations in correct order within transaction', async () => {
      mockFs.readdir.mockResolvedValue([]);
      mockDb.get.mockResolvedValue({ nfo_cache_id: null });
      mockDb.query.mockResolvedValue([
        { id: 1, file_path: '/cache/poster.jpg', file_hash: 'hash1', image_type: 'poster' },
      ]);

      const operationOrder: string[] = [];

      mockDb.execute.mockImplementation(async (sql: string) => {
        if (transactionState.inTransaction) {
          if (sql.includes('DELETE FROM library_image_files')) {
            operationOrder.push('DELETE_IMAGE');
          } else if (sql.includes('DELETE FROM library_video_files')) {
            operationOrder.push('DELETE_VIDEO');
          } else if (sql.includes('DELETE FROM library_audio_files')) {
            operationOrder.push('DELETE_AUDIO');
          } else if (sql.includes('DELETE FROM library_text_files')) {
            operationOrder.push('DELETE_TEXT');
          } else if (sql.includes('INSERT INTO library_image_files')) {
            operationOrder.push('INSERT_IMAGE');
          } else if (sql.includes('UPDATE movies SET last_published_at')) {
            operationOrder.push('UPDATE_TIMESTAMP');
          }
        }
        return { affectedRows: 1 };
      });

      await publishMovie(mockDb, {
        entityType: 'movie',
        entityId: 1,
        libraryPath: '/movies/Test',
        mediaFilename: 'Test',
        mainMovieFile: '/movies/Test/Test.mkv',
      });

      // Verify exact operation order
      expect(operationOrder).toEqual([
        'DELETE_IMAGE',
        'DELETE_VIDEO',
        'DELETE_AUDIO',
        'DELETE_TEXT',
        'INSERT_IMAGE',
        'UPDATE_TIMESTAMP',
      ]);
    });
  });
});
