'use client';

// app/info-files/page.tsx
// Ported from mobile/app/Info-files.tsx — upload form + existing-files list
// with delete. The read side students see already exists at
// app/student/home/InfoScreen.tsx, calling the same GET /api/info-files.

import { useCallback, useEffect, useState } from 'react';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { useRequireRole } from '@/hooks/useRequireRole';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import type { AppRole } from '@/lib/roles';

const INFO_FILE_ROLES: AppRole[] = ['system_admin', 'coordinator'];

interface InfoFile {
  id: string;
  titleHe: string;
  titleEn: string;
  fileUrl: string;
  fileName: string;
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
      await apiClient.uploadInfoFile(formData);
      setTitleHe('');
      setTitleEn('');
      setPickedFile(null);
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
