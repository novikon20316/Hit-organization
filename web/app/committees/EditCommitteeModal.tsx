'use client';

// app/committees/EditCommitteeModal.tsx
// Two modes in one modal: system_admin creating a brand-new committee
// (facultyId/major/type are fixed once created — the doc id is
// `${facultyId}_${major}_${type}`, see committeeController.ts) picks all
// three plus initial members/chairman; editing an EXISTING committee (by
// its own chairman, or by system_admin) only touches memberIds/chairmanId.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient, type CommitteeRecord } from '@/lib/apiClient';
import { VALID_FACULTY_IDS } from '@/lib/roles';
import { facultyLabel, type FacultyId } from '@/lib/i18n';
import { majorsForFaculty } from '@/lib/permissions';
import { useModalA11y } from '@/hooks/useModalA11y';

interface EligibleMember {
  id: string;
  displayName: string;
  email: string;
  role: string;
  facultyId: string;
}

interface EditCommitteeModalProps {
  /** Omit to create a brand-new committee; pass an existing one to edit its
   *  membership/chairman only (facultyId/major/type are then read-only). */
  committee?: CommitteeRecord;
  /** Every committee that already exists, in create mode only — so picking
   *  a (facultyId, major, type) combo that's already taken can be flagged
   *  before saving. createCommittee upserts by design (system_admin
   *  "fixing" a committee is a real use case), but silently overwriting an
   *  existing committee's members because the picker didn't warn first is
   *  exactly the kind of "human error" this whole feature exists to guard
   *  against elsewhere in the app. */
  existingCommittees?: CommitteeRecord[];
  onClose: () => void;
  onSaved: () => void;
}

const FACULTY_OPTIONS = VALID_FACULTY_IDS.filter((id) => id !== 'all');

