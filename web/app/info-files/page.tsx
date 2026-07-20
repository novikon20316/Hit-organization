'use client';

// app/info-files/page.tsx
// Ported from mobile/app/Info-files.tsx — upload form + existing-files list
// with delete. The read side students see already exists at
// app/student/home/InfoScreen.tsx, calling the same GET /api/info-files.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { useRequireRole } from '@/hooks/useRequireRole';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { VALID_FACULTY_IDS, type AppRole } from '@/lib/roles';
import { facultyLabel, type FacultyId } from '@/lib/i18n';
import { majorsForFaculty } from '@/lib/permissions';
import { HIT_FACULTIES } from '@/lib/faculties';

const INFO_FILE_ROLES: AppRole[] = ['system_admin', 'coordinator'];
const SELECTABLE_FACULTIES = VALID_FACULTY_IDS.filter((id) => id !== 'all');
const ALL_MAJORS = (() => {
  const seen = new Set<string>();
  const out: { slug: string; label: Record<'he' | 'en', string> }[] = [];
  for (const faculty of HIT_FACULTIES) {
    for (const program of faculty.programs) {
      if (seen.has(program.slug)) continue;
      seen.add(program.slug);
      out.push({ slug: program.slug, label: program.label });
    }
  }
  return out;
})();
const DEGREE_TYPES = ['bachelors', 'masters'] as const;

interface InfoFile {
  id: string;
  titleHe: string;
  titleEn: string;
  fileUrl: string;
  fileName: string;
  facultyIds: string[];
  majors: string[];
  degreeTypes: string[];
}

function scopeSummary(f: InfoFile, lang: 'he' | 'en'): string {
  const parts: string[] = [];
  if (f.facultyIds?.length) parts.push(f.facultyIds.map((id) => facultyLabel(id as FacultyId, lang)).join(', '));
  if (f.majors?.length) {
    parts.push(
      f.majors
        .map((slug) => ALL_MAJORS.find((m) => m.slug === slug)?.label[lang] ?? slug)
        .join(', ')
    );
  }
  if (f.degreeTypes?.length) {
    parts.push(
      f.degreeTypes
        .map((d) => (d === 'bachelors' ? (lang === 'he' ? "תואר ראשון" : "Bachelor's") : (lang === 'he' ? 'תואר שני' : "Master's")))
        .join(', ')
    );
  }
  if (parts.length === 0) return lang === 'he' ? '🌐 כולם' : '🌐 Everyone';
  return `🎯 ${parts.join(' · ')}`;
}

