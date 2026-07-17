'use client';

// app/student/home/SubmitMilestoneModal.tsx
import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
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

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    setFiles((prev) => [...prev, ...Array.from(list)]);
  };

  const handleSubmit = async () => {
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
    } catch {
      setMessage({ text: lang === 'he' ? 'שגיאה בהגשה' : 'Failed to submit', ok: false });
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

        <div className="mt-4">
          <span className="mb-1.5 block text-sm font-medium text-ink">{lang === 'he' ? 'קבצים' : 'Files'}</span>
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

        <label className="mt-4 block">
          <span className="mb-1.5 block text-sm font-medium text-ink">{lang === 'he' ? 'הערה' : 'Note'}</span>
          <textarea
            rows={4}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-primary focus:bg-surface focus:outline-none"
          />
        </label>

        {message && (
          <p className={`mt-4 rounded-md px-3 py-2 text-sm ${message.ok ? 'bg-success-bg text-success' : 'bg-danger-bg text-danger'}`}>{message.text}</p>
        )}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="mt-4 w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60"
        >
          {submitting ? '…' : t('submit')}
        </button>
      </div>
    </div>
  );
}
