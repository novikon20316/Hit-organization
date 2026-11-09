'use client';

// app/thesis-exam/page.tsx
// The CS M.Sc. thesis exam (server's services/thesisExam.ts), for everyone
// taking part: the supervisor nominates 2 examiners, the grad school head
// approves the nomination, every participant (student, supervisor, committee
// members, examiners) picks 5 dates with their free hours, the system matches
// a common slot, the program head and then the grad school head approve it,
// the examiners fill the exam form after the exam, and the committee reads
// the forms. Each card shows only the actions open to the viewer; the server
// enforces every one of them.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { useRequireRole } from '@/hooks/useRequireRole';
import { useLanguage } from '@/contexts/LanguageContext';
import { useLiveRefresh } from '@/hooks/useLiveRefresh';
import { apiClient, type ThesisExamCard, type ThesisExamNomineeInput } from '@/lib/apiClient';
import { VALID_ROLES } from '@/lib/roles';
import { THESIS_EXAM_STEPS, THESIS_EXAM_STATUS_LABEL, formatExamDay, formatExamSlot } from '@/lib/thesisExam';
import { AvailabilityPicker } from '@/components/thesisExam/AvailabilityPicker';
import { ThesisExamFormPanel, type ThesisExamFormSource } from '@/components/thesisExam/ThesisExamFormPanel';

export default function ThesisExamPage() {
  const { loading: guardLoading, isAllowed } = useRequireRole(VALID_ROLES);
  const { lang } = useLanguage();
  const he = lang === 'he';
  const [exams, setExams] = useState<ThesisExamCard[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [formFor, setFormFor] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const res = await apiClient.getMyThesisExams();
      setExams(res.exams);
      setLoadError('');
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : he ? 'הטעינה נכשלה' : 'Failed to load');
    } finally {
      setLoadingData(false);
    }
  }, [he]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    if (isAllowed) void fetchAll();
  }, [isAllowed, fetchAll]);
  useLiveRefresh(fetchAll);

  const formSource = useMemo<ThesisExamFormSource | null>(() => formFor ? {
    load: () => apiClient.getThesisExamForm(formFor),
    submit: (body) => apiClient.submitThesisExamForm(formFor, body),
  } : null, [formFor]);

  if (guardLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-paper"><p className="text-sm text-muted">…</p></div>;
  }

  return (
    <DashboardShell
      title={he ? 'בחינת תזה' : 'Thesis Exam'}
      subtitle={he ? 'מינוי בוחנים, בחירת מועד, אישורים וטופס הבחינה' : 'Examiner nomination, scheduling, approvals and the exam form'}
    >
      {loadError && <p className="mb-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{loadError}</p>}
      {loadingData ? (
        <p className="text-sm text-muted">…</p>
      ) : exams.length === 0 ? (
        <p className="text-sm text-muted">{he ? 'אין בחינות תזה שבהן את/ה משתתף/ת כרגע.' : "You're not part of any thesis exam right now."}</p>
      ) : (
        <div className="grid gap-4">
          {exams.map((exam) => <ExamCard key={exam.milestoneId} exam={exam} lang={lang} onChanged={fetchAll} onOpenForm={() => setFormFor(exam.milestoneId)} />)}
        </div>
      )}

      {formFor && formSource && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4" role="dialog" aria-modal="true" aria-label={he ? 'טופס מבחן תיזה' : 'Thesis exam form'}>
          <div className="relative my-8 w-full max-w-3xl rounded-xl bg-surface p-5 shadow-xl">
            <button type="button" onClick={() => setFormFor(null)} className="absolute end-3 top-3 rounded-full px-2 text-lg text-muted hover:text-ink" aria-label={he ? 'סגירה' : 'Close'}>✕</button>
            <ThesisExamFormPanel source={formSource} lang={lang} onSubmitted={fetchAll} />
          </div>
        </div>
      )}
    </DashboardShell>
  );
}

