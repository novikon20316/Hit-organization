'use client';

// app/workflow-templates/TemplateReviewModal.tsx
// "Review before approving" for a pending template version — the server's
// read-only GET /api/workflow-templates/:id/review (workflowTemplateReview.ts):
// warnings first, then what changes against the version in force, a
// milestone-by-milestone walkthrough with who would act at each step, and —
// for "apply now" — exactly what happens to each in-progress project. The
// Approve button here runs the page's usual approve flow (including its own
// retroactive confirmation), so reviewing never bypasses anything.

import { useEffect, useRef, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useModalA11y } from '@/hooks/useModalA11y';
import { apiClient, type WorkflowTemplateReview } from '@/lib/apiClient';
import { chainRoleLabel, processTypeLabel, type ChainRole, type ProcessType } from './types';

interface TemplateReviewModalProps {
  templateId: string;
  canApprove: boolean;
  onApprove: () => void;
  onClose: () => void;
}

type Section = 'changes' | 'walkthrough' | 'impact';

const SEVERITY_STYLE: Record<'error' | 'warning' | 'info', { cls: string; icon: string; style?: React.CSSProperties }> = {
  error: { cls: 'bg-danger-bg text-danger', icon: '⛔' },
  warning: { cls: '', icon: '⚠️', style: { backgroundColor: 'var(--warning-bg, #FEF3C7)', color: 'var(--warning, #92400E)' } },
  info: { cls: 'bg-paper text-ink border border-line', icon: 'ℹ️' },
};

const CHANGE_STYLE: Record<'added' | 'removed' | 'changed' | 'unchanged', { he: string; en: string; cls: string }> = {
  added: { he: 'חדשה', en: 'Added', cls: 'bg-success-bg text-success' },
  removed: { he: 'הוסרה', en: 'Removed', cls: 'bg-danger-bg text-danger' },
  changed: { he: 'שונתה', en: 'Changed', cls: 'bg-paper text-ink border border-line' },
  unchanged: { he: 'ללא שינוי', en: 'Unchanged', cls: 'text-muted' },
};

const IMPACT_LABEL: Record<'update' | 'create' | 'keep_started' | 'keep_removed', { he: string; en: string }> = {
  update: { he: 'תעודכן', en: 'Updated' },
  create: { he: 'תיווצר', en: 'Created' },
  keep_started: { he: 'נשארת (כבר התחילה)', en: 'Kept (already started)' },
  keep_removed: { he: 'נשארת (הוסרה מהתבנית)', en: 'Kept (removed from template)' },
};

const ACTION_LABEL: Record<'grade' | 'approve' | 'notify', { he: string; en: string }> = {
  grade: { he: 'נותן/ת ציון', en: 'grades' },
  approve: { he: 'מאשר/ת', en: 'approves' },
  notify: { he: 'מקבל/ת עדכון', en: 'is notified' },
};

