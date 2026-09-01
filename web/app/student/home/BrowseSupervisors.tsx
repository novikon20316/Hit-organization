'use client';

// app/student/home/BrowseSupervisors.tsx
// Shown instead of BrowseProjects when the student's faculty+degree's
// approved workflow-template configured firstStepMode: 'choose_supervisor'
// (see useStudentData.ts, server's workflowTemplates.ts's
// resolveFirstStepMode). Supervisor-grouped view of the same eligible-project
// data BrowseProjects shows flat — the student still ends up applying to (or
// being enrolled in) one of the supervisor's existing projects, just
// discovered this way instead.

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient, ApiError } from '@/lib/apiClient';
import { ApplicationStatusCard } from './ApplicationStatusCard';
import { useModalA11y } from '@/hooks/useModalA11y';
import type { PendingApplication } from './types';

interface BrowseSupervisorProject {
  id: string;
  titleHe: string;
  titleEn: string;
  descriptionHe: string;
  descriptionEn: string;
  projectTypes: string[];
  major: string | null;
  remainingCapacity: number;
}

interface BrowseSupervisorEntry {
  supervisorId: string;
  supervisorName: string;
  projects: BrowseSupervisorProject[];
}

interface BrowseSupervisorsProps {
  pendingApplications: PendingApplication[];
  supervisorSelectionRequiresApproval: boolean;
  onApplicationsChanged: () => void;
}

const CLOUDINARY_UPLOAD_URL = 'https://api.cloudinary.com/v1_1/dp7stlfas/raw/upload';
const CLOUDINARY_UPLOAD_PRESET = 'student_uploads';

async function uploadToCloudinary(file: File): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
  const res = await fetch(CLOUDINARY_UPLOAD_URL, { method: 'POST', body: formData });
  const data = await res.json();
  if (!data.secure_url) throw new Error('Upload failed');
  return data.secure_url as string;
}

