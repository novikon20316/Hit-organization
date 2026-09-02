'use client';

// app/coordinator/home/ProposalRecommendationModal.tsx
//
// The coordinator's full review of a research_proposal milestone — the
// actual submitted document (personal info per teammate, every field the
// student filled in, the supervisor's signature) with the tri-state
// decision ("המלצת רכז הפרויקטים": פרויקט מאושר / מאושר בתנאי / לא מאושר)
// and a mandatory-where-relevant comment at the bottom, digitizing
// Project_proposal.docx's own layout — the paper form has the recommendation
// and signature line AFTER the document content, not in a separate popup.
// Nothing is submitted until "Sign" is clicked — the radio/comment are pure
// local state until then, so the coordinator can freely change their mind.
// "פרויקט לא מאושר" is really just the ordinary reject flow (mandatory
// reason) under a form-matching label, not a new status.

import { useEffect, useRef, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { apiClient } from '@/lib/apiClient';
import { examinerSignatureStyle } from '@/lib/examinerSignature';
import { useModalA11y } from '@/hooks/useModalA11y';
import type { CoordinatorPendingMilestone } from './types';

export type ProposalDecision = 'approved' | 'approved_conditionally' | 'rejected';

interface TeammateProfile {
  uid: string;
  displayName: string;
  studentId: string | null;
  phoneNumber: string | null;
  email: string | null;
  accumulatedCredits: number | null;
  photoUrl: string | null;
}

interface ProposalRecommendationModalProps {
  open: boolean;
  busy: boolean;
  milestone: CoordinatorPendingMilestone;
  onCancel: () => void;
  onConfirm: (decision: ProposalDecision, comment: string) => void;
}

export function ProposalRecommendationModal({ open, busy, milestone: m, onCancel, onConfirm }: ProposalRecommendationModalProps) {
  const { lang } = useLanguage();
  const { userData } = useAuth();
  const [decision, setDecision] = useState<ProposalDecision>('approved');
  const [comment, setComment] = useState('');
  const [teammates, setTeammates] = useState<TeammateProfile[] | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  useModalA11y(modalRef, open, () => {
    setDecision('approved');
    setComment('');
    onCancel();
  });

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const resolved = await Promise.all((m.studentIds ?? []).map(async (uid): Promise<TeammateProfile> => {
        const [userSnap, photoRes] = await Promise.all([
          getDoc(doc(db, 'users', uid)),
          apiClient.getUserPhotoUrl(uid).catch(() => ({ photoUrl: null })),
        ]);
        const u = userSnap.data();
        return {
          uid,
          displayName: u?.displayName ?? '',
          studentId: u?.studentId ?? null,
          phoneNumber: u?.phoneNumber ?? null,
          email: u?.email ?? null,
          accumulatedCredits: typeof u?.accumulatedCredits === 'number' ? u.accumulatedCredits : null,
          photoUrl: photoRes.photoUrl,
        };
      }));
      if (!cancelled) setTeammates(resolved);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, m.id]);

  if (!open) return null;

  const commentRequired = decision !== 'approved';
  const canConfirm = !commentRequired || comment.trim().length > 0;
  const fields = m.studentFormFields ?? [];

  const resolveLockedValue = (f: NonNullable<CoordinatorPendingMilestone['studentFormFields']>[number]): string => {
    if (f.autoFill === 'submissionDate') {
      return m.submittedAt ? new Date(m.submittedAt).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US') : '—';
    }
    if (f.autoFill === 'supervisorName') return m.supervisorName ?? '—';
    return '—';
  };

  const OPTIONS: Array<{ value: ProposalDecision; labelHe: string; labelEn: string }> = [
    { value: 'approved', labelHe: 'פרויקט מאושר', labelEn: 'Project approved' },
    { value: 'approved_conditionally', labelHe: 'פרויקט מאושר בתנאי', labelEn: 'Approved conditionally' },
    { value: 'rejected', labelHe: 'פרויקט לא מאושר', labelEn: 'Project not approved' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        ref={modalRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-[var(--radius)] bg-surface p-6 shadow-lg outline-none"
      >
        <h2 className="text-lg font-semibold text-ink">{lang === 'he' ? 'הצעה לפרויקט גמר' : 'Final Project Proposal'}</h2>
        <p className="mt-0.5 text-sm text-muted">{lang === 'he' ? m.projectTitleHe : m.projectTitleEn}</p>

        {/* Per-teammate personal-info blocks — same as the student's own form */}
        <div className="mt-4 grid gap-2">
          <span className="text-sm font-medium text-ink">{lang === 'he' ? 'פרטי הסטודנט/ית/ים' : "Student(s)' details"}</span>
          {!teammates ? (
            <p className="text-xs text-muted">{lang === 'he' ? 'טוען...' : 'Loading...'}</p>
          ) : (
            teammates.map((tm) => (
              <div key={tm.uid} className="flex gap-3 rounded-lg border border-line bg-paper p-3">
                <div className="h-14 w-14 shrink-0 overflow-hidden rounded-full border border-line bg-surface">
                  {tm.photoUrl && <img src={tm.photoUrl} alt="" className="h-full w-full object-cover" />}
                </div>
                <div className="grid flex-1 grid-cols-2 gap-x-3 gap-y-1 text-xs">
                  <div><span className="text-muted">{lang === 'he' ? 'שם מלא: ' : 'Full name: '}</span>{tm.displayName || '—'}</div>
                  <div><span className="text-muted">{lang === 'he' ? 'ת.ז.: ' : 'ID: '}</span>{tm.studentId || '—'}</div>
                  <div><span className="text-muted">{lang === 'he' ? 'טלפון: ' : 'Phone: '}</span>{tm.phoneNumber || '—'}</div>
                  <div><span className="text-muted">{lang === 'he' ? 'דוא"ל: ' : 'Email: '}</span>{tm.email || '—'}</div>
                  <div>
                    <span className="text-muted">{lang === 'he' ? 'נ"ז צבור: ' : 'Accumulated credits: '}</span>
                    {tm.accumulatedCredits ?? (lang === 'he' ? 'טרם התקבל' : 'Pending')}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* The submitted document itself */}
        <div className="mt-4 grid gap-3">
          {fields.map((f) => {
            const v = m.studentFormData?.[f.key];
            return (
              <div key={f.key}>
                <p className="text-xs font-medium text-muted">{lang === 'he' ? f.labelHe : f.labelEn}</p>
                {f.locked ? (
                  <p className="text-sm text-ink">{resolveLockedValue(f)}</p>
                ) : f.type === 'table' ? (
                  <div className="grid gap-1">
                    {(Array.isArray(v) ? v : []).map((row: Record<string, unknown>, i: number) => (
                      <p key={i} className="text-sm text-ink">
                        {(f.tableColumns ?? []).map((c) => String(row[c.key] ?? '')).join(' · ')}
                      </p>
                    ))}
                    {(!Array.isArray(v) || v.length === 0) && <p className="text-sm text-muted">—</p>}
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap text-sm text-ink">{v != null && v !== '' ? String(v) : '—'}</p>
                )}
              </div>
            );
          })}
        </div>

        {/* Supervisor's signature */}
        {m.supervisorSignedByName && (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-line bg-paper px-3 py-2">
            <span className="text-xs text-muted">{lang === 'he' ? 'נחתם ע"י המנחה:' : 'Signed by supervisor:'}</span>
            <span style={examinerSignatureStyle(m.supervisorSignedByName, m.facultyId, 'supervisor', null)} className="text-sm">
              {m.supervisorSignedByName}
            </span>
            {m.supervisorSignedAt && (
              <span className="text-xs text-muted">
                {new Date(m.supervisorSignedAt).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US')}
              </span>
            )}
          </div>
        )}

        {/* המלצת רכז הפרויקטים — the decision, then the coordinator's own signature */}
        <div className="mt-5 border-t border-line pt-4">
          <h3 className="text-sm font-semibold text-ink">{lang === 'he' ? 'המלצת רכז הפרויקטים' : "Coordinator's recommendation"}</h3>
          <div className="mt-3 grid gap-2">
            {OPTIONS.map((opt) => (
              <label key={opt.value} className="flex cursor-pointer items-center gap-2 rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink has-[:checked]:border-primary">
                <input type="radio" name="proposal-decision" checked={decision === opt.value} onChange={() => setDecision(opt.value)} />
                {lang === 'he' ? opt.labelHe : opt.labelEn}
              </label>
            ))}
          </div>

          <label className="mt-3 block">
            <span className="mb-1.5 block text-sm font-medium text-ink">
              {lang === 'he' ? 'הערה' : 'Comment'}{commentRequired && <span className="text-danger"> *</span>}
            </span>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-primary focus:bg-surface focus:outline-none"
              placeholder={
                decision === 'approved_conditionally'
                  ? (lang === 'he' ? 'פרט/י את התנאים לאישור...' : 'Describe the conditions for approval...')
                  : decision === 'rejected'
                    ? (lang === 'he' ? 'סיבת אי-האישור...' : 'Reason the project was not approved...')
                    : (lang === 'he' ? 'הערה (אופציונלי)...' : 'Comment (optional)...')
              }
            />
          </label>

          {userData && (
            <div className="mt-3 flex items-center gap-2">
              <span className="text-xs text-muted">{lang === 'he' ? 'חתימה:' : 'Signature:'}</span>
              <span style={examinerSignatureStyle(userData.displayName, userData.facultyId, 'coordinator', userData.major ?? null)} className="text-sm">
                {userData.displayName}
              </span>
            </div>
          )}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setDecision('approved');
              setComment('');
              onCancel();
            }}
            disabled={busy}
            className="rounded-lg border border-line px-3.5 py-2 text-sm font-medium text-ink hover:bg-paper"
          >
            {lang === 'he' ? 'ביטול' : 'Cancel'}
          </button>
          <button
            type="button"
            disabled={busy || !canConfirm}
            onClick={() => onConfirm(decision, comment.trim())}
            className="rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60"
          >
            {busy ? '…' : lang === 'he' ? '✍️ חתום ושלח החלטה' : '✍️ Sign & submit decision'}
          </button>
        </div>
      </div>
    </div>
  );
}