function Steps({ status, lang }: { status: ThesisExamCard['status']; lang: 'he' | 'en' }) {
  const current = THESIS_EXAM_STEPS.findIndex((s) => s.status === status);
  return (
    <ol className="mt-3 flex flex-wrap gap-1 text-[11px]">
      {THESIS_EXAM_STEPS.map((s, i) => (
        <li
          key={s.status}
          className={`rounded-full px-2 py-0.5 ${i < current ? 'bg-success-bg text-success' : i === current ? 'bg-primary text-primary-ink font-semibold' : 'bg-paper text-muted'}`}
          aria-current={i === current ? 'step' : undefined}
        >
          {i < current ? '✓ ' : ''}{lang === 'he' ? s.he : s.en}
        </li>
      ))}
    </ol>
  );
}

function ExamCard({ exam, lang, onChanged, onOpenForm }: { exam: ThesisExamCard; lang: 'he' | 'en'; onChanged: () => Promise<void>; onOpenForm: () => void }) {
  const he = lang === 'he';
  const has = (a: ThesisExamCard['actions'][number]) => exam.actions.includes(a);
  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="truncate text-base font-bold text-ink">{he ? exam.projectTitleHe : exam.projectTitleEn}</h2>
          <p className="text-xs text-muted">
            {exam.studentNames.join(', ')}{exam.supervisorName ? ` · ${he ? 'מנחה' : 'Supervisor'}: ${exam.supervisorName}` : ''}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-paper px-2.5 py-1 text-xs font-semibold text-ink">{THESIS_EXAM_STATUS_LABEL[exam.status][lang]}</span>
      </div>
      <Steps status={exam.status} lang={lang} />

      {exam.examinerNames.length > 0 && (
        <p className="mt-3 text-xs text-muted">{he ? 'בוחנים' : 'Examiners'}: {exam.examinerNames.join(', ')}</p>
      )}
      {exam.schedule && (
        <p className="mt-2 rounded-md bg-success-bg px-3 py-2 text-sm font-semibold text-success">🗓️ {he ? 'מועד הבחינה' : 'Exam'}: {formatExamSlot(exam.schedule, lang)}</p>
      )}

      {has('nominate') && <NominationEditor exam={exam} lang={lang} onDone={onChanged} />}
      {has('review_nomination') && <NominationReview exam={exam} lang={lang} onDone={onChanged} />}

      {exam.status === 'exam_availability' && (
        <div className="mt-3">
          <p className="text-xs text-muted">
            {he ? `סבב ${exam.availabilityRound} · ${exam.submittedCount} מתוך ${exam.participantCount} משתתפים בחרו תאריכים` : `Round ${exam.availabilityRound} · ${exam.submittedCount} of ${exam.participantCount} participants picked dates`}
          </p>
          {exam.pendingParticipants.length > 0 && (
            <p className="mt-1 text-xs text-muted">{he ? 'טרם בחרו' : 'Still to pick'}: {exam.pendingParticipants.map((p) => p.name).join(', ')}</p>
          )}
          {has('availability') && exam.window && (
            <AvailabilityPicker
              lang={lang}
              window={exam.window}
              count={exam.rules.datesPerParticipant}
              initial={exam.myAvailability}
              onSubmit={async (entries) => { await apiClient.submitThesisExamAvailability(exam.milestoneId, entries); await onChanged(); }}
            />
          )}
        </div>
      )}

      {(exam.status === 'exam_date_review' || exam.status === 'exam_date_final_review') && exam.proposedSlot && (
        <p className="mt-3 text-sm text-ink">{he ? 'המועד המשותף שנמצא' : 'Common time found'}: <strong>{formatExamSlot(exam.proposedSlot, lang)}</strong></p>
      )}
      {has('review_date') && <DateReview exam={exam} lang={lang} onDone={onChanged} />}

      {(exam.status === 'exam_scheduled' || exam.status === 'exam_committee_review') && (
        <p className="mt-3 text-xs text-muted">{he ? `${exam.formsSubmittedCount} מתוך ${exam.examinerCount} בוחנים מילאו את טופס הבחינה` : `${exam.formsSubmittedCount} of ${exam.examinerCount} examiners filled in the exam form`}</p>
      )}
      {has('form') && (
        <button type="button" onClick={onOpenForm} className="mt-2 rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-primary-ink hover:bg-primary-hover">
          {exam.myFormSubmitted ? (he ? 'צפייה בטופס ששלחתי' : 'View my form') : exam.formOpen ? (he ? 'מילוי טופס מבחן התזה' : 'Fill in the thesis exam form') : (he ? 'טופס מבחן התזה' : 'Thesis exam form')}
        </button>
      )}
      {has('view_forms') && (
        <div className="mt-2">
          <button type="button" onClick={onOpenForm} className="rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-primary-ink hover:bg-primary-hover">
            {he ? 'צפייה בטופסי הבוחנים' : "View the examiners' forms"}
          </button>
          {exam.myRoles.committee && (
            <p className="mt-1 text-xs text-muted">{he ? 'הפעולות של הוועדה בהתאם לטפסים יוגדרו בהמשך.' : "The committee's actions on the forms will be defined later."}</p>
          )}
        </div>
      )}
    </section>
  );
}

