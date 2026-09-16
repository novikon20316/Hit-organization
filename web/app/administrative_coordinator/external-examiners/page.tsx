'use client';

// app/administrative_coordinator/external-examiners/page.tsx
// "פרטי בוחנים חיצוניים" (External Examiners Info) — one row per defense
// assignment, joining the examiner's reusable identity/tax/bank submissions
// (see examinerFinancial.ts) with the per-defense evaluation. Backed by
// GET /api/admin/external-examiners (externalExaminersController.ts), which
// already scopes rows to the caller's faculty/major and strips the
// `bankAccount` field entirely for a system_admin caller — this page never
// needs to re-check who it's rendering for; if the field isn't there, it
// isn't rendered.

import { useEffect, useState } from 'react';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { useRequireRole } from '@/hooks/useRequireRole';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import type { AppRole } from '@/lib/roles';

const ALLOWED_ROLES: AppRole[] = ['administrative_secretary', 'system_admin'];

type ExaminerRow = Awaited<ReturnType<typeof apiClient.getExternalExaminers>>['examiners'][number];

function EvaluationCell({ evaluation, lang }: { evaluation: ExaminerRow['evaluation']; lang: 'he' | 'en' }) {
  if (evaluation.kind === 'online') {
    return <span className="text-success">✅ {lang === 'he' ? 'מקוון' : 'Online'}</span>;
  }
  if (evaluation.kind === 'document') {
    return (
      <a href={evaluation.url} target="_blank" rel="noopener noreferrer" className="text-primary underline">
        📎 {evaluation.fileName ?? (lang === 'he' ? 'מסמך' : 'Document')}
      </a>
    );
  }
  return <span className="text-muted">{lang === 'he' ? 'טרם הוגש' : 'Not yet submitted'}</span>;
}

export default function ExternalExaminersPage() {
  const { isAllowed } = useRequireRole(ALLOWED_ROLES);
  const { lang } = useLanguage();
  const [examiners, setExaminers] = useState<ExaminerRow[] | null>(null);
  const [error, setError] = useState('');
  const [showBank, setShowBank] = useState(false);

  useEffect(() => {
    if (!isAllowed) return;
    apiClient
      .getExternalExaminers()
      .then((res) => setExaminers(res.examiners))
      .catch((err) => {
        console.error('Failed to load external examiners:', err);
        setError(lang === 'he' ? 'טעינת רשימת הבוחנים נכשלה' : 'Failed to load examiners');
      });
  }, [isAllowed, lang]);

  if (!isAllowed) return null;

  const hasBankColumn = examiners?.some((e) => 'bankAccount' in e) ?? false;

  return (
    <DashboardShell title={lang === 'he' ? 'פרטי בוחנים חיצוניים' : 'External Examiners Info'} showBackButton={false}>
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <p className="mb-4 text-sm text-administrative-coordinator-on-surface-variant">
          {lang === 'he'
            ? 'פרטי כל בוחן חיצוני ומסמכיו, לצורך אישור ותשלום. פרטי חשבון הבנק חסויים ומוצגים למרכזת המנהלית בלבד.'
            : "Every external examiner's details and documents, for approval and payment. Bank account details are confidential and shown to the administrative coordinator only."}
        </p>

        {error && <p className="mb-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{error}</p>}
        {!error && examiners === null && <p className="text-sm text-administrative-coordinator-on-surface-variant" role="status" aria-live="polite">{lang === 'he' ? 'טוען…' : 'Loading…'}</p>}
        {!error && examiners !== null && examiners.length === 0 && (
          <p className="text-sm text-administrative-coordinator-on-surface-variant">{lang === 'he' ? 'אין בוחנים חיצוניים להצגה.' : 'No external examiners to show.'}</p>
        )}

        {examiners !== null && examiners.length > 0 && (
          <div className="overflow-x-auto rounded-administrative-coordinator border border-administrative-coordinator-outline-variant">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-administrative-coordinator-outline-variant bg-administrative-coordinator-surface-container-lowest text-start text-xs text-administrative-coordinator-on-surface-variant">
                  <th className="px-3 py-2 text-start">{lang === 'he' ? 'שם' : 'Name'}</th>
                  <th className="px-3 py-2 text-start">{lang === 'he' ? 'תפקיד' : 'Role'}</th>
                  <th className="px-3 py-2 text-start">{lang === 'he' ? 'תואר' : 'Title'}</th>
                  <th className="px-3 py-2 text-start">{lang === 'he' ? 'מוסד אקדמי' : 'Institution'}</th>
                  <th className="px-3 py-2 text-start">{lang === 'he' ? 'פרויקט/תזה' : 'Project/Thesis'}</th>
                  <th className="px-3 py-2 text-start">{lang === 'he' ? 'הערכה' : 'Evaluation'}</th>
                  <th className="px-3 py-2 text-start">{lang === 'he' ? 'אישור ניכוי מס' : 'Tax Document'}</th>
                  {hasBankColumn && (
                    <th className="px-3 py-2 text-start">
                      <button type="button" onClick={() => setShowBank((v) => !v)} className="underline decoration-dotted">
                        {lang === 'he' ? 'פרטי בנק' : 'Bank Details'} {showBank ? '🙈' : '👁️'}
                      </button>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {examiners.map((e) => (
                  <tr key={e.token} className="border-b border-administrative-coordinator-outline-variant last:border-0 align-top">
                    <td className="px-3 py-2 font-medium text-administrative-coordinator-on-surface">{e.examinerName}</td>
                    <td className="px-3 py-2 text-administrative-coordinator-on-surface-variant">{e.role ?? '—'}</td>
                    <td className="px-3 py-2 text-administrative-coordinator-on-surface-variant">{e.title ?? '—'}</td>
                    <td className="px-3 py-2 text-administrative-coordinator-on-surface-variant">{e.institution || '—'}</td>
                    <td className="px-3 py-2 text-administrative-coordinator-on-surface-variant">{e.projectTitle || '—'}</td>
                    <td className="px-3 py-2"><EvaluationCell evaluation={e.evaluation} lang={lang} /></td>
                    <td className="px-3 py-2">
                      {e.taxDocument ? (
                        <a href={e.taxDocument.url} target="_blank" rel="noopener noreferrer" className="text-primary underline">
                          📎 {e.taxDocument.fileName}
                        </a>
                      ) : (
                        <span className="text-muted">{lang === 'he' ? 'טרם הוגש' : 'Not yet submitted'}</span>
                      )}
                    </td>
                    {hasBankColumn && (
                      <td className="px-3 py-2 text-xs text-administrative-coordinator-on-surface-variant" dir="ltr">
                        {!showBank ? (
                          <span>••••••</span>
                        ) : e.bankAccount ? (
                          <div className="grid gap-0.5">
                            <span>{e.bankAccount.bankName} · {e.bankAccount.branch}</span>
                            <span>{e.bankAccount.accountNumber}</span>
                            <span>{e.bankAccount.accountHolderName}</span>
                          </div>
                        ) : (
                          <span className="text-muted" dir={lang === 'he' ? 'rtl' : 'ltr'}>{lang === 'he' ? 'טרם הוגש' : 'Not yet submitted'}</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
