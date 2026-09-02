'use client';

// app/student/home/ProgressReportFormModal.tsx
//
// The student's own copy of Project_midterm.docx ("דו"ח ביניים" / progress
// report), digitized as an online form for the progress_report milestone —
// see server/src/scripts/addProgressReportStudentForm.ts (studentFormFields)
// and milestoneController.ts's submitMilestone (the formData submission
// branch). Rendered instead of SubmitMilestoneModal whenever this milestone
// is a progress_report with studentFormFields configured (currently
// data_science only) — see ActiveDashboard.tsx's dispatch.
//
// A sibling of ResearchProposalFormModal.tsx, not a branch inside it — same
// reasoning as that file's own precedent (DataScienceExaminerEvaluationForm.tsx):
// keeping them separate means neither form's paper-form-specific layout has
// to accommodate the other's fields. Two differences from the proposal form:
// 1. Per-student block here is name/ID/phone/email only — no photo/credits,
//    since Project_midterm.docx doesn't ask for them.
// 2. projectNameHe/projectNameEn are LOCKED here (read from project.titleHe/
//    titleEn — see addProgressReportStudentForm.ts's comment for why that's
//    always the coordinator-approved name by the time this milestone opens),
//    and an optional multi-file attachment section is included (the proposal
//    form has none) so the student can attach the report file itself plus
//    any supplementary documents.
import { useEffect, useRef, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient, ApiError } from '@/lib/apiClient';
import { useModalA11y } from '@/hooks/useModalA11y';
import { examinerSignatureStyle } from '@/lib/examinerSignature';
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
}

interface ProgressReportFormModalProps {
  milestone: Milestone;
  project: ActiveProject;
  onClose: () => void;
  onSubmitted: () => void;
}

// See SubmitMilestoneModal.tsx's identical helper — a Hebrew filename that
// "looks" short in characters can still exceed the multipart/HTTP layer's
// byte-based filename limit.
const MAX_FILENAME_BYTES = 150;
function tooLongFileName(name: string): boolean {
  let bytes = 0;
  for (let i = 0; i < name.length; i++) {
    const code = name.codePointAt(i)!;
    if (code > 0xffff) i++;
    bytes += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
    if (bytes > MAX_FILENAME_BYTES) return true;
  }
  return false;
}

