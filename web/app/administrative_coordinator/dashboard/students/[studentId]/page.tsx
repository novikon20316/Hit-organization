'use client';

// app/administrative_coordinator/dashboard/students/[studentId]/page.tsx
// Drill-down reached by clicking a student's name in the Students Report tab
// (../StudentsReportTab.tsx). Read-only — no grading/approval actions live
// here, those stay on the Project Groups tab where the rest of that workflow
// already lives. Data comes from a single consolidated call,
// apiClient.getStudentDetail(studentId) (see
// server/src/controllers/projectCoordinatorController.ts's getStudentDetail).

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { MilestoneTimeline, type MilestoneData } from '@/components/MilestoneTimeline';
import { useRequireRole } from '@/hooks/useRequireRole';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import { facultyLabel, type FacultyId } from '@/lib/i18n';
import { academicYearToHebrew } from '@/lib/hebrewYear';
import type { AppRole } from '@/lib/roles';
import { majorCellText } from '../../StudentsReportTab';

// Widened to include 'coordinator' — the plain faculty coordinator role is
// who actually grants thesis eligibility for a coordinator_gated student
// (see the Track card below); everything else on this page stays read-only
// for them same as for administrative_secretary.
const ADMIN_COORDINATOR_ROLES: AppRole[] = ['administrative_secretary', 'coordinator', 'system_admin'];

type StudentDetail = Awaited<ReturnType<typeof apiClient.getStudentDetail>>;

const MILESTONE_STATUS_LABEL: Record<string, { he: string; en: string }> = {
  pending:               { he: 'טרם הוגש',      en: 'Not submitted yet' },
  submitted:             { he: 'הוגש, בבדיקה',  en: 'Submitted, under review' },
  rejected:              { he: 'נדחה',           en: 'Rejected' },
  supervisor_graded:     { he: 'צוין ע"י מנחה',  en: 'Graded by supervisor' },
  graded:                { he: 'צוין',           en: 'Graded' },
  coordinator_approved:  { he: 'אושר',           en: 'Approved' },
  examiners_assigned:    { he: 'בוחנים שובצו',   en: 'Examiners assigned' },
  examiner_graded:       { he: 'צוין ע"י בוחן',  en: 'Graded by examiner' },
  both_examiners_graded: { he: 'שני הבוחנים ציינו', en: 'Both examiners graded' },
  awaiting_defense_date: { he: 'ממתין למועד הגנה', en: 'Awaiting defense date' },
  date_conflict:         { he: 'התנגשות מועדים', en: 'Date conflict' },
  defense_date_set:      { he: 'מועד הגנה נקבע', en: 'Defense date set' },
  scheduled:             { he: 'מתוזמן',         en: 'Scheduled' },
  completed:             { he: 'הושלם',          en: 'Completed' },
};

function statusLabel(status: string, lang: 'he' | 'en'): string {
  return MILESTONE_STATUS_LABEL[status]?.[lang] ?? status;
}

function academicYearLabel(academicYear: string | null): string {
  if (!academicYear) return '—';
  const hebrew = academicYearToHebrew(academicYear);
  return hebrew ? `${hebrew} (${academicYear})` : academicYear;
}

