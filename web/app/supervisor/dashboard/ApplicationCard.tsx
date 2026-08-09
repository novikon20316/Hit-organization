'use client';

// app/supervisor/dashboard/ApplicationCard.tsx
import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import type { Application } from './types';

const STATUS_LABEL: Record<string, { he: string; en: string }> = {
  applied: { he: 'ממתין', en: 'Pending' },
  approved: { he: 'אושר', en: 'Approved' },
  meeting_requested: { he: 'תואמה פגישה', en: 'Set-Meeting' },
  rejected: { he: 'נדחה', en: 'Rejected' },
};

const SCREENING_STYLE: Record<string, { bg: string; text: string }> = {
  strong_fit: { bg: 'var(--success-bg)', text: 'var(--success)' },
  partial_fit: { bg: '#FBF3E3', text: 'var(--accent)' },
  weak_fit: { bg: 'var(--danger-bg)', text: 'var(--danger)' },
  unable_to_assess: { bg: '#F1F0EC', text: '#6B7280' },
};

const SCREENING_LABEL: Record<string, { he: string; en: string }> = {
  strong_fit: { he: 'התאמה גבוהה', en: 'Strong fit' },
  partial_fit: { he: 'התאמה חלקית', en: 'Partial fit' },
  weak_fit: { he: 'התאמה חלשה', en: 'Weak fit' },
  unable_to_assess: { he: 'לא ניתן להעריך', en: 'Unable to assess' },
};

const RECOMMENDATION_STYLE: Record<string, { bg: string; text: string }> = {
  approve: { bg: 'var(--success-bg)', text: 'var(--success)' },
  meeting: { bg: '#FBF3E3', text: 'var(--accent)' },
  reject: { bg: 'var(--danger-bg)', text: 'var(--danger)' },
};

const RECOMMENDATION_LABEL: Record<string, { he: string; en: string }> = {
  approve: { he: '✓ מומלץ לאשר', en: '✓ Recommend approving' },
  meeting: { he: '📅 מומלץ לתאם פגישה', en: '📅 Recommend a meeting' },
  reject: { he: '✕ מומלץ לדחות', en: '✕ Recommend rejecting' },
};

interface ApplicationCardProps {
  application: Application;
  onDecided: () => void;
}

