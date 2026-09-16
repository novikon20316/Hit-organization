'use client';

// app/administrative_coordinator/standard-supervisors/page.tsx
// "Standard Supervisor" table for administrative_secretary + system_admin:
// per supervisor, whether they're qualified to open a bachelor final
// project / masters final project / masters thesis alone, without a
// co-supervisor. Backed by GET /api/admin/standard-supervisors (scoped to
// the caller's own coordinatorScopes for administrative_secretary, everyone
// for system_admin) and POST /api/admin/users/:id/standard-supervisor to
// toggle a flag (see adminController.ts).

import { useEffect, useState } from 'react';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { useRequireRole } from '@/hooks/useRequireRole';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import { facultyLabel, type FacultyId } from '@/lib/i18n';
import { majorsForFaculty } from '@/lib/permissions';
import type { AppRole } from '@/lib/roles';

const ALLOWED_ROLES: AppRole[] = ['administrative_secretary', 'system_admin'];

type Category = 'bachelor_project' | 'masters_project' | 'masters_thesis';
const CATEGORIES: Category[] = ['bachelor_project', 'masters_project', 'masters_thesis'];
const CATEGORY_LABELS: Record<Category, { he: string; en: string }> = {
  bachelor_project: { he: 'פרויקט גמר תואר ראשון', en: "Bachelor's final project" },
  masters_project: { he: 'פרויקט גמר תואר שני', en: "Master's final project" },
  masters_thesis: { he: 'תזה', en: 'Thesis' },
};

type Supervisor = Awaited<ReturnType<typeof apiClient.getStandardSupervisors>>['supervisors'][number];

function majorLabels(facultyId: string, majors: string[], lang: 'he' | 'en'): string {
  if (!majors.length) return lang === 'he' ? 'כל המגמות' : 'All majors';
  const all = majorsForFaculty(facultyId);
  return majors.map((slug) => all.find((m) => m.slug === slug)?.label[lang] ?? slug).join(', ');
}

export default function StandardSupervisorsPage() {
  const { isAllowed } = useRequireRole(ALLOWED_ROLES);
  const { lang } = useLanguage();
  const [supervisors, setSupervisors] = useState<Supervisor[] | null>(null);
  const [error, setError] = useState('');
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    if (!isAllowed) return;
    apiClient
      .getStandardSupervisors()
      .then((res) => setSupervisors(res.supervisors))
      .catch((err) => {
        console.error('Failed to load standard supervisors:', err);
        setError(lang === 'he' ? 'טעינת רשימת המנחים נכשלה' : 'Failed to load supervisors');
      });
  }, [isAllowed, lang]);

  const handleToggle = async (supervisor: Supervisor, category: Category) => {
    const key = `${supervisor.id}:${category}`;
    const nextValue = !supervisor.standardSupervisorEligibility[category];
    setSavingKey(key);
    setSupervisors((prev) =>
      prev?.map((s) => (s.id === supervisor.id ? { ...s, standardSupervisorEligibility: { ...s.standardSupervisorEligibility, [category]: nextValue } } : s)) ?? null,
    );
    try {
      await apiClient.setStandardSupervisorFlag(supervisor.id, category, nextValue);
    } catch (err) {
      console.error('Failed to update standard supervisor flag:', err);
      // Revert on failure.
      setSupervisors((prev) =>
        prev?.map((s) => (s.id === supervisor.id ? { ...s, standardSupervisorEligibility: { ...s.standardSupervisorEligibility, [category]: !nextValue } } : s)) ?? null,
      );
      setError(err instanceof Error ? err.message : lang === 'he' ? 'העדכון נכשל' : 'Update failed');
    } finally {
      setSavingKey(null);
    }
  };

  if (!isAllowed) return null;

  return (
    <DashboardShell title={lang === 'he' ? 'מנחה סטנדרטי' : 'Standard Supervisor'} showBackButton={false}>
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
        <p className="mb-4 text-sm text-administrative-coordinator-on-surface-variant">
          {lang === 'he'
            ? 'מנחה סטנדרטי כשיר לפתוח פרויקט גמר/תזה בעצמו, ללא צורך במנחה נוסף. סמן/י בהתאם לכל קטגוריה.'
            : "A standard supervisor is qualified to open a final project/thesis on their own, without needing a co-supervisor. Check the categories that apply."}
        </p>

        {error && <p className="mb-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{error}</p>}
        {!error && supervisors === null && <p className="text-sm text-administrative-coordinator-on-surface-variant" role="status" aria-live="polite">{lang === 'he' ? 'טוען…' : 'Loading…'}</p>}
        {!error && supervisors !== null && supervisors.length === 0 && (
          <p className="text-sm text-administrative-coordinator-on-surface-variant">
            {lang === 'he' ? 'אין מנחים להצגה.' : 'No supervisors to show.'}
          </p>
        )}

        {supervisors !== null && supervisors.length > 0 && (
          <div className="overflow-x-auto rounded-administrative-coordinator border border-administrative-coordinator-outline-variant">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-administrative-coordinator-outline-variant bg-administrative-coordinator-surface-container-lowest text-start text-xs text-administrative-coordinator-on-surface-variant">
                  <th className="px-3 py-2 text-start">{lang === 'he' ? 'מנחה' : 'Supervisor'}</th>
                  <th className="px-3 py-2 text-start">{lang === 'he' ? 'פקולטה / מגמות' : 'Faculty / Majors'}</th>
                  {CATEGORIES.map((cat) => (
                    <th key={cat} className="px-3 py-2 text-center">{lang === 'he' ? CATEGORY_LABELS[cat].he : CATEGORY_LABELS[cat].en}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {supervisors.map((s) => (
                  <tr key={s.id} className="border-b border-administrative-coordinator-outline-variant last:border-0">
                    <td className="px-3 py-2">
                      <p className="font-medium text-administrative-coordinator-on-surface">{s.displayName}</p>
                      <p className="text-xs text-administrative-coordinator-on-surface-variant" dir="ltr">{s.email}</p>
                    </td>
                    <td className="px-3 py-2 text-xs text-administrative-coordinator-on-surface-variant">
                      <span className="block">{facultyLabel(s.facultyId as FacultyId, lang)}</span>
                      <span className="block">{majorLabels(s.facultyId, s.assignedMajors, lang)}</span>
                    </td>
                    {CATEGORIES.map((cat) => (
                      <td key={cat} className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={!!s.standardSupervisorEligibility[cat]}
                          disabled={savingKey === `${s.id}:${cat}`}
                          onChange={() => handleToggle(s, cat)}
                          className="h-4 w-4 accent-administrative-coordinator-primary"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
