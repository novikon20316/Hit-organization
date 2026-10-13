'use client';

// app/notifications/StudentMessageComposer.tsx
// Second half of the administrative coordinator's "message selected
// students" flow: she ticks students on the Students Report
// (administrative_coordinator/dashboard/StudentsReportTab.tsx), clicks "Send
// message", and lands here (/notifications?compose=students) with that
// selection handed over via lib/studentMessageDraft.ts. She can drop anyone
// picked by mistake, write the message, and send it — the server
// (projectCoordinatorController.ts's sendStudentsMessage) fans it out over
// in-app + email + push + SMS + WhatsApp.

import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { clearStudentMessageRecipients, saveStudentMessageRecipients, type StudentMessageRecipient } from '@/lib/studentMessageDraft';

const MAX_TITLE = 150;
const MAX_MESSAGE = 2000;

export function StudentMessageComposer({
  initialRecipients,
  onDone,
  onSent,
}: {
  initialRecipients: StudentMessageRecipient[];
  /** Called when she closes the panel (after sending) or discards the draft. */
  onDone: () => void;
  /** Called right after a successful send — the page switches to its
   *  Messages tab, where the server has just written one chat per student. */
  onSent?: () => void;
}) {
  const { lang } = useLanguage();
  const [recipients, setRecipients] = useState(initialRecipients);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ sent: number; failed: number } | null>(null);

  const removeRecipient = (id: string) => {
    setRecipients((prev) => {
      const next = prev.filter((r) => r.id !== id);
      // Keep the stored draft in step, so a reload doesn't bring them back.
      saveStudentMessageRecipients(next);
      return next;
    });
  };

  const discard = () => {
    clearStudentMessageRecipients();
    onDone();
  };

  const canSend = recipients.length > 0 && title.trim().length > 0 && message.trim().length > 0 && !sending;

  const handleSend = async () => {
    setSending(true);
    setError('');
    try {
      const res = await apiClient.sendStudentsMessage({
        studentIds: recipients.map((r) => r.id),
        title: title.trim(),
        message: message.trim(),
      });
      clearStudentMessageRecipients();
      setResult({ sent: res.sent, failed: res.failed });
      setConfirming(false);
      onSent?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : lang === 'he' ? 'שליחת ההודעה נכשלה' : 'Failed to send the message');
      setConfirming(false);
    } finally {
      setSending(false);
    }
  };

  if (result) {
    return (
      <div className="mb-5 rounded-[var(--radius)] border border-success bg-success-bg p-4" role="status">
        <p className="text-sm font-semibold text-success">
          ✅ {lang === 'he' ? `ההודעה נשלחה ל־${result.sent} סטודנטים` : `Message sent to ${result.sent} student${result.sent === 1 ? '' : 's'}`}
        </p>
        {result.failed > 0 && (
          <p className="mt-1 text-xs text-danger">
            {lang === 'he' ? `שליחה ל־${result.failed} סטודנטים נכשלה.` : `Sending failed for ${result.failed} student${result.failed === 1 ? '' : 's'}.`}
          </p>
        )}
        <p className="mt-1 text-xs text-muted">
          {lang === 'he'
            ? 'ההודעה נשלחה באפליקציה, במייל, בהתראת פוש, ב־SMS ובוואטסאפ — לכל סטודנט/ית בערוצים הזמינים עבורו/ה.'
            : 'Sent in-app, by email, push, SMS and WhatsApp — over whichever of those each student can receive.'}
          {' '}
          {lang === 'he' ? 'עותק מופיע למטה בלשונית ההודעות, בשיחה נפרדת עם כל סטודנט/ית.' : 'A copy is below in the Messages tab, in a separate conversation with each student.'}
        </p>
        <button type="button" onClick={onDone} className="mt-3 text-sm font-medium text-primary hover:underline">
          {lang === 'he' ? 'סגירה' : 'Close'}
        </button>
      </div>
    );
  }

  return (
    <div className="mb-5 rounded-[var(--radius)] border border-primary bg-surface p-4">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-ink">✉️ {lang === 'he' ? 'הודעה לסטודנטים שנבחרו' : 'Message to selected students'}</p>
          <p className="mt-0.5 text-xs text-muted">
            {lang === 'he'
              ? 'תישלח באפליקציה, במייל, בהתראת פוש, ב־SMS ובוואטסאפ.'
              : 'Goes out in-app, by email, push, SMS and WhatsApp.'}
          </p>
        </div>
        <button type="button" onClick={discard} className="shrink-0 text-xs text-muted hover:text-danger">
          {lang === 'he' ? 'ביטול' : 'Discard'}
        </button>
      </div>

      <p className="mb-1.5 text-xs font-medium text-muted">
        {lang === 'he' ? `נמענים (${recipients.length})` : `Recipients (${recipients.length})`}
      </p>
      {recipients.length === 0 ? (
        <p className="mb-3 text-xs text-danger">
          {lang === 'he' ? 'לא נותרו נמענים — חזרו לדוח הסטודנטים כדי לבחור מחדש.' : 'No recipients left — go back to the Students Report to pick again.'}
        </p>
      ) : (
        <div className="mb-3 flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
          {recipients.map((r) => (
            <span key={r.id} className="flex items-center gap-1 rounded-full border border-line bg-paper py-0.5 ps-2.5 pe-1 text-xs text-ink">
              {r.name || '—'}
              <button
                type="button"
                onClick={() => removeRecipient(r.id)}
                aria-label={lang === 'he' ? `הסרת ${r.name}` : `Remove ${r.name}`}
                className="flex h-5 w-5 items-center justify-center rounded-full text-muted hover:bg-danger-bg hover:text-danger"
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}

      <label className="mb-1 block text-xs font-medium text-muted" htmlFor="student-msg-title">
        {lang === 'he' ? 'כותרת' : 'Title'}
      </label>
      <input
        id="student-msg-title"
        value={title}
        maxLength={MAX_TITLE}
        onChange={(e) => setTitle(e.target.value)}
        className="mb-3 w-full rounded-lg border border-line bg-surface px-3.5 py-2 text-sm text-ink focus:border-primary focus:outline-none"
      />
      <label className="mb-1 block text-xs font-medium text-muted" htmlFor="student-msg-body">
        {lang === 'he' ? 'תוכן ההודעה' : 'Message'}
      </label>
      <textarea
        id="student-msg-body"
        value={message}
        maxLength={MAX_MESSAGE}
        onChange={(e) => setMessage(e.target.value)}
        rows={5}
        className="w-full rounded-lg border border-line bg-surface px-3.5 py-2 text-sm text-ink focus:border-primary focus:outline-none"
      />
      <p className="mb-3 text-end text-[11px] text-muted">{message.length}/{MAX_MESSAGE}</p>

      {error && <p className="mb-3 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{error}</p>}

      <button
        type="button"
        onClick={() => setConfirming(true)}
        disabled={!canSend}
        className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-ink hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
      >
        📤 {lang === 'he' ? 'שליחה' : 'Send'}
      </button>

      <ConfirmDialog
        open={confirming}
        title={lang === 'he' ? 'שליחת הודעה' : 'Send message'}
        message={
          lang === 'he'
            ? `ההודעה תישלח ל־${recipients.length} סטודנטים במייל, באפליקציה, ב־SMS ובוואטסאפ. לא ניתן לבטל לאחר השליחה. להמשיך?`
            : `This will send the message to ${recipients.length} student${recipients.length === 1 ? '' : 's'} by email, in-app, SMS and WhatsApp. It can't be undone. Continue?`
        }
        confirmLabel={lang === 'he' ? 'שליחה' : 'Send'}
        cancelLabel={lang === 'he' ? 'ביטול' : 'Cancel'}
        busy={sending}
        onConfirm={handleSend}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}
