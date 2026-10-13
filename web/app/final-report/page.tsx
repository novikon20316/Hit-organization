'use client';

// app/final-report/page.tsx
// Public, VIEW-ONLY final report — no Firebase Auth required, and nothing on
// this page can sign anyone in. The student receives
//   https://<web-origin>/final-report?token=<token>
// by email once their final grade is approved (see
// server/src/services/finalReport.ts). The token only ever resolves to this
// one report; the server re-checks on every load that the grade is still
// approved, so this page never decides access on its own.
//
// Printable: the toolbar is hidden in print, and the report itself is laid
// out as a plain A4 document.
//
// useSearchParams() forces client-side rendering at the Suspense boundary
// (same as app/defense-access/page.tsx).

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { apiClient, ApiError, type FinalReportData } from '@/lib/apiClient';
import { useLanguage } from '@/contexts/LanguageContext';
import { LanguageToggle } from '@/components/LanguageToggle';
import { HIT_FACULTIES } from '@/lib/faculties';
import { specializationLabel } from '@/lib/specialization';
import { milestoneDisplayName } from '@/lib/milestoneLabel';
import { examinerSignatureStyle } from '@/lib/examinerSignature';
import { chainRoleLabel, type ChainRole } from '@/app/workflow-templates/types';
import { MILESTONE_LABEL } from '@/app/student/home/types';

type LoadState = 'loading' | 'ready' | 'invalid' | 'error';

function formatDate(iso: string | null | undefined, lang: 'he' | 'en'): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-GB', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function programLabel(facultyId: string, major: string | null, degreeType: string | null, lang: 'he' | 'en'): string | null {
  if (!major) return null;
  const faculty = HIT_FACULTIES.find((f) => f.key === facultyId);
  const program = faculty?.programs.find((p) => p.slug === major && (!degreeType || p.level === degreeType))
    ?? faculty?.programs.find((p) => p.slug === major);
  return program?.label[lang] ?? major;
}

function FinalReportContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const { lang } = useLanguage();
  const he = lang === 'he';

  const [state, setState] = useState<LoadState>(token ? 'loading' : 'invalid');
  const [report, setReport] = useState<FinalReportData | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    apiClient
      .getFinalReport(token)
      .then((res) => {
        if (cancelled) return;
        setReport(res);
        setState('ready');
      })
      .catch((e) => {
        if (cancelled) return;
        setState(e instanceof ApiError && (e.status === 404 || e.status === 410) ? 'invalid' : 'error');
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (state === 'loading') {
    return <p className="text-sm text-muted" role="status" aria-live="polite">{he ? 'טוען…' : 'Loading…'}</p>;
  }

  if (state === 'invalid' || state === 'error' || !report) {
    return (
      <div className="mx-auto max-w-sm py-16 text-center">
        <span className="text-4xl" aria-hidden>🔗</span>
        <h1 className="mt-2 text-xl font-semibold text-ink">
          {state === 'error'
            ? (he ? 'טעינת הדוח נכשלה' : 'Could not load the report')
            : (he ? 'הקישור אינו תקין או שאינו זמין עוד' : 'This link is invalid or no longer available')}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {state === 'error'
            ? (he ? 'נסו לרענן את הדף בעוד מספר רגעים.' : 'Please try refreshing the page in a moment.')
            : (he ? 'לקבלת קישור חדש פנו לרכז/ת האדמיניסטרטיבי/ת של הפקולטה.' : 'Please contact your faculty’s administrative coordinator for a new link.')}
        </p>
      </div>
    );
  }

  const { student, project, faculty } = report;
  const isThesis = project.projectType === 'thesis';
  const projectTitle = (he ? project.titleHe || project.titleEn : project.titleEn || project.titleHe) || '—';
  const program = programLabel(student.facultyId, student.major, student.degreeType, lang);
  const specialization = specializationLabel(student.specialization, lang);
  const academicYear = he ? project.academicYearHebrew ?? project.academicYear : project.academicYear;

  const details: Array<[string, string | null | undefined]> = [
    [he ? 'שם הסטודנט/ית' : 'Student name', student.name],
    [he ? 'תעודת זהות' : 'ID number', student.idNumber],
    [he ? 'דוא"ל' : 'Email', student.email],
    [he ? 'טלפון' : 'Phone', student.phone],
    [he ? 'פקולטה' : 'Faculty', faculty[lang]],
    [he ? 'תוכנית לימודים' : 'Program', program],
    ...(specialization ? [[he ? 'מגמה' : 'Specialization', specialization] as [string, string]] : []),
    [he ? 'שנה אקדמית' : 'Academic year', academicYear],
  ];

  return (
    <article className="mx-auto w-full max-w-3xl rounded-[var(--radius)] border border-line bg-surface p-6 text-ink shadow-sm sm:p-10 print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none">
      {/* ── Header ───────────────────────────────────────────────────── */}
      <header className="border-b-2 border-ink pb-4 text-center">
        <p className="text-sm text-muted">{faculty[lang]}</p>
        <h1 className="mt-1 text-2xl font-bold">
          {he ? `דוח מסכם — ${isThesis ? 'עבודת תזה' : 'פרויקט גמר'}` : `Final Report — ${isThesis ? 'Thesis' : 'Final Project'}`}
        </h1>
        {project.recordNumber && (
          <p className="mt-1 text-xs text-muted">{he ? 'מס׳ תיק' : 'Record no.'} {project.recordNumber}</p>
        )}
      </header>

      {/* ── Personal details ─────────────────────────────────────────── */}
      <section className="mt-6" aria-labelledby="fr-details">
        <h2 id="fr-details" className="mb-2 text-base font-semibold">{he ? 'פרטים אישיים' : 'Personal details'}</h2>
        <dl className="grid grid-cols-1 gap-x-8 sm:grid-cols-2 print:grid-cols-2">
          {details.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-3 border-b border-line py-1.5">
              <dt className="text-sm text-muted">{label}</dt>
              <dd className="text-sm font-medium">{value || '—'}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* ── Project ──────────────────────────────────────────────────── */}
      <section className="mt-6" aria-labelledby="fr-project">
        <h2 id="fr-project" className="mb-2 text-base font-semibold">{isThesis ? (he ? 'עבודת התזה' : 'Thesis') : (he ? 'הפרויקט' : 'Project')}</h2>
        <dl>
          <div className="flex justify-between gap-3 border-b border-line py-1.5">
            <dt className="text-sm text-muted">{isThesis ? (he ? 'שם התזה' : 'Thesis title') : (he ? 'שם הפרויקט' : 'Project title')}</dt>
            <dd className="text-sm font-medium">{projectTitle}</dd>
          </div>
          <div className="flex justify-between gap-3 border-b border-line py-1.5">
            <dt className="text-sm text-muted">{report.supervisors.length > 1 ? (he ? 'מנחים' : 'Supervisors') : (he ? 'מנחה' : 'Supervisor')}</dt>
            <dd className="text-sm font-medium">{report.supervisors.join(', ') || '—'}</dd>
          </div>
        </dl>
      </section>

      {/* ── Milestones ───────────────────────────────────────────────── */}
      <section className="mt-6" aria-labelledby="fr-milestones">
        <h2 id="fr-milestones" className="mb-2 text-base font-semibold">{he ? 'אבני דרך וציונים' : 'Milestones and grades'}</h2>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b-2 border-ink">
                <th scope="col" className="w-10 py-2 text-start font-semibold">#</th>
                <th scope="col" className="py-2 text-start font-semibold">{he ? 'אבן דרך' : 'Milestone'}</th>
                <th scope="col" className="py-2 text-start font-semibold">{he ? 'תאריך השלמה' : 'Completed'}</th>
                <th scope="col" className="py-2 text-end font-semibold">{he ? 'ציון' : 'Grade'}</th>
              </tr>
            </thead>
            <tbody>
              {report.milestones.map((m, i) => (
                <tr key={`${m.type}-${i}`} className="border-b border-line">
                  <td className="py-2 text-muted">{i + 1}</td>
                  <td className="py-2">{milestoneDisplayName(m, lang, MILESTONE_LABEL)}</td>
                  <td className="py-2 text-muted">{formatDate(m.completedAt, lang)}</td>
                  <td className="py-2 text-end font-medium tabular-nums">{m.grade ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Final grade ──────────────────────────────────────────────── */}
      <section className="mt-6 flex items-center justify-between gap-4 rounded-[var(--radius)] border-2 border-ink px-4 py-3 print:break-inside-avoid" aria-label={he ? 'ציון סופי' : 'Final grade'}>
        <div>
          <p className="text-base font-semibold">{he ? 'ציון סופי' : 'Final grade'}</p>
          <p className="text-xs text-muted">
            {he ? 'אושר בתאריך' : 'Approved on'} {formatDate(report.finalGradeApprovedAt, lang)}
          </p>
        </div>
        <p className="text-3xl font-bold tabular-nums">{report.finalGrade ?? '—'}</p>
      </section>

      {/* ── Signatures ───────────────────────────────────────────────── */}
      <section className="mt-10 print:break-inside-avoid" aria-labelledby="fr-signatures">
        <h2 id="fr-signatures" className="mb-4 text-base font-semibold">{he ? 'חתימות' : 'Signatures'}</h2>
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-3 print:grid-cols-3">
          {report.signatures.map((sig) => {
            const roleLabel = chainRoleLabel(sig.role as ChainRole, lang);
            const style = sig.signedAt && sig.name
              ? examinerSignatureStyle(sig.name, student.facultyId, sig.role, student.major)
              : null;
            return (
              <div key={sig.role} className="text-center">
                <div className="flex h-12 items-end justify-center border-b border-ink">
                  {style && (
                    <span className="pb-1 text-xl" style={{ fontFamily: style.fontFamily, color: style.color }}>
                      {sig.name}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm font-medium">{sig.name || ' '}</p>
                <p className="text-xs text-muted">{roleLabel}</p>
                <p className="text-xs text-muted">
                  {sig.signedAt
                    ? `${he ? 'נחתם דיגיטלית' : 'Digitally signed'} ${formatDate(sig.signedAt, lang)}`
                    : `${he ? 'תאריך' : 'Date'}: ________`}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      <footer className="mt-10 border-t border-line pt-3 text-center text-xs text-muted">
        {he ? 'הופק בתאריך' : 'Generated on'} {formatDate(report.generatedAt, lang)}
        {' · '}
        {he ? 'מסמך לצפייה בלבד' : 'View-only document'}
      </footer>
    </article>
  );
}

export default function FinalReportPage() {
  const { lang } = useLanguage();
  return (
    <div className="flex min-h-screen flex-col bg-paper print:min-h-0 print:bg-white">
      <header className="flex items-center justify-end gap-3 p-4 print:hidden">
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-ink hover:bg-primary-hover"
        >
          🖨️ {lang === 'he' ? 'הדפסה / שמירה כ-PDF' : 'Print / Save as PDF'}
        </button>
        <LanguageToggle />
      </header>
      <main className="flex-1 px-4 pb-16 print:p-0">
        <Suspense fallback={<p className="text-sm text-muted">…</p>}>
          <FinalReportContent />
        </Suspense>
      </main>
    </div>
  );
}
