/**
 * Error Boundary Component
 * Catches React component errors and displays a fallback UI
 */

import React, { Component, ReactNode } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="content-spacing">
          <Card className="border-red-500">
            <CardHeader>
              <CardTitle className="text-red-500">Something went wrong</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-neutral-300 mb-4">
                An unexpected error occurred. Please refresh the page or try again later.
              </p>
              {this.state.error && (
                <pre className="text-xs text-neutral-500 bg-neutral-900 p-4 rounded overflow-auto max-h-64">
                  {this.state.error.message}
                  {import.meta.env.DEV && this.state.error.stack && (
                    <>
                      {'\n\n'}
                      {this.state.error.stack}
                    </>
                  )}
                </pre>
              )}
              <button
                onClick={() => window.location.reload()}
                className="mt-4 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded transition-colors"
              >
                Reload Page
              </button>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
