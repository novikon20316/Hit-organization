'use client';

// components/ExaminerEscalationPanel.tsx
// P1 backlog item #6 — coordinator action panel for external examiners who
// declined or went overdue. The scheduled sweep (notificationScheduler.ts)
// already auto-promotes a replacement when possible; this lets a coordinator
// re-trigger a reminder or force a (re-)promotion manually. Self-contained,
// like ExceptionalActionQueue — fetches its own list.

import { useEffect, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient, type ExaminerEscalation } from '@/lib/apiClient';

export function ExaminerEscalationPanel() {
  const { lang } = useLanguage();
  const [escalations, setEscalations] = useState<ExaminerEscalation[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    apiClient.getExaminerEscalations()
      .then((res) => setEscalations(res.escalations))
      .catch((err) => console.error('Failed to load examiner escalations:', err))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const remind = async (tokenId: string) => {
    setBusyId(tokenId);
    setError('');
    setMessage('');
    try {
      await apiClient.remindExaminer(tokenId);
      setMessage(lang === 'he' ? 'תזכורת נשלחה.' : 'Reminder sent.');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : lang === 'he' ? 'שליחת התזכורת נכשלה' : 'Failed to send the reminder');
    } finally {
      setBusyId(null);
    }
  };

  const promote = async (tokenId: string) => {
    setBusyId(tokenId);
    setError('');
    setMessage('');
    try {
      const res = await apiClient.promoteNextExaminer(tokenId);
      setMessage(res.message);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : lang === 'he' ? 'מינוי הבוחן הבא נכשל' : 'Failed to promote the next examiner');
    } finally {
      setBusyId(null);
    }
  };

  if (loading || escalations.length === 0) return null;

  return (
    <div className="mb-4">
      <p className="mb-2 text-sm font-semibold text-ink">
        ⚠️ {lang === 'he' ? 'בוחנים חיצוניים הדורשים טיפול' : 'External examiners needing attention'}
      </p>
      {message && <p className="mb-2 rounded-md bg-success-bg px-2.5 py-1.5 text-xs text-success" role="status">{message}</p>}
      {error && <p className="mb-2 rounded-md bg-danger-bg px-2.5 py-1.5 text-xs text-danger" role="alert">{error}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        {escalations.map((e) => (
          <div key={e.tokenId} className="role-rail rounded-[var(--radius)] border border-line bg-surface p-4" style={{ '--rail-color': 'var(--danger)' } as React.CSSProperties}>
            <p className="text-sm font-semibold text-ink">{e.examinerName}</p>
            <p className="mt-0.5 text-xs text-muted">{e.thesisTitle} · {e.studentName}</p>
            <p className="mt-1 text-xs font-medium text-danger">
              {e.status === 'declined'
                ? (lang === 'he' ? 'סירב לשפוט' : 'Declined the review')
                : (lang === 'he' ? 'לא הגיב בזמן' : 'Did not respond in time')}
            </p>
            <div className="mt-2 flex gap-2">
              {e.status !== 'declined' && (
                <button
                  type="button"
                  onClick={() => remind(e.tokenId)}
                  disabled={busyId === e.tokenId}
                  className="flex-1 rounded-md border border-line px-2.5 py-1.5 text-xs font-medium text-ink disabled:opacity-50"
                >
                  ✉️ {lang === 'he' ? 'שלח תזכורת' : 'Send reminder'}
                </button>
              )}
              <button
                type="button"
                onClick={() => promote(e.tokenId)}
                disabled={busyId === e.tokenId}
                className="flex-1 rounded-md bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-ink disabled:opacity-50"
              >
                🔄 {lang === 'he' ? 'מנה בוחן חלופי' : 'Promote next examiner'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
