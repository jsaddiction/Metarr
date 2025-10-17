import React, { useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AnimatedTabs, AnimatedTabsContent } from '../../components/ui/AnimatedTabs';
import { useProviders } from '../../hooks/useProviders';
import { ProviderWithMetadata } from '../../types/provider';
import { AddProviderCard } from '../../components/provider/AddProviderCard';
import { ProviderCardCompact } from '../../components/provider/ProviderCardCompact';
import { ProviderConfigModal } from '../../components/provider/ProviderConfigModal';
import { AddProviderModal } from '../../components/provider/AddProviderModal';
import { ProviderCoverageStatus } from '../../components/provider/ProviderCoverageStatus';
import { AssetTypePriorityConfig } from '../../components/provider/AssetTypePriorityConfig';
import { MetadataFieldPriorityConfig } from '../../components/provider/MetadataFieldPriorityConfig';
import { AutoSelectionStrategyToggle } from '../../components/provider/AutoSelectionStrategyToggle';
import { useAutoSelectionStrategy } from '../../hooks/useAutoSelection';

type TabType = 'providers' | 'assets' | 'metadata';

export const Providers: React.FC = () => {
  const { data: providers = [], isLoading, error } = useProviders();
  const { data: strategy } = useAutoSelectionStrategy();
  const [activeTab, setActiveTab] = useState<TabType>('providers');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<ProviderWithMetadata | undefined>();

  // Filter out Local provider (it's infrastructure, not user-configurable)
  const configurableProviders = providers.filter(p => p.metadata.name !== 'local');
  const enabledProviders = configurableProviders.filter(p => p.config.enabled);
  const allProvidersEnabled = configurableProviders.every(p => p.config.enabled);

  const handleAddClick = () => {
    setShowAddModal(true);
  };

  const handleProviderClick = (provider: ProviderWithMetadata) => {
    setSelectedProvider(provider);
    setShowConfigModal(true);
  };

  const handleCloseConfigModal = () => {
    setShowConfigModal(false);
    setSelectedProvider(undefined);
  };

  return (
    <div className="content-spacing">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white">Metadata Providers</h1>
        <p className="text-neutral-400 mt-1">
          Configure metadata and asset providers for enriching your media library
        </p>
      </div>

      <AnimatedTabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as TabType)}
        tabs={[
          { value: 'providers', label: 'Providers' },
          { value: 'assets', label: 'Asset Selection' },
          { value: 'metadata', label: 'Metadata Selection' },
        ]}
        className="mb-6"
      >
        <AnimatedTabsContent value="providers" className="space-y-6">
          {isLoading && (
            <div className="text-center py-12">
              <p className="text-muted-foreground">Loading providers...</p>
            </div>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertDescription>
                Failed to load providers: {error.message}
              </AlertDescription>
            </Alert>
          )}

          {!isLoading && !error && (
            <>
              {/* Coverage Status */}
              <ProviderCoverageStatus providers={enabledProviders} />

              {/* Provider Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <AddProviderCard
                  onClick={handleAddClick}
                  disabled={allProvidersEnabled}
                />
                {enabledProviders.map((provider) => (
                  <ProviderCardCompact
                    key={provider.metadata.name}
                    provider={provider}
                    onClick={() => handleProviderClick(provider)}
                  />
                ))}
              </div>

              {enabledProviders.length === 0 && (
                <div className="text-center py-12">
                  <p className="text-muted-foreground">
                    No providers enabled. Click "Add Provider" to get started.
                  </p>
                </div>
              )}
            </>
          )}
        </AnimatedTabsContent>

        <AnimatedTabsContent value="assets" className="space-y-6">
          <p className="text-sm text-muted-foreground">
            Provider priority for assets (quality trumps priority)
          </p>
          <AutoSelectionStrategyToggle />
          {strategy === 'custom' && <AssetTypePriorityConfig />}
        </AnimatedTabsContent>

        <AnimatedTabsContent value="metadata" className="space-y-6">
          <p className="text-sm text-muted-foreground">
            Provider priority for metadata fields
          </p>
          <AutoSelectionStrategyToggle />
          {strategy === 'custom' && <MetadataFieldPriorityConfig />}
        </AnimatedTabsContent>
      </AnimatedTabs>

      {/* Modals */}
      <AddProviderModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        providers={configurableProviders}
        onSelect={handleProviderClick}
      />

      {selectedProvider && (
        <ProviderConfigModal
          isOpen={showConfigModal}
          onClose={handleCloseConfigModal}
          provider={selectedProvider}
        />
      )}
    </div>
  );
};
