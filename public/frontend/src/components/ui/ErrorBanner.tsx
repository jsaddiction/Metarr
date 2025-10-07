import React, { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTimes, faExclamationCircle, faWifi } from '@fortawesome/free-solid-svg-icons';

interface ErrorBannerProps {
  error: string | null;
  type?: 'error' | 'warning' | 'connection';
  onDismiss?: () => void;
  autoDismiss?: boolean;
  dismissTimeout?: number;
}

export const ErrorBanner: React.FC<ErrorBannerProps> = ({
  error,
  type = 'error',
  onDismiss,
  autoDismiss = false,
  dismissTimeout = 5000,
}) => {
  const [isDismissed, setIsDismissed] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (error && !isDismissed) {
      setIsVisible(true);

      if (autoDismiss && type !== 'connection') {
        const timer = setTimeout(() => {
          handleDismiss();
        }, dismissTimeout);

        return () => clearTimeout(timer);
      }
    } else {
      setIsVisible(false);
    }
  }, [error, isDismissed, autoDismiss, type, dismissTimeout]);

  // Reset dismissed state when error changes
  useEffect(() => {
    if (error) {
      setIsDismissed(false);
    }
  }, [error]);

  const handleDismiss = () => {
    setIsDismissed(true);
    setIsVisible(false);
    onDismiss?.();
  };

  const getTypeConfig = () => {
    switch (type) {
      case 'connection':
        return {
          bgColor: 'bg-red-900',
          borderColor: 'border-red-600',
          icon: faWifi,
          iconColor: 'text-red-400',
          textColor: 'text-red-100',
        };
      case 'warning':
        return {
          bgColor: 'bg-yellow-900',
          borderColor: 'border-yellow-600',
          icon: faExclamationCircle,
          iconColor: 'text-yellow-400',
          textColor: 'text-yellow-100',
        };
      case 'error':
      default:
        return {
          bgColor: 'bg-red-900',
          borderColor: 'border-red-600',
          icon: faExclamationCircle,
          iconColor: 'text-red-400',
          textColor: 'text-red-100',
        };
    }
  };

  if (!error) return null;

  const config = getTypeConfig();

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 z-50 transition-all duration-500 ease-in-out ${
        isVisible ? 'max-h-32 opacity-100' : 'max-h-0 opacity-0'
      } overflow-hidden`}
    >
      <div
        className={`${config.bgColor} ${config.borderColor} border-t-4`}
      >
        <div className="px-6 py-3">
          <div className="flex items-center justify-between gap-4">
            <FontAwesomeIcon icon={config.icon} className={`${config.iconColor} flex-shrink-0 text-lg`} />
            <p className={`${config.textColor} text-sm font-semibold flex-1 text-center`}>
              {error}
            </p>
            <button
              onClick={handleDismiss}
              className={`${config.textColor} hover:opacity-80 transition-opacity flex-shrink-0 p-1.5 hover:bg-white/10`}
              aria-label="Dismiss"
            >
              <FontAwesomeIcon icon={faTimes} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
