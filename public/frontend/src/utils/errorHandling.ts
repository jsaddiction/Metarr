/**
 * Error handling utilities for consistent error management across the application
 */

import { toast } from 'sonner';

/**
 * Extract error message from various error formats
 * Handles Error objects, string errors, and API error responses
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  if (error && typeof error === 'object' && 'message' in error) {
    return String(error.message);
  }

  return 'An unknown error occurred';
}

/**
 * Parse API error response from fetch Response object
 * Attempts to extract error message from JSON body, falls back to statusText
 */
export async function parseApiError(response: Response): Promise<string> {
  try {
    const data = await response.json();
    return data.message || data.error || `Request failed: ${response.statusText}`;
  } catch {
    return `Request failed: ${response.statusText}`;
  }
}

/**
 * Show error toast with consistent formatting
 * Optionally provide context for more specific error messages
 *
 * @param error - The error to display
 * @param context - Optional context string (e.g., "Loading movies")
 */
export function showErrorToast(error: unknown, context?: string) {
  const message = getErrorMessage(error);
  const title = context ? `${context} failed` : 'Error';
  toast.error(title, {
    description: message,
  });
}

/**
 * Show success toast with consistent formatting
 *
 * @param title - Success message title
 * @param description - Optional description
 */
export function showSuccessToast(title: string, description?: string) {
  toast.success(title, {
    description,
  });
}

/**
 * Network error detection
 * Useful for determining if error is due to connectivity issues
 */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof Error) {
    return (
      error.message.includes('fetch') ||
      error.message.includes('network') ||
      error.message.includes('Failed to fetch') ||
      error.message.includes('NetworkError')
    );
  }
  return false;
}

/**
 * Check if error is a timeout error
 */
export function isTimeoutError(error: unknown): boolean {
  if (error instanceof Error) {
    return (
      error.message.includes('timeout') ||
      error.message.includes('timed out') ||
      error.name === 'TimeoutError'
    );
  }
  return false;
}

/**
 * Check if error is an authentication error
 */
export function isAuthError(error: unknown): boolean {
  if (error instanceof Error) {
    return (
      error.message.includes('401') ||
      error.message.includes('403') ||
      error.message.includes('Unauthorized') ||
      error.message.includes('Forbidden')
    );
  }
  return false;
}

/**
 * Format error for logging
 * Includes stack trace if available in development
 */
export function formatErrorForLogging(error: unknown): string {
  if (error instanceof Error) {
    if (import.meta.env.DEV && error.stack) {
      return `${error.message}\n${error.stack}`;
    }
    return error.message;
  }
  return String(error);
}
