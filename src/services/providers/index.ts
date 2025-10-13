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
export * from './FetchOrchestrator.js';

// Utilities
export * from './utils/index.js';

// Types
export * from '../../types/providers/index.js';

// Concrete Providers
export * from './tmdb/TMDBProvider.js';
export * from './tvdb/TVDBProvider.js';
export * from './fanart/FanArtProvider.js';
export * from './local/LocalProvider.js';
export * from './imdb/IMDbProvider.js';
export * from './musicbrainz/MusicBrainzProvider.js';
export * from './theaudiodb/TheAudioDBProvider.js';

// Register all providers (imports trigger self-registration)
import './tmdb/register.js';
import './tvdb/register.js';
import './fanart/register.js';
import './local/register.js';
import './imdb/register.js';
import './musicbrainz/register.js';
import './theaudiodb/register.js';
