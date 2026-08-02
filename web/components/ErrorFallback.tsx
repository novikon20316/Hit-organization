'use client';

// components/ErrorFallback.tsx
//
// Shared fallback UI for app/error.tsx and app/global-error.tsx. In
// production, Next.js only forwards error.message to the client for Server
// Component errors (the stack is redacted to avoid leaking details) — but
// for a Client Component crash (most of this app, since nearly every page is
// 'use client'), the Error object reaching this boundary is the real one
// thrown in the browser, so .stack is intact. Surfacing it here (with a copy
// button) is the only way to get more than a bare message out of a crash a
// real user hits, since there's no error-reporting service wired up yet.

import { useState } from 'react';

export function ErrorFallback({
  error,
  onRetry,
}: {
  error: Error & { digest?: string };
  onRetry: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopyDetails = () => {
    const details = [
      error.message || 'Unknown error',
      error.digest ? `Digest: ${error.digest}` : '',
      error.stack || '(no stack available)',
    ]
      .filter(Boolean)
      .join('\n');

    navigator.clipboard
      .writeText(details)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {});
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-paper px-6 py-12">
      <div className="w-full max-w-md text-center">
        <p className="mb-3 text-4xl">⚠️</p>
        <h1 className="mb-2 text-lg font-bold text-ink">Something went wrong</h1>
        <p className="mb-5 text-sm text-muted">{error.message || 'An unexpected error occurred.'}</p>

        <div className="mb-5 max-h-40 overflow-auto rounded-lg border border-line bg-surface p-3 text-left">
          <pre className="whitespace-pre-wrap break-words font-mono text-xs text-muted">
            {error.stack || '(no stack available)'}
          </pre>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={handleCopyDetails}
            className="rounded-lg border border-line px-5 py-2.5 text-sm font-semibold text-ink hover:bg-surface"
          >
            {copied ? 'Copied!' : 'Copy details'}
          </button>
          <button
            type="button"
            onClick={onRetry}
            className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-ink hover:bg-primary-hover"
          >
            Try again
          </button>
        </div>
      </div>
    </div>
  );
}
