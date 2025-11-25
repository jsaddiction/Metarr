import React from 'react';
import { PageContainer } from '@/components/ui/PageContainer';
import { LoadingState } from '@/components/ui/LoadingState/LoadingState';
import { EmptyState } from '@/components/ui/EmptyState/EmptyState';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useProviders, useProviderStats } from '@/hooks/useProviders';
import { ProviderCard } from '@/components/provider/ProviderCard';

export const Providers: React.FC = () => {
  const { data: providers = [], isLoading, error } = useProviders();
  const { data: stats } = useProviderStats();

  // Filter out Local provider (it's infrastructure, not user-configurable)
  const configurableProviders = providers.filter(p => p.metadata.name !== 'local');

  return (
    <PageContainer
      title="Metadata Providers"
      subtitle="Configure metadata and asset providers"
    >
      {/* Loading State */}
      {isLoading && <LoadingState message="Loading providers..." />}

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
            <EmptyState title="No providers found" />
          )}
        </div>
      )}
    </PageContainer>
  );
};