type NomineeDraft = { type: 'internal'; uid: string } | { type: 'external'; name: string; email: string; institution: string };

function NominationEditor({ exam, lang, onDone }: { exam: ThesisExamCard; lang: 'he' | 'en'; onDone: () => Promise<void> }) {
  const he = lang === 'he';
  const [candidates, setCandidates] = useState<Array<{ uid: string; name: string }>>([]);
  const [slots, setSlots] = useState<NomineeDraft[]>(() => Array.from({ length: exam.rules.examinerCount }, () => ({ type: 'internal', uid: '' })));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    apiClient.getThesisExamCandidates(exam.milestoneId)
      .then((res) => { if (!cancelled) setCandidates(res.candidates); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : ''); });
    return () => { cancelled = true; };
  }, [exam.milestoneId]);

  const setSlot = (i: number, next: NomineeDraft) => setSlots((prev) => prev.map((s, idx) => (idx === i ? next : s)));

  const submit = async () => {
    const examiners: ThesisExamNomineeInput[] = [];
    for (const s of slots) {
      if (s.type === 'internal') {
        if (!s.uid) { setError(he ? 'יש לבחור את כל הבוחנים.' : 'Choose every examiner.'); return; }
        examiners.push({ type: 'internal', uid: s.uid });
      } else {
        if (!s.name.trim() || !s.email.trim()) { setError(he ? 'יש למלא שם ודוא"ל לכל בוחן חיצוני.' : 'Fill in a name and email for each outside examiner.'); return; }
        examiners.push({ type: 'external', name: s.name.trim(), email: s.email.trim(), ...(s.institution.trim() ? { institution: s.institution.trim() } : {}) });
      }
    }
    setBusy(true);
    setError('');
    try {
      await apiClient.nominateThesisExaminers(exam.milestoneId, examiners);
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : he ? 'השליחה נכשלה' : 'Sending failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 rounded-lg border border-line bg-paper p-3">
      <p className="text-sm font-semibold text-ink">{he ? `מינוי ${exam.rules.examinerCount} בוחנים` : `Nominate ${exam.rules.examinerCount} examiners`}</p>
      {exam.lastNominationRejection && (
        <p className="mt-2 rounded-md bg-danger-bg px-3 py-2 text-xs text-danger" role="alert">
          {he ? `המינוי הקודם נדחה על ידי ${exam.lastNominationRejection.decidedByName}: ` : `The previous nomination was rejected by ${exam.lastNominationRejection.decidedByName}: `}
          {exam.lastNominationRejection.reason}
        </p>
      )}
      <div className="mt-2 grid gap-3">
        {slots.map((s, i) => (
          <fieldset key={i} className="rounded-md border border-line bg-surface p-2">
            <legend className="px-1 text-xs font-semibold text-muted">{he ? `בוחן/ת ${i + 1}` : `Examiner ${i + 1}`}</legend>
            <div className="flex gap-3 text-xs">
              <label className="flex items-center gap-1"><input type="radio" name={`type-${exam.milestoneId}-${i}`} checked={s.type === 'internal'} onChange={() => setSlot(i, { type: 'internal', uid: '' })} />{he ? 'מהמכון' : 'From the college'}</label>
              <label className="flex items-center gap-1"><input type="radio" name={`type-${exam.milestoneId}-${i}`} checked={s.type === 'external'} onChange={() => setSlot(i, { type: 'external', name: '', email: '', institution: '' })} />{he ? 'בוחן/ת חיצוני/ת' : 'Outside examiner'}</label>
            </div>
            {s.type === 'internal' ? (
              <select aria-label={he ? `בוחן/ת ${i + 1}` : `Examiner ${i + 1}`} value={s.uid} onChange={(e) => setSlot(i, { type: 'internal', uid: e.target.value })} className="mt-2 w-full rounded-md border border-line bg-paper px-2 py-1 text-sm">
                <option value="">{he ? '— בחירת בוחן/ת —' : '— Choose an examiner —'}</option>
                {candidates.map((c) => <option key={c.uid} value={c.uid}>{c.name}</option>)}
              </select>
            ) : (
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                <input aria-label={he ? 'שם מלא' : 'Full name'} placeholder={he ? 'שם מלא' : 'Full name'} value={s.name} onChange={(e) => setSlot(i, { ...s, name: e.target.value })} className="rounded-md border border-line bg-paper px-2 py-1 text-sm" />
                <input aria-label={he ? 'דוא"ל' : 'Email'} type="email" placeholder={he ? 'דוא"ל' : 'Email'} value={s.email} onChange={(e) => setSlot(i, { ...s, email: e.target.value })} className="rounded-md border border-line bg-paper px-2 py-1 text-sm" dir="ltr" />
                <input aria-label={he ? 'מוסד' : 'Institution'} placeholder={he ? 'מוסד (לא חובה)' : 'Institution (optional)'} value={s.institution} onChange={(e) => setSlot(i, { ...s, institution: e.target.value })} className="rounded-md border border-line bg-paper px-2 py-1 text-sm" />
              </div>
            )}
          </fieldset>
        ))}
      </div>
      {error && <p className="mt-2 text-xs text-danger" role="alert">{error}</p>}
      <button type="button" onClick={submit} disabled={busy} className="mt-3 rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60">
        {busy ? '…' : he ? 'שליחה לאישור ראש בית הספר' : 'Send to the grad school head'}
      </button>
    </div>
  );
}

