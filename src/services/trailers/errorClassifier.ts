/**
 * Trailer Error Classifier
 *
 * Classifies yt-dlp errors into specific failure reasons for accurate
 * UI display and retry logic. Uses a strong/weak/context pattern for
 * resilient but accurate error detection.
 *
 * Pattern Explanation:
 * - STRONG: Any single match is sufficient for classification
 * - WEAK: Need 2+ matches OR 1 weak match + context match
 * - CONTEXT: Strengthens weak matches (e.g., "youtube", "video")
 *
 * Failure Reasons:
 * - age_restricted: Video requires YouTube sign-in to verify age
 * - unavailable: Video is private, deleted, or doesn't exist
 * - geo_blocked: Video not available in the user's region
 * - rate_limited: Too many requests, temporary throttling
 * - download_error: Catch-all for unknown/transient errors
 *
 * Retry Behavior:
 * - unavailable: Never retry (permanent)
 * - age_restricted: Only retry when cookies become available
 * - geo_blocked: Never retry (permanent without VPN/proxy)
 * - rate_limited: Retry after delay (transient)
 * - download_error: User-initiated retry only (unknown cause)
 */

import { logger } from '../../middleware/logging.js';

/**
 * Failure reasons for trailer downloads
 * These map to the failure_reason column in trailer_candidates
 */
export type TrailerFailureReason =
  | 'age_restricted'
  | 'unavailable'
  | 'geo_blocked'
  | 'rate_limited'
  | 'download_error';

/**
 * Classification result with confidence and details
 */
export interface ClassificationResult {
  reason: TrailerFailureReason;
  confidence: 'high' | 'medium' | 'low';
  matchedPatterns: string[];
  userMessage: string;
  isRetryable: boolean;
  retryCondition: string | null;
}

// ============================================================================
// AGE RESTRICTED PATTERNS
// ============================================================================

/** Strong indicators - any single match confirms age_restricted */
const AGE_RESTRICTED_STRONG = [
  'Sign in to confirm your age',
  'age-restricted',
  'confirm your age',
  'age gate',
  'age verification required',
  'login required to view',
];

/** Weak indicators - need 2+ matches OR 1 weak + context */
const AGE_RESTRICTED_WEAK = [
  'inappropriate for some users',
  'age verification',
  'mature audience',
  'sign in to view',
  'login to continue',
  'viewer discretion',
  'restricted content',
];

/** Context that strengthens weak matches */
const AGE_RESTRICTED_CONTEXT = ['youtube', 'video', 'content'];

// ============================================================================
// UNAVAILABLE PATTERNS
// ============================================================================

/** Strong indicators - any single match confirms unavailable */
const UNAVAILABLE_STRONG = [
  'Video unavailable',
  'This video is private',
  'This video has been removed',
  'video is no longer available',
  'This video does not exist',
  'Video is unavailable',
  'has been terminated',
  'account associated with this video',
  'removed by the uploader',
  'copyright claim',
  'violates YouTube',
  'community guidelines',
];

/** Weak indicators for unavailable */
const UNAVAILABLE_WEAK = [
  'not available',
  'no longer exists',
  'removed',
  'deleted',
  'terminated',
  'taken down',
];

/** Context for unavailable */
const UNAVAILABLE_CONTEXT = ['video', 'channel', 'account', 'youtube'];

// ============================================================================
// GEO BLOCKED PATTERNS
// ============================================================================

/** Strong indicators - any single match confirms geo_blocked */
const GEO_BLOCKED_STRONG = [
  'not available in your country',
  'blocked in your country',
  'geo-restricted',
  'geographically restricted',
  'not available in your region',
  'blocked in your region',
  'content is not available in your location',
];

/** Weak indicators for geo_blocked */
const GEO_BLOCKED_WEAK = [
  'country',
  'region',
  'location',
  'geographic',
  'territory',
  'blocked',
];

/** Context for geo_blocked */
const GEO_BLOCKED_CONTEXT = ['available', 'restricted', 'not'];

// ============================================================================
// RATE LIMITED PATTERNS
// ============================================================================