export default function InfoFilesPage() {
  const { loading: guardLoading, isAllowed } = useRequireRole(INFO_FILE_ROLES);
  const { lang, t } = useLanguage();

  const [files, setFiles] = useState<InfoFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [titleHe, setTitleHe] = useState('');
  const [titleEn, setTitleEn] = useState('');
  const [pickedFile, setPickedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [deletingFile, setDeletingFile] = useState<InfoFile | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Visibility scoping — each empty means unrestricted for that axis (the
  // file stays visible to everyone along that dimension). A student must
  // match ALL three non-empty axes to see the file; enforced server-side in
  // getInfoFiles, not just here.
  const [scopeFacultyIds, setScopeFacultyIds] = useState<string[]>([]);
  const [scopeMajors, setScopeMajors] = useState<string[]>([]);
  const [scopeDegreeTypes, setScopeDegreeTypes] = useState<string[]>([]);

  // Cascades to just the selected faculties' majors once any are picked —
  // otherwise the full cross-faculty list, since a major on its own is a
  // valid (if unusual) restriction too.
  const availableMajors = useMemo(() => {
    if (scopeFacultyIds.length === 0) return ALL_MAJORS;
    const seen = new Set<string>();
    const out: typeof ALL_MAJORS = [];
    for (const facultyId of scopeFacultyIds) {
      for (const m of majorsForFaculty(facultyId)) {
        if (seen.has(m.slug)) continue;
        seen.add(m.slug);
        out.push(m);
      }
    }
    return out;
  }, [scopeFacultyIds]);

  const toggleIn = (list: string[], value: string, setList: (v: string[]) => void) => {
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  };

  const toggleFaculty = (facultyId: string) => {
    const next = scopeFacultyIds.includes(facultyId)
      ? scopeFacultyIds.filter((v) => v !== facultyId)
      : [...scopeFacultyIds, facultyId];
    setScopeFacultyIds(next);
    // Drop any selected major that no longer belongs to the (now narrower)
    // set of faculties, so the stored scope never silently contradicts itself.
    const validSlugs = new Set(
      next.length === 0 ? ALL_MAJORS.map((m) => m.slug) : next.flatMap((f) => majorsForFaculty(f).map((m) => m.slug))
    );
    setScopeMajors((prev) => prev.filter((m) => validSlugs.has(m)));
  };

  const fetchFiles = useCallback(async () => {
    try {
      const res = await apiClient.getInfoFiles();
      setFiles(res.files ?? []);
    } catch {
      setError(lang === 'he' ? 'טעינת הקבצים נכשלה' : 'Failed to load files');
    } finally {
      setLoading(false);
    }
  }, [lang]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; fetchFiles' setState calls happen after its awaited network call resolves, not synchronously in this effect
    if (isAllowed) fetchFiles();
  }, [isAllowed, fetchFiles]);

  const handleUpload = async () => {
    if (!pickedFile) {
      setError(lang === 'he' ? 'יש לבחור קובץ' : 'Please pick a file');
      return;
    }
    if (!titleHe.trim() && !titleEn.trim()) {
      setError(lang === 'he' ? 'יש להזין כותרת' : 'Please enter a title');
      return;
    }
    setUploading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('file', pickedFile);
      formData.append('titleHe', titleHe.trim());
      formData.append('titleEn', titleEn.trim());
      formData.append('facultyIds', JSON.stringify(scopeFacultyIds));
      formData.append('majors', JSON.stringify(scopeMajors));
      formData.append('degreeTypes', JSON.stringify(scopeDegreeTypes));
      await apiClient.uploadInfoFile(formData);
      setTitleHe('');
      setTitleEn('');
      setPickedFile(null);
      setScopeFacultyIds([]);
      setScopeMajors([]);
      setScopeDegreeTypes([]);
      await fetchFiles();
    } catch (err) {
      setError(err instanceof Error ? err.message : lang === 'he' ? 'העלאת הקובץ נכשלה' : 'Failed to upload file');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingFile) return;
    setDeleting(true);
    try {
      await apiClient.deleteInfoFile(deletingFile.id);
      setFiles((prev) => prev.filter((f) => f.id !== deletingFile.id));
      setDeletingFile(null);
    } catch {
      setError(lang === 'he' ? 'המחיקה נכשלה' : 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  if (guardLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper">
        <p className="text-sm text-muted">…</p>
      </div>
    );
  }

  const inputCls = 'w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-primary focus:bg-surface focus:outline-none';

  return (
    <DashboardShell title={lang === 'he' ? 'ניהול מסמכים לסטודנטים' : 'Manage Student Info Files'} subtitle={lang === 'he' ? 'מסמכים והסברים המוצגים לסטודנטים' : 'Documents and guidance shown to students'}>
      <div className="mb-6 rounded-[var(--radius)] border border-line bg-surface p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink">{lang === 'he' ? 'כותרת בעברית' : 'Title (Hebrew)'}</span>
            <input dir="rtl" value={titleHe} onChange={(e) => setTitleHe(e.target.value)} placeholder={lang === 'he' ? 'לדוגמה: מדריך לבחירת פרויקט' : 'e.g. Project selection guide'} className={inputCls} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink">{lang === 'he' ? 'כותרת באנגלית' : 'Title (English)'}</span>
            <input dir="ltr" value={titleEn} onChange={(e) => setTitleEn(e.target.value)} placeholder="e.g. Project selection guide" className={inputCls} />
          </label>
        </div>

        <label className="relative mt-3 block overflow-hidden rounded-lg border border-dashed border-line bg-paper px-3 py-2.5 text-center text-sm text-ink hover:border-primary">
          {pickedFile ? `✓ ${pickedFile.name}` : `📄 ${lang === 'he' ? 'בחר קובץ' : 'Pick a file'}`}
          <input
            type="file"
            accept="application/pdf,image/*,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={(e) => setPickedFile(e.target.files?.[0] ?? null)}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </label>

        <div className="mt-4 grid gap-3 rounded-lg border border-line bg-paper p-3">
          <p className="text-xs font-medium text-muted">
            {lang === 'he'
              ? '🎯 חשיפה (אופציונלי) — השאר ריק כדי להציג לכולם'
              : '🎯 Visibility (optional) — leave everything blank to show this to everyone'}
          </p>

          <div>
            <span className="mb-1.5 block text-xs font-medium text-ink">{lang === 'he' ? 'פקולטה' : 'Faculty'}</span>
            <div className="flex flex-wrap gap-1.5">
              {SELECTABLE_FACULTIES.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => toggleFaculty(id)}
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                    scopeFacultyIds.includes(id) ? 'border-primary bg-primary text-primary-ink' : 'border-line bg-surface text-ink hover:border-primary'
                  }`}
                >
                  {facultyLabel(id, lang)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="mb-1.5 block text-xs font-medium text-ink">{lang === 'he' ? 'מגמה' : 'Major'}</span>
            <div className="flex flex-wrap gap-1.5">
              {availableMajors.map((m) => (
                <button
                  key={m.slug}
                  type="button"
                  onClick={() => toggleIn(scopeMajors, m.slug, setScopeMajors)}
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                    scopeMajors.includes(m.slug) ? 'border-primary bg-primary text-primary-ink' : 'border-line bg-surface text-ink hover:border-primary'
                  }`}
                >
                  {m.label[lang]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="mb-1.5 block text-xs font-medium text-ink">{lang === 'he' ? 'תואר' : 'Degree'}</span>
            <div className="flex flex-wrap gap-1.5">
              {DEGREE_TYPES.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => toggleIn(scopeDegreeTypes, d, setScopeDegreeTypes)}
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                    scopeDegreeTypes.includes(d) ? 'border-primary bg-primary text-primary-ink' : 'border-line bg-surface text-ink hover:border-primary'
                  }`}
                >
                  {d === 'bachelors' ? (lang === 'he' ? "תואר ראשון" : "Bachelor's") : (lang === 'he' ? 'תואר שני' : "Master's")}
                </button>
              ))}
            </div>
          </div>
        </div>

        {error && <p className="mt-3 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}

        <button
          type="button"
          onClick={handleUpload}
          disabled={uploading}
          className="mt-3 w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60"
        >
          {uploading ? '…' : lang === 'he' ? 'העלה קובץ' : 'Upload file'}
        </button>
      </div>

      <p className="mb-2 text-sm font-semibold text-ink">{lang === 'he' ? 'קבצים שהועלו' : 'Uploaded files'}</p>

      {loading ? (
        <p className="text-sm text-muted">{t('loading')}</p>
      ) : files.length === 0 ? (
        <p className="text-sm text-muted">{lang === 'he' ? 'אין קבצים עדיין' : 'No files yet'}</p>
      ) : (
        <div className="grid gap-2">
          {files.map((f) => (
            <div key={f.id} className="flex items-center gap-3 rounded-[var(--radius)] border border-line bg-surface p-3">
              <a href={f.fileUrl} target="_blank" rel="noopener noreferrer" className="flex min-w-0 flex-1 items-center gap-2.5">
                <span className="text-lg">📄</span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-ink">{lang === 'he' ? f.titleHe || f.titleEn : f.titleEn || f.titleHe}</span>
                  <span className="block truncate text-xs text-muted">{f.fileName}</span>
                </span>
              </a>
              <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                {scopeSummary(f, lang)}
              </span>
              <button type="button" onClick={() => setDeletingFile(f)} className="shrink-0 px-2 py-1 text-sm font-semibold text-danger hover:opacity-70">
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!deletingFile}
        title={lang === 'he' ? 'מחיקת קובץ' : 'Delete file'}
        message={
          deletingFile
            ? lang === 'he'
              ? `האם למחוק את "${deletingFile.titleHe || deletingFile.titleEn}"?`
              : `Delete "${deletingFile.titleEn || deletingFile.titleHe}"?`
            : ''
        }
        confirmLabel={lang === 'he' ? 'מחק' : 'Delete'}
        cancelLabel={t('cancel')}
        destructive
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeletingFile(null)}
      />
    </DashboardShell>
  );
}
