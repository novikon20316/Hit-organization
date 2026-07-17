'use client';

// app/student/home/BrowseProjects.tsx
// Ported from mobile/app/(tabs)/Browseprojects.tsx.

import { useMemo, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient, ApiError } from '@/lib/apiClient';
import type { ProjectProposal, DegreeType } from './types';

interface BrowseProjectsProps {
  proposals: ProjectProposal[];
  studentDegree: DegreeType;
  appliedProjectIds: string[];
  completedCourses?: string[];
}

type DegreeFilter = 'all' | DegreeType;
type TypeFilter = 'all' | 'project' | 'thesis';

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

export function BrowseProjects({ proposals, studentDegree, appliedProjectIds, completedCourses = [] }: BrowseProjectsProps) {
  const { lang, t } = useLanguage();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [degreeFilter, setDegreeFilter] = useState<DegreeFilter>('all');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [selected, setSelected] = useState<ProjectProposal | null>(null);
  const [showApply, setShowApply] = useState(false);

  const [coverNote, setCoverNote] = useState('');
  const [transcriptFile, setTranscriptFile] = useState<File | null>(null);
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [applyMessage, setApplyMessage] = useState<{ text: string; ok: boolean } | null>(null);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return proposals.filter((p) => {
      const title = lang === 'he' ? p.titleHe : p.titleEn;
      const textOk =
        !q ||
        title?.toLowerCase().includes(q) ||
        p.supervisorName?.toLowerCase().includes(q) ||
        (p.requiredSkills ?? []).some((s) => s.toLowerCase().includes(q));
      const degreeOk = degreeFilter === 'all' || p.degreeType === degreeFilter;
      const typeOk = typeFilter === 'all' || p.projectType === typeFilter;
      return textOk && degreeOk && typeOk;
    });
  }, [proposals, search, degreeFilter, typeFilter, lang]);

  const getMissingCourses = (p: ProjectProposal): string[] => (p.prerequisites ?? []).filter((c) => !completedCourses.includes(c));

  const openApply = (p: ProjectProposal) => {
    setSelected(p);
    setShowApply(true);
    setApplyMessage(null);
  };

  const closeApply = () => {
    setShowApply(false);
    setSelected(null);
    setCoverNote('');
    setTranscriptFile(null);
    setCvFile(null);
    setApplyMessage(null);
  };

  const handleApply = async () => {
    if (!selected || !transcriptFile || !cvFile) {
      setApplyMessage({ text: lang === 'he' ? 'אנא העלה גיליון ציונים וקורות חיים' : 'Please upload transcript and CV', ok: false });
      return;
    }
    setSubmitting(true);
    setApplyMessage(null);
    try {
      const [transcriptUrl, cvUrl] = await Promise.all([uploadToCloudinary(transcriptFile), uploadToCloudinary(cvFile)]);
      await apiClient.applyToProject({ projectId: selected.id, transcriptUrl, cvUrl, notes: coverNote });
      setApplyMessage({ text: `✅ ${lang === 'he' ? 'המועמדות הוגשה בהצלחה' : 'Application submitted successfully'}`, ok: true });
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={lang === 'he' ? 'חיפוש פרויקטים...' : 'Search projects...'}
          className="w-full max-w-sm rounded-lg border border-line bg-surface px-3.5 py-2 text-sm text-ink focus:border-primary focus:outline-none"
        />
        <div className="flex gap-1.5">
          {(['all', 'project', 'thesis'] as TypeFilter[]).map((tp) => (
            <button
              key={tp}
              type="button"
              onClick={() => setTypeFilter(tp)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                typeFilter === tp ? 'border-primary bg-primary text-primary-ink' : 'border-line bg-surface text-ink'
              }`}
            >
              {tp === 'all' ? t('all') : tp === 'project' ? (lang === 'he' ? 'פרויקט' : 'Project') : lang === 'he' ? 'תזה' : 'Thesis'}
            </button>
          ))}
          {studentDegree === 'masters' && (
            <>
              {(['all', 'bachelors', 'masters'] as DegreeFilter[]).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDegreeFilter(d)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                    degreeFilter === d ? 'border-primary bg-primary text-primary-ink' : 'border-line bg-surface text-ink'
                  }`}
                >
                  {d === 'all' ? t('all') : d === 'bachelors' ? t('bachelors') : t('masters')}
                </button>
              ))}
            </>
          )}
        </div>
      </div>

      <p className="mt-3 text-xs text-muted">
        {filtered.length} {lang === 'he' ? 'פרויקטים' : 'projects'}
      </p>

      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        {filtered.length === 0 && <p className="text-sm text-muted">{lang === 'he' ? '📭 לא נמצאו פרויקטים' : '📭 No projects found'}</p>}
        {filtered.map((p) => {
          const isExpanded = expandedId === p.id;
          const missingCourses = getMissingCourses(p);
          const isQualified = missingCourses.length === 0;
          const alreadyApplied = appliedProjectIds.includes(p.id);
          return (
            <div key={p.id} className="rounded-[var(--radius)] border border-line bg-surface p-4">
              <button type="button" onClick={() => setExpandedId(isExpanded ? null : p.id)} className="w-full text-start">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="rounded-full bg-paper px-2 py-0.5 text-xs font-medium text-ink">
                    {p.degreeType === 'masters' ? t('masters') : t('bachelors')}
                  </span>
                  <span className="rounded-full bg-paper px-2 py-0.5 text-xs font-medium text-ink">
                    {p.projectType === 'project' ? (lang === 'he' ? 'פרויקט' : 'Project') : lang === 'he' ? 'תזה' : 'Thesis'}
                  </span>
                </div>
                <p className="mt-2 text-sm font-semibold text-ink">{lang === 'he' ? p.titleHe : p.titleEn}</p>
                <p className="mt-1 text-xs text-muted">
                  👨‍🏫 {p.supervisorName || (lang === 'he' ? 'לא צוין' : 'Not specified')}
                </p>
                {p.requiredSkills?.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {p.requiredSkills.slice(0, 4).map((sk) => (
                      <span key={sk} className="rounded-full bg-paper px-2 py-0.5 text-xs text-muted">
                        {sk}
                      </span>
                    ))}
                  </div>
                )}
              </button>

              {isExpanded && (
                <div className="mt-3 grid gap-2 border-t border-line pt-3">
                  <p className="text-xs text-muted">{lang === 'he' ? p.descriptionHe : p.descriptionEn}</p>
                  {p.academicYear && (
                    <p className="text-xs text-muted">
                      📅 {lang === 'he' ? 'שנה"ל:' : 'Academic year:'} {p.academicYear}
                    </p>
                  )}
                  <p className="text-xs text-muted">
                    👥 {lang === 'he' ? 'מקסימום סטודנטים:' : 'Max students:'} {p.NumberOfStudents ?? 1}
                  </p>
                  {p.projectFileUrl && (
                    <a
                      href={p.projectFileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg border border-line bg-paper px-3 py-2 text-xs font-medium text-ink hover:border-primary hover:text-primary"
                    >
                      📄 {lang === 'he' ? 'קובץ פרויקט' : 'Project File'}
                    </a>
                  )}

                  {alreadyApplied ? (
                    <span className="rounded-lg bg-paper px-3 py-2 text-center text-xs font-medium text-muted">
                      {lang === 'he' ? '✓ כבר הגשת מועמדות' : '✓ Already Applied'}
                    </span>
                  ) : (
                    <>
                      <button
                        type="button"
                        disabled={!isQualified}
                        onClick={() => openApply(p)}
                        className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-40"
                      >
                        {lang === 'he' ? 'הגש מועמדות' : 'Apply'}
                      </button>
                      {!isQualified && (
                        <p className="text-xs text-danger">
                          {lang === 'he'
                            ? `אינך זכאי/ת לביצוע פרויקט/תזה זה. עליך ללמוד את: ${missingCourses.join(', ')}`
                            : `Not qualified for this project/thesis. You need to have studied: ${missingCourses.join(', ')}`}
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {showApply && selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[var(--radius)] bg-surface p-6 shadow-lg">
            <div className="flex items-start justify-between">
              <h2 className="text-lg font-semibold text-ink">{lang === 'he' ? 'הגשת מועמדות' : 'Apply to Project'}</h2>
              <button type="button" onClick={closeApply} className="text-muted hover:text-ink">
                ✕
              </button>
            </div>
            <p className="mt-1 text-sm text-muted">{lang === 'he' ? selected.titleHe : selected.titleEn}</p>

            <label className="mt-4 block">
              <span className="mb-1.5 block text-sm font-medium text-ink">{lang === 'he' ? 'הודעה למנחה (אופציונלי)' : 'Cover note (optional)'}</span>
              <textarea
                rows={4}
                value={coverNote}
                onChange={(e) => setCoverNote(e.target.value)}
                className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-primary focus:bg-surface focus:outline-none"
              />
            </label>

            <FileField label={`${lang === 'he' ? 'גיליון ציונים' : 'Transcript'} *`} file={transcriptFile} onChange={setTranscriptFile} lang={lang} />
            <FileField label={`${lang === 'he' ? 'קורות חיים' : 'CV'} *`} file={cvFile} onChange={setCvFile} lang={lang} />

            {applyMessage && (
              <p className={`mt-4 rounded-md px-3 py-2 text-sm ${applyMessage.ok ? 'bg-success-bg text-success' : 'bg-danger-bg text-danger'}`}>
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
    </div>
  );
}

function FileField({ label, file, onChange, lang }: { label: string; file: File | null; onChange: (f: File | null) => void; lang: 'he' | 'en' }) {
  return (
    <label className="relative mt-4 block">
      <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>
      <div className="relative flex items-center justify-between overflow-hidden rounded-lg border border-dashed border-line bg-paper px-3 py-2.5 text-sm">
        <span className={file ? 'text-success' : 'text-muted'}>{file ? `✓ ${file.name}` : `📄 ${lang === 'he' ? 'לחץ להעלאה' : 'Tap to upload'}`}</span>
        <input
          type="file"
          accept="application/pdf"
          onChange={(e) => onChange(e.target.files?.[0] ?? null)}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </div>
    </label>
  );
}
