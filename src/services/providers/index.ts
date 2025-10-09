/**
 * Provider Framework
 *
 * Central export for all provider-related components.
 */

// Core Components
export * from './BaseProvider.js';
export * from './ProviderRegistry.js';
export * from './AssetSelector.js';
export * from './ProviderOrchestrator.js';

// Utilities
export * from './utils/index.js';

// Types
export * from '../../types/providers/index.js';

// Concrete Providers
export * from './tmdb/TMDBProvider.js';

// Register all providers (imports trigger self-registration)
import './tmdb/register.js';
