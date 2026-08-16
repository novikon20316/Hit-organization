'use client';

// components/TrackChangeControl.tsx
// Coordinator/program-head action to switch a project between the thesis
// and non-thesis project tracks (P1 backlog item #10). The server closes the
// current project with a terminal status (preserving its full milestone/
// grade/audit history) and creates a fresh project + milestone set on the
// new track — see services/trackChange.ts.

import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient, ApiError } from '@/lib/apiClient';

export function TrackChangeControl({ projectId, onChanged }: { projectId: string; onChanged?: (newProjectId: string) => void }) {
  const { lang } = useLanguage();
  const [showModal, setShowModal] = useState(false);
  const [newTrack, setNewTrack] = useState<'thesis' | 'project'>('project');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<string | null>(null);

  const handleConfirm = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await apiClient.changeProjectTrack(projectId, newTrack, reason.trim() || undefined);
      setDone(res.newProjectId);
      onChanged?.(res.newProjectId);
    } catch (err) {
      // Prefer the server's per-language variant (see trackChange.ts's
      // TrackChangeError) when it sent one — same pattern as
      // SubmitMilestoneModal.tsx's milestone-submission error handling.
      const body = err instanceof ApiError ? (err.body as { messageHe?: string; messageEn?: string } | null) : null;
      const localized = body?.[lang === 'he' ? 'messageHe' : 'messageEn'];
      const text = localized ?? (err instanceof ApiError ? err.message : lang === 'he' ? 'שינוי המסלול נכשל' : 'Failed to change track');
      setError(text);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setShowModal(true)}
        className="text-xs font-medium text-muted underline hover:text-ink"
      >
        🔀 {lang === 'he' ? 'שנה מסלול (תזה/פרויקט)' : 'Change track (thesis/project)'}
      </button>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !saving && setShowModal(false)}>
          <div className="w-full max-w-sm rounded-[var(--radius)] border border-line bg-surface p-5" onClick={(e) => e.stopPropagation()}>
            {done ? (
              <>
                <p className="text-sm font-semibold text-ink">
                  ✅ {lang === 'he' ? 'המסלול הוחלף' : 'Track changed'}
                </p>
                <p className="mt-2 text-xs text-muted">
                  {lang === 'he'
                    ? 'הרשומה הישנה נסגרה (ההיסטוריה נשמרה) ונפתחה רשומה חדשה במסלול שנבחר.'
                    : 'The old record was closed (its history is preserved) and a new one was opened on the selected track.'}
                </p>
                <button
                  type="button"
                  onClick={() => { setShowModal(false); setDone(null); }}
                  className="mt-4 w-full rounded-md border border-line px-3 py-1.5 text-sm text-ink"
                >
                  {lang === 'he' ? 'סגור' : 'Close'}
                </button>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold text-ink">
                  {lang === 'he' ? 'שינוי מסלול' : 'Change track'}
                </p>
                <p className="mt-2 text-xs text-muted">
                  {lang === 'he'
                    ? 'פעולה זו תסגור את רשומת הפרויקט הנוכחית (כל ההיסטוריה שלה תישמר לצפייה) ותפתח רשומה חדשה במסלול שתבחר, עם אבני דרך חדשות בהתאם.'
                    : 'This will close the current project record (its full history stays visible) and open a fresh record on the track you pick, with new milestones for that track.'}
                </p>

                <label className="mt-3 block text-xs font-medium text-muted">
                  {lang === 'he' ? 'מסלול חדש' : 'New track'}
                </label>
                <div className="mt-1 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setNewTrack('thesis')}
                    className={`flex-1 rounded-md border px-3 py-1.5 text-sm font-medium ${newTrack === 'thesis' ? 'border-primary bg-primary text-primary-ink' : 'border-line bg-paper text-ink'}`}
                  >
                    {lang === 'he' ? 'תזה' : 'Thesis'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewTrack('project')}
                    className={`flex-1 rounded-md border px-3 py-1.5 text-sm font-medium ${newTrack === 'project' ? 'border-primary bg-primary text-primary-ink' : 'border-line bg-paper text-ink'}`}
                  >
                    {lang === 'he' ? 'פרויקט' : 'Project'}
                  </button>
                </div>

                <label className="mt-3 block text-xs font-medium text-muted">
                  {lang === 'he' ? 'סיבה (אופציונלי)' : 'Reason (optional)'}
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={2}
                  className="mt-1 w-full rounded-md border border-line bg-paper px-2.5 py-1.5 text-sm text-ink"
                />

                {error && <p className="mt-2 text-xs text-danger">{error}</p>}

                <div className="mt-4 flex justify-end gap-2">
                  <button type="button" onClick={() => setShowModal(false)} disabled={saving} className="rounded-md border border-line px-3 py-1.5 text-sm text-ink disabled:opacity-50">
                    {lang === 'he' ? 'ביטול' : 'Cancel'}
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirm}
                    disabled={saving}
                    className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-ink disabled:opacity-50"
                  >
                    {saving ? (lang === 'he' ? 'מבצע…' : 'Changing…') : lang === 'he' ? 'אשר שינוי' : 'Confirm change'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
