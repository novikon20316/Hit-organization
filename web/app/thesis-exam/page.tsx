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
import { THESIS_EXAM_STEPS, THESIS_EXAM_STATUS_LABEL, formatExamDay, formatExamDeadline, formatExamSlot, thesisExamStepIndex } from '@/lib/thesisExam';
import { AvailabilityPicker, EXAM_DAY_START, EXAM_MIN_MINUTES, EXAM_TIMES, fridayLatestEnd, isShabbat, latestEndFor, shiftTime } from '@/components/thesisExam/AvailabilityPicker';
import { ThesisExamFormPanel, type ThesisExamFormSource } from '@/components/thesisExam/ThesisExamFormPanel';

export default function ThesisExamPage() {
  const { loading: guardLoading, isAllowed } = useRequireRole(VALID_ROLES);
  const { lang } = useLanguage();
  const he = lang === 'he';
  const [exams, setExams] = useState<ThesisExamCard[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [formFor, setFormFor] = useState<{ id: string; as?: 'supervisor' } | null>(null);

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
    load: () => apiClient.getThesisExamForm(formFor.id, formFor.as),
    submit: (body) => apiClient.submitThesisExamForm(formFor.id, body),
    submitSupervisor: (research) => apiClient.submitThesisExamSupervisorGrade(formFor.id, research),
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
          {exams.map((exam) => <ExamCard key={exam.milestoneId} exam={exam} lang={lang} onChanged={fetchAll} onOpenForm={(as) => setFormFor({ id: exam.milestoneId, as })} />)}
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
  const current = thesisExamStepIndex(status);
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

function ExamCard({ exam, lang, onChanged, onOpenForm }: { exam: ThesisExamCard; lang: 'he' | 'en'; onChanged: () => Promise<void>; onOpenForm: (as?: 'supervisor') => void }) {
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
          {exam.lateEntryDeadline && !has('late_entry') && (
            <p className="mt-1 text-xs font-medium text-accent">
              {he
                ? `המועד האחרון עבר — הרכזת האדמיניסטרטיבית משלימה את התאריכים החסרים עד ${formatExamDeadline(exam.lateEntryDeadline, 'he')}, ואז המערכת תקבע מועד לפי מי שבחרו.`
                : `The deadline passed — the administrative coordinator is completing the missing dates until ${formatExamDeadline(exam.lateEntryDeadline, 'en')}; then the system sets the time from those who picked.`}
            </p>
          )}
          {has('late_entry') && <LateEntryPanel exam={exam} lang={lang} onDone={onChanged} />}
          {has('availability') && exam.window && (
            <AvailabilityPicker
              lang={lang}
              window={exam.window}
              count={exam.rules.datesPerParticipant}
              deadline={exam.lateEntryDeadline ?? exam.pickDeadline}
              initial={exam.myAvailability}
              onSubmit={async (entries) => { await apiClient.submitThesisExamAvailability(exam.milestoneId, entries); await onChanged(); }}
            />
          )}
        </div>
      )}

      {exam.excludedNames.length > 0 && exam.status !== 'exam_availability' && (
        <p className="mt-2 text-xs text-muted">{he ? 'המועד נקבע ללא תאריכים של' : 'Time set without dates from'}: {exam.excludedNames.join(', ')}</p>
      )}

      {exam.status === 'exam_date_coordinator' && !has('set_date') && (
        <p className="mt-3 text-sm text-muted">
          {exam.coordinatorTask === 'set_hours'
            ? (he ? `נמצא מועד משותף${exam.hoursWindow ? `: ${formatExamSlot(exam.hoursWindow, lang)}` : ''} — הרכזת האדמיניסטרטיבית קובעת את שעות הבחינה.` : `A common time was found${exam.hoursWindow ? `: ${formatExamSlot(exam.hoursWindow, lang)}` : ''} — the administrative coordinator is setting the exam hours.`)
            : (he ? 'לא נמצא מועד משותף — הרכזת האדמיניסטרטיבית תקבע את המועד.' : 'No common time was found — the administrative coordinator will set the time.')}
        </p>
      )}
      {has('set_date') && <CoordinatorDateForm exam={exam} lang={lang} onDone={onChanged} />}

      {(exam.status === 'exam_date_review' || exam.status === 'exam_date_final_review') && exam.proposedSlot && (
        <p className="mt-3 text-sm text-ink">
          {exam.slotSource === 'coordinator' ? (he ? 'המועד שקבעה הרכזת' : 'Time set by the coordinator') : (he ? 'המועד המשותף שנמצא' : 'Common time found')}: <strong>{formatExamSlot(exam.proposedSlot, lang)}</strong>
        </p>
      )}
      {has('review_date') && <DateReview exam={exam} lang={lang} onDone={onChanged} />}

      {(exam.status === 'exam_scheduled' || exam.status === 'exam_committee_review') && (
        <p className="mt-3 text-xs text-muted">{he ? `${exam.formsSubmittedCount} מתוך ${exam.examinerCount} בוחנים מילאו את טופס הבחינה` : `${exam.formsSubmittedCount} of ${exam.examinerCount} examiners filled in the exam form`}</p>
      )}
      {has('form') && (
        <button type="button" onClick={() => onOpenForm()} className="mt-2 rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-primary-ink hover:bg-primary-hover">
          {exam.myFormSubmitted ? (he ? 'צפייה בטופס ששלחתי' : 'View my form') : exam.formOpen ? (he ? 'מילוי טופס מבחן התזה' : 'Fill in the thesis exam form') : (he ? 'טופס מבחן התזה' : 'Thesis exam form')}
        </button>
      )}
      {has('supervisor_grade') && (
        <div className="mt-2">
          <button type="button" onClick={() => onOpenForm('supervisor')} className="rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-primary-ink hover:bg-primary-hover">
            {exam.supervisorGradeGiven ? (he ? 'צפייה בציון המחקר שנתתי' : 'View my research grade') : (he ? 'מתן ציון מחקר (מנחה)' : 'Give the research grade (supervisor)')}
          </button>
          <p className="mt-1 text-xs text-muted">{he ? 'רכיב "מחקר על סמך חוות דעת המנחה" (40%) — נקבע על ידך בלבד ואינו גלוי לבוחנים.' : "The 'research, based on the supervisor's opinion' component (40%) — set by you only, not shown to the examiners."}</p>
        </div>
      )}
      {has('view_forms') && (
        <div className="mt-2">
          <button type="button" onClick={() => onOpenForm()} className="rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-primary-ink hover:bg-primary-hover">
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

/** The administrative coordinator, after the 48h deadline: who didn't pick,
 *  how to reach them, and a picker to enter what they give her on the phone. */
function LateEntryPanel({ exam, lang, onDone }: { exam: ThesisExamCard; lang: 'he' | 'en'; onDone: () => Promise<void> }) {
  const he = lang === 'he';
  const [open, setOpen] = useState<number | null>(null);
  const ROLE: Record<string, { he: string; en: string }> = {
    student: { he: 'סטודנט/ית', en: 'Student' }, supervisor: { he: 'מנחה', en: 'Supervisor' },
    committee: { he: 'חבר/ת ועדה', en: 'Committee' }, examiner: { he: 'בוחן/ת', en: 'Examiner' },
  };
  return (
    <div className="mt-3 rounded-lg border border-accent/50 bg-accent/10 p-3">
      <p className="text-sm font-semibold text-ink">
        📞 {he ? 'משתתפים שלא בחרו תאריכים בזמן' : "Participants who didn't pick in time"}
      </p>
      <p className="mt-0.5 text-xs text-muted">
        {he
          ? `יש ליצור קשר ולהזין את התאריכים שלהם עד ${formatExamDeadline(exam.lateEntryDeadline!, 'he')}. לאחר מכן המערכת תקבע את המועד לפי מי שכן בחרו.`
          : `Contact them and enter their dates by ${formatExamDeadline(exam.lateEntryDeadline!, 'en')}. After that the system sets the time from those who did pick.`}
      </p>
      <div className="mt-2 grid gap-2">
        {exam.lateParticipants.map((p) => (
          <div key={p.index} className="rounded-md bg-surface px-3 py-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">{p.name} <span className="text-xs text-muted">({p.roles.map((r) => ROLE[r]?.[lang] ?? r).join(', ')})</span></p>
                <p className="text-xs text-muted">
                  {p.phone ? <a href={`tel:${p.phone}`} className="text-primary hover:underline" dir="ltr">{p.phone}</a> : (he ? 'אין טלפון במערכת' : 'No phone on file')}
                  {p.email ? <> · <a href={`mailto:${p.email}`} className="text-primary hover:underline" dir="ltr">{p.email}</a></> : null}
                </p>
              </div>
              <button type="button" onClick={() => setOpen(open === p.index ? null : p.index)} className="rounded-full border border-line px-3 py-1 text-xs font-medium text-ink hover:border-primary">
                {open === p.index ? (he ? 'סגירה' : 'Close') : (he ? 'הזנת תאריכים' : 'Enter dates')}
              </button>
            </div>
            {open === p.index && exam.window && (
              <AvailabilityPicker
                lang={lang}
                window={exam.window}
                count={exam.rules.datesPerParticipant}
                initial={null}
                allowFewer
                onSubmit={async (entries) => { await apiClient.enterThesisExamLateDates(exam.milestoneId, p.index, entries); setOpen(null); await onDone(); }}
              />
            )}
          </div>
        ))}
      </div>
    </div>
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
          : (he ? 'אין מועד נוסף — בדחייה הרכזת האדמיניסטרטיבית תקבע מועד אחר.' : 'No other time — rejecting sends it to the administrative coordinator to set another.')}
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

function CoordinatorDateForm({ exam, lang, onDone }: { exam: ThesisExamCard; lang: 'he' | 'en'; onDone: () => Promise<void> }) {
  const he = lang === 'he';
  const today = new Date();
  const min = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  // A common window was found: the date is fixed and the hours must sit
  // inside it — she only narrows it down to the exam's actual hours.
  const win = exam.coordinatorTask === 'set_hours' ? exam.hoursWindow : null;
  const [date, setDate] = useState(win?.date ?? '');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inWindow = (t: string) => !win || (t >= win.from && t <= win.to);

  // Same rules as the participants' picker (and the server): no Shabbat,
  // daytime hours only — the hour lists simply don't offer night times.
  const dateBad = !!date && isShabbat(date);
  const fridayEnd = fridayLatestEnd(date);
  const fridayBad = !!fridayEnd && ((!!to && to > fridayEnd) || (!!from && from >= fridayEnd));
  const tooShort = !!from && !!to && to > from && to < shiftTime(from, EXAM_MIN_MINUTES);
  const timesBad = fridayBad || tooShort || (!!from && !!to && to <= from);
  const fieldCls = (bad: boolean) => `rounded-md border px-2 py-1 text-sm ${bad ? 'border-danger bg-surface ring-2 ring-danger' : 'border-line bg-surface'}`;

  const submit = async () => {
    if (!date || !from || !to) { setError(he ? 'יש לבחור תאריך, שעת התחלה ושעת סיום.' : 'Choose a date, a start time and an end time.'); return; }
    if (dateBad) { setError(he ? 'לא ניתן לקבוע בחינה ביום שבת.' : 'No exams on Saturday (Shabbat).'); return; }
    if (fridayBad) { setError(he ? `ביום שישי ניתן לקבוע עד ${fridayEnd} בלבד.` : `On Friday only until ${fridayEnd}.`); return; }
    if (to <= from) { setError(he ? 'שעת הסיום חייבת להיות אחרי שעת ההתחלה.' : 'The end time must be after the start time.'); return; }
    if (tooShort) { setError(he ? `הבחינה צריכה להימשך ${EXAM_MIN_MINUTES} דקות לפחות.` : `The exam must be at least ${EXAM_MIN_MINUTES} minutes.`); return; }
    setBusy(true);
    setError('');
    try {
      await apiClient.setThesisExamCoordinatorDate(exam.milestoneId, { date, from, to, note });
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : he ? 'השמירה נכשלה' : 'Saving failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 rounded-lg border border-line bg-paper p-3">
      <p className="text-sm font-semibold text-ink">
        {win
          ? (he ? `נמצא מועד משותף: ${formatExamSlot(win, 'he')} — יש לקבוע את שעות הבחינה בתוך הטווח` : `Common time found: ${formatExamSlot(win, 'en')} — set the exam hours inside it`)
          : (he ? 'לא נמצא מועד משותף — יש לקבוע תאריך ושעות לבחינה' : 'No common time — set the exam date and hours')}
      </p>
      <p className="mt-1 text-xs text-muted">{he ? 'המועד יועבר לאישור ראש התוכנית ולאחר מכן ראש בית הספר ללימודים מתקדמים.' : 'The time goes to the program head and then the head of the graduate school for approval.'}</p>
      {exam.rejectedSlots.length > 0 && (
        <ul className="mt-2 grid gap-1 text-xs text-muted">
          {exam.rejectedSlots.map((r, i) => (
            <li key={i}>✗ {formatExamDay(r.slot.date, lang, { day: 'numeric', month: 'numeric' })} {r.slot.from}–{r.slot.to} · {r.byName}: {r.reason}</li>
          ))}
        </ul>
      )}
      {exam.availabilityPicks.length > 0 && (
        <details className="mt-2 rounded-md border border-line bg-surface p-2 text-xs">
          <summary className="cursor-pointer font-semibold text-ink">{he ? 'התאריכים שבחרו המשתתפים' : "Participants' picks"}</summary>
          <ul className="mt-2 grid gap-1.5">
            {exam.availabilityPicks.map((p, i) => (
              <li key={i}>
                <span className="font-semibold">{p.name}</span>
                <span className="text-muted">: {p.entries.length === 0 ? (he ? 'לא בחר/ה' : 'no picks') : p.entries.map((e) => `${formatExamDay(e.date, lang, { weekday: 'short', day: 'numeric', month: 'numeric' })} ${e.from}–${e.to}`).join(' · ')}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="text-xs text-muted" htmlFor={`coord-date-${exam.milestoneId}`}>{he ? 'תאריך' : 'Date'}</label>
        {win ? (
          <span id={`coord-date-${exam.milestoneId}`} className="rounded-md border border-line bg-paper px-2 py-1 text-sm font-medium text-ink">{formatExamDay(win.date, lang, { weekday: 'short', day: 'numeric', month: 'numeric', year: 'numeric' })}</span>
        ) : (
          <input id={`coord-date-${exam.milestoneId}`} type="date" min={min} value={date} onChange={(e) => { setDate(e.target.value); setError(''); }} aria-invalid={dateBad} className={fieldCls(dateBad)} />
        )}
        <label className="text-xs text-muted" htmlFor={`coord-from-${exam.milestoneId}`}>{he ? 'משעה' : 'From'}</label>
        <select id={`coord-from-${exam.milestoneId}`} value={from} onChange={(e) => { setFrom(e.target.value); setError(''); }} aria-invalid={timesBad} className={fieldCls(timesBad)}>
          <option value="">--:--</option>
          {EXAM_TIMES.filter((t) => t <= shiftTime(win ? win.to : latestEndFor(date), -EXAM_MIN_MINUTES) && inWindow(t)).map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <label className="text-xs text-muted" htmlFor={`coord-to-${exam.milestoneId}`}>{he ? 'עד שעה' : 'To'}</label>
        <select id={`coord-to-${exam.milestoneId}`} value={to} onChange={(e) => { setTo(e.target.value); setError(''); }} aria-invalid={timesBad} className={fieldCls(timesBad)}>
          <option value="">--:--</option>
          {EXAM_TIMES.filter((t) => t >= shiftTime(from && from > EXAM_DAY_START ? from : EXAM_DAY_START, EXAM_MIN_MINUTES) && t <= latestEndFor(date) && inWindow(t)).map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      {dateBad && <p className="mt-1 text-xs text-danger">⚠ {he ? 'יום שבת — לא ניתן לקבוע בו בחינה.' : 'Saturday (Shabbat) — no exams.'}</p>}
      {fridayBad && <p className="mt-1 text-xs text-danger">⚠ {he ? `יום שישי — ניתן לבחור שעות עד ${fridayEnd} בלבד (כניסת שבת).` : `Friday — hours only until ${fridayEnd} (Shabbat begins).`}</p>}
      {tooShort && !fridayBad && <p className="mt-1 text-xs text-danger">⚠ {he ? `הבחינה צריכה להימשך ${EXAM_MIN_MINUTES} דקות לפחות.` : `The exam must be at least ${EXAM_MIN_MINUTES} minutes.`}</p>}
      {timesBad && !fridayBad && !tooShort && <p className="mt-1 text-xs text-danger">⚠ {he ? 'שעת הסיום חייבת להיות אחרי שעת ההתחלה.' : 'The end time must be after the start time.'}</p>}
      <label htmlFor={`coord-note-${exam.milestoneId}`} className="mt-2 block text-xs text-muted">{he ? 'הערה (לא חובה)' : 'Note (optional)'}</label>
      <textarea id={`coord-note-${exam.milestoneId}`} rows={2} value={note} onChange={(e) => setNote(e.target.value)} className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm" />
      {error && <p className="mt-2 text-xs text-danger" role="alert">{error}</p>}
      <button type="button" onClick={submit} disabled={busy} className="mt-2 rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60">
        {busy ? '…' : win ? (he ? 'קביעת השעות ושליחה לאישור' : 'Set the hours and send for approval') : he ? 'קביעת המועד ושליחה לאישור' : 'Set the time and send for approval'}
      </button>
    </div>
  );
}
