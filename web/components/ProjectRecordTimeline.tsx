'use client';

// components/ProjectRecordTimeline.tsx
// Read-only, permanent per-project record — GET /api/project-records/:projectId,
// backed by the projectRecordEntries collection (see
// server/src/services/projectRecords.ts). Every milestone submission,
// grade, examiner assignment, message, and lifecycle event on the project,
// in chronological order. Immutable for every role EXCEPT system_admin,
// who gets a narrow, fully-audited break-glass edit/delete/restore path
// (see projectRecordsController.ts's editProjectRecordEntry/
// deleteProjectRecordEntry/restoreProjectRecordEntry) — those controls
// only render when the server says canEdit is true, and the server
// re-checks system_admin on every mutating call regardless of what the
// client sends.

import { useEffect, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';

interface RecordEntry {
  id: string;
  type: string;
  actorId: string;
  actorRole: string;
  actorDisplayName: string | null;
  data: Record<string, unknown> | null;
  timestamp: string | null;
  edited?: boolean;
  editHistory?: Array<{
    previousData: Record<string, unknown> | null;
    editedBy: string; editedByName: string | null; editedAt: string | null; reason: string;
  }>;
  deleted?: boolean;
  deletedBy?: string | null;
  deletedByName?: string | null;
  deletedAt?: string | null;
  deleteReason?: string | null;
}

const ENTRY_LABEL: Record<string, { he: string; en: string; icon: string }> = {
  student_joined_project:  { he: 'סטודנט הצטרף לפרויקט', en: 'Student joined the project', icon: '🎓' },
  milestone_submitted:     { he: 'אבן דרך הוגשה', en: 'Milestone submitted', icon: '📤' },
  milestone_resubmitted:   { he: 'אבן דרך הוגשה מחדש', en: 'Milestone resubmitted', icon: '📤' },
  milestone_approved:      { he: 'אבן דרך אושרה', en: 'Milestone approved', icon: '✅' },
  milestone_rejected:      { he: 'אבן דרך נדחתה', en: 'Milestone rejected', icon: '↩️' },
  grade_submitted:         { he: 'ציון הוזן', en: 'Grade submitted', icon: '📊' },
  grade_changed:           { he: 'ציון עודכן', en: 'Grade changed', icon: '📊' },
  final_grade_approved:    { he: 'ציון סופי אושר', en: 'Final grade approved', icon: '🏁' },
  examiner_assigned:       { he: 'בוחן/ת שובץ/ה', en: 'Examiner assigned', icon: '🧑‍⚖️' },
  examiner_removed:        { he: 'בוחן/ת הוסר/ה', en: 'Examiner removed', icon: '🧑‍⚖️' },
  message_sent:            { he: 'הודעה נשלחה', en: 'Message sent', icon: '💬' },
  defense_date_resolved:   { he: 'תאריך הגנה נקבע', en: 'Defense date resolved', icon: '📅' },
  project_status_changed:  { he: 'סטטוס הפרויקט השתנה', en: 'Project status changed', icon: '🔄' },
};

function formatDate(iso: string | null, lang: 'he' | 'en'): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(lang === 'he' ? 'he-IL' : 'en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function describeEntry(entry: RecordEntry, lang: 'he' | 'en'): string {
  const d = entry.data ?? {};
  switch (entry.type) {
    case 'grade_submitted':
    case 'grade_changed':
      return typeof d.score === 'number' ? `${lang === 'he' ? 'ציון' : 'Score'}: ${d.score}` : '';
    case 'final_grade_approved':
      return typeof d.finalGrade === 'number' ? `${lang === 'he' ? 'ציון סופי' : 'Final grade'}: ${d.finalGrade}` : '';
    case 'examiner_assigned': {
      const internal = Array.isArray(d.internalUids) ? d.internalUids.length : 0;
      const external = Array.isArray(d.externalNotified) ? (d.externalNotified as Array<{ name: string }>).map((e) => e.name) : [];
      const parts = [
        internal > 0 ? `${internal} ${lang === 'he' ? 'פנימיים' : 'internal'}` : null,
        external.length > 0 ? external.join(', ') : null,
      ].filter(Boolean);
      return parts.join(' · ');
    }
    case 'message_sent':
      return typeof d.preview === 'string' ? `"${d.preview}"` : '';
    case 'milestone_rejected':
      return typeof d.reason === 'string' ? d.reason : '';
    case 'project_status_changed':
      return typeof d.newStatus === 'string' ? d.newStatus : '';
    default: {
      const name = d.milestoneName as { he?: string; en?: string } | undefined;
      return name ? (lang === 'he' ? name.he ?? '' : name.en ?? '') : '';
    }
  }
}

export function ProjectRecordTimeline({ projectId }: { projectId: string }) {
  const { lang } = useLanguage();
  const [entries, setEntries] = useState<RecordEntry[] | null>(null);
  const [project, setProject] = useState<{
    titleHe: string; titleEn: string; recordNumber: string | null;
    students?: Array<{ id: string; displayName: string | null }>;
  } | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Only ever meaningful when canEdit — which of these admin-only controls
  // is currently open. At most one at a time.
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editDataText, setEditDataText] = useState('');
  const [editReason, setEditReason] = useState('');
  const [deletingEntryId, setDeletingEntryId] = useState<string | null>(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [editingNumber, setEditingNumber] = useState(false);
  const [numberText, setNumberText] = useState('');
  const [numberReason, setNumberReason] = useState('');
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState('');

  const fetchRecord = async () => {
    if (!projectId) return;
    setLoading(true);
    setError('');
    try {
      const res = await apiClient.getProjectRecord(projectId);
      setEntries(res.entries as unknown as RecordEntry[]);
      setProject(res.project);
      setCanEdit(res.canEdit);
    } catch {
      setError(lang === 'he' ? 'טעינת רישום הפרויקט נכשלה' : 'Failed to load the project record');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecord();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, lang]);

  const openEdit = (entry: RecordEntry) => {
    setEditingEntryId(entry.id);
    setEditDataText(JSON.stringify(entry.data ?? {}, null, 2));
    setEditReason('');
    setActionError('');
  };

  const submitEdit = async () => {
    if (!editingEntryId) return;
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(editDataText);
    } catch {
      setActionError(lang === 'he' ? 'JSON לא תקין' : 'Invalid JSON');
      return;
    }
    if (!editReason.trim()) {
      setActionError(lang === 'he' ? 'יש לציין סיבה' : 'A reason is required');
      return;
    }
    setActionBusy(true);
    setActionError('');
    try {
      await apiClient.editProjectRecordEntry(editingEntryId, parsed, editReason.trim());
      setEditingEntryId(null);
      await fetchRecord();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : (lang === 'he' ? 'העדכון נכשל' : 'Update failed'));
    } finally {
      setActionBusy(false);
    }
  };

  const submitDelete = async () => {
    if (!deletingEntryId) return;
    if (!deleteReason.trim()) {
      setActionError(lang === 'he' ? 'יש לציין סיבה' : 'A reason is required');
      return;
    }
    setActionBusy(true);
    setActionError('');
    try {
      await apiClient.deleteProjectRecordEntry(deletingEntryId, deleteReason.trim());
      setDeletingEntryId(null);
      setDeleteReason('');
      await fetchRecord();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : (lang === 'he' ? 'המחיקה נכשלה' : 'Delete failed'));
    } finally {
      setActionBusy(false);
    }
  };

  const restoreEntry = async (entryId: string) => {
    setActionBusy(true);
    setActionError('');
    try {
      await apiClient.restoreProjectRecordEntry(entryId);
      await fetchRecord();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : (lang === 'he' ? 'השחזור נכשל' : 'Restore failed'));
    } finally {
      setActionBusy(false);
    }
  };

  const openNumberEdit = () => {
    setEditingNumber(true);
    setNumberText(project?.recordNumber ?? '');
    setNumberReason('');
    setActionError('');
  };

  const submitNumberEdit = async () => {
    if (!numberText.trim() || !numberReason.trim()) {
      setActionError(lang === 'he' ? 'יש למלא מספר רישום וסיבה' : 'A record number and reason are both required');
      return;
    }
    setActionBusy(true);
    setActionError('');
    try {
      await apiClient.updateProjectRecordNumber(projectId, numberText.trim(), numberReason.trim());
      setEditingNumber(false);
      await fetchRecord();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : (lang === 'he' ? 'העדכון נכשל' : 'Update failed'));
    } finally {
      setActionBusy(false);
    }
  };

  return (
    <div className="rounded-[var(--radius)] border border-line bg-surface p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-base font-semibold text-ink">📜 {lang === 'he' ? 'רישום הפרויקט' : 'Project Record'}</p>
        <div className="flex items-center gap-1.5">
          {project?.recordNumber && !editingNumber && (
            <span className="rounded-full bg-paper px-2.5 py-1 text-xs font-mono font-semibold text-ink">
              {project.recordNumber}
            </span>
          )}
          {canEdit && !editingNumber && (
            <button type="button" onClick={openNumberEdit} className="text-xs text-muted hover:text-ink" title={lang === 'he' ? 'ערוך מספר רישום' : 'Edit record number'}>
              ✏️
            </button>
          )}
        </div>
      </div>

      {editingNumber && (
        <div className="mt-2 rounded-md border border-danger bg-danger-bg p-2.5">
          <p className="text-xs font-semibold text-danger">
            {lang === 'he' ? '⚠️ שינוי מספר הרישום הקבוע — פעולת מנהל מערכת' : '⚠️ Overriding the permanent record number — system_admin action'}
          </p>
          <input
            value={numberText}
            onChange={(e) => setNumberText(e.target.value)}
            className="mt-2 w-full rounded-md border border-line bg-paper px-2.5 py-1.5 text-sm font-mono text-ink"
          />
          <input
            value={numberReason}
            onChange={(e) => setNumberReason(e.target.value)}
            placeholder={lang === 'he' ? 'סיבה (חובה)' : 'Reason (required)'}
            className="mt-1.5 w-full rounded-md border border-line bg-paper px-2.5 py-1.5 text-sm text-ink"
          />
          <div className="mt-2 flex gap-2">
            <button type="button" disabled={actionBusy} onClick={submitNumberEdit} className="rounded-md bg-danger px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60">
              {lang === 'he' ? 'שמור' : 'Save'}
            </button>
            <button type="button" disabled={actionBusy} onClick={() => setEditingNumber(false)} className="rounded-md border border-line px-3 py-1.5 text-xs text-ink">
              {lang === 'he' ? 'ביטול' : 'Cancel'}
            </button>
          </div>
        </div>
      )}

      {project && (
        <p className="mt-1 text-sm text-ink">{lang === 'he' ? project.titleHe || project.titleEn : project.titleEn || project.titleHe}</p>
      )}
      {project && (
        <p className="mt-1 text-sm text-ink">
          <span className="font-semibold">🎓 {lang === 'he' ? 'סטודנטים:' : 'Students:'}</span>{' '}
          {project.students && project.students.length > 0
            ? project.students.map((s) => s.displayName || (lang === 'he' ? 'לא ידוע' : 'Unknown')).join(', ')
            : <span className="text-muted">{lang === 'he' ? 'אין סטודנטים רשומים כרגע' : 'No students currently enrolled'}</span>}
        </p>
      )}
      <p className="mt-1 text-xs text-muted">
        {canEdit
          ? (lang === 'he'
              ? 'רישום קבוע — כמנהל/ת מערכת ניתן לערוך/למחוק רשומות בודדות לצורך תיקון טעות; כל פעולה כזו מתועדת ומוצגת כאן.'
              : 'A permanent record — as system_admin you may edit/delete individual entries to correct a mistake; every such action is logged and shown here.')
          : (lang === 'he'
              ? 'רישום קבוע לצפייה בלבד — לא ניתן לעריכה או מחיקה.'
              : 'A permanent, read-only record — cannot be edited or deleted.')}
      </p>

      {actionError && <p className="mt-2 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{actionError}</p>}
      {loading && <p className="mt-2 text-sm text-muted" role="status" aria-live="polite">{lang === 'he' ? 'טוען…' : 'Loading…'}</p>}
      {error && <p className="mt-2 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{error}</p>}

      {!loading && !error && (entries?.length ?? 0) === 0 && (
        <p className="mt-2 text-sm text-muted">
          {lang === 'he' ? 'אין עדיין רישומים לפרויקט זה.' : 'No records for this project yet.'}
        </p>
      )}

      {!loading && !error && (entries?.length ?? 0) > 0 && (
        <ol className="mt-3 grid gap-2">
          {entries!.map((entry) => {
            const label = ENTRY_LABEL[entry.type];
            const description = describeEntry(entry, lang);
            const isEditingThis = editingEntryId === entry.id;
            const isDeletingThis = deletingEntryId === entry.id;
            return (
              <li key={entry.id} className={`rounded-md px-3 py-2 ${entry.deleted ? 'bg-danger-bg opacity-70' : 'bg-paper'}`}>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-ink">
                    {label ? `${label.icon} ${lang === 'he' ? label.he : label.en}` : entry.type}
                    {entry.edited && <span className="ms-1.5 text-xs font-normal text-muted">({lang === 'he' ? 'נערך' : 'edited'})</span>}
                    {entry.deleted && <span className="ms-1.5 text-xs font-normal text-danger">({lang === 'he' ? 'נמחק' : 'deleted'})</span>}
                  </span>
                  <span className="text-xs text-muted whitespace-nowrap">{formatDate(entry.timestamp, lang)}</span>
                </div>
                <p className="mt-0.5 text-xs text-muted">
                  {entry.actorDisplayName ?? entry.actorRole}
                  {description ? ` — ${description}` : ''}
                </p>

                {entry.deleted && (
                  <p className="mt-1 text-xs text-danger">
                    {lang === 'he' ? 'נמחק על ידי' : 'Deleted by'} {entry.deletedByName ?? entry.deletedBy} · {formatDate(entry.deletedAt ?? null, lang)}
                    {entry.deleteReason ? ` — ${entry.deleteReason}` : ''}
                  </p>
                )}

                {!!entry.editHistory?.length && (
                  <button type="button" onClick={() => setExpandedHistoryId(expandedHistoryId === entry.id ? null : entry.id)} className="mt-1 text-xs text-muted underline hover:text-ink">
                    {expandedHistoryId === entry.id
                      ? (lang === 'he' ? 'הסתר היסטוריית עריכה' : 'Hide edit history')
                      : (lang === 'he' ? `היסטוריית עריכה (${entry.editHistory.length})` : `Edit history (${entry.editHistory.length})`)}
                  </button>
                )}
                {expandedHistoryId === entry.id && entry.editHistory && (
                  <div className="mt-1.5 grid gap-1.5 rounded-md bg-surface p-2">
                    {entry.editHistory.map((h, i) => (
                      <div key={i} className="text-xs text-muted">
                        <p className="font-medium text-ink">{h.editedByName ?? h.editedBy} · {formatDate(h.editedAt, lang)} — {h.reason}</p>
                        <pre className="mt-0.5 overflow-x-auto whitespace-pre-wrap rounded bg-paper p-1.5 text-[11px]">{JSON.stringify(h.previousData, null, 2)}</pre>
                      </div>
                    ))}
                  </div>
                )}

                {canEdit && !isEditingThis && !isDeletingThis && (
                  <div className="mt-1.5 flex gap-2">
                    <button type="button" onClick={() => openEdit(entry)} className="text-xs text-muted hover:text-ink">
                      ✏️ {lang === 'he' ? 'עריכה' : 'Edit'}
                    </button>
                    {entry.deleted ? (
                      <button type="button" disabled={actionBusy} onClick={() => restoreEntry(entry.id)} className="text-xs text-muted hover:text-ink">
                        ↩️ {lang === 'he' ? 'שחזור' : 'Restore'}
                      </button>
                    ) : (
                      <button type="button" onClick={() => { setDeletingEntryId(entry.id); setDeleteReason(''); setActionError(''); }} className="text-xs text-danger hover:underline">
                        🗑️ {lang === 'he' ? 'מחיקה' : 'Delete'}
                      </button>
                    )}
                  </div>
                )}

                {isEditingThis && (
                  <div className="mt-2 rounded-md border border-line bg-surface p-2">
                    <textarea
                      value={editDataText}
                      onChange={(e) => setEditDataText(e.target.value)}
                      rows={6}
                      className="w-full rounded-md border border-line bg-paper px-2 py-1.5 font-mono text-xs text-ink"
                    />
                    <input
                      value={editReason}
                      onChange={(e) => setEditReason(e.target.value)}
                      placeholder={lang === 'he' ? 'סיבת העדכון (חובה)' : 'Reason for the edit (required)'}
                      className="mt-1.5 w-full rounded-md border border-line bg-paper px-2.5 py-1.5 text-xs text-ink"
                    />
                    <div className="mt-1.5 flex gap-2">
                      <button type="button" disabled={actionBusy} onClick={submitEdit} className="rounded-md bg-ink px-3 py-1.5 text-xs font-semibold text-surface disabled:opacity-60">
                        {lang === 'he' ? 'שמור' : 'Save'}
                      </button>
                      <button type="button" disabled={actionBusy} onClick={() => setEditingEntryId(null)} className="rounded-md border border-line px-3 py-1.5 text-xs text-ink">
                        {lang === 'he' ? 'ביטול' : 'Cancel'}
                      </button>
                    </div>
                  </div>
                )}

                {isDeletingThis && (
                  <div className="mt-2 rounded-md border border-danger bg-danger-bg p-2">
                    <input
                      value={deleteReason}
                      onChange={(e) => setDeleteReason(e.target.value)}
                      placeholder={lang === 'he' ? 'סיבת המחיקה (חובה)' : 'Reason for the deletion (required)'}
                      className="w-full rounded-md border border-line bg-paper px-2.5 py-1.5 text-xs text-ink"
                    />
                    <div className="mt-1.5 flex gap-2">
                      <button type="button" disabled={actionBusy} onClick={submitDelete} className="rounded-md bg-danger px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60">
                        {lang === 'he' ? 'אשר מחיקה' : 'Confirm delete'}
                      </button>
                      <button type="button" disabled={actionBusy} onClick={() => setDeletingEntryId(null)} className="rounded-md border border-line px-3 py-1.5 text-xs text-ink">
                        {lang === 'he' ? 'ביטול' : 'Cancel'}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
