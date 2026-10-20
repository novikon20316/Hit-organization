'use client';

// app/admin/stuck-limits/page.tsx
// system_admin sets, for each milestone of every faculty's approved project/
// thesis workflow, the max days it may sit on ONE link of its chain before
// the administrative coordinator, program head and grad school head in scope
// are alerted (see server's services/stuckMilestones.ts). Stored apart from
// the workflow template itself, so changing a number needs no new template
// version/approval. An empty box means that milestone is never flagged.

import { useEffect, useMemo, useState } from 'react';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { useRequireRole } from '@/hooks/useRequireRole';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient, type StuckLimitsTemplate } from '@/lib/apiClient';
import { facultyLabel, type FacultyId } from '@/lib/i18n';
import { HIT_FACULTIES } from '@/lib/faculties';
import type { AppRole } from '@/lib/roles';

const ADMIN_ROLES: AppRole[] = ['system_admin'];

const PROCESS_LABEL: Record<StuckLimitsTemplate['processType'], { he: string; en: string }> = {
  msc_thesis: { he: 'תזה (תואר שני)', en: 'Thesis (M.Sc)' },
  msc_project: { he: 'פרויקט (תואר שני)', en: 'Project (M.Sc)' },
  bsc_project: { he: 'פרויקט (תואר ראשון)', en: 'Project (B.Sc)' },
};

function majorLabel(t: StuckLimitsTemplate, lang: 'he' | 'en'): string | null {
  if (!t.major) return null;
  const level = t.processType === 'bsc_project' ? 'bachelors' : 'masters';
  const programs = HIT_FACULTIES.find((f) => f.key === t.facultyId)?.programs ?? [];
  const program = programs.find((p) => p.slug === t.major && p.level === level) ?? programs.find((p) => p.slug === t.major);
  return program ? program.label[lang] : t.major;
}

export default function StuckLimitsPage() {
  const { loading: guardLoading, isAllowed } = useRequireRole(ADMIN_ROLES);
  const { lang } = useLanguage();
  const [templates, setTemplates] = useState<StuckLimitsTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isAllowed) return;
    let cancelled = false;
    apiClient
      .getStuckLimits()
      .then((res) => { if (!cancelled) setTemplates(res.templates); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : lang === 'he' ? 'הטעינה נכשלה' : 'Failed to load'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [isAllowed, lang]);

  const byFaculty = useMemo(() => {
    const groups = new Map<string, StuckLimitsTemplate[]>();
    templates.forEach((t) => groups.set(t.facultyId, [...(groups.get(t.facultyId) ?? []), t]));
    return [...groups.entries()];
  }, [templates]);

  if (guardLoading || !isAllowed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper">
        <p className="text-sm text-muted">…</p>
      </div>
    );
  }

  return (
    <DashboardShell
      title={lang === 'he' ? 'מגבלות זמן לאבני דרך' : 'Milestone Time Limits'}
      subtitle={lang === 'he'
        ? 'כמה ימים אבן דרך יכולה להמתין בשלב אחד בשרשרת לפני שהרכזת המנהלית, ראש התוכנית וראש בית הספר לתארים מתקדמים מקבלים התראה'
        : 'How many days a milestone may wait on one step of its chain before the administrative coordinator, program head and head of graduate school are alerted'}
    >
      <p className="mb-4 rounded-md bg-surface px-3 py-2 text-xs text-muted">
        {lang === 'he'
          ? 'הספירה מתחילה מחדש בכל פעם שאבן הדרך עוברת לשלב הבא. אצל הסטודנט/ית הספירה מתחילה מתאריך היעד. שדה ריק = ללא התראה לאבן הדרך הזו.'
          : 'The count restarts every time the milestone moves to the next step. For the student, it counts from the due date. Empty = no alerts for that milestone.'}
      </p>
      {error && <p className="mb-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{error}</p>}
      {loading ? (
        <p className="text-sm text-muted">…</p>
      ) : templates.length === 0 ? (
        <p className="text-sm text-muted">{lang === 'he' ? 'אין תבניות תהליך מאושרות' : 'No approved process templates'}</p>
      ) : (
        <div className="grid gap-6">
          {byFaculty.map(([facultyId, list]) => (
            <section key={facultyId}>
              <h2 className="mb-2 text-base font-semibold text-ink">🏛️ {facultyLabel(facultyId as FacultyId, lang)}</h2>
              <div className="grid gap-3 lg:grid-cols-2">
                {list.map((t) => <TemplateLimitsCard key={t.templateId} template={t} />)}
              </div>
            </section>
          ))}
        </div>
      )}
    </DashboardShell>
  );
}

function TemplateLimitsCard({ template }: { template: StuckLimitsTemplate }) {
  const { lang } = useLanguage();
  const initial = useMemo(
    () => Object.fromEntries(template.milestones.map((m) => [m.type, template.limits[m.type] ? String(template.limits[m.type]) : ''])),
    [template],
  );
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [saved, setSaved] = useState<Record<string, string>>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const dirty = JSON.stringify(values) !== JSON.stringify(saved);
  const major = majorLabel(template, lang);

  const handleSave = async () => {
    const limits: Record<string, number | null> = {};
    for (const [type, raw] of Object.entries(values)) {
      if (raw.trim() === '') { limits[type] = null; continue; }
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 1 || n > 365) {
        setError(lang === 'he' ? 'כל מגבלה חייבת להיות מספר ימים שלם בין 1 ל-365' : 'Each limit must be a whole number of days between 1 and 365');
        return;
      }
      limits[type] = n;
    }
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await apiClient.setStuckLimits({ facultyId: template.facultyId, processType: template.processType, major: template.major, limits });
      setSaved(values);
      setNotice(lang === 'he' ? 'נשמר' : 'Saved');
    } catch (err) {
      setError(err instanceof Error ? err.message : lang === 'he' ? 'השמירה נכשלה' : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-[var(--radius)] border border-line bg-surface p-4">
      <p className="text-sm font-semibold text-ink">
        {PROCESS_LABEL[template.processType][lang]}
        {major ? <span className="font-normal text-muted"> · {major}</span> : null}
      </p>
      <div className="mt-3 grid gap-2">
        {template.milestones.map((m) => (
          <label key={m.type} className="flex items-center justify-between gap-3 text-sm">
            <span className="text-ink">{lang === 'he' ? m.nameHe : m.nameEn}</span>
            <span className="flex items-center gap-1.5">
              <input
                type="number"
                min={1}
                max={365}
                step={1}
                inputMode="numeric"
                value={values[m.type] ?? ''}
                onChange={(e) => setValues((prev) => ({ ...prev, [m.type]: e.target.value }))}
                placeholder="—"
                aria-label={lang === 'he' ? `מגבלת ימים עבור ${m.nameHe}` : `Day limit for ${m.nameEn}`}
                className="w-20 rounded-lg border border-line bg-paper px-2 py-1 text-sm text-ink focus:border-primary focus:outline-none"
              />
              <span className="text-xs text-muted">{lang === 'he' ? 'ימים' : 'days'}</span>
            </span>
          </label>
        ))}
      </div>
      {error && <p className="mt-2 rounded-md bg-danger-bg px-3 py-2 text-xs text-danger" role="alert">{error}</p>}
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          disabled={saving || !dirty}
          onClick={handleSave}
          className="rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-50"
        >
          {saving ? '…' : lang === 'he' ? 'שמירה' : 'Save'}
        </button>
        {notice && !dirty && <span className="text-xs text-success">✓ {notice}</span>}
      </div>
    </div>
  );
}
