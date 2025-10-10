import React, { useState } from 'react';
import { useProviders } from '../../hooks/useProviders';
import { ProviderCard } from '../../components/provider/ProviderCard';
import { AssetTypePriorityConfig } from '../../components/provider/AssetTypePriorityConfig';
import { MetadataFieldPriorityConfig } from '../../components/provider/MetadataFieldPriorityConfig';

type TabType = 'providers' | 'assets' | 'metadata';

export const Providers: React.FC = () => {
  const { data: providers = [], isLoading, error } = useProviders();
  const [activeTab, setActiveTab] = useState<TabType>('providers');

  // Filter out Local provider (it's infrastructure, not user-configurable)
  const configurableProviders = providers.filter(p => p.metadata.name !== 'local');

  const tabs: { id: TabType; label: string; description: string }[] = [
    {
      id: 'providers',
      label: 'Providers',
      description: 'Configure metadata and asset providers',
    },
    {
      id: 'assets',
      label: 'Asset Selection',
      description: 'Provider priority for assets (quality trumps priority)',
    },
    {
      id: 'metadata',
      label: 'Metadata Selection',
      description: 'Provider priority for metadata fields',
    },
  ];

  return (
    <div className="content-spacing">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white">Metadata Providers</h1>
        <p className="text-neutral-400 mt-1">
          Configure metadata and asset providers for enriching your media library
        </p>
      </div>

      {/* Tabs */}
      <div className="mb-6">
        <div className="border-b border-neutral-700">
          <nav className="-mb-px flex space-x-8" aria-label="Tabs">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors
                  ${
                    activeTab === tab.id
                      ? 'border-primary-500 text-primary-400'
                      : 'border-transparent text-neutral-400 hover:text-neutral-300 hover:border-neutral-600'
                  }
                `}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
        <p className="text-sm text-neutral-500 mt-2">
          {tabs.find((t) => t.id === activeTab)?.description}
        </p>
      </div>

      {/* Tab Content */}
      {activeTab === 'providers' && (
        <>
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
              {configurableProviders.map((provider) => (
                <ProviderCard key={provider.metadata.name} provider={provider} />
              ))}
            </div>
          )}

          {!isLoading && !error && configurableProviders.length === 0 && (
            <div className="text-center py-12">
              <p className="text-neutral-400">No providers configured</p>
            </div>
          )}
        </>
      )}

      {activeTab === 'assets' && <AssetTypePriorityConfig />}

      {activeTab === 'metadata' && <MetadataFieldPriorityConfig />}
    </div>
  );
};