/** Strong indicators - any single match confirms rate_limited */
const RATE_LIMITED_STRONG = [
  'HTTP Error 429',
  'Too Many Requests',
  'rate limit',
  'rate-limited',
  'HTTP Error 403: Forbidden',
  'Please try again later',
  'Request blocked',
];

/** Weak indicators for rate_limited */
const RATE_LIMITED_WEAK = ['429', '403', 'throttled', 'slow down', 'try again'];

/** Context for rate_limited */
const RATE_LIMITED_CONTEXT = ['error', 'http', 'request'];

// ============================================================================
// CLASSIFICATION LOGIC
// ============================================================================

/**
 * Count pattern matches in error message (case-insensitive)
 */
function countMatches(message: string, patterns: string[]): string[] {
  const lower = message.toLowerCase();
  return patterns.filter((pattern) => lower.includes(pattern.toLowerCase()));
}

/**
 * Check if message matches strong pattern
 */
function hasStrongMatch(message: string, patterns: string[]): string[] {
  return countMatches(message, patterns);
}

/**
 * Check weak match with optional context requirement
 */
function hasWeakMatch(
  message: string,
  weakPatterns: string[],
  contextPatterns: string[]
): { matches: string[]; hasContext: boolean } {
  const weakMatches = countMatches(message, weakPatterns);
  const contextMatches = countMatches(message, contextPatterns);
  return {
    matches: weakMatches,
    hasContext: contextMatches.length > 0,
  };
}

/**
 * Classify an error message into a failure reason
 *
 * @param errorMessage - The error message from yt-dlp or download attempt
 * @returns Classification result with reason, confidence, and retry info
 */
export function classifyError(errorMessage: string): ClassificationResult {
  const msg = errorMessage || '';

  // Check each failure type in priority order

  // 1. Rate Limited (check first - transient and actionable)
  const rateLimitedStrong = hasStrongMatch(msg, RATE_LIMITED_STRONG);
  if (rateLimitedStrong.length > 0) {
    return {
      reason: 'rate_limited',
      confidence: 'high',
      matchedPatterns: rateLimitedStrong,
      userMessage: 'Rate limited by provider. Will retry automatically after cooldown.',
      isRetryable: true,
      retryCondition: 'Automatic retry after 1 hour cooldown',
    };
  }

  const rateLimitedWeak = hasWeakMatch(msg, RATE_LIMITED_WEAK, RATE_LIMITED_CONTEXT);
  if (rateLimitedWeak.matches.length >= 2 || (rateLimitedWeak.matches.length >= 1 && rateLimitedWeak.hasContext)) {
    return {
      reason: 'rate_limited',
      confidence: 'medium',
      matchedPatterns: rateLimitedWeak.matches,
      userMessage: 'Likely rate limited by provider. Will retry after cooldown.',
      isRetryable: true,
      retryCondition: 'Automatic retry after 1 hour cooldown',
    };
  }

  // 2. Age Restricted
  const ageRestrictedStrong = hasStrongMatch(msg, AGE_RESTRICTED_STRONG);
  if (ageRestrictedStrong.length > 0) {
    return {
      reason: 'age_restricted',
      confidence: 'high',
      matchedPatterns: ageRestrictedStrong,
      userMessage: 'Age-restricted content. Configure YouTube cookies to enable download.',
      isRetryable: true,
      retryCondition: 'Will retry when YouTube cookies are configured',
    };
  }

  const ageRestrictedWeak = hasWeakMatch(msg, AGE_RESTRICTED_WEAK, AGE_RESTRICTED_CONTEXT);
  if (ageRestrictedWeak.matches.length >= 2 || (ageRestrictedWeak.matches.length >= 1 && ageRestrictedWeak.hasContext)) {
    return {
      reason: 'age_restricted',
      confidence: 'medium',
      matchedPatterns: ageRestrictedWeak.matches,
      userMessage: 'Likely age-restricted. Configure YouTube cookies to enable download.',
      isRetryable: true,
      retryCondition: 'Will retry when YouTube cookies are configured',
    };
  }

  // 3. Geo Blocked
  const geoBlockedStrong = hasStrongMatch(msg, GEO_BLOCKED_STRONG);
  if (geoBlockedStrong.length > 0) {
    return {
      reason: 'geo_blocked',
      confidence: 'high',
      matchedPatterns: geoBlockedStrong,
      userMessage: 'Video not available in your region.',
      isRetryable: false,
      retryCondition: null,
    };
  }

  const geoBlockedWeak = hasWeakMatch(msg, GEO_BLOCKED_WEAK, GEO_BLOCKED_CONTEXT);
  if (geoBlockedWeak.matches.length >= 2 || (geoBlockedWeak.matches.length >= 1 && geoBlockedWeak.hasContext)) {
    return {
      reason: 'geo_blocked',
      confidence: 'medium',
      matchedPatterns: geoBlockedWeak.matches,
      userMessage: 'Video may be geo-restricted in your region.',
      isRetryable: false,
      retryCondition: null,
    };
  }

  // 4. Unavailable
  const unavailableStrong = hasStrongMatch(msg, UNAVAILABLE_STRONG);
  if (unavailableStrong.length > 0) {
    return {
      reason: 'unavailable',
      confidence: 'high',
      matchedPatterns: unavailableStrong,
      userMessage: 'Video is unavailable (removed, private, or deleted).',
      isRetryable: false,
      retryCondition: null,
    };
  }

  const unavailableWeak = hasWeakMatch(msg, UNAVAILABLE_WEAK, UNAVAILABLE_CONTEXT);
  if (unavailableWeak.matches.length >= 2 || (unavailableWeak.matches.length >= 1 && unavailableWeak.hasContext)) {
    return {
      reason: 'unavailable',
      confidence: 'medium',
      matchedPatterns: unavailableWeak.matches,
      userMessage: 'Video may be unavailable.',
      isRetryable: false,
      retryCondition: null,
    };
  }

  // 5. Fallback: download_error (unknown/transient)
  logger.debug('[ErrorClassifier] Unknown error type, classifying as download_error', {
    errorMessage: msg.substring(0, 200),
  });

  return {
    reason: 'download_error',
    confidence: 'low',
    matchedPatterns: [],
    userMessage: 'Download failed. Click to retry.',
    isRetryable: true,
    retryCondition: 'User-initiated retry only',
  };
}

