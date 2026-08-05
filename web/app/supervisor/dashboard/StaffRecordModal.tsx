'use client';

// app/supervisor/dashboard/StaffRecordModal.tsx
// An official supervisor-side record on a research_proposal/progress_report
// milestone, alongside (never replacing) the student's own submission — see
// workflowTemplates.ts's staffRecordMode. Either upload a completed file or
// fill the configured staffFormFields online; never both in one submission.

import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';

interface StaffFormField {
  key: string;
  labelHe: string;
  labelEn: string;
  type: 'text' | 'textarea' | 'date' | 'number' | 'table';
  required: boolean;
}

interface StaffRecordModalProps {
  milestoneId: string;
  fields: StaffFormField[];
  onClose: () => void;
  onSubmitted: () => void;
}

export function StaffRecordModal({ milestoneId, fields, onClose, onSubmitted }: StaffRecordModalProps) {
  const { lang, t } = useLanguage();
  const [mode, setMode] = useState<'upload' | 'form'>(fields.length > 0 ? 'form' : 'upload');
  const [file, setFile] = useState<File | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    setError('');
    if (mode === 'upload') {
      if (!file) {
        setError(lang === 'he' ? 'יש לבחור קובץ' : 'Choose a file');
        return;
      }
      setSubmitting(true);
      try {
        const formData = new FormData();
        formData.append('files', file);
        await apiClient.submitStaffRecordFile(milestoneId, formData);
        onSubmitted();
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : lang === 'he' ? 'ההעלאה נכשלה' : 'Upload failed');
      } finally {
        setSubmitting(false);
      }
      return;
    }

    const missing = fields.filter((f) => f.required && !values[f.key]?.trim());
    if (missing.length > 0) {
      setError(lang === 'he' ? 'יש למלא את כל שדות החובה' : 'Fill in every required field');
      return;
    }
    setSubmitting(true);
    try {
      await apiClient.submitStaffRecordForm(milestoneId, values);
      onSubmitted();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : lang === 'he' ? 'השליחה נכשלה' : 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  const inputCls = 'w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-primary focus:bg-surface focus:outline-none';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[var(--radius)] bg-surface p-6 shadow-lg">
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-semibold text-ink">{lang === 'he' ? 'רשומת מנחה' : 'Staff Record'}</h2>
          <button type="button" onClick={onClose} className="text-muted hover:text-ink">✕</button>
        </div>

        <div className="mt-4 flex gap-1.5">
          <button
            type="button"
            onClick={() => setMode('upload')}
            className={`flex-1 rounded-lg border px-3 py-1.5 text-xs font-medium ${mode === 'upload' ? 'border-primary bg-primary text-primary-ink' : 'border-line bg-paper text-ink'}`}
          >
            {lang === 'he' ? 'העלאת קובץ' : 'Upload a file'}
          </button>
          <button
            type="button"
            onClick={() => setMode('form')}
            disabled={fields.length === 0}
            className={`flex-1 rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-40 ${mode === 'form' ? 'border-primary bg-primary text-primary-ink' : 'border-line bg-paper text-ink'}`}
          >
            {lang === 'he' ? 'מילוי טופס' : 'Fill the form'}
          </button>
        </div>

        {mode === 'upload' ? (
          <label className="mt-4 block">
            <span className="mb-1.5 block text-sm font-medium text-ink">{lang === 'he' ? 'קובץ' : 'File'}</span>
            <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className={inputCls} />
          </label>
        ) : (
          <div className="mt-4 grid gap-3">
            {fields.map((f) => (
              <label key={f.key} className="block">
                <span className="mb-1.5 block text-sm font-medium text-ink">
                  {lang === 'he' ? f.labelHe : f.labelEn}{f.required ? ' *' : ''}
                </span>
                {f.type === 'textarea' ? (
                  <textarea rows={3} value={values[f.key] ?? ''} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} className={inputCls} />
                ) : (
                  <input
                    type={f.type === 'date' ? 'date' : f.type === 'number' ? 'number' : 'text'}
                    value={values[f.key] ?? ''}
                    onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                    className={inputCls}
                  />
                )}
              </label>
            ))}
            {fields.length === 0 && (
              <p className="text-xs text-muted">{lang === 'he' ? 'לא הוגדרו שדות לטופס זה.' : 'No fields configured for this form.'}</p>
            )}
          </div>
        )}

        {error && <p className="mt-3 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}

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