function formatDate(iso: string | null, lang: 'he' | 'en'): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function StudentDetailPage() {
  const { loading: guardLoading, isAllowed } = useRequireRole(ADMIN_COORDINATOR_ROLES);
  const { lang } = useLanguage();
  const params = useParams<{ studentId: string }>();
  const studentId = params.studentId;

  const [data, setData] = useState<StudentDetail | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState('');
  const [eligibilityReason, setEligibilityReason] = useState('');
  const [savingEligibility, setSavingEligibility] = useState(false);

  const loadDetail = async () => {
    if (!studentId) return;
    setLoadingData(true);
    setError('');
    try {
      const res = await apiClient.getStudentDetail(studentId);
      setData(res);
    } catch (err) {
      console.error('Failed to load student detail:', err);
      setError(err instanceof Error ? err.message : lang === 'he' ? 'טעינת נתוני הסטודנט נכשלה' : 'Failed to load student data');
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    loadDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId, lang]);

  const handleSetEligibility = async (eligible: boolean) => {
    setSavingEligibility(true);
    try {
      await apiClient.setStudentThesisEligibility(studentId, eligible, eligibilityReason.trim() || undefined);
      setEligibilityReason('');
      await loadDetail();
    } catch (err) {
      alert(err instanceof Error ? err.message : lang === 'he' ? 'העדכון נכשל' : 'Update failed');
    } finally {
      setSavingEligibility(false);
    }
  };

  if (guardLoading || !isAllowed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper">
        <p className="text-sm text-muted">…</p>
      </div>
    );
  }

  const student = data?.student ?? null;
  const project = data?.project ?? null;
  const currentMilestone = data?.currentMilestone ?? null;
  const submittedMilestones = data?.milestones ?? [];
  const milestoneRoadmap = data?.milestoneRoadmap ?? [];

  return (
    <DashboardShell
      title={lang === 'he' ? 'פרטי סטודנט' : 'Student Detail'}
      subtitle={student?.name || ''}
    >
      <Link href="/administrative_coordinator/dashboard?tab=students" className="text-sm font-medium text-primary hover:underline">
        {lang === 'he' ? '← חזרה לדוח הסטודנטים' : '← Back to Students Report'}
      </Link>

      {loadingData && <p className="mt-4 text-sm text-muted">{lang === 'he' ? 'טוען…' : 'Loading…'}</p>}
      {error && <p className="mt-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}

      {!loadingData && !error && student && (
        <div className="mt-4 grid gap-4">
          {/* Student profile */}
          <div className="rounded-[var(--radius)] border border-line bg-surface p-5">
            <p className="text-lg font-semibold text-ink">👤 {student.name}</p>
            <div className="mt-2 grid gap-1 text-sm text-muted sm:grid-cols-2">
              <span>🏛️ {lang === 'he' ? 'פקולטה:' : 'Faculty:'} {student.facultyId ? facultyLabel(student.facultyId as FacultyId, lang) : '—'}</span>
              <span>🎓 {lang === 'he' ? 'תואר:' : 'Degree:'} {student.degreeType ? (student.degreeType === 'masters' ? (lang === 'he' ? 'תואר שני' : "Master's") : (lang === 'he' ? 'תואר ראשון' : "Bachelor's")) : '—'}</span>
              <span>📚 {lang === 'he' ? 'מגמה:' : 'Major:'} {majorCellText(student, lang)}</span>
              <span>📆 {lang === 'he' ? 'שנת לימודים:' : 'Year of study:'} {student.yearOfStudy ?? '—'}</span>
            </div>
          </div>

          {/* Thesis/project track — see server/src/config/studentTrack.ts */}
          <div className="rounded-[var(--radius)] border border-line bg-surface p-5">
            <p className="text-sm font-semibold text-ink">🧭 {lang === 'he' ? 'מסלול (תזה/פרויקט)' : 'Track (Thesis/Project)'}</p>
            {student.trackPolicy === 'coordinator_gated' ? (
              <>
                <p className="mt-1 text-sm text-muted">
                  {lang === 'he' ? 'זכאות לתזה כרגע:' : 'Currently thesis-eligible:'}{' '}
                  <span className={student.thesisEligibility?.eligible ? 'text-success' : 'text-danger'}>
                    {student.thesisEligibility?.eligible ? (lang === 'he' ? 'כן' : 'Yes') : (lang === 'he' ? 'לא' : 'No')}
                  </span>
                </p>
                <p className="mt-1 text-sm text-muted">
                  {lang === 'he' ? 'מסלול שנבחר:' : 'Chosen track:'}{' '}
                  {student.track
                    ? `${student.track === 'thesis' ? (lang === 'he' ? 'תזה' : 'Thesis') : (lang === 'he' ? 'פרויקט' : 'Project')}${student.trackLocked ? ' 🔒' : ''}`
                    : (lang === 'he' ? 'טרם נבחר' : 'Not chosen yet')}
                </p>
                <input
                  value={eligibilityReason}
                  onChange={(e) => setEligibilityReason(e.target.value)}
                  placeholder={lang === 'he' ? 'סיבה (אופציונלי)' : 'Reason (optional)'}
                  className="mt-2 w-full rounded-lg border border-line bg-paper px-3 py-1.5 text-sm text-ink focus:border-primary focus:outline-none"
                />
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    disabled={savingEligibility}
                    onClick={() => handleSetEligibility(true)}
                    className="rounded-lg bg-success px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
                  >
                    {lang === 'he' ? 'סמן כזכאי/ת לתזה' : 'Mark thesis-eligible'}
                  </button>
                  <button
                    type="button"
                    disabled={savingEligibility}
                    onClick={() => handleSetEligibility(false)}
                    className="rounded-lg bg-danger px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
                  >
                    {lang === 'he' ? 'סמן כלא זכאי/ת' : 'Mark not eligible'}
                  </button>
                </div>
              </>
            ) : (
              <p className="mt-1 text-sm text-muted">
                {student.trackPolicy === 'signup_choice'
                  ? (lang === 'he'
                    ? `מסלול: ${student.track === 'thesis' ? 'תזה' : 'פרויקט'} (נבחר בהרשמה, נעול)`
                    : `Track: ${student.track === 'thesis' ? 'Thesis' : 'Project'} (chosen at signup, locked)`)
                  : (lang === 'he' ? 'מסלול: פרויקט בלבד (אין אפשרות תזה בתוכנית זו)' : 'Track: Project only (no thesis option in this program)')}
              </p>
            )}
          </div>

          {/* Communication */}
          <div className="rounded-[var(--radius)] border border-line bg-surface p-5">
            <p className="text-sm font-semibold text-ink">☎️ {lang === 'he' ? 'פרטי התקשרות' : 'Communication'}</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {student.email ? (
                <a href={`mailto:${student.email}`} dir="ltr" className="flex items-center gap-1.5 rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink hover:border-primary hover:text-primary">
                  ✉️ {student.email}
                </a>
              ) : (
                <p className="text-sm italic text-muted">{lang === 'he' ? 'לא הוגדר אימייל' : 'No email on file'}</p>
              )}
              {student.phoneNumber ? (
                <a href={`tel:${student.phoneNumber}`} dir="ltr" className="flex items-center gap-1.5 rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink hover:border-primary hover:text-primary">
                  📞 {student.phoneNumber}
                </a>
              ) : (
                <p className="text-sm italic text-muted">{lang === 'he' ? 'לא הוגדר טלפון' : 'No phone number on file'}</p>
              )}
            </div>
          </div>

          {/* Project */}
          <div className="rounded-[var(--radius)] border border-line bg-surface p-5">
            <p className="text-sm font-semibold text-ink">📁 {lang === 'he' ? 'הפרויקט/התזה' : 'Project/Thesis'}</p>
            {project ? (
              <>
                <p className="mt-1 text-sm text-ink">{lang === 'he' ? project.titleHe : project.titleEn}</p>
                <p className="mt-1 text-xs text-muted">👨‍🏫 {project.supervisorName || (lang === 'he' ? 'ללא מנחה' : 'No supervisor')}</p>
                <p className="mt-1 text-xs text-muted">
                  📆 {lang === 'he' ? 'שנת לימודים (תחילת הפרויקט):' : 'Study year (project start):'} {academicYearLabel(project.academicYear)}
                </p>
              </>
            ) : (
              <p className="mt-1 text-sm text-muted">{lang === 'he' ? 'הסטודנט אינו רשום כרגע לפרויקט/תזה' : 'Student is not currently enrolled in a project/thesis'}</p>
            )}
          </div>

          {/* Current milestone */}
          {project && (
            <div className="rounded-[var(--radius)] border border-line bg-surface p-5">
              <p className="text-sm font-semibold text-ink">📍 {lang === 'he' ? 'אבן דרך נוכחית' : 'Current Milestone'}</p>
              {currentMilestone ? (
                <>
                  <p className="mt-1 text-sm text-ink">{lang === 'he' ? currentMilestone.nameHe : currentMilestone.nameEn}</p>
                  <p className="mt-1 text-xs text-muted">
                    {statusLabel(currentMilestone.status, lang)}
                    {' · '}
                    📅 {lang === 'he' ? 'תאריך יעד:' : 'Due:'} {formatDate(currentMilestone.dueDate, lang)}
                  </p>
                </>
              ) : (
                <p className="mt-1 text-sm text-muted">{lang === 'he' ? 'אין אבן דרך פעילה' : 'No active milestone'}</p>
              )}
            </div>
          )}

          {/* Visual roadmap — the whole track at a glance: what's done, what's
              current, and what's still ahead. Read-only view of the same
              component the student/supervisor dashboards use; viewerRole is
              deliberately a string that matches none of MilestoneTimeline's
              action-granting role lists, so no grade/date/schedule actions
              render here. */}
          {project && milestoneRoadmap.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-semibold text-ink">🗺️ {lang === 'he' ? 'מסלול אבני הדרך' : 'Milestone Roadmap'}</p>
              <MilestoneTimeline
                milestones={milestoneRoadmap as unknown as MilestoneData[]}
                viewerRole="coordinator_readonly"
                projectId={project.id}
              />
            </div>
          )}

          {/* Submitted milestones + grades */}
          <div className="rounded-[var(--radius)] border border-line bg-surface p-5">
            <p className="text-sm font-semibold text-ink">📤 {lang === 'he' ? 'אבני דרך שהוגשו' : 'Submitted Milestones'}</p>
            {submittedMilestones.length === 0 ? (
              <p className="mt-2 text-sm text-muted">{lang === 'he' ? 'הסטודנט טרם הגיש אבני דרך' : 'The student has not submitted any milestones yet'}</p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[560px] text-start text-sm">
                  <thead>
                    <tr className="border-b border-line text-xs text-muted">
                      <th className="px-2 py-1.5 text-start font-medium">{lang === 'he' ? 'אבן דרך' : 'Milestone'}</th>
                      <th className="px-2 py-1.5 text-start font-medium">{lang === 'he' ? 'הוגש בתאריך' : 'Submitted'}</th>
                      <th className="px-2 py-1.5 text-start font-medium">{lang === 'he' ? 'סטטוס' : 'Status'}</th>
                      <th className="px-2 py-1.5 text-start font-medium">{lang === 'he' ? 'ציון' : 'Grade'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {submittedMilestones.map((m) => (
                      <tr key={m.id} className="border-b border-line last:border-b-0">
                        <td className="px-2 py-1.5 text-ink">{lang === 'he' ? m.nameHe : m.nameEn}</td>
                        <td className="px-2 py-1.5 text-ink">{formatDate(m.submittedAt, lang)}</td>
                        <td className="px-2 py-1.5 text-ink">{statusLabel(m.status, lang)}</td>
                        <td className="px-2 py-1.5 font-semibold text-ink">
                          {m.finalGrade !== null ? `${m.finalGrade}${m.gradeApproved ? ' ✅' : ''}` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {!loadingData && !error && !student && (
        <p className="mt-4 text-sm text-muted">{lang === 'he' ? 'הסטודנט לא נמצא' : 'Student not found'}</p>
      )}
    </DashboardShell>
  );
}
