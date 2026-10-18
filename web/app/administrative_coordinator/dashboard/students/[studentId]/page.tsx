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
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import { facultyLabel, type FacultyId } from '@/lib/i18n';
import { academicYearToHebrew, currentHebrewYear } from '@/lib/hebrewYear';
import type { AppRole } from '@/lib/roles';
import { majorCellText } from '../../StudentsReportTab';
import { SPECIALIZATION_LABELS } from '@/lib/specialization';

// Widened to include 'coordinator' — the plain faculty coordinator role is
// who actually grants thesis eligibility for a coordinator_gated student
// (see the Track card below); everything else on this page stays read-only
// for them same as for administrative_secretary. 'program_head' added so a
// CS program head has somewhere to reach a specific student (see the new
// search box on app/program_head/dashboard/page.tsx's students tab).
// 'grad_school_head' added the same way, via the search box on
// app/grad_school_head/dashboard/page.tsx's overview tab. 'faculty_admin'
// added to match — already permitted on the write endpoints via
// studentTrackController.ts's THESIS_ELIGIBILITY_ROLES and on this page's
// own data load via projectCoordinatorController.ts's STUDENT_DETAIL_ROLES,
// but missing here; no dedicated search box yet on their dashboard, so today
// they'd need a direct link (e.g. from the Students List tab) to land here.
const ADMIN_COORDINATOR_ROLES: AppRole[] = ['administrative_secretary', 'coordinator', 'program_head', 'grad_school_head', 'faculty_admin', 'system_admin'];
// Grade-average entry is narrower than the page's own role guard — originally
// confirmed with the user as exactly program_head/administrative_secretary/
// system_admin; grad_school_head and faculty_admin added later so they can
// enter averages too (server-side scope-checked to their own facultyId via
// withinCoordinatorScope, same as program_head). Plain 'coordinator' keeps
// the existing manual eligible/not-eligible buttons only, same as before
// this feature existed.
// Mirrors studentTrackController.ts's SPECIALIZATION_ROLES.
const SPECIALIZATION_ROLES: AppRole[] = ['coordinator', 'administrative_secretary', 'system_admin'];
// Mirrors studentTrackController.ts's COMPLETED_COURSES_ROLES. Other roles
// that can open this page see the list read-only.
const COMPLETED_COURSES_ROLES: AppRole[] = ['coordinator', 'administrative_secretary', 'system_admin'];
const THESIS_AVERAGE_ROLES: AppRole[] = ['program_head', 'administrative_secretary', 'grad_school_head', 'faculty_admin', 'system_admin'];

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

