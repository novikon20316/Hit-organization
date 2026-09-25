'use client';

// app/administrative_coordinator/dashboard/CommitteeConflictsTab.tsx
// "Replace Committee Member" — a project's supervisor (or secondary
// supervisor) shouldn't also sit on the committee reviewing that same
// project. Lists every project in her own coordinatorScopes where that
// overlap exists and it's currently her turn to act, and lets her recuse
// the conflicted person for THIS project only (the shared department
// committee is untouched — see server/src/controllers/committeeController.ts's
// resolveCommitteeForProject/applyCommitteeSubstitutions).

import { useEffect, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient, type CommitteeConflict } from '@/lib/apiClient';

interface EligibleMember {
  id: string;
  displayName: string;
  email: string;
  role: string;
}

export function CommitteeConflictsTab() {
  const { lang } = useLanguage();
  const [conflicts, setConflicts] = useState<CommitteeConflict[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [replacingKey, setReplacingKey] = useState<string | null>(null);
  const [membersByFaculty, setMembersByFaculty] = useState<Record<string, EligibleMember[]>>({});
  const [selectedReplacement, setSelectedReplacement] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchConflicts = () => {
    setLoading(true);
    return apiClient
      .getCommitteeConflicts()
      .then((res) => {
        setConflicts(res.conflicts);
        setError('');
      })
      .catch((err) => setError(err instanceof Error ? err.message : lang === 'he' ? 'לא ניתן לטעון נתונים' : 'Could not load data'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchConflicts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const conflictKey = (c: CommitteeConflict) => `${c.projectId}:${c.conflictedUserId}`;

  const openReplace = async (c: CommitteeConflict) => {
    setReplacingKey(conflictKey(c));
    setSelectedReplacement('');
    if (!membersByFaculty[c.facultyId]) {
      try {
        const res = await apiClient.listEligibleCommitteeMembers(c.facultyId);
        setMembersByFaculty((prev) => ({ ...prev, [c.facultyId]: res.members }));
      } catch {
        // The picker just shows "no candidates" below if this failed —
        // she can retry by reopening it.
      }
    }
  };

  const handleSubstitute = async (c: CommitteeConflict) => {
    if (!selectedReplacement) return;
    setSubmitting(true);
    try {
      await apiClient.substituteCommitteeMember(c.projectId, c.conflictedUserId, selectedReplacement);
      setReplacingKey(null);
      setSelectedReplacement('');
      await fetchConflicts();
    } catch (err) {
      setError(err instanceof Error ? err.message : lang === 'he' ? 'ההחלפה נכשלה' : 'Failed to replace the member');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-administrative-coordinator-on-surface-variant">{lang === 'he' ? 'טוען...' : 'Loading...'}</p>;
  }

  return (
    <div className="grid gap-3">
      <p className="text-xs text-administrative-coordinator-on-surface-variant">
        {lang === 'he'
          ? 'פרויקטים בהם המנחה הוא גם חבר בוועדה שתבחן אותו — יש להחליף אותו במגמה זו בלבד. שאר חברי הוועדה, ופרויקטים אחרים שהוועדה בוחנת, אינם מושפעים.'
          : "Projects where the supervisor is also on the committee reviewing them — replace them for this project only. Every other committee member, and every other project the committee reviews, is unaffected."}
      </p>

      {error && <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{error}</p>}

      {conflicts.length === 0 ? (
        <p className="text-sm text-administrative-coordinator-on-surface-variant">
          ✅ {lang === 'he' ? 'אין ניגודי עניינים כרגע' : 'No conflicts right now'}
        </p>
      ) : (
        conflicts.map((c) => {
          const key = conflictKey(c);
          const isReplacing = replacingKey === key;
          const candidates = (membersByFaculty[c.facultyId] ?? []).filter((m) => m.id !== c.conflictedUserId);
          return (
            <div
              key={key}
              className="role-rail rounded-administrative-coordinator border border-administrative-coordinator-outline-variant bg-administrative-coordinator-surface-container-lowest p-4"
              style={{ '--rail-color': 'var(--danger)' } as React.CSSProperties}
            >
              <p className="text-sm font-semibold text-administrative-coordinator-on-surface">
                {lang === 'he' ? c.projectTitleHe || c.projectTitleEn : c.projectTitleEn || c.projectTitleHe}
              </p>
              <p className="mt-1 text-xs text-administrative-coordinator-on-surface-variant">
                {lang === 'he'
                  ? `${c.conflictedUserName} הוא ${c.conflictRole === 'chairman' ? 'יו"ר' : 'חבר'} הוועדה, וגם ${c.supervisorRole === 'supervisor' ? 'המנחה' : 'המנחה המשני'} של הפרויקט.`
                  : `${c.conflictedUserName} is ${c.conflictRole === 'chairman' ? 'the chairman' : 'a member'} of the committee, and also the project's ${c.supervisorRole === 'supervisor' ? 'supervisor' : 'secondary supervisor'}.`}
              </p>

              {isReplacing ? (
                <div className="mt-3 grid gap-2">
                  <select
                    value={selectedReplacement}
                    onChange={(e) => setSelectedReplacement(e.target.value)}
                    className="w-full rounded-lg border border-administrative-coordinator-outline-variant bg-administrative-coordinator-surface-container-low px-3 py-2 text-sm text-administrative-coordinator-on-surface focus:border-administrative-coordinator-primary focus:outline-none"
                  >
                    <option value="">{lang === 'he' ? 'בחר/י מחליף/ה' : 'Select a replacement'}</option>
                    {candidates.map((m) => (
                      <option key={m.id} value={m.id}>{m.displayName} ({m.role})</option>
                    ))}
                  </select>
                  {candidates.length === 0 && (
                    <p className="text-xs text-administrative-coordinator-on-surface-variant">
                      {lang === 'he' ? 'אין מועמדים זמינים' : 'No candidates available'}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleSubstitute(c)}
                      disabled={!selectedReplacement || submitting}
                      className="flex-1 rounded-lg bg-danger px-3 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60"
                    >
                      {submitting ? (lang === 'he' ? 'מחליף...' : 'Replacing...') : (lang === 'he' ? 'אשר/י החלפה' : 'Confirm replacement')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setReplacingKey(null)}
                      className="flex-1 rounded-lg border border-administrative-coordinator-outline-variant px-3 py-2 text-xs font-semibold text-administrative-coordinator-on-surface-variant hover:bg-administrative-coordinator-surface-container-low"
                    >
                      {lang === 'he' ? 'ביטול' : 'Cancel'}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => openReplace(c)}
                  className="mt-3 w-full rounded-lg border border-danger px-3 py-2 text-xs font-semibold text-danger hover:bg-danger-bg"
                >
                  🔁 {lang === 'he' ? 'החלף/י חבר ועדה' : 'Replace committee member'}
                </button>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
