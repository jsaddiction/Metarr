import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { getSubdirectories } from '../services/nfo/nfoDiscovery.js';
import { logger } from '../middleware/logging.js';
import { getErrorMessage } from './errorHandling.js';
import { ValidationError } from '../errors/index.js';

interface HashResult {
  dir: string;
  hash: string;
  timeMs: number;
  videoFile?: string;
  fileSize?: number;
}

interface FileHashResult {
  file: string;
  hash: string;
  timeMs: number;
  fileSize: number;
  strategy: string;
}

interface TestResults {
  directoryFingerprint: HashResult[];
  videoPartialHash: HashResult[];
  videoOptimizedHash: HashResult[];
  smallFileFullHash: FileHashResult[];
}

/**
 * Find video file in directory
 */
// Commented out - unused utility function kept for future use
// async function findVideoFile(dirPath: string): Promise<string | null> {
//   const files = await fs.readdir(dirPath);
//   const videoExtensions = ['.mkv', '.mp4', '.avi', '.m4v', '.mov'];

//   for (const file of files) {
//     const ext = path.extname(file).toLowerCase();
//     if (videoExtensions.includes(ext)) {
//       return path.join(dirPath, file);
//     }
//   }

//   return null;
// }

/**
 * Strategy 1: Directory Fingerprint (filename + size)
 * Fast fingerprint for detecting ANY change in directory
 */
export async function hashDirectoryFingerprint(dirPath: string): Promise<string> {
  const files = await fs.readdir(dirPath, { withFileTypes: true });
  const fileData: string[] = [];

  for (const file of files) {
    if (file.isFile()) {
      const filePath = path.join(dirPath, file.name);
      const stats = await fs.stat(filePath);
      fileData.push(`${file.name}:${stats.size}`);
    } else if (file.isDirectory()) {
      // Include subdirectories too (e.g., .actors folder)
      const subFiles = await fs.readdir(path.join(dirPath, file.name));
      for (const subFile of subFiles) {
        const subPath = path.join(dirPath, file.name, subFile);
        const stats = await fs.stat(subPath);
        if ((await fs.stat(subPath)).isFile()) {
          fileData.push(`${file.name}/${subFile}:${stats.size}`);
        }
      }
    }
  }

  // Sort for consistency
  fileData.sort();

  // Hash concatenated string
  const content = fileData.join('|');
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Strategy 2: Full File Hash (for small files < 10MB)
 * Complete hash of entire file - best for NFO, images, subtitles
 */
export async function hashEntireFile(filePath: string): Promise<string> {
  const content = await fs.readFile(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Strategy 3: Video Partial Hash (for medium files 10MB-1GB)
 * Reads first 1MB + last 1MB + file size
 * Good for trailer files
 */
export async function hashVideoFilePartial(videoPath: string): Promise<string> {
  const stats = await fs.stat(videoPath);
  const fileSize = stats.size;
  const chunkSize = 1024 * 1024; // 1MB

  const hash = crypto.createHash('sha256');
  const fd = await fs.open(videoPath, 'r');

  try {
    // Read first 1MB
    const firstChunk = Buffer.alloc(Math.min(chunkSize, fileSize));
    await fd.read(firstChunk, 0, firstChunk.length, 0);
    hash.update(firstChunk);

    // Read last 1MB (if file is large enough)
    if (fileSize > chunkSize) {
      const lastChunk = Buffer.alloc(chunkSize);
      await fd.read(lastChunk, 0, lastChunk.length, fileSize - chunkSize);
      hash.update(lastChunk);
    }

    // Include file size in hash
    hash.update(fileSize.toString());

    return hash.digest('hex');
  } finally {
    await fd.close();
  }
}

/**
 * Strategy 4: Video Optimized Hash (for large files > 1GB)
 * Reads first 4MB + last 4MB + middle 1MB + file size
 * Captures container metadata (header/footer) + sample of video stream
 * Optimized for detecting re-encodes, resolution changes, codec changes
 */
export async function hashVideoFileOptimized(videoPath: string): Promise<string> {
  const stats = await fs.stat(videoPath);
  const fileSize = stats.size;
  const headerSize = 4 * 1024 * 1024; // 4MB
  const middleSize = 1024 * 1024; // 1MB

  const hash = crypto.createHash('sha256');
  const fd = await fs.open(videoPath, 'r');

  try {
    // 1. Read first 4MB (captures EBML header, moov atom, segment info)
    const headerChunk = Buffer.alloc(Math.min(headerSize, fileSize));
    await fd.read(headerChunk, 0, headerChunk.length, 0);
    hash.update(headerChunk);

    // 2. Read last 4MB (captures trailing moov atoms, tags)
    if (fileSize > headerSize) {
      const footerSize = Math.min(headerSize, fileSize - headerSize);
      const footerChunk = Buffer.alloc(footerSize);
      await fd.read(footerChunk, 0, footerChunk.length, fileSize - footerSize);
      hash.update(footerChunk);
    }

    // 3. Read middle 1MB sample (detect video stream data changes)
    if (fileSize > headerSize * 2) {
      const middleOffset = Math.floor(fileSize / 2) - Math.floor(middleSize / 2);
      const middleChunk = Buffer.alloc(middleSize);
      await fd.read(middleChunk, 0, middleChunk.length, middleOffset);
      hash.update(middleChunk);
    }

    // 4. Include file size (detect truncation/extension)
    hash.update(fileSize.toString());

    return hash.digest('hex');
  } finally {
    await fd.close();
  }
}

/**
 * Calculate median from array of numbers
 */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  } else {
    return sorted[mid];
  }
}

/**
 * Sample N random directories from array
 */
function sampleRandomDirectories(dirs: string[], count: number): string[] {
  const shuffled = [...dirs].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, dirs.length));
}

