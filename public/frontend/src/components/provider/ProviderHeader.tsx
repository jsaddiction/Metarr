import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCheckCircle, faTimesCircle } from '@fortawesome/free-solid-svg-icons';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { ProviderWithMetadata } from '../../types/provider';

interface ProviderHeaderProps {
  provider: ProviderWithMetadata;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  testResult: { success: boolean; message: string } | null;
  onTest: () => void;
  isTestLoading: boolean;
}

export const ProviderHeader: React.FC<ProviderHeaderProps> = ({
  provider,
  enabled,
  onToggle,
  testResult,
  onTest,
  isTestLoading,
}) => {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <h3 className="text-lg font-semibold text-white">
          {provider.metadata.displayName}
        </h3>
        <Switch
          checked={enabled}
          onCheckedChange={onToggle}
          aria-label={`Toggle ${provider.metadata.displayName}`}
        />
      </div>

      <div className="flex items-center gap-2">
        {/* Test Result Icon */}
        {testResult && (
          <FontAwesomeIcon
            icon={testResult.success ? faCheckCircle : faTimesCircle}
            className={testResult.success ? 'text-green-500' : 'text-red-500'}
            title={testResult.message}
            aria-label={testResult.success ? 'Connection successful' : 'Connection failed'}
          />
        )}

        {/* Test Button (enabled providers) */}
        {enabled && (
          <Button
            variant="secondary"
            size="sm"
            onClick={onTest}
            disabled={isTestLoading}
            aria-label={`Test ${provider.metadata.displayName} connection`}
          >
            {isTestLoading ? 'Testing...' : 'Test'}
          </Button>
        )}

        {/* Enable Button (disabled providers) */}
        {!enabled && (
          <Button
            variant="default"
            size="sm"
            onClick={() => onToggle(true)}
            aria-label={`Enable ${provider.metadata.displayName}`}
          >
            Enable
          </Button>
        )}
      </div>
    </div>
  );
};
