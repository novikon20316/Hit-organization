'use client';

// app/admin/panel/StudentRosterTab.tsx
// Lets system_admin actually see the pre-registration student allowlist
// coordinators/admin upload via BulkImportModal (see
// server/src/services/studentRoster.ts) — until now that roster was
// write-only: uploaded once, then only ever read internally at signup time,
// with no way to look up an entry, fix a typo, or reopen an ID that got
// mistakenly locked (`used: true`) after its account was deleted.

import { useCallback, useEffect, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import { facultyLabel, type FacultyId } from '@/lib/i18n';
import { VALID_FACULTY_IDS } from '@/lib/roles';
import type { RosterEntry } from './types';

const selectCls = 'rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-ink focus:border-primary focus:outline-none';
const inputCls = 'rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-ink focus:border-primary focus:outline-none';
const DEGREE_LABEL = { bachelors: { he: "תואר ראשון", en: "Bachelor's" }, masters: { he: 'תואר שני', en: "Master's" } };

export function StudentRosterTab() {
  const { lang } = useLanguage();

  const [facultyFilter, setFacultyFilter] = useState<'all' | FacultyId>('all');
  const [degreeFilter, setDegreeFilter] = useState<'all' | 'bachelors' | 'masters'>('all');
  const [usedFilter, setUsedFilter] = useState<'all' | 'used' | 'unused'>('all');
  const [search, setSearch] = useState('');

  const [entries, setEntries] = useState<RosterEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFullName, setEditFullName] = useState('');
  const [editMajor, setEditMajor] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [rowError, setRowError] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await apiClient.listStudentRoster({
        facultyId: facultyFilter === 'all' ? undefined : facultyFilter,
        degreeType: degreeFilter === 'all' ? undefined : degreeFilter,
        used: usedFilter === 'all' ? undefined : usedFilter === 'used',
        q: search.trim() || undefined,
      });
      setEntries((res.entries ?? []) as RosterEntry[]);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : lang === 'he' ? 'טעינת רשימת הסטודנטים נכשלה' : 'Failed to load the student roster');
    } finally {
      setLoading(false);
    }
  }, [lang, facultyFilter, degreeFilter, usedFilter, search]);

  // Debounced so typing in the search box doesn't refetch on every keystroke.
  useEffect(() => {
    const id = setTimeout(fetchEntries, 300);
    return () => clearTimeout(id);
  }, [fetchEntries]);

  const startEdit = (entry: RosterEntry) => {
    setEditingId(entry.id);
    setEditFullName(entry.fullName ?? '');
    setEditMajor(entry.major ?? '');
    setRowError('');
    setConfirmDeleteId(null);
  };

  const saveEdit = async (entry: RosterEntry) => {
    setSavingId(entry.id);
    setRowError('');
    try {
      await apiClient.updateStudentRosterEntry(entry.id, { fullName: editFullName.trim(), major: editMajor.trim() || null });
      setEditingId(null);
      await fetchEntries();
    } catch (err) {
      setRowError(err instanceof Error ? err.message : lang === 'he' ? 'השמירה נכשלה' : 'Save failed');
    } finally {
      setSavingId(null);
    }
  };

  const handleReopen = async (entry: RosterEntry) => {
    setSavingId(entry.id);
    setRowError('');
    try {
      await apiClient.updateStudentRosterEntry(entry.id, { used: false });
      await fetchEntries();
    } catch (err) {
      setRowError(err instanceof Error ? err.message : lang === 'he' ? 'הפעולה נכשלה' : 'Action failed');
    } finally {
      setSavingId(null);
    }
  };

  const handleDelete = async (entry: RosterEntry) => {
    setSavingId(entry.id);
    setRowError('');
    try {
      await apiClient.deleteStudentRosterEntry(entry.id);
      setConfirmDeleteId(null);
      setEntries((prev) => prev.filter((e) => e.id !== entry.id));
    } catch (err) {
      setRowError(err instanceof Error ? err.message : lang === 'he' ? 'המחיקה נכשלה' : 'Delete failed');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div>
      <p className="mb-4 text-sm text-muted">
        {lang === 'he'
          ? 'רשימת הסטודנטים המאושרים שהועלתה על ידי רכזי הפקולטות (או המערכת) — נבדקת בעת הרשמת סטודנט חדש.'
          : "The approved-students allowlist uploaded by faculty coordinators (or system-wide) — checked against on every new student signup."}
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={lang === 'he' ? 'חפש לפי ת.ז. או שם...' : 'Search by ID or name...'}
          className={`${inputCls} w-full max-w-sm`}
        />
        <select value={facultyFilter} onChange={(e) => setFacultyFilter(e.target.value as typeof facultyFilter)} className={selectCls}>
          <option value="all">{lang === 'he' ? 'כל הפקולטות' : 'All faculties'}</option>
          {VALID_FACULTY_IDS.filter((id) => id !== 'all').map((id) => (
            <option key={id} value={id}>
              {facultyLabel(id as FacultyId, lang)}
            </option>
          ))}
        </select>
        <select value={degreeFilter} onChange={(e) => setDegreeFilter(e.target.value as typeof degreeFilter)} className={selectCls}>
          <option value="all">{lang === 'he' ? 'כל התארים' : 'All degrees'}</option>
          <option value="bachelors">{DEGREE_LABEL.bachelors[lang]}</option>
          <option value="masters">{DEGREE_LABEL.masters[lang]}</option>
        </select>
        <select value={usedFilter} onChange={(e) => setUsedFilter(e.target.value as typeof usedFilter)} className={selectCls}>
          <option value="all">{lang === 'he' ? 'הכל' : 'All'}</option>
          <option value="unused">{lang === 'he' ? 'עדיין לא נרשמו' : 'Not registered yet'}</option>
          <option value="used">{lang === 'he' ? 'נרשמו' : 'Already registered'}</option>
        </select>
      </div>

      {loadError && <p className="mb-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{loadError}</p>}

      {loading ? (
        <p className="text-sm text-muted">…</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-muted">{lang === 'he' ? 'לא נמצאו רשומות' : 'No entries found'}</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {entries.map((entry) => (
            <div key={entry.id} className="rounded-[var(--radius)] border border-line bg-surface p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink" dir="ltr">
                    {entry.studentId}
                  </p>
                  <p className="truncate text-xs text-muted">{entry.fullName || '—'}</p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    entry.used ? 'bg-danger-bg text-danger' : 'bg-primary/10 text-primary'
                  }`}
                >
                  {entry.used ? (lang === 'he' ? 'נרשם' : 'Registered') : lang === 'he' ? 'פנוי' : 'Open'}
                </span>
              </div>

              <div className="mt-2 flex flex-wrap gap-1.5 text-xs text-muted">
                <span className="rounded-full bg-paper px-2 py-0.5">{facultyLabel(entry.facultyId, lang)}</span>
                <span className="rounded-full bg-paper px-2 py-0.5">{DEGREE_LABEL[entry.degreeType]?.[lang] ?? entry.degreeType}</span>
                {entry.major && <span className="rounded-full bg-paper px-2 py-0.5">{entry.major}</span>}
              </div>

              {editingId === entry.id ? (
                <div className="mt-3 grid gap-2">
                  <input
                    value={editFullName}
                    onChange={(e) => setEditFullName(e.target.value)}
                    placeholder={lang === 'he' ? 'שם מלא' : 'Full name'}
                    className={`${inputCls} w-full`}
                  />
                  <input
                    value={editMajor}
                    onChange={(e) => setEditMajor(e.target.value)}
                    placeholder={lang === 'he' ? 'מגמה (אופציונלי)' : 'Major (optional)'}
                    className={`${inputCls} w-full`}
                  />
                  {rowError && <p className="text-xs text-danger">{rowError}</p>}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => saveEdit(entry)}
                      disabled={savingId === entry.id}
                      className="flex-1 rounded-lg bg-primary py-1.5 text-xs font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60"
                    >
                      {savingId === entry.id ? '…' : lang === 'he' ? 'שמור' : 'Save'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink hover:border-primary hover:text-primary"
                    >
                      {lang === 'he' ? 'ביטול' : 'Cancel'}
                    </button>
                  </div>
                </div>
              ) : confirmDeleteId === entry.id ? (
                <div className="mt-3 grid gap-2">
                  <p className="text-xs text-danger">
                    {lang === 'he' ? 'למחוק את הרשומה הזו לצמיתות?' : 'Permanently delete this entry?'}
                  </p>
                  {rowError && <p className="text-xs text-danger">{rowError}</p>}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleDelete(entry)}
                      disabled={savingId === entry.id}
                      className="flex-1 rounded-lg bg-danger py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60"
                    >
                      {savingId === entry.id ? '…' : lang === 'he' ? 'מחק' : 'Delete'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(null)}
                      className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink hover:border-primary hover:text-primary"
                    >
                      {lang === 'he' ? 'ביטול' : 'Cancel'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => startEdit(entry)}
                    className="flex-1 rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink hover:border-primary hover:text-primary"
                  >
                    ✏️ {lang === 'he' ? 'ערוך' : 'Edit'}
                  </button>
                  {entry.used && (
                    <button
                      type="button"
                      onClick={() => handleReopen(entry)}
                      disabled={savingId === entry.id}
                      className="flex-1 rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink hover:border-primary hover:text-primary disabled:opacity-60"
                      title={lang === 'he' ? 'פתח מחדש לרישום (למשל אחרי מחיקת חשבון בטעות)' : 'Reopen for registration (e.g. after deleting a mistaken account)'}
                    >
                      {savingId === entry.id ? '…' : `🔓 ${lang === 'he' ? 'פתח מחדש' : 'Reopen'}`}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(entry.id)}
                    className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-danger hover:border-danger"
                  >
                    🗑️
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
