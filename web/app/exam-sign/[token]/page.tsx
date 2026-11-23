'use client';

// app/exam-sign/[token]/page.tsx
// PUBLIC (proxy.ts) — the link in the "please sign the exam form you just
// held" email each thesis examiner gets once the exam's chairman (the
// supervisor) sent the CS thesis exam form (server's services/thesisExam.ts,
// exam_signatures). Opening the link only shows the form; the examiner signs
// with the button (a POST), so a mail scanner opening the link signs nothing.

import { useMemo } from 'react';
import { useParams } from 'next/navigation';
import { apiClient } from '@/lib/apiClient';
import { useLanguage } from '@/contexts/LanguageContext';
import { LanguageToggle } from '@/components/LanguageToggle';
import { ThesisExamFormPanel, type ThesisExamFormSource } from '@/components/thesisExam/ThesisExamFormPanel';

export default function ExamSignPage() {
  const { lang } = useLanguage();
  const he = lang === 'he';
  const params = useParams<{ token: string }>();
  const token = typeof params?.token === 'string' ? params.token : '';

  const source = useMemo<ThesisExamFormSource>(() => ({
    load: async () => (await apiClient.getThesisExamSignLink(token)).view,
    sign: () => apiClient.signThesisExamByLink(token),
  }), [token]);

  return (
    <main className="min-h-screen bg-paper px-4 py-8" dir={he ? 'rtl' : 'ltr'}>
      <div className="mx-auto max-w-3xl">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h1 className="text-xl font-bold text-ink">{he ? 'חתימה על טופס בחינת התזה' : 'Sign the thesis exam form'}</h1>
          <LanguageToggle />
        </div>
        <div className="rounded-xl border border-line bg-surface p-5 shadow-sm">
          {token
            ? <ThesisExamFormPanel source={source} lang={lang} />
            : <p className="text-sm text-danger" role="alert">{he ? 'קישור החתימה אינו תקין.' : 'This signing link is invalid.'}</p>}
        </div>
      </div>
    </main>
  );
}