/**
 * Get user-friendly tooltip message for a failure reason
 *
 * @param reason - The failure reason from database
 * @returns User-friendly message for UI tooltip
 */
export function getFailureTooltip(reason: TrailerFailureReason | string | null): string {
  switch (reason) {
    case 'age_restricted':
      return 'Age-restricted content. Configure YouTube cookies in Settings to enable download.';
    case 'unavailable':
      return 'Video is unavailable (removed, private, or deleted by uploader).';
    case 'geo_blocked':
      return 'Video is not available in your region due to geographic restrictions.';
    case 'rate_limited':
      return 'Temporarily rate limited. Will automatically retry after cooldown period.';
    case 'download_error':
      return 'Download failed due to an unknown error. Click to retry manually.';
    default:
      return 'Unknown error occurred.';
  }
}

/**
 * Check if a failure reason should prevent automatic retry
 *
 * @param reason - The failure reason
 * @param hasCookies - Whether YouTube cookies are configured
 * @returns True if automatic retry is blocked
 */
export function isRetryBlocked(
  reason: TrailerFailureReason | string | null,
  hasCookies: boolean = false
): boolean {
  switch (reason) {
    case 'unavailable':
      return true; // Never retry - permanent
    case 'geo_blocked':
      return true; // Never retry - permanent (without VPN)
    case 'age_restricted':
      return !hasCookies; // Only retry if cookies available
    case 'rate_limited':
      return false; // Always allow retry (with delay)
    case 'download_error':
      return true; // User-initiated retry only (unknown cause)
    default:
      return false;
  }
}

/**
 * Get retry delay in milliseconds for a failure reason
 *
 * @param reason - The failure reason
 * @returns Delay in ms, or null if no automatic retry
 */
export function getRetryDelay(reason: TrailerFailureReason | string | null): number | null {
  switch (reason) {
    case 'rate_limited':
      return 60 * 60 * 1000; // 1 hour
    default:
      return null; // No automatic retry
  }
}
