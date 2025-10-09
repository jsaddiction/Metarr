import React from 'react';
import { useProviders } from '../../hooks/useProviders';
import { ProviderCard } from '../../components/provider/ProviderCard';

export const Providers: React.FC = () => {
  const { data: providers = [], isLoading, error } = useProviders();

  return (
    <div className="content-spacing">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white">Metadata Providers</h1>
        <p className="text-neutral-400 mt-1">
          Configure metadata and asset providers for enriching your media library
        </p>
      </div>

      {isLoading && (
        <div className="text-center py-12">
          <p className="text-neutral-400">Loading providers...</p>
        </div>
      )}

      {error && (
        <div className="card border-red-800 bg-red-900/20">
          <div className="card-body">
            <p className="text-red-400">Failed to load providers: {error.message}</p>
          </div>
        </div>
      )}

      {!isLoading && !error && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {providers.map((provider) => (
            <ProviderCard key={provider.metadata.name} provider={provider} />
          ))}
        </div>
      )}

      {!isLoading && !error && providers.length === 0 && (
        <div className="text-center py-12">
          <p className="text-neutral-400">No providers configured</p>
        </div>
      )}
    </div>
  );
};