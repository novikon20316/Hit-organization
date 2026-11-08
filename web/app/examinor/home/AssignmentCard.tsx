'use client';

// app/examinor/home/AssignmentCard.tsx
import { useState } from 'react';
import { defenseModeIcon, defenseModeLabel, resolveDefenseMode, showsDefenseLink, showsDefensePlace } from '@/lib/defenseDisplay';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import { getFacultyColor } from '@/lib/facultyColors';
import { MILESTONE_LABEL, type AssignedMilestone, type GradeWeights, type IdentityGradeWeights } from './types';
import { milestoneDisplayName } from '@/lib/milestoneLabel';
import { AvailabilityCalendar } from '@/components/AvailabilityCalendar';
import { EvaluationFormModal } from '@/components/EvaluationFormModal';
import { ExaminerOpinionFormModal } from '@/components/ExaminerOpinionFormModal';

interface AssignmentCardProps {
  milestone: AssignedMilestone;
  uid: string;
  onChanged: () => void;
  onGrade: (m: AssignedMilestone) => void;
  /** Three-rubric workflow only (see workflowTemplates.ts's finalGradeComponents) —
   *  opens ExaminerEvaluationModal for this examiner's own project/defense rubric. */
  onGradeKind: (m: AssignedMilestone, kind: 'project' | 'defense') => void;
  /** Non-scored examiner Q&A workflow (see workflowTemplates.ts's
   *  examinerFormFields) — opens ExaminerFormFieldsModal instead of the
   *  numeric-rubric GradeExaminerModal. */
  onGradeForm: (m: AssignedMilestone) => void;
  /** Independent parallel signoff (see workflowTemplates.ts's
   *  preGradeSignoffs) — a plain one-shot approval, not a score. Only
   *  meaningful for examinerIds[0]. */
  onSignoff: (m: AssignedMilestone) => void;
}

function toDateSafe(val: unknown): Date | null {
  if (!val) return null;
  if (typeof val === 'object' && val !== null && '_seconds' in val) return new Date((val as { _seconds: number })._seconds * 1000);
  const d = new Date(val as string);
  return isNaN(d.getTime()) ? null : d;
}

