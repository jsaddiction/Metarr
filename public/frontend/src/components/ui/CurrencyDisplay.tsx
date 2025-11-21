import React from 'react';

interface CurrencyDisplayProps {
  label: string;
  value: number | null;
  className?: string;
}

/**
 * Format currency values with commas (US locale)
 */
export const CurrencyDisplay: React.FC<CurrencyDisplayProps> = ({ label, value, className = '' }) => {
  const formatCurrency = (amount: number | null): string => {
    if (!amount || amount === 0) {
      return 'Unknown';
    }

    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className={className}>
      <label className="text-xs font-medium text-neutral-400 mb-1 block">
        {label}
      </label>
      <div className="text-sm text-neutral-300">
        {formatCurrency(value)}
      </div>
    </div>
  );
};