function formatDate(iso: string | null, lang: 'he' | 'en'): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function TemplateReviewModal({ templateId, canApprove, onApprove, onClose }: TemplateReviewModalProps) {
  const { lang } = useLanguage();
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalA11y(dialogRef, true, onClose);
  const [review, setReview] = useState<WorkflowTemplateReview | null>(null);
  const [error, setError] = useState('');
  const [section, setSection] = useState<Section>('changes');
  const he = lang === 'he';

  useEffect(() => {
    let cancelled = false;
    apiClient.getWorkflowTemplateReview(templateId)
      .then((r) => { if (!cancelled) setReview(r); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : he ? 'טעינת הסקירה נכשלה' : 'Failed to load the review'); });
    return () => { cancelled = true; };
  }, [templateId, he]);

  const name = (x: { nameHe: string; nameEn: string }) => (he ? x.nameHe : x.nameEn);
  const sections: Array<{ key: Section; he: string; en: string }> = [
    { key: 'changes', he: 'מה משתנה', en: 'What changes' },
    { key: 'walkthrough', he: 'מעבר שלב-אחר-שלב', en: 'Step by step' },
    ...(review?.impact ? [{ key: 'impact' as const, he: `פרויקטים בתהליך (${review.impact.length})`, en: `In-progress projects (${review.impact.length})` }] : []),
  ];
  const errorCount = review?.warnings.filter((w) => w.severity === 'error').length ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center-safe justify-center overflow-y-auto bg-black/40 p-4">
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="template-review-title"
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-[var(--radius)] bg-surface shadow-lg outline-none"
      >
        <div className="flex items-start justify-between gap-3 border-b border-line p-5">
          <div>
            <h2 id="template-review-title" className="text-base font-semibold text-ink">{he ? 'סקירה לפני אישור' : 'Review before approving'}</h2>
            {review && (
              <p className="mt-1 text-xs text-muted">
                {processTypeLabel(review.template.processType as ProcessType, lang)} · {he ? `גרסה ${review.template.version}` : `Version ${review.template.version}`}
                {' — '}
                {review.baseline.isDefault
                  ? (he ? 'בהשוואה לברירת המחדל של המערכת (אין גרסה מאושרת)' : 'compared with the system default (no approved version yet)')
                  : (he ? `בהשוואה לגרסה ${review.baseline.version ?? ''} המאושרת${review.baseline.major === null && review.template.major ? ' (של כל הפקולטה)' : ''}` : `compared with approved version ${review.baseline.version ?? ''}${review.baseline.major === null && review.template.major ? ' (faculty-wide)' : ''}`)}
              </p>
            )}
          </div>
          <button type="button" onClick={onClose} aria-label={he ? 'סגור' : 'Close'} className="text-muted hover:text-ink">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {!review ? (
            <p className="text-sm text-muted" role={error ? 'alert' : 'status'}>{error || (he ? 'בונה סקירה…' : 'Building the review…')}</p>
          ) : (
            <>
              {/* Warnings */}
              {review.warnings.length === 0 ? (
                <p className="rounded-md bg-success-bg px-3 py-2 text-sm text-success">✅ {he ? 'לא נמצאו בעיות.' : 'No problems found.'}</p>
              ) : (
                <ul className="grid gap-2">
                  {review.warnings.map((w, i) => (
                    <li key={i} className={`rounded-md px-3 py-2 text-sm ${SEVERITY_STYLE[w.severity].cls}`} style={SEVERITY_STYLE[w.severity].style}>
                      {SEVERITY_STYLE[w.severity].icon} {he ? w.he : w.en}
                    </li>
                  ))}
                </ul>
              )}

              {/* Section tabs */}
              <div className="mt-5 flex flex-wrap gap-1 border-b border-line" role="tablist">
                {sections.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    role="tab"
                    aria-selected={section === s.key}
                    onClick={() => setSection(s.key)}
                    className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${section === s.key ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-ink'}`}
                  >
                    {he ? s.he : s.en}
                  </button>
                ))}
              </div>

              {section === 'changes' && (
                <div className="mt-4 grid gap-3">
                  {review.milestones.map((m) => (
                    <div key={m.type} className="rounded-md border border-line p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-ink">{name(m)}</p>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${CHANGE_STYLE[m.change].cls}`}>{he ? CHANGE_STYLE[m.change].he : CHANGE_STYLE[m.change].en}</span>
                      </div>
                      {m.fields.length > 0 && (
                        <dl className="mt-2 grid gap-1 text-xs">
                          {m.fields.map((f) => (
                            <div key={f.field} className="grid grid-cols-[8rem_1fr] gap-2">
                              <dt className="text-muted">{he ? f.label.he : f.label.en}</dt>
                              <dd className="break-words text-ink"><span className="text-muted line-through">{f.before}</span> → {f.after}</dd>
                            </div>
                          ))}
                        </dl>
                      )}
                    </div>
                  ))}
                  {review.settings.length > 0 && (
                    <div className="rounded-md border border-line p-3">
                      <p className="text-sm font-medium text-ink">{he ? 'הגדרות התבנית' : 'Template settings'}</p>
                      <dl className="mt-2 grid gap-1 text-xs">
                        {review.settings.map((f) => (
                          <div key={f.field} className="grid grid-cols-[10rem_1fr] gap-2">
                            <dt className="text-muted">{he ? f.label.he : f.label.en}</dt>
                            <dd className="break-words text-ink"><span className="text-muted line-through">{f.before}</span> → {f.after}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  )}
                  <p className="text-[11px] text-muted">
                    {he ? 'ערכי השדות מוצגים כפי שהם שמורים במערכת (באנגלית).' : 'Field values are shown as stored in the system.'}
                  </p>
                </div>
              )}

              {section === 'walkthrough' && (
                <ol className="mt-4 grid gap-3">
                  {review.walkthrough.map((m, i) => (
                    <li key={m.type} className="rounded-md border border-line p-3">
                      <p className="text-sm font-medium text-ink">{i + 1}. {name(m)}</p>
                      <p className="mt-0.5 text-xs text-muted">
                        {m.due.kind === 'offset'
                          ? (he ? `מועד: ${m.due.days} ימים מתחילת הפרויקט` : `Due ${m.due.days} days after the project starts`)
                          : m.due.kind === 'fixed'
                            ? (he ? `מועד קבוע: ${formatDate(m.due.date, lang)}` : `Fixed due date: ${formatDate(m.due.date, lang)}`)
                            : (he ? `מועד זהה ל-${m.due.withType}` : `Same due date as ${m.due.withType}`)}
                        {' · '}
                        {he ? `לסטודנט שמתחיל היום: ${formatDate(m.sampleDueDate, lang)}` : `For a student starting today: ${formatDate(m.sampleDueDate, lang)}`}
                        {m.percentOfFinalGrade != null ? ` · ${m.percentOfFinalGrade}% ${he ? 'מהציון הסופי' : 'of final grade'}` : ''}
                      </p>
                      <ul className="mt-2 grid gap-1 text-xs">
                        {m.stages.map((s, si) => (
                          <li key={si} className="flex flex-wrap gap-x-1.5">
                            <span className="font-medium text-ink">{si + 1}) {chainRoleLabel(s.role as ChainRole, lang)} {ACTION_LABEL[s.action][lang]}:</span>
                            <span className={s.who.kind === 'staff' && s.who.count === 0 ? 'font-semibold text-danger' : 'text-muted'}>
                              {s.who.kind === 'project'
                                ? (he ? 'לפי הפרויקט' : 'per project')
                                : s.who.kind === 'committee'
                                  ? (s.who.memberCount != null
                                    ? (he ? `ועדה${s.who.name ? ` "${s.who.name}"` : ''} · ${s.who.memberCount} חברים` : `committee${s.who.name ? ` "${s.who.name}"` : ''} · ${s.who.memberCount} members`)
                                    : (he ? 'הוועדה של חוג הסטודנט' : "the student's major committee"))
                                  : s.who.count === 0
                                    ? (he ? 'אף אחד — השלב ייתקע' : 'nobody — this step would get stuck')
                                    : `${s.who.names.join(', ')}${s.who.count > s.who.names.length ? (he ? ` ועוד ${s.who.count - s.who.names.length}` : ` +${s.who.count - s.who.names.length} more`) : ''}`}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ol>
              )}

              {section === 'impact' && review.impact && (
                review.impact.length === 0 ? (
                  <p className="mt-4 text-sm text-muted">{he ? 'אין פרויקטים בתהליך שיושפעו.' : 'No in-progress projects would be affected.'}</p>
                ) : (
                  <div className="mt-4 grid gap-3">
                    {review.impact.map((p) => (
                      <div key={p.id} className="rounded-md border border-line p-3">
                        <p className="text-sm font-medium text-ink">👤 {p.studentNames.join(', ') || p.id}</p>
                        <table className="mt-2 w-full text-xs">
                          <tbody>
                            {p.changes.map((c) => (
                              <tr key={c.type} className="border-t border-line/60 align-top">
                                <td className="py-1 pe-2 text-ink">{name(c)}</td>
                                <td className={`py-1 pe-2 ${c.action === 'update' || c.action === 'create' ? 'font-medium text-primary' : 'text-muted'}`}>{IMPACT_LABEL[c.action][lang]}</td>
                                <td className="whitespace-nowrap py-1 text-muted">
                                  {c.action === 'update' && c.dueBefore !== c.dueAfter
                                    ? `${formatDate(c.dueBefore, lang)} → ${formatDate(c.dueAfter, lang)}`
                                    : formatDate(c.dueAfter ?? c.dueBefore, lang)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ))}
                  </div>
                )
              )}
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-line p-4">
          <button type="button" onClick={onClose} className="rounded-lg border border-line px-3.5 py-2 text-sm font-medium text-ink">
            {he ? 'סגור' : 'Close'}
          </button>
          {canApprove && review && (
            <button
              type="button"
              onClick={onApprove}
              className="rounded-lg bg-success px-3.5 py-2 text-sm font-semibold text-white hover:opacity-90"
            >
              ✅ {errorCount > 0 ? (he ? `אשר בכל זאת (${errorCount} בעיות)` : `Approve anyway (${errorCount} problems)`) : (he ? 'אשר' : 'Approve')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
