/**
 * FanArt.tv Provider
 *
 * Concrete implementation of BaseProvider for FanArt.tv.
 * FanArt.tv is an image-only provider with high-quality curated artwork.
 */

import { BaseProvider } from '../BaseProvider.js';
import { FanArtClient } from './FanArtClient.js';
import { RateLimiter } from '../utils/RateLimiter.js';
import {
  ProviderCapabilities,
  ProviderOptions,
  SearchRequest,
  SearchResult,
  MetadataRequest,
  MetadataResponse,
  AssetRequest,
  AssetCandidate,
} from '../../../types/providers/index.js';
import { ProviderConfig } from '../../../types/provider.js';
import { logger } from '../../../middleware/logging.js';
import { getErrorMessage } from '../../../utils/errorHandling.js';
import { NotImplementedError } from '../../../errors/index.js';
import {
  FanArtImage,
  FanArtSeasonImage,
} from '../../../types/providers/fanart.js';

export class FanArtProvider extends BaseProvider {
  private fanartClient!: FanArtClient;
  private hasPersonalKey: boolean = false;

  constructor(config: ProviderConfig, options?: ProviderOptions) {
    super(config, options);

    // Initialize FanArt.tv client
    const clientOptions: {
      apiKey: string;
      baseUrl: string;
      personalApiKey?: string;
    } = {
      apiKey: config.apiKey || '',
      baseUrl: (options?.baseUrl as string) || 'https://webservice.fanart.tv/v3',
    };
    if (options?.personalApiKey) {
      clientOptions.personalApiKey = options.personalApiKey as string;
      this.hasPersonalKey = true;
    }
    this.fanartClient = new FanArtClient(clientOptions);

    logger.info('FanArt.tv Provider initialized', {
      providerId: this.capabilities.id,
      version: this.capabilities.version,
      hasPersonalKey: this.fanartClient.hasPersonalKey(),
      rateLimit: `${this.fanartClient.getRateLimit()} req/sec`,
    });
  }

  /**
   * Create rate limiter for FanArt.tv API
   */
  protected createRateLimiter(): RateLimiter {
    const rps = this.hasPersonalKey ? 2 : 1;
    return new RateLimiter({
      requestsPerSecond: rps,
      burstCapacity: rps * 5, // 5 second burst
      windowSeconds: 1,
    });
  }

  /**
   * Define FanArt.tv provider capabilities
   */
  defineCapabilities(): ProviderCapabilities {
    return {
      id: 'fanart_tv',
      name: 'FanArt.tv',
      version: '1.0.0',
      category: 'images', // Images only, no metadata

      supportedEntityTypes: ['movie', 'series', 'season'],

      supportedMetadataFields: {
        // FanArt.tv doesn't provide metadata, only images
      },

      supportedAssetTypes: {
        movie: ['clearlogo', 'clearart', 'poster', 'fanart', 'banner', 'landscape', 'discart'],
        series: ['clearlogo', 'clearart', 'poster', 'fanart', 'banner', 'landscape', 'characterart'],
        season: ['poster', 'landscape', 'banner'],
      },

      authentication: {
        type: 'api_key',
        required: true,
        allowsPersonalKey: true,
        personalKeyBenefit: 'Increases rate limit from 1 to 2 requests per second',
      },

      rateLimit: {
        requestsPerSecond: this.hasPersonalKey ? 2 : 1,
        burstCapacity: (this.hasPersonalKey ? 2 : 1) * 5,
        webhookReservedCapacity: 0, // No webhook support for FanArt.tv
        enforcementType: 'client',
      },

      search: {
        supported: false, // FanArt.tv doesn't have search, requires TMDB/TVDB ID
        fuzzyMatching: false,
        multiLanguage: false,
        yearFilter: false,
        externalIdLookup: ['tmdb_id', 'tvdb_id'],
      },

      dataQuality: {
        metadataCompleteness: 0, // No metadata
        imageQuality: 1.0, // Highest quality images
        updateFrequency: 'daily',
        userContributed: true,
        curatedContent: true,
      },

      assetProvision: {
        providesUrls: true,
        providesDirectDownload: true,
        thumbnailUrls: false,
        multipleQualities: true, // HD vs standard versions
        maxResultsPerType: null,
        qualityHints: true, // HD prefix in type names
        languagePerAsset: true,
      },

      specialFeatures: {
        multipleLanguageImages: true,
        voteSystemForImages: true,
      },
    };
  }

