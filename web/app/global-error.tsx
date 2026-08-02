'use client'; // Error boundaries must be Client Components

// Catches errors thrown by the root layout itself — app/error.tsx only
// wraps everything BELOW the root layout, not the layout/providers themselves.
// Must render its own <html>/<body> since it replaces the root layout when active.

import { useEffect } from 'react';
import { ErrorFallback } from '@/components/ErrorFallback';

export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error('Uncaught root-layout error:', error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <ErrorFallback error={error} onRetry={unstable_retry} />
      </body>
    </html>
  );
}
