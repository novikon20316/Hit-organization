'use client'; // Error boundaries must be Client Components

import { useEffect } from 'react';
import { ErrorFallback } from '@/components/ErrorFallback';

export default function ErrorPage({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error('Uncaught render error:', error);
  }, [error]);

  return <ErrorFallback error={error} onRetry={unstable_retry} />;
}
