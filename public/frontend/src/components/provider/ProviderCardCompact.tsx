import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFilm, faTv, faMusic, faCheck, faExclamationTriangle, faGlobe } from '@fortawesome/free-solid-svg-icons';
import { ProviderWithMetadata } from '../../types/provider';

interface ProviderCardCompactProps {
  provider: ProviderWithMetadata;
  onClick: () => void;
}

export const ProviderCardCompact: React.FC<ProviderCardCompactProps> = ({ provider, onClick }) => {
  const { config, metadata } = provider;

  // Determine which media types this provider supports
  const supportsMovies = metadata.supportedAssetTypes.some(
    at => at.available && at.type.startsWith('movie_')
  );
  const supportsTv = metadata.supportedAssetTypes.some(
    at => at.available && at.type.startsWith('tv_')
  );
  const supportsMusic = metadata.supportedAssetTypes.some(
    at => at.available && (at.type.startsWith('artist_') || at.type.startsWith('album_'))
  );

  // Get top capabilities (first 3 unique asset type display names)
  const capabilities = metadata.supportedAssetTypes
    .filter(at => at.available)
    .map(at => at.displayName)
    .filter((value, index, self) => self.indexOf(value) === index)
    .slice(0, 3);

  const moreCount = Math.max(
    0,
    metadata.supportedAssetTypes.filter(at => at.available).length - capabilities.length
  );

  // Determine warning status
  const hasWarning =
    (metadata.name === 'tmdb' && !config.personalApiKey) || // TMDB without personal key
    (metadata.name === 'fanart_tv' && !config.personalApiKey) || // FanArt without personal key
    config.lastTestStatus === 'error'; // Failed connection test

  const warningMessage =
    config.lastTestStatus === 'error'
      ? 'Connection failed'
      : metadata.name === 'tmdb' || metadata.name === 'fanart_tv'
      ? 'Using shared key'
      : undefined;

  return (
    <Card
      onClick={onClick}
      className="cursor-pointer hover:outline hover:outline-2 hover:outline-primary hover:border-primary hover:bg-primary/5 transition-all duration-200 min-h-[200px] flex flex-col"
    >
      <CardContent className="flex flex-col flex-1 p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <FontAwesomeIcon icon={faGlobe} className="text-primary text-xl" />
            <div>
              <h3 className="text-base font-semibold">{metadata.displayName}</h3>
            </div>
          </div>
        </div>

        {/* Media Types */}
        <div className="flex gap-3 mb-3">
          {supportsMovies && (
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <FontAwesomeIcon icon={faFilm} className="text-primary" />
              <span>Movies</span>
            </div>
          )}
          {supportsTv && (
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <FontAwesomeIcon icon={faTv} className="text-primary" />
              <span>TV</span>
            </div>
          )}
          {supportsMusic && (
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <FontAwesomeIcon icon={faMusic} className="text-primary" />
              <span>Music</span>
            </div>
          )}
        </div>

        {/* Capabilities */}
        <div className="flex-1 mb-3">
          <p className="text-xs text-muted-foreground mb-1">Provides:</p>
          <ul className="text-xs space-y-0.5">
            {capabilities.map((cap, idx) => (
              <li key={idx}>• {cap}</li>
            ))}
            {moreCount > 0 && (
              <li className="text-muted-foreground">...and {moreCount} more</li>
            )}
          </ul>
        </div>

        {/* Warning Badge */}
        {config.enabled && hasWarning && warningMessage && (
          <div className="mt-auto">
            <Badge variant="outline" className="bg-yellow-900/20 text-yellow-400 border-yellow-800">
              <FontAwesomeIcon icon={faExclamationTriangle} className="mr-1 text-xs" />
              {warningMessage}
            </Badge>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