export function ApplicationCard({ application: app, onDecided }: ApplicationCardProps) {
  const { lang } = useLanguage();
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submittedDate = (() => {
    if (!app.submittedAt) return null;
    const ms = typeof app.submittedAt === 'object' ? app.submittedAt.seconds * 1000 : new Date(app.submittedAt).getTime();
    return new Date(ms).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US');
  })();

  const decide = async (decision: 'approved' | 'rejected' | 'meeting_requested') => {
    setBusy(true);
    setError('');
    try {
      await apiClient.handleApplicationDecision({ applicationId: app.id, decision });
      onDecided();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process decision');
    } finally {
      setBusy(false);
    }
  };

  const screening = app.aiScreening ? SCREENING_STYLE[app.aiScreening.verdict] : null;

  return (
    <div className="rounded-[var(--radius)] border border-line bg-surface p-4">
      <button type="button" onClick={() => setExpanded((v) => !v)} className="w-full text-start">
        <p className="text-sm font-semibold text-ink">📁 {lang === 'he' ? app.projectTitleHe : app.projectTitleEn}</p>
        <div className="mt-2 flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-ink">
            {app.studentName?.charAt(0)?.toUpperCase() ?? 'S'}
          </span>
          <div className="flex-1">
            <p className="text-sm text-ink">{app.studentName || (lang === 'he' ? 'שם לא זמין' : 'Name unavailable')}</p>
            <p className="text-xs text-muted" dir="ltr">
              {app.studentEmail}
            </p>
          </div>
          <span className="rounded-full bg-paper px-2 py-0.5 text-xs font-medium text-ink">
            {STATUS_LABEL[app.status]?.[lang] ?? app.status}
          </span>
        </div>
      </button>

      {expanded && (
        <div className="mt-3 grid gap-2.5 border-t border-line pt-3">
          {submittedDate && (
            <p className="text-xs text-muted">
              🗓 {lang === 'he' ? 'הוגש ב:' : 'Submitted:'} {submittedDate}
            </p>
          )}

          {app.coverNote ? (
            <p className="rounded-lg bg-paper p-2.5 text-xs text-ink">{app.coverNote}</p>
          ) : (
            <p className="text-xs italic text-muted">{lang === 'he' ? 'אין מכתב מוטיבציה' : 'No cover note provided'}</p>
          )}

          <div className="flex flex-wrap gap-1.5">
            {app.transcriptUrl && (
              <a
                href={app.transcriptUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full border border-line bg-paper px-2.5 py-1 text-xs font-medium text-ink hover:border-primary hover:text-primary"
              >
                📄 {lang === 'he' ? 'גיליון ציונים' : 'Transcript'}
              </a>
            )}
            {app.cvUrl && (
              <a
                href={app.cvUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full border border-line bg-paper px-2.5 py-1 text-xs font-medium text-ink hover:border-primary hover:text-primary"
              >
                📋 {lang === 'he' ? 'קורות חיים' : 'CV'}
              </a>
            )}
          </div>

          {app.aiScreening && screening && (
            <div className="rounded-lg p-2.5" style={{ backgroundColor: screening.bg }}>
              <p className="text-xs font-semibold" style={{ color: screening.text }}>
                🤖 {lang === 'he' ? 'התאמת קורות חיים לדרישות:' : 'CV-vs-prerequisites fit:'} {SCREENING_LABEL[app.aiScreening.verdict][lang]}
              </p>
              <p className="mt-1 text-xs text-ink">{app.aiScreening.reasoning}</p>
            </div>
          )}

          {app.aiReview && (
            <div className="rounded-lg p-2.5" style={{ backgroundColor: RECOMMENDATION_STYLE[app.aiReview.recommendation].bg }}>
              <p className="text-xs font-semibold" style={{ color: RECOMMENDATION_STYLE[app.aiReview.recommendation].text }}>
                🤖 {lang === 'he' ? 'בדיקת AI:' : 'AI review:'} {RECOMMENDATION_LABEL[app.aiReview.recommendation][lang]}
              </p>
              <div className="mt-1.5 grid gap-1">
                {app.aiReview.checks.map((c) => (
                  <p key={c.id} className="text-xs text-ink">
                    {c.passed === true ? '✅' : c.passed === false ? '❌' : '❓'} {lang === 'he' ? c.labelHe : c.labelEn}
                    {c.reasoning ? ` — ${c.reasoning}` : ''}
                  </p>
                ))}
              </div>
            </div>
          )}

          {error && <p className="rounded-md bg-danger-bg px-2.5 py-1.5 text-xs text-danger">{error}</p>}

          {(app.status === 'applied' || app.status === 'meeting_requested') && (
            <div className="flex gap-1.5">
              <button
                type="button"
                disabled={busy}
                onClick={() => decide('approved')}
                className="flex-1 rounded-lg bg-success px-3 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60"
              >
                ✓ {lang === 'he' ? 'אשר' : 'Approve'}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => decide('meeting_requested')}
                className="flex-1 rounded-lg border border-accent px-3 py-2 text-xs font-semibold text-accent hover:bg-[#FBF3E3] disabled:opacity-60"
              >
                📅 {lang === 'he' ? 'בקש פגישה' : 'Request Meeting'}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => decide('rejected')}
                className="flex-1 rounded-lg border border-danger px-3 py-2 text-xs font-semibold text-danger hover:bg-danger-bg disabled:opacity-60"
              >
                ✕ {lang === 'he' ? 'דחה' : 'Reject'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
