'use client';

// app/examinor/home/AssignmentCard.tsx
import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import { getFacultyColor } from '@/lib/facultyColors';
import { MILESTONE_LABEL, type AssignedMilestone, type GradeWeights, type IdentityGradeWeights } from './types';

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

export function AssignmentCard({ milestone: m, uid, onChanged, onGrade, onGradeKind, onGradeForm }: AssignmentCardProps) {
  const { lang } = useLanguage();
  const [expanded, setExpanded] = useState(false);
  // Dates the examiner has picked so far (chips), plus whatever's currently
  // selected in the native date input but not yet added to the list.
  const [pickedDates, setPickedDates] = useState<string[]>([]);
  const [dateInput, setDateInput] = useState('');
  const [submittingDates, setSubmittingDates] = useState(false);
  const [dateMessage, setDateMessage] = useState('');

  const facultyColor = getFacultyColor(m.facultyId);
  // Three-rubric final-grade workflow (see workflowTemplates.ts's
  // finalGradeComponents) — this examiner submits two independent rubrics
  // (project + defense) instead of the single shared score below.
  const isThreeRubric = !!m.finalGradeComponents;
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
  // assumed peer.
  const otherExaminers = m.examinerIds
    .filter((id) => id !== uid)
    .map((otherUid) => ({
      uid: otherUid,
      name: (m.defensePanel ?? []).find((p) => p.ref === otherUid)?.displayName ?? (lang === 'he' ? 'לא ידוע' : 'Unknown'),
      graded: isFormOnly ? m.examinerFormAnswers?.[otherUid] != null : m.examinerScores?.[otherUid] != null,
    }));
  const isMyDefensePanel = (m.defensePanel ?? []).some((p) => p.type === 'internal' && p.ref === uid);
  const isBeforeDefense = m.defenseDate ? new Date() < new Date(m.defenseDate) : false;

  const addPickedDate = () => {
    if (!dateInput) return;
    setPickedDates((prev) => (prev.includes(dateInput) ? prev : [...prev, dateInput].sort()));
    setDateInput('');
  };
  const removePickedDate = (d: string) => setPickedDates((prev) => prev.filter((x) => x !== d));

  const handleSubmitDates = async () => {
    if (pickedDates.length === 0) {
      setDateMessage(lang === 'he' ? 'יש להוסיף לפחות תאריך אחד' : 'Add at least one date');
      return;
    }
    setSubmittingDates(true);
    setDateMessage('');
    try {
      const res = await apiClient.submitExaminerDefenseDates(m.id, pickedDates);
      if (res.matched) setDateMessage(lang === 'he' ? `✅ נמצא תאריך משותף: ${res.matchedDate}` : `✅ Common date found: ${res.matchedDate}`);
      else if (res.conflict) setDateMessage(lang === 'he' ? 'לא נמצא תאריך משותף — הרכז/ת יפתור/תפתור' : 'No common date — the coordinator will resolve this');
      else setDateMessage(lang === 'he' ? '✅ התאריכים נשלחו — ממתין לשאר הבוחנים' : '✅ Dates submitted — waiting on the other examiners');
      onChanged();
    } catch (err) {
      setDateMessage(err instanceof Error ? err.message : 'Failed to submit candidate dates');
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
                {otherExaminers
                  .map((oe) => `${oe.name} (${oe.graded ? (lang === 'he' ? 'ציון הוגש' : 'graded') : lang === 'he' ? 'טרם הוגש' : 'pending'})`)
                  .join(', ')}
              </p>
            )
          ) : (
            <p className="text-xs text-examinor-on-surface-variant">🔢 {lang === 'he' ? `אני בוחן #${examinerIndex}` : `I am Examiner #${examinerIndex}`}</p>
          )}
        </div>
        {m.defenseDate && (
          <p className="mt-1.5 inline-block rounded-full bg-examinor-surface-container-low px-2.5 py-1 text-xs font-medium text-examinor-on-surface">
            📅 {new Date(m.defenseDate).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US')}
            {m.defenseRoom ? ` · ${m.defenseRoom}` : ''}
          </p>
        )}
      </button>

      {m.status === 'awaiting_defense_date' && isMyDefensePanel && (
        <div className="mt-3 rounded-lg bg-[#FBF3E3] p-3">
          <p className="mb-1.5 text-xs font-semibold text-accent">📅 {lang === 'he' ? 'בחר תאריכים אפשריים להגנה' : 'Choose your available defense dates'}</p>
          <p className="mb-1.5 text-xs text-accent">
            {lang === 'he'
              ? 'המערכת תאתר אוטומטית תאריך שמתאים לכל חברי ועדת הבחינה. ככל שתוסיף/י יותר תאריכים אפשריים, כך גדל הסיכוי למצוא תאריך משותף במהירות — אם לא יימצא תאריך משותף, הרכז/ת יפתור/תפתור את ההתנגשות.'
              : "The system will automatically match a date that works for every panel member. Add as many dates as you can — the more you list, the more likely a common date is found quickly. If none is found, the coordinator will step in to resolve it."}
          </p>
          {m.dateMatching && (
            <p className="mb-1.5 text-xs text-accent">
              {lang === 'he' ? 'בטווח' : 'Within'} {toDateSafe(m.dateMatching.windowStart)?.toLocaleDateString() ?? '—'} –{' '}
              {toDateSafe(m.dateMatching.windowEnd)?.toLocaleDateString() ?? '—'} · {lang === 'he' ? 'ראשון–חמישי בלבד' : 'Sun-Thu only'}
            </p>
          )}

          {pickedDates.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {pickedDates.map((d) => (
                <span key={d} className="flex items-center gap-1 rounded-full bg-surface px-2.5 py-1 text-xs font-medium text-ink">
                  {new Date(d).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-GB')}
                  <button
                    type="button"
                    onClick={() => removePickedDate(d)}
                    aria-label={lang === 'he' ? 'הסר תאריך' : 'Remove date'}
                    className="text-muted hover:text-danger"
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="flex gap-1.5">
            <input
              type="date"
              value={dateInput}
              onChange={(e) => setDateInput(e.target.value)}
              min={toDateInputValue(toDateSafe(m.dateMatching?.windowStart))}
              max={toDateInputValue(toDateSafe(m.dateMatching?.windowEnd))}
              className="flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
            />
            <button
              type="button"
              onClick={addPickedDate}
              disabled={!dateInput}
              className="rounded-lg border border-accent px-3 py-2 text-xs font-semibold text-accent hover:bg-surface disabled:opacity-50"
            >
              + {lang === 'he' ? 'הוסף' : 'Add'}
            </button>
          </div>

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
                  <p className="text-sm font-semibold text-examinor-on-surface">{MILESTONE_LABEL[mg.type]?.[lang] ?? mg.type}</p>
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
        {graded ? (
          <span className="block rounded-lg bg-success-bg px-3 py-2 text-center text-xs font-semibold text-success">
            ✅ {lang === 'he' ? 'ציון הוגש' : 'Grade submitted'}
          </span>
        ) : isBeforeDefense ? (
          <span className="block rounded-lg bg-[#FFF7ED] px-3 py-2 text-center text-xs font-semibold text-[#F97316]">
            🕐 {lang === 'he' ? 'ניתן לציין רק לאחר ההגנה' : 'Grading opens after the defense'} ·{' '}
            {new Date(m.defenseDate!).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-GB', { day: 'numeric', month: 'long' })}
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
    </div>
  );
}
