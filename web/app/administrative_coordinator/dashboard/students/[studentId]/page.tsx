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
import { useRequireRole } from '@/hooks/useRequireRole';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import { facultyLabel, type FacultyId } from '@/lib/i18n';
import type { AppRole } from '@/lib/roles';
import { majorCellText } from '../../StudentsReportTab';

const ADMIN_COORDINATOR_ROLES: AppRole[] = ['administrative_secretary', 'system_admin'];

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

  useEffect(() => {
    if (!studentId) return;
    let cancelled = false;

    (async () => {
      setLoadingData(true);
      setError('');
      try {
        const res = await apiClient.getStudentDetail(studentId);
        if (cancelled) return;
        setData(res);
      } catch (err) {
        if (cancelled) return;
        console.error('Failed to load student detail:', err);
        setError(err instanceof Error ? err.message : lang === 'he' ? 'טעינת נתוני הסטודנט נכשלה' : 'Failed to load student data');
      } finally {
        if (!cancelled) setLoadingData(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [studentId, lang]);

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
                <p className="mt-1 text-xs text-muted">📆 {lang === 'he' ? 'שנת לימודים (תחילת הפרויקט):' : 'Study year (project start):'} {project.academicYear || '—'}</p>
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
