'use client';

// app/student/home/BrowseProjects.tsx
// Ported from mobile/app/(tabs)/Browseprojects.tsx.

import { useMemo, useState, type ChangeEvent } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient, ApiError } from '@/lib/apiClient';
import { normalizePrerequisites, formatPrerequisite, meetsPrerequisite, type CompletedCourse } from '@/lib/prerequisites';
import { CompletedCoursesList } from './CompletedCoursesList';
import { ApplicationStatusCard } from './ApplicationStatusCard';
import type { ProjectProposal, DegreeType, PendingApplication } from './types';

interface BrowseProjectsProps {
  proposals: ProjectProposal[];
  studentDegree: DegreeType;
  pendingApplications: PendingApplication[];
  completedCourses?: CompletedCourse[];
  onApplicationsChanged: () => void;
}

type TypeFilter = 'all' | 'project' | 'thesis';
type EligibilityFilter = 'all' | 'eligible';

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

export function BrowseProjects({ proposals, studentDegree, pendingApplications, completedCourses = [], onApplicationsChanged }: BrowseProjectsProps) {
  const { lang, t } = useLanguage();
  const appliedProjectIds = useMemo(() => pendingApplications.map((a) => a.projectId), [pendingApplications]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [eligibilityFilter, setEligibilityFilter] = useState<EligibilityFilter>('all');
  const [selected, setSelected] = useState<ProjectProposal | null>(null);
  const [showApply, setShowApply] = useState(false);

  const [coverNote, setCoverNote] = useState('');
  const [transcriptFile, setTranscriptFile] = useState<File | null>(null);
  const [cvFile, setCvFile] = useState<File | null>(null);
  // URLs from the student's most recent application, offered as "reuse this
  // file" so a repeat applicant doesn't have to re-upload the same PDFs —
  // cleared (per-field) the moment they pick a replacement or hit Remove.
  const [lastTranscriptUrl, setLastTranscriptUrl] = useState('');
  const [lastCvUrl, setLastCvUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [applyMessage, setApplyMessage] = useState<{ text: string; ok: boolean } | null>(null);
  // The student's track choice for projects open to more than one project
  // type (project vs. thesis) — auto-filled with no UI step when the
  // project only offers one, same as today's single-select projects.
  const [selectedProjectType, setSelectedProjectType] = useState<'project' | 'thesis' | ''>('');

  // completedCourses carries a grade per course, entered by a system_admin
  // or AI-extracted from a transcript during application review — never
  // self-reported by the student (see CompletedCoursesList below). A
  // prerequisite with a minGrade is only met if the recorded grade meets
  // it, not just by having taken the course.
  const getMissingCourses = (p: ProjectProposal) => normalizePrerequisites(p.prerequisites).filter((pr) => !meetsPrerequisite(pr, completedCourses));

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return proposals.filter((p) => {
      const title = lang === 'he' ? p.titleHe : p.titleEn;
      const textOk =
        !q ||
        title?.toLowerCase().includes(q) ||
        p.supervisorName?.toLowerCase().includes(q) ||
        (p.requiredSkills ?? []).some((s) => s.toLowerCase().includes(q));
      // No degree filter here — `proposals` is already scoped to the
      // student's own degree by the query that fetched it (see
      // useStudentData.ts), so a filter offering "view the other degree
      // level's projects" would be actively misleading, not just redundant.
      // `?? [scalar]` keeps this correct against pre-migration projects that
      // only ever had the single scalar projectType field.
      const typeOk = typeFilter === 'all' || (p.projectTypes ?? [p.projectType]).includes(typeFilter);
      // Independent of the type filter above — "can apply" means the
      // student has already met every prerequisite and hasn't already applied.
      const eligibilityOk =
        eligibilityFilter === 'all' || (getMissingCourses(p).length === 0 && !appliedProjectIds.includes(p.id));
      return textOk && typeOk && eligibilityOk;
    });
  }, [proposals, search, typeFilter, eligibilityFilter, completedCourses, appliedProjectIds, lang]);

  const projectTypesOf = (p: ProjectProposal): ('project' | 'thesis')[] => p.projectTypes ?? (p.projectType ? [p.projectType] : []);

  const openApply = (p: ProjectProposal) => {
    setSelected(p);
    const types = projectTypesOf(p);
    setSelectedProjectType(types.length === 1 ? types[0]! : '');
    setShowApply(true);
    setApplyMessage(null);
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
      .catch(() => {
        // No previous application on file (or the lookup failed) — the
        // student just uploads fresh, same as before this feature existed.
      });
  };

  const closeApply = () => {
    setShowApply(false);
    setSelected(null);
    setCoverNote('');
    setTranscriptFile(null);
    setCvFile(null);
    setLastTranscriptUrl('');
    setLastCvUrl('');
    setApplyMessage(null);
    setSelectedProjectType('');
  };

  const handleApply = async () => {
    if (!selected || (!transcriptFile && !lastTranscriptUrl) || (!cvFile && !lastCvUrl)) {
      setApplyMessage({ text: lang === 'he' ? 'אנא העלה גיליון ציונים וקורות חיים' : 'Please upload transcript and CV', ok: false });
      return;
    }
    if (projectTypesOf(selected).length > 1 && !selectedProjectType) {
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
        projectId: selected.id,
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

  return (
    <div>
      <CompletedCoursesList completedCourses={completedCourses} />

      {pendingApplications.length > 0 && (
        <div className="mb-4">
          <p className="mb-2 text-sm font-semibold text-student-on-surface">
            {lang === 'he' ? 'הבקשות שלי' : 'My Applications'} ({pendingApplications.length})
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {pendingApplications.map((app) => (
              <ApplicationStatusCard key={app.id} application={app} onWithdrawn={onApplicationsChanged} />
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-8">
        {/* Filters sidebar */}
        <aside className="grid gap-4 lg:col-span-3">
          <div>
            <h2 className="text-lg font-semibold text-student-primary">
              {lang === 'he' ? 'גילוי פרויקטים' : 'Project Discovery'}
            </h2>
            <p className="mt-1 text-xs text-student-on-surface-variant">
              {lang === 'he' ? 'סננו הזדמנויות מחקר זמינות.' : 'Filter available research opportunities.'}
            </p>
            <p className="mt-2 text-xs text-student-on-surface-variant">
              {lang === 'he' ? 'מוצגים פרויקטים עבור: ' : 'Showing projects for: '}
              <span className="font-medium text-student-on-surface">{studentDegree === 'masters' ? t('masters') : t('bachelors')}</span>
            </p>
          </div>

          <div className="rounded-student-lg border border-student-outline-variant bg-student-surface-container-lowest p-4">
            <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-student-on-surface">
              {lang === 'he' ? 'חיפוש' : 'Search'}
            </h3>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={lang === 'he' ? 'חיפוש פרויקטים...' : 'Search projects...'}
              className="w-full rounded-student border border-student-outline-variant bg-student-surface px-3 py-2 text-sm text-student-on-surface focus:border-student-primary focus:outline-none"
            />
          </div>

          <div className="rounded-student-lg border border-student-outline-variant bg-student-surface-container-lowest p-4">
            <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-student-on-surface">
              {lang === 'he' ? 'סוג' : 'Type'}
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {(['all', 'project', 'thesis'] as TypeFilter[]).map((tp) => (
                <button
                  key={tp}
                  type="button"
                  onClick={() => setTypeFilter(tp)}
                  className={`rounded-student border px-3 py-1.5 text-xs font-medium transition-colors ${
                    typeFilter === tp
                      ? 'border-student-primary bg-student-primary text-student-on-primary'
                      : 'border-student-outline-variant bg-student-surface text-student-on-surface-variant hover:border-student-primary hover:text-student-primary'
                  }`}
                >
                  {tp === 'all' ? t('all') : tp === 'project' ? (lang === 'he' ? 'פרויקט' : 'Project') : lang === 'he' ? 'תזה' : 'Thesis'}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-student-lg border border-student-outline-variant bg-student-surface-container-lowest p-4">
            <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-student-on-surface">
              {lang === 'he' ? 'זכאות' : 'Eligibility'}
            </h3>
            <div className="grid gap-1.5">
              {(['all', 'eligible'] as EligibilityFilter[]).map((ef) => (
                <button
                  key={ef}
                  type="button"
                  onClick={() => setEligibilityFilter(ef)}
                  className={`rounded-student border px-3 py-1.5 text-start text-xs font-medium transition-colors ${
                    eligibilityFilter === ef
                      ? 'border-student-primary bg-student-primary text-student-on-primary'
                      : 'border-student-outline-variant bg-student-surface text-student-on-surface-variant hover:border-student-primary hover:text-student-primary'
                  }`}
                >
                  {ef === 'all'
                    ? lang === 'he'
                      ? 'כל הפרויקטים'
                      : 'All projects'
                    : lang === 'he'
                      ? 'פרויקטים שניתן להגיש להם'
                      : 'Projects you can apply to'}
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* Project grid */}
        <div className="lg:col-span-9">
          <p className="mb-3 text-xs font-medium text-student-on-surface-variant">
            {filtered.length} {lang === 'he' ? 'פרויקטים' : 'projects'}
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            {filtered.length === 0 && <p className="text-sm text-student-on-surface-variant">{lang === 'he' ? '📭 לא נמצאו פרויקטים' : '📭 No projects found'}</p>}
            {filtered.map((p) => {
              const isExpanded = expandedId === p.id;
              const missingCourses = getMissingCourses(p);
              const isQualified = missingCourses.length === 0;
              const alreadyApplied = appliedProjectIds.includes(p.id);
              const initials = (p.supervisorName || '??')
                .split(' ')
                .filter(Boolean)
                .slice(0, 2)
                .map((w) => w[0])
                .join('')
                .toUpperCase();
              return (
                <div
                  key={p.id}
                  className="flex flex-col rounded-student-lg border border-student-outline-variant bg-student-surface-container-lowest p-4 transition-shadow hover:shadow-[0_4px_6px_-1px_rgb(0,0,0,0.1)]"
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    {(p.degreeTypes ?? [p.degreeType]).map((d) => (
                      <span key={d} className="rounded-student bg-student-primary-fixed px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider text-student-primary">
                        {d === 'masters' ? t('masters') : t('bachelors')}
                      </span>
                    ))}
                    {projectTypesOf(p).map((tp) => (
                      <span key={tp} className="rounded-student bg-student-secondary-container px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider text-student-on-secondary-container">
                        {tp === 'project' ? (lang === 'he' ? 'פרויקט' : 'Project') : lang === 'he' ? 'תזה' : 'Thesis'}
                      </span>
                    ))}
                  </div>

                  <button type="button" onClick={() => setExpandedId(isExpanded ? null : p.id)} className="mt-2 w-full text-start">
                    <p className="text-sm font-semibold text-student-on-surface">{lang === 'he' ? p.titleHe : p.titleEn}</p>
                    <p className={`mt-1.5 text-xs text-student-on-surface-variant ${isExpanded ? '' : 'line-clamp-3'}`}>
                      {lang === 'he' ? p.descriptionHe : p.descriptionEn}
                    </p>
                    {p.requiredSkills?.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {p.requiredSkills.slice(0, 4).map((sk) => (
                          <span key={sk} className="rounded-student bg-student-surface-container-low px-2 py-0.5 text-xs text-student-on-surface-variant">
                            {sk}
                          </span>
                        ))}
                      </div>
                    )}
                  </button>

                  {isExpanded && (
                    <div className="mt-2 grid gap-1.5 border-t border-student-outline-variant pt-2.5">
                      {p.academicYear && (
                        <p className="text-xs text-student-on-surface-variant">
                          📅 {lang === 'he' ? 'שנה"ל:' : 'Academic year:'} {p.academicYear}
                        </p>
                      )}
                      <p className="text-xs text-student-on-surface-variant">
                        👥 {lang === 'he' ? 'מקסימום סטודנטים:' : 'Max students:'} {p.NumberOfStudents ?? 1}
                      </p>
                      {normalizePrerequisites(p.prerequisites).length > 0 && (
                        <p className="text-xs text-student-on-surface-variant">
                          📚 {lang === 'he' ? 'דרישות קדם:' : 'Prerequisites:'}{' '}
                          {normalizePrerequisites(p.prerequisites).map((pr) => formatPrerequisite(pr, lang)).join(', ')}
                        </p>
                      )}
                      {p.projectFileUrl && (
                        <a
                          href={p.projectFileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-student border border-student-outline-variant bg-student-surface-container-low px-3 py-2 text-xs font-medium text-student-on-surface hover:border-student-primary hover:text-student-primary"
                        >
                          📄 {lang === 'he' ? 'קובץ פרויקט' : 'Project File'}
                        </a>
                      )}
                      {!isQualified && (
                        <p className="text-xs text-danger">
                          {lang === 'he'
                            ? `אינך זכאי/ת לביצוע פרויקט/תזה זה. עליך ללמוד את: ${missingCourses.map((c) => formatPrerequisite(c, lang)).join(', ')}`
                            : `Not qualified for this project/thesis. You need to have studied: ${missingCourses.map((c) => formatPrerequisite(c, lang)).join(', ')}`}
                        </p>
                      )}
                    </div>
                  )}

                  <div className="mt-3 flex items-center justify-between gap-2 border-t border-student-surface-variant pt-3">
                    <div className="flex items-center">
                      <span className="me-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-student-secondary-container text-xs font-bold text-student-on-secondary-container">
                        {initials}
                      </span>
                      <div>
                        <p className="text-xs font-medium text-student-on-surface">{p.supervisorName || (lang === 'he' ? 'לא צוין' : 'Not specified')}</p>
                        <p className="text-[11px] text-student-on-surface-variant">{lang === 'he' ? 'מנחה' : 'Supervisor'}</p>
                      </div>
                    </div>
                    {alreadyApplied ? (
                      <span className="rounded-student bg-success-bg px-3 py-1.5 text-center text-xs font-semibold text-success">
                        {lang === 'he' ? '✓ בקשה נשלחה' : '✓ Sent Application'}
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={!isQualified}
                        onClick={() => openApply(p)}
                        className="rounded-student border border-student-primary px-3 py-1.5 text-xs font-semibold text-student-primary hover:bg-student-primary-fixed/40 disabled:opacity-40"
                      >
                        {lang === 'he' ? 'הגש מועמדות' : 'Apply'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {showApply && selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-student-lg border border-student-outline-variant bg-student-surface-container-lowest p-6 shadow-lg">
            <div className="flex items-start justify-between">
              <h2 className="text-lg font-semibold text-student-on-surface">{lang === 'he' ? 'הגשת מועמדות' : 'Apply to Project'}</h2>
              <button type="button" onClick={closeApply} className="text-student-on-surface-variant hover:text-student-on-surface">
                ✕
              </button>
            </div>
            <p className="mt-1 text-sm text-student-on-surface-variant">{lang === 'he' ? selected.titleHe : selected.titleEn}</p>

            {projectTypesOf(selected).length > 1 && (
              <div className="mt-4">
                <span className="mb-1.5 block text-sm font-medium text-student-on-surface">{lang === 'he' ? 'מסלול *' : 'Track *'}</span>
                <div className="flex gap-3">
                  {projectTypesOf(selected).map((tp) => (
                    <label key={tp} className="flex items-center gap-1.5 text-sm text-student-on-surface">
                      <input
                        type="radio"
                        name="applyProjectType"
                        checked={selectedProjectType === tp}
                        onChange={() => setSelectedProjectType(tp)}
                        className="h-4 w-4 accent-student-primary"
                      />
                      {tp === 'project' ? (lang === 'he' ? 'פרויקט' : 'Project') : lang === 'he' ? 'תזה' : 'Thesis'}
                    </label>
                  ))}
                </div>
              </div>
            )}

            <label className="mt-4 block">
              <span className="mb-1.5 block text-sm font-medium text-student-on-surface">{lang === 'he' ? 'הודעה למנחה (אופציונלי)' : 'Cover note (optional)'}</span>
              <textarea
                rows={4}
                value={coverNote}
                onChange={(e) => setCoverNote(e.target.value)}
                className="w-full rounded-student border border-student-outline-variant bg-student-surface-container-low px-3 py-2 text-sm text-student-on-surface focus:border-student-primary focus:bg-student-surface-container-lowest focus:outline-none"
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
                className={`mt-4 rounded-student px-3 py-2 text-sm ${applyMessage.ok ? 'bg-success-bg text-success' : 'bg-danger-bg text-danger'}`}
                role={applyMessage.ok ? 'status' : 'alert'}
              >
                {applyMessage.text}
              </p>
            )}

            <button
              type="button"
              onClick={handleApply}
              disabled={submitting}
              className="mt-4 w-full rounded-student bg-student-primary py-2.5 text-sm font-semibold text-student-on-primary hover:opacity-90 disabled:opacity-60"
            >
              {submitting ? '…' : t('submit')}
            </button>
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
      <span className="mb-1.5 block text-sm font-medium text-student-on-surface">{label}</span>
      <div className="relative flex items-center justify-between overflow-hidden rounded-student border border-dashed border-student-outline-variant bg-student-surface-container-low px-3 py-2.5 text-sm">
        <span className={file || reusing ? 'text-success' : 'text-student-on-surface-variant'}>
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
          <a href={reuseUrl} target="_blank" rel="noopener noreferrer" className="text-student-primary hover:underline">
            {lang === 'he' ? 'צפייה בקובץ' : 'View file'}
          </a>
          <span className="text-student-on-surface-variant">{lang === 'he' ? 'לחץ למעלה כדי להחליף' : 'Click above to replace it'}</span>
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