export function EditCommitteeModal({ committee, existingCommittees = [], onClose, onSaved }: EditCommitteeModalProps) {
  const { lang } = useLanguage();
  const isCreate = !committee;
  const [facultyId, setFacultyId] = useState(committee?.facultyId ?? FACULTY_OPTIONS[0] ?? '');
  const [major, setMajor] = useState(committee?.major ?? '');
  const [type, setType] = useState<'thesis' | 'final_project'>(committee?.type ?? 'thesis');
  const [memberIds, setMemberIds] = useState<string[]>(committee?.memberIds ?? []);
  const [chairmanId, setChairmanId] = useState<string | null>(committee?.chairmanId ?? null);
  const [candidates, setCandidates] = useState<EligibleMember[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const modalRef = useRef<HTMLDivElement>(null);
  useModalA11y(modalRef, true, onClose);

  const majorOptions = useMemo(() => majorsForFaculty(facultyId), [facultyId]);
  const conflictingCommittee = isCreate
    ? existingCommittees.find((c) => c.facultyId === facultyId && c.major === major && c.type === type)
    : null;

  useEffect(() => {
    if (isCreate && majorOptions.length > 0 && !majorOptions.some((m) => m.slug === major)) {
      setMajor(majorOptions[0]!.slug);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-pick when the faculty (and so majorOptions) changes
  }, [facultyId]);

  useEffect(() => {
    let cancelled = false;
    setLoadingCandidates(true);
    apiClient
      .listEligibleCommitteeMembers(facultyId || undefined)
      .then((res) => { if (!cancelled) setCandidates(res.members); })
      .catch(() => { if (!cancelled) setCandidates([]); })
      .finally(() => { if (!cancelled) setLoadingCandidates(false); });
    return () => { cancelled = true; };
  }, [facultyId]);

  const toggleMember = (id: string) => {
    setMemberIds((prev) => {
      const next = prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id];
      if (!next.includes(chairmanId ?? '')) setChairmanId(next.length ? next[0]! : null);
      return next;
    });
  };

  const handleSave = async () => {
    if (!facultyId || !major) {
      setError(lang === 'he' ? 'יש לבחור פקולטה ומגמה' : 'Faculty and major are required');
      return;
    }
    if (memberIds.length === 0) {
      setError(lang === 'he' ? 'יש להוסיף לפחות חבר ועדה אחד' : 'At least one committee member is required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (isCreate) {
        await apiClient.createCommittee({ facultyId, major, type, chairmanId: chairmanId ?? undefined, memberIds });
      } else {
        await apiClient.updateCommittee(committee!.id, { memberIds, chairmanId });
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : lang === 'he' ? 'השמירה נכשלה' : 'Save failed');
    } finally {
      setSaving(false);
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
          <h2 className="text-lg font-semibold text-ink">
            {isCreate ? (lang === 'he' ? 'הקמת ועדה' : 'Create Committee') : (lang === 'he' ? 'עריכת חברי ועדה' : 'Edit Committee Members')}
          </h2>
          <button type="button" onClick={onClose} aria-label={lang === 'he' ? 'סגור' : 'Close'} className="text-muted hover:text-ink">✕</button>
        </div>

        <div className="mt-4 grid gap-3">
          {isCreate ? (
            <div className="grid grid-cols-3 gap-3">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-ink">{lang === 'he' ? 'פקולטה' : 'Faculty'}</span>
                <select value={facultyId} onChange={(e) => setFacultyId(e.target.value)} className={inputCls}>
                  {FACULTY_OPTIONS.map((f) => <option key={f} value={f}>{facultyLabel(f, lang)}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-ink">{lang === 'he' ? 'מגמה' : 'Major'}</span>
                <select value={major} onChange={(e) => setMajor(e.target.value)} className={inputCls}>
                  {majorOptions.map((m) => <option key={m.slug} value={m.slug}>{m.label[lang]}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-ink">{lang === 'he' ? 'סוג ועדה' : 'Committee Type'}</span>
                <select value={type} onChange={(e) => setType(e.target.value as 'thesis' | 'final_project')} className={inputCls}>
                  <option value="thesis">{lang === 'he' ? 'תזה' : 'Thesis'}</option>
                  <option value="final_project">{lang === 'he' ? 'פרויקט גמר' : 'Final Project'}</option>
                </select>
              </label>
            </div>
          ) : (
            <p className="text-sm text-muted">
              {facultyLabel(committee!.facultyId as FacultyId, lang)} · {majorsForFaculty(committee!.facultyId).find((m) => m.slug === committee!.major)?.label[lang] ?? committee!.major} ·{' '}
              {committee!.type === 'thesis' ? (lang === 'he' ? 'תזה' : 'Thesis') : (lang === 'he' ? 'פרויקט גמר' : 'Final Project')}
            </p>
          )}

          {conflictingCommittee && (
            <p className="rounded-md bg-danger-bg px-3 py-2 text-xs text-danger" role="alert">
              ⚠️ {lang === 'he'
                ? 'ועדה כבר קיימת עבור שילוב זה — שמירה תחליף את חבריה הקיימים.'
                : 'A committee already exists for this combination — saving will replace its existing members.'}
            </p>
          )}

          <div>
            <span className="mb-1.5 block text-sm font-medium text-ink">{lang === 'he' ? 'חברי ועדה' : 'Committee Members'}</span>
            {loadingCandidates ? (
              <p className="text-sm text-muted">…</p>
            ) : (
              <div className="grid max-h-56 gap-1 overflow-y-auto rounded-lg border border-line p-2">
                {candidates.length === 0 && <p className="text-xs text-muted">{lang === 'he' ? 'לא נמצאו מועמדים' : 'No candidates found'}</p>}
                {candidates.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-paper">
                    <input type="checkbox" checked={memberIds.includes(c.id)} onChange={() => toggleMember(c.id)} className="h-4 w-4" />
                    <span className="flex-1 truncate text-ink">{c.displayName}</span>
                    <span className="text-xs text-muted">{c.email}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {memberIds.length > 0 && (
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink">{lang === 'he' ? 'יו"ר הוועדה' : 'Chairman'}</span>
              <select value={chairmanId ?? ''} onChange={(e) => setChairmanId(e.target.value || null)} className={inputCls}>
                <option value="">{lang === 'he' ? 'לא נבחר' : 'Not set'}</option>
                {memberIds.map((id) => {
                  const c = candidates.find((cand) => cand.id === id);
                  return <option key={id} value={id}>{c?.displayName ?? id}</option>;
                })}
              </select>
            </label>
          )}
        </div>

        {error && <p className="mt-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{error}</p>}

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-line px-3.5 py-2 text-sm font-medium text-ink hover:bg-paper">
            {lang === 'he' ? 'ביטול' : 'Cancel'}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60"
          >
            {saving ? '…' : lang === 'he' ? 'שמירה' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
