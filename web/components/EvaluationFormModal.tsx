'use client';

// components/EvaluationFormModal.tsx
// The per-student evaluation form (server: evaluationFormController.ts;
// template: finalGradeComponents.perStudent) rendered like its paper
// original: a system-filled header, the students table, the criteria with
// their "נותן ההערכה" (supervisor/examiner) marks and one score column per
// student, the totals, and the digital signatures. Built for Electrical
// Engineering's B.Sc. form (one milestone) and M.Sc. project form (split
// across the project-book and presentation milestones — one section each,
// each with its own graders, submission and approval).
//
// One component for every viewer: the supervisor fills the supervisor rows
// and later approves/changes the computed grades, an examiner fills the
// examiner rows, coordinators and other staff get a read-only view. What
// each viewer may see/edit is decided server-side (per-section `viewer`, and
// null scores for anything hidden from them).

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient, type EvaluationFormSection, type EvaluationFormSignature, type EvaluationFormView } from '@/lib/apiClient';
import { useModalA11y } from '@/hooks/useModalA11y';
import { examinerSignatureStyle } from '@/lib/examinerSignature';

interface EvaluationFormModalProps {
  milestoneId: string;
  onClose: () => void;
  /** Called after a successful submit/decision so the caller can refresh. */
  onChanged?: () => void;
}

// milestoneId -> studentId -> componentKey -> raw input
type Draft = Record<string, Record<string, Record<string, string>>>;

function clampScoreInput(raw: string, max: number): string {
  if (raw === '') return raw;
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;
  return String(Math.min(Math.max(n, 0), max));
}