export function BrowseSupervisors({ pendingApplications, supervisorSelectionRequiresApproval, onApplicationsChanged }: BrowseSupervisorsProps) {
  const { lang, t } = useLanguage();
  const appliedProjectIds = useMemo(() => pendingApplications.map((a) => a.projectId), [pendingApplications]);

  const [supervisors, setSupervisors] = useState<BrowseSupervisorEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [expandedSupervisorId, setExpandedSupervisorId] = useState<string | null>(null);

  // Apply modal (approval-required path) — same shape as BrowseProjects.tsx's.
  const [applyTarget, setApplyTarget] = useState<{ supervisorId: string; project: BrowseSupervisorProject } | null>(null);
  const [coverNote, setCoverNote] = useState('');
  const [transcriptFile, setTranscriptFile] = useState<File | null>(null);
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [lastTranscriptUrl, setLastTranscriptUrl] = useState('');
  const [lastCvUrl, setLastCvUrl] = useState('');
  const [selectedProjectType, setSelectedProjectType] = useState<'project' | 'thesis' | ''>('');
  const [submitting, setSubmitting] = useState(false);
  const [applyMessage, setApplyMessage] = useState<{ text: string; ok: boolean } | null>(null);

  // Direct-join confirm (no-approval path).
  const [joinTarget, setJoinTarget] = useState<BrowseSupervisorProject | null>(null);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState('');

  const applyDialogRef = useRef<HTMLDivElement>(null);
  const joinDialogRef = useRef<HTMLDivElement>(null);

  const fetchSupervisors = () => {
    setLoading(true);
    setLoadError('');
    apiClient
      .getBrowseSupervisors()
      .then((res) => setSupervisors(res.supervisors ?? []))
      .catch(() => setLoadError(lang === 'he' ? 'טעינת המנחים נכשלה' : 'Failed to load supervisors'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchSupervisors();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch-on-mount only
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return supervisors;
    return supervisors
      .map((s) => ({
        ...s,
        projects: s.projects.filter(
          (p) =>
            s.supervisorName.toLowerCase().includes(q) ||
            (lang === 'he' ? p.titleHe : p.titleEn)?.toLowerCase().includes(q)
        ),
      }))
      .filter((s) => s.projects.length > 0 || s.supervisorName.toLowerCase().includes(q));
  }, [supervisors, search, lang]);

  const projectTypeLabel = (tp: string) => (tp === 'project' ? (lang === 'he' ? 'פרויקט' : 'Project') : lang === 'he' ? 'תזה' : 'Thesis');

  const openApply = (supervisorId: string, project: BrowseSupervisorProject) => {
    setApplyTarget({ supervisorId, project });
    setSelectedProjectType(project.projectTypes.length === 1 ? (project.projectTypes[0] as 'project' | 'thesis') : '');
    setApplyMessage(null);
    setCoverNote('');
    setTranscriptFile(null);
    setCvFile(null);
    setLastTranscriptUrl('');
    setLastCvUrl('');
    apiClient
      .getLastUploadedFiles()
      .then(({ transcriptUrl, cvUrl }) => {
        setLastTranscriptUrl(transcriptUrl);
        setLastCvUrl(cvUrl);
      })
      .catch(() => {});
  };

  const closeApply = () => {
    setApplyTarget(null);
    setApplyMessage(null);
  };

  useModalA11y(applyDialogRef, !!applyTarget, closeApply);
  useModalA11y(joinDialogRef, !!joinTarget, () => setJoinTarget(null));

  const handleApply = async () => {
    if (!applyTarget || (!transcriptFile && !lastTranscriptUrl) || (!cvFile && !lastCvUrl)) {
      setApplyMessage({ text: lang === 'he' ? 'אנא העלה גיליון ציונים וקורות חיים' : 'Please upload transcript and CV', ok: false });
      return;
    }
    if (applyTarget.project.projectTypes.length > 1 && !selectedProjectType) {
      setApplyMessage({ text: lang === 'he' ? 'פרויקט זה מציע יותר ממסלול אחד — יש לבחור מסלול' : 'This project offers more than one track — please choose one', ok: false });
      return;
    }
    setSubmitting(true);
    setApplyMessage(null);
    try {
      const [transcriptUrl, cvUrl] = await Promise.all([
        transcriptFile ? uploadToCloudinary(transcriptFile) : Promise.resolve(lastTranscriptUrl),
        cvFile ? uploadToCloudinary(cvFile) : Promise.resolve(lastCvUrl),
      ]);
      await apiClient.applyToProject({
        projectId: applyTarget.project.id,
        transcriptUrl,
        cvUrl,
        notes: coverNote,
        ...(selectedProjectType ? { selectedProjectType } : {}),
      });
      setApplyMessage({ text: `✅ ${lang === 'he' ? 'המועמדות הוגשה בהצלחה' : 'Application submitted successfully'}`, ok: true });
      onApplicationsChanged();
      setTimeout(closeApply, 1500);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setApplyMessage({ text: lang === 'he' ? '⚠️ כבר הגשת מועמדות לפרויקט זה' : '⚠️ You already applied to this project', ok: false });
      } else {
        setApplyMessage({ text: lang === 'he' ? 'שגיאה בהגשת המועמדות' : 'Failed to submit application', ok: false });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleJoinDirect = async () => {
    if (!joinTarget) return;
    setJoining(true);
    setJoinError('');
    try {
      await apiClient.joinProjectDirect(joinTarget.id);
      setJoinTarget(null);
      onApplicationsChanged();
    } catch (e) {
      setJoinError(e instanceof Error ? e.message : lang === 'he' ? 'ההצטרפות נכשלה' : 'Failed to join');
    } finally {
      setJoining(false);
    }
  };

  return (
    <div>
      {pendingApplications.length > 0 && (
        <div className="mb-4">
          <p className="mb-2 text-sm font-semibold text-ink">
            {lang === 'he' ? 'הבקשות שלי' : 'My Applications'} ({pendingApplications.length})
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {pendingApplications.map((app) => (
              <ApplicationStatusCard key={app.id} application={app} onWithdrawn={onApplicationsChanged} />
            ))}
          </div>
        </div>
      )}

      <p className="mb-2 text-xs text-muted">
        {lang === 'he'
          ? 'בחר/י מנחה כדי לראות את הפרויקטים/תזות הפתוחים שלו/שלה.'
          : 'Choose a supervisor to see their open projects/theses.'}
      </p>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={lang === 'he' ? 'חיפוש לפי שם מנחה או פרויקט...' : 'Search by supervisor or project name...'}
        className="w-full max-w-sm rounded-lg border border-line bg-surface px-3.5 py-2 text-sm text-ink focus:border-primary focus:outline-none"
      />

      {loading ? (
        <p className="mt-4 text-sm text-muted">{t('loading')}</p>
      ) : loadError ? (
        <p className="mt-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{loadError}</p>
      ) : (
        <>
          <p className="mt-3 text-xs text-muted">
            {filtered.length} {lang === 'he' ? 'מנחים' : 'supervisors'}
          </p>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            {filtered.length === 0 && <p className="text-sm text-muted">{lang === 'he' ? '📭 לא נמצאו מנחים' : '📭 No supervisors found'}</p>}
            {filtered.map((s) => {
              const isExpanded = expandedSupervisorId === s.supervisorId;
              return (
                <div key={s.supervisorId} className="rounded-[var(--radius)] border border-line bg-surface p-4">
                  <button
                    type="button"
                    onClick={() => setExpandedSupervisorId(isExpanded ? null : s.supervisorId)}
                    className="flex w-full items-center justify-between text-start"
                  >
                    <div>
                      <p className="text-sm font-semibold text-ink">👨‍🏫 {s.supervisorName}</p>
                      <p className="mt-1 text-xs text-muted">
                        {s.projects.length} {lang === 'he' ? 'פרויקטים/תזות פתוחים' : 'open projects/theses'}
                      </p>
                    </div>
                    <span className="text-xs text-muted">{isExpanded ? '▲' : '▼'}</span>
                  </button>

                  {isExpanded && (
                    <div className="mt-3 grid gap-2 border-t border-line pt-3">
                      {s.projects.map((p) => {
                        const alreadyApplied = appliedProjectIds.includes(p.id);
                        return (
                          <div key={p.id} className="rounded-lg border border-line bg-paper p-3">
                            <div className="flex flex-wrap items-center gap-1.5">
                              {p.projectTypes.map((tp) => (
                                <span key={tp} className="rounded-full bg-surface px-2 py-0.5 text-xs font-medium text-ink">
                                  {projectTypeLabel(tp)}
                                </span>
                              ))}
                            </div>
                            <p className="mt-1.5 text-sm font-medium text-ink">{lang === 'he' ? p.titleHe : p.titleEn}</p>
                            <p className="mt-1 text-xs text-muted">{lang === 'he' ? p.descriptionHe : p.descriptionEn}</p>
                            <p className="mt-1 text-xs text-muted">
                              👥 {lang === 'he' ? 'מקומות פנויים:' : 'Open seats:'} {p.remainingCapacity}
                            </p>

                            {alreadyApplied ? (
                              <span className="mt-2 inline-block rounded-lg bg-[#F59E0B] px-3 py-2 text-center text-xs font-semibold text-white">
                                {lang === 'he' ? '✓ בקשה נשלחה' : '✓ Sent Application'}
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() =>
                                  supervisorSelectionRequiresApproval
                                    ? openApply(s.supervisorId, p)
                                    : setJoinTarget(p)
                                }
                                className="mt-2 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-ink hover:bg-primary-hover"
                              >
                                {supervisorSelectionRequiresApproval
                                  ? lang === 'he' ? 'הגש מועמדות' : 'Apply'
                                  : lang === 'he' ? 'הצטרף/י' : 'Join'}
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {applyTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div
            ref={applyDialogRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[var(--radius)] bg-surface p-6 shadow-lg outline-none"
          >
            <div className="flex items-start justify-between">
              <h2 className="text-lg font-semibold text-ink">{lang === 'he' ? 'הגשת מועמדות' : 'Apply to Project'}</h2>
              <button type="button" onClick={closeApply} aria-label={lang === 'he' ? 'סגור' : 'Close'} className="text-muted hover:text-ink">
                ✕
              </button>
            </div>
            <p className="mt-1 text-sm text-muted">{lang === 'he' ? applyTarget.project.titleHe : applyTarget.project.titleEn}</p>

            {applyTarget.project.projectTypes.length > 1 && (
              <div className="mt-4">
                <span className="mb-1.5 block text-sm font-medium text-ink">{lang === 'he' ? 'מסלול *' : 'Track *'}</span>
                <div className="flex gap-3">
                  {applyTarget.project.projectTypes.map((tp) => (
                    <label key={tp} className="flex items-center gap-1.5 text-sm text-ink">
                      <input
                        type="radio"
                        name="applyProjectType"
                        checked={selectedProjectType === tp}
                        onChange={() => setSelectedProjectType(tp as 'project' | 'thesis')}
                        className="h-4 w-4"
                      />
                      {projectTypeLabel(tp)}
                    </label>
                  ))}
                </div>
              </div>
            )}

            <label className="mt-4 block">
              <span className="mb-1.5 block text-sm font-medium text-ink">{lang === 'he' ? 'הודעה למנחה (אופציונלי)' : 'Cover note (optional)'}</span>
              <textarea
                rows={4}
                value={coverNote}
                onChange={(e) => setCoverNote(e.target.value)}
                className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-primary focus:bg-surface focus:outline-none"
              />
            </label>

            <FileField
              label={`${lang === 'he' ? 'גיליון ציונים' : 'Transcript'} *`}
              file={transcriptFile}
              onChange={setTranscriptFile}
              lang={lang}
              reuseUrl={lastTranscriptUrl}
              onClearReuse={() => setLastTranscriptUrl('')}
            />
            <FileField
              label={`${lang === 'he' ? 'קורות חיים' : 'CV'} *`}
              file={cvFile}
              onChange={setCvFile}
              lang={lang}
              reuseUrl={lastCvUrl}
              onClearReuse={() => setLastCvUrl('')}
            />

            {applyMessage && (
              <p
                className={`mt-4 rounded-md px-3 py-2 text-sm ${applyMessage.ok ? 'bg-success-bg text-success' : 'bg-danger-bg text-danger'}`}
                role={applyMessage.ok ? 'status' : 'alert'}
              >
                {applyMessage.text}
              </p>
            )}

            <button
              type="button"
              onClick={handleApply}
              disabled={submitting}
              className="mt-4 w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60"
            >
              {submitting ? '…' : t('submit')}
            </button>
          </div>
        </div>
      )}

      {joinTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div
            ref={joinDialogRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            className="w-full max-w-sm rounded-[var(--radius)] bg-surface p-5 shadow-lg outline-none"
          >
            <h2 className="text-base font-semibold text-ink">{lang === 'he' ? 'הצטרפות לפרויקט' : 'Join Project'}</h2>
            <p className="mt-2 text-sm text-muted">
              {lang === 'he'
                ? `האם להצטרף ל"${joinTarget.titleHe}"? הצטרפות זו מיידית וללא צורך באישור.`
                : `Join "${joinTarget.titleEn}"? This enrolls you immediately, no approval needed.`}
            </p>
            {joinError && <p className="mt-3 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{joinError}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setJoinTarget(null)}
                disabled={joining}
                className="rounded-lg border border-line px-3.5 py-2 text-sm font-medium text-ink hover:bg-paper"
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                onClick={handleJoinDirect}
                disabled={joining}
                className="rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60"
              >
                {joining ? '…' : lang === 'he' ? 'הצטרף/י' : 'Join'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function isPdfFile(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

function FileField({
  label,
  file,
  onChange,
  lang,
  reuseUrl,
  onClearReuse,
}: {
  label: string;
  file: File | null;
  onChange: (f: File | null) => void;
  lang: 'he' | 'en';
  reuseUrl?: string;
  onClearReuse?: () => void;
}) {
  const [error, setError] = useState(false);
  const reusing = !file && !!reuseUrl;

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0] ?? null;
    if (picked && !isPdfFile(picked)) {
      setError(true);
      onChange(null);
      e.target.value = '';
      return;
    }
    setError(false);
    onChange(picked);
  };

  return (
    <label className="relative mt-4 block">
      <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>
      <div className="relative flex items-center justify-between overflow-hidden rounded-lg border border-dashed border-line bg-paper px-3 py-2.5 text-sm">
        <span className={file || reusing ? 'text-success' : 'text-muted'}>
          {file
            ? `✓ ${file.name}`
            : reusing
              ? `✓ ${lang === 'he' ? 'נעשה שימוש בקובץ שהגשת לאחרונה' : 'Using the file from your last application'}`
              : `📄 ${lang === 'he' ? 'לחץ להעלאה' : 'Tap to upload'}`}
        </span>
        <input
          type="file"
          accept="application/pdf"
          onChange={handleChange}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </div>
      {reusing && (
        <div className="mt-1 flex items-center gap-3 text-xs">
          <a href={reuseUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
            {lang === 'he' ? 'צפייה בקובץ' : 'View file'}
          </a>
          <span className="text-muted">{lang === 'he' ? 'לחץ למעלה כדי להחליף' : 'Click above to replace it'}</span>
          <button type="button" onClick={onClearReuse} className="text-danger hover:opacity-70">
            {lang === 'he' ? 'הסר' : 'Remove'}
          </button>
        </div>
      )}
      {error && (
        <p className="mt-1 text-xs text-danger" role="alert">{lang === 'he' ? 'ניתן להעלות קובצי PDF בלבד' : 'Only PDF files can be uploaded'}</p>
      )}
    </label>
  );
}
