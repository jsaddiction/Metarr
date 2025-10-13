/**
 * FetchOrchestrator Usage Examples
 *
 * This file demonstrates how to use the FetchOrchestrator service
 * for concurrent provider fetching with retry logic.
 */

import { FetchOrchestrator, ProviderRegistry } from './index.js';
import { ProviderConfigService } from '../providerConfigService.js';
import type { DatabaseConnection } from '../../types/database.js';
import type { Movie } from '../../types/models.js';

/**
 * Example 1: Basic usage - Fetch from all providers for a movie
 */
async function basicFetchExample(db: DatabaseConnection, movie: Movie) {
  // Initialize services
  const registry = ProviderRegistry.getInstance();
  const configService = new ProviderConfigService(db);
  const orchestrator = new FetchOrchestrator(registry, configService);

  // Fetch from all enabled providers
  const results = await orchestrator.fetchAllProviders(movie, 'movie', {
    priority: 'user',
    assetTypes: ['poster', 'fanart', 'clearlogo', 'banner'],
  });

  // Check results
  if (results.allFailed) {
    console.error('All providers failed to fetch data');
    return;
  }

  // Process successful providers
  for (const providerName of results.metadata.completedProviders) {
    const assets = results.providers[providerName];
    console.log(`Provider ${providerName} returned:`, {
      metadata: assets?.metadata ? Object.keys(assets.metadata) : [],
      posters: assets?.images?.posters?.length || 0,
      fanarts: assets?.images?.fanarts?.length || 0,
      clearLogos: assets?.images?.clearLogos?.length || 0,
      trailers: assets?.videos?.trailers?.length || 0,
    });
  }

  // Handle failed providers
  if (results.metadata.failedProviders.length > 0) {
    console.warn('Failed providers:', results.metadata.failedProviders);
  }

  // Handle timed out providers
  if (results.metadata.timedOutProviders.length > 0) {
    console.warn('Timed out providers:', results.metadata.timedOutProviders);
  }
}

/**
 * Example 2: With progress callbacks for WebSocket updates
 */
async function fetchWithProgressExample(db: DatabaseConnection, movie: Movie) {
  const registry = ProviderRegistry.getInstance();
  const configService = new ProviderConfigService(db);
  const orchestrator = new FetchOrchestrator(registry, configService);

  // Track progress
  const progressState = {
    total: 0,
    completed: 0,
    failed: 0,
  };

  const results = await orchestrator.fetchAllProviders(movie, 'movie', {
    priority: 'background',
    assetTypes: ['poster', 'fanart'],
    progressCallback: {
      onProviderStart: (providerName) => {
        progressState.total++;
        console.log(`Starting fetch from ${providerName}...`);
        // Here you would emit WebSocket event:
        // websocket.emit('provider:start', { movieId: movie.id, provider: providerName });
      },
      onProviderComplete: (providerName, success) => {
        if (success) {
          progressState.completed++;
          console.log(`✓ ${providerName} completed successfully`);
          // websocket.emit('provider:complete', { movieId: movie.id, provider: providerName, success: true });
        } else {
          progressState.failed++;
          console.log(`✗ ${providerName} failed`);
          // websocket.emit('provider:complete', { movieId: movie.id, provider: providerName, success: false });
        }
      },
      onProviderRetry: (providerName, attempt, maxRetries) => {
        console.log(`⟳ Retrying ${providerName} (attempt ${attempt}/${maxRetries})...`);
        // websocket.emit('provider:retry', { movieId: movie.id, provider: providerName, attempt, maxRetries });
      },
      onProviderTimeout: (providerName) => {
        console.log(`⏱ ${providerName} timed out`);
        // websocket.emit('provider:timeout', { movieId: movie.id, provider: providerName });
      },
    },
  });

  console.log('Fetch summary:', {
    total: progressState.total,
    completed: progressState.completed,
    failed: progressState.failed,
    timedOut: results.metadata.timedOutProviders.length,
  });

  return results;
}

/**
 * Example 3: Background fetch (longer timeout, more retries)
 */
async function backgroundFetchExample(db: DatabaseConnection, movie: Movie) {
  const registry = ProviderRegistry.getInstance();
  const configService = new ProviderConfigService(db);
  const orchestrator = new FetchOrchestrator(registry, configService);

  // Background priority allows:
  // - 60 second timeout (vs 10 seconds for user)
  // - 5 retries (vs 2 for user)
  const results = await orchestrator.fetchAllProviders(movie, 'movie', {
    priority: 'background',
    assetTypes: ['poster', 'fanart', 'clearlogo', 'clearart', 'banner'],
  });

  return results;
}

/**
 * Example 4: Handling partial failures
 */
async function partialFailureExample(db: DatabaseConnection, movie: Movie) {
  const registry = ProviderRegistry.getInstance();
  const configService = new ProviderConfigService(db);
  const orchestrator = new FetchOrchestrator(registry, configService);

  const results = await orchestrator.fetchAllProviders(movie, 'movie', {
    priority: 'user',
    assetTypes: ['poster'],
  });

  // Even if some providers fail, we can still use data from successful ones
  if (!results.allFailed) {
    console.log('Processing partial results...');

    // Combine all posters from all successful providers
    const allPosters = [];
    for (const [providerName, assets] of Object.entries(results.providers)) {
      if (assets?.images?.posters) {
        for (const poster of assets.images.posters) {
          allPosters.push({
            ...poster,
            providerName, // Tag with provider for selection logic
          });
        }
      }
    }

    console.log(`Collected ${allPosters.length} posters from ${results.metadata.completedProviders.length} providers`);

    // Now you could pass these to AssetSelector for quality-based selection
    return allPosters;
  } else {
    console.error('Complete failure - all providers failed');
    // Handle gracefully - maybe use cached data or show error to user
    return [];
  }
}

/**
 * Example 5: Retry analysis
 */
async function retryAnalysisExample(db: DatabaseConnection, movie: Movie) {
  const registry = ProviderRegistry.getInstance();
  const configService = new ProviderConfigService(db);
  const orchestrator = new FetchOrchestrator(registry, configService);

  const results = await orchestrator.fetchAllProviders(movie, 'movie', {
    priority: 'user',
    assetTypes: ['poster'],
  });

  // Analyze which failures are retryable (for potential manual retry)
  const retryableFailures = results.metadata.failedProviders.filter(f => f.retryable);
  const permanentFailures = results.metadata.failedProviders.filter(f => !f.retryable);

  console.log('Failure analysis:', {
    retryable: retryableFailures.map(f => f.name),
    permanent: permanentFailures.map(f => `${f.name}: ${f.error}`),
  });

  // You could offer user a "Retry failed providers" button for retryable ones
  return {
    results,
    retryableFailures,
    permanentFailures,
  };
}

// Export examples
export {
  basicFetchExample,
  fetchWithProgressExample,
  backgroundFetchExample,
  partialFailureExample,
  retryAnalysisExample,
};