// yyyy-mm-dd for native <input type="date"> min/max — toDateSafe(...)'s
// toISOString would shift across the local timezone boundary, so build the
// string from local date parts instead.
function toDateInputValue(d: Date | null): string | undefined {
  if (!d) return undefined;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** E1 — everything about one defense in one place: when, where (room or
 *  the Zoom link), the student's latest submitted files, this examiner's own
 *  status, and — once grading is open — how many of the panel have
 *  submitted (a count only). */
function DefenseSummary({ m, lang, graded, gradingOpen }: { m: AssignedMilestone; lang: 'he' | 'en'; graded: boolean; gradingOpen: boolean }) {
  const he = lang === 'he';
  const mode = resolveDefenseMode(m);
  const latestWithFiles = [...m.milestoneHistory].reverse().find((h) => h.fileUrls.length > 0);
  return (
    <div className="mt-3 grid gap-1.5 rounded-lg bg-examinor-surface-container-low p-3 text-xs text-examinor-on-surface">
      <p className="font-semibold">🎓 {he ? 'ההגנה במבט אחד' : 'Defense at a glance'}</p>
      <p>
        📅 {m.defenseDate
          ? `${new Date(m.defenseDate).toLocaleDateString(he ? 'he-IL' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}${m.defenseTime ? ` · ${m.defenseTime}` : ''}`
          : he ? 'המועד טרם נקבע' : 'Date not set yet'}
      </p>
      {m.defenseDate && <p>{defenseModeIcon(mode)} {defenseModeLabel(mode, lang)}</p>}
      {m.defenseDate && showsDefensePlace(m) && (m.defenseRoom || m.defenseBuilding) && (
        <p>📍 {[m.defenseRoom, m.defenseBuilding].filter(Boolean).join(' · ')}</p>
      )}
      {m.defenseDate && showsDefenseLink(m) && m.onlineDefenseLink && (
        <a href={m.onlineDefenseLink} target="_blank" rel="noopener noreferrer" className="font-semibold text-examinor-primary hover:underline">
          🎥 {he ? 'כניסה לפגישת Zoom' : 'Join the Zoom meeting'}
        </a>
      )}
      {latestWithFiles && (
        <p className="flex flex-wrap gap-x-2">
          <span>📄 {milestoneDisplayName(latestWithFiles, lang, MILESTONE_LABEL)}:</span>
          {latestWithFiles.fileUrls.map((url, i) => (
            <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="text-examinor-primary hover:underline">
              {he ? `קובץ ${i + 1}` : `File ${i + 1}`}
            </a>
          ))}
        </p>
      )}
      <p className="font-medium">
        {graded ? `✅ ${he ? 'הציון שלך הוגש' : 'You have submitted'}` : `⏳ ${he ? 'טרם הגשת' : 'You have not submitted yet'}`}
        {gradingOpen && m.panelProgress && m.panelProgress.total > 1
          ? ` · ${he ? `${m.panelProgress.submitted} מתוך ${m.panelProgress.total} בוחנים הגישו` : `${m.panelProgress.submitted} of ${m.panelProgress.total} examiners submitted`}`
          : ''}
      </p>
    </div>
  );
}

export function AssignmentCard({ milestone: m, uid, onChanged, onGrade, onGradeKind, onGradeForm, onSignoff }: AssignmentCardProps) {
  const { lang } = useLanguage();
  const [expanded, setExpanded] = useState(false);
  // Dates the examiner has picked so far (chips), plus whatever's currently
  // selected in the native date input but not yet added to the list.
  const [pickedDates, setPickedDates] = useState<string[]>([]);
  const [submittingDates, setSubmittingDates] = useState(false);
  const [dateMessage, setDateMessage] = useState('');

  const facultyColor = getFacultyColor(m.facultyId);
  // Three-rubric final-grade workflow (see workflowTemplates.ts's
  // finalGradeComponents) — this examiner submits two independent rubrics
  // (project + defense) instead of the single shared score below.
  const isThreeRubric = !!m.finalGradeComponents;
  // Per-student paper form (e.g. Electrical B.Sc.): both examiner rubrics are
  // filled at once, one score column per student, in EvaluationFormModal.
  const isPerStudentForm = !!m.finalGradeComponents?.perStudent;
  const [showEvaluationForm, setShowEvaluationForm] = useState(false);
  const isOpinionForm = !!m.hasExaminerOpinionForm;
  const [showOpinionForm, setShowOpinionForm] = useState(false);
  const myEvaluations = m.examinerEvaluations?.[uid];
  const projectDone = !!myEvaluations?.project;
  const defenseDone = !!myEvaluations?.defense;
  // Identity-keyed defense milestones (post-generalization) carry
  // examinerScores instead of the legacy examiner1Score/examiner2Score pair —
  // legacy milestones (no examinerScores at all) keep the old "#1/#2"
  // positional display, forever (no migration).
  const isIdentityKeyed = m.examinerScores != null;
  const examinerIndex = m.examinerIds[0] === uid ? 1 : 2;
  // Generic chain-routing milestones (e.g. the examiner-only 'poster' type —
  // see server/src/services/milestoneRouting.ts's isChainDriven) carry
  // neither examinerScores nor finalGradeComponents, so without this check
  // the legacy positional fallback below would read examiner1Score/
  // examiner2Score as `undefined !== null` (true) and show "already graded"
  // before this examiner ever submitted anything.
  const isChainDriven = m.stageScores != null;
  const gradedViaChain = Object.values(m.stageScores ?? {}).some((entry) => entry?.gradedBy === uid);
  // Non-scored examiner Q&A milestones (see workflowTemplates.ts's
  // examinerFormFields) track completion via examinerFormAnswers instead of
  // examinerScores — every requiresExaminers milestone gets an (empty)
  // examinerScores map at enrollment regardless of shape, so isIdentityKeyed
  // alone can't tell these two apart.
  const isFormOnly = (m.examinerFormFields?.length ?? 0) > 0;
  const graded = isThreeRubric
    ? projectDone && defenseDone
    : isFormOnly
      ? m.examinerFormAnswers?.[uid] != null
      : isChainDriven
        ? gradedViaChain
        : isIdentityKeyed
          ? m.examinerScores?.[uid] != null
          : examinerIndex === 1 ? m.examiner1Score !== null : m.examiner2Score !== null;
  // Panel size is configurable per faculty/degree (see workflowTemplates.ts's
  // examinerCount) — every OTHER examiner on the panel, not just a single
  // assumed peer. Names only: whether each one has graded is no longer sent
  // (see panelProgress for the count everyone may see).
  const otherExaminers = m.examinerIds
    .filter((id) => id !== uid)
    .map((otherUid) => ({
      uid: otherUid,
      name: (m.defensePanel ?? []).find((p) => p.ref === otherUid)?.displayName ?? (lang === 'he' ? 'לא ידוע' : 'Unknown'),
    }));
  const isMyDefensePanel = (m.defensePanel ?? []).some((p) => p.type === 'internal' && p.ref === uid);
  // BUG FIX: the date-picking form was gated only on m.status ===
  // 'awaiting_defense_date' — which stays true until EVERY panel member has
  // submitted, not just this one. An examiner who'd already submitted their
  // own dates (waiting on their co-examiner) still saw the fully editable
  // add/remove form with no indication they'd already acted, and nothing
  // stopped them from submitting again — silently overwriting their own
  // prior submission for the round (submitCandidateDatesAndResolve just
  // replaces submissions[examinerKey] unconditionally). Mirrors
  // DefenseDateSection.tsx's 'awaiting_other_examiners' state for the
  // external-examiner equivalent.
  const myExaminerKey = `internal:${uid}`;
  const hasSubmittedThisRound = m.dateMatching?.submissions?.[myExaminerKey]?.roundIndex === m.dateMatching?.currentRound;
  // BUG FIX: the ternary's false branch previously meant "no defense date
  // set yet" was treated as "NOT before the defense" — i.e. grading was
  // shown as OPEN while the panel was still mid-way through picking a date,
  // let alone having reached it. Server-side (submitExaminerEvaluation)
  // already rejects this regardless, but the button was still visible and
  // clickable, opening the grading modal before bouncing on submit. Now
  // blocks whenever there's no agreed date at all, not just when there is
  // one and it's still in the future.
  const isBeforeDefense = !m.defenseDate || new Date() < new Date(m.defenseDate);
  // Independent parallel signoff (see workflowTemplates.ts's
  // preGradeSignoffs) — checked BEFORE isBeforeDefense below, since this kind
  // of milestone (e.g. Electrical Engineering's Interim Report) has no
  // defense date at all and would otherwise be wrongly stuck on "grading
  // opens after the defense". Only examinerIds[0] ("examiner #1") has
  // anything to do here; a co-examiner sees a plain status line instead.
  const isParallelSignoff = !!m.preGradeSignoffs?.examinerOne;
  const isExaminerOne = m.examinerIds[0] === uid;

  // Candidate dates come from AvailabilityCalendar, which only offers days
  // the server's validateCandidateDates (defenseScheduling.ts) would accept —
  // Sun–Thu, not past, inside the window. The server still re-validates.
  const handleSubmitDates = async () => {
    // A date sitting in the native picker but never explicitly added (the
    // examiner picked a date and hit Submit directly, without noticing "+
    // Add" is a separate step) previously vanished silently — pickedDates
    // stayed empty, and Submit showed "add at least one date" even though
    // they'd clearly selected one. Fold it in here instead of requiring a
    // second explicit action.
    const datesToSubmit = pickedDates;
    if (datesToSubmit.length === 0) {
      setDateMessage(lang === 'he' ? 'יש להוסיף לפחות תאריך אחד' : 'Add at least one date');
      return;
    }
    setSubmittingDates(true);
    setDateMessage('');
    try {
      const res = await apiClient.submitExaminerDefenseDates(m.id, datesToSubmit);
      if (res.matched) setDateMessage(lang === 'he' ? `✅ נמצא תאריך משותף: ${res.matchedDate}` : `✅ Common date found: ${res.matchedDate}`);
      else if (res.conflict) setDateMessage(lang === 'he' ? 'לא נמצא תאריך משותף — הרכז/ת יפתור/תפתור' : 'No common date — the coordinator will resolve this');
      else setDateMessage(lang === 'he' ? '✅ התאריכים נשלחו — ממתין לשאר הבוחנים' : '✅ Dates submitted — waiting on the other examiners');
      onChanged();
    } catch (err) {
      // Deliberately NOT displaying err.message — that's the server's raw,
      // always-English validation text. The cases it would normally explain
      // (weekend, past, outside window) can't be picked in the calendar at
      // all, so a rejection here is almost always
      // something generic (network, already resolved) that this covers fine.
      setDateMessage(lang === 'he' ? 'שליחת התאריכים נכשלה — נסה/י שוב' : 'Failed to submit dates — please try again');
    } finally {
      setSubmittingDates(false);
    }
  };

  return (
    <div className="role-rail rounded-examinor border border-examinor-outline-variant bg-examinor-surface-container-lowest p-4" style={{ '--rail-color': facultyColor } as React.CSSProperties}>
      <button type="button" onClick={() => setExpanded((v) => !v)} className="w-full text-start">
        <p className="text-sm font-semibold text-examinor-on-surface">{lang === 'he' ? m.projectTitleHe : m.projectTitleEn}</p>
        <div className="mt-1.5 grid gap-1">
          <p className="text-xs text-examinor-on-surface-variant">👤 {m.studentNames.join(', ')}</p>
          <p className="text-xs text-examinor-on-surface-variant">
            👨‍🏫 {lang === 'he' ? 'מנחה:' : 'Supervisor:'} {m.supervisorName}
          </p>
          {isIdentityKeyed ? (
            otherExaminers.length > 0 && (
              <p className="text-xs text-examinor-on-surface-variant">
                🤝 {lang === 'he' ? (otherExaminers.length > 1 ? 'בוחנים נוספים:' : 'בוחן/ת נוסף/ת:') : otherExaminers.length > 1 ? 'Co-examiners:' : 'Co-examiner:'}{' '}
                {otherExaminers.map((oe) => oe.name).join(', ')}
              </p>
            )
          ) : (
            <p className="text-xs text-examinor-on-surface-variant">🔢 {lang === 'he' ? `אני בוחן #${examinerIndex}` : `I am Examiner #${examinerIndex}`}</p>
          )}
        </div>
        {m.defenseDate && (
          <p className="mt-1.5 inline-block rounded-full bg-examinor-surface-container-low px-2.5 py-1 text-xs font-medium text-examinor-on-surface">
            📅 {new Date(m.defenseDate).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US')}
            {m.defenseTime ? ` · ${m.defenseTime}` : ''}
            {m.defenseTime ? ` · ${defenseModeIcon(resolveDefenseMode(m))}` : ''}
            {showsDefensePlace(m) && m.defenseRoom ? ` · ${m.defenseRoom}` : ''}
          </p>
        )}
      </button>

      {(m.type === 'defense' || isMyDefensePanel) && (
        <DefenseSummary m={m} lang={lang} graded={graded} gradingOpen={!isBeforeDefense} />
      )}

      {m.status === 'awaiting_defense_date' && isMyDefensePanel && hasSubmittedThisRound && (
        <p className="mt-3 rounded-lg bg-[#FBF3E3] p-3 text-xs font-semibold text-accent">
          ✅ {lang === 'he' ? 'התאריכים נשלחו — ממתין לשאר הבוחנים' : 'Dates submitted — waiting on the other examiners'}
        </p>
      )}

      {m.status === 'awaiting_defense_date' && isMyDefensePanel && !hasSubmittedThisRound && (
        <div className="mt-3 rounded-lg bg-[#FBF3E3] p-3">
          <p className="mb-1.5 text-xs font-semibold text-accent">📅 {lang === 'he' ? 'בחר תאריכים אפשריים להגנה' : 'Choose your available defense dates'}</p>
          <p className="mb-1.5 text-xs text-accent">
            {lang === 'he'
              ? 'המערכת תאתר אוטומטית תאריך שמתאים לכל חברי ועדת הבחינה. ככל שתוסיף/י יותר תאריכים אפשריים, כך גדל הסיכוי למצוא תאריך משותף במהירות — אם לא יימצא תאריך משותף, הרכז/ת יפתור/תפתור את ההתנגשות.'
              : "The system will automatically match a date that works for every panel member. Add as many dates as you can — the more you list, the more likely a common date is found quickly. If none is found, the coordinator will step in to resolve it."}
          </p>
          {m.dateMatching && (
            <p className="mb-1.5 text-xs text-accent">
              {lang === 'he' ? 'בטווח' : 'Within'} {toDateSafe(m.dateMatching.windowStart)?.toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-GB') ?? '—'} –{' '}
              {toDateSafe(m.dateMatching.windowEnd)?.toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-GB') ?? '—'} · {lang === 'he' ? 'ראשון–חמישי בלבד' : 'Sun-Thu only'}
            </p>
          )}

          <AvailabilityCalendar
            lang={lang}
            windowStart={toDateInputValue(toDateSafe(m.dateMatching?.windowStart)) || null}
            windowEnd={toDateInputValue(toDateSafe(m.dateMatching?.windowEnd)) || null}
            selected={pickedDates}
            onChange={(dates) => { setPickedDates(dates); setDateMessage(''); }}
          />

          {dateMessage && <p className="mt-1.5 text-xs text-ink">{dateMessage}</p>}
          <button
            type="button"
            onClick={handleSubmitDates}
            disabled={submittingDates}
            className="mt-2 w-full rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-accent-ink hover:opacity-90 disabled:opacity-60"
          >
            {submittingDates ? '…' : lang === 'he' ? 'שלח תאריכים' : 'Submit dates'}
          </button>
        </div>
      )}

      {m.status === 'date_conflict' && (
        <p className="mt-3 rounded-lg bg-danger-bg p-3 text-xs font-semibold text-danger">
          ⚠️ {lang === 'he' ? 'לא נמצא תאריך משותף — הרכז/ת פותר/ת' : 'No common date found — coordinator resolving'}
        </p>
      )}

      {m.gradeWeights && (
        <div className="mt-3 flex gap-1.5">
          {(isIdentityKeyed
            ? [
                { label: lang === 'he' ? 'מנחה' : 'Supervisor', w: m.gradeWeights.supervisorWeight, hl: false },
                { label: lang === 'he' ? 'בוחנים (לכל אחד)' : 'Examiners (each)', w: (m.gradeWeights as IdentityGradeWeights).examinerWeight, hl: true },
              ]
            : [
                { label: lang === 'he' ? 'מנחה' : 'Supervisor', w: m.gradeWeights.supervisorWeight, hl: false },
                { label: lang === 'he' ? 'בוחן 1' : 'Examiner 1', w: (m.gradeWeights as GradeWeights).examiner1Weight, hl: examinerIndex === 1 },
                { label: lang === 'he' ? 'בוחן 2' : 'Examiner 2', w: (m.gradeWeights as GradeWeights).examiner2Weight, hl: examinerIndex === 2 },
              ]
          ).map((wt) => (
            <span
              key={wt.label}
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${wt.hl ? 'bg-examinor-primary text-examinor-on-primary' : 'bg-examinor-surface-container-low text-examinor-on-surface'}`}
            >
              {wt.label} {Math.round(wt.w * 100)}%
            </span>
          ))}
        </div>
      )}

      {expanded && (
        <div className="mt-3 grid gap-2 border-t border-examinor-outline-variant pt-3">
          <p className="text-xs font-semibold text-examinor-on-surface">📊 {lang === 'he' ? 'ציונים ומסמכים לפי אבן דרך' : 'Grades & Files by Milestone'}</p>
          {m.milestoneHistory.map((mg) => {
            const isGraded = mg.supervisorScore !== null;
            const railColor = isGraded ? 'var(--success)' : facultyColor;
            return (
              <div
                key={mg.type}
                className="role-rail rounded-lg border border-examinor-outline-variant bg-examinor-surface-container-lowest p-3"
                style={{ '--rail-color': railColor } as React.CSSProperties}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-examinor-on-surface">{milestoneDisplayName(mg, lang, MILESTONE_LABEL)}</p>
                  <span
                    className="shrink-0 whitespace-nowrap rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                    style={{ backgroundColor: isGraded ? 'var(--success-bg)' : '#FBF3E3', color: isGraded ? 'var(--success)' : '#B8862E' }}
                  >
                    {isGraded ? `✅ ${lang === 'he' ? 'נוקד' : 'Graded'}` : `⏳ ${lang === 'he' ? 'טרם ניתן' : 'Not yet'}`}
                  </span>
                </div>

                <div className="mt-2 flex items-center justify-between border-t border-examinor-outline-variant/60 pt-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-examinor-on-surface-variant">{lang === 'he' ? 'ציון מנחה' : 'Supervisor score'}</span>
                  <span className="text-xs font-bold" style={{ color: isGraded ? 'var(--success)' : 'var(--muted)' }}>
                    🏆 {isGraded ? `${mg.supervisorScore}` : lang === 'he' ? 'טרם ניתן' : 'Not yet'}
                  </span>
                </div>

                {mg.supervisorComment && <p className="mt-2 text-xs text-examinor-on-surface">💬 {mg.supervisorComment}</p>}

                {mg.fileUrls.length > 0 ? (
                  <div className="mt-2">
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-examinor-on-surface-variant">
                      {lang === 'he' ? 'קבצים שהוגשו' : 'Submitted Files'}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {mg.fileUrls.map((url, i) => (
                        <a
                          key={i}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 rounded-lg border border-examinor-outline-variant bg-examinor-surface-container-low px-2 py-1 text-xs text-examinor-on-surface hover:border-examinor-primary hover:text-examinor-primary"
                        >
                          📄 {lang === 'he' ? `קובץ ${i + 1}` : `File ${i + 1}`}
                        </a>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-examinor-on-surface-variant">{lang === 'he' ? 'לא הועלו קבצים' : 'No files uploaded'}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-3">
        {isParallelSignoff ? (
          m.examinerOneSignoff ? (
            <span className="block rounded-lg bg-success-bg px-3 py-2 text-center text-xs font-semibold text-success">
              ✅ {lang === 'he' ? 'האישור נשלח' : 'Sign-off submitted'}
            </span>
          ) : isExaminerOne ? (
            <button
              type="button"
              onClick={() => onSignoff(m)}
              className="w-full rounded-lg px-3 py-2 text-xs font-semibold text-white hover:opacity-90"
              style={{ backgroundColor: facultyColor }}
            >
              ✍️ {lang === 'he' ? 'אשר כבוחן ראשי' : 'Sign off as examiner #1'}
            </button>
          ) : (
            <span className="block rounded-lg bg-examinor-surface-container-low px-3 py-2 text-center text-xs font-semibold text-examinor-on-surface-variant">
              {lang === 'he' ? 'ממתין לאישור הבוחן הראשי' : "Awaiting examiner #1's sign-off"}
            </span>
          )
        ) : isOpinionForm ? (
          <button
            type="button"
            onClick={() => setShowOpinionForm(true)}
            className={m.myOpinionSubmitted
              ? 'w-full rounded-lg bg-success-bg px-3 py-2 text-xs font-semibold text-success hover:opacity-90'
              : 'w-full rounded-lg px-3 py-2 text-xs font-semibold text-white hover:opacity-90'}
            style={m.myOpinionSubmitted ? undefined : { backgroundColor: facultyColor }}
          >
            {m.myOpinionSubmitted
              ? `✅ ${lang === 'he' ? 'חוות הדעת נחתמה — צפייה/עדכון' : 'Opinion signed — view/update'}`
              : `📝 ${lang === 'he' ? 'מלא/י טופס בוחן (חוות דעת)' : "Fill in the examiner's opinion form"}`}
          </button>
        ) : isPerStudentForm ? (
          <button
            type="button"
            onClick={() => setShowEvaluationForm(true)}
            className={graded
              ? 'w-full rounded-lg bg-success-bg px-3 py-2 text-xs font-semibold text-success hover:opacity-90'
              : 'w-full rounded-lg px-3 py-2 text-xs font-semibold text-white hover:opacity-90'}
            style={graded ? undefined : { backgroundColor: facultyColor }}
          >
            {graded
              ? `✅ ${lang === 'he' ? 'הטופס נחתם — צפייה/עדכון' : 'Form signed — view/update'}`
              : m.type === 'defense' && isBeforeDefense
                ? `🕐 ${lang === 'he' ? 'צפייה בטופס ההערכה (נפתח למילוי ביום ההגנה)' : 'View the evaluation form (opens on the defense day)'}`
                : `📝 ${lang === 'he' ? 'מלא/י וחתום/י טופס הערכה' : 'Fill in & sign the evaluation form'}`}
          </button>
        ) : graded ? (
          <span className="block rounded-lg bg-success-bg px-3 py-2 text-center text-xs font-semibold text-success">
            ✅ {lang === 'he' ? 'ציון הוגש' : 'Grade submitted'}
          </span>
        ) : isBeforeDefense ? (
          <span className="block rounded-lg bg-[#FFF7ED] px-3 py-2 text-center text-xs font-semibold text-[#F97316]">
            🕐 {m.defenseDate
              ? `${lang === 'he' ? 'ניתן לציין רק לאחר ההגנה' : 'Grading opens after the defense'} · ${new Date(m.defenseDate).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-GB', { day: 'numeric', month: 'long' })}`
              : (lang === 'he' ? 'ניתן לציין רק לאחר שייקבע מועד הגנה מוסכם' : 'Grading opens once a defense date has been agreed')}
          </span>
        ) : isThreeRubric ? (
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => onGradeKind(m, 'project')}
              disabled={projectDone}
              className="rounded-lg px-2.5 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: facultyColor }}
            >
              {projectDone ? `✅ ${lang === 'he' ? 'עבודת הגמר' : 'The Project'}` : `📄 ${lang === 'he' ? 'הערך עבודת גמר' : 'Grade the Project'}`}
            </button>
            <button
              type="button"
              onClick={() => onGradeKind(m, 'defense')}
              disabled={defenseDone}
              className="rounded-lg px-2.5 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: facultyColor }}
            >
              {defenseDone ? `✅ ${lang === 'he' ? 'ההגנה' : 'The Defense'}` : `🛡 ${lang === 'he' ? 'הערך הגנה' : 'Grade the Defense'}`}
            </button>
          </div>
        ) : isFormOnly ? (
          <button
            type="button"
            onClick={() => onGradeForm(m)}
            className="w-full rounded-lg px-3 py-2 text-xs font-semibold text-white hover:opacity-90"
            style={{ backgroundColor: facultyColor }}
          >
            📝 {lang === 'he' ? 'מלא/י טופס הערכה' : 'Fill Evaluation Form'}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onGrade(m)}
            className="w-full rounded-lg px-3 py-2 text-xs font-semibold text-white hover:opacity-90"
            style={{ backgroundColor: facultyColor }}
          >
            ✏️ {lang === 'he' ? 'הגש ציון' : 'Submit Grade'}
          </button>
        )}
      </div>
      {showOpinionForm && (
        <ExaminerOpinionFormModal milestoneId={m.id} onClose={() => setShowOpinionForm(false)} onChanged={onChanged} />
      )}
      {showEvaluationForm && (
        <EvaluationFormModal milestoneId={m.id} onClose={() => setShowEvaluationForm(false)} onChanged={onChanged} />
      )}
    </div>
  );
}
