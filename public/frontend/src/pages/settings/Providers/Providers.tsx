import React from 'react';
import { PageContainer } from '@/components/ui/PageContainer/PageContainer';
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
    </PageContainer>
  );
};