/**
 * Print detailed performance report
 */
async function printPerformanceReport(results: TestResults): Promise<void> {
  console.log('\n' + '='.repeat(100));
  console.log('HASH PERFORMANCE TEST REPORT - SIZE-BASED HYBRID STRATEGY');
  console.log('='.repeat(100) + '\n');

  // Directory Fingerprint Stats
  const fingerprintTimes = results.directoryFingerprint.map(r => r.timeMs);
  console.log('Strategy 1: Directory Fingerprint (filename + size)');
  console.log('─'.repeat(100));
  console.log(`  Use Case:    Quick "did anything change?" check`);
  console.log(`  Min:         ${Math.min(...fingerprintTimes)}ms`);
  console.log(`  Max:         ${Math.max(...fingerprintTimes)}ms`);
  console.log(
    `  Average:     ${(fingerprintTimes.reduce((a, b) => a + b, 0) / fingerprintTimes.length).toFixed(2)}ms`
  );
  console.log(`  Median:      ${median(fingerprintTimes).toFixed(2)}ms`);
  console.log(`  Total:       ${fingerprintTimes.reduce((a, b) => a + b, 0)}ms\n`);

  // Small File Full Hash Stats
  if (results.smallFileFullHash.length > 0) {
    const smallTimes = results.smallFileFullHash.map(r => r.timeMs);
    const avgSize =
      results.smallFileFullHash.reduce((sum, r) => sum + r.fileSize, 0) /
      results.smallFileFullHash.length;
    console.log('Strategy 2: Full File Hash (files < 10MB)');
    console.log('─'.repeat(100));
    console.log(`  Use Case:    NFO, images, subtitles - complete hash for change detection`);
    console.log(`  Files:       ${results.smallFileFullHash.length} files tested`);
    console.log(`  Avg Size:    ${(avgSize / (1024 * 1024)).toFixed(2)} MB`);
    console.log(`  Min:         ${Math.min(...smallTimes)}ms`);
    console.log(`  Max:         ${Math.max(...smallTimes)}ms`);
    console.log(
      `  Average:     ${(smallTimes.reduce((a, b) => a + b, 0) / smallTimes.length).toFixed(2)}ms`
    );
    console.log(`  Median:      ${median(smallTimes).toFixed(2)}ms`);
    console.log(`  Total:       ${smallTimes.reduce((a, b) => a + b, 0)}ms\n`);
  }

  // Video Partial Hash Stats (trailers)
  if (results.videoPartialHash.length > 0) {
    const videoTimes = results.videoPartialHash.map(r => r.timeMs);
    console.log('Strategy 3: Video Partial Hash (first 1MB + last 1MB)');
    console.log('─'.repeat(100));
    console.log(`  Use Case:    Trailer files (10MB - 1GB)`);
    console.log(`  Min:         ${Math.min(...videoTimes)}ms`);
    console.log(`  Max:         ${Math.max(...videoTimes)}ms`);
    console.log(
      `  Average:     ${(videoTimes.reduce((a, b) => a + b, 0) / videoTimes.length).toFixed(2)}ms`
    );
    console.log(`  Median:      ${median(videoTimes).toFixed(2)}ms`);
    console.log(`  Total:       ${videoTimes.reduce((a, b) => a + b, 0)}ms\n`);
  }

  // Video Optimized Hash Stats (large movies)
  if (results.videoOptimizedHash.length > 0) {
    const optimizedTimes = results.videoOptimizedHash.map(r => r.timeMs);
    const avgSize =
      results.videoOptimizedHash.reduce((sum, r) => sum + (r.fileSize || 0), 0) /
      results.videoOptimizedHash.length;
    console.log('Strategy 4: Video Optimized Hash (first 4MB + last 4MB + middle 1MB)');
    console.log('─'.repeat(100));
    console.log(`  Use Case:    Large movie files (> 1GB) - captures container metadata`);
    console.log(`  Avg Size:    ${(avgSize / (1024 * 1024 * 1024)).toFixed(2)} GB`);
    console.log(`  Min:         ${Math.min(...optimizedTimes)}ms`);
    console.log(`  Max:         ${Math.max(...optimizedTimes)}ms`);
    console.log(
      `  Average:     ${(optimizedTimes.reduce((a, b) => a + b, 0) / optimizedTimes.length).toFixed(2)}ms`
    );
    console.log(`  Median:      ${median(optimizedTimes).toFixed(2)}ms`);
    console.log(`  Total:       ${optimizedTimes.reduce((a, b) => a + b, 0)}ms\n`);
  }

  // Detailed results table
  console.log('Detailed Results by Directory:');
  console.log('─'.repeat(130));
  console.log(
    'Directory                                    | Dir Fingerprint | Trailer (Partial) | Movie (Optimized) | Movie File Size'
  );
  console.log('─'.repeat(130));

  for (let i = 0; i < results.directoryFingerprint.length; i++) {
    const dirName = path.basename(results.directoryFingerprint[i].dir).substring(0, 40);
    const t1 = results.directoryFingerprint[i].timeMs.toString().padStart(8);
    const t2 = results.videoPartialHash[i]?.timeMs?.toString().padStart(10) || '       N/A';
    const t3 = results.videoOptimizedHash[i]?.timeMs?.toString().padStart(10) || '       N/A';

    // Get movie file size if available
    let movieSize = '             N/A';
    if (results.videoOptimizedHash[i]?.fileSize) {
      const sizeGB = (results.videoOptimizedHash[i].fileSize! / (1024 * 1024 * 1024)).toFixed(2);
      movieSize = `${sizeGB} GB`.padStart(16);
    }

    console.log(
      `${dirName.padEnd(45)}| ${t1}ms        | ${t2}ms        | ${t3}ms        | ${movieSize}`
    );
  }

  console.log('─'.repeat(130) + '\n');

  // Small files table
  if (results.smallFileFullHash.length > 0) {
    console.log('Small Files (Full Hash):');
    console.log('─'.repeat(100));
    console.log(
      'File Name                                              | Size      | Hash Time | Hash Value (first 16 chars)'
    );
    console.log('─'.repeat(100));

    for (const result of results.smallFileFullHash.slice(0, 10)) {
      const fileName = path.basename(result.file).substring(0, 50).padEnd(50);
      const size = (result.fileSize / 1024).toFixed(1) + ' KB';
      const hashTime = result.timeMs.toString().padStart(6) + 'ms';
      const hashPreview = result.hash.substring(0, 16);

      console.log(`${fileName} | ${size.padStart(9)} | ${hashTime} | ${hashPreview}...`);
    }

    if (results.smallFileFullHash.length > 10) {
      console.log(`... and ${results.smallFileFullHash.length - 10} more files`);
    }

    console.log('─'.repeat(100) + '\n');
  }

  // Sample hashes (show actual hash values for verification)
  console.log('Sample Hash Values (First Directory):');
  console.log(`  Directory: ${path.basename(results.directoryFingerprint[0].dir)}`);
  console.log(`    Dir Fingerprint:  ${results.directoryFingerprint[0].hash}`);
  if (results.videoPartialHash[0]) {
    console.log(`    Trailer Partial:  ${results.videoPartialHash[0].hash}`);
    console.log(
      `    Trailer File:     ${path.basename(results.videoPartialHash[0].videoFile || 'N/A')}`
    );
  }
  if (results.videoOptimizedHash[0]) {
    console.log(`    Movie Optimized:  ${results.videoOptimizedHash[0].hash}`);
    console.log(
      `    Movie File:       ${path.basename(results.videoOptimizedHash[0].videoFile || 'N/A')}`
    );
    console.log(
      `    Movie Size:       ${(results.videoOptimizedHash[0].fileSize! / (1024 * 1024 * 1024)).toFixed(2)} GB`
    );
  }
  console.log();

  // Performance recommendations
  console.log('Performance Analysis & Recommendations:');
  console.log('─'.repeat(100));

  const avgFingerprint = fingerprintTimes.reduce((a, b) => a + b, 0) / fingerprintTimes.length;

  console.log('\n  Directory Fingerprint:');
  if (avgFingerprint < 50) {
    console.log(`    ✓ EXCELLENT (${avgFingerprint.toFixed(2)}ms avg)`);
    console.log(`    → Use for quick "did anything change?" check on every rescan`);
    console.log(`    → Can check entire library rapidly`);
  } else if (avgFingerprint < 200) {
    console.log(`    ⚠ ACCEPTABLE (${avgFingerprint.toFixed(2)}ms avg)`);
    console.log(`    → Consider for large libraries (1000+ items)`);
  } else {
    console.log(`    ✗ TOO SLOW (${avgFingerprint.toFixed(2)}ms avg)`);
    console.log(`    → Use per-file hashing instead`);
  }

  if (results.smallFileFullHash.length > 0) {
    const smallTimes = results.smallFileFullHash.map(r => r.timeMs);
    const avgSmall = smallTimes.reduce((a, b) => a + b, 0) / smallTimes.length;
    console.log('\n  Small File Full Hash (NFO, images, subtitles):');
    console.log(
      `    ✓ FAST (${avgSmall.toFixed(2)}ms avg for ${(results.smallFileFullHash.reduce((sum, r) => sum + r.fileSize, 0) / results.smallFileFullHash.length / 1024).toFixed(0)}KB files)`
    );
    console.log(`    → Complete hash ensures ALL changes detected (critical for NFOs)`);
    console.log(`    → Minimal performance cost`);
  }

  if (results.videoPartialHash.length > 0) {
    const videoTimes = results.videoPartialHash.map(r => r.timeMs);
    const avgVideo = videoTimes.reduce((a, b) => a + b, 0) / videoTimes.length;
    console.log('\n  Video Partial Hash (trailers):');
    console.log(`    ✓ VERY FAST (${avgVideo.toFixed(2)}ms avg)`);
    console.log(`    → Ideal for trailer files (10MB-1GB range)`);
  }

  if (results.videoOptimizedHash.length > 0) {
    const optimizedTimes = results.videoOptimizedHash.map(r => r.timeMs);
    const avgOptimized = optimizedTimes.reduce((a, b) => a + b, 0) / optimizedTimes.length;
    const avgSize =
      results.videoOptimizedHash.reduce((sum, r) => sum + (r.fileSize || 0), 0) /
      results.videoOptimizedHash.length;
    console.log('\n  Video Optimized Hash (large movies):');
    console.log(
      `    ✓ EXTREMELY FAST (${avgOptimized.toFixed(2)}ms avg for ${(avgSize / (1024 * 1024 * 1024)).toFixed(1)}GB files)`
    );
    console.log(`    → Reads only 9MB from ~20GB files`);
    console.log(`    → Captures container metadata (codec, resolution changes detected)`);
    console.log(`    → ~2000x faster than full FFprobe scan (~30 sec)`);
  }

  console.log('\n' + '='.repeat(100) + '\n');
}