function formatNumber(n: number | null | undefined): string {
  if (n == null) return '—';
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export function SignatureBlock({ label, signature, pendingText, he }: { label: string; signature: EvaluationFormSignature | null; pendingText: string; he: boolean }) {
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
          : `⚠ ${he ? 'החתימה אינה תקפה — הנתונים שונו לאחר החתימה' : 'Signature invalid — the data changed after signing'}`}
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
  const [draft, setDraft] = useState<Draft>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [busySection, setBusySection] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  // Supervisor's decision on one section's computed grades.
  const [overridingSection, setOverridingSection] = useState<string | null>(null);
  const [overrideGrades, setOverrideGrades] = useState<Record<string, string>>({});
  const [overrideReason, setOverrideReason] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await apiClient.getEvaluationForm(milestoneId);
      setForm(data);
      setLoadError('');
      // Prefill the viewer's own previously-submitted scores per section.
      const nextDraft: Draft = {};
      const nextComments: Record<string, string> = {};
      for (const sec of data.sections) {
        const own = sec.viewer.role === 'supervisor' ? sec.supervisor : sec.viewer.role === 'examiner' ? sec.examiners.find((e) => e.scores) : undefined;
        nextDraft[sec.milestoneId] = Object.fromEntries(data.students.map((s) => [s.id, Object.fromEntries(Object.entries(own?.scores?.[s.id] ?? {}).map(([k, v]) => [k, String(v)]))]));
        nextComments[sec.milestoneId] = own?.comment ?? '';
      }
      setDraft(nextDraft);
      setComments(nextComments);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : he ? 'טעינת הטופס נכשלה' : 'Failed to load the form');
    }
  }, [milestoneId, he]);

  useEffect(() => { load(); }, [load]);

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

  const multiSection = form.sections.length > 1;
  const th = 'border border-line bg-surface px-2 py-1.5 text-xs font-semibold text-ink';
  const td = 'border border-line px-2 py-1.5 text-sm text-ink align-middle';

  const editableComponentsOf = (sec: EvaluationFormSection) =>
    sec.viewer.canEdit && sec.viewer.role ? sec.rubrics.filter((r) => r.giver === sec.viewer.role).flatMap((r) => r.components) : [];

  const submitSection = async (sec: EvaluationFormSection) => {
    const editable = editableComponentsOf(sec);
    setBusySection(sec.milestoneId);
    setError('');
    setMessage('');
    try {
      await apiClient.submitEvaluationForm(sec.milestoneId, {
        scoresByStudent: Object.fromEntries(form.students.map((s) => [s.id, Object.fromEntries(editable.map((c) => [c.key, Number(draft[sec.milestoneId]?.[s.id]?.[c.key]) || 0]))])),
        comment: comments[sec.milestoneId] ?? '',
      });
      setMessage(he ? 'הטופס נחתם והוגש.' : 'The form was signed and submitted.');
      onChanged?.();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : he ? 'שליחת הטופס נכשלה' : 'Failed to submit the form');
    } finally {
      setBusySection(null);
    }
  };

  const decideSection = async (sec: EvaluationFormSection, decision: 'approve' | 'override') => {
    setBusySection(sec.milestoneId);
    setError('');
    setMessage('');
    try {
      if (decision === 'approve') {
        await apiClient.decidePerStudentFinalGrade(sec.milestoneId, { decision: 'approve' });
      } else {
        await apiClient.decidePerStudentFinalGrade(sec.milestoneId, {
          decision: 'override',
          grades: Object.fromEntries(form.students.map((s) => [s.id, Number(overrideGrades[s.id])])),
          reason: overrideReason,
        });
      }
      setMessage(he ? 'ההחלטה נשלחה לאישור הרכז/ת.' : "The decision was sent for the coordinator's approval.");
      setOverridingSection(null);
      onChanged?.();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : he ? 'שליחת ההחלטה נכשלה' : 'Failed to submit the decision');
    } finally {
      setBusySection(null);
    }
  };

  const renderSection = (sec: EvaluationFormSection) => {
    const editable = editableComponentsOf(sec);
    const myGiver = sec.viewer.canEdit ? sec.viewer.role : null;
    const sectionDraft = draft[sec.milestoneId] ?? {};
    const allFilled = editable.length > 0 && form.students.every((s) => editable.every((c) => (sectionDraft[s.id]?.[c.key] ?? '') !== ''));
    const weighted = sec.totalsDisplay === 'weighted';
    const rows = sec.rubrics.flatMap((r) => r.components.map((c) => ({ ...c, giver: r.giver, percentPerGrader: r.percentPerGrader, percentOfTotal: r.percentOfTotal })));
    const groupOf = (c: { groupHe?: string; groupEn?: string }) => (he ? c.groupHe : c.groupEn);
    const groupSpans = rows.map((c, idx) => {
      if (idx > 0 && groupOf(rows[idx - 1]!) === groupOf(c)) return 0;
      let n = 1;
      while (idx + n < rows.length && groupOf(rows[idx + n]!) === groupOf(c)) n++;
      return n;
    });
    const hasGroups = rows.some((c) => groupOf(c));

    const cellValue = (giver: 'supervisor' | 'examiner', studentId: string, key: string): string => {
      if (giver === 'supervisor') {
        if (!sec.supervisor.submitted) return '';
        const v = sec.supervisor.scores?.[studentId]?.[key];
        return v == null ? '🔒' : String(v);
      }
      const visible = sec.examiners.filter((e) => e.scores);
      if (visible.length === 0) return sec.examiners.some((e) => e.submitted) ? '🔒' : '';
      const values = visible.map((e) => e.scores?.[studentId]?.[key]).filter((v): v is number => v != null);
      if (values.length === 0) return '';
      if (values.length === 1) return String(values[0]);
      return `${formatNumber(values.reduce((a, b) => a + b, 0) / values.length)} (${values.join(' / ')})`;
    };

    const computed = sec.totals.every((t) => t.milestoneGrade != null);
    const canDecide = sec.viewer.role === 'supervisor' && computed && !sec.gradeApproved && sec.gradeOverrideStatus !== 'pending';
    const busy = busySection === sec.milestoneId;

    return (
      <section key={sec.milestoneId} className={multiSection ? 'mt-6 rounded-xl border border-line p-3 sm:p-4' : 'mt-5'} aria-labelledby={`sec-${sec.milestoneId}`}>
        <h3 id={`sec-${sec.milestoneId}`} className="text-sm font-semibold text-ink">
          {multiSection ? `${he ? sec.nameHe : sec.nameEn} · ${sec.percent}%` : he ? 'מרכיבי הציון' : 'Grade components'}
        </h3>
        {myGiver && <p className="mt-1 text-xs text-muted">{weighted ? (he ? 'ציון 0–100 לכל מרכיב' : 'Score each component 0–100') : he ? 'יש לתת ניקוד עפ"י טווח הנקודות' : 'Score each criterion within its point range'}</p>}

        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[600px] border-collapse">
            <thead>
              <tr>
                {hasGroups && <th className={th} rowSpan={2}>{he ? 'שלבים' : 'Stage'}</th>}
                <th className={th} rowSpan={2}>{he ? 'קריטריון' : 'Criterion'}</th>
                <th className={th} colSpan={2}>{he ? 'נותן ההערכה' : 'Evaluated by'}</th>
                <th className={th} rowSpan={2}>{weighted ? (he ? 'משקל מהציון הסופי' : 'Weight in final grade') : he ? 'טווח נקודות (עד)' : 'Max points'}</th>
                {form.students.map((s, i) => (
                  <th key={s.id} className={th} rowSpan={2}>
                    {form.students.length > 1 ? (he ? `ציון סטודנט ${'I'.repeat(i + 1)}` : `Student ${'I'.repeat(i + 1)}`) : he ? 'ציון' : 'Score'}
                    {form.students.length > 1 && <span className="block font-normal text-muted">{s.name}</span>}
                  </th>
                ))}
              </tr>
              <tr>
                <th className={th}>{he ? 'מנחה' : 'Supervisor'}</th>
                <th className={th}>{he ? 'בוחן' : 'Examiner'}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c, idx) => {
                const span = groupSpans[idx] ?? 0;
                const isMine = myGiver === c.giver;
                return (
                  <tr key={c.key}>
                    {hasGroups && span > 0 && <td className={`${td} font-semibold`} rowSpan={span}>{groupOf(c) ?? ''}</td>}
                    <td className={td}>{he ? c.labelHe : c.labelEn}</td>
                    <td className={`${td} text-center`}>{c.giver === 'supervisor' ? '✓' : ''}</td>
                    <td className={`${td} text-center`}>{c.giver === 'examiner' ? '✓' : ''}</td>
                    <td className={`${td} text-center`}>
                      {weighted
                        ? c.giver === 'examiner' && c.percentPerGrader !== c.percentOfTotal
                          ? (he ? `${formatNumber(c.percentPerGrader)}% לכל בוחן` : `${formatNumber(c.percentPerGrader)}% per examiner`)
                          : `${formatNumber(c.percentPerGrader)}%`
                        : c.maxScore}
                    </td>
                    {form.students.map((s) => (
                      <td key={s.id} className={`${td} text-center`}>
                        {isMine ? (
                          <input
                            type="number"
                            min={0}
                            max={c.maxScore}
                            inputMode="numeric"
                            aria-label={`${he ? c.labelHe : c.labelEn} — ${s.name}`}
                            value={sectionDraft[s.id]?.[c.key] ?? ''}
                            onChange={(e) => setDraft({
                              ...draft,
                              [sec.milestoneId]: { ...sectionDraft, [s.id]: { ...sectionDraft[s.id], [c.key]: clampScoreInput(e.target.value, c.maxScore) } },
                            })}
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
                <td className={`${td} font-semibold`} colSpan={hasGroups ? 4 : 3}>{he ? 'סיכום' : 'Total'}</td>
                <td className={`${td} text-center font-semibold`}>{weighted ? `${sec.percent}%` : he ? `סה"כ ${sec.totals[0]?.maxPoints ?? ''}` : `Total ${sec.totals[0]?.maxPoints ?? ''}`}</td>
                {form.students.map((s) => {
                  const t = sec.totals.find((x) => x.studentId === s.id);
                  const draftTotal = editable.reduce((sum, c) => sum + (Number(sectionDraft[s.id]?.[c.key]) || 0), 0);
                  let text = '—';
                  if (weighted && t?.milestoneGrade != null) text = `${t.milestoneGrade} → ${formatNumber(t.contribution)}`;
                  else if (!weighted && t?.points != null) text = formatNumber(t.points);
                  else if (myGiver && !weighted) text = `${draftTotal} (${he ? 'שלך' : 'yours'})`;
                  return <td key={s.id} className={`${td} text-center font-semibold`}>{text}</td>;
                })}
              </tr>
            </tbody>
          </table>
        </div>
        {weighted && sec.totals.some((t) => t.milestoneGrade != null) && (
          <p className="mt-1 text-xs text-muted">{he ? `ציון אבן הדרך (מתוך 100) → תרומה לציון הסופי (${sec.percent}%)` : `Milestone grade (out of 100) → contribution to the final grade (${sec.percent}%)`}</p>
        )}

        {myGiver && (
          <label className="mt-3 block">
            <span className="mb-1.5 block text-sm font-medium text-ink">{he ? 'הערות' : 'Comments'}</span>
            <textarea
              rows={2}
              value={comments[sec.milestoneId] ?? ''}
              onChange={(e) => setComments({ ...comments, [sec.milestoneId]: e.target.value })}
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
            />
          </label>
        )}

        <h4 className="mt-4 text-xs font-semibold text-muted">{he ? 'חתימות' : 'Signatures'}</h4>
        <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <SignatureBlock he={he} label={he ? 'מנחה' : 'Supervisor'} signature={sec.supervisor.signature} pendingText={he ? `ממתין ל${sec.supervisor.name || 'מנחה'}` : `Awaiting ${sec.supervisor.name || 'the supervisor'}`} />
          {sec.examiners.map((e) => (
            <SignatureBlock key={e.uid} he={he} label={he ? e.positionHe : e.positionEn} signature={e.signature} pendingText={he ? `ממתין ל${e.name}` : `Awaiting ${e.name}`} />
          ))}
          {sec.examiners.length === 0 && (
            <div className="rounded-lg border border-dashed border-line p-3 text-sm text-muted">{he ? 'טרם הוקצו בוחנים' : 'No examiners assigned yet'}</div>
          )}
        </div>
        {(sec.approvals.supervisor || sec.approvals.coordinator || computed) && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <SignatureBlock he={he} label={he ? 'חתימת המנחה (אישור הציון)' : "Supervisor's signature (grade approval)"} signature={sec.approvals.supervisor} pendingText={he ? 'ממתין לאישור המנחה' : "Awaiting the supervisor's approval"} />
            <SignatureBlock he={he} label={he ? 'חתימת רכז/ת פרויקטים' : "Projects coordinator's signature"} signature={sec.approvals.coordinator} pendingText={he ? 'ממתין לאישור הרכז/ת' : "Awaiting the coordinator's approval"} />
          </div>
        )}

        {sec.viewer.lockedReasonHe && sec.viewer.role && !canDecide && !sec.gradeApproved && sec.gradeOverrideStatus !== 'pending' && (
          <p className="mt-3 rounded-md bg-surface px-3 py-2 text-sm text-muted">{he ? sec.viewer.lockedReasonHe : sec.viewer.lockedReasonEn}</p>
        )}
        {sec.viewer.role === 'supervisor' && sec.gradeOverrideStatus === 'pending' && (
          <p className="mt-3 rounded-md bg-surface px-3 py-2 text-sm text-muted">{he ? 'הציונים ממתינים לאישור הרכז/ת.' : "The grades are awaiting the coordinator's approval."}</p>
        )}
        {sec.gradeApproved && (
          <p className="mt-3 rounded-md bg-success-bg px-3 py-2 text-sm font-semibold text-success">{he ? 'הציונים אושרו סופית.' : 'The grades were finalized.'}</p>
        )}

        {myGiver && (
          <div className="mt-3">
            <p className="text-xs text-muted">
              {he
                ? sec.viewer.role === 'examiner'
                  ? `בהגשה הטופס ייחתם דיגיטלית בשמך (${sec.viewer.positionHe ?? ''}), כולל הפקולטה שלך וקוד חתימה ייחודי. לאחר החתימה לא ניתן לשנות את הציונים.`
                  : `בהגשה הטופס ייחתם דיגיטלית בשמך (${sec.viewer.positionHe ?? ''}), כולל הפקולטה שלך וקוד חתימה ייחודי. ניתן לעדכן ולחתום מחדש עד שכל ההערכות יוגשו.`
                : sec.viewer.role === 'examiner'
                  ? `Submitting signs the form digitally in your name (${sec.viewer.positionEn ?? ''}), with your faculty and a unique signature code. Once signed, your scores can no longer be changed.`
                  : `Submitting signs the form digitally in your name (${sec.viewer.positionEn ?? ''}), with your faculty and a unique signature code. You can update and re-sign until every evaluation is in.`}
            </p>
            <button
              type="button"
              onClick={() => {
                // An examiner's signature is final (server: evaluationGate).
                if (sec.viewer.role === 'examiner' && !window.confirm(he
                  ? 'לאחר החתימה לא ניתן יהיה לשנות את הציונים. לחתום ולהגיש?'
                  : "Once signed, your scores can't be changed. Sign and submit?")) return;
                submitSection(sec);
              }}
              disabled={busy || !allFilled}
              className="mt-2 w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60"
            >
              {busy ? '…' : he ? '✍️ חתום/י והגש/י' : '✍️ Sign & submit'}
            </button>
          </div>
        )}

        {canDecide && (
          <div className="mt-3 rounded-lg border border-line p-3">
            <p className="text-sm font-semibold text-ink">{he ? 'כל ההערכות הוגשו — אישור הציונים המחושבים' : 'All evaluations are in — confirm the computed grades'}</p>
            {overridingSection !== sec.milestoneId ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => decideSection(sec, 'approve')} disabled={busy} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60">
                  {he ? '✍️ אשר/י וחתום/י' : '✍️ Approve & sign'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOverridingSection(sec.milestoneId);
                    setOverrideGrades(Object.fromEntries(sec.totals.map((t) => [t.studentId, t.milestoneGrade != null ? String(t.milestoneGrade) : ''])));
                    setOverrideReason('');
                  }}
                  disabled={busy}
                  className="rounded-lg border border-line px-4 py-2 text-sm font-semibold text-ink hover:bg-surface disabled:opacity-60"
                >
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
                    onClick={() => decideSection(sec, 'override')}
                    disabled={busy || !overrideReason.trim() || form.students.some((s) => (overrideGrades[s.id] ?? '') === '')}
                    className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60"
                  >
                    {he ? '✍️ חתום/י ושלח/י לאישור' : '✍️ Sign & send for approval'}
                  </button>
                  <button type="button" onClick={() => setOverridingSection(null)} className="rounded-lg px-4 py-2 text-sm text-muted hover:text-ink">{he ? 'ביטול' : 'Cancel'}</button>
                </div>
              </div>
            )}
          </div>
        )}
      </section>
    );
  };

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
                <th className={th}>{he ? 'ציון סופי משוקלל' : 'Weighted final grade'}</th>
              </tr>
            </thead>
            <tbody>
              {form.students.map((s) => {
                const t = form.studentTotals.find((x) => x.studentId === s.id);
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

        {/* Milestones graded outside this form that still carry part of the
            grade — e.g. "דוח ביניים / מנחה 10%". */}
        {form.studentTotals.some((t) => t.otherMilestones.length > 0) && (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={th}>{he ? 'מרכיב' : 'Component'}</th>
                  <th className={th}>{he ? 'משקל הציון' : 'Weight'}</th>
                  {form.students.map((s) => <th key={s.id} className={th}>{form.students.length > 1 ? s.name : he ? 'ציון' : 'Grade'}</th>)}
                </tr>
              </thead>
              <tbody>
                {(form.studentTotals[0]?.otherMilestones ?? []).map((o) => (
                  <tr key={o.type}>
                    <td className={td}>{he ? o.nameHe : o.nameEn}</td>
                    <td className={`${td} text-center`}>{o.percent}%</td>
                    {form.students.map((s) => {
                      const g = form.studentTotals.find((x) => x.studentId === s.id)?.otherMilestones.find((x) => x.type === o.type)?.grade;
                      return <td key={s.id} className={`${td} text-center`}>{g ?? (he ? 'טרם נוקד' : 'Not graded yet')}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {form.sections.map(renderSection)}

        {error && <p className="mt-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{error}</p>}
        {message && <p className="mt-4 rounded-md bg-success-bg px-3 py-2 text-sm text-success" role="status">{message}</p>}
      </div>
    </div>
  );
}
