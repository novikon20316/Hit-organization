'use client';

// app/student/home/ResearchProposalFormModal.tsx
//
// The student's own copy of Project_proposal.docx ("הצעה לפרויקט גמר"),
// digitized as an online form for the research_proposal milestone — see
// server/src/scripts/addResearchProposalStudentForm.ts (studentFormFields)
// and milestoneController.ts's submitMilestone (the formData submission
// branch). Rendered instead of SubmitMilestoneModal whenever
// milestone.studentFormFields is non-empty (currently data_science only).
//
// Per-student fields (name/ID/phone/email/photo/accumulated credits) are NOT
// part of studentFormFields — the paper form repeats that whole block once
// per team member, which doesn't fit a flat field list. This component
// resolves one such block per milestone.studentIds entry directly from each
// teammate's own profile; studentFormFields only covers what the team fills
// in TOGETHER, once (project name, abstract, Gantt, etc.).
import { useEffect, useRef, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient, ApiError } from '@/lib/apiClient';
import { useModalA11y } from '@/hooks/useModalA11y';
import type { Milestone, ActiveProject } from './types';

interface StudentFormField {
  key: string;
  labelHe: string;
  labelEn: string;
  type: 'text' | 'textarea' | 'date' | 'number' | 'table';
  required: boolean;
  tableColumns?: Array<{ key: string; labelHe: string; labelEn: string; type: 'text' | 'number' | 'date' }>;
  autoFill?: 'studentName' | 'studentIdNumber' | 'studentPhone' | 'studentEmail'
    | 'studentPhoto' | 'accumulatedCredits' | 'supervisorName' | 'submissionDate'
    | 'projectNameHe' | 'projectNameEn';
  locked?: boolean;
}

interface TeammateProfile {
  uid: string;
  displayName: string;
  studentId: string | null;
  phoneNumber: string | null;
  email: string | null;
  accumulatedCredits: number | null;
  photoUrl: string | null;
}

function emptyTableRow(columns: NonNullable<StudentFormField['tableColumns']>): Record<string, string> {
  return Object.fromEntries(columns.map((c) => [c.key, '']));
}

interface ResearchProposalFormModalProps {
  milestone: Milestone;
  project: ActiveProject;
  onClose: () => void;
  onSubmitted: () => void;
}

