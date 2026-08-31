'use client';

// components/BulkDueDateModal.tsx
// Ported from mobile/components/modals/BulkDueDateModal.tsx — shifts one
// due date across many projects' milestones at once (holidays, war, force
// majeure, etc.) rather than editing one milestone at a time. Calls
// PUT /api/milestones/bulk-due-date.

import { useMemo, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';

const MILESTONE_TYPE_OPTIONS: Array<{ value: string; he: string; en: string }> = [
  { value: '', he: 'כל אבני הדרך', en: 'All milestone types' },
  { value: 'research_proposal', he: 'הצעת מחקר', en: 'Research Proposal' },
  { value: 'progress_report', he: 'דו"ח התקדמות', en: 'Progress Report' },
  { value: 'final_report', he: 'דו"ח מסכם', en: 'Final Report' },
  { value: 'defense', he: 'הגנה', en: 'Defense' },
];

export interface BulkDueDateProjectOption {
  id: string;
  label: string;
  /** e.g. the enrolled student name(s) — shown under the label and matched
   *  against the search box, so a specific student can be found among many
   *  projects instead of scrolling the whole list. */
  sublabel?: string;
}

interface BulkDueDateModalProps {
  projects: BulkDueDateProjectOption[];
  onClose: () => void;
  onSaved?: () => void;
}

export function BulkDueDateModal({ projects, onClose, onSaved }: BulkDueDateModalProps) {
  const { lang } = useLanguage();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [milestoneType, setMilestoneType] = useState('');
  const [dueDateText, setDueDateText] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');

  const filteredProjects = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) => p.label.toLowerCase().includes(q) || p.sublabel?.toLowerCase().includes(q));
  }, [projects, search]);

  const toggleProject = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleSubmit = async () => {
    setError('');
    if (selectedIds.length === 0) {
      setError(lang === 'he' ? 'יש לבחור לפחות פרויקט אחד' : 'Select at least one project');
      return;
    }
    const parsed = new Date(dueDateText.trim());
    if (!dueDateText.trim() || isNaN(parsed.getTime())) {
      setError(lang === 'he' ? 'יש להזין תאריך יעד תקין' : 'Enter a valid due date');
      return;
    }
    if (!reason.trim()) {
      setError(lang === 'he' ? 'יש לציין סיבה לשינוי' : 'A reason for the change is required');
      return;
    }
    setSaving(true);
    try {
      const res = await apiClient.bulkUpdateMilestoneDueDates({
        projectIds: selectedIds,
        milestoneType: milestoneType || undefined,
        dueDate: parsed.toISOString(),
        reason: reason.trim(),
      });
      if (res.pendingApproval) {
        // coordinator/administrative coordinator — needs program_head/faculty_admin
        // sign-off before it actually takes effect (P1 #12).
        setResult(lang === 'he'
          ? '⏳ הבקשה נשלחה לאישור ראש התוכנית/הפקולטה ותיושם רק לאחר אישור.'
          : '⏳ This request was sent for program-head/faculty-admin approval and will only take effect once approved.');
      } else {
        setResult(lang === 'he' ? `✅ ${res.updatedCount ?? ''} אבני דרך עודכנו בהצלחה` : `✅ ${res.updatedCount ?? ''} milestone(s) updated successfully`);
      }
      onSaved?.();
      setTimeout(onClose, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : lang === 'he' ? 'העדכון נכשל' : 'Update failed');
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-primary focus:bg-surface focus:outline-none';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[var(--radius)] bg-surface p-6 shadow-lg">
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-semibold text-ink">📅 {lang === 'he' ? 'עדכון תאריכי יעד מרוכז' : 'Bulk Due-Date Update'}</h2>
          <button type="button" onClick={onClose} className="text-muted hover:text-ink">
            ✕
          </button>
        </div>
        <p className="mt-1 text-xs text-muted">
          {lang === 'he'
            ? 'לשימוש בעיכובים כלליים (חגים, מלחמה, כוח עליון וכו׳) — ניתן לעדכן אבני דרך שאינן במצב "ממתין" בלבד.'
            : 'For general delays (holidays, war, force majeure, etc.) — can update milestones regardless of their current status.'}
        </p>

        <p className="mb-1.5 mt-4 text-sm font-medium text-ink">
          {lang === 'he' ? 'בחר פרויקטים' : 'Select projects'}
          {selectedIds.length > 0 && <span className="ms-1 text-xs font-normal text-muted">({selectedIds.length} {lang === 'he' ? 'נבחרו' : 'selected'})</span>}
        </p>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={lang === 'he' ? 'חיפוש לפי שם סטודנט/פרויקט...' : 'Search by student or project name...'}
          className={inputCls}
        />
        <div className="mt-1.5 grid max-h-48 gap-1.5 overflow-y-auto">
          {filteredProjects.length === 0 ? (
            <p className="text-sm text-muted">{projects.length === 0 ? (lang === 'he' ? 'אין פרויקטים להצגה' : 'No projects available') : (lang === 'he' ? 'לא נמצאו תוצאות' : 'No matches found')}</p>
          ) : (
            filteredProjects.map((p) => {
              const active = selectedIds.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => toggleProject(p.id)}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-start text-sm ${
                    active ? 'border-primary bg-primary text-primary-ink' : 'border-line bg-paper text-ink'
                  }`}
                >
                  <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] ${active ? 'border-white' : 'border-muted'}`}>
                    {active && '✓'}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {p.label}
                    {p.sublabel && <span className={`ms-1.5 truncate text-xs ${active ? 'text-primary-ink/80' : 'text-muted'}`}>— {p.sublabel}</span>}
                  </span>
                </button>
              );
            })
          )}
        </div>
        {filteredProjects.length > 0 && (
          <button
            type="button"
            onClick={() => setSelectedIds((prev) => Array.from(new Set([...prev, ...filteredProjects.map((p) => p.id)])))}
            className="mt-1.5 text-xs text-primary hover:underline"
          >
            {search.trim() ? (lang === 'he' ? 'בחר את כל התוצאות' : 'Select all matches') : (lang === 'he' ? 'בחר את כל הפרויקטים' : 'Select all projects')}
          </button>
        )}

        <p className="mb-1.5 mt-4 text-sm font-medium text-ink">{lang === 'he' ? 'סוג אבן דרך' : 'Milestone type'}</p>
        <div className="flex flex-wrap gap-1.5">
          {MILESTONE_TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setMilestoneType(opt.value)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                milestoneType === opt.value ? 'border-primary bg-primary text-primary-ink' : 'border-line bg-paper text-ink'
              }`}
            >
              {opt[lang]}
            </button>
          ))}
        </div>

        <label className="mt-4 block">
          <span className="mb-1.5 block text-sm font-medium text-ink">{lang === 'he' ? 'תאריך יעד חדש' : 'New due date'}</span>
          <input type="date" value={dueDateText} onChange={(e) => setDueDateText(e.target.value)} className={inputCls} />
        </label>

        <label className="mt-4 block">
          <span className="mb-1.5 block text-sm font-medium text-ink">{lang === 'he' ? 'סיבה (נדרש)' : 'Reason (required)'}</span>
          <textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={lang === 'he' ? 'לדוגמה: עיכוב עקב מצב מלחמה' : 'e.g. Delay due to wartime disruption'}
            className={inputCls}
          />
        </label>

        {error && <p className="mt-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{error}</p>}
        {result && <p className="mt-4 rounded-md bg-success-bg px-3 py-2 text-sm text-success" role="status">{result}</p>}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={saving}
          className="mt-4 w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60"
        >
          {saving ? '…' : lang === 'he' ? 'עדכן תאריכים' : 'Update Due Dates'}
        </button>
      </div>
    </div>
  );
}
