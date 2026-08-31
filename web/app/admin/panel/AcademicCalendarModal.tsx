'use client';

// app/admin/panel/AcademicCalendarModal.tsx
// Ported from the academic-calendar Modal + openAcademicCalendar/
// saveAcademicCalendar in mobile's panel.tsx. Fall/spring semester start
// dates — also feed the graduation-based auto-deletion sweep (see
// server/src/services/accountDeletion.ts). Summer semester is fixed
// (July-September) and isn't editable here, matching the mobile UI.

import { useEffect, useRef, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import { useModalA11y } from '@/hooks/useModalA11y';

interface AcademicCalendarModalProps {
  onClose: () => void;
}

export function AcademicCalendarModal({ onClose }: AcademicCalendarModalProps) {
  const { lang } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  useModalA11y(modalRef, true, onClose);

  const [fallMonth, setFallMonth] = useState('11');
  const [fallDay, setFallDay] = useState('1');
  const [springMonth, setSpringMonth] = useState('3');
  const [springDay, setSpringDay] = useState('1');

  useEffect(() => {
    let cancelled = false;
    apiClient
      .getAcademicCalendar()
      .then((res) => {
        if (cancelled) return;
        setFallMonth(String(res.fallSemesterStartMonth));
        setFallDay(String(res.fallSemesterStartDay));
        setSpringMonth(String(res.springSemesterStartMonth));
        setSpringDay(String(res.springSemesterStartDay));
      })
      .catch(() => {
        if (!cancelled) setError(lang === 'he' ? 'טעינת לוח השנה נכשלה' : 'Failed to load the academic calendar');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load-on-mount only
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      await apiClient.updateAcademicCalendar({
        fallSemesterStartMonth: Number(fallMonth),
        fallSemesterStartDay: Number(fallDay),
        springSemesterStartMonth: Number(springMonth),
        springSemesterStartDay: Number(springDay),
      });
      setSaved(true);
      setTimeout(onClose, 900);
    } catch (err) {
      setError(err instanceof Error ? err.message : lang === 'he' ? 'עדכון לוח השנה נכשל' : 'Failed to update the academic calendar');
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
        className="w-full max-w-md rounded-[var(--radius)] bg-surface p-6 shadow-lg outline-none"
      >
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-semibold text-ink">📅 {lang === 'he' ? 'לוח שנה אקדמי' : 'Academic Calendar'}</h2>
          <button type="button" onClick={onClose} className="text-muted hover:text-ink">
            ✕
          </button>
        </div>

        {loading ? (
          <p className="mt-4 text-sm text-muted">…</p>
        ) : (
          <>
            <p className="mt-2 text-xs text-muted">
              {lang === 'he'
                ? 'סמסטר הקיץ קבוע (יולי–ספטמבר). התאריכים הבאים משמשים גם לחישוב מחיקת חשבון אוטומטית לסטודנטים שסיימו את משך הלימודים.'
                : "Summer semester is fixed (July-September). These dates also feed the automatic graduation-based account-deletion check."}
            </p>

            <p className="mt-4 text-sm font-medium text-ink">{lang === 'he' ? 'תחילת סמסטר סתיו' : 'Fall semester start'}</p>
            <div className="mt-1.5 flex gap-2.5">
              <input type="number" min={1} max={12} value={fallMonth} onChange={(e) => setFallMonth(e.target.value)} placeholder={lang === 'he' ? 'חודש (1-12)' : 'Month (1-12)'} className={inputCls} />
              <input type="number" min={1} max={31} value={fallDay} onChange={(e) => setFallDay(e.target.value)} placeholder={lang === 'he' ? 'יום' : 'Day'} className={inputCls} />
            </div>

            <p className="mt-4 text-sm font-medium text-ink">{lang === 'he' ? 'תחילת סמסטר אביב' : 'Spring semester start'}</p>
            <div className="mt-1.5 flex gap-2.5">
              <input type="number" min={1} max={12} value={springMonth} onChange={(e) => setSpringMonth(e.target.value)} placeholder={lang === 'he' ? 'חודש (1-12)' : 'Month (1-12)'} className={inputCls} />
              <input type="number" min={1} max={31} value={springDay} onChange={(e) => setSpringDay(e.target.value)} placeholder={lang === 'he' ? 'יום' : 'Day'} className={inputCls} />
            </div>

            {error && <p className="mt-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{error}</p>}
            {saved && <p className="mt-4 rounded-md bg-success-bg px-3 py-2 text-sm text-success" role="status">✅ {lang === 'he' ? 'לוח השנה עודכן' : 'Academic calendar updated'}</p>}

            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="mt-6 w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60"
            >
              {saving ? '…' : lang === 'he' ? 'שמור' : 'Save'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

const inputCls = 'w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-primary focus:bg-surface focus:outline-none';
