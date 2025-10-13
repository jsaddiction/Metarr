import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFilm, faTv, faMusic, faKey, faCheckCircle } from '@fortawesome/free-solid-svg-icons';
import { ProviderWithMetadata } from '../../types/provider';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface AddProviderModalProps {
  isOpen: boolean;
  onClose: () => void;
  providers: ProviderWithMetadata[];
  onSelect: (provider: ProviderWithMetadata) => void;
}

export const AddProviderModal: React.FC<AddProviderModalProps> = ({
  isOpen,
  onClose,
  providers,
  onSelect,
}) => {
  // Filter to only show disabled providers
  const disabledProviders = providers.filter(p => !p.config.enabled);

  // Handle "all providers enabled" state
  if (disabledProviders.length === 0) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>All Providers Enabled</DialogTitle>
            <DialogDescription>
              You have enabled all available metadata providers. Great job!
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {/* No additional content needed for this simple dialog */}
          </div>
          <DialogFooter>
            <Button onClick={onClose}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  const getMediaTypeIcons = (metadata: any) => {
    const icons = [];
    const supportsMovies = metadata.supportedAssetTypes.some(
      (at: any) => at.available && at.type.startsWith('movie_')
    );
    const supportsTv = metadata.supportedAssetTypes.some(
      (at: any) => at.available && at.type.startsWith('tv_')
    );
    const supportsMusic = metadata.supportedAssetTypes.some(
      (at: any) => at.available && (at.type.startsWith('artist_') || at.type.startsWith('album_'))
    );

    if (supportsMovies) icons.push({ icon: faFilm, label: 'Movies' });
    if (supportsTv) icons.push({ icon: faTv, label: 'TV' });
    if (supportsMusic) icons.push({ icon: faMusic, label: 'Music' });

    return icons;
  };

  const getTopCapabilities = (metadata: any) => {
    return metadata.supportedAssetTypes
      .filter((at: any) => at.available)
      .map((at: any) => at.displayName)
      .filter((value: string, index: number, self: string[]) => self.indexOf(value) === index)
      .slice(0, 3);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add Provider</DialogTitle>
          <DialogDescription>
            Select a provider to configure and enable
          </DialogDescription>
        </DialogHeader>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {/* Available Providers */}
          <div className="space-y-3">
          {disabledProviders.map((provider) => {
            const mediaTypeIcons = getMediaTypeIcons(provider.metadata);
            const capabilities = getTopCapabilities(provider.metadata);
            const requiresApiKey = provider.metadata.requiresApiKey && !provider.metadata.apiKeyOptional;
            const requiresSubscription = provider.metadata.name === 'tvdb'; // TVDB requires paid subscription

            return (
              <div
                key={provider.metadata.name}
                className="card cursor-pointer hover:border-primary-500 transition-all duration-200 w-full"
                onClick={() => {
                  onSelect(provider);
                  onClose();
                }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelect(provider);
                    onClose();
                  }
                }}
              >
                <div className="card-body">
                  <div className="flex items-start justify-between">
                    {/* Left side: Provider info */}
                    <div className="flex-1">
                      <h4 className="text-base font-semibold text-white mb-1">
                        {provider.metadata.displayName}
                      </h4>
                      <p className="text-sm text-neutral-400 mb-3">
                        {provider.metadata.baseUrl}
                      </p>

                      {/* Media Types */}
                      <div className="flex gap-3 mb-2">
                        {mediaTypeIcons.map((item, idx) => (
                          <div key={idx} className="flex items-center gap-1 text-xs text-neutral-300">
                            <FontAwesomeIcon icon={item.icon} className="text-primary-500" aria-hidden="true" />
                            <span>{item.label}</span>
                          </div>
                        ))}
                      </div>

                      {/* Capabilities */}
                      <p className="text-xs text-neutral-400 mb-1">Provides:</p>
                      <p className="text-xs text-neutral-300">
                        {capabilities.join(', ')}
                        {provider.metadata.supportedAssetTypes.filter((at: any) => at.available).length > capabilities.length && (
                          <span className="text-neutral-500">
                            {' '}...and {provider.metadata.supportedAssetTypes.filter((at: any) => at.available).length - capabilities.length} more
                          </span>
                        )}
                      </p>

                      {/* Requirements */}
                      <div className="mt-3 flex flex-wrap gap-2">
                        {requiresApiKey && (
                          <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-yellow-900/20 text-yellow-400 border border-yellow-800">
                            <FontAwesomeIcon icon={faKey} className="mr-1" aria-hidden="true" />
                            Requires API key
                          </span>
                        )}
                        {!requiresApiKey && (
                          <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-green-900/20 text-green-400 border border-green-800">
                            <FontAwesomeIcon icon={faCheckCircle} className="mr-1" aria-hidden="true" />
                            Free, no key needed
                          </span>
                        )}
                        {requiresSubscription && (
                          <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-red-900/20 text-red-400 border border-red-800">
                            Requires subscription ($12/year)
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Right side: Configure text */}
                    <span className="ml-4 px-4 py-2 bg-primary text-primary-foreground rounded-md font-medium text-sm" aria-hidden="true">
                      Configure
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
          </div>
        </div>

        {/* Footer with Cancel Button */}
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
