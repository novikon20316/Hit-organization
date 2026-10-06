'use client';

// app/admin/panel/DecisionRelayModal.tsx
// system_admin control for which majors the committee-chairman "send the
// decision back to..." picker is turned on for (see server's
// decisionRelayConfig.ts / decisionRelay.ts, and
// web/app/committees/CommitteeReviewModal.tsx's picker, which is invisible
// for any major not checked here). Grouped by faculty since that's how the
// person configuring this thinks about "subjects", even though a major
// slug alone is already enough to resolve the setting server-side.

import { useEffect, useRef, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import { useModalA11y } from '@/hooks/useModalA11y';
import { HIT_FACULTIES } from '@/lib/faculties';
import { majorsForFaculty } from '@/lib/permissions';

interface DecisionRelayModalProps {
  onClose: () => void;
  onSaved?: () => void;
}

export function DecisionRelayModal({ onClose, onSaved }: DecisionRelayModalProps) {
  const { lang } = useLanguage();
  const isHe = lang === 'he';

  const [enabledMajors, setEnabledMajors] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const modalRef = useRef<HTMLDivElement>(null);
  useModalA11y(modalRef, true, onClose);

  useEffect(() => {
    apiClient.getDecisionRelayConfig()
      .then((res) => setEnabledMajors(new Set(res.enabledMajors)))
      .catch((err) => setError(err instanceof Error ? err.message : isHe ? 'הטעינה נכשלה' : 'Failed to load'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load-on-mount only
  }, []);

  const toggleMajor = (slug: string) => {
    setEnabledMajors((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      await apiClient.updateDecisionRelayConfig([...enabledMajors]);
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : isHe ? 'השמירה נכשלה' : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        ref={modalRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-admin-lg bg-admin-surface-container-lowest p-6 shadow-lg outline-none"
      >
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-semibold text-admin-on-surface">📨 {isHe ? 'העברת החלטות ועדה' : 'Committee Decision Relay'}</h2>
          <button type="button" onClick={onClose} aria-label={isHe ? 'סגור' : 'Close'} className="text-admin-on-surface-variant hover:text-admin-on-surface">
            ✕
          </button>
        </div>
        <p className="mt-1 text-xs text-admin-on-surface-variant">
          {isHe
            ? 'עבור המגמות המסומנות, יו"ר ועדה יכול לבחור למי להעביר החלטה סופית (במקום ישירות לסטודנט/ית) — אותו אדם יהיה אחראי להעביר את התוצאה בעצמו/ה.'
            : 'For the checked majors, a committee chairman can choose who a final decision goes to (instead of straight to the student) — that person becomes responsible for passing it on themselves.'}
        </p>

        {error && <p className="mt-3 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{error}</p>}

        {loading ? (
          <p className="mt-4 text-sm text-admin-on-surface-variant">…</p>
        ) : (
          <div className="mt-4 grid gap-4">
            {HIT_FACULTIES.map((faculty) => {
              const majors = majorsForFaculty(faculty.key);
              if (majors.length === 0) return null;
              return (
                <div key={faculty.key}>
                  <p className="mb-1.5 text-sm font-semibold text-admin-on-surface">{faculty.label[lang]}</p>
                  <div className="grid gap-1.5">
                    {majors.map((m) => (
                      <label key={m.slug} className="flex items-center gap-2 text-sm text-admin-on-surface">
                        <input
                          type="checkbox"
                          checked={enabledMajors.has(m.slug)}
                          onChange={() => toggleMajor(m.slug)}
                        />
                        {m.label[lang]}
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <button
          type="button"
          onClick={handleSave}
          disabled={loading || saving}
          className="mt-5 w-full rounded-lg bg-admin-primary py-2 text-sm font-semibold text-admin-on-primary hover:bg-admin-primary-container disabled:opacity-60"
        >
          {saving ? '…' : isHe ? 'שמירה' : 'Save'}
        </button>
      </div>
    </div>
  );
}
