import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCheckCircle, faExclamationTriangle, faInfoCircle } from '@fortawesome/free-solid-svg-icons';
import { ProviderWithMetadata, ProviderConfig } from '../../types/provider';

interface ProviderKeyStatusProps {
  provider: ProviderWithMetadata;
  config: ProviderConfig;
  enabled: boolean;
}

// Helper to get API key URL for each provider
const getApiKeyUrl = (providerName: string): string => {
  const urls: Record<string, string> = {
    tmdb: 'https://www.themoviedb.org/settings/api',
    tvdb: 'https://thetvdb.com/dashboard/account/apikeys',
    fanart_tv: 'https://fanart.tv/get-an-api-key/',
    omdb: 'https://www.omdbapi.com/apikey.aspx',
  };
  return urls[providerName] || '#';
};

export const ProviderKeyStatus: React.FC<ProviderKeyStatusProps> = ({
  provider,
  config,
  enabled,
}) => {
  // Required but missing
  if (provider.metadata.requiresApiKey && !config.apiKey && !config.personalApiKey) {
    return (
      <div className="text-sm text-red-400 flex items-center gap-2">
        <FontAwesomeIcon icon={faExclamationTriangle} />
        <span>API key required - provider disabled</span>
        {provider.metadata.apiKeyBenefit && (
          <a
            href={getApiKeyUrl(provider.metadata.name)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary-500 hover:underline"
          >
            Get API key →
          </a>
        )}
      </div>
    );
  }

  // Using personal key
  if (config.personalApiKey) {
    return (
      <div className="text-sm text-green-500/70 flex items-center gap-2">
        <FontAwesomeIcon icon={faCheckCircle} />
        <span>Personal API key configured</span>
      </div>
    );
  }

  // Using embedded key
  if (config.apiKey && provider.metadata.apiKeyOptional) {
    return (
      <div className="text-sm text-amber-400/70 flex items-center gap-2">
        <FontAwesomeIcon icon={faInfoCircle} />
        <span>Using embedded key</span>
        <span className="text-neutral-500">•</span>
        <a
          href={getApiKeyUrl(provider.metadata.name)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary-500 hover:underline"
        >
          Get personal key →
        </a>
      </div>
    );
  }

  // Disabled
  if (!enabled) {
    return (
      <div className="text-sm text-neutral-500">
        Disabled • Click Enable to configure
      </div>
    );
  }

  // Enabled with API key (normal state)
  if (config.apiKey) {
    return (
      <div className="text-sm text-green-500/70 flex items-center gap-2">
        <FontAwesomeIcon icon={faCheckCircle} />
        <span>API key configured</span>
      </div>
    );
  }

  return null;
};
