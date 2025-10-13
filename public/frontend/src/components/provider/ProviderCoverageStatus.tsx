import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFilm, faTv, faMusic, faQuestionCircle, faCheck, faTimes } from '@fortawesome/free-solid-svg-icons';
import { ProviderWithMetadata } from '../../types/provider';

interface ProviderCoverageStatusProps {
  providers: ProviderWithMetadata[];
}

interface CoverageBreakdown {
  mediaType: 'movies' | 'tv' | 'music';
  icon: any;
  label: string;
  assetTypes: {
    name: string;
    displayName: string;
    covered: boolean;
    providers: string[];
  }[];
}

export const ProviderCoverageStatus: React.FC<ProviderCoverageStatusProps> = ({ providers }) => {
  const [showDetailModal, setShowDetailModal] = useState(false);

  // Calculate coverage for each media type
  const calculateCoverage = (): CoverageBreakdown[] => {
    const enabledProviders = providers.filter(p => p.config.enabled);

    // Define asset types per media type
    const movieAssetTypes = [
      'movie_poster',
      'movie_fanart',
      'movie_clearlogo',
      'movie_clearart',
      'movie_discart',
      'movie_trailer'
    ];
    const tvAssetTypes = [
      'tv_poster',
      'tv_fanart',
      'tv_banner',
      'tv_clearlogo',
      'tv_clearart',
      'tv_characterart',
      'tv_landscape',
      'tv_thumb'
    ];
    const musicAssetTypes = [
      'artist_thumb',
      'artist_logo',
      'artist_fanart',
      'artist_banner',
      'album_thumb',
      'album_cdart',
      'album_spine'
    ];

    const checkCoverage = (assetType: string) => {
      // Providers now always fetch everything they support (no enabledAssetTypes filter)
      const providersForAsset = enabledProviders.filter(p =>
        p.metadata.supportedAssetTypes.some(sat => sat.type === assetType && sat.available)
      );
      return {
        covered: providersForAsset.length > 0,
        providers: providersForAsset.map(p => p.metadata.displayName),
      };
    };

    const getAssetDisplayName = (assetType: string): string => {
      const type = assetType.replace(/^(movie_|tv_|artist_|album_)/, '');
      return type.charAt(0).toUpperCase() + type.slice(1);
    };

    return [
      {
        mediaType: 'movies',
        icon: faFilm,
        label: 'Movies',
        assetTypes: movieAssetTypes.map(type => {
          const coverage = checkCoverage(type);
          return {
            name: type,
            displayName: getAssetDisplayName(type),
            covered: coverage.covered,
            providers: coverage.providers,
          };
        }),
      },
      {
        mediaType: 'tv',
        icon: faTv,
        label: 'TV Shows',
        assetTypes: tvAssetTypes.map(type => {
          const coverage = checkCoverage(type);
          return {
            name: type,
            displayName: getAssetDisplayName(type),
            covered: coverage.covered,
            providers: coverage.providers,
          };
        }),
      },
      {
        mediaType: 'music',
        icon: faMusic,
        label: 'Music',
        assetTypes: musicAssetTypes.map(type => {
          const coverage = checkCoverage(type);
          return {
            name: type,
            displayName: getAssetDisplayName(type),
            covered: coverage.covered,
            providers: coverage.providers,
          };
        }),
      },
    ];
  };

  const coverage = calculateCoverage();

  const getCoverageCount = (breakdown: CoverageBreakdown) => {
    const covered = breakdown.assetTypes.filter(at => at.covered).length;
    const total = breakdown.assetTypes.length;
    return { covered, total };
  };

  return (
    <>
      {/* Compact Coverage Bar */}
      <div className="flex items-center gap-6 mb-6">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-neutral-400">Provider Coverage</span>
          <button
            onClick={() => setShowDetailModal(true)}
            className="text-neutral-400 hover:text-primary-400 transition-colors"
            title="View detailed coverage breakdown"
          >
            <FontAwesomeIcon icon={faQuestionCircle} className="text-sm" />
          </button>
        </div>

        {coverage.map((breakdown) => {
          const { covered, total } = getCoverageCount(breakdown);
          const percentage = total > 0 ? (covered / total) * 100 : 0;
          const isComplete = covered === total;
          const hasNone = covered === 0;

          const statusText = isComplete
            ? 'Complete'
            : hasNone
            ? 'No providers configured'
            : 'Partial coverage';

          return (
            <div
              key={breakdown.mediaType}
              className="flex items-center gap-2"
              title={`${breakdown.label}: ${covered} of ${total} asset types covered (${statusText})`}
            >
              <FontAwesomeIcon
                icon={breakdown.icon}
                className={`text-lg ${
                  isComplete
                    ? 'text-green-300'
                    : hasNone
                    ? 'text-neutral-500'
                    : 'text-yellow-300'
                }`}
              />
              <span
                className={`text-sm font-medium ${
                  isComplete
                    ? 'text-green-300'
                    : hasNone
                    ? 'text-neutral-400'
                    : 'text-yellow-300'
                }`}
              >
                {covered}/{total}
              </span>
            </div>
          );
        })}
      </div>

      {/* Detail Modal */}
      {showDetailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowDetailModal(false)}>
          <div className="bg-neutral-800 border border-neutral-700 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-semibold text-white">Provider Coverage Details</h3>
                <button
                  onClick={() => setShowDetailModal(false)}
                  className="text-neutral-400 hover:text-white transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Coverage Breakdown by Media Type */}
              <div className="space-y-6">
                {coverage.map((breakdown) => {
                  const { covered, total } = getCoverageCount(breakdown);

                  return (
                    <div key={breakdown.mediaType} className="card">
                      <div className="card-body">
                        {/* Media Type Header */}
                        <div className="flex items-center gap-3 mb-4">
                          <FontAwesomeIcon icon={breakdown.icon} className="text-primary-500 text-xl" />
                          <h4 className="text-lg font-semibold text-white">{breakdown.label}</h4>
                          <span className="ml-auto text-sm text-neutral-400">
                            {covered} of {total} covered
                          </span>
                        </div>

                        {/* Asset Types */}
                        <div className="space-y-2">
                          {breakdown.assetTypes.map((assetType) => (
                            <div
                              key={assetType.name}
                              className="flex items-center justify-between p-2 rounded bg-neutral-900/50"
                            >
                              <div className="flex items-center gap-2">
                                <FontAwesomeIcon
                                  icon={assetType.covered ? faCheck : faTimes}
                                  className={`text-sm ${
                                    assetType.covered ? 'text-green-300' : 'text-red-400'
                                  }`}
                                />
                                <span className={`text-sm ${assetType.covered ? 'text-neutral-200' : 'text-neutral-400'}`}>
                                  {assetType.displayName}
                                </span>
                                {assetType.covered && (
                                  <span
                                    className="px-2 py-0.5 text-xs font-medium rounded-full bg-primary-500/20 text-primary-300 border border-primary-500/30"
                                  >
                                    {assetType.providers.length}
                                  </span>
                                )}
                              </div>
                              {assetType.covered && (
                                <div className="text-xs text-neutral-300">
                                  {assetType.providers.join(', ')}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>

                        {/* Tips */}
                        {covered < total && (() => {
                          const missingAssets = breakdown.assetTypes.filter(at => !at.covered);
                          const missingNames = missingAssets.map(at => at.displayName.toLowerCase()).join(', ');

                          // Determine which providers to recommend
                          let tip = '';
                          if (breakdown.mediaType === 'movies') {
                            const needsTrailers = missingAssets.some(at => at.name === 'movie_trailer');
                            const needsArtwork = missingAssets.some(at =>
                              ['movie_clearlogo', 'movie_clearart', 'movie_discart'].includes(at.name)
                            );

                            if (needsTrailers && needsArtwork) {
                              tip = 'Enable TMDB for trailers and FanArt.tv for HD artwork (clearlogo, clearart, discart)';
                            } else if (needsTrailers) {
                              tip = 'Enable TMDB to get movie trailers';
                            } else if (needsArtwork) {
                              tip = 'Enable FanArt.tv to get HD artwork (clearlogo, clearart, discart)';
                            } else {
                              tip = 'Enable TMDB and FanArt.tv for complete movie coverage';
                            }
                          } else if (breakdown.mediaType === 'tv') {
                            const needsBanners = missingAssets.some(at => at.name === 'tv_banner');
                            const needsSpecialArt = missingAssets.some(at =>
                              ['tv_clearlogo', 'tv_clearart', 'tv_characterart', 'tv_landscape', 'tv_thumb'].includes(at.name)
                            );

                            if (needsBanners && needsSpecialArt) {
                              tip = 'Enable TVDB for banners and FanArt.tv for HD artwork';
                            } else if (needsBanners) {
                              tip = 'Enable TVDB to get TV show banners';
                            } else if (needsSpecialArt) {
                              tip = 'Enable FanArt.tv to get HD artwork (clearlogo, clearart, characterart, landscape, thumb)';
                            } else {
                              tip = 'Enable TMDB, TVDB, and FanArt.tv for complete TV show coverage';
                            }
                          } else if (breakdown.mediaType === 'music') {
                            if (covered === 0) {
                              tip = 'Enable TheAudioDB to get music artwork and metadata';
                            } else {
                              tip = `Enable TheAudioDB to get missing assets: ${missingNames}`;
                            }
                          }

                          return (
                            <div className="mt-4 p-3 bg-blue-900/20 border border-blue-800 rounded">
                              <p className="text-sm text-blue-300">
                                <FontAwesomeIcon icon={faQuestionCircle} className="mr-2" />
                                <strong>Tip:</strong> {tip}
                              </p>
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Close Button */}
              <div className="mt-6 flex justify-end">
                <button onClick={() => setShowDetailModal(false)} className="btn btn-secondary">
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
