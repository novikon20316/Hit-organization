// components/DefenseSummary.tsx
// E1 — everything about one defense in one place on the examiner card:
// when, where (room or the Zoom link), the student's latest submitted
// files, this examiner's own status, and — once grading is open — how many
// of the panel have submitted (a count only; co-examiners' scores are never
// sent). Mobile counterpart of web's DefenseSummary in
// app/examinor/home/AssignmentCard.tsx.
import React from 'react';
import { View, Text, Pressable, Linking } from 'react-native';
import { defenseModeIcon, defenseModeLabel, resolveDefenseMode, showsDefenseLink, showsDefensePlace } from '@/utils/defenseDisplay';
import { milestoneDisplayName } from '@/utils/milestoneLabel';
import type { AssignedMilestone } from '@/types';
import type { Lang } from './i18n';

export function DefenseSummary({ m, lang, graded, gradingOpen, labels }: {
  m: AssignedMilestone;
  lang: Lang;
  graded: boolean;
  gradingOpen: boolean;
  labels: Record<string, { he: string; en: string }>;
}) {
  const he = lang === 'he';
  const align = he ? 'right' : 'left';
  const mode = resolveDefenseMode(m);
  const latestWithFiles = [...(m.milestoneHistory ?? [])].reverse().find((h) => (h.fileUrls ?? []).length > 0);
  const line = { fontSize: 12, color: '#1E293B', textAlign: align, marginTop: 3 } as const;
  return (
    <View style={{ marginTop: 10, backgroundColor: '#F1F5F9', borderRadius: 10, padding: 10 }}>
      <Text style={[line, { fontWeight: '700', marginTop: 0 }]}>🎓 {he ? 'ההגנה במבט אחד' : 'Defense at a glance'}</Text>
      <Text style={line}>
        📅 {m.defenseDate
          ? `${new Date(m.defenseDate).toLocaleDateString(he ? 'he-IL' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}${m.defenseTime ? ` · ${m.defenseTime}` : ''}`
          : he ? 'המועד טרם נקבע' : 'Date not set yet'}
      </Text>
      {m.defenseDate ? <Text style={line}>{defenseModeIcon(mode)} {defenseModeLabel(mode, lang)}</Text> : null}
      {m.defenseDate && showsDefensePlace(m) && (m.defenseRoom || m.defenseBuilding) ? (
        <Text style={line}>📍 {[m.defenseRoom, m.defenseBuilding].filter(Boolean).join(' · ')}</Text>
      ) : null}
      {m.defenseDate && showsDefenseLink(m) && m.onlineDefenseLink ? (
        <Pressable onPress={() => Linking.openURL(m.onlineDefenseLink!)} accessibilityRole="link">
          <Text style={[line, { color: '#2563EB', fontWeight: '700' }]}>🎥 {he ? 'כניסה לפגישת Zoom' : 'Join the Zoom meeting'}</Text>
        </Pressable>
      ) : null}
      {latestWithFiles ? (
        <View style={{ flexDirection: he ? 'row-reverse' : 'row', flexWrap: 'wrap', gap: 8, marginTop: 3 }}>
          <Text style={{ fontSize: 12, color: '#1E293B' }}>📄 {milestoneDisplayName(latestWithFiles, lang, labels)}:</Text>
          {(latestWithFiles.fileUrls ?? []).map((url, i) => (
            <Pressable key={url} onPress={() => Linking.openURL(url)} accessibilityRole="link" accessibilityLabel={`${he ? 'קובץ' : 'File'} ${i + 1}`}>
              <Text style={{ fontSize: 12, color: '#2563EB', fontWeight: '600' }}>{he ? `קובץ ${i + 1}` : `File ${i + 1}`}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      <Text style={[line, { fontWeight: '600' }]}>
        {graded ? `✅ ${he ? 'הציון שלך הוגש' : 'You have submitted'}` : `⏳ ${he ? 'טרם הגשת' : 'You have not submitted yet'}`}
        {gradingOpen && m.panelProgress && m.panelProgress.total > 1
          ? ` · ${he ? `${m.panelProgress.submitted} מתוך ${m.panelProgress.total} בוחנים הגישו` : `${m.panelProgress.submitted} of ${m.panelProgress.total} examiners submitted`}`
          : ''}
      </Text>
    </View>
  );
}
