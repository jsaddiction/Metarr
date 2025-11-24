import React, { useState } from 'react';

interface TestButtonProps {
  onTest: () => Promise<{ success: boolean; message: string }>;
  disabled?: boolean;
  className?: string;
  label?: string;
  loadingLabel?: string;
  minDisplayTime?: number;
  resultDisplayTime?: number;
}

/**
 * TestButton - A reusable button component for testing connections/configurations
 *
 * Features:
 * - Smooth 500ms fade transitions between states
 * - Minimum display time for "Testing..." state (default 800ms)
 * - Visual feedback: Test → Testing... → ✓/✗ → Test
 * - Prevents layout shift with fixed width
 * - Console logging for test results
 *
 * @param onTest - Async function that performs the test and returns {success, message}
 * @param disabled - Whether the button should be disabled
 * @param className - Additional CSS classes to apply to the button
 * @param label - Button label text (default: "Test")
 * @param loadingLabel - Loading state text (default: "Testing...")
 * @param minDisplayTime - Minimum time to show "Testing..." in milliseconds (default: 800)
 * @param resultDisplayTime - Time to show result (✓/✗) in milliseconds (default: 3000)
 */
export const TestButton: React.FC<TestButtonProps> = ({
  onTest,
  disabled = false,
  className = '',
  label = 'Test',
  loadingLabel = 'Testing...',
  minDisplayTime = 800,
  resultDisplayTime = 3000,
}) => {
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [testingFadingOut, setTestingFadingOut] = useState(false);

  const handleTest = async () => {
    setTestResult(null);
    setTestingFadingOut(false);
    setIsTesting(true);
    const startTime = Date.now();
    const fadeOutTime = 500; // Time for fade-out animation (ms)

    try {
      const result = await onTest();

      // Calculate how long the test took
      const elapsedTime = Date.now() - startTime;
      const remainingTime = Math.max(0, minDisplayTime - elapsedTime);

      // Wait for minimum display time before starting fade-out
      await new Promise(resolve => setTimeout(resolve, remainingTime));

      // Start fade-out of "Testing..." and wait for it to complete
      setTestingFadingOut(true);
      await new Promise(resolve => setTimeout(resolve, fadeOutTime));

      // Now clear testing states and show the result (which will fade in)
      setIsTesting(false);
      setTestingFadingOut(false);
      setTestResult({ success: result.success, message: result.message });

      // Clear result after specified time
      setTimeout(() => setTestResult(null), resultDisplayTime);
    } catch (error: any) {
      // Calculate elapsed time for error case too
      const elapsedTime = Date.now() - startTime;
      const remainingTime = Math.max(0, minDisplayTime - elapsedTime);

      // Wait for minimum display time before starting fade-out
      await new Promise(resolve => setTimeout(resolve, remainingTime));

      // Start fade-out of "Testing..." and wait for it to complete
      setTestingFadingOut(true);
      await new Promise(resolve => setTimeout(resolve, fadeOutTime));

      // Now clear testing states and show the error result (which will fade in)
      setIsTesting(false);
      setTestingFadingOut(false);
      setTestResult({ success: false, message: error.message || 'Test failed' });
      console.error('✗ Test error:', error);

      // Clear result after specified time
      setTimeout(() => setTestResult(null), resultDisplayTime);
    }
  };

  return (
    <button
      onClick={handleTest}
      disabled={disabled || isTesting || testingFadingOut}
      className={`w-24 h-8 px-3 text-xs relative bg-primary-600 hover:bg-primary-700 text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      title={testResult?.message}
    >
      {/* Label text - fades out when testing or result shown */}
      <span
        className={`transition-opacity duration-500 ${
          isTesting || testingFadingOut || testResult !== null ? 'opacity-0' : 'opacity-100'
        }`}
      >
        {label}
      </span>

      {/* Loading text - show during test, fade out when testingFadingOut */}
      {(isTesting || testingFadingOut) && (
        <span
          className={`absolute inset-0 flex items-center justify-center transition-opacity duration-500 ${
            testingFadingOut ? 'opacity-0' : 'opacity-100'
          }`}
        >
          {loadingLabel}
        </span>
      )}

      {/* Success checkmark - fade in when success */}
      {testResult?.success && (
        <span className="absolute inset-0 flex items-center justify-center text-green-400 transition-opacity duration-500 opacity-100" aria-hidden="true">
          ✓
        </span>
      )}

      {/* Failure X - fade in when failed */}
      {testResult && !testResult.success && (
        <span className="absolute inset-0 flex items-center justify-center text-red-400 transition-opacity duration-500 opacity-100" aria-hidden="true">
          ✗
        </span>
      )}
    </button>
  );
};
