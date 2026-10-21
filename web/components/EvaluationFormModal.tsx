'use client';

// components/EvaluationFormModal.tsx
// The per-student evaluation form (server: evaluationFormController.ts;
// template: finalGradeComponents.perStudent) rendered like its paper
// original — first built for Electrical Engineering's "טופס הערכת פרויקט גמר
// הנדסי לתואר B.Sc.": a system-filled header, the students table, the
// criteria table with its "נותן ההערכה" (supervisor/examiner) ticks and one
// score column per student, the totals, and the digital signatures.
//
// One component for every viewer: the supervisor fills the supervisor rows
// and later approves/changes the computed grades, an examiner fills the
// examiner rows, coordinators and other staff get a read-only view. What
// each viewer may see/edit is decided server-side (`viewer`, and null
// scores for anything hidden from them).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient, type EvaluationFormSignature, type EvaluationFormView } from '@/lib/apiClient';
import { useModalA11y } from '@/hooks/useModalA11y';
import { examinerSignatureStyle } from '@/lib/examinerSignature';

interface EvaluationFormModalProps {
  milestoneId: string;
  onClose: () => void;
  /** Called after a successful submit/decision so the caller can refresh. */
  onChanged?: () => void;
}

function clampScoreInput(raw: string, max: number): string {
  if (raw === '') return raw;
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;
  return String(Math.min(Math.max(n, 0), max));
}