export function ProgressReportFormModal({ milestone, project, onClose, onSubmitted }: ProgressReportFormModalProps) {
  const { lang, t } = useLanguage();
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalA11y(dialogRef, true, onClose);

  const fields = (milestone.studentFormFields ?? []) as StudentFormField[];
  const studentIds = milestone.studentIds?.length ? milestone.studentIds : [auth.currentUser?.uid ?? ''].filter(Boolean);

  const [teammates, setTeammates] = useState<TeammateProfile[] | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Pre-fill from a previous submission (resubmission after a rejection).
  useEffect(() => {
    if (!milestone.studentFormData) return;
    const nextValues: Record<string, string> = {};
    for (const f of fields) {
      const v = milestone.studentFormData[f.key];
      if (v !== undefined && v !== null) nextValues[f.key] = String(v);
    }
    setValues(nextValues);
    // Only ever needs to run once, when the modal first opens with existing data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const resolved = await Promise.all(studentIds.map(async (uid): Promise<TeammateProfile> => {
        const userSnap = await getDoc(doc(db, 'users', uid));
        const u = userSnap.data();
        return {
          uid,
          displayName: u?.displayName ?? '',
          studentId: u?.studentId ?? null,
          phoneNumber: u?.phoneNumber ?? null,
          email: u?.email ?? null,
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

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const incoming = Array.from(list);
    const tooLong = incoming.filter((f) => tooLongFileName(f.name));
    const ok = incoming.filter((f) => !tooLongFileName(f.name));
    if (tooLong.length > 0) {
      setError(lang === 'he'
        ? `שם הקובץ ארוך מדי: ${tooLong.map((f) => f.name).join(', ')}. נא לקצר את שם הקובץ ולנסות שוב.`
        : `File name too long: ${tooLong.map((f) => f.name).join(', ')}. Please shorten it and try again.`);
    }
    if (ok.length > 0) setFiles((prev) => [...prev, ...ok]);
  };

  // Resolves a locked/autoFill field's display value — never editable, never
  // sent back to the server as part of formData (the server derives these
  // itself; see submitMilestone's isStructuredFormMilestone branch, which
  // only validates non-locked fields).
  const resolveLockedValue = (f: StudentFormField): string => {
    if (f.autoFill === 'submissionDate') return new Date().toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US');
    if (f.autoFill === 'projectNameHe') return project.titleHe;
    if (f.autoFill === 'projectNameEn') return project.titleEn;
    return '';
  };

  const handleSubmit = async () => {
    setError('');
    const missing = fields.filter((f) => f.required && !f.locked && !values[f.key]?.trim());
    if (missing.length > 0) {
      setError(lang === 'he' ? 'יש למלא את כל שדות החובה' : 'Fill in every required field');
      return;
    }
    setSubmitting(true);
    try {
      const formData: Record<string, unknown> = {};
      for (const f of fields) {
        if (f.locked) continue;
        formData[f.key] = values[f.key] ?? '';
      }
      const body = new FormData();
      body.append('formData', JSON.stringify(formData));
      body.append('milestoneId', milestone.id);
      body.append('projectId', project.id);
      files.forEach((f) => body.append('files', f));
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
          <h2 className="text-lg font-semibold text-ink">{lang === 'he' ? 'דו"ח ביניים (דו"ח התקדמות)' : 'Progress Report'}</h2>
          <button type="button" onClick={onClose} aria-label={lang === 'he' ? 'סגור' : 'Close'} className="text-muted hover:text-ink">✕</button>
        </div>

        {/* Per-teammate personal-info blocks — auto-filled, read-only — plus
            each teammate's automatic digital signature (see
            lib/examinerSignature.ts; "signing" here just means the deterministic
            stylized rendering of their own name appears once they're part of
            this milestone's submission — nothing is drawn or uploaded). */}
        <div className="mt-4 grid gap-3">
          <span className="text-sm font-medium text-ink">{lang === 'he' ? 'פרטי הסטודנט/ית/ים' : "Student(s)' details"}</span>
          {!teammates ? (
            <p className="text-xs text-muted">{lang === 'he' ? 'טוען פרטי סטודנטים...' : 'Loading student details...'}</p>
          ) : (
            teammates.map((tm) => {
              const sig = examinerSignatureStyle(tm.displayName, project.facultyId ?? '', 'student', project.major ?? null);
              return (
                <div key={tm.uid} className="rounded-lg border border-line bg-paper p-3">
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                    <div><span className="text-muted">{lang === 'he' ? 'שם מלא: ' : 'Full name: '}</span>{tm.displayName || '—'}</div>
                    <div><span className="text-muted">{lang === 'he' ? 'ת.ז.: ' : 'ID: '}</span>{tm.studentId || '—'}</div>
                    <div><span className="text-muted">{lang === 'he' ? 'טלפון: ' : 'Phone: '}</span>{tm.phoneNumber || '—'}</div>
                    <div><span className="text-muted">{lang === 'he' ? 'דוא"ל: ' : 'Email: '}</span>{tm.email || '—'}</div>
                  </div>
                  <div className="mt-2 flex items-center gap-2 border-t border-line pt-2">
                    <span className="text-[10px] text-muted">{lang === 'he' ? 'חתימה: ' : 'Signature: '}</span>
                    <span style={{ color: sig.color, fontFamily: sig.fontFamily }} className="text-base">{tm.displayName}</span>
                  </div>
                </div>
              );
            })
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

        {/* Optional supporting documents — the report itself plus anything
            else the student needs to attach. */}
        <div className="mt-4">
          <span className="mb-1.5 block text-sm font-medium text-ink">{lang === 'he' ? 'קבצים מצורפים (אופציונלי)' : 'Attached files (optional)'}</span>
          <div className="grid gap-1.5">
            {files.map((f, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg border border-line bg-paper px-3 py-2 text-sm">
                <span className="truncate text-ink">📎 {f.name}</span>
                <button type="button" onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))} aria-label={`${lang === 'he' ? 'הסר קובץ' : 'Remove file'} ${f.name}`} className="text-muted hover:text-danger">✕</button>
              </div>
            ))}
          </div>
          <label className="relative mt-1.5 block overflow-hidden rounded-lg border border-dashed border-line bg-paper px-3 py-2.5 text-center text-sm text-ink hover:border-primary">
            + {lang === 'he' ? 'הוסף קובץ' : 'Add File'}
            <input type="file" multiple onChange={(e) => addFiles(e.target.files)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
          </label>
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
