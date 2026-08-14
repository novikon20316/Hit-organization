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
import { majorsForFaculty, degreeLevelsForFaculty } from '@/lib/permissions';
import { HIT_FACULTIES, stripDegreePrefix } from '@/lib/faculties';

const INFO_FILE_ROLES: AppRole[] = ['system_admin', 'coordinator'];
const SELECTABLE_FACULTIES = VALID_FACULTY_IDS.filter((id) => id !== 'all');
// majorsForFaculty() already dedupes-by-slug and strips the degree prefix
// (see lib/permissions.ts) — reused here instead of a local re-implementation
// so a master's program sharing a slug with a bachelor's one (e.g. Computer
// Science) isn't silently shadowed.
const ALL_MAJORS = (() => {
  const seen = new Set<string>();
  const out: { slug: string; label: Record<'he' | 'en', string> }[] = [];
  for (const faculty of HIT_FACULTIES) {
    for (const m of majorsForFaculty(faculty.key)) {
      if (seen.has(m.slug)) continue;
      seen.add(m.slug);
      out.push(m);
    }
  }
  return out;
})();
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

interface FacultyContentItem {
  id: string;
  type: 'procedure' | 'announcement';
  titleHe: string;
  titleEn: string;
  bodyHe: string;
  bodyEn: string;
  facultyIds: string[];
  majors: string[];
  degreeTypes: string[];
  createdAt: string | null;
}

