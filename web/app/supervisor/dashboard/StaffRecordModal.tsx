'use client';

// app/supervisor/dashboard/StaffRecordModal.tsx
// An official supervisor-side record on a research_proposal/progress_report
// milestone, alongside (never replacing) the student's own submission — see
// workflowTemplates.ts's staffRecordMode. Either upload a completed file or
// fill the configured staffFormFields online; never both in one submission.

import { useRef, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import { useModalA11y } from '@/hooks/useModalA11y';

interface StaffFormField {
  key: string;
  labelHe: string;
  labelEn: string;
  type: 'text' | 'textarea' | 'date' | 'number' | 'table';
  required: boolean;
  /** Only meaningful when type === 'table' — the columns of each repeatable row. */
  tableColumns?: Array<{ key: string; labelHe: string; labelEn: string; type: 'text' | 'number' | 'date' }>;
}

function emptyTableRow(columns: NonNullable<StaffFormField['tableColumns']>): Record<string, string> {
  return Object.fromEntries(columns.map((c) => [c.key, '']));
}

interface StaffRecordModalProps {
  milestoneId: string;
  fields: StaffFormField[];
  onClose: () => void;
  onSubmitted: () => void;
}

export function StaffRecordModal({ milestoneId, fields, onClose, onSubmitted }: StaffRecordModalProps) {
  const { lang, t } = useLanguage();
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalA11y(dialogRef, true, onClose);
  const [mode, setMode] = useState<'upload' | 'form'>(fields.length > 0 ? 'form' : 'upload');
  const [file, setFile] = useState<File | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [tableValues, setTableValues] = useState<Record<string, Array<Record<string, string>>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const addTableRow = (field: StaffFormField) => {
    const columns = field.tableColumns ?? [];
    setTableValues((prev) => ({ ...prev, [field.key]: [...(prev[field.key] ?? []), emptyTableRow(columns)] }));
  };
  const removeTableRow = (fieldKey: string, rowIdx: number) => {
    setTableValues((prev) => ({ ...prev, [fieldKey]: (prev[fieldKey] ?? []).filter((_, i) => i !== rowIdx) }));
  };
  const updateTableCell = (fieldKey: string, rowIdx: number, columnKey: string, cellValue: string) => {
    setTableValues((prev) => ({
      ...prev,
      [fieldKey]: (prev[fieldKey] ?? []).map((row, i) => (i === rowIdx ? { ...row, [columnKey]: cellValue } : row)),
    }));
  };

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

    const missing = fields.filter((f) =>
      f.required && (f.type === 'table' ? (tableValues[f.key] ?? []).length === 0 : !values[f.key]?.trim())
    );
    if (missing.length > 0) {
      setError(lang === 'he' ? 'יש למלא את כל שדות החובה' : 'Fill in every required field');
      return;
    }
    setSubmitting(true);
    try {
      const formData: Record<string, unknown> = { ...values };
      for (const f of fields) {
        if (f.type === 'table') formData[f.key] = tableValues[f.key] ?? [];
      }
      await apiClient.submitStaffRecordForm(milestoneId, formData);
      onSubmitted();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : lang === 'he' ? 'השליחה נכשלה' : 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  const inputCls = 'w-full rounded-lg border border-supervisor-outline-variant bg-supervisor-surface-container-low px-3 py-2 text-sm text-supervisor-on-surface focus:border-supervisor-primary focus:bg-supervisor-surface-container-lowest focus:outline-none';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-supervisor bg-supervisor-surface-container-lowest p-6 shadow-lg outline-none"
      >
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-semibold text-supervisor-on-surface">{lang === 'he' ? 'רשומת מנחה' : 'Staff Record'}</h2>
          <button type="button" onClick={onClose} aria-label={lang === 'he' ? 'סגור' : 'Close'} className="text-supervisor-on-surface-variant hover:text-supervisor-on-surface">✕</button>
        </div>

        <div className="mt-4 flex gap-1.5">
          <button
            type="button"
            onClick={() => setMode('upload')}
            className={`flex-1 rounded-lg border px-3 py-1.5 text-xs font-medium ${mode === 'upload' ? 'border-supervisor-primary bg-supervisor-primary text-supervisor-on-primary' : 'border-supervisor-outline-variant bg-supervisor-surface-container-low text-supervisor-on-surface'}`}
          >
            {lang === 'he' ? 'העלאת קובץ' : 'Upload a file'}
          </button>
          <button
            type="button"
            onClick={() => setMode('form')}
            disabled={fields.length === 0}
            className={`flex-1 rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-40 ${mode === 'form' ? 'border-supervisor-primary bg-supervisor-primary text-supervisor-on-primary' : 'border-supervisor-outline-variant bg-supervisor-surface-container-low text-supervisor-on-surface'}`}
          >
            {lang === 'he' ? 'מילוי טופס' : 'Fill the form'}
          </button>
        </div>

        {mode === 'upload' ? (
          <label className="mt-4 block">
            <span className="mb-1.5 block text-sm font-medium text-supervisor-on-surface">{lang === 'he' ? 'קובץ' : 'File'}</span>
            <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className={inputCls} />
          </label>
        ) : (
          <div className="mt-4 grid gap-3">
            {fields.map((f) => (
              <div key={f.key} className="block">
                <span className="mb-1.5 block text-sm font-medium text-supervisor-on-surface">
                  {lang === 'he' ? f.labelHe : f.labelEn}{f.required ? ' *' : ''}
                </span>
                {f.type === 'table' ? (
                  <div className="rounded-lg border border-supervisor-outline-variant bg-supervisor-surface-container-low p-2.5">
                    <div className="grid gap-2">
                      {(tableValues[f.key] ?? []).map((row, rowIdx) => (
                        <div key={rowIdx} className="flex items-end gap-1.5 rounded-md border border-supervisor-outline-variant bg-supervisor-surface-container-lowest p-2">
                          <div className="grid flex-1 gap-1.5" style={{ gridTemplateColumns: `repeat(${(f.tableColumns ?? []).length}, minmax(0, 1fr))` }}>
                            {(f.tableColumns ?? []).map((col) => (
                              <label key={col.key} className="block">
                                <span className="mb-1 block text-[10px] text-supervisor-on-surface-variant">{lang === 'he' ? col.labelHe : col.labelEn}</span>
                                <input
                                  type={col.type === 'date' ? 'date' : col.type === 'number' ? 'number' : 'text'}
                                  value={row[col.key] ?? ''}
                                  onChange={(e) => updateTableCell(f.key, rowIdx, col.key, e.target.value)}
                                  className="w-full rounded-md border border-supervisor-outline-variant bg-supervisor-surface-container-low px-2 py-1 text-xs text-supervisor-on-surface"
                                />
                              </label>
                            ))}
                          </div>
                          <button type="button" onClick={() => removeTableRow(f.key, rowIdx)} className="shrink-0 px-1 text-sm" aria-label="remove row">
                            🗑️
                          </button>
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => addTableRow(f)}
                      className="mt-2 rounded-md bg-supervisor-primary px-2.5 py-1 text-xs font-semibold text-supervisor-on-primary hover:opacity-90"
                    >
                      ＋ {t('add')}
                    </button>
                  </div>
                ) : f.type === 'textarea' ? (
                  <textarea rows={3} value={values[f.key] ?? ''} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} className={inputCls} />
                ) : (
                  <input
                    type={f.type === 'date' ? 'date' : f.type === 'number' ? 'number' : 'text'}
                    value={values[f.key] ?? ''}
                    onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                    className={inputCls}
                  />
                )}
              </div>
            ))}
            {fields.length === 0 && (
              <p className="text-xs text-supervisor-on-surface-variant">{lang === 'he' ? 'לא הוגדרו שדות לטופס זה.' : 'No fields configured for this form.'}</p>
            )}
          </div>
        )}

        {error && <p className="mt-3 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{error}</p>}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="mt-4 w-full rounded-lg bg-supervisor-primary py-2.5 text-sm font-semibold text-supervisor-on-primary hover:opacity-90 disabled:opacity-60"
        >
          {submitting ? '…' : t('submit')}
        </button>
      </div>
    </div>
  );
}
