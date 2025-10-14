/**
 * Provider Test Helpers
 *
 * Utilities and fixtures for testing providers.
 */

import { ProviderConfig } from '../../src/types/provider.js';
import {
  SearchResult,
  MetadataResponse,
  AssetCandidate,
} from '../../src/types/providers/index.js';

/**
 * Create a mock provider config for testing
 */
export function createMockProviderConfig(
  providerName: string,
  overrides: Partial<ProviderConfig> = {}
): ProviderConfig {
  return {
    id: 1,
    providerName,
    enabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/**
 * Create mock search results
 */
export function createMockSearchResults(
  providerId: string,
  count: number = 3
): SearchResult[] {
  return Array.from({ length: count }, (_, i) => ({
    providerId: providerId as any,
    providerResultId: `${providerId}_${i + 1}`,
    title: `Test ${providerId.toUpperCase()} Result ${i + 1}`,
    confidence: 0.9 - i * 0.1,
  }));
}

/**
 * Create a mock metadata response
 */
export function createMockMetadataResponse(
  providerId: string,
  providerResultId: string
): MetadataResponse {
  return {
    providerId: providerId as any,
    providerResultId,
    fields: {
      title: `Test Title`,
      plot: 'Test plot description',
      genres: ['Action', 'Drama'],
      releaseDate: '2024-01-01',
    },
    completeness: 0.9,
    confidence: 1.0,
  };
}

/**
 * Create mock asset candidates
 */
export function createMockAssetCandidates(
  providerId: string,
  assetType: string,
  count: number = 3
): AssetCandidate[] {
  return Array.from({ length: count }, (_, i) => ({
    providerId: providerId as any,
    providerResultId: `asset_${i + 1}`,
    assetType: assetType as any,
    url: `https://example.com/${assetType}_${i + 1}.jpg`,
    width: 1920,
    height: 1080,
    language: 'en',
    voteAverage: 8.5 - i * 0.5,
    votes: 1000 - i * 100,
  }));
}

/**
 * Mock axios responses for API testing
 */
export function mockAxiosSuccess(data: any) {
  return {
    data,
    status: 200,
    statusText: 'OK',
    headers: {},
    config: {} as any,
  };
}

export function mockAxiosError(message: string, statusCode: number = 500) {
  const error: any = new Error(message);
  error.response = {
    status: statusCode,
    data: { error: message },
  };
  return error;
}

/**
 * Wait for a specified duration (for testing rate limiting)
 */
export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Measure execution time
 */
export async function measureTime(fn: () => Promise<void>): Promise<number> {
  const start = Date.now();
  await fn();
  return Date.now() - start;
}
