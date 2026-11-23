'use client';

// app/supervisor/dashboard/ImportedGradeEntry.tsx
// A milestone the student finished BEFORE being brought into the system
// (importedAsDone — the approved-students roster's InProgress columns, see
// server/src/services/importedStudentPlacement.ts) is already closed, so it
// never goes through the normal grade/approve flow. The only thing left is
// its grade: this shows "grade missing" with an inline field, or the grade
// with an edit link to fix a typo. Saves via
// POST /api/milestones/:id/imported-grade.
import { useState } from 'react';
import { apiClient } from '@/lib/apiClient';

interface ImportedGradeEntryProps {
  milestoneId: string;
  finalGrade: number | null;
  lang: 'he' | 'en';
  onSaved: () => void;
}

export function ImportedGradeEntry({ milestoneId, finalGrade, lang, onSaved }: ImportedGradeEntryProps) {
  const he = lang === 'he';
  const [editing, setEditing] = useState(finalGrade == null);
  const [value, setValue] = useState(finalGrade != null ? String(finalGrade) : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    const n = Number(value);
    if (value.trim() === '' || !Number.isFinite(n) || n < 0 || n > 100) {
      setError(he ? 'יש להזין ציון בין 0 ל-100' : 'Enter a grade from 0 to 100');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await apiClient.setImportedMilestoneGrade(milestoneId, n);
      setEditing(false);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : he ? 'שמירת הציון נכשלה' : 'Failed to save the grade');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-1 text-xs">
      <p className="text-supervisor-on-surface-variant">
        📥 {he ? 'הושלם לפני המעבר למערכת' : 'Completed before joining the system'}
      </p>
      {!editing && finalGrade != null ? (
        <div className="mt-0.5 flex items-center gap-2">
          <span className="font-semibold text-success">🎓 {he ? `ציון: ${finalGrade}` : `Grade: ${finalGrade}`}</span>
          <button type="button" onClick={() => setEditing(true)} className="font-medium text-[#00236f] hover:underline">
            ✏️ {he ? 'תיקון ציון' : 'Correct grade'}
          </button>
        </div>
      ) : (
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {finalGrade == null && (
            <span className="font-semibold text-danger">{he ? 'חסר ציון' : 'Grade missing'}</span>
          )}
          <label className="sr-only" htmlFor={`imported-grade-${milestoneId}`}>{he ? 'ציון' : 'Grade'}</label>
          <input
            id={`imported-grade-${milestoneId}`}
            type="number"
            min={0}
            max={100}
            inputMode="numeric"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={he ? 'ציון 0–100' : 'Grade 0–100'}
            className="w-24 rounded-md border border-supervisor-outline-variant bg-white px-2 py-1 text-xs text-supervisor-on-surface"
          />
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded-full bg-supervisor-primary px-3 py-1 font-semibold text-supervisor-on-primary disabled:opacity-60"
          >
            {saving ? '…' : he ? 'שמירת ציון' : 'Save grade'}
          </button>
          {finalGrade != null && (
            <button type="button" onClick={() => { setEditing(false); setValue(String(finalGrade)); setError(''); }} className="text-supervisor-on-surface-variant hover:underline">
              {he ? 'ביטול' : 'Cancel'}
            </button>
          )}
        </div>
      )}
      {error && <p className="mt-1 text-danger" role="alert">{error}</p>}
    </div>
  );
}
