/**
 * Image Hashing Utilities
 *
 * Provides perceptual hashing (pHash) for image deduplication.
 * Uses multi-hash approach (aHash + dHash) for robust duplicate detection.
 *
 * @deprecated Individual functions - use ImageProcessor for new code
 */

import crypto from 'crypto';
import { promises as fs } from 'fs';
import sharp from 'sharp';
import { getErrorMessage } from './errorHandling.js';
import { imageProcessor, ImageAnalysis } from './ImageProcessor.js';

/**
 * Compute all perceptual hashes for an image
 *
 * Returns both aHash and dHash for robust duplicate detection.
 * Use this for new code instead of computePerceptualHash.
 *
 * @param imagePath - Absolute path to image file
 * @returns Object with perceptualHash (aHash) and differenceHash (dHash)
 */
export async function computeImageHashes(
  imagePath: string
): Promise<{ perceptualHash: string; differenceHash: string; metadata: ImageAnalysis }> {
  try {
    const analysis = await imageProcessor.analyzeImage(imagePath);
    return {
      perceptualHash: analysis.perceptualHash,
      differenceHash: analysis.differenceHash,
      metadata: analysis,
    };
  } catch (error) {
    throw new Error(`Failed to compute image hashes for ${imagePath}: ${getErrorMessage(error)}`);
  }
}

/**
 * Compute perceptual hash (average hash) for an image
 *
 * @deprecated Use computeImageHashes() instead for better duplicate detection
 * This function is kept for backward compatibility only.
 *
 * @param imagePath - Absolute path to image file
 * @returns 16-character hex string representing 64-bit hash
 */
export async function computePerceptualHash(imagePath: string): Promise<string> {
  const { perceptualHash } = await computeImageHashes(imagePath);
  return perceptualHash;
}

/**
 * Compute SHA256 content hash for a file
 *
 * @param filePath - Absolute path to file
 * @returns 64-character hex string representing SHA256 hash
 */
export async function computeContentHash(filePath: string): Promise<string> {
  try {
    const fileBuffer = await fs.readFile(filePath);
    return crypto.createHash('sha256').update(fileBuffer).digest('hex');
  } catch (error) {
    throw new Error(`Failed to compute content hash for ${filePath}: ${getErrorMessage(error)}`);
  }
}

/**
 * Calculate Hamming distance between two perceptual hashes
 *
 * @param hash1 - First hash (hex string)
 * @param hash2 - Second hash (hex string)
 * @returns Number of differing bits (0-64)
 */
export function hammingDistance(hash1: string, hash2: string): number {
  if (hash1.length !== hash2.length) {
    throw new Error('Hashes must be same length');
  }

  const val1 = BigInt('0x' + hash1);
  const val2 = BigInt('0x' + hash2);
  const xor = val1 ^ val2;

  // Count number of 1 bits in XOR result
  let distance = 0;
  let temp = xor;
  while (temp > 0n) {
    distance += Number(temp & 1n);
    temp >>= 1n;
  }

  return distance;
}

/**
 * Calculate similarity percentage between two perceptual hashes
 *
 * @param hash1 - First hash (hex string)
 * @param hash2 - Second hash (hex string)
 * @returns Similarity percentage (0-100)
 */
export function hashSimilarity(hash1: string, hash2: string): number {
  const distance = hammingDistance(hash1, hash2);
  const maxBits = hash1.length * 4; // 4 bits per hex character
  return ((maxBits - distance) / maxBits) * 100;
}

/**
 * Check if two hashes are similar within threshold
 *
 * @param hash1 - First hash (hex string)
 * @param hash2 - Second hash (hex string)
 * @param threshold - Similarity threshold percentage (default: 90)
 * @returns True if hashes are similar within threshold
 */
export function areSimilar(hash1: string, hash2: string, threshold: number = 90): boolean {
  return hashSimilarity(hash1, hash2) >= threshold;
}

/**
 * Get image dimensions
 *
 * @param imagePath - Absolute path to image file
 * @returns Object with width and height
 */
export async function getImageDimensions(
  imagePath: string
): Promise<{ width: number; height: number }> {
  try {
    const metadata = await sharp(imagePath).metadata();
    return {
      width: metadata.width || 0,
      height: metadata.height || 0,
    };
  } catch (error) {
    throw new Error(`Failed to get image dimensions for ${imagePath}: ${getErrorMessage(error)}`);
  }
}

/**
 * Get file size in bytes
 *
 * @param filePath - Absolute path to file
 * @returns File size in bytes
 */
export async function getFileSize(filePath: string): Promise<number> {
  try {
    const stats = await fs.stat(filePath);
    return stats.size;
  } catch (error) {
    throw new Error(`Failed to get file size for ${filePath}: ${getErrorMessage(error)}`);
  }
}