function NominationReview({ exam, lang, onDone }: { exam: ThesisExamCard; lang: 'he' | 'en'; onDone: () => Promise<void> }) {
  const he = lang === 'he';
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const decide = async (decision: 'approve' | 'reject') => {
    if (decision === 'reject' && !reason.trim()) { setError(he ? 'יש לכתוב את סיבת הדחייה.' : 'Write the reason for rejecting.'); return; }
    setBusy(true);
    setError('');
    try {
      const res = await apiClient.decideThesisExamNomination(exam.milestoneId, decision, reason);
      if (res.emailFailed?.length) setNotice(he ? `שליחת הדוא"ל נכשלה עבור: ${res.emailFailed.join(', ')}` : `The email failed for: ${res.emailFailed.join(', ')}`);
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : he ? 'הפעולה נכשלה' : 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 rounded-lg border border-line bg-paper p-3">
      <p className="text-sm font-semibold text-ink">{he ? 'מינוי הבוחנים שהוגש' : 'Submitted nomination'}{exam.nomination ? ` · ${exam.nomination.submittedByName}` : ''}</p>
      <ul className="mt-2 grid gap-1 text-sm">
        {exam.nomination?.examiners.map((e, i) => (
          <li key={i}>
            {i + 1}. <strong>{e.name}</strong> — {e.type === 'internal' ? (he ? 'מהמכון' : 'from the college') : `${he ? 'חיצוני/ת' : 'outside'}${e.institution ? `, ${e.institution}` : ''}${e.email ? ` (${e.email})` : ''}`}
          </li>
        ))}
      </ul>
      <label htmlFor={`nom-reason-${exam.milestoneId}`} className="mt-3 block text-xs text-muted">{he ? 'סיבת דחייה (חובה בדחייה)' : 'Reason (required to reject)'}</label>
      <textarea id={`nom-reason-${exam.milestoneId}`} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm" />
      {error && <p className="mt-2 text-xs text-danger" role="alert">{error}</p>}
      {notice && <p className="mt-2 text-xs text-danger" role="status">{notice}</p>}
      <div className="mt-2 flex gap-2">
        <button type="button" onClick={() => decide('approve')} disabled={busy} className="rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60">{he ? '✓ אישור המינוי' : '✓ Approve'}</button>
        <button type="button" onClick={() => decide('reject')} disabled={busy} className="rounded-full border border-line px-4 py-1.5 text-xs font-semibold text-danger hover:bg-danger-bg disabled:opacity-60">{he ? '✗ דחייה' : '✗ Reject'}</button>
      </div>
    </div>
  );
}

function DateReview({ exam, lang, onDone }: { exam: ThesisExamCard; lang: 'he' | 'en'; onDone: () => Promise<void> }) {
  const he = lang === 'he';
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const decide = async (decision: 'approve' | 'reject') => {
    if (decision === 'reject' && !reason.trim()) { setError(he ? 'יש לכתוב את סיבת הדחייה.' : 'Write the reason for rejecting.'); return; }
    setBusy(true);
    setError('');
    try {
      await apiClient.decideThesisExamDate(exam.milestoneId, decision, reason);
      setReason('');
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : he ? 'הפעולה נכשלה' : 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 rounded-lg border border-line bg-paper p-3">
      <p className="text-xs text-muted">
        {exam.remainingSlots && exam.remainingSlots > 0
          ? (he ? `בדחייה יוצע המועד המשותף הבא (נותרו עוד ${exam.remainingSlots}).` : `Rejecting offers the next common time (${exam.remainingSlots} more).`)
          : (he ? 'אין מועד משותף נוסף — דחייה תפתח סבב חדש של בחירת תאריכים לכל המשתתפים.' : 'No other common time — rejecting opens a new date-picking round for everyone.')}
      </p>
      {exam.rejectedSlots.length > 0 && (
        <ul className="mt-2 grid gap-1 text-xs text-muted">
          {exam.rejectedSlots.map((r, i) => (
            <li key={i}>✗ {formatExamDay(r.slot.date, lang, { day: 'numeric', month: 'numeric' })} {r.slot.from}–{r.slot.to} · {r.byName}: {r.reason}</li>
          ))}
        </ul>
      )}
      <label htmlFor={`date-reason-${exam.milestoneId}`} className="mt-3 block text-xs text-muted">{he ? 'סיבת דחייה (חובה בדחייה)' : 'Reason (required to reject)'}</label>
      <textarea id={`date-reason-${exam.milestoneId}`} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm" />
      {error && <p className="mt-2 text-xs text-danger" role="alert">{error}</p>}
      <div className="mt-2 flex gap-2">
        <button type="button" onClick={() => decide('approve')} disabled={busy} className="rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60">{he ? '✓ אישור המועד' : '✓ Approve the date'}</button>
        <button type="button" onClick={() => decide('reject')} disabled={busy} className="rounded-full border border-line px-4 py-1.5 text-xs font-semibold text-danger hover:bg-danger-bg disabled:opacity-60">{he ? '✗ דחייה' : '✗ Reject'}</button>
      </div>
    </div>
  );
}