function formatPoints(n: number | null | undefined): string {
  if (n == null) return '—';
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function SignatureBlock({ label, signature, pendingText, lang }: { label: string; signature: EvaluationFormSignature | null; pendingText: string; lang: 'he' | 'en' }) {
  const he = lang === 'he';
  if (!signature) {
    return (
      <div className="rounded-lg border border-dashed border-line p-3">
        <p className="text-xs font-semibold text-muted">{label}</p>
        <p className="mt-2 text-sm text-muted">{pendingText}</p>
      </div>
    );
  }
  const style = examinerSignatureStyle(signature.signerName, signature.facultyId, signature.role, null);
  return (
    <div className={`rounded-lg border p-3 ${signature.valid ? 'border-line' : 'border-danger bg-danger-bg'}`}>
      <p className="text-xs font-semibold text-muted">{label}</p>
      <p className="mt-1 text-2xl leading-tight" style={{ fontFamily: style.fontFamily, color: style.color }}>{signature.signerName}</p>
      <p className="mt-1 text-sm font-medium text-ink">{signature.signerName} · {he ? signature.positionHe : signature.positionEn}</p>
      <p className="text-xs text-muted">{he ? signature.facultyNameHe : signature.facultyNameEn}</p>
      <p className="mt-1 text-xs text-muted">
        {he ? 'נחתם דיגיטלית: ' : 'Digitally signed: '}
        {new Date(signature.signedAt).toLocaleString(he ? 'he-IL' : 'en-GB', { dateStyle: 'short', timeStyle: 'short' })}
      </p>
      <p className="mt-1 text-xs">
        <span className="text-muted">{he ? 'קוד חתימה: ' : 'Signature code: '}</span>
        <span className="font-mono font-semibold text-ink" dir="ltr">{signature.code}</span>
      </p>
      <p className={`mt-1 text-xs font-semibold ${signature.valid ? 'text-success' : 'text-danger'}`} role={signature.valid ? undefined : 'alert'}>
        {signature.valid
          ? `✓ ${he ? 'החתימה תקפה' : 'Signature valid'}`
          : `⚠ ${he ? 'החתימה אינה תקפה — הציונים שונו לאחר החתימה' : 'Signature invalid — scores were changed after signing'}`}
      </p>
    </div>
  );
}

export function EvaluationFormModal({ milestoneId, onClose, onChanged }: EvaluationFormModalProps) {
  const { lang } = useLanguage();
  const he = lang === 'he';
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalA11y(dialogRef, true, onClose);

  const [form, setForm] = useState<EvaluationFormView | null>(null);
  const [loadError, setLoadError] = useState('');
  // studentId -> componentKey -> raw input string
  const [draft, setDraft] = useState<Record<string, Record<string, string>>>({});
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  // Supervisor's decision on the computed grades.
  const [overriding, setOverriding] = useState(false);
  const [overrideGrades, setOverrideGrades] = useState<Record<string, string>>({});
  const [overrideReason, setOverrideReason] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await apiClient.getEvaluationForm(milestoneId);
      setForm(data);
      setLoadError('');
      // Prefill the viewer's own previously-submitted scores, if any.
      const own = data.viewer.role === 'supervisor'
        ? data.supervisor.scores
        : data.viewer.role === 'examiner'
          ? data.examiners.find((e) => e.scores)?.scores ?? null
          : null;
      const ownComment = data.viewer.role === 'supervisor' ? data.supervisor.comment : data.examiners.find((e) => e.comment != null)?.comment ?? null;
      setDraft(Object.fromEntries(data.students.map((s) => [s.id, Object.fromEntries(Object.entries(own?.[s.id] ?? {}).map(([k, v]) => [k, String(v)]))])));
      setComment(ownComment ?? '');
      setOverrideGrades(Object.fromEntries(data.totals.map((t) => [t.studentId, t.milestoneGrade != null ? String(t.milestoneGrade) : ''])));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : he ? 'טעינת הטופס נכשלה' : 'Failed to load the form');
    }
  }, [milestoneId, he]);

  useEffect(() => { load(); }, [load]);

  const myGiver: 'supervisor' | 'examiner' | null = form?.viewer.canEdit
    ? form.viewer.role === 'supervisor' ? 'supervisor' : form.viewer.role === 'examiner' ? 'examiner' : null
    : null;
  const editableComponents = useMemo(
    () => (form && myGiver ? form.rubrics.filter((r) => r.giver === myGiver).flatMap((r) => r.components) : []),
    [form, myGiver],
  );
  const allFilled = !!form && editableComponents.length > 0 && form.students.every((s) => editableComponents.every((c) => (draft[s.id]?.[c.key] ?? '') !== ''));

  if (!form) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" className="w-full max-w-md rounded-xl bg-paper p-6 shadow-lg outline-none">
          {loadError ? <p className="text-sm text-danger" role="alert">{loadError}</p> : <p className="text-sm text-muted">{he ? 'טוען…' : 'Loading…'}</p>}
          <button type="button" onClick={onClose} className="mt-4 text-sm font-medium text-primary hover:underline">{he ? 'סגור' : 'Close'}</button>
        </div>
      </div>
    );
  }


  // What to show in a score cell for a row the viewer isn't editing.
  const cellValue = (giver: 'supervisor' | 'examiner', studentId: string, key: string): string => {
    if (giver === 'supervisor') {
      if (!form.supervisor.submitted) return '';
      const v = form.supervisor.scores?.[studentId]?.[key];
      return v == null ? '🔒' : String(v);
    }
    const visible = form.examiners.filter((e) => e.scores);
    if (visible.length === 0) return form.examiners.some((e) => e.submitted) ? '🔒' : '';
    const values = visible.map((e) => e.scores?.[studentId]?.[key]).filter((v): v is number => v != null);
    if (values.length === 0) return '';
    if (values.length === 1) return String(values[0]);
    return `${formatPoints(values.reduce((a, b) => a + b, 0) / values.length)} (${values.join(' / ')})`;
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError('');
    try {
      await apiClient.submitEvaluationForm(form.milestoneId, {
        scoresByStudent: Object.fromEntries(form.students.map((s) => [s.id, Object.fromEntries(editableComponents.map((c) => [c.key, Number(draft[s.id]?.[c.key]) || 0]))])),
        comment,
      });
      setMessage(he ? 'הטופס נחתם והוגש.' : 'The form was signed and submitted.');
      onChanged?.();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : he ? 'שליחת הטופס נכשלה' : 'Failed to submit the form');
    } finally {
      setSubmitting(false);
    }
  };

  const computed = form.totals.every((t) => t.milestoneGrade != null);
  const canDecide = form.viewer.role === 'supervisor' && computed && !form.gradeApproved && form.gradeOverrideStatus !== 'pending';

  const handleDecision = async (decision: 'approve' | 'override') => {
    setSubmitting(true);
    setError('');
    try {
      if (decision === 'approve') {
        await apiClient.decidePerStudentFinalGrade(form.milestoneId, { decision: 'approve' });
      } else {
        await apiClient.decidePerStudentFinalGrade(form.milestoneId, {
          decision: 'override',
          grades: Object.fromEntries(form.students.map((s) => [s.id, Number(overrideGrades[s.id])])),
          reason: overrideReason,
        });
      }
      setMessage(he ? 'ההחלטה נשלחה לאישור הרכז/ת.' : "The decision was sent for the coordinator's approval.");
      setOverriding(false);
      onChanged?.();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : he ? 'שליחת ההחלטה נכשלה' : 'Failed to submit the decision');
    } finally {
      setSubmitting(false);
    }
  };

  const allComponents = form.rubrics.flatMap((r) => r.components.map((c) => ({ ...c, giver: r.giver })));
  // The "שלבים" column: one merged cell per run of consecutive rows sharing
  // a group (0 = covered by the cell above).
  const groupOf = (c: { groupHe?: string; groupEn?: string }) => (he ? c.groupHe : c.groupEn);
  const groupSpans = allComponents.map((c, idx) => {
    if (idx > 0 && groupOf(allComponents[idx - 1]!) === groupOf(c)) return 0;
    let n = 1;
    while (idx + n < allComponents.length && groupOf(allComponents[idx + n]!) === groupOf(c)) n++;
    return n;
  });
  const maxTotal = form.totals[0]?.maxPoints ?? allComponents.reduce((s, c) => s + c.maxScore, 0);
  const th = 'border border-line bg-surface px-2 py-1.5 text-xs font-semibold text-ink';
  const td = 'border border-line px-2 py-1.5 text-sm text-ink align-middle';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-2 sm:p-4">
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="evaluation-form-title"
        dir={he ? 'rtl' : 'ltr'}
        className="max-h-[95vh] w-full max-w-4xl overflow-y-auto rounded-xl bg-paper p-4 shadow-lg outline-none sm:p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id="evaluation-form-title" className="text-lg font-bold text-ink">{he ? form.titleHe : form.titleEn}</h2>
          <button type="button" onClick={onClose} aria-label={he ? 'סגור' : 'Close'} className="text-muted hover:text-ink">✕</button>
        </div>

        {/* Header — filled in by the system */}
        <dl className="mt-4 grid gap-x-6 gap-y-2 rounded-lg border border-line p-3 sm:grid-cols-2">
          {form.header.map((h) => (
            <div key={h.key} className="flex gap-2 text-sm">
              <dt className="shrink-0 font-semibold text-ink">{he ? h.labelHe : h.labelEn}:</dt>
              <dd className="text-ink">{h.value ?? <span className="text-muted">{he ? 'טרם נקבע' : 'Not set yet'}</span>}</dd>
            </div>
          ))}
        </dl>

        {/* Students */}
        <h3 className="mt-5 text-sm font-semibold text-ink">{he ? 'פרטי הסטודנט/ים' : 'Student details'}</h3>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={th}>{he ? 'שם ומשפחה' : 'Full name'}</th>
                <th className={th}>{he ? 'ת.ז.' : 'ID'}</th>
                <th className={th}>{he ? 'ציון סופי' : 'Final grade'}</th>
              </tr>
            </thead>
            <tbody>
              {form.students.map((s) => {
                const t = form.totals.find((x) => x.studentId === s.id);
                return (
                  <tr key={s.id}>
                    <td className={td}>{s.name}</td>
                    <td className={td} dir="ltr">{s.idNumber ?? '—'}</td>
                    <td className={`${td} font-semibold`}>{t?.projectFinalGrade ?? '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Criteria */}
        <h3 className="mt-5 text-sm font-semibold text-ink">{he ? 'מרכיבי הציון' : 'Grade components'}</h3>
        {form.viewer.canEdit && (
          <p className="mt-1 text-xs text-muted">{he ? 'יש לתת ניקוד עפ"י טווח הנקודות' : 'Score each criterion within its point range'}</p>
        )}
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse">
            <thead>
              <tr>
                <th className={th} rowSpan={2}>{he ? 'שלבים' : 'Stage'}</th>
                <th className={th} rowSpan={2}>{he ? 'קריטריון' : 'Criterion'}</th>
                <th className={th} colSpan={2}>{he ? 'נותן ההערכה' : 'Evaluated by'}</th>
                <th className={th} rowSpan={2}>{he ? 'טווח נקודות (עד)' : 'Max points'}</th>
                {form.students.map((s, i) => (
                  <th key={s.id} className={th} rowSpan={2}>
                    {he ? `ציון סטודנט ${'I'.repeat(i + 1)}` : `Student ${'I'.repeat(i + 1)} score`}
                    <span className="block font-normal text-muted">{s.name}</span>
                  </th>
                ))}
              </tr>
              <tr>
                <th className={th}>{he ? 'מנחה' : 'Supervisor'}</th>
                <th className={th}>{he ? 'בוחן' : 'Examiner'}</th>
              </tr>
            </thead>
            <tbody>
              {allComponents.map((c, idx) => {
                const group = groupOf(c);
                const span = groupSpans[idx] ?? 0;
                const editable = myGiver === c.giver;
                return (
                  <tr key={c.key}>
                    {span > 0 && (
                      <td className={`${td} font-semibold`} rowSpan={span}>{group ?? ''}</td>
                    )}
                    <td className={td}>{he ? c.labelHe : c.labelEn}</td>
                    <td className={`${td} text-center`} aria-label={c.giver === 'supervisor' ? (he ? 'ממולא ע"י המנחה' : 'Filled by the supervisor') : undefined}>{c.giver === 'supervisor' ? '✓' : ''}</td>
                    <td className={`${td} text-center`} aria-label={c.giver === 'examiner' ? (he ? 'ממולא ע"י הבוחנים' : 'Filled by the examiners') : undefined}>{c.giver === 'examiner' ? '✓' : ''}</td>
                    <td className={`${td} text-center`}>{c.maxScore}</td>
                    {form.students.map((s) => (
                      <td key={s.id} className={`${td} text-center`}>
                        {editable ? (
                          <input
                            type="number"
                            min={0}
                            max={c.maxScore}
                            inputMode="numeric"
                            aria-label={`${he ? c.labelHe : c.labelEn} — ${s.name}`}
                            value={draft[s.id]?.[c.key] ?? ''}
                            onChange={(e) => setDraft({ ...draft, [s.id]: { ...draft[s.id], [c.key]: clampScoreInput(e.target.value, c.maxScore) } })}
                            className="w-16 rounded-md border border-line bg-surface px-2 py-1 text-center text-sm text-ink focus:border-primary focus:outline-none"
                          />
                        ) : (
                          cellValue(c.giver, s.id, c.key)
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })}
              <tr>
                <td className={`${td} font-semibold`} colSpan={4}>{he ? 'סיכום' : 'Total'}</td>
                <td className={`${td} text-center font-semibold`}>{he ? `סה"כ ${maxTotal}` : `Total ${maxTotal}`}</td>
                {form.students.map((s) => {
                  const t = form.totals.find((x) => x.studentId === s.id);
                  const draftTotal = editableComponents.reduce((sum, c) => sum + (Number(draft[s.id]?.[c.key]) || 0), 0);
                  return (
                    <td key={s.id} className={`${td} text-center font-semibold`}>
                      {t?.points != null ? formatPoints(t.points) : myGiver ? `${draftTotal} (${he ? 'שלך' : 'yours'})` : '—'}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>

        {/* How the final grade is built */}
        {form.totals.some((t) => t.milestoneGrade != null) && (
          <div className="mt-4 rounded-lg border border-line p-3 text-sm">
            {form.students.map((s) => {
              const t = form.totals.find((x) => x.studentId === s.id)!;
              return (
                <p key={s.id} className="text-ink">
                  <span className="font-semibold">{s.name}:</span>{' '}
                  {he ? `אבן דרך זו ${formatPoints(t.points)}/${t.maxPoints} (${t.milestonePercent}%)` : `this milestone ${formatPoints(t.points)}/${t.maxPoints} (${t.milestonePercent}%)`}
                  {t.otherMilestones.map((o) => (
                    <span key={o.type}> + {he ? o.nameHe : o.nameEn} ({o.percent}%): {o.grade ?? (he ? 'טרם נוקד' : 'not graded yet')}</span>
                  ))}
                  {' = '}
                  <span className="font-semibold">{t.projectFinalGrade ?? (he ? 'טרם סופי' : 'not final yet')}</span>
                </p>
              );
            })}
          </div>
        )}

        {/* Comment */}
        {myGiver ? (
          <label className="mt-4 block">
            <span className="mb-1.5 block text-sm font-medium text-ink">{he ? 'הערות' : 'Comments'}</span>
            <textarea
              rows={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
            />
          </label>
        ) : null}

        {/* Signatures */}
        <h3 className="mt-5 text-sm font-semibold text-ink">{he ? 'חתימות' : 'Signatures'}</h3>
        <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <SignatureBlock lang={lang} label={he ? 'מנחה' : 'Supervisor'} signature={form.supervisor.signature} pendingText={he ? `ממתין ל${form.supervisor.name || 'מנחה'}` : `Awaiting ${form.supervisor.name || 'the supervisor'}`} />
          {form.examiners.map((e) => (
            <SignatureBlock key={e.uid} lang={lang} label={he ? e.positionHe : e.positionEn} signature={e.signature} pendingText={he ? `ממתין ל${e.name}` : `Awaiting ${e.name}`} />
          ))}
          {form.examiners.length === 0 && (
            <div className="rounded-lg border border-dashed border-line p-3 text-sm text-muted">{he ? 'טרם הוקצו בוחנים' : 'No examiners assigned yet'}</div>
          )}
        </div>

        {form.viewer.lockedReasonHe && (form.viewer.role === 'examiner' || form.viewer.role === 'supervisor') && !canDecide && (
          <p className="mt-4 rounded-md bg-surface px-3 py-2 text-sm text-muted">{he ? form.viewer.lockedReasonHe : form.viewer.lockedReasonEn}</p>
        )}
        {form.viewer.role === 'supervisor' && form.gradeOverrideStatus === 'pending' && (
          <p className="mt-4 rounded-md bg-surface px-3 py-2 text-sm text-muted">{he ? 'הציונים ממתינים לאישור הרכז/ת.' : "The grades are awaiting the coordinator's approval."}</p>
        )}
        {form.gradeApproved && (
          <p className="mt-4 rounded-md bg-success-bg px-3 py-2 text-sm font-semibold text-success">{he ? 'הציונים אושרו סופית.' : 'The grades were finalized.'}</p>
        )}

        {error && <p className="mt-3 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{error}</p>}
        {message && <p className="mt-3 rounded-md bg-success-bg px-3 py-2 text-sm text-success" role="status">{message}</p>}

        {myGiver && (
          <div className="mt-4">
            <p className="text-xs text-muted">
              {he
                ? `בהגשה הטופס ייחתם דיגיטלית בשמך (${form.viewer.positionHe ?? ''}), כולל הפקולטה שלך וקוד חתימה ייחודי. ניתן לעדכן ולחתום מחדש עד שכל ההערכות יוגשו.`
                : `Submitting signs the form digitally in your name (${form.viewer.positionEn ?? ''}), with your faculty and a unique signature code. You can update and re-sign until every evaluation is in.`}
            </p>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || !allFilled}
              className="mt-2 w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60"
            >
              {submitting ? '…' : he ? '✍️ חתום/י והגש/י' : '✍️ Sign & submit'}
            </button>
          </div>
        )}

        {canDecide && (
          <div className="mt-4 rounded-lg border border-line p-3">
            <p className="text-sm font-semibold text-ink">{he ? 'כל ההערכות הוגשו — אישור הציונים המחושבים' : 'All evaluations are in — confirm the computed grades'}</p>
            {!overriding ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => handleDecision('approve')} disabled={submitting} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60">
                  {he ? 'אשר/י את הציונים' : 'Approve the grades'}
                </button>
                <button type="button" onClick={() => setOverriding(true)} disabled={submitting} className="rounded-lg border border-line px-4 py-2 text-sm font-semibold text-ink hover:bg-surface disabled:opacity-60">
                  {he ? 'שנה/י ציונים' : 'Change grades'}
                </button>
              </div>
            ) : (
              <div className="mt-3 grid gap-3">
                {form.students.map((s) => (
                  <label key={s.id} className="flex items-center gap-3 text-sm text-ink">
                    <span className="min-w-[8rem]">{s.name}</span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={overrideGrades[s.id] ?? ''}
                      onChange={(e) => setOverrideGrades({ ...overrideGrades, [s.id]: clampScoreInput(e.target.value, 100) })}
                      className="w-20 rounded-md border border-line bg-surface px-2 py-1 text-center text-sm"
                    />
                    <span className="text-xs text-muted">/100</span>
                  </label>
                ))}
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-ink">{he ? 'נימוק (חובה)' : 'Reason (required)'}</span>
                  <textarea rows={2} value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm" />
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleDecision('override')}
                    disabled={submitting || !overrideReason.trim() || form.students.some((s) => (overrideGrades[s.id] ?? '') === '')}
                    className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60"
                  >
                    {he ? 'שלח/י לאישור' : 'Send for approval'}
                  </button>
                  <button type="button" onClick={() => setOverriding(false)} className="rounded-lg px-4 py-2 text-sm text-muted hover:text-ink">{he ? 'ביטול' : 'Cancel'}</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
