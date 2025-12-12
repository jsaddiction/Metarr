/**
 * Trailer Error Utilities
 *
 * Provides user-friendly messages and tooltips for trailer failure reasons.
 * Maps database failure_reason values to human-readable text.
 */

/**
 * Trailer failure reasons from the database
 */
export type TrailerFailureReason =
  | 'age_restricted'
  | 'unavailable'
  | 'geo_blocked'
  | 'rate_limited'
  | 'download_error'
  | null;

/**
 * Failure information with display text and retry status
 */
export interface FailureInfo {
  /** Short label for badges/tags */
  label: string;
  /** Detailed tooltip message */
  tooltip: string;
  /** Whether the user can manually retry */
  canRetry: boolean;
  /** Condition under which automatic retry occurs */
  retryCondition: string | null;
  /** CSS class for styling (error, warning, info) */
  severity: 'error' | 'warning' | 'info';
}

/**
 * Get failure information for a trailer failure reason
 *
 * @param reason - The failure_reason value from the database
 * @returns FailureInfo object with display text and metadata
 */
export function getFailureInfo(reason: TrailerFailureReason): FailureInfo {
  switch (reason) {
    case 'age_restricted':
      return {
        label: 'Age Restricted',
        tooltip:
          'This video requires YouTube sign-in to verify age. Configure YouTube cookies in Settings → Trailers to enable download.',
        canRetry: true,
        retryCondition: 'Will automatically retry when YouTube cookies are configured',
        severity: 'warning',
      };

    case 'unavailable':
      return {
        label: 'Unavailable',
        tooltip:
          'This video has been removed, made private, or deleted by the uploader. It cannot be downloaded.',
        canRetry: false,
        retryCondition: null,
        severity: 'error',
      };

    case 'geo_blocked':
      return {
        label: 'Region Blocked',
        tooltip:
          'This video is not available in your region due to geographic restrictions. It cannot be downloaded from your location.',
        canRetry: false,
        retryCondition: null,
        severity: 'error',
      };

    case 'rate_limited':
      return {
        label: 'Rate Limited',
        tooltip:
          'Too many requests to the video provider. The download will automatically retry after a cooldown period.',
        canRetry: true,
        retryCondition: 'Will automatically retry after 1 hour cooldown',
        severity: 'info',
      };

    case 'download_error':
      return {
        label: 'Download Failed',
        tooltip:
          'The download failed due to an unknown error. Click retry to attempt the download again.',
        canRetry: true,
        retryCondition: 'Manual retry only - click the retry button',
        severity: 'warning',
      };

    default:
      return {
        label: 'Failed',
        tooltip: 'An unknown error occurred during download.',
        canRetry: true,
        retryCondition: null,
        severity: 'warning',
      };
  }
}

/**
 * Get a short user-friendly message for a failure reason
 *
 * @param reason - The failure_reason value from the database
 * @returns Short message suitable for inline display
 */
export function getFailureMessage(reason: TrailerFailureReason): string {
  const info = getFailureInfo(reason);
  return info.label;
}

/**
 * Get the tooltip text for a failure reason
 *
 * @param reason - The failure_reason value from the database
 * @returns Detailed tooltip text
 */
export function getFailureTooltip(reason: TrailerFailureReason): string {
  const info = getFailureInfo(reason);
  return info.tooltip;
}

/**
 * Check if a failure reason allows manual retry
 *
 * @param reason - The failure_reason value from the database
 * @returns True if user can manually retry
 */
export function canRetryDownload(reason: TrailerFailureReason): boolean {
  const info = getFailureInfo(reason);
  return info.canRetry;
}

/**
 * Check if a failure is permanent (cannot be resolved)
 *
 * @param reason - The failure_reason value from the database
 * @returns True if the failure is permanent
 */
export function isPermanentFailure(reason: TrailerFailureReason): boolean {
  return reason === 'unavailable' || reason === 'geo_blocked';
}

/**
 * Get CSS class suffix based on failure severity
 *
 * @param reason - The failure_reason value from the database
 * @returns CSS class suffix ('error', 'warning', 'info')
 */
export function getFailureSeverity(
  reason: TrailerFailureReason
): 'error' | 'warning' | 'info' {
  const info = getFailureInfo(reason);
  return info.severity;
}
