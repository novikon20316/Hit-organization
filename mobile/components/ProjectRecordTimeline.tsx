// components/ProjectRecordTimeline.tsx
// Read-only, permanent per-project record — GET /api/project-records/:projectId
// (see server/src/services/projectRecords.ts). Every milestone submission,
// grade, examiner assignment, message, and lifecycle event on the project,
// in chronological order. Nothing here writes anything, and there is no
// edit/delete affordance for anyone, including system_admin. Mirrors
// web/components/ProjectRecordTimeline.tsx.

import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    apiClient.getProjectRecord(projectId)
      .then((res) => { if (!cancelled) setEntries(res.entries as unknown as RecordEntry[]); })
      .catch((err) => {
        if (cancelled) return;
        console.error('Failed to load project record:', err);
        setError(lang === 'he' ? 'טעינת רישום הפרויקט נכשלה' : 'Failed to load the project record');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [projectId, lang]);

  return (
    <View style={{ marginTop: 12, borderWidth: 1, borderColor: '#E2E2E2', borderRadius: 10, padding: 14 }}>
      <Text style={{ fontSize: 15, fontWeight: '700' }}>📜 {lang === 'he' ? 'רישום הפרויקט' : 'Project Record'}</Text>
      <Text style={{ fontSize: 11, color: '#777', marginTop: 2 }}>
        {lang === 'he'
          ? 'רישום קבוע לצפייה בלבד — לא ניתן לעריכה או מחיקה על ידי אף משתמש.'
          : 'A permanent, read-only record — cannot be edited or deleted by any user.'}
      </Text>

      {loading && <ActivityIndicator style={{ marginTop: 10 }} />}
      {error && <Text style={{ marginTop: 8, fontSize: 12, color: '#A8433A' }}>{error}</Text>}

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
            return (
              <View key={entry.id} style={{ backgroundColor: '#F7F7F7', borderRadius: 8, padding: 8 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontSize: 12, fontWeight: '600' }}>
                    {label ? `${label.icon} ${lang === 'he' ? label.he : label.en}` : entry.type}
                  </Text>
                  <Text style={{ fontSize: 10, color: '#999' }}>{formatDate(entry.timestamp, lang)}</Text>
                </View>
                <Text style={{ fontSize: 11, color: '#777', marginTop: 2 }}>
                  {entry.actorDisplayName ?? entry.actorRole}
                  {description ? ` — ${description}` : ''}
                </Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}
