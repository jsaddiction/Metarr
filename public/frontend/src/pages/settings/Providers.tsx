import React from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useProviders, useProviderStats } from '../../hooks/useProviders';
import { ProviderCard } from '../../components/provider/ProviderCard';

export const Providers: React.FC = () => {
  const { data: providers = [], isLoading, error } = useProviders();
  const { data: stats } = useProviderStats();

  // Filter out Local provider (it's infrastructure, not user-configurable)
  const configurableProviders = providers.filter(p => p.metadata.name !== 'local');

  return (
    <div className="content-spacing">
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white">Metadata Providers</h1>
        <p className="text-neutral-400 mt-1">
          Configure metadata and asset providers
        </p>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">Loading providers...</p>
        </div>
      )}

      {/* Error State */}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>
            Failed to load providers: {error.message}
          </AlertDescription>
        </Alert>
      )}

      {/* Provider Cards */}
      {!isLoading && !error && (
        <div className="space-y-3">
          {/* All Providers */}
          {configurableProviders.map((provider) => (
            <ProviderCard
              key={provider.metadata.name}
              provider={provider}
              stats={stats?.[provider.metadata.name]}
            />
          ))}

          {/* Empty State */}
          {configurableProviders.length === 0 && (
            <div className="text-center py-12">
              <p className="text-muted-foreground">
                No providers found
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
