// components/ProjectRecordTimeline.tsx
// Read-only, permanent per-project record — GET /api/project-records/:projectId
// (see server/src/services/projectRecords.ts). Every milestone submission,
// grade, examiner assignment, message, and lifecycle event on the project,
// in chronological order. Immutable for every role EXCEPT system_admin, who
// gets a narrow, fully-audited break-glass edit/delete/restore path (see
// projectRecordsController.ts) — those controls only render when the
// server says canEdit is true. Mirrors web/components/ProjectRecordTimeline.tsx.

import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator } from 'react-native';
import { apiClient } from '@/src/api/apiClient';
import type { Lang } from './i18n';

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

function formatDate(iso: string | null, lang: Lang): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(lang === 'he' ? 'he-IL' : 'en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function describeEntry(entry: RecordEntry, lang: Lang): string {
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

export function ProjectRecordTimeline({ projectId, lang }: { projectId: string; lang: Lang }) {
  const [entries, setEntries] = useState<RecordEntry[] | null>(null);
  const [project, setProject] = useState<{ titleHe: string; titleEn: string; recordNumber: string | null } | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
    } catch (err: any) {
      setActionError(err?.response?.data?.message || (lang === 'he' ? 'העדכון נכשל' : 'Update failed'));
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
    } catch (err: any) {
      setActionError(err?.response?.data?.message || (lang === 'he' ? 'המחיקה נכשלה' : 'Delete failed'));
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
    } catch (err: any) {
      setActionError(err?.response?.data?.message || (lang === 'he' ? 'השחזור נכשל' : 'Restore failed'));
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
    } catch (err: any) {
      setActionError(err?.response?.data?.message || (lang === 'he' ? 'העדכון נכשל' : 'Update failed'));
    } finally {
      setActionBusy(false);
    }
  };

  return (
    <View style={{ marginTop: 12, borderWidth: 1, borderColor: '#E2E2E2', borderRadius: 10, padding: 14 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Text style={{ fontSize: 15, fontWeight: '700' }}>📜 {lang === 'he' ? 'רישום הפרויקט' : 'Project Record'}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {!!project?.recordNumber && !editingNumber && (
            <View style={{ backgroundColor: '#F7F7F7', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 }}>
              <Text style={{ fontSize: 11, fontWeight: '700' }}>{project.recordNumber}</Text>
            </View>
          )}
          {canEdit && !editingNumber && (
            <Pressable onPress={openNumberEdit} accessibilityRole="button">
              <Text style={{ fontSize: 13 }}>✏️</Text>
            </Pressable>
          )}
        </View>
      </View>

      {editingNumber && (
        <View style={{ marginTop: 8, borderWidth: 1, borderColor: '#FCA5A5', backgroundColor: '#FEF2F2', borderRadius: 8, padding: 8 }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: '#A8433A' }}>
            {lang === 'he' ? '⚠️ שינוי מספר הרישום הקבוע — פעולת מנהל מערכת' : '⚠️ Overriding the permanent record number — system_admin action'}
          </Text>
          <TextInput
            value={numberText}
            onChangeText={setNumberText}
            style={{ marginTop: 6, borderWidth: 1, borderColor: '#E2E2E2', borderRadius: 6, padding: 6, fontSize: 13, backgroundColor: '#fff' }}
          />
          <TextInput
            value={numberReason}
            onChangeText={setNumberReason}
            placeholder={lang === 'he' ? 'סיבה (חובה)' : 'Reason (required)'}
            style={{ marginTop: 6, borderWidth: 1, borderColor: '#E2E2E2', borderRadius: 6, padding: 6, fontSize: 13, backgroundColor: '#fff' }}
          />
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
            <Pressable disabled={actionBusy} onPress={submitNumberEdit} style={{ backgroundColor: '#A8433A', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6 }} accessibilityRole="button">
              <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{lang === 'he' ? 'שמור' : 'Save'}</Text>
            </Pressable>
            <Pressable disabled={actionBusy} onPress={() => setEditingNumber(false)} style={{ borderWidth: 1, borderColor: '#E2E2E2', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6 }} accessibilityRole="button">
              <Text style={{ fontSize: 12 }}>{lang === 'he' ? 'ביטול' : 'Cancel'}</Text>
            </Pressable>
          </View>
        </View>
      )}

      {!!project && (
        <Text style={{ fontSize: 13, marginTop: 2 }}>{lang === 'he' ? project.titleHe || project.titleEn : project.titleEn || project.titleHe}</Text>
      )}
      <Text style={{ fontSize: 11, color: '#777', marginTop: 2 }}>
        {canEdit
          ? (lang === 'he'
              ? 'רישום קבוע — כמנהל/ת מערכת ניתן לערוך/למחוק רשומות בודדות לצורך תיקון טעות; כל פעולה כזו מתועדת ומוצגת כאן.'
              : 'A permanent record — as system_admin you may edit/delete individual entries to correct a mistake; every such action is logged and shown here.')
          : (lang === 'he'
              ? 'רישום קבוע לצפייה בלבד — לא ניתן לעריכה או מחיקה.'
              : 'A permanent, read-only record — cannot be edited or deleted.')}
      </Text>

      {!!actionError && <Text style={{ marginTop: 8, fontSize: 12, color: '#A8433A' }}>{actionError}</Text>}
      {loading && <ActivityIndicator style={{ marginTop: 10 }} />}
      {!!error && <Text style={{ marginTop: 8, fontSize: 12, color: '#A8433A' }}>{error}</Text>}

      {!loading && !error && (entries?.length ?? 0) === 0 && (
        <Text style={{ marginTop: 8, fontSize: 12, color: '#777' }}>
          {lang === 'he' ? 'אין עדיין רישומים לפרויקט זה.' : 'No records for this project yet.'}
        </Text>
      )}

      {!loading && !error && entries && entries.length > 0 && (
        <View style={{ marginTop: 10, gap: 8 }}>
          {entries.map((entry) => {
            const label = ENTRY_LABEL[entry.type];
            const description = describeEntry(entry, lang);
            const isEditingThis = editingEntryId === entry.id;
            const isDeletingThis = deletingEntryId === entry.id;
            return (
              <View key={entry.id} style={{ backgroundColor: entry.deleted ? '#FEF2F2' : '#F7F7F7', opacity: entry.deleted ? 0.8 : 1, borderRadius: 8, padding: 8 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontSize: 12, fontWeight: '600' }}>
                    {label ? `${label.icon} ${lang === 'he' ? label.he : label.en}` : entry.type}
                    {entry.edited ? <Text style={{ fontSize: 11, fontWeight: '400', color: '#999' }}> ({lang === 'he' ? 'נערך' : 'edited'})</Text> : null}
                    {entry.deleted ? <Text style={{ fontSize: 11, fontWeight: '400', color: '#A8433A' }}> ({lang === 'he' ? 'נמחק' : 'deleted'})</Text> : null}
                  </Text>
                  <Text style={{ fontSize: 10, color: '#999' }}>{formatDate(entry.timestamp, lang)}</Text>
                </View>
                <Text style={{ fontSize: 11, color: '#777', marginTop: 2 }}>
                  {entry.actorDisplayName ?? entry.actorRole}
                  {description ? ` — ${description}` : ''}
                </Text>

                {entry.deleted && (
                  <Text style={{ marginTop: 4, fontSize: 11, color: '#A8433A' }}>
                    {lang === 'he' ? 'נמחק על ידי' : 'Deleted by'} {entry.deletedByName ?? entry.deletedBy} · {formatDate(entry.deletedAt ?? null, lang)}
                    {entry.deleteReason ? ` — ${entry.deleteReason}` : ''}
                  </Text>
                )}

                {!!entry.editHistory?.length && (
                  <Pressable onPress={() => setExpandedHistoryId(expandedHistoryId === entry.id ? null : entry.id)} accessibilityRole="button">
                    <Text style={{ marginTop: 4, fontSize: 11, color: '#777', textDecorationLine: 'underline' }}>
                      {expandedHistoryId === entry.id
                        ? (lang === 'he' ? 'הסתר היסטוריית עריכה' : 'Hide edit history')
                        : (lang === 'he' ? `היסטוריית עריכה (${entry.editHistory.length})` : `Edit history (${entry.editHistory.length})`)}
                    </Text>
                  </Pressable>
                )}
                {expandedHistoryId === entry.id && entry.editHistory && (
                  <View style={{ marginTop: 6, gap: 6, backgroundColor: '#fff', borderRadius: 6, padding: 6 }}>
                    {entry.editHistory.map((h, i) => (
                      <View key={i}>
                        <Text style={{ fontSize: 11, fontWeight: '600' }}>{h.editedByName ?? h.editedBy} · {formatDate(h.editedAt, lang)} — {h.reason}</Text>
                        <Text style={{ fontSize: 10, color: '#777', marginTop: 2 }}>{JSON.stringify(h.previousData)}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {canEdit && !isEditingThis && !isDeletingThis && (
                  <View style={{ flexDirection: 'row', gap: 12, marginTop: 6 }}>
                    <Pressable onPress={() => openEdit(entry)} accessibilityRole="button">
                      <Text style={{ fontSize: 11, color: '#777' }}>✏️ {lang === 'he' ? 'עריכה' : 'Edit'}</Text>
                    </Pressable>
                    {entry.deleted ? (
                      <Pressable disabled={actionBusy} onPress={() => restoreEntry(entry.id)} accessibilityRole="button">
                        <Text style={{ fontSize: 11, color: '#777' }}>↩️ {lang === 'he' ? 'שחזור' : 'Restore'}</Text>
                      </Pressable>
                    ) : (
                      <Pressable onPress={() => { setDeletingEntryId(entry.id); setDeleteReason(''); setActionError(''); }} accessibilityRole="button">
                        <Text style={{ fontSize: 11, color: '#A8433A' }}>🗑️ {lang === 'he' ? 'מחיקה' : 'Delete'}</Text>
                      </Pressable>
                    )}
                  </View>
                )}

                {isEditingThis && (
                  <View style={{ marginTop: 8, borderWidth: 1, borderColor: '#E2E2E2', borderRadius: 8, padding: 8, backgroundColor: '#fff' }}>
                    <TextInput
                      value={editDataText}
                      onChangeText={setEditDataText}
                      multiline
                      numberOfLines={6}
                      style={{ borderWidth: 1, borderColor: '#E2E2E2', borderRadius: 6, padding: 6, fontSize: 11, textAlignVertical: 'top', minHeight: 100 }}
                    />
                    <TextInput
                      value={editReason}
                      onChangeText={setEditReason}
                      placeholder={lang === 'he' ? 'סיבת העדכון (חובה)' : 'Reason for the edit (required)'}
                      style={{ marginTop: 6, borderWidth: 1, borderColor: '#E2E2E2', borderRadius: 6, padding: 6, fontSize: 12 }}
                    />
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
                      <Pressable disabled={actionBusy} onPress={submitEdit} style={{ backgroundColor: '#1F1235', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6 }} accessibilityRole="button">
                        <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{lang === 'he' ? 'שמור' : 'Save'}</Text>
                      </Pressable>
                      <Pressable disabled={actionBusy} onPress={() => setEditingEntryId(null)} style={{ borderWidth: 1, borderColor: '#E2E2E2', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6 }} accessibilityRole="button">
                        <Text style={{ fontSize: 12 }}>{lang === 'he' ? 'ביטול' : 'Cancel'}</Text>
                      </Pressable>
                    </View>
                  </View>
                )}

                {isDeletingThis && (
                  <View style={{ marginTop: 8, borderWidth: 1, borderColor: '#FCA5A5', backgroundColor: '#FEF2F2', borderRadius: 8, padding: 8 }}>
                    <TextInput
                      value={deleteReason}
                      onChangeText={setDeleteReason}
                      placeholder={lang === 'he' ? 'סיבת המחיקה (חובה)' : 'Reason for the deletion (required)'}
                      style={{ borderWidth: 1, borderColor: '#E2E2E2', borderRadius: 6, padding: 6, fontSize: 12, backgroundColor: '#fff' }}
                    />
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
                      <Pressable disabled={actionBusy} onPress={submitDelete} style={{ backgroundColor: '#A8433A', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6 }} accessibilityRole="button">
                        <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{lang === 'he' ? 'אשר מחיקה' : 'Confirm delete'}</Text>
                      </Pressable>
                      <Pressable disabled={actionBusy} onPress={() => setDeletingEntryId(null)} style={{ borderWidth: 1, borderColor: '#E2E2E2', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6 }} accessibilityRole="button">
                        <Text style={{ fontSize: 12 }}>{lang === 'he' ? 'ביטול' : 'Cancel'}</Text>
                      </Pressable>
                    </View>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}
