'use client';

// components/RevisionDecisionPanel.tsx
// P1 backlog item #13 — surfaces external-examiner opinions on a pre-defense
// milestone and lets the advisor/coordinator pick what happens next. Nothing
// consumed these opinions before this (see services/revisionDecisions.ts's
// header comment) — this is the first real UI for it. Self-contained, like
// GradeHistoryPanel/ClockPauseControl: renders nothing if there are no
// opinions yet to review.

import { useEffect, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient, type ExaminerOpinion, type RevisionDecisionEntry, type RevisionDecisionType } from '@/lib/apiClient';

const DECISION_LABEL: Record<RevisionDecisionType, { he: string; en: string }> = {
  proceed_to_defense: { he: 'המשך להגנה', en: 'Proceed to defense' },
  require_corrections: { he: 'נדרשים תיקונים', en: 'Require corrections' },
  re_judge: { he: 'שיפוט חוזר', en: 'Re-judge' },
  add_examiner: { he: 'הוספת בוחן', en: 'Add an examiner' },
};

const RECOMMENDATION_LABEL: Record<string, { he: string; en: string }> = {
  approve: { he: 'מאשר ללא תיקונים', en: 'Approve without revisions' },
  approve_with_corrections: { he: 'מאשר עם תיקונים קלים', en: 'Approve with minor corrections' },
  major_revisions: { he: 'נדרשים תיקונים מהותיים', en: 'Major revisions required' },
  reject: { he: 'דחייה', en: 'Reject' },
};

export function RevisionDecisionPanel({ milestoneId, canDecide }: { milestoneId: string; canDecide: boolean }) {
  const { lang } = useLanguage();
  const [opinions, setOpinions] = useState<ExaminerOpinion[]>([]);
  const [history, setHistory] = useState<RevisionDecisionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState('');
  const [submittingDecision, setSubmittingDecision] = useState<RevisionDecisionType | null>(null);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    apiClient.getExaminerOpinions(milestoneId)
      .then((res) => { setOpinions(res.opinions); setHistory(res.revisionDecisions); })
      .catch((err) => console.error('Failed to load examiner opinions:', err))
      .finally(() => setLoading(false));
  };

  useEffect(() => { if (milestoneId) load(); }, [milestoneId]);

  const decide = async (decision: RevisionDecisionType) => {
    if (decision === 'require_corrections' && !note.trim()) {
      setError(lang === 'he' ? 'יש להוסיף הערה המסבירה אילו תיקונים נדרשים' : 'Please add a note explaining what needs correcting');
      return;
    }
    setSubmittingDecision(decision);
    setError('');
    try {
      await apiClient.submitRevisionDecision(milestoneId, decision, note.trim() || undefined);
      setNote('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : lang === 'he' ? 'רישום ההחלטה נכשל' : 'Failed to record the decision');
    } finally {
      setSubmittingDecision(null);
    }
  };

  if (loading || opinions.length === 0) return null;

  return (
    <div className="mt-3 rounded-[var(--radius)] border border-line bg-paper p-3">
      <p className="text-sm font-semibold text-ink">
        🧑‍⚖️ {lang === 'he' ? 'חוות דעת בוחנים' : 'Examiner opinions'}
      </p>
      <div className="mt-2 grid gap-2">
        {opinions.map((o) => (
          <div key={o.tokenId} className="rounded-md bg-surface px-3 py-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-ink">{o.examinerName}</span>
              <span className="text-xs text-muted">{o.status}</span>
            </div>
            {o.opinion?.recommendation && (
              <p className="mt-1 text-xs text-ink">
                {RECOMMENDATION_LABEL[o.opinion.recommendation]?.[lang] ?? o.opinion.recommendation}
                {o.opinion.total != null ? ` · ${o.opinion.total}` : ''}
              </p>
            )}
            {o.opinion?.comments && <p className="mt-1 text-xs text-muted">{o.opinion.comments}</p>}
          </div>
        ))}
      </div>

      {history.length > 0 && (
        <div className="mt-2 grid gap-1">
          {history.map((h, i) => (
            <p key={i} className="text-xs text-muted">
              {new Date(h.decidedAt).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-GB')} — {DECISION_LABEL[h.decision][lang]}
              {h.note ? ` (${h.note})` : ''}
            </p>
          ))}
        </div>
      )}

      {canDecide && (
        <div className="mt-3">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={lang === 'he' ? 'הערה (נדרש עבור "נדרשים תיקונים")' : 'Note (required for "Require corrections")'}
            className="w-full rounded-md border border-line bg-surface px-2.5 py-1.5 text-xs text-ink"
          />
          {error && <p className="mt-1 text-xs text-danger">{error}</p>}
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(Object.keys(DECISION_LABEL) as RevisionDecisionType[]).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => decide(d)}
                disabled={submittingDecision !== null}
                className={`rounded-md px-2.5 py-1.5 text-xs font-medium disabled:opacity-50 ${
                  d === 'proceed_to_defense' ? 'bg-success text-white' : 'border border-line text-ink'
                }`}
              >
                {DECISION_LABEL[d][lang]}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