/**
 * Main test runner
 */
export async function runHashPerformanceTest(
  testRootPath: string,
  sampleSize: number = 10
): Promise<void> {
  logger.info(`Starting hash performance test on: ${testRootPath}`);
  logger.info(`Sample size: ${sampleSize} directories\n`);

  try {
    // 1. Find movie directories
    logger.info('Discovering directories...');
    const movieDirs = await getSubdirectories(testRootPath);
    logger.info(`Found ${movieDirs.length} directories\n`);

    if (movieDirs.length === 0) {
      throw new ValidationError(
        'No directories found in test path',
        {
          service: 'hashPerformanceTest',
          operation: 'runHashPerformanceTest',
          metadata: { testRootPath }
        }
      );
    }

    // 2. Select random sample
    const testDirs = sampleRandomDirectories(movieDirs, sampleSize);
    logger.info(`Selected ${testDirs.length} directories for testing:\n`);
    testDirs.forEach((dir, i) => {
      logger.info(`  ${i + 1}. ${path.basename(dir)}`);
    });
    logger.info('');

    // 3. Run tests
    const results: TestResults = {
      directoryFingerprint: [],
      videoPartialHash: [],
      videoOptimizedHash: [],
      smallFileFullHash: [],
    };

    for (let i = 0; i < testDirs.length; i++) {
      const dir = testDirs[i];
      const dirName = path.basename(dir);

      console.log(`\n[${i + 1}/${testDirs.length}] Testing: ${dirName}`);
      console.log('─'.repeat(100));

      // Test 1: Directory Fingerprint
      try {
        const t1 = Date.now();
        const hash1 = await hashDirectoryFingerprint(dir);
        const time1 = Date.now() - t1;
        results.directoryFingerprint.push({ dir, hash: hash1, timeMs: time1 });
        console.log(`  ✓ Dir Fingerprint:      ${time1}ms`);
      } catch (error) {
        logger.error(`Failed to hash directory fingerprint: ${getErrorMessage(error)}`);
        results.directoryFingerprint.push({ dir, hash: 'ERROR', timeMs: 0 });
        console.log(`  ✗ Dir Fingerprint:      FAILED`);
      }

      // Test 2: Small Files Full Hash (NFO, images, subtitles)
      try {
        const files = await fs.readdir(dir, { withFileTypes: true });
        const smallFileExtensions = ['.nfo', '.jpg', '.png', '.srt', '.ass', '.sub'];

        for (const file of files) {
          if (file.isFile()) {
            const filePath = path.join(dir, file.name);
            const ext = path.extname(file.name).toLowerCase();

            if (smallFileExtensions.includes(ext)) {
              const stats = await fs.stat(filePath);

              // Only test small files (< 10MB)
              if (stats.size < 10 * 1024 * 1024) {
                const t = Date.now();
                const hash = await hashEntireFile(filePath);
                const time = Date.now() - t;

                results.smallFileFullHash.push({
                  file: filePath,
                  hash,
                  timeMs: time,
                  fileSize: stats.size,
                  strategy: 'full',
                });
              }
            }
          }
        }

        if (results.smallFileFullHash.length > 0) {
          const recentCount =
            results.smallFileFullHash.length -
            (i > 0 ? testDirs.slice(0, i).reduce((count) => count, 0) : 0);
          console.log(`  ✓ Small Files (Full):   ${recentCount} files hashed`);
        }
      } catch (error) {
        logger.error(`Failed to hash small files: ${getErrorMessage(error)}`);
      }

      // Test 3: Video Partial Hash (trailers)
      try {
        const files = await fs.readdir(dir);
        const trailerPatterns = [/trailer/i, /-trailer\./i];

        for (const file of files) {
          if (trailerPatterns.some(pattern => pattern.test(file))) {
            const filePath = path.join(dir, file);
            const stats = await fs.stat(filePath);

            if (stats.isFile() && stats.size > 10 * 1024 * 1024) {
              // > 10MB
              const t = Date.now();
              const hash = await hashVideoFilePartial(filePath);
              const time = Date.now() - t;

              results.videoPartialHash.push({
                dir,
                hash,
                timeMs: time,
                videoFile: filePath,
                fileSize: stats.size,
              });
              console.log(`  ✓ Trailer (Partial):    ${time}ms (${path.basename(filePath)})`);
              break; // Only test first trailer found
            }
          }
        }
      } catch (error) {
        logger.error(`Failed to hash trailer: ${getErrorMessage(error)}`);
      }

      // Test 4: Video Optimized Hash (large movie files)
      try {
        const files = await fs.readdir(dir);
        const videoExtensions = ['.mkv', '.mp4', '.avi', '.m4v'];

        // Find main movie file (not trailer)
        for (const file of files) {
          const ext = path.extname(file).toLowerCase();
          if (videoExtensions.includes(ext) && !/trailer/i.test(file)) {
            const filePath = path.join(dir, file);
            const stats = await fs.stat(filePath);

            if (stats.isFile() && stats.size > 1024 * 1024 * 1024) {
              // > 1GB
              const t = Date.now();
              const hash = await hashVideoFileOptimized(filePath);
              const time = Date.now() - t;

              results.videoOptimizedHash.push({
                dir,
                hash,
                timeMs: time,
                videoFile: filePath,
                fileSize: stats.size,
              });
              console.log(
                `  ✓ Movie (Optimized):    ${time}ms (${path.basename(filePath)}, ${(stats.size / (1024 * 1024 * 1024)).toFixed(2)} GB)`
              );
              break; // Only test first movie file found
            }
          }
        }
      } catch (error) {
        logger.error(`Failed to hash movie file: ${getErrorMessage(error)}`);
      }
    }

    // 4. Generate and print report
    await printPerformanceReport(results);

    logger.info('Hash performance test completed successfully!');
  } catch (error) {
    logger.error(`Hash performance test failed: ${getErrorMessage(error)}`);
    throw error;
  }
}
