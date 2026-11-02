'use client';

// app/student/home/SeminarDetails.tsx
// What a student sees once their supervisor approves a seminar milestone
// (server/src/services/seminarScheduling.ts): the booked date, or that one is
// on its way, plus a way to write to the administrative coordinator if the
// date doesn't work — students have no chat with her.

import { useRef, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useModalA11y } from '@/hooks/useModalA11y';
import { apiClient } from '@/lib/apiClient';
import { SEMINAR_COLOR, formatSeminarDay } from '@/lib/seminar';
import type { Milestone } from './types';

export function SeminarDetails({ milestone: m }: { milestone: Milestone }) {
  const { lang } = useLanguage();
  const [contactOpen, setContactOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const slot = m.status === 'seminar_scheduled' ? m.seminarSchedule : null;
  const missed = (m.seminarAttempts ?? []).filter((a) => a.outcome === 'not_performed');

  return (
    <div className="mt-2 rounded-student border p-3" style={{ borderColor: `${SEMINAR_COLOR}55`, backgroundColor: `${SEMINAR_COLOR}0D` }}>
      <p className="text-xs font-semibold" style={{ color: SEMINAR_COLOR }}>🎤 {lang === 'he' ? 'מועד הסמינר' : 'Seminar date'}</p>
      {slot ? (
        <div className="mt-1 grid gap-0.5 text-xs text-student-on-surface">
          <span>📅 {formatSeminarDay(slot.date, lang)}</span>
          <span>🕐 {slot.time}</span>
          {slot.location && <span>🏫 {slot.location}</span>}
          {slot.note && <span className="text-student-on-surface-variant">{slot.note}</span>}
        </div>
      ) : (
        <p className="mt-1 text-xs text-student-on-surface-variant">
          {lang === 'he' ? 'המנחה אישר/ה. הרכזת האדמיניסטרטיבית תקבע מועד ותישלח אליך הודעה.' : 'Your supervisor approved. The administrative coordinator will set the date and notify you.'}
        </p>
      )}
      {missed.length > 0 && (
        <p className="mt-1 text-xs text-danger">
          {lang === 'he' ? 'לא בוצע במועד:' : 'Not performed on:'} {missed.map((a) => formatSeminarDay(a.date, lang, { day: 'numeric', month: 'numeric', year: '2-digit' })).join(', ')}
        </p>
      )}
      {sent ? (
        <p className="mt-2 text-xs font-medium text-success">✅ {lang === 'he' ? 'ההודעה נשלחה לרכזת' : 'Your message was sent to the coordinator'}</p>
      ) : (
        <button
          type="button"
          onClick={() => setContactOpen(true)}
          className="mt-2 rounded-student border border-student-outline-variant bg-student-surface-container-lowest px-3 py-1.5 text-xs font-semibold text-student-on-surface hover:border-student-primary"
        >
          ✉️ {lang === 'he' ? 'פנייה לרכזת האדמיניסטרטיבית' : 'Contact the administrative coordinator'}
        </button>
      )}
      {contactOpen && <SeminarContactModal milestoneId={m.id} onClose={() => setContactOpen(false)} onSent={() => { setContactOpen(false); setSent(true); }} />}
    </div>
  );
}

function SeminarContactModal({ milestoneId, onClose, onSent }: { milestoneId: string; onClose: () => void; onSent: () => void }) {
  const { lang } = useLanguage();
  const modalRef = useRef<HTMLDivElement>(null);
  useModalA11y(modalRef, true, onClose);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const send = async () => {
    if (!message.trim()) return;
    setSending(true);
    setError('');
    try {
      await apiClient.contactSeminarCoordinator(milestoneId, message.trim());
      onSent();
    } catch (err) {
      setError(err instanceof Error ? err.message : lang === 'he' ? 'שליחת ההודעה נכשלה' : 'Failed to send your message');
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center-safe justify-center overflow-y-auto bg-black/40 p-4">
      <div ref={modalRef} tabIndex={-1} role="dialog" aria-modal="true" className="w-full max-w-md rounded-student-lg bg-student-surface-container-lowest p-6 text-student-on-surface shadow-lg outline-none">
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-semibold">✉️ {lang === 'he' ? 'פנייה לרכזת האדמיניסטרטיבית' : 'Contact the administrative coordinator'}</h2>
          <button type="button" onClick={onClose} aria-label={lang === 'he' ? 'סגור' : 'Close'} className="text-student-on-surface-variant hover:text-student-on-surface">✕</button>
        </div>
        <p className="mt-2 text-xs text-student-on-surface-variant">
          {lang === 'he' ? 'למשל: המועד אינו מתאים, והצעה למועדים אחרים.' : "For example: the date doesn't work for you, and other dates that do."}
        </p>
        <textarea
          rows={4}
          maxLength={1000}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          aria-label={lang === 'he' ? 'הודעה' : 'Message'}
          className="mt-3 w-full rounded-student border border-student-outline-variant bg-student-surface-container-low px-3 py-2 text-sm focus:border-student-primary focus:outline-none"
        />
        {error && <p className="mt-2 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{error}</p>}
        <button
          type="button"
          disabled={sending || !message.trim()}
          onClick={send}
          className="mt-3 w-full rounded-student-lg bg-student-primary py-2.5 text-sm font-semibold text-student-on-primary hover:bg-student-primary-container disabled:opacity-40"
        >
          {sending ? '…' : lang === 'he' ? 'שליחה' : 'Send'}
        </button>
      </div>
    </div>
  );
}
