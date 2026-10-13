// app/final-report/layout.tsx
// Server-side metadata for the public view-only report page (page.tsx is a
// client component and can't export it). The URL carries a personal bearer
// token — keep it out of search indexes and Referer headers.
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Final Report',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default function FinalReportLayout({ children }: { children: React.ReactNode }) {
  return children;
}
