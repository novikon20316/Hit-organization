'use client';

// app/committees/page.tsx
// Top-level route, not nested under any one role dashboard (mirrors
// /workflow-templates, /reports) — a committee's chairman can be ANY staff
// account a system_admin picked (see committeeController.ts's doc comment
// on why chairman isn't derived from the program_head role), so this can't
// live under one specific role's dashboard tree.

import { useCallback, useEffect, useState } from 'react';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { useRequireRole } from '@/hooks/useRequireRole';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient, type CommitteeRecord, type CommitteePendingReview } from '@/lib/apiClient';
import { facultyLabel, type FacultyId } from '@/lib/i18n';
import { majorsForFaculty } from '@/lib/permissions';
import { STAFF_ROLES } from '@/lib/roles';
import { EditCommitteeModal } from './EditCommitteeModal';
import { CommitteeReviewModal } from './CommitteeReviewModal';

export default function CommitteesPage() {
  const { loading: guardLoading, isAllowed, firebaseUser, userData } = useRequireRole(STAFF_ROLES);
  const { lang } = useLanguage();
  const isSystemAdmin = userData?.role === 'system_admin' || (userData?.roles ?? []).includes('system_admin');

  const [allCommittees, setAllCommittees] = useState<CommitteeRecord[]>([]);
  const [myCommittees, setMyCommittees] = useState<CommitteeRecord[]>([]);
  const [pendingReviews, setPendingReviews] = useState<CommitteePendingReview[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [creatingCommittee, setCreatingCommittee] = useState(false);
  const [editingCommittee, setEditingCommittee] = useState<CommitteeRecord | null>(null);
  const [reviewingMilestoneId, setReviewingMilestoneId] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const [mine, reviews] = await Promise.all([
        apiClient.getMyCommittees(),
        apiClient.getMyPendingCommitteeReviews(),
      ]);
      setMyCommittees(mine.committees);
      setPendingReviews(reviews.reviews);
      if (isSystemAdmin) {
        const all = await apiClient.listCommittees();
        setAllCommittees(all.committees);
      }
      setLoadError('');
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : lang === 'he' ? 'הטעינה נכשלה' : 'Failed to load');
    } finally {
      setLoadingData(false);
    }
  }, [isSystemAdmin, lang]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    if (isAllowed) fetchAll();
  }, [isAllowed, fetchAll]);

  if (guardLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper">
        <p className="text-sm text-muted">…</p>
      </div>
    );
  }

  const committeeLabel = (c: CommitteeRecord) =>
    `${facultyLabel(c.facultyId as FacultyId, lang)} · ${majorsForFaculty(c.facultyId).find((m) => m.slug === c.major)?.label[lang] ?? c.major} · ${
      c.type === 'thesis' ? (lang === 'he' ? 'תזה' : 'Thesis') : lang === 'he' ? 'פרויקט גמר' : 'Final Project'
    }`;

  return (
    <DashboardShell
      title={lang === 'he' ? 'ועדות' : 'Committees'}
      subtitle={lang === 'he' ? 'ועדות תזה ופרויקט גמר' : 'Thesis and final-project review committees'}
    >
      {loadError && <p className="mb-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{loadError}</p>}

      {loadingData ? (
        <p className="text-sm text-muted">…</p>
      ) : (
        <div className="grid gap-6">
          {isSystemAdmin && (
            <section>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-semibold text-ink">{lang === 'he' ? 'כל הוועדות (מנהל מערכת)' : 'All Committees (system_admin)'}</p>
                <button
                  type="button"
                  onClick={() => setCreatingCommittee(true)}
                  className="rounded-full bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-ink hover:bg-primary-hover"
                >
                  ＋ {lang === 'he' ? 'ועדה חדשה' : 'New Committee'}
                </button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {allCommittees.length === 0 && <p className="text-sm text-muted">{lang === 'he' ? 'אין ועדות עדיין' : 'No committees yet'}</p>}
                {allCommittees.map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-2 rounded-lg border border-line bg-surface p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">{committeeLabel(c)}</p>
                      <p className="text-xs text-muted">
                        {lang === 'he' ? `${c.memberIds.length} חברים` : `${c.memberIds.length} members`}
                        {c.chairmanId ? '' : ` · ${lang === 'he' ? 'אין יו"ר' : 'no chairman set'}`}
                      </p>
                    </div>
                    <button type="button" onClick={() => setEditingCommittee(c)} className="shrink-0 text-xs font-medium text-primary hover:underline">
                      ✏️ {lang === 'he' ? 'עריכה' : 'Edit'}
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section>
            <p className="mb-2 text-sm font-semibold text-ink">{lang === 'he' ? 'הוועדות שלי' : 'My Committees'}</p>
            {myCommittees.length === 0 ? (
              <p className="text-sm text-muted">{lang === 'he' ? 'אינך חבר/ה באף ועדה' : "You're not a member of any committee"}</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {myCommittees.map((c) => {
                  const isChairman = c.chairmanId === firebaseUser?.uid;
                  return (
                    <div key={c.id} className="flex items-center justify-between gap-2 rounded-lg border border-line bg-surface p-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ink">{committeeLabel(c)}</p>
                        <p className="text-xs text-muted">
                          {isChairman ? (lang === 'he' ? "את/ה היו\"ר" : "You're the chairman") : (lang === 'he' ? 'חבר/ת ועדה' : 'Committee member')}
                          {' · '}
                          {lang === 'he' ? `${c.memberIds.length} חברים` : `${c.memberIds.length} members`}
                        </p>
                      </div>
                      {isChairman && (
                        <button type="button" onClick={() => setEditingCommittee(c)} className="shrink-0 text-xs font-medium text-primary hover:underline">
                          ✏️ {lang === 'he' ? 'עריכה' : 'Edit'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section>
            <p className="mb-2 text-sm font-semibold text-ink">{lang === 'he' ? 'בדיקות ממתינות' : 'Pending Reviews'}</p>
            {pendingReviews.length === 0 ? (
              <p className="text-sm text-muted">{lang === 'he' ? '✅ אין הגשות הממתינות לבדיקתך' : '✅ No submissions awaiting your review'}</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {pendingReviews.map((r) => (
                  <div key={r.milestoneId} className="rounded-lg border border-line bg-surface p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium text-ink">{lang === 'he' ? r.projectTitleHe : r.projectTitleEn}</p>
                      {r.isChairman && (
                        <span className="shrink-0 rounded-full bg-[#EDE9FE] px-2 py-0.5 text-[10px] font-semibold text-primary">
                          {lang === 'he' ? "יו\"ר" : 'Chair'}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      {lang === 'he' ? `${r.voteCount}/${r.memberCount} הצביעו` : `${r.voteCount}/${r.memberCount} voted`}
                      {r.alreadyVoted ? ` · ${lang === 'he' ? 'הצבעת' : 'you voted'}` : ''}
                    </p>
                    <button
                      type="button"
                      onClick={() => setReviewingMilestoneId(r.milestoneId)}
                      className="mt-2 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-ink hover:bg-primary-hover"
                    >
                      {lang === 'he' ? 'בדיקה' : 'Review'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {creatingCommittee && (
        <EditCommitteeModal existingCommittees={allCommittees} onClose={() => setCreatingCommittee(false)} onSaved={fetchAll} />
      )}
      {editingCommittee && (
        <EditCommitteeModal committee={editingCommittee} onClose={() => setEditingCommittee(null)} onSaved={fetchAll} />
      )}
      {reviewingMilestoneId && (
        <CommitteeReviewModal
          milestoneId={reviewingMilestoneId}
          currentUserId={firebaseUser?.uid}
          onClose={() => setReviewingMilestoneId(null)}
          onActed={fetchAll}
        />
      )}
    </DashboardShell>
  );
}
