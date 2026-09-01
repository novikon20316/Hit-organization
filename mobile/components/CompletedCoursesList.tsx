// components/CompletedCoursesList.tsx
// Read-only view of a student's completedCourses (subject + grade), so a
// project prerequisite's minGrade (see components/Prerequisites.ts) can be
// checked against something real. Students can no longer self-report
// entries here — that was trivially falsifiable — so this only ever
// reflects courses a system_admin entered manually or that were
// AI-extracted from a transcript during application review.

import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import type { Lang } from './i18n';
import type { CompletedCourse } from './Prerequisites';

interface Props {
  lang: Lang;
  isRtl: boolean;
  completedCourses: CompletedCourse[];
}

export default function CompletedCoursesList({ lang, isRtl, completedCourses }: Props) {
  const [expanded, setExpanded] = useState(false);

  return (
    <View style={{ borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, backgroundColor: '#fff', padding: 14, marginBottom: 12 }}>
      <Pressable
        onPress={() => setExpanded((v) => !v)}
        style={{ flexDirection: isRtl ? 'row-reverse' : 'row', justifyContent: 'space-between', alignItems: 'center' }}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
      >
        <Text style={{ fontSize: 14, fontWeight: '700', color: '#111' }}>
          📚 {lang === 'he' ? 'הקורסים שהשלמתי' : 'My Completed Courses'} ({completedCourses.length})
        </Text>
        <Text style={{ fontSize: 12, color: '#8899BB' }}>{expanded ? '▲' : '▼'}</Text>
      </Pressable>

      {expanded && (
        <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: '#E2E8F0', paddingTop: 12, gap: 8 }}>
          {completedCourses.length === 0 && (
            <Text style={{ fontSize: 12, color: '#8899BB' }}>
              {lang === 'he' ? 'טרם נרשמו קורסים שהושלמו' : 'No completed courses on record yet'}
            </Text>
          )}
          {completedCourses.map((r) => (
            <View
              key={r.subject}
              style={{
                flexDirection: isRtl ? 'row-reverse' : 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: '#F8FAFC',
                borderRadius: 8,
                paddingHorizontal: 12,
                paddingVertical: 8,
              }}
            >
              <Text style={{ fontSize: 13, color: '#111' }}>{r.subject}</Text>
              <Text style={{ fontSize: 12, color: '#8899BB' }}>
                {lang === 'he' ? 'ציון:' : 'Grade:'} {r.grade ?? '—'}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
