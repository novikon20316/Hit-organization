'use client';

// app/admin/panel/AddStudentToProjectModal.tsx
// Ported from mobile's AddStudentToProjectModal + panel.tsx's
// handleAddStudentToProject — search students not already enrolled, confirm,
// then POST /api/admin/projects/:id/enroll-student.

import { useMemo, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import { getFacultyColor } from '@/lib/facultyColors';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import type { AdminProjectRecord, AdminUserRecord } from './types';

interface AddStudentToProjectModalProps {
  project: AdminProjectRecord;
  users: AdminUserRecord[];
  onClose: () => void;
  onEnrolled: () => void;
}

export function AddStudentToProjectModal({ project, users, onClose, onEnrolled }: AddStudentToProjectModalProps) {
  const { lang } = useLanguage();
  const [search, setSearch] = useState('');
  const [confirmStudent, setConfirmStudent] = useState<AdminUserRecord | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');

  const filteredStudents = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (u.role !== 'student') return false;
      if (project.enrolledStudentIds?.includes(u.id)) return false;
      if (!q) return true;
      return u.displayName?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q);
    });
  }, [users, project.enrolledStudentIds, search]);

  const handleAdd = async () => {
    if (!confirmStudent) return;
    setAdding(true);
    setError('');
    try {
      await apiClient.enrollStudentAdmin(project.id, confirmStudent.id);
      setConfirmStudent(null);
      onEnrolled();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : lang === 'he' ? 'הוספת הסטודנט נכשלה' : 'Failed to add student');
      setConfirmStudent(null);
    } finally {
      setAdding(false);
    }
  };

  const projectTitle = lang === 'he' ? project.titleHe : project.titleEn;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-[var(--radius)] bg-surface p-6 shadow-lg">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-ink">👤 {lang === 'he' ? 'הוסף סטודנט לפרויקט' : 'Add Student to Project'}</h2>
            {projectTitle && <p className="mt-1 truncate text-sm text-muted">📁 {projectTitle}</p>}
          </div>
          <button type="button" onClick={onClose} className="text-muted hover:text-ink">
            ✕
          </button>
        </div>

        <input
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={lang === 'he' ? 'חיפוש לפי שם או אימייל...' : 'Search by name or email...'}
          className="mt-4 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-primary focus:bg-surface focus:outline-none"
        />

        <div className="mt-3 grid gap-1.5">
          {filteredStudents.map((u) => {
            const color = getFacultyColor(u.facultyId);
            return (
              <button
                key={u.id}
                type="button"
                onClick={() => setConfirmStudent(u)}
                disabled={adding}
                className="flex items-center gap-3 rounded-lg border border-line bg-paper px-3 py-2 text-start hover:border-primary disabled:opacity-60"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white" style={{ backgroundColor: color }}>
                  {(u.displayName || '?').charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">{u.displayName}</span>
                  <span className="block truncate text-xs text-muted" dir="ltr">
                    {u.email}
                  </span>
                </span>
                <span className="text-muted">›</span>
              </button>
            );
          })}
          {filteredStudents.length === 0 && <p className="py-6 text-center text-sm text-muted">🔍 {lang === 'he' ? 'לא נמצאו סטודנטים' : 'No students found'}</p>}
        </div>

        {error && <p className="mt-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}
      </div>

      <ConfirmDialog
        open={!!confirmStudent}
        title={lang === 'he' ? 'אישור הוספה' : 'Confirm Addition'}
        message={
          confirmStudent
            ? lang === 'he'
              ? `האם להוסיף את ${confirmStudent.displayName} לפרויקט "${project.titleHe}"?`
              : `Add ${confirmStudent.displayName} to project "${project.titleEn}"?`
            : ''
        }
        confirmLabel={lang === 'he' ? 'כן' : 'Yes'}
        cancelLabel={lang === 'he' ? 'לא' : 'No'}
        busy={adding}
        onConfirm={handleAdd}
        onCancel={() => setConfirmStudent(null)}
      />
    </div>
  );
}
