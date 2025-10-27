import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faExclamationTriangle, faHome, faRotateRight } from '@fortawesome/free-solid-svg-icons';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  routeName?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * Route-level Error Boundary
 *
 * BENEFITS:
 * - Isolates errors to specific routes instead of crashing entire app
 * - Provides user-friendly error messages
 * - Allows recovery without full page reload
 * - Logs detailed error info for debugging
 *
 * USAGE:
 * Wrap route components in App.tsx:
 * ```tsx
 * <Route path="/movies" element={
 *   <RouteErrorBoundary routeName="Movies">
 *     <Movies />
 *   </RouteErrorBoundary>
 * } />
 * ```
 */
export class RouteErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    // Update state so the next render will show the fallback UI
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log error details to console for debugging
    console.error('Route Error Boundary caught error:', {
      route: this.props.routeName || 'Unknown',
      error,
      errorInfo,
      componentStack: errorInfo.componentStack,
    });

    this.setState({
      error,
      errorInfo,
    });

    // TODO: Send error to error tracking service (Sentry, etc.)
    // if (process.env.NODE_ENV === 'production') {
    //   logErrorToService(error, errorInfo, this.props.routeName);
    // }
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  handleGoHome = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      // Custom fallback UI provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default error UI
      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-neutral-950">
          <div className="max-w-2xl w-full">
            <Alert variant="destructive" className="border-red-600 bg-red-950/30">
              <div className="flex items-start gap-4">
                <FontAwesomeIcon
                  icon={faExclamationTriangle}
                  className="text-red-500 text-2xl mt-1"
                />
                <div className="flex-1">
                  <h2 className="text-xl font-semibold text-white mb-2">
                    Something went wrong{this.props.routeName && ` in ${this.props.routeName}`}
                  </h2>
                  <AlertDescription className="text-neutral-300 mb-4">
                    {this.state.error?.message || 'An unexpected error occurred. Please try again.'}
                  </AlertDescription>

                  {/* Error details (development only) */}
                  {process.env.NODE_ENV === 'development' && this.state.errorInfo && (
                    <details className="mt-4 mb-4">
                      <summary className="cursor-pointer text-sm text-neutral-400 hover:text-neutral-300">
                        Show error details
                      </summary>
                      <pre className="mt-2 p-3 bg-neutral-900 border border-neutral-800 rounded text-xs text-neutral-400 overflow-auto max-h-64">
                        {this.state.error?.stack}
                        {'\n\n'}
                        {this.state.errorInfo.componentStack}
                      </pre>
                    </details>
                  )}

                  {/* Action buttons */}
                  <div className="flex gap-3">
                    <Button
                      onClick={this.handleReset}
                      variant="default"
                      size="sm"
                      className="bg-primary-600 hover:bg-primary-700"
                    >
                      <FontAwesomeIcon icon={faRotateRight} className="mr-2" />
                      Try Again
                    </Button>
                    <Button
                      onClick={this.handleGoHome}
                      variant="outline"
                      size="sm"
                    >
                      <FontAwesomeIcon icon={faHome} className="mr-2" />
                      Go Home
                    </Button>
                  </div>
                </div>
              </div>
            </Alert>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
