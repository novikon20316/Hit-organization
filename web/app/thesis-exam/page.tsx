'use client';

// app/thesis-exam/page.tsx
// The CS M.Sc. thesis exam (server's services/thesisExam.ts), for everyone
// taking part: the supervisor nominates 2 examiners, the grad school head
// approves the nomination, every participant (student, supervisor, committee
// members, examiners) picks 5 dates with their free hours, the system matches
// a common slot, the program head and then the grad school head approve it,
// the examiners fill the exam form after the exam and the supervisor gives
// the research grade; the final grade — every milestone's grade by the
// template's weights (GradeBreakdownTable) — goes to the grad school head
// (GradeReviewPanel), then to the administrative coordinator's final
// approval (FinalApprovalPanel) before Michlol. Each card shows only the actions open to the viewer; the server
// enforces every one of them.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { useRequireRole } from '@/hooks/useRequireRole';
import { useLanguage } from '@/contexts/LanguageContext';
import { useLiveRefresh } from '@/hooks/useLiveRefresh';
import { apiClient, type ThesisExamCard, type ThesisExamFixVote, type ThesisExamGradeBreakdown, type ThesisExamNomineeInput } from '@/lib/apiClient';
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

  // ?milestoneId=… (Quick Tasks on the supervisor dashboard) scrolls to and
  // rings that exam's card once the list has loaded. Read from
  // window.location rather than useSearchParams so this static page needs
  // no Suspense boundary just for a one-shot deep link.
  const [focusId, setFocusId] = useState<string | null>(null);
  const deepLinkHandledRef = useRef(false);
  useEffect(() => {
    if (loadingData || deepLinkHandledRef.current) return;
    deepLinkHandledRef.current = true;
    const id = new URLSearchParams(window.location.search).get('milestoneId');
    if (!id) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot deep link, waits on the async list load
    setFocusId(id);
    requestAnimationFrame(() => document.getElementById(`thesis-exam-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }, [loadingData]);

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
          {exams.map((exam) => <ExamCard key={exam.milestoneId} exam={exam} lang={lang} highlighted={exam.milestoneId === focusId} onChanged={fetchAll} onOpenForm={(as) => setFormFor({ id: exam.milestoneId, as })} />)}
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

function ExamCard({ exam, lang, highlighted = false, onChanged, onOpenForm }: { exam: ThesisExamCard; lang: 'he' | 'en'; highlighted?: boolean; onChanged: () => Promise<void>; onOpenForm: (as?: 'supervisor') => void }) {
  const he = lang === 'he';
  const has = (a: ThesisExamCard['actions'][number]) => exam.actions.includes(a);
  return (
    <section id={`thesis-exam-${exam.milestoneId}`} className={`scroll-mt-4 rounded-xl border bg-surface p-4 ${highlighted ? 'border-primary ring-2 ring-primary' : 'border-line'}`}>
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

      {(exam.status === 'exam_scheduled' || exam.status === 'exam_committee_review' || exam.status === 'exam_grades_pending') && (
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
          <button type="button" onClick={() => onOpenForm()} className="rounded-full border border-line px-4 py-1.5 text-xs font-semibold text-ink hover:border-primary">
            {he ? 'צפייה בטופסי הבוחנים' : "View the examiners' forms"}
          </button>
        </div>
      )}

      {exam.gradeBreakdown && <GradeBreakdownTable breakdown={exam.gradeBreakdown} lang={lang} />}
      {exam.gradeReview && exam.status !== 'exam_grade_review' && (
        <p className={`mt-3 rounded-md px-3 py-2 text-xs ${exam.gradeReview.decision === 'approve' ? 'bg-success-bg text-success' : 'bg-danger-bg text-danger'}`}>
          {exam.gradeReview.decision === 'approve'
            ? (he ? `✓ אושר ע״י ראש בית הספר ללימודים מתקדמים (${exam.gradeReview.byName}, ${formatExamDeadline(exam.gradeReview.at, lang)})` : `✓ Approved by the grad school head (${exam.gradeReview.byName}, ${formatExamDeadline(exam.gradeReview.at, lang)})`)
            : (he ? `✗ נדחה ע״י ראש בית הספר ללימודים מתקדמים (${exam.gradeReview.byName}): ${exam.gradeReview.reason}` : `✗ Denied by the grad school head (${exam.gradeReview.byName}): ${exam.gradeReview.reason}`)}
        </p>
      )}
      {exam.status === 'exam_grade_denied' && (
        <p className="mt-2 text-xs text-muted">{he ? 'ההמשך לאחר דחייה ייקבע בהמשך לפי הנחיות הפקולטה.' : "What follows a denial will be set by the faculty's rules."}</p>
      )}
      {exam.status === 'exam_returned_to_supervisor' && (
        <p className="mt-2 text-xs text-muted">{he ? `הציון נמוך מ-${exam.rules.minPassingFinalGrade ?? ''} — התזה חוזרת למנחה להמשך עבודה עם הסטודנט/ית.` : `The grade is below ${exam.rules.minPassingFinalGrade ?? ''} — the thesis returns to the supervisor for more work with the student.`}</p>
      )}
      {has('review_final_grade') && <GradeReviewPanel exam={exam} lang={lang} onDone={onChanged} />}
      {exam.status === 'exam_coordinator_approval' && !has('final_approval') && (
        <p className="mt-3 text-sm text-muted">{he ? 'ממתין לאישור הסופי של הרכזת האדמיניסטרטיבית לפני העברת הציון למכלול.' : "Awaiting the administrative coordinator's final approval before the grade goes to Michlol."}</p>
      )}
      {has('final_approval') && <FinalApprovalPanel exam={exam} lang={lang} onDone={onChanged} />}
      {exam.supervisorFix && <SupervisorFixSummary exam={exam} lang={lang} />}
      {has('supervisor_fix') && <SupervisorFixPanel exam={exam} lang={lang} onDone={onChanged} />}
      {exam.status === 'exam_supervisor_fix' && !has('supervisor_fix') && (
        <p className="mt-2 text-xs text-muted">{he ? 'ממתין לתיקון ציון המחקר ע״י המנחה; התיקון יעבור לאישור הוועדה ואז שוב לראש בית הספר.' : "Waiting for the supervisor's research grade fix; it then goes to the committee and back to the grad school head."}</p>
      )}
      {exam.fixCommittee && <FixCommitteePanel exam={exam} lang={lang} onDone={onChanged} />}
      {exam.status === 'exam_completed' && (
        <p className="mt-3 rounded-md bg-success-bg px-3 py-2 text-sm font-semibold text-success">
          🎓 {he ? 'התזה הושלמה — הציון הסופי אושר סופית' : 'Thesis completed — the final grade received final approval'}
          {exam.myFinalGrade != null ? ` · ${he ? 'הציון הסופי שלך' : 'Your final grade'}: ${exam.myFinalGrade}` : ''}
          {exam.finalApproval ? <span className="block text-xs font-normal">{exam.finalApproval.byName} · {formatExamDeadline(exam.finalApproval.at, lang)}{exam.finalApproval.note ? ` · ${exam.finalApproval.note}` : ''}</span> : null}
        </p>
      )}
    </section>
  );
}

/** How the final grade is made: every milestone of the template with its
 *  weight and each student's grade on it, the exam's own three components,
 *  and the weighted final grade. */
function GradeBreakdownTable({ breakdown, lang }: { breakdown: ThesisExamGradeBreakdown; lang: 'he' | 'en' }) {
  const he = lang === 'he';
  const cell = (v: number | null | undefined) => (v == null ? '—' : String(v));
  const many = breakdown.students.length > 1;
  return (
    <div className="mt-3 rounded-lg border border-line bg-paper p-3">
      <p className="text-sm font-semibold text-ink">🧮 {he ? 'חישוב הציון הסופי' : 'How the final grade is computed'}</p>
      <p className="mt-0.5 text-xs text-muted">{he ? 'ציון כל אבן דרך × המשקל שלה בתבנית התהליך המאושרת.' : "Each milestone's grade × its weight in the approved workflow template."}</p>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[22rem] text-xs">
          <thead>
            <tr className="border-b border-line text-muted">
              <th scope="col" className="py-1 text-start font-medium">{he ? 'אבן דרך' : 'Milestone'}</th>
              <th scope="col" className="py-1 text-start font-medium">{he ? 'משקל' : 'Weight'}</th>
              {breakdown.students.map((s) => (
                <th key={s.id} scope="col" className="py-1 text-start font-medium">{many ? s.name : (he ? 'ציון' : 'Grade')}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {breakdown.rows.map((r) => (
              <tr key={r.type} className={`border-b border-line/60 ${r.percent === 0 ? 'text-muted' : 'text-ink'}`}>
                <th scope="row" className="py-1.5 text-start font-medium">
                  {he ? r.nameHe : r.nameEn}
                  {r.isExam && (
                    <span className="block text-[11px] font-normal text-muted">
                      {he ? 'מחקר (מנחה) 40%' : 'Research (supervisor) 40%'}: {cell(breakdown.exam.research)} · {he ? 'כתיבה 40%' : 'Writing 40%'}: {cell(breakdown.exam.writing)} · {he ? 'הגנה 20%' : 'Defense 20%'}: {cell(breakdown.exam.defense)}
                    </span>
                  )}
                </th>
                <td className="py-1.5">{r.percent}%</td>
                {breakdown.students.map((s) => <td key={s.id} className="py-1.5 font-semibold">{cell(r.grades[s.id])}</td>)}
              </tr>
            ))}
            <tr className="text-ink">
              <th scope="row" className="pt-2 text-start font-bold">{he ? 'ציון סופי' : 'Final grade'}</th>
              <td className="pt-2">{breakdown.rows.reduce((sum, r) => sum + r.percent, 0)}%</td>
              {breakdown.students.map((s) => <td key={s.id} className="pt-2 text-sm font-bold text-primary">{cell(breakdown.finalGradeByStudent[s.id])}</td>)}
            </tr>
          </tbody>
        </table>
      </div>
      {breakdown.missing.length > 0 && (
        <p className="mt-2 text-xs text-danger">{he ? 'חסר עדיין' : 'Still missing'}: {breakdown.missing.map((m) => m[lang]).join(' · ')}</p>
      )}
    </div>
  );
}

/** Why the supervisor is fixing the grade and, once sent, the fix itself. */
function SupervisorFixSummary({ exam, lang }: { exam: ThesisExamCard; lang: 'he' | 'en' }) {
  const he = lang === 'he';
  const f = exam.supervisorFix!;
  return (
    <div className="mt-3 rounded-lg border border-danger/40 bg-danger-bg px-3 py-2 text-xs text-danger">
      <p className="font-semibold">
        {f.requestedBy === 'grad_school_head'
          ? (he ? `ראש בית הספר ללימודים מתקדמים (${f.requestedByName}) דחה/תה את הציון הסופי` : `The grad school head (${f.requestedByName}) denied the final grade`)
          : (he ? `הוועדה (יו"ר: ${f.requestedByName}) דחתה את תיקון הציון` : `The committee (chairman: ${f.requestedByName}) rejected the grade fix`)}
        {f.round > 1 ? (he ? ` · סבב תיקון ${f.round}` : ` · fix round ${f.round}`) : ''}
      </p>
      <p className="mt-0.5 whitespace-pre-wrap">{f.reason}</p>
      {f.submittedAt && (
        <p className="mt-1 text-ink">
          {he ? 'תיקון המנחה' : "Supervisor's fix"}: {he ? 'ציון מחקר' : 'research grade'} {f.previousResearch ?? '—'} → <strong>{f.newResearch}</strong>
          {f.note ? ` · ${f.note}` : ''}
        </p>
      )}
    </div>
  );
}

function SupervisorFixPanel({ exam, lang, onDone }: { exam: ThesisExamCard; lang: 'he' | 'en'; onDone: () => Promise<void> }) {
  const he = lang === 'he';
  const f = exam.supervisorFix;
  const [research, setResearch] = useState(f?.previousResearch != null ? String(f.previousResearch) : '');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async () => {
    const v = Number(research);
    if (!research.trim() || !Number.isFinite(v) || v < 1 || v > 100) { setError(he ? 'יש לתת ציון מחקר בין 1 ל-100.' : 'Give a research grade from 1 to 100.'); return; }
    if (!window.confirm(he ? `לשלוח ציון מחקר ${v} לאישור הוועדה?` : `Send research grade ${v} to the committee?`)) return;
    setBusy(true);
    setError('');
    try {
      await apiClient.fixThesisExamSupervisorGrade(exam.milestoneId, v, note.trim());
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : he ? 'השליחה נכשלה' : 'Sending failed');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mt-3 rounded-lg border border-line bg-paper p-3">
      <p className="text-sm font-semibold text-ink">{he ? 'תיקון ציון המחקר (40%)' : 'Fix the research grade (40%)'}</p>
      <p className="mt-0.5 text-xs text-muted">{he ? 'הציון הקודם יישמר בהיסטוריה. התיקון יעבור לאישור הוועדה ואז שוב לראש בית הספר ללימודים מתקדמים.' : 'The previous grade is kept in the history. The fix goes to the committee, then back to the grad school head.'}</p>
      <label htmlFor={`fix-research-${exam.milestoneId}`} className="mt-2 block text-xs text-muted">{he ? 'ציון מחקר מתוקן (1–100)' : 'Fixed research grade (1–100)'}</label>
      <input id={`fix-research-${exam.milestoneId}`} type="number" min={1} max={100} step={0.1} inputMode="decimal" value={research} onChange={(e) => setResearch(e.target.value)} className="mt-1 w-32 rounded-lg border border-line bg-surface px-3 py-2 text-sm" />
      <label htmlFor={`fix-note-${exam.milestoneId}`} className="mt-2 block text-xs text-muted">{he ? 'הסבר לוועדה (לא חובה)' : 'Explanation for the committee (optional)'}</label>
      <textarea id={`fix-note-${exam.milestoneId}`} rows={2} value={note} onChange={(e) => setNote(e.target.value)} className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm" />
      {error && <p className="mt-2 text-xs text-danger" role="alert">{error}</p>}
      <button type="button" onClick={submit} disabled={busy} className="mt-2 rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60">
        {busy ? '…' : (he ? 'שליחת התיקון לוועדה' : 'Send the fix to the committee')}
      </button>
    </div>
  );
}

const VOTE_LABEL: Record<ThesisExamFixVote, { he: string; en: string }> = {
  approve: { he: 'אישור התיקון', en: 'Approve the fix' },
  reject: { he: 'דחיית התיקון', en: 'Reject the fix' },
};

/** The committee's review of the supervisor's fix: every member but the
 *  chairman gives an opinion; the chairman decides once all are in. */
function FixCommitteePanel({ exam, lang, onDone }: { exam: ThesisExamCard; lang: 'he' | 'en'; onDone: () => Promise<void> }) {
  const he = lang === 'he';
  const c = exam.fixCommittee!;
  const mine = c.members.find((m) => m.isMe)?.opinion ?? null;
  const canOpine = exam.actions.includes('fix_opinion');
  const canDecide = exam.actions.includes('fix_decide');
  return (
    <div className="mt-3 rounded-lg border border-line bg-paper p-3">
      <p className="text-sm font-semibold text-ink">🏛️ {he ? 'אישור הוועדה לתיקון הציון' : "The committee's approval of the grade fix"}</p>
      <p className="mt-0.5 text-xs text-muted">
        {he
          ? `כל חבר/ת ועדה נותן/ת חוות דעת; יו"ר הוועדה${c.chairmanName ? ` (${c.chairmanName})` : ''} מחליט/ה לאחר שכולם נתנו. אישור — הציון הסופי המחושב מחדש (בטבלה למעלה) עובר שוב לראש בית הספר; דחייה — חוזר למנחה לתיקון.`
          : `Every member gives an opinion; the chairman${c.chairmanName ? ` (${c.chairmanName})` : ''} decides once all have. Approve — the recomputed final grade (table above) goes back to the grad school head; reject — back to the supervisor to fix.`}
      </p>
      {!c.chairmanName && (
        <p className="mt-2 rounded-md bg-danger-bg px-3 py-2 text-xs text-danger" role="alert">
          {he ? 'לוועדה אין יו"ר שיכול להחליט (היו"ר הוא מנחה הפרויקט ולא נבחר מחליף) — יש לפנות לרכזת האדמיניסטרטיבית.' : "The committee has no chairman who can decide (the chairman is the project's supervisor and no stand-in was chosen) — contact the administrative coordinator."}
        </p>
      )}
      {c.members.length > 0 && (
        <ul className="mt-2 grid gap-1.5">
          {c.members.map((m, i) => (
            <li key={i} className="rounded-md bg-surface px-3 py-2 text-xs">
              <span className="font-medium text-ink">{m.name}{m.isMe ? (he ? ' (את/ה)' : ' (you)') : ''}</span>
              {m.opinion ? (
                <>
                  {' · '}<span className={`font-semibold ${m.opinion.result === 'approve' ? 'text-success' : 'text-danger'}`}>{VOTE_LABEL[m.opinion.result][lang]}</span>
                  {m.opinion.note && <span className="mt-1 block whitespace-pre-wrap text-muted">{m.opinion.note}</span>}
                </>
              ) : (
                <span className="text-muted"> · {he ? 'טרם נתן/ה חוות דעת' : 'No opinion yet'}</span>
              )}
            </li>
          ))}
        </ul>
      )}
      {canOpine && (
        <VoteForm
          key={mine ? `${mine.result}-${mine.at}` : 'new'}
          idBase={`fix-opinion-${exam.milestoneId}`}
          lang={lang}
          title={mine ? (he ? 'עדכון חוות הדעת שלי' : 'Update my opinion') : (he ? 'חוות הדעת שלי' : 'My opinion')}
          hint={he ? 'ניתן לשנות עד שהיו"ר מחליט/ה.' : 'You can change it until the chairman decides.'}
          initial={mine}
          submitLabel={he ? 'שמירת חוות הדעת' : 'Save my opinion'}
          onSubmit={async (result, note) => { await apiClient.giveThesisExamFixOpinion(exam.milestoneId, result, note); await onDone(); }}
        />
      )}
      {c.isChairman && !canDecide && c.missingNames.length > 0 && (
        <p className="mt-3 text-xs font-medium text-accent">
          {he ? `ניתן יהיה להחליט לאחר שכל חברי הוועדה יתנו חוות דעת. חסרים: ${c.missingNames.join(', ')}.` : `You can decide once every member gave an opinion. Missing: ${c.missingNames.join(', ')}.`}
        </p>
      )}
      {!c.isChairman && !canOpine && c.missingNames.length === 0 && c.chairmanName && (
        <p className="mt-3 text-xs text-muted">{he ? `כל חוות הדעת התקבלו — ממתין להחלטת היו"ר (${c.chairmanName}).` : `Every opinion is in — waiting for the chairman (${c.chairmanName}).`}</p>
      )}
      {canDecide && (
        <VoteForm
          idBase={`fix-decide-${exam.milestoneId}`}
          lang={lang}
          title={he ? 'החלטת יו"ר הוועדה' : "The chairman's decision"}
          hint={he ? 'אישור — הציון עובר שוב לראש בית הספר ללימודים מתקדמים. דחייה — חוזר למנחה לתיקון נוסף.' : 'Approve — the grade goes back to the grad school head. Reject — back to the supervisor to fix again.'}
          initial={null}
          confirm
          submitLabel={he ? 'אישור ההחלטה' : 'Confirm the decision'}
          onSubmit={async (result, note) => { await apiClient.decideThesisExamFix(exam.milestoneId, result, note); await onDone(); }}
        />
      )}
    </div>
  );
}

function VoteForm({ idBase, lang, title, hint, initial, submitLabel, confirm = false, onSubmit }: {
  idBase: string;
  lang: 'he' | 'en';
  title: string;
  hint: string;
  initial: { result: ThesisExamFixVote; note: string } | null;
  submitLabel: string;
  confirm?: boolean;
  onSubmit: (result: ThesisExamFixVote, note: string) => Promise<void>;
}) {
  const he = lang === 'he';
  const [result, setResult] = useState<ThesisExamFixVote | null>(initial?.result ?? null);
  const [note, setNote] = useState(initial?.note ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async () => {
    if (!result) { setError(he ? 'יש לבחור אישור או דחייה.' : 'Choose approve or reject.'); return; }
    if (result === 'reject' && !note.trim()) { setError(he ? 'יש לנמק את הדחייה — מה המנחה צריך/ה לתקן.' : 'Write why you reject it — what the supervisor must fix.'); return; }
    if (confirm && !window.confirm(he ? `לאשר את ההחלטה "${VOTE_LABEL[result].he}"?` : `Confirm the decision "${VOTE_LABEL[result].en}"?`)) return;
    setBusy(true);
    setError('');
    try {
      await onSubmit(result, note.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : he ? 'הפעולה נכשלה' : 'Action failed');
    } finally {
      setBusy(false);
    }
  };
  return (
    <fieldset className="mt-3 rounded-lg border border-line bg-surface p-3">
      <legend className="px-1 text-sm font-semibold text-ink">{title}</legend>
      <p className="text-xs text-muted">{hint}</p>
      <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label={title}>
        {(['approve', 'reject'] as const).map((r) => (
          <label key={r} className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs font-semibold ${result === r ? 'border-primary ring-1 ring-primary' : 'border-line'} ${r === 'approve' ? 'text-success' : 'text-danger'}`}>
            <input type="radio" name={`${idBase}-result`} checked={result === r} onChange={() => setResult(r)} className="me-1.5" />
            {VOTE_LABEL[r][lang]}
          </label>
        ))}
      </div>
      <label htmlFor={`${idBase}-note`} className="mt-3 block text-xs text-muted">{result === 'reject' ? (he ? 'נימוק (חובה בדחייה)' : 'Reason (required to reject)') : (he ? 'הערה (לא חובה)' : 'Note (optional)')}</label>
      <textarea id={`${idBase}-note`} rows={2} value={note} onChange={(e) => setNote(e.target.value)} className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm" />
      {error && <p className="mt-2 text-xs text-danger" role="alert">{error}</p>}
      <button type="button" onClick={submit} disabled={busy} className="mt-2 rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60">
        {busy ? '…' : submitLabel}
      </button>
    </fieldset>
  );
}

/** What approving leads to: at or above the passing grade → the
 *  coordinator's final approval; below it → back to the supervisor. */
function PassingHint({ exam, lang }: { exam: ThesisExamCard; lang: 'he' | 'en' }) {
  const he = lang === 'he';
  const min = exam.rules.minPassingFinalGrade;
  const grades = Object.values(exam.gradeBreakdown?.finalGradeByStudent ?? {}).filter((g): g is number => g != null);
  if (min == null || grades.length === 0) return null;
  const low = grades.some((g) => g < min);
  return (
    <p className={`mt-1 rounded-md px-3 py-2 text-xs ${low ? 'bg-danger-bg text-danger' : 'bg-success-bg text-success'}`}>
      {low
        ? (he ? `הציון נמוך מ-${min}. באישור — התזה תחזור למנחה להמשך עבודה עם הסטודנט/ית.` : `The grade is below ${min}. Approving returns the thesis to the supervisor for more work with the student.`)
        : (he ? `הציון ${min} ומעלה. באישור — יעבור לאישור הסופי של הרכזת האדמיניסטרטיבית.` : `The grade is ${min} or above. Approving sends it to the administrative coordinator's final approval.`)}
    </p>
  );
}

function GradeReviewPanel({ exam, lang, onDone }: { exam: ThesisExamCard; lang: 'he' | 'en'; onDone: () => Promise<void> }) {
  const he = lang === 'he';
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const decide = async (decision: 'approve' | 'deny') => {
    if (decision === 'deny' && !reason.trim()) { setError(he ? 'יש לכתוב את סיבת הדחייה.' : 'Write the reason for denying.'); return; }
    if (!window.confirm(decision === 'approve'
      ? (he ? 'לאשר את הציון הסופי? הוא יעבור לאישור הסופי של הרכזת האדמיניסטרטיבית.' : "Approve the final grade? It goes on to the administrative coordinator's final approval.")
      : (he ? 'לדחות את הציון הסופי?' : 'Deny the final grade?'))) return;
    setBusy(true);
    setError('');
    try {
      await apiClient.reviewThesisExamFinalGrade(exam.milestoneId, decision, reason.trim());
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
      <p className="text-sm font-semibold text-ink">{he ? 'אישור הציון הסופי' : 'Approve the final grade'}</p>
      <PassingHint exam={exam} lang={lang} />
      <label htmlFor={`grade-review-${exam.milestoneId}`} className="mt-2 block text-xs text-muted">{he ? 'הערה / סיבת דחייה (חובה בדחייה)' : 'Note / reason (required to deny)'}</label>
      <textarea id={`grade-review-${exam.milestoneId}`} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm" />
      {error && <p className="mt-2 text-xs text-danger" role="alert">{error}</p>}
      <div className="mt-2 flex gap-2">
        <button type="button" onClick={() => decide('approve')} disabled={busy} className="rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60">{he ? '✓ אישור הציון' : '✓ Approve the grade'}</button>
        <button type="button" onClick={() => decide('deny')} disabled={busy} className="rounded-full border border-line px-4 py-1.5 text-xs font-semibold text-danger hover:bg-danger-bg disabled:opacity-60">{he ? '✗ דחייה' : '✗ Deny'}</button>
      </div>
    </div>
  );
}

function FinalApprovalPanel({ exam, lang, onDone }: { exam: ThesisExamCard; lang: 'he' | 'en'; onDone: () => Promise<void> }) {
  const he = lang === 'he';
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const approve = async () => {
    if (!window.confirm(he ? 'לאשר סופית? הסטודנט/ית יסיים/תסיים את התזה והציון יועבר למכלול.' : 'Give the final approval? The student completes the thesis and the grade goes to Michlol.')) return;
    setBusy(true);
    setError('');
    try {
      await apiClient.approveThesisExamFinalGrade(exam.milestoneId, note.trim());
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : he ? 'הפעולה נכשלה' : 'Action failed');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mt-3 rounded-lg border border-line bg-paper p-3">
      <p className="text-sm font-semibold text-ink">{he ? 'אישור סופי לפני העברה למכלול' : 'Final approval before Michlol'}</p>
      <p className="mt-0.5 text-xs text-muted">{he ? 'ראש בית הספר ללימודים מתקדמים אישר את הציון. האישור שלך מסיים את התזה ומעביר את הציון למכלול (החיבור למכלול עדיין לא פעיל).' : 'The grad school head approved the grade. Your approval completes the thesis and sends the grade to Michlol (the Michlol connection is not live yet).'}</p>
      <label htmlFor={`final-approval-${exam.milestoneId}`} className="mt-2 block text-xs text-muted">{he ? 'הערה (לא חובה)' : 'Note (optional)'}</label>
      <textarea id={`final-approval-${exam.milestoneId}`} rows={2} value={note} onChange={(e) => setNote(e.target.value)} className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm" />
      {error && <p className="mt-2 text-xs text-danger" role="alert">{error}</p>}
      <button type="button" onClick={approve} disabled={busy} className="mt-2 rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60">
        {busy ? '…' : (he ? '✓ אישור סופי' : '✓ Final approval')}
      </button>
    </div>
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