// Falls back to today's real current Hebrew year (Rosh-Hashanah-accurate,
// not a rough "September" guess — see currentHebrewYear's comment) when the
// project has no academicYear recorded at all, which happens often since
// most project-creation paths don't reliably set that field.
function academicYearLabel(academicYear: string | null, lang: 'he' | 'en'): string {
  if (!academicYear) {
    const current = currentHebrewYear();
    return current ? `${current} (${lang === 'he' ? 'משוער לפי השנה הנוכחית' : 'estimated from the current year'})` : '—';
  }
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
  const { userData } = useAuth();
  const { lang } = useLanguage();
  const params = useParams<{ studentId: string }>();
  const studentId = params.studentId;
  const role = userData?.role as AppRole | undefined;
  const canSetAverage = !!role && THESIS_AVERAGE_ROLES.includes(role);
  const roles = [role, ...((userData?.roles ?? []) as AppRole[])].filter(Boolean) as AppRole[];
  const canSetSpecialization = roles.some((r) => SPECIALIZATION_ROLES.includes(r));
  const canEditCourses = roles.some((r) => COMPLETED_COURSES_ROLES.includes(r));

  const [data, setData] = useState<StudentDetail | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState('');
  const [eligibilityReason, setEligibilityReason] = useState('');
  const [savingEligibility, setSavingEligibility] = useState(false);
  const [averageInput, setAverageInput] = useState('');
  const [savingAverage, setSavingAverage] = useState(false);
  const [specializationInput, setSpecializationInput] = useState('');
  const [savingSpecialization, setSavingSpecialization] = useState(false);
  const [revokingReport, setRevokingReport] = useState(false);

  const loadDetail = async () => {
    if (!studentId) return;
    setLoadingData(true);
    setError('');
    try {
      const res = await apiClient.getStudentDetail(studentId);
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : lang === 'he' ? 'טעינת נתוני הסטודנט נכשלה' : 'Failed to load student data');
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    loadDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId, lang]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncs the editable input to freshly-loaded server data (e.g. after loadDetail() re-fetches following a save) rather than leaving a stale value in place
    setAverageInput(data?.student?.thesisEligibility?.average != null ? String(data.student.thesisEligibility.average) : '');
  }, [data?.student?.thesisEligibility?.average]);

  const handleSetAverage = async () => {
    const parsed = Number(averageInput);
    if (averageInput.trim() === '' || !Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
      alert(lang === 'he' ? 'יש להזין ממוצע תקין בין 0 ל-100' : 'Enter a valid average between 0 and 100');
      return;
    }
    setSavingAverage(true);
    try {
      await apiClient.setStudentThesisAverage(studentId, parsed);
      await loadDetail();
    } catch (err) {
      alert(err instanceof Error ? err.message : lang === 'he' ? 'העדכון נכשל' : 'Update failed');
    } finally {
      setSavingAverage(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- same sync-to-loaded-data pattern as averageInput above
    setSpecializationInput(data?.student?.specialization ?? '');
  }, [data?.student?.specialization]);

  const handleSetSpecialization = async () => {
    setSavingSpecialization(true);
    try {
      await apiClient.setStudentSpecialization(studentId, specializationInput || null);
      await loadDetail();
    } catch (err) {
      alert(err instanceof Error ? err.message : lang === 'he' ? 'העדכון נכשל' : 'Update failed');
    } finally {
      setSavingSpecialization(false);
    }
  };

  const handleRevokeReportLink = async () => {
    const ok = window.confirm(lang === 'he'
      ? 'לבטל את הקישור הנוכחי לדוח המסכם ולשלוח לסטודנט/ית קישור חדש?'
      : 'Revoke the current final report link and send the student a new one?');
    if (!ok) return;
    setRevokingReport(true);
    try {
      const res = await apiClient.revokeStudentFinalReportLinks(studentId);
      alert(lang === 'he'
        ? `הקישור בוטל. נשלחו ${res.reissued} קישורים חדשים.`
        : `Link revoked. ${res.reissued} new link(s) sent.`);
    } catch (err) {
      alert(err instanceof Error ? err.message : lang === 'he' ? 'הביטול נכשל' : 'Revoke failed');
    } finally {
      setRevokingReport(false);
    }
  };

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
      <div className="flex min-h-screen items-center justify-center bg-administrative-coordinator-surface">
        <p className="text-sm text-administrative-coordinator-on-surface-variant">…</p>
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
      <Link href="/administrative_coordinator/dashboard?tab=students" className="text-sm font-medium text-administrative-coordinator-primary hover:underline">
        {lang === 'he' ? '← חזרה לדוח הסטודנטים' : '← Back to Students Report'}
      </Link>

      {loadingData && <p className="mt-4 text-sm text-administrative-coordinator-on-surface-variant" role="status" aria-live="polite">{lang === 'he' ? 'טוען…' : 'Loading…'}</p>}
      {error && <p className="mt-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{error}</p>}

      {!loadingData && !error && student && (
        <div className="mt-4 grid gap-4">
          {/* Student profile */}
          <div className="rounded-administrative-coordinator border border-administrative-coordinator-outline-variant bg-administrative-coordinator-surface-container-lowest p-5">
            <p className="text-lg font-semibold text-administrative-coordinator-on-surface">👤 {student.name}</p>
            <div className="mt-2 grid gap-1 text-sm text-administrative-coordinator-on-surface-variant sm:grid-cols-2">
              <span>🏛️ {lang === 'he' ? 'פקולטה:' : 'Faculty:'} {student.facultyId ? facultyLabel(student.facultyId as FacultyId, lang) : '—'}</span>
              <span>🎓 {lang === 'he' ? 'תואר:' : 'Degree:'} {student.degreeType ? (student.degreeType === 'masters' ? (lang === 'he' ? 'תואר שני' : "Master's") : (lang === 'he' ? 'תואר ראשון' : "Bachelor's")) : '—'}</span>
              <span>📚 {lang === 'he' ? 'מגמה:' : 'Major:'} {majorCellText(student, lang)}</span>
              {/* Renamed from the old "שנת לימודים:" label — that phrasing
                  reads in Hebrew as "academic year" (e.g. תשפ״ו), so a
                  coordinator seeing this ordinal 1/2/3 program-year number
                  under it assumed the Hebrew year was broken. It's a
                  different field entirely (yearOfStudy, edited via the
                  Academic Year Manager) — disambiguated here, with the
                  actual current Hebrew year surfaced right next to it. */}
              <span>📆 {lang === 'he' ? 'שנה בתואר:' : 'Year in program:'} {student.yearOfStudy ?? '—'}</span>
              <span>🗓️ {lang === 'he' ? 'שנת הלימודים הנוכחית:' : 'Current academic year:'} {currentHebrewYear() ?? '—'}</span>
            </div>
          </div>

          {/* Thesis/project track — see server/src/config/studentTrack.ts */}
          <div className="rounded-administrative-coordinator border border-administrative-coordinator-outline-variant bg-administrative-coordinator-surface-container-lowest p-5">
            <p className="text-sm font-semibold text-administrative-coordinator-on-surface">🧭 {lang === 'he' ? 'מסלול (תזה/פרויקט)' : 'Track (Thesis/Project)'}</p>
            {student.trackPolicy === 'coordinator_gated' ? (
              <>
                <p className="mt-1 text-sm text-administrative-coordinator-on-surface-variant">
                  {lang === 'he' ? 'זכאות לתזה כרגע:' : 'Currently thesis-eligible:'}{' '}
                  <span className={student.thesisEligibility?.eligible ? 'text-success' : 'text-danger'}>
                    {student.thesisEligibility?.eligible ? (lang === 'he' ? 'כן' : 'Yes') : (lang === 'he' ? 'לא' : 'No')}
                  </span>
                  {student.thesisEligibility?.method === 'average' && student.thesisEligibility.average != null && (
                    <span className="text-administrative-coordinator-on-surface-variant">
                      {' '}
                      ({lang === 'he' ? 'ממוצע' : 'average'} {student.thesisEligibility.average} {student.thesisEligibility.eligible ? '≥' : '<'} {student.thesisEligibility.threshold ?? ''})
                    </span>
                  )}
                </p>

                {canSetAverage && (
                  <div className="mt-3 rounded-lg border border-administrative-coordinator-outline-variant bg-administrative-coordinator-surface-container-low p-3">
                    <p className="text-xs font-medium text-administrative-coordinator-on-surface">
                      {lang === 'he' ? '📊 ממוצע ציונים' : '📊 Grade average'}
                    </p>
                    <p className="mt-0.5 text-[11px] text-administrative-coordinator-on-surface-variant">
                      {lang === 'he'
                        ? 'מוזן ידנית כרגע — בעתיד יגיע אוטומטית מהמכלול. מעל הסף הסטודנט/ית זכאי/ת לבחור בין תזה לפרויקט; מתחתיו נשאר/ת קבוע/ה על פרויקט.'
                        : "Entered manually for now — will come automatically from Michlol in the future. At or above the threshold the student may choose thesis or project; below it, they stay fixed on project."}
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step="any"
                        value={averageInput}
                        onChange={(e) => setAverageInput(e.target.value)}
                        placeholder={lang === 'he' ? 'ממוצע (0-100)' : 'Average (0-100)'}
                        className="w-32 rounded-lg border border-administrative-coordinator-outline-variant bg-administrative-coordinator-surface-container-lowest px-3 py-1.5 text-sm text-administrative-coordinator-on-surface focus:border-administrative-coordinator-primary focus:outline-none"
                      />
                      <button
                        type="button"
                        disabled={savingAverage}
                        onClick={handleSetAverage}
                        className="rounded-lg bg-administrative-coordinator-primary px-3 py-1.5 text-sm font-semibold text-administrative-coordinator-on-primary hover:opacity-90 disabled:opacity-60"
                      >
                        {savingAverage ? '…' : lang === 'he' ? 'שמור' : 'Save'}
                      </button>
                    </div>
                  </div>
                )}

                <p className="mt-3 text-sm text-administrative-coordinator-on-surface-variant">
                  {lang === 'he' ? 'מסלול שנבחר:' : 'Chosen track:'}{' '}
                  {student.track
                    ? `${student.track === 'thesis' ? (lang === 'he' ? 'תזה' : 'Thesis') : (lang === 'he' ? 'פרויקט' : 'Project')}${student.trackLocked ? ' 🔒' : ''}`
                    : (lang === 'he' ? 'טרם נבחר' : 'Not chosen yet')}
                </p>
                {/* Manual eligible/not-eligible buttons are for roles without
                    grade-average entry (plain 'coordinator' — see
                    THESIS_AVERAGE_ROLES above). For canSetAverage roles,
                    saving the average already derives eligibility via
                    setThesisEligibilityFromAverage, so a manual override
                    here would be redundant and confusing. */}
                {!canSetAverage && (
                  <>
                    <input
                      value={eligibilityReason}
                      onChange={(e) => setEligibilityReason(e.target.value)}
                      placeholder={lang === 'he' ? 'סיבה (אופציונלי)' : 'Reason (optional)'}
                      className="mt-2 w-full rounded-lg border border-administrative-coordinator-outline-variant bg-administrative-coordinator-surface-container-low px-3 py-1.5 text-sm text-administrative-coordinator-on-surface focus:border-administrative-coordinator-primary focus:outline-none"
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
                )}
              </>
            ) : (
              <p className="mt-1 text-sm text-administrative-coordinator-on-surface-variant">
                {student.trackPolicy === 'signup_choice'
                  ? (lang === 'he'
                    ? `מסלול: ${student.track === 'thesis' ? 'תזה' : 'פרויקט'} (נבחר בהרשמה, נעול)`
                    : `Track: ${student.track === 'thesis' ? 'Thesis' : 'Project'} (chosen at signup, locked)`)
                  : (lang === 'he' ? 'מסלול: פרויקט בלבד (אין אפשרות תזה בתוכנית זו)' : 'Track: Project only (no thesis option in this program)')}
              </p>
            )}
          </div>

          {/* Specialization (תחום) — see lib/specialization.ts. Lets staff
              set it for students who registered before signup asked for it,
              or correct it. */}
          {student.specializationOptions.length > 0 && (
            <div className="rounded-administrative-coordinator border border-administrative-coordinator-outline-variant bg-administrative-coordinator-surface-container-lowest p-5">
              <p className="text-sm font-semibold text-administrative-coordinator-on-surface">🎯 {lang === 'he' ? 'תחום התמחות' : 'Specialization'}</p>
              {canSetSpecialization ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <select
                    value={specializationInput}
                    onChange={(e) => setSpecializationInput(e.target.value)}
                    aria-label={lang === 'he' ? 'תחום התמחות' : 'Specialization'}
                    className="rounded-lg border border-administrative-coordinator-outline-variant bg-administrative-coordinator-surface-container-low px-3 py-1.5 text-sm text-administrative-coordinator-on-surface focus:border-administrative-coordinator-primary focus:outline-none"
                  >
                    <option value="">{lang === 'he' ? 'לא הוגדר' : 'Not set'}</option>
                    {student.specializationOptions.map((key) => (
                      <option key={key} value={key}>{SPECIALIZATION_LABELS[key]?.[lang] ?? key}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={savingSpecialization || specializationInput === (student.specialization ?? '')}
                    onClick={handleSetSpecialization}
                    className="rounded-lg bg-administrative-coordinator-primary px-3 py-1.5 text-sm font-semibold text-administrative-coordinator-on-primary hover:opacity-90 disabled:opacity-60"
                  >
                    {savingSpecialization ? '…' : lang === 'he' ? 'שמור' : 'Save'}
                  </button>
                </div>
              ) : (
                <p className="mt-1 text-sm text-administrative-coordinator-on-surface-variant">
                  {student.specialization ? SPECIALIZATION_LABELS[student.specialization]?.[lang] ?? student.specialization : (lang === 'he' ? 'לא הוגדר' : 'Not set')}
                </p>
              )}
            </div>
          )}

          {/* Completed courses — what project prerequisites are checked
              against when the student browses/applies. */}
          <CompletedCoursesCard
            key={`${student.id}-${JSON.stringify(student.completedCourses)}`}
            studentId={student.id}
            initial={student.completedCourses}
            suggestions={student.prerequisiteSubjects}
            canEdit={canEditCourses}
            onSaved={loadDetail}
          />

          {/* Final report link — revoke (e.g. emailed to a wrong address)
              and send the student a fresh one. Only once a link exists. */}
          {data?.finalReport?.hasLink && data.finalReport.canRevoke && (
            <div className="rounded-administrative-coordinator border border-administrative-coordinator-outline-variant bg-administrative-coordinator-surface-container-lowest p-5">
              <p className="text-sm font-semibold text-administrative-coordinator-on-surface">🎓 {lang === 'he' ? 'קישור לדוח המסכם' : 'Final report link'}</p>
              <p className="mt-1 text-sm text-administrative-coordinator-on-surface-variant">
                {lang === 'he'
                  ? 'אם הקישור נשלח לכתובת שגויה או דלף, אפשר לבטל אותו. הקישור הישן יפסיק לעבוד מיד, והסטודנט/ית יקבל/תקבל קישור חדש במייל ובלוח הבקרה.'
                  : 'If the link was sent to a wrong address or leaked, revoke it. The old link stops working immediately and the student gets a new one by email and on their dashboard.'}
              </p>
              <button
                type="button"
                disabled={revokingReport}
                onClick={handleRevokeReportLink}
                className="mt-3 rounded-lg bg-danger px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
              >
                {revokingReport ? '…' : lang === 'he' ? 'בטל קישור ושלח חדש' : 'Revoke link and send a new one'}
              </button>
            </div>
          )}

          {/* Communication */}
          <div className="rounded-administrative-coordinator border border-administrative-coordinator-outline-variant bg-administrative-coordinator-surface-container-lowest p-5">
            <p className="text-sm font-semibold text-administrative-coordinator-on-surface">☎️ {lang === 'he' ? 'פרטי התקשרות' : 'Communication'}</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {student.email ? (
                <a href={`mailto:${student.email}`} dir="ltr" className="flex items-center gap-1.5 rounded-lg border border-administrative-coordinator-outline-variant bg-administrative-coordinator-surface-container-low px-3 py-2 text-sm text-administrative-coordinator-on-surface hover:border-administrative-coordinator-primary hover:text-administrative-coordinator-primary">
                  ✉️ {student.email}
                </a>
              ) : (
                <p className="text-sm italic text-administrative-coordinator-on-surface-variant">{lang === 'he' ? 'לא הוגדר אימייל' : 'No email on file'}</p>
              )}
              {student.phoneNumber ? (
                <a href={`tel:${student.phoneNumber}`} dir="ltr" className="flex items-center gap-1.5 rounded-lg border border-administrative-coordinator-outline-variant bg-administrative-coordinator-surface-container-low px-3 py-2 text-sm text-administrative-coordinator-on-surface hover:border-administrative-coordinator-primary hover:text-administrative-coordinator-primary">
                  📞 {student.phoneNumber}
                </a>
              ) : (
                <p className="text-sm italic text-administrative-coordinator-on-surface-variant">{lang === 'he' ? 'לא הוגדר טלפון' : 'No phone number on file'}</p>
              )}
            </div>
          </div>

          {/* Project */}
          <div className="rounded-administrative-coordinator border border-administrative-coordinator-outline-variant bg-administrative-coordinator-surface-container-lowest p-5">
            <p className="text-sm font-semibold text-administrative-coordinator-on-surface">📁 {lang === 'he' ? 'הפרויקט/התזה' : 'Project/Thesis'}</p>
            {project ? (
              <>
                <p className="mt-1 text-sm text-administrative-coordinator-on-surface">{lang === 'he' ? project.titleHe : project.titleEn}</p>
                <p className="mt-1 text-xs text-administrative-coordinator-on-surface-variant">👨‍🏫 {project.supervisorName || (lang === 'he' ? 'ללא מנחה' : 'No supervisor')}</p>
                <p className="mt-1 text-xs text-administrative-coordinator-on-surface-variant">
                  📆 {lang === 'he' ? 'שנת לימודים (תחילת הפרויקט):' : 'Study year (project start):'} {academicYearLabel(project.academicYear, lang)}
                </p>
              </>
            ) : (
              <p className="mt-1 text-sm text-administrative-coordinator-on-surface-variant">{lang === 'he' ? 'הסטודנט אינו רשום כרגע לפרויקט/תזה' : 'Student is not currently enrolled in a project/thesis'}</p>
            )}
          </div>

          {/* Current milestone */}
          {project && (
            <div className="rounded-administrative-coordinator border border-administrative-coordinator-outline-variant bg-administrative-coordinator-surface-container-lowest p-5">
              <p className="text-sm font-semibold text-administrative-coordinator-on-surface">📍 {lang === 'he' ? 'אבן דרך נוכחית' : 'Current Milestone'}</p>
              {currentMilestone ? (
                <>
                  <p className="mt-1 text-sm text-administrative-coordinator-on-surface">{lang === 'he' ? currentMilestone.nameHe : currentMilestone.nameEn}</p>
                  <p className="mt-1 text-xs text-administrative-coordinator-on-surface-variant">
                    {statusLabel(currentMilestone.status, lang)}
                    {' · '}
                    📅 {lang === 'he' ? 'תאריך יעד:' : 'Due:'} {formatDate(currentMilestone.dueDate, lang)}
                  </p>
                </>
              ) : (
                <p className="mt-1 text-sm text-administrative-coordinator-on-surface-variant">{lang === 'he' ? 'אין אבן דרך פעילה' : 'No active milestone'}</p>
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
              <p className="mb-2 text-sm font-semibold text-administrative-coordinator-on-surface">🗺️ {lang === 'he' ? 'מסלול אבני הדרך' : 'Milestone Roadmap'}</p>
              <MilestoneTimeline
                milestones={milestoneRoadmap as unknown as MilestoneData[]}
                viewerRole="coordinator_readonly"
                projectId={project.id}
                enableFilePreview
              />
            </div>
          )}

          {/* Submitted milestones + grades */}
          <div className="rounded-administrative-coordinator border border-administrative-coordinator-outline-variant bg-administrative-coordinator-surface-container-lowest p-5">
            <p className="text-sm font-semibold text-administrative-coordinator-on-surface">📤 {lang === 'he' ? 'אבני דרך שהוגשו' : 'Submitted Milestones'}</p>
            {submittedMilestones.length === 0 ? (
              <p className="mt-2 text-sm text-administrative-coordinator-on-surface-variant">{lang === 'he' ? 'הסטודנט טרם הגיש אבני דרך' : 'The student has not submitted any milestones yet'}</p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[560px] text-start text-sm">
                  <thead>
                    <tr className="border-b border-administrative-coordinator-outline-variant text-xs text-administrative-coordinator-on-surface-variant">
                      <th className="px-2 py-1.5 text-start font-medium">{lang === 'he' ? 'אבן דרך' : 'Milestone'}</th>
                      <th className="px-2 py-1.5 text-start font-medium">{lang === 'he' ? 'הוגש בתאריך' : 'Submitted'}</th>
                      <th className="px-2 py-1.5 text-start font-medium">{lang === 'he' ? 'סטטוס' : 'Status'}</th>
                      <th className="px-2 py-1.5 text-start font-medium">{lang === 'he' ? 'ציון' : 'Grade'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {submittedMilestones.map((m) => (
                      <tr key={m.id} className="border-b border-administrative-coordinator-outline-variant last:border-b-0">
                        <td className="px-2 py-1.5 text-administrative-coordinator-on-surface">{lang === 'he' ? m.nameHe : m.nameEn}</td>
                        <td className="px-2 py-1.5 text-administrative-coordinator-on-surface">{formatDate(m.submittedAt, lang)}</td>
                        <td className="px-2 py-1.5 text-administrative-coordinator-on-surface">{statusLabel(m.status, lang)}</td>
                        <td className="px-2 py-1.5 font-semibold text-administrative-coordinator-on-surface">
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
        <p className="mt-4 text-sm text-administrative-coordinator-on-surface-variant">{lang === 'he' ? 'הסטודנט לא נמצא' : 'Student not found'}</p>
      )}
    </DashboardShell>
  );
}

function CompletedCoursesCard({
  studentId, initial, suggestions, canEdit, onSaved,
}: {
  studentId: string;
  initial: { subject: string; grade?: number }[];
  suggestions: string[];
  canEdit: boolean;
  onSaved: () => Promise<void>;
}) {
  const { lang } = useLanguage();
  const [rows, setRows] = useState(initial);
  const [subject, setSubject] = useState('');
  const [grade, setGrade] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const dirty = JSON.stringify(rows) !== JSON.stringify(initial);

  const addRow = () => {
    const trimmed = subject.trim();
    if (!trimmed) {
      setError(lang === 'he' ? 'יש להזין שם קורס' : 'Enter a course name');
      return;
    }
    const g = Number(grade);
    if (grade.trim() === '' || !Number.isFinite(g) || g < 0 || g > 100) {
      setError(lang === 'he' ? 'ציון חייב להיות בין 0 ל-100' : 'Grade must be between 0 and 100');
      return;
    }
    // Re-adding an existing course name updates its grade in place.
    setRows((prev) => [...prev.filter((r) => r.subject !== trimmed), { subject: trimmed, grade: g }]);
    setSubject('');
    setGrade('');
    setError('');
  };

  const removeRow = (subj: string) => setRows((prev) => prev.filter((r) => r.subject !== subj));

  const handleSave = async () => {
    // Legacy entries (from before grades were tracked) have no grade — the
    // server requires one, so make the user re-add them rather than saving 0.
    const missing = rows.find((r) => r.grade == null);
    if (missing) {
      setError(lang === 'he' ? `לקורס "${missing.subject}" אין ציון — הסר/י והוסף/י אותו מחדש עם ציון` : `"${missing.subject}" has no grade — remove it and add it again with a grade`);
      return;
    }
    setSaving(true);
    setError('');
    try {
      await apiClient.setStudentCompletedCourses(studentId, rows.map((r) => ({ subject: r.subject, grade: r.grade! })));
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : lang === 'he' ? 'העדכון נכשל' : 'Update failed');
    } finally {
      setSaving(false);
    }
  };

  const inputClass = 'rounded-lg border border-administrative-coordinator-outline-variant bg-administrative-coordinator-surface-container-low px-3 py-1.5 text-sm text-administrative-coordinator-on-surface focus:border-administrative-coordinator-primary focus:outline-none';

  return (
    <div className="rounded-administrative-coordinator border border-administrative-coordinator-outline-variant bg-administrative-coordinator-surface-container-lowest p-5">
      <p className="text-sm font-semibold text-administrative-coordinator-on-surface">📚 {lang === 'he' ? 'קורסים שהושלמו' : 'Completed Courses'} ({rows.length})</p>
      <p className="mt-0.5 text-[11px] text-administrative-coordinator-on-surface-variant">
        {lang === 'he'
          ? 'דרישות הקדם של פרויקטים נבדקות מול רשימה זו. שם הקורס חייב להיות זהה בדיוק לשם בדרישת הקדם — בחר/י מההצעות כשאפשר.'
          : "Project prerequisites are checked against this list. The course name must match the prerequisite's name exactly — pick from the suggestions when possible."}
      </p>

      <div className="mt-3 grid gap-2">
        {rows.length === 0 && (
          <p className="text-xs text-administrative-coordinator-on-surface-variant">{lang === 'he' ? 'טרם נרשמו קורסים' : 'No courses on record yet'}</p>
        )}
        {rows.map((r) => (
          <div key={r.subject} className="flex items-center justify-between rounded-lg bg-administrative-coordinator-surface-container-low px-3 py-2 text-sm">
            <span className="text-administrative-coordinator-on-surface">{r.subject}</span>
            <div className="flex items-center gap-3">
              <span className="text-xs text-administrative-coordinator-on-surface-variant">{lang === 'he' ? 'ציון:' : 'Grade:'} {r.grade ?? '—'}</span>
              {canEdit && (
                <button type="button" onClick={() => removeRow(r.subject)} aria-label={`${lang === 'he' ? 'הסר' : 'Remove'} ${r.subject}`} className="text-danger hover:opacity-70">
                  ✕
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {canEdit && (
        <>
          <div className="mt-3 flex flex-wrap gap-2">
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addRow()}
              list={`prereq-subjects-${studentId}`}
              placeholder={lang === 'he' ? 'שם הקורס' : 'Course name'}
              aria-label={lang === 'he' ? 'שם הקורס' : 'Course name'}
              className={`min-w-0 flex-1 ${inputClass}`}
            />
            <datalist id={`prereq-subjects-${studentId}`}>
              {suggestions.map((s) => <option key={s} value={s} />)}
            </datalist>
            <input
              type="number"
              min={0}
              max={100}
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addRow()}
              placeholder={lang === 'he' ? 'ציון' : 'Grade'}
              aria-label={lang === 'he' ? 'ציון' : 'Grade'}
              className={`w-24 ${inputClass}`}
            />
            <button
              type="button"
              onClick={addRow}
              className="rounded-lg border border-administrative-coordinator-primary px-3 py-1.5 text-sm font-semibold text-administrative-coordinator-primary hover:bg-administrative-coordinator-primary/10"
            >
              {lang === 'he' ? '+ הוסף' : '+ Add'}
            </button>
          </div>
          {error && <p className="mt-2 rounded-md bg-danger-bg px-3 py-2 text-xs text-danger" role="alert">{error}</p>}
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              disabled={saving || !dirty}
              onClick={handleSave}
              className="rounded-lg bg-administrative-coordinator-primary px-3 py-1.5 text-sm font-semibold text-administrative-coordinator-on-primary hover:opacity-90 disabled:opacity-60"
            >
              {saving ? '…' : lang === 'he' ? 'שמור קורסים' : 'Save courses'}
            </button>
            {dirty && !saving && (
              <button type="button" onClick={() => { setRows(initial); setError(''); }} className="text-xs text-administrative-coordinator-on-surface-variant hover:underline">
                {lang === 'he' ? 'בטל שינויים' : 'Discard changes'}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
