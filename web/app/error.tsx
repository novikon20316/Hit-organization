'use client'; // Error boundaries must be Client Components

import { useEffect } from 'react';
import { ErrorFallback } from '@/components/ErrorFallback';
import { reportClientError } from '@/lib/errorReporting';

export default function ErrorPage({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    reportClientError({ kind: 'client_crash', message: error.message, stack: error.stack });
  }, [error]);

  return <ErrorFallback error={error} onRetry={unstable_retry} />;
}
