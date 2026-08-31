'use client';

// app/committees/CommitteeReviewModal.tsx
// Every committee member (including the chairman, who is also a plain
// member and may cast their own opinion) can see the submission and every
// vote cast so far, and cast/update their own vote. Only the chairman sees
// the additional "Final Decision" control — the one act that actually
// advances/rejects the milestone (see committeeReviewController.ts's
// submitCommitteeDecision). A member's vote never does that by itself.

import { useEffect, useRef, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient, type CommitteeReviewDetail } from '@/lib/apiClient';
import { useModalA11y } from '@/hooks/useModalA11y';

interface CommitteeReviewModalProps {
  milestoneId: string;
  currentUserId?: string;
  onClose: () => void;
  onActed: () => void;
}

export function CommitteeReviewModal({ milestoneId, currentUserId, onClose, onActed }: CommitteeReviewModalProps) {
  const { lang } = useLanguage();
  const [detail, setDetail] = useState<CommitteeReviewDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [myVote, setMyVote] = useState<'approve' | 'reject' | ''>('');
  const [myComment, setMyComment] = useState('');
  const [votingSaving, setVotingSaving] = useState(false);

  const [decision, setDecision] = useState<'approve' | 'reject' | ''>('');
  const [decisionComment, setDecisionComment] = useState('');
  const [decisionSaving, setDecisionSaving] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  useModalA11y(modalRef, true, onClose);

  const load = () => {
    setLoading(true);
    apiClient
      .getCommitteeReview(milestoneId)
      .then((res) => {
        setDetail(res);
        const mine = res.votes.find((v) => v.memberId === currentUserId);
        if (mine) { setMyVote(mine.vote); setMyComment(mine.comment); }
        setError('');
      })
      .catch((err) => setError(err instanceof Error ? err.message : lang === 'he' ? 'הטעינה נכשלה' : 'Failed to load'))
      .finally(() => setLoading(false));
  };

  useEffect(load, [milestoneId]); // eslint-disable-line react-hooks/exhaustive-deps -- load-on-mount + refetch on id change only

  const handleVote = async () => {
    if (!myVote) return;
    if (myVote === 'reject' && !myComment.trim()) {
      setError(lang === 'he' ? 'יש לפרט את סיבת הדחייה' : 'A comment explaining the rejection is required');
      return;
    }
    setVotingSaving(true);
    setError('');
    try {
      await apiClient.submitCommitteeVote(milestoneId, myVote, myComment.trim());
      load();
      onActed();
    } catch (err) {
      setError(err instanceof Error ? err.message : lang === 'he' ? 'שמירת ההצבעה נכשלה' : 'Failed to save your vote');
    } finally {
      setVotingSaving(false);
    }
  };

  const handleDecide = async () => {
    if (!decision) return;
    if (decision === 'reject' && !decisionComment.trim()) {
      setError(lang === 'he' ? 'יש לפרט את סיבת הדחייה' : 'A comment explaining the rejection is required');
      return;
    }
    setDecisionSaving(true);
    setError('');
    try {
      await apiClient.submitCommitteeDecision(milestoneId, decision, decisionComment.trim());
      onActed();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : lang === 'he' ? 'שמירת ההחלטה נכשלה' : 'Failed to save the decision');
    } finally {
      setDecisionSaving(false);
    }
  };

  const inputCls = 'w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-primary focus:bg-surface focus:outline-none';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        ref={modalRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[var(--radius)] bg-surface p-6 shadow-lg outline-none"
      >
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-semibold text-ink">{lang === 'he' ? 'בדיקת ועדה' : 'Committee Review'}</h2>
          <button type="button" onClick={onClose} className="text-muted hover:text-ink">✕</button>
        </div>

        {loading ? (
          <p className="mt-4 text-sm text-muted">…</p>
        ) : !detail ? (
          <p className="mt-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{error}</p>
        ) : (
          <>
            <div className="mt-4 rounded-lg border border-line bg-paper p-3">
              <p className="text-sm font-semibold text-ink">{lang === 'he' ? 'הערת הסטודנט' : "Student's note"}</p>
              <p className="mt-1 text-sm text-muted">{detail.submissionNote || (lang === 'he' ? 'אין הערה' : 'No note')}</p>
              {detail.fileUrls.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {detail.fileUrls.map((url, i) => (
                    <a key={url} href={url} target="_blank" rel="noreferrer" className="text-xs text-primary underline">
                      📎 {lang === 'he' ? `קובץ ${i + 1}` : `File ${i + 1}`}
                    </a>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-4">
              <p className="mb-2 text-sm font-semibold text-ink">
                {lang === 'he' ? `דעות חברי הוועדה (${detail.votes.length}/${detail.committee.memberIds.length})` : `Committee opinions (${detail.votes.length}/${detail.committee.memberIds.length})`}
              </p>
              <div className="grid gap-2">
                {detail.committee.memberIds.map((memberId) => {
                  const v = detail.votes.find((vote) => vote.memberId === memberId);
                  const isChairmanMember = detail.committee.chairmanId === memberId;
                  return (
                    <div key={memberId} className="flex items-start justify-between gap-2 rounded-md bg-paper p-2 text-xs">
                      <div className="min-w-0 flex-1">
                        <span className="font-medium text-ink">
                          {detail.committee.memberNames[memberId] ?? memberId}
                          {isChairmanMember && <span className="ms-1 text-muted">({lang === 'he' ? "יו\"ר" : 'Chair'})</span>}
                        </span>
                        {v?.comment && <p className="mt-0.5 text-muted">{v.comment}</p>}
                      </div>
                      <span
                        className="shrink-0 rounded-full px-2 py-0.5 font-semibold"
                        style={v ? { backgroundColor: v.vote === 'approve' ? 'var(--success-bg)' : 'var(--danger-bg)', color: v.vote === 'approve' ? 'var(--success)' : 'var(--danger)' } : { backgroundColor: '#F1F0EC', color: 'var(--muted)' }}
                      >
                        {v ? (v.vote === 'approve' ? (lang === 'he' ? '✓ בעד' : '✓ Approve') : (lang === 'he' ? '✗ נגד' : '✗ Reject')) : (lang === 'he' ? 'טרם הצביע' : 'Not yet voted')}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-4 rounded-lg border border-line p-3">
              <p className="mb-2 text-sm font-semibold text-ink">{lang === 'he' ? 'ההצבעה שלך' : 'Your vote'}</p>
              <div className="flex gap-2">
                {(['approve', 'reject'] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setMyVote(v)}
                    className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${myVote === v ? (v === 'approve' ? 'border-success bg-success-bg text-success' : 'border-danger bg-danger-bg text-danger') : 'border-line bg-surface text-ink'}`}
                  >
                    {v === 'approve' ? (lang === 'he' ? '✓ בעד' : '✓ Approve') : (lang === 'he' ? '✗ נגד' : '✗ Reject')}
                  </button>
                ))}
              </div>
              <textarea
                rows={2}
                value={myComment}
                onChange={(e) => setMyComment(e.target.value)}
                placeholder={lang === 'he' ? 'הערה (חובה אם מצביעים נגד)' : 'Comment (required if voting reject)'}
                className={`${inputCls} mt-2`}
              />
              <button
                type="button"
                onClick={handleVote}
                disabled={!myVote || votingSaving}
                className="mt-2 w-full rounded-lg bg-primary py-2 text-sm font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60"
              >
                {votingSaving ? '…' : lang === 'he' ? 'שמירת ההצבעה' : 'Save Vote'}
              </button>
            </div>

            {detail.isChairman && (
              <div className="mt-4 role-rail rounded-lg bg-[#EFEBF6] p-3" style={{ '--rail-color': '#6E5A99' } as React.CSSProperties}>
                <p className="mb-2 text-sm font-semibold text-[#5B3E99]">
                  {lang === 'he' ? 'החלטה סופית (יו"ר)' : "Final Decision (Chairman)"}
                </p>
                <div className="flex gap-2">
                  {(['approve', 'reject'] as const).map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setDecision(d)}
                      className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${decision === d ? (d === 'approve' ? 'border-success bg-success-bg text-success' : 'border-danger bg-danger-bg text-danger') : 'border-line bg-surface text-ink'}`}
                    >
                      {d === 'approve' ? (lang === 'he' ? '✓ אישור' : '✓ Approve') : (lang === 'he' ? '✗ דחייה' : '✗ Reject')}
                    </button>
                  ))}
                </div>
                <textarea
                  rows={2}
                  value={decisionComment}
                  onChange={(e) => setDecisionComment(e.target.value)}
                  placeholder={lang === 'he' ? 'נימוק ההחלטה (חובה בדחייה)' : 'Reasoning (required if rejecting)'}
                  className={`${inputCls} mt-2`}
                />
                <button
                  type="button"
                  onClick={handleDecide}
                  disabled={!decision || decisionSaving}
                  className="mt-2 w-full rounded-lg bg-[#6E5A99] py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
                >
                  {decisionSaving ? '…' : lang === 'he' ? 'קביעת ההחלטה הסופית' : 'Finalize Decision'}
                </button>
              </div>
            )}
          </>
        )}

        {error && <p className="mt-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{error}</p>}
      </div>
    </div>
  );
}
