'use client';

// app/student/home/SubmitMilestoneModal.tsx
import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient, ApiError } from '@/lib/apiClient';
import { MILESTONE_LABEL, type Milestone } from './types';

interface SubmitMilestoneModalProps {
  milestone: Milestone;
  projectId: string;
  onClose: () => void;
  onSubmitted: () => void;
}

export function SubmitMilestoneModal({ milestone, projectId, onClose, onSubmitted }: SubmitMilestoneModalProps) {
  const { lang, t } = useLanguage();
  const [files, setFiles] = useState<File[]>([]);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  // Absent (a milestone from before this feature existed) keeps today's
  // actual behavior — both fields shown, both optional — rather than being
  // treated the same as an explicit 'none', which instead hides both
  // entirely (see the empty-state message below).
  const requirement = milestone.submissionRequirement;
  const showFile = requirement !== 'comment' && requirement !== 'none';
  const showNote = requirement !== 'file' && requirement !== 'none';
  const hasFile = files.length > 0;
  const hasNote = note.trim().length > 0;
  const canSubmit =
    requirement === 'file' ? hasFile :
    requirement === 'comment' ? hasNote :
    requirement === 'both' ? hasFile && hasNote :
    true;

  // A file name that reaches the server intact (multer never rejects it —
  // there's no filename-length limit there, and Cloudinary never even sees
  // the original name, since the upload call doesn't pass use_filename) can
  // still break somewhere in the multipart request itself once it's long
  // enough — most commonly a Hebrew name, since Hebrew characters take 2
  // bytes each in UTF-8, so a name that "looks" short in characters can still
  // exceed the ~255-byte filename limit most filesystems/HTTP layers assume.
  // Caught here, before it's ever sent, with a clear message, instead of a
  // confusing generic "upload failed" once it's already attached.
  const MAX_FILENAME_BYTES = 150;
  const tooLongFileName = (name: string): boolean => {
    let bytes = 0;
    for (let i = 0; i < name.length; i++) {
      const code = name.codePointAt(i)!;
      if (code > 0xffff) i++; // surrogate pair — codePointAt already consumed both units
      bytes += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
      if (bytes > MAX_FILENAME_BYTES) return true;
    }
    return false;
  };

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const incoming = Array.from(list);
    const tooLong = incoming.filter((f) => tooLongFileName(f.name));
    const ok = incoming.filter((f) => !tooLongFileName(f.name));
    if (tooLong.length > 0) {
      setMessage({
        text: lang === 'he'
          ? `שם הקובץ ארוך מדי (מקסימום כ-${MAX_FILENAME_BYTES} תווים באנגלית, פחות בעברית): ${tooLong.map((f) => f.name).join(', ')}. נא לקצר את שם הקובץ ולנסות שוב.`
          : `File name too long (max ~${MAX_FILENAME_BYTES} characters): ${tooLong.map((f) => f.name).join(', ')}. Please shorten the file name and try again.`,
        ok: false,
      });
    }
    if (ok.length > 0) setFiles((prev) => [...prev, ...ok]);
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setMessage(null);
    try {
      const formData = new FormData();
      files.forEach((f) => formData.append('files', f));
      formData.append('note', note);
      formData.append('milestoneId', milestone.id);
      formData.append('projectId', projectId);
      await apiClient.submitMilestone(milestone.id, formData);
      setMessage({ text: `✅ ${lang === 'he' ? 'הוגש בהצלחה' : 'Submitted successfully'}`, ok: true });
      setTimeout(() => {
        onSubmitted();
        onClose();
      }, 1200);
    } catch (err) {
      // Prefer the server's per-language variant (see milestoneController.ts's
      // submitMilestone) when it sent one — the server has no per-user
      // language field to localize this itself, so it returns both and the
      // client (which knows the student's actual UI language) picks. Any
      // error without one (an unexpected exception the server never
      // localized) falls back to the translated generic message, NOT the
      // raw (often English-only, sometimes a bare third-party SDK string)
      // server text — showing that verbatim was the whole bug this is
      // fixing, not just for the two validation errors that got messageHe/
      // messageEn, but for anything else the server might ever throw.
      const body = err instanceof ApiError ? (err.body as { messageHe?: string; messageEn?: string } | null) : null;
      const localized = body?.[lang === 'he' ? 'messageHe' : 'messageEn'];
      const text = localized ?? (lang === 'he' ? 'שגיאה בהגשה' : 'Failed to submit');
      setMessage({ text, ok: false });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[var(--radius)] bg-surface p-6 shadow-lg">
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-semibold text-ink">
            {lang === 'he' ? 'הגשת' : 'Submit'} {MILESTONE_LABEL[milestone.type]?.[lang]}
          </h2>
          <button type="button" onClick={onClose} className="text-muted hover:text-ink">
            ✕
          </button>
        </div>

        {showFile && (
          <div className="mt-4">
            <span className="mb-1.5 block text-sm font-medium text-ink">
              {lang === 'he' ? 'קבצים' : 'Files'}
              {(requirement === 'file' || requirement === 'both') && <span className="text-danger"> *</span>}
            </span>
            <div className="grid gap-1.5">
              {files.map((f, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg border border-line bg-paper px-3 py-2 text-sm">
                  <span className="truncate text-ink">📎 {f.name}</span>
                  <button type="button" onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))} className="text-muted hover:text-danger">
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <label className="relative mt-1.5 block overflow-hidden rounded-lg border border-dashed border-line bg-paper px-3 py-2.5 text-center text-sm text-ink hover:border-primary">
              + {lang === 'he' ? 'הוסף קובץ' : 'Add File'}
              <input type="file" multiple onChange={(e) => addFiles(e.target.files)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
            </label>
          </div>
        )}

        {showNote && (
          <label className="mt-4 block">
            <span className="mb-1.5 block text-sm font-medium text-ink">
              {lang === 'he' ? 'הערה' : 'Note'}
              {(requirement === 'comment' || requirement === 'both') && <span className="text-danger"> *</span>}
            </span>
            <textarea
              rows={4}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-primary focus:bg-surface focus:outline-none"
            />
          </label>
        )}

        {!showFile && !showNote && (
          <p className="mt-4 text-sm text-muted">
            {lang === 'he' ? 'אבן דרך זו אינה דורשת קובץ או הערה — ניתן להגיש ישירות.' : 'This milestone requires no file or comment — you can submit directly.'}
          </p>
        )}

        {message && (
          <p className={`mt-4 rounded-md px-3 py-2 text-sm ${message.ok ? 'bg-success-bg text-success' : 'bg-danger-bg text-danger'}`}>{message.text}</p>
        )}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting || !canSubmit}
          className="mt-4 w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60"
        >
          {submitting ? '…' : t('submit')}
        </button>
      </div>
    </div>
  );
}