export function ResearchProposalFormModal({ milestone, project, onClose, onSubmitted }: ResearchProposalFormModalProps) {
  const { lang, t } = useLanguage();
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalA11y(dialogRef, true, onClose);

  const fields = (milestone.studentFormFields ?? []) as StudentFormField[];
  const studentIds = milestone.studentIds?.length ? milestone.studentIds : [auth.currentUser?.uid ?? ''].filter(Boolean);

  const [teammates, setTeammates] = useState<TeammateProfile[] | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [tableValues, setTableValues] = useState<Record<string, Array<Record<string, string>>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [error, setError] = useState('');

  // Pre-fill from a previous submission (resubmission after a rejection).
  useEffect(() => {
    if (!milestone.studentFormData) return;
    const nextValues: Record<string, string> = {};
    const nextTables: Record<string, Array<Record<string, string>>> = {};
    for (const f of fields) {
      const v = milestone.studentFormData[f.key];
      if (f.type === 'table') nextTables[f.key] = Array.isArray(v) ? v : [];
      else if (v !== undefined && v !== null) nextValues[f.key] = String(v);
    }
    setValues(nextValues);
    setTableValues(nextTables);
    // Only ever needs to run once, when the modal first opens with existing data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const resolved = await Promise.all(studentIds.map(async (uid): Promise<TeammateProfile> => {
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
    // studentIds is derived from milestone.studentIds each render but is
    // stable in content for a given milestone — re-keying on the milestone id
    // avoids an infinite refetch loop from a new array identity every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [milestone.id]);

  const handlePhotoUpload = async (uid: string, file: File) => {
    setUploadingPhoto(true);
    try {
      const { photoUrl } = await apiClient.uploadUserPhoto(file);
      setTeammates((prev) => prev?.map((tm) => (tm.uid === uid ? { ...tm, photoUrl } : tm)) ?? prev);
    } catch {
      setError(lang === 'he' ? 'העלאת התמונה נכשלה' : 'Photo upload failed');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const addTableRow = (field: StudentFormField) => {
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

  // Resolves a locked/autoFill field's display value — never editable, never
  // sent back to the server as part of formData (the server derives these
  // itself; see submitMilestone's isStructuredFormMilestone branch, which
  // only validates non-locked fields).
  const resolveLockedValue = (f: StudentFormField): string => {
    if (f.autoFill === 'submissionDate') return new Date().toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US');
    if (f.autoFill === 'supervisorName') return project.supervisorName;
    return '';
  };

  const handleSubmit = async () => {
    setError('');
    const missing = fields.filter((f) =>
      f.required && !f.locked && (f.type === 'table' ? (tableValues[f.key] ?? []).length === 0 : !values[f.key]?.trim())
    );
    if (missing.length > 0) {
      setError(lang === 'he' ? 'יש למלא את כל שדות החובה' : 'Fill in every required field');
      return;
    }
    setSubmitting(true);
    try {
      const formData: Record<string, unknown> = {};
      for (const f of fields) {
        if (f.locked) continue;
        formData[f.key] = f.type === 'table' ? (tableValues[f.key] ?? []) : (values[f.key] ?? '');
      }
      const body = new FormData();
      body.append('formData', JSON.stringify(formData));
      body.append('milestoneId', milestone.id);
      body.append('projectId', project.id);
      await apiClient.submitMilestone(milestone.id, body);
      onSubmitted();
      onClose();
    } catch (err) {
      const errBody = err instanceof ApiError ? (err.body as { messageHe?: string; messageEn?: string } | null) : null;
      const localized = errBody?.[lang === 'he' ? 'messageHe' : 'messageEn'];
      setError(localized ?? (err instanceof Error ? err.message : lang === 'he' ? 'השליחה נכשלה' : 'Submission failed'));
    } finally {
      setSubmitting(false);
    }
  };

  const inputCls = 'w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-primary focus:bg-surface focus:outline-none';
  const currentUid = auth.currentUser?.uid;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[var(--radius)] bg-surface p-6 shadow-lg outline-none"
      >
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-semibold text-ink">{lang === 'he' ? 'הצעה לפרויקט גמר' : 'Final Project Proposal'}</h2>
          <button type="button" onClick={onClose} aria-label={lang === 'he' ? 'סגור' : 'Close'} className="text-muted hover:text-ink">✕</button>
        </div>

        {/* Per-teammate personal-info blocks — auto-filled, read-only */}
        <div className="mt-4 grid gap-3">
          <span className="text-sm font-medium text-ink">{lang === 'he' ? 'פרטי הסטודנט/ית/ים' : "Student(s)' details"}</span>
          {!teammates ? (
            <p className="text-xs text-muted">{lang === 'he' ? 'טוען פרטי סטודנטים...' : 'Loading student details...'}</p>
          ) : (
            teammates.map((tm) => (
              <div key={tm.uid} className="flex gap-3 rounded-lg border border-line bg-paper p-3">
                <div className="flex shrink-0 flex-col items-center gap-1.5">
                  <div className="h-16 w-16 overflow-hidden rounded-full border border-line bg-surface">
                    {tm.photoUrl && <img src={tm.photoUrl} alt="" className="h-full w-full object-cover" />}
                  </div>
                  {tm.uid === currentUid && (
                    <label className="cursor-pointer text-[10px] text-primary hover:underline">
                      {uploadingPhoto ? '…' : lang === 'he' ? 'העלה תמונה' : 'Upload photo'}
                      <input
                        type="file"
                        accept="image/png,image/jpeg"
                        className="hidden"
                        onChange={(e) => e.target.files?.[0] && handlePhotoUpload(tm.uid, e.target.files[0])}
                      />
                    </label>
                  )}
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

        {/* Shared, editable form fields */}
        <div className="mt-4 grid gap-3">
          {fields.map((f) => (
            <div key={f.key} className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink">
                {lang === 'he' ? f.labelHe : f.labelEn}{f.required && !f.locked ? ' *' : ''}
              </span>
              {f.locked ? (
                <p className="rounded-lg border border-line bg-paper px-3 py-2 text-sm text-muted">{resolveLockedValue(f)}</p>
              ) : f.type === 'table' ? (
                <div className="rounded-lg border border-line bg-paper p-2.5">
                  <div className="grid gap-2">
                    {(tableValues[f.key] ?? []).map((row, rowIdx) => (
                      <div key={rowIdx} className="flex items-end gap-1.5 rounded-md border border-line bg-surface p-2">
                        <div className="grid flex-1 gap-1.5" style={{ gridTemplateColumns: `repeat(${(f.tableColumns ?? []).length}, minmax(0, 1fr))` }}>
                          {(f.tableColumns ?? []).map((col) => (
                            <label key={col.key} className="block">
                              <span className="mb-1 block text-[10px] text-muted">{lang === 'he' ? col.labelHe : col.labelEn}</span>
                              <input
                                type={col.type === 'date' ? 'date' : col.type === 'number' ? 'number' : 'text'}
                                value={row[col.key] ?? ''}
                                onChange={(e) => updateTableCell(f.key, rowIdx, col.key, e.target.value)}
                                className="w-full rounded-md border border-line bg-paper px-2 py-1 text-xs text-ink"
                              />
                            </label>
                          ))}
                        </div>
                        <button type="button" onClick={() => removeTableRow(f.key, rowIdx)} className="shrink-0 px-1 text-sm" aria-label="remove row">🗑️</button>
                      </div>
                    ))}
                  </div>
                  <button type="button" onClick={() => addTableRow(f)} className="mt-2 rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-primary-ink hover:bg-primary-hover">
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
        </div>

        {error && <p className="mt-3 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{error}</p>}

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