function scopeSummary(f: { facultyIds: string[]; majors: string[]; degreeTypes: string[] }, lang: 'he' | 'en'): string {
  const parts: string[] = [];
  if (f.facultyIds?.length) parts.push(f.facultyIds.map((id) => facultyLabel(id as FacultyId, lang)).join(', '));
  if (f.majors?.length) {
    parts.push(
      f.majors
        .map((slug) => stripDegreePrefix(ALL_MAJORS.find((m) => m.slug === slug)?.label[lang] ?? slug))
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

  // ── Faculty procedures / announcements — free-text companion to the file
  // uploads above (requirements doc section 15). Separate scope state from
  // the file-upload form so filling one form doesn't leak into the other.
  const [contentItems, setContentItems] = useState<FacultyContentItem[]>([]);
  const [contentType, setContentType] = useState<'procedure' | 'announcement'>('announcement');
  const [contentTitleHe, setContentTitleHe] = useState('');
  const [contentTitleEn, setContentTitleEn] = useState('');
  const [contentBodyHe, setContentBodyHe] = useState('');
  const [contentBodyEn, setContentBodyEn] = useState('');
  const [contentScopeFacultyIds, setContentScopeFacultyIds] = useState<string[]>([]);
  const [contentScopeMajors, setContentScopeMajors] = useState<string[]>([]);
  const [contentScopeDegreeTypes, setContentScopeDegreeTypes] = useState<string[]>([]);
  const [selectAllContent, setSelectAllContent] = useState(false);
  const [posting, setPosting] = useState(false);
  const [contentError, setContentError] = useState('');
  const [deletingContent, setDeletingContent] = useState<FacultyContentItem | null>(null);
  const [deletingContentBusy, setDeletingContentBusy] = useState(false);

  // Visibility scoping — each empty means unrestricted for that axis (the
  // file stays visible to everyone along that dimension). A student must
  // match ALL three non-empty axes to see the file; enforced server-side in
  // getInfoFiles, not just here. Leaving all three empty used to be the only
  // way to target "everyone" — now that must be an explicit choice (the
  // "Show to everyone" checkbox below), so an empty selection with the
  // checkbox unchecked is rejected at submit time instead of silently
  // meaning "all".
  const [scopeFacultyIds, setScopeFacultyIds] = useState<string[]>([]);
  const [scopeMajors, setScopeMajors] = useState<string[]>([]);
  const [scopeDegreeTypes, setScopeDegreeTypes] = useState<string[]>([]);
  const [selectAllFiles, setSelectAllFiles] = useState(false);

  // Cascades to just the selected faculties' majors once any are picked —
  // otherwise the full cross-faculty list, since a major on its own is a
  // valid (if unusual) restriction too.
  const availableMajorsFor = (facultyIds: string[]) => {
    if (facultyIds.length === 0) return ALL_MAJORS;
    const seen = new Set<string>();
    const out: typeof ALL_MAJORS = [];
    for (const facultyId of facultyIds) {
      for (const m of majorsForFaculty(facultyId)) {
        if (seen.has(m.slug)) continue;
        seen.add(m.slug);
        out.push(m);
      }
    }
    return out;
  };

  const availableMajors = useMemo(() => availableMajorsFor(scopeFacultyIds), [scopeFacultyIds]);
  const contentAvailableMajors = useMemo(() => availableMajorsFor(contentScopeFacultyIds), [contentScopeFacultyIds]);

  // Union (not intersection) across the selected faculties — facultyIds is an
  // OR within its own axis, so e.g. picking data_science (masters-only) and
  // electrical_engineering (both) together should still offer both degree
  // types (each faculty just contributes whichever of its own students match).
  // With only data_science selected, that union collapses to masters-only,
  // which is exactly what stops staff from picking bachelors for it.
  const availableDegreeTypesFor = (facultyIds: string[]): ('bachelors' | 'masters')[] => {
    if (facultyIds.length === 0) return ['bachelors', 'masters'];
    const set = new Set<'bachelors' | 'masters'>();
    facultyIds.forEach((f) => degreeLevelsForFaculty(f).forEach((l) => set.add(l)));
    return (['bachelors', 'masters'] as const).filter((l) => set.has(l));
  };
  const availableDegreeTypes = useMemo(() => availableDegreeTypesFor(scopeFacultyIds), [scopeFacultyIds]);
  const contentAvailableDegreeTypes = useMemo(() => availableDegreeTypesFor(contentScopeFacultyIds), [contentScopeFacultyIds]);

  const toggleIn = (list: string[], value: string, setList: (v: string[]) => void) => {
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  };

  // Shared by both the file-upload and content-composer scope pickers — drops
  // any selected major or degree type that no longer belongs to the (now
  // narrower) set of faculties, so the stored scope never silently
  // contradicts itself.
  const makeToggleFaculty = (
    facultyIds: string[], setFacultyIds: (v: string[]) => void,
    setMajors: (fn: (prev: string[]) => string[]) => void,
    setDegreeTypes: (fn: (prev: string[]) => string[]) => void,
  ) => (facultyId: string) => {
    const next = facultyIds.includes(facultyId) ? facultyIds.filter((v) => v !== facultyId) : [...facultyIds, facultyId];
    setFacultyIds(next);
    const validSlugs = new Set(
      next.length === 0 ? ALL_MAJORS.map((m) => m.slug) : next.flatMap((f) => majorsForFaculty(f).map((m) => m.slug))
    );
    setMajors((prev) => prev.filter((m) => validSlugs.has(m)));
    const validDegrees = new Set(availableDegreeTypesFor(next));
    setDegreeTypes((prev) => prev.filter((d) => validDegrees.has(d as 'bachelors' | 'masters')));
  };

  const toggleFaculty = makeToggleFaculty(scopeFacultyIds, setScopeFacultyIds, setScopeMajors, setScopeDegreeTypes);
  const toggleContentFaculty = makeToggleFaculty(contentScopeFacultyIds, setContentScopeFacultyIds, setContentScopeMajors, setContentScopeDegreeTypes);

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

  const fetchContent = useCallback(async () => {
    try {
      const res = await apiClient.getFacultyContent();
      setContentItems(res.items ?? []);
    } catch {
      setContentError(lang === 'he' ? 'טעינת התוכן נכשלה' : 'Failed to load content');
    }
  }, [lang]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; fetchContent's setState calls happen after its awaited network call resolves, not synchronously in this effect
    if (isAllowed) fetchContent();
  }, [isAllowed, fetchContent]);

  const handlePostContent = async () => {
    if (!contentTitleHe.trim() && !contentTitleEn.trim()) {
      setContentError(lang === 'he' ? 'יש להזין כותרת' : 'Please enter a title');
      return;
    }
    if (!contentBodyHe.trim() && !contentBodyEn.trim()) {
      setContentError(lang === 'he' ? 'יש להזין תוכן' : 'Please enter body text');
      return;
    }
    if (!selectAllContent && contentScopeFacultyIds.length === 0 && contentScopeMajors.length === 0 && contentScopeDegreeTypes.length === 0) {
      setContentError(
        lang === 'he'
          ? 'יש לבחור פקולטה, מגמה או תואר אחד לפחות — או לסמן "הצג לכולם"'
          : 'Select at least one faculty, major, or degree — or check "Show to everyone"'
      );
      return;
    }
    setPosting(true);
    setContentError('');
    try {
      await apiClient.createFacultyContent({
        type: contentType,
        titleHe: contentTitleHe.trim(),
        titleEn: contentTitleEn.trim(),
        bodyHe: contentBodyHe.trim(),
        bodyEn: contentBodyEn.trim(),
        facultyIds: selectAllContent ? [] : contentScopeFacultyIds,
        majors: selectAllContent ? [] : contentScopeMajors,
        degreeTypes: selectAllContent ? [] : contentScopeDegreeTypes,
      });
      setContentTitleHe('');
      setContentTitleEn('');
      setContentBodyHe('');
      setContentBodyEn('');
      setContentScopeFacultyIds([]);
      setContentScopeMajors([]);
      setContentScopeDegreeTypes([]);
      setSelectAllContent(false);
      await fetchContent();
    } catch (err) {
      setContentError(err instanceof Error ? err.message : lang === 'he' ? 'הפרסום נכשל' : 'Failed to post');
    } finally {
      setPosting(false);
    }
  };

  const handleDeleteContent = async () => {
    if (!deletingContent) return;
    setDeletingContentBusy(true);
    try {
      await apiClient.deleteFacultyContent(deletingContent.id);
      setContentItems((prev) => prev.filter((c) => c.id !== deletingContent.id));
      setDeletingContent(null);
    } catch {
      setContentError(lang === 'he' ? 'המחיקה נכשלה' : 'Delete failed');
    } finally {
      setDeletingContentBusy(false);
    }
  };

  const handleUpload = async () => {
    if (!pickedFile) {
      setError(lang === 'he' ? 'יש לבחור קובץ' : 'Please pick a file');
      return;
    }
    if (!titleHe.trim() && !titleEn.trim()) {
      setError(lang === 'he' ? 'יש להזין כותרת' : 'Please enter a title');
      return;
    }
    if (!selectAllFiles && scopeFacultyIds.length === 0 && scopeMajors.length === 0 && scopeDegreeTypes.length === 0) {
      setError(
        lang === 'he'
          ? 'יש לבחור פקולטה, מגמה או תואר אחד לפחות — או לסמן "הצג לכולם"'
          : 'Select at least one faculty, major, or degree — or check "Show to everyone"'
      );
      return;
    }
    setUploading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('file', pickedFile);
      formData.append('titleHe', titleHe.trim());
      formData.append('titleEn', titleEn.trim());
      formData.append('facultyIds', JSON.stringify(selectAllFiles ? [] : scopeFacultyIds));
      formData.append('majors', JSON.stringify(selectAllFiles ? [] : scopeMajors));
      formData.append('degreeTypes', JSON.stringify(selectAllFiles ? [] : scopeDegreeTypes));
      await apiClient.uploadInfoFile(formData);
      setTitleHe('');
      setTitleEn('');
      setPickedFile(null);
      setScopeFacultyIds([]);
      setScopeMajors([]);
      setScopeDegreeTypes([]);
      setSelectAllFiles(false);
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
              ? '🎯 חשיפה — בחר פקולטה, מגמה או תואר אחד לפחות, או סמן "הצג לכולם"'
              : '🎯 Visibility — select at least one faculty, major, or degree, or check "Show to everyone"'}
          </p>

          <label className="flex items-center gap-2 text-xs font-medium text-ink">
            <input
              type="checkbox"
              checked={selectAllFiles}
              onChange={(e) => {
                setSelectAllFiles(e.target.checked);
                if (e.target.checked) {
                  setScopeFacultyIds([]);
                  setScopeMajors([]);
                  setScopeDegreeTypes([]);
                }
              }}
            />
            {lang === 'he' ? '🌐 הצג לכולם (בחר הכל)' : '🌐 Show to everyone (select all)'}
          </label>

          <div className={selectAllFiles ? 'opacity-50' : undefined}>
            <span className="mb-1.5 block text-xs font-medium text-ink">{lang === 'he' ? 'פקולטה' : 'Faculty'}</span>
            <div className="flex flex-wrap gap-1.5">
              {SELECTABLE_FACULTIES.map((id) => (
                <button
                  key={id}
                  type="button"
                  disabled={selectAllFiles}
                  onClick={() => toggleFaculty(id)}
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed ${
                    scopeFacultyIds.includes(id) ? 'border-primary bg-primary text-primary-ink' : 'border-line bg-surface text-ink hover:border-primary'
                  }`}
                >
                  {facultyLabel(id, lang)}
                </button>
              ))}
            </div>
          </div>

          <div className={selectAllFiles ? 'opacity-50' : undefined}>
            <span className="mb-1.5 block text-xs font-medium text-ink">{lang === 'he' ? 'מגמה' : 'Major'}</span>
            <div className="flex flex-wrap gap-1.5">
              {availableMajors.map((m) => (
                <button
                  key={m.slug}
                  type="button"
                  disabled={selectAllFiles}
                  onClick={() => toggleIn(scopeMajors, m.slug, setScopeMajors)}
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed ${
                    scopeMajors.includes(m.slug) ? 'border-primary bg-primary text-primary-ink' : 'border-line bg-surface text-ink hover:border-primary'
                  }`}
                >
                  {stripDegreePrefix(m.label[lang])}
                </button>
              ))}
            </div>
          </div>

          <div className={selectAllFiles ? 'opacity-50' : undefined}>
            <span className="mb-1.5 block text-xs font-medium text-ink">{lang === 'he' ? 'תואר' : 'Degree'}</span>
            <div className="flex flex-wrap gap-1.5">
              {availableDegreeTypes.map((d) => (
                <button
                  key={d}
                  type="button"
                  disabled={selectAllFiles}
                  onClick={() => toggleIn(scopeDegreeTypes, d, setScopeDegreeTypes)}
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed ${
                    scopeDegreeTypes.includes(d) ? 'border-primary bg-primary text-primary-ink' : 'border-line bg-surface text-ink hover:border-primary'
                  }`}
                >
                  {d === 'bachelors' ? (lang === 'he' ? "תואר ראשון" : "Bachelor's") : (lang === 'he' ? 'תואר שני' : "Master's")}
                </button>
              ))}
            </div>
            {scopeFacultyIds.length > 0 && availableDegreeTypes.length === 1 && (
              <p className="mt-1 text-xs text-muted">
                {lang === 'he' ? 'הפקולטה/ות שנבחרו מציעות תואר אחד בלבד' : 'The selected faculty/ies only offer one degree level'}
              </p>
            )}
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

      {/* ── Faculty procedures / announcements ──────────────────────────── */}
      <div className="mb-6 mt-8 rounded-[var(--radius)] border border-line bg-surface p-5">
        <p className="mb-3 text-sm font-semibold text-ink">
          📢 {lang === 'he' ? 'נהלים והודעות שוטפות' : 'Procedures & Announcements'}
        </p>

        <div className="mb-3 flex gap-1.5">
          {(['announcement', 'procedure'] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setContentType(v)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                contentType === v ? 'border-primary bg-primary text-primary-ink' : 'border-line bg-paper text-ink hover:border-primary'
              }`}
            >
              {v === 'announcement' ? (lang === 'he' ? '📣 הודעה' : '📣 Announcement') : (lang === 'he' ? '📘 נוהל' : '📘 Procedure')}
            </button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink">{lang === 'he' ? 'כותרת בעברית' : 'Title (Hebrew)'}</span>
            <input dir="rtl" value={contentTitleHe} onChange={(e) => setContentTitleHe(e.target.value)} className={inputCls} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink">{lang === 'he' ? 'כותרת באנגלית' : 'Title (English)'}</span>
            <input dir="ltr" value={contentTitleEn} onChange={(e) => setContentTitleEn(e.target.value)} className={inputCls} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink">{lang === 'he' ? 'תוכן בעברית' : 'Body (Hebrew)'}</span>
            <textarea dir="rtl" rows={3} value={contentBodyHe} onChange={(e) => setContentBodyHe(e.target.value)} className={inputCls} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink">{lang === 'he' ? 'תוכן באנגלית' : 'Body (English)'}</span>
            <textarea dir="ltr" rows={3} value={contentBodyEn} onChange={(e) => setContentBodyEn(e.target.value)} className={inputCls} />
          </label>
        </div>

        <div className="mt-4 grid gap-3 rounded-lg border border-line bg-paper p-3">
          <p className="text-xs font-medium text-muted">
            {lang === 'he'
              ? '🎯 חשיפה — בחר פקולטה, מגמה או תואר אחד לפחות, או סמן "הצג לכולם"'
              : '🎯 Visibility — select at least one faculty, major, or degree, or check "Show to everyone"'}
          </p>
          <label className="flex items-center gap-2 text-xs font-medium text-ink">
            <input
              type="checkbox"
              checked={selectAllContent}
              onChange={(e) => {
                setSelectAllContent(e.target.checked);
                if (e.target.checked) {
                  setContentScopeFacultyIds([]);
                  setContentScopeMajors([]);
                  setContentScopeDegreeTypes([]);
                }
              }}
            />
            {lang === 'he' ? '🌐 הצג לכולם (בחר הכל)' : '🌐 Show to everyone (select all)'}
          </label>
          <div className={selectAllContent ? 'opacity-50' : undefined}>
            <span className="mb-1.5 block text-xs font-medium text-ink">{lang === 'he' ? 'פקולטה' : 'Faculty'}</span>
            <div className="flex flex-wrap gap-1.5">
              {SELECTABLE_FACULTIES.map((id) => (
                <button
                  key={id}
                  type="button"
                  disabled={selectAllContent}
                  onClick={() => toggleContentFaculty(id)}
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed ${
                    contentScopeFacultyIds.includes(id) ? 'border-primary bg-primary text-primary-ink' : 'border-line bg-surface text-ink hover:border-primary'
                  }`}
                >
                  {facultyLabel(id, lang)}
                </button>
              ))}
            </div>
          </div>
          <div className={selectAllContent ? 'opacity-50' : undefined}>
            <span className="mb-1.5 block text-xs font-medium text-ink">{lang === 'he' ? 'מגמה' : 'Major'}</span>
            <div className="flex flex-wrap gap-1.5">
              {contentAvailableMajors.map((m) => (
                <button
                  key={m.slug}
                  type="button"
                  disabled={selectAllContent}
                  onClick={() => toggleIn(contentScopeMajors, m.slug, setContentScopeMajors)}
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed ${
                    contentScopeMajors.includes(m.slug) ? 'border-primary bg-primary text-primary-ink' : 'border-line bg-surface text-ink hover:border-primary'
                  }`}
                >
                  {stripDegreePrefix(m.label[lang])}
                </button>
              ))}
            </div>
          </div>
          <div className={selectAllContent ? 'opacity-50' : undefined}>
            <span className="mb-1.5 block text-xs font-medium text-ink">{lang === 'he' ? 'תואר' : 'Degree'}</span>
            <div className="flex flex-wrap gap-1.5">
              {contentAvailableDegreeTypes.map((d) => (
                <button
                  key={d}
                  type="button"
                  disabled={selectAllContent}
                  onClick={() => toggleIn(contentScopeDegreeTypes, d, setContentScopeDegreeTypes)}
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed ${
                    contentScopeDegreeTypes.includes(d) ? 'border-primary bg-primary text-primary-ink' : 'border-line bg-surface text-ink hover:border-primary'
                  }`}
                >
                  {d === 'bachelors' ? (lang === 'he' ? "תואר ראשון" : "Bachelor's") : (lang === 'he' ? 'תואר שני' : "Master's")}
                </button>
              ))}
            </div>
            {contentScopeFacultyIds.length > 0 && contentAvailableDegreeTypes.length === 1 && (
              <p className="mt-1 text-xs text-muted">
                {lang === 'he' ? 'הפקולטה/ות שנבחרו מציעות תואר אחד בלבד' : 'The selected faculty/ies only offer one degree level'}
              </p>
            )}
          </div>
        </div>

        {contentError && <p className="mt-3 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{contentError}</p>}

        <button
          type="button"
          onClick={handlePostContent}
          disabled={posting}
          className="mt-3 w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60"
        >
          {posting ? '…' : lang === 'he' ? 'פרסם' : 'Post'}
        </button>
      </div>

      <p className="mb-2 text-sm font-semibold text-ink">{lang === 'he' ? 'נהלים והודעות שפורסמו' : 'Published procedures & announcements'}</p>

      {contentItems.length === 0 ? (
        <p className="text-sm text-muted">{lang === 'he' ? 'אין תוכן עדיין' : 'Nothing published yet'}</p>
      ) : (
        <div className="grid gap-2">
          {contentItems.map((c) => (
            <div key={c.id} className="rounded-[var(--radius)] border border-line bg-surface p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{c.type === 'announcement' ? '📣' : '📘'}</span>
                    <span className="truncate text-sm font-medium text-ink">{lang === 'he' ? c.titleHe || c.titleEn : c.titleEn || c.titleHe}</span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-xs text-muted">{lang === 'he' ? c.bodyHe || c.bodyEn : c.bodyEn || c.bodyHe}</p>
                </div>
                <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{scopeSummary(c, lang)}</span>
                <button type="button" onClick={() => setDeletingContent(c)} className="shrink-0 px-2 py-1 text-sm font-semibold text-danger hover:opacity-70">
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!deletingContent}
        title={lang === 'he' ? 'מחיקת תוכן' : 'Delete content'}
        message={
          deletingContent
            ? lang === 'he'
              ? `האם למחוק את "${deletingContent.titleHe || deletingContent.titleEn}"?`
              : `Delete "${deletingContent.titleEn || deletingContent.titleHe}"?`
            : ''
        }
        confirmLabel={lang === 'he' ? 'מחק' : 'Delete'}
        cancelLabel={t('cancel')}
        destructive
        busy={deletingContentBusy}
        onConfirm={handleDeleteContent}
        onCancel={() => setDeletingContent(null)}
      />
    </DashboardShell>
  );
}
