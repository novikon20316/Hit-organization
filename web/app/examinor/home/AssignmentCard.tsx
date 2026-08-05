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
}

function toDateSafe(val: unknown): Date | null {
  if (!val) return null;
  if (typeof val === 'object' && val !== null && '_seconds' in val) return new Date((val as { _seconds: number })._seconds * 1000);
  const d = new Date(val as string);
  return isNaN(d.getTime()) ? null : d;
}

export function AssignmentCard({ milestone: m, uid, onChanged, onGrade, onGradeKind }: AssignmentCardProps) {
  const { lang } = useLanguage();
  const [expanded, setExpanded] = useState(false);
  const [dateDraft, setDateDraft] = useState('');
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
  const graded = isThreeRubric
    ? projectDone && defenseDone
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
      graded: m.examinerScores?.[otherUid] != null,
    }));
  const isMyDefensePanel = (m.defensePanel ?? []).some((p) => p.type === 'internal' && p.ref === uid);
  const isBeforeDefense = m.defenseDate ? new Date() < new Date(m.defenseDate) : false;

  const handleSubmitDates = async () => {
    const raw = dateDraft.split(',').map((s) => s.trim()).filter(Boolean);
    if (raw.length === 0) {
      setDateMessage(lang === 'he' ? 'יש להזין לפחות תאריך אחד' : 'Enter at least one date');
      return;
    }
    const invalid = raw.filter((d) => !/^\d{4}-\d{2}-\d{2}$/.test(d));
    if (invalid.length > 0) {
      setDateMessage(lang === 'he' ? `פורמט לא תקין: ${invalid.join(', ')} (YYYY-MM-DD)` : `Invalid format: ${invalid.join(', ')} (YYYY-MM-DD)`);
      return;
    }
    setSubmittingDates(true);
    setDateMessage('');
    try {
      const res = await apiClient.submitExaminerDefenseDates(m.id, raw);
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
    <div className="role-rail rounded-[var(--radius)] border border-line bg-surface p-4" style={{ '--rail-color': facultyColor } as React.CSSProperties}>
      <button type="button" onClick={() => setExpanded((v) => !v)} className="w-full text-start">
        <p className="text-sm font-semibold text-ink">{lang === 'he' ? m.projectTitleHe : m.projectTitleEn}</p>
        <p className="mt-0.5 text-xs text-muted">👤 {m.studentNames.join(', ')}</p>
        <p className="mt-0.5 text-xs text-muted">
          👨‍🏫 {lang === 'he' ? 'מנחה:' : 'Supervisor:'} {m.supervisorName}
        </p>
        {isIdentityKeyed ? (
          otherExaminers.length > 0 && (
            <p className="mt-0.5 text-xs text-muted">
              🤝 {lang === 'he' ? (otherExaminers.length > 1 ? 'בוחנים נוספים:' : 'בוחן/ת נוסף/ת:') : otherExaminers.length > 1 ? 'Co-examiners:' : 'Co-examiner:'}{' '}
              {otherExaminers
                .map((oe) => `${oe.name} (${oe.graded ? (lang === 'he' ? 'ציון הוגש' : 'graded') : lang === 'he' ? 'טרם הוגש' : 'pending'})`)
                .join(', ')}
            </p>
          )
        ) : (
          <p className="mt-0.5 text-xs text-muted">🔢 {lang === 'he' ? `אני בוחן #${examinerIndex}` : `I am Examiner #${examinerIndex}`}</p>
        )}
        {m.defenseDate && (
          <p className="mt-1.5 inline-block rounded-full bg-paper px-2.5 py-1 text-xs font-medium text-ink">
            📅 {new Date(m.defenseDate).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US')}
            {m.defenseRoom ? ` · ${m.defenseRoom}` : ''}
          </p>
        )}
      </button>

      {m.status === 'awaiting_defense_date' && isMyDefensePanel && (
        <div className="mt-3 rounded-lg bg-[#FBF3E3] p-3">
          <p className="mb-1.5 text-xs font-semibold text-accent">📅 {lang === 'he' ? 'בחר תאריכים אפשריים להגנה' : 'Choose your available defense dates'}</p>
          {m.dateMatching && (
            <p className="mb-1.5 text-xs text-accent">
              {lang === 'he' ? 'בטווח' : 'Within'} {toDateSafe(m.dateMatching.windowStart)?.toLocaleDateString() ?? '—'} –{' '}
              {toDateSafe(m.dateMatching.windowEnd)?.toLocaleDateString() ?? '—'} · {lang === 'he' ? 'ראשון–חמישי בלבד' : 'Sun-Thu only'}
            </p>
          )}
          <input
            value={dateDraft}
            onChange={(e) => setDateDraft(e.target.value)}
            placeholder="YYYY-MM-DD, YYYY-MM-DD"
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
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
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${wt.hl ? 'bg-primary text-primary-ink' : 'bg-paper text-ink'}`}
            >
              {wt.label} {Math.round(wt.w * 100)}%
            </span>
          ))}
        </div>
      )}

      {expanded && (
        <div className="mt-3 grid gap-2 border-t border-line pt-3">
          <p className="text-xs font-semibold text-ink">📊 {lang === 'he' ? 'ציונים ומסמכים לפי אבן דרך' : 'Grades & Files by Milestone'}</p>
          {m.milestoneHistory.map((mg) => (
            <div key={mg.type} className="rounded-lg bg-paper p-2.5">
              <p className="text-xs font-semibold text-ink">{MILESTONE_LABEL[mg.type]?.[lang] ?? mg.type}</p>
              <div className="mt-1 flex items-center justify-between">
                <span className="text-xs text-muted">{lang === 'he' ? 'ציון מנחה:' : 'Supervisor score:'}</span>
                <span className="text-xs font-medium" style={{ color: mg.supervisorScore !== null ? 'var(--success)' : 'var(--muted)' }}>
                  {mg.supervisorScore !== null ? `${mg.supervisorScore}/100` : lang === 'he' ? 'טרם ניתן' : 'Not yet'}
                </span>
              </div>
              {mg.supervisorComment && <p className="mt-1 text-xs text-ink">💬 {mg.supervisorComment}</p>}
              {mg.fileUrls.length > 0 ? (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {mg.fileUrls.map((url, i) => (
                    <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="rounded-full border border-line bg-surface px-2 py-0.5 text-xs text-ink hover:border-primary">
                      📄 {lang === 'he' ? `קובץ ${i + 1}` : `File ${i + 1}`}
                    </a>
                  ))}
                </div>
              ) : (
                <p className="mt-1 text-xs text-muted">{lang === 'he' ? 'לא הועלו קבצים' : 'No files uploaded'}</p>
              )}
            </div>
          ))}
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