  /**
   * Search not supported by FanArt.tv
   */
  async search(_request: SearchRequest): Promise<SearchResult[]> {
    // FanArt.tv doesn't support search
    return [];
  }

  /**
   * Metadata not supported by FanArt.tv
   */
  async getMetadata(_request: MetadataRequest): Promise<MetadataResponse> {
    // FanArt.tv doesn't provide metadata, only images
    throw new NotImplementedError('FanArt.tv provider does not support metadata fetching');
  }

  /**
   * Get asset candidates for movies/series/seasons
   */
  async getAssets(request: AssetRequest): Promise<AssetCandidate[]> {
    const { providerResultId, entityType, assetTypes } = request;

    logger.debug('[FanArt.tv] getAssets called', {
      providerResultId,
      entityType,
      assetTypes,
      requestedCount: assetTypes.length
    });

    const candidates: AssetCandidate[] = [];

    try {
      if (entityType === 'movie') {
        const images = await this.fanartClient.getMovieImages(parseInt(providerResultId));

        if (!images) {
          logger.debug('No FanArt.tv images found for movie', { providerResultId });
          return [];
        }

        // Debug: log what image types are available
        const availableTypes = Object.keys(images).filter(key => {
          const value = images[key as keyof typeof images];
          return Array.isArray(value) && value.length > 0;
        });
        logger.debug('FanArt.tv available image types', {
          providerResultId,
          availableTypes,
          counts: availableTypes.reduce((acc, type) => {
            const value = images[type as keyof typeof images];
            return {
              ...acc,
              [type]: Array.isArray(value) ? value.length : 0
            };
          }, {})
        });

        // HD Movie Logo (clearlogo)
        if (
          assetTypes.includes('clearlogo') &&
          (images.hdmovielogo || images.movielogo)
        ) {
          const logos = [...(images.hdmovielogo || []), ...(images.movielogo || [])];
          for (const logo of logos) {
            candidates.push(this.transformImage(logo, providerResultId, 'clearlogo', true));
          }
        }

        // HD Movie Clearart
        if (
          assetTypes.includes('clearart') &&
          (images.hdmovieclearart || images.movieart)
        ) {
          const cleararts = [...(images.hdmovieclearart || []), ...(images.movieart || [])];
          for (const clearart of cleararts) {
            candidates.push(this.transformImage(clearart, providerResultId, 'clearart', true));
          }
        }

        // Movie Poster
        if (assetTypes.includes('poster') && images.movieposter) {
          for (const poster of images.movieposter) {
            candidates.push(this.transformImage(poster, providerResultId, 'poster'));
          }
        }

        // Movie Background (fanart)
        if (assetTypes.includes('fanart') && images.moviebackground) {
          for (const background of images.moviebackground) {
            candidates.push(this.transformImage(background, providerResultId, 'fanart'));
          }
        }

        // Movie Banner
        if (assetTypes.includes('banner') && images.moviebanner) {
          for (const banner of images.moviebanner) {
            candidates.push(this.transformImage(banner, providerResultId, 'banner'));
          }
        }

        // Movie Thumb (Landscape)
        // FanArt.tv "moviethumb" is 1000×562 (16:9) - horizontal background without text
        // Community standard: this is called "landscape" not "thumb"
        logger.debug('[FanArt.tv] Checking landscape', {
          hasLandscapeInRequest: assetTypes.includes('landscape'),
          hasMoviethumbData: !!images.moviethumb,
          moviethumbCount: images.moviethumb?.length || 0
        });
        if (assetTypes.includes('landscape') && images.moviethumb) {
          for (const thumb of images.moviethumb) {
            candidates.push(this.transformImage(thumb, providerResultId, 'landscape'));
          }
          logger.debug('[FanArt.tv] Added landscape candidates', {
            count: images.moviethumb.length
          });
        }

        // Movie Disc
        if (assetTypes.includes('discart') && images.moviedisc) {
          for (const disc of images.moviedisc) {
            candidates.push(this.transformImage(disc, providerResultId, 'discart'));
          }
        }
      }

      if (entityType === 'series' || entityType === 'season') {
        const images = await this.fanartClient.getTVImages(parseInt(providerResultId));

        if (!images) {
          logger.debug('No FanArt.tv images found for TV show', { providerResultId });
          return [];
        }

        if (entityType === 'series') {
          // HD TV Logo (clearlogo)
          if (assetTypes.includes('clearlogo') && (images.hdtvlogo || images.clearlogo)) {
            const logos = [...(images.hdtvlogo || []), ...(images.clearlogo || [])];
            for (const logo of logos) {
              candidates.push(this.transformImage(logo, providerResultId, 'clearlogo', true));
            }
          }

          // HD Clearart
          if (assetTypes.includes('clearart') && (images.hdclearart || images.clearart)) {
            const cleararts = [...(images.hdclearart || []), ...(images.clearart || [])];
            for (const clearart of cleararts) {
              candidates.push(this.transformImage(clearart, providerResultId, 'clearart', true));
            }
          }

          // Show Background (fanart)
          if (assetTypes.includes('fanart') && images.showbackground) {
            for (const background of images.showbackground) {
              candidates.push(this.transformImage(background, providerResultId, 'fanart'));
            }
          }

          // TV Poster
          if (assetTypes.includes('poster') && images.tvposter) {
            for (const poster of images.tvposter) {
              candidates.push(this.transformImage(poster, providerResultId, 'poster'));
            }
          }

          // TV Banner
          if (assetTypes.includes('banner') && images.tvbanner) {
            for (const banner of images.tvbanner) {
              candidates.push(this.transformImage(banner, providerResultId, 'banner'));
            }
          }

          // TV Thumb
          if (assetTypes.includes('thumb') && images.tvthumb) {
            for (const thumb of images.tvthumb) {
              candidates.push(this.transformImage(thumb, providerResultId, 'thumb'));
            }
          }

          // Character Art
          if (assetTypes.includes('characterart') && images.characterart) {
            for (const charart of images.characterart) {
              candidates.push(this.transformImage(charart, providerResultId, 'characterart'));
            }
          }
        }

        if (entityType === 'season') {
          // Season Poster
          if (assetTypes.includes('poster') && images.seasonposter) {
            for (const poster of images.seasonposter) {
              candidates.push(
                this.transformSeasonImage(poster as FanArtSeasonImage, providerResultId, 'poster')
              );
            }
          }

          // Season Thumb
          if (assetTypes.includes('thumb') && images.seasonthumb) {
            for (const thumb of images.seasonthumb) {
              candidates.push(
                this.transformSeasonImage(thumb as FanArtSeasonImage, providerResultId, 'thumb')
              );
            }
          }

          // Season Banner
          if (assetTypes.includes('banner') && images.seasonbanner) {
            for (const banner of images.seasonbanner) {
              candidates.push(
                this.transformSeasonImage(banner as FanArtSeasonImage, providerResultId, 'banner')
              );
            }
          }
        }
      }

      logger.debug('FanArt.tv assets fetched', {
        providerResultId,
        entityType,
        totalCandidates: candidates.length,
      });

      return candidates;
    } catch (error) {
      logger.error('FanArt.tv asset fetch failed', {
        providerResultId,
        entityType,
        error: getErrorMessage(error),
      });
      // Don't throw - just return empty array (FanArt.tv doesn't have all content)
      return [];
    }
  }

  // ============================================
  // Private Helper Methods
  // ============================================

  /**
   * Transform FanArt image to AssetCandidate
   */
  private transformImage(
    image: FanArtImage,
    providerResultId: string,
    assetType: AssetRequest['assetTypes'][number],
    isHD = false
  ): AssetCandidate {
    const candidate: AssetCandidate = {
      providerId: 'fanart_tv',
      providerResultId,
      assetType,
      url: image.url,
      language: image.lang === '00' ? 'null' : image.lang,
    };

    // Add likes as votes
    const likes = parseInt(image.likes);
    if (!isNaN(likes)) {
      candidate.votes = likes;
    }

    // Add quality hint for HD images
    if (isHD) {
      candidate.quality = 'hd';
    }

    return candidate;
  }

  /**
   * Transform FanArt season image to AssetCandidate
   */
  private transformSeasonImage(
    image: FanArtSeasonImage,
    providerResultId: string,
    assetType: AssetRequest['assetTypes'][number]
  ): AssetCandidate {
    const candidate = this.transformImage(image, providerResultId, assetType);

    // Season images have season number metadata
    // This could be used for filtering but we return all for now

    return candidate;
  }
}
