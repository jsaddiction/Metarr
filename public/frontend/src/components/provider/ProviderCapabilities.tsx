import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCircleQuestion } from '@fortawesome/free-solid-svg-icons';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { ProviderWithMetadata } from '../../types/provider';

interface ProviderCapabilitiesProps {
  provider: ProviderWithMetadata;
}

export const ProviderCapabilities: React.FC<ProviderCapabilitiesProps> = ({
  provider,
}) => {
  // Extract media types from supported asset types
  const getMediaTypes = () => {
    const types = new Set<string>();

    provider.metadata.supportedAssetTypes.forEach(assetType => {
      if (assetType.type.startsWith('movie_')) {
        types.add('Movies');
      } else if (assetType.type.startsWith('tv_')) {
        types.add('TV Shows');
      } else if (assetType.type.startsWith('music_') || assetType.type.startsWith('artist_') || assetType.type.startsWith('album_')) {
        types.add('Music');
      }
    });

    return Array.from(types);
  };

  const mediaTypes = getMediaTypes();

  return (
    <div className="flex items-center gap-2 text-sm text-neutral-400">
      <span>{mediaTypes.join(' • ')}</span>

      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 hover:text-neutral-200"
              aria-label={`View ${provider.metadata.displayName} capabilities`}
            >
              <FontAwesomeIcon icon={faCircleQuestion} />
            </Button>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <div className="space-y-2">
              <div className="font-semibold text-white">Supported Asset Types:</div>
              <div className="space-y-1">
                {provider.metadata.supportedAssetTypes
                  .filter(type => type.available)
                  .map((type) => (
                    <div key={type.type} className="text-xs">
                      • {type.displayName}
                    </div>
                  ))}
              </div>
              {provider.metadata.rateLimit && (
                <div className="text-xs pt-2 border-t border-neutral-600">
                  Rate Limit: {provider.metadata.rateLimit.requests} req/{provider.metadata.rateLimit.windowSeconds}s
                </div>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
};
