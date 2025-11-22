import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEye, faEyeSlash } from '@fortawesome/free-solid-svg-icons';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { ProviderWithMetadata, ProviderConfig as ProviderConfigType } from '../../types/provider';

interface ProviderConfigProps {
  provider: ProviderWithMetadata;
  config: ProviderConfigType;
  onChange: (field: string, value: string) => void;
  showPassword: boolean;
  onTogglePassword: () => void;
}

// Common language options
const LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'it', label: 'Italian' },
  { value: 'ja', label: 'Japanese' },
  { value: 'ko', label: 'Korean' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'ru', label: 'Russian' },
  { value: 'zh', label: 'Chinese' },
];

// Common region options
const REGION_OPTIONS = [
  { value: 'US', label: 'United States' },
  { value: 'GB', label: 'United Kingdom' },
  { value: 'CA', label: 'Canada' },
  { value: 'AU', label: 'Australia' },
  { value: 'DE', label: 'Germany' },
  { value: 'FR', label: 'France' },
  { value: 'ES', label: 'Spain' },
  { value: 'IT', label: 'Italy' },
  { value: 'JP', label: 'Japan' },
  { value: 'KR', label: 'South Korea' },
];

export const ProviderConfig: React.FC<ProviderConfigProps> = ({
  provider,
  config,
  onChange,
  showPassword,
  onTogglePassword,
}) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* API Key Field */}
      {provider.metadata.requiresApiKey && (
        <div className="relative">
          <Label htmlFor={`${provider.metadata.name}-api-key`} className="text-sm mb-1.5 block">
            API Key
          </Label>
          <div className="relative">
            <Input
              id={`${provider.metadata.name}-api-key`}
              type={showPassword ? 'text' : 'password'}
              value={config.apiKey || ''}
              onChange={(e) => onChange('apiKey', e.target.value)}
              placeholder="Enter API key"
              className="pr-10"
              aria-label={`${provider.metadata.displayName} API key`}
            />
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-1 top-1 h-7 w-7 p-0 hover:bg-neutral-700"
              onClick={onTogglePassword}
              aria-label={showPassword ? 'Hide API key' : 'Show API key'}
              type="button"
            >
              <FontAwesomeIcon icon={showPassword ? faEyeSlash : faEye} className="text-neutral-400" />
            </Button>
          </div>
        </div>
      )}

      {/* Personal API Key (optional) */}
      {provider.metadata.apiKeyOptional && (
        <div className="relative">
          <Label htmlFor={`${provider.metadata.name}-personal-key`} className="text-sm mb-1.5 block">
            Personal Key <span className="text-neutral-500 font-normal">(optional)</span>
          </Label>
          <div className="relative">
            <Input
              id={`${provider.metadata.name}-personal-key`}
              type={showPassword ? 'text' : 'password'}
              value={config.personalApiKey || ''}
              onChange={(e) => onChange('personalApiKey', e.target.value)}
              placeholder="Optional personal key"
              className="pr-10"
              aria-label={`${provider.metadata.displayName} personal API key`}
            />
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-1 top-1 h-7 w-7 p-0 hover:bg-neutral-700"
              onClick={onTogglePassword}
              aria-label={showPassword ? 'Hide API key' : 'Show API key'}
              type="button"
            >
              <FontAwesomeIcon icon={showPassword ? faEyeSlash : faEye} className="text-neutral-400" />
            </Button>
          </div>
        </div>
      )}

      {/* Language (TMDB, TVDB only) */}
      {(provider.metadata.name === 'tmdb' || provider.metadata.name === 'tvdb') && (
        <div>
          <Label htmlFor={`${provider.metadata.name}-language`} className="text-sm mb-1.5 block">
            Language
          </Label>
          <Select
            value={config.language || 'en'}
            onValueChange={(value) => onChange('language', value)}
          >
            <SelectTrigger id={`${provider.metadata.name}-language`} aria-label="Select language">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGE_OPTIONS.map(option => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Region (TMDB only) */}
      {provider.metadata.name === 'tmdb' && (
        <div>
          <Label htmlFor={`${provider.metadata.name}-region`} className="text-sm mb-1.5 block">
            Region
          </Label>
          <Select
            value={config.region || 'US'}
            onValueChange={(value) => onChange('region', value)}
          >
            <SelectTrigger id={`${provider.metadata.name}-region`} aria-label="Select region">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REGION_OPTIONS.map(option => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
};
