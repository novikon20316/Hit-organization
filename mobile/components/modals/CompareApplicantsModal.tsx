// components/modals/CompareApplicantsModal.tsx
// Mobile counterpart of web's app/supervisor/dashboard/CompareApplicantsModal.tsx:
// the still-open applications to one project, compared point by point —
// laid out as one card per point with every applicant's answer under it,
// which reads better on a phone than a wide table. Read-only, built only
// from what the application cards already show.
import React, { useState } from 'react';
import { Modal, View, Text, ScrollView, Pressable, Linking } from 'react-native';
import { ap } from '../../constants/theme';
import type { Lang } from '../i18n';
import type { Application } from '@/types';

export const OPEN_APPLICATION_STATUSES = new Set(['applied', 'meeting_requested', 'meeting_proposed', 'meeting_confirmed']);

export function comparableProjects(applications: Application[]) {
  const byProject = new Map<string, Application[]>();
  for (const a of applications) {
    if (!OPEN_APPLICATION_STATUSES.has(a.status)) continue;
    (byProject.get(a.projectId) ?? byProject.set(a.projectId, []).get(a.projectId)!).push(a);
  }
  return [...byProject.entries()]
    .filter(([, apps]) => apps.length >= 2)
    .map(([projectId, apps]) => ({ projectId, titleHe: apps[0]!.projectTitleHe, titleEn: apps[0]!.projectTitleEn, apps }));
}

const RECOMMENDATION: Record<string, { he: string; en: string; color: string }> = {
  approve: { he: '✓ מומלץ לאשר', en: '✓ Recommend approving', color: '#15803D' },
  meeting: { he: '📅 מומלץ לתאם פגישה', en: '📅 Recommend a meeting', color: '#B45309' },
  reject: { he: '✕ מומלץ לדחות', en: '✕ Recommend rejecting', color: '#B91C1C' },
};
const SCREENING: Record<string, { he: string; en: string }> = {
  strong_fit: { he: 'התאמה גבוהה', en: 'Strong fit' },
  partial_fit: { he: 'התאמה חלקית', en: 'Partial fit' },
  weak_fit: { he: 'התאמה חלשה', en: 'Weak fit' },
  unable_to_assess: { he: 'לא ניתן להעריך', en: 'Unable to assess' },
};

type Align = 'right' | 'left';

function Section({ title, align, children }: { title: string; align: Align; children: React.ReactNode }) {
  return (
    <View style={{ backgroundColor: '#fff', borderRadius: 12, padding: 12, marginTop: 10 }}>
      <Text style={{ fontSize: 13, fontWeight: '700', color: ap.onSurfaceVariant, textAlign: align, marginBottom: 6 }}>{title}</Text>
      {children}
    </View>
  );
}

function Line({ name, align, children }: { name: string; align: Align; children: React.ReactNode }) {
  return (
    <View style={{ paddingVertical: 5, borderTopWidth: 1, borderTopColor: ap.surfaceVariant }}>
      <Text style={{ fontSize: 12, fontWeight: '700', color: ap.onSurface, textAlign: align }}>{name}</Text>
      {children}
    </View>
  );
}

export default function CompareApplicantsModal({ visible, lang, applications, onClose }: { visible: boolean; lang: Lang; applications: Application[]; onClose: () => void }) {
  const he = lang === 'he';
  const align: Align = he ? 'right' : 'left';
  const projects = comparableProjects(applications);
  const [projectId, setProjectId] = useState(projects[0]?.projectId ?? '');
  const current = projects.find((p) => p.projectId === projectId) ?? projects[0];

  const checkRows: Array<{ id: string; labelHe: string; labelEn: string }> = [];
  for (const a of current?.apps ?? []) {
    for (const c of a.aiReview?.checks ?? []) {
      if (!checkRows.some((r) => r.id === c.id)) checkRows.push({ id: c.id, labelHe: c.labelHe, labelEn: c.labelEn });
    }
  }

  const small = { fontSize: 12, color: ap.onSurfaceVariant, textAlign: align } as const;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <ScrollView style={{ flex: 1, backgroundColor: ap.surfaceContainerLow }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <View style={{ flexDirection: he ? 'row-reverse' : 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: ap.onSurface }}>⚖️ {he ? 'השוואת מועמדים' : 'Compare applicants'}</Text>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={he ? 'סגור' : 'Close'} hitSlop={10}>
            <Text style={{ fontSize: 20, color: ap.outline }}>✕</Text>
          </Pressable>
        </View>

        {projects.length > 1 && (
          <View style={{ flexDirection: he ? 'row-reverse' : 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
            {projects.map((p) => (
              <Pressable
                key={p.projectId}
                onPress={() => setProjectId(p.projectId)}
                accessibilityRole="radio"
                accessibilityState={{ selected: current?.projectId === p.projectId }}
                style={{ borderWidth: 1, borderColor: current?.projectId === p.projectId ? ap.primary : ap.outlineVariant, backgroundColor: current?.projectId === p.projectId ? ap.primary : '#fff', borderRadius: 16, paddingHorizontal: 10, paddingVertical: 5 }}
              >
                <Text style={{ fontSize: 12, fontWeight: '600', color: current?.projectId === p.projectId ? ap.onPrimary : ap.onSurface }}>{he ? p.titleHe : p.titleEn}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {!current ? (
          <Text style={[small, { marginTop: 16 }]}>{he ? 'אין פרויקט עם שתי מועמדויות פתוחות או יותר.' : 'No project has two or more open applications.'}</Text>
        ) : (
          <>
            <Section align={align} title={he ? 'המלצת AI' : 'AI recommendation'}>
              {current.apps.map((a) => (
                <Line align={align} key={a.id} name={a.studentName}>
                  <Text style={{ fontSize: 12, fontWeight: '600', textAlign: align, color: RECOMMENDATION[a.aiReview?.recommendation ?? '']?.color ?? ap.onSurfaceVariant }}>
                    {a.aiReview ? (RECOMMENDATION[a.aiReview.recommendation]?.[lang] ?? a.aiReview.recommendation) : '—'}
                  </Text>
                </Line>
              ))}
            </Section>
            <Section align={align} title={he ? 'התאמת קורות חיים' : 'CV fit'}>
              {current.apps.map((a) => (
                <Line align={align} key={a.id} name={a.studentName}>
                  <Text style={small}>{a.aiScreening ? `${SCREENING[a.aiScreening.verdict]?.[lang] ?? a.aiScreening.verdict} — ${a.aiScreening.reasoning}` : '—'}</Text>
                </Line>
              ))}
            </Section>
            {checkRows.map((row) => (
              <Section align={align} key={row.id} title={he ? row.labelHe : row.labelEn}>
                {current.apps.map((a) => {
                  const c = a.aiReview?.checks.find((x) => x.id === row.id);
                  return (
                    <Line align={align} key={a.id} name={a.studentName}>
                      <Text style={{ fontSize: 12, fontWeight: '600', textAlign: align, color: c?.passed === true ? '#15803D' : c?.passed === false ? '#B91C1C' : ap.onSurfaceVariant }}>
                        {!c ? '—' : c.passed === true ? (he ? '✓ עומד' : '✓ Pass') : c.passed === false ? (he ? '✕ לא עומד' : '✕ Fail') : (he ? '– לא ניתן להעריך' : '– Not assessed')}
                      </Text>
                      {c ? <Text style={small}>{c.reasoning}</Text> : null}
                    </Line>
                  );
                })}
              </Section>
            ))}
            <Section align={align} title={he ? 'מכתב פנייה וקבצים' : 'Cover note & files'}>
              {current.apps.map((a) => (
                <Line align={align} key={a.id} name={a.studentName}>
                  <Text style={small}>{a.coverNote || '—'}</Text>
                  <View style={{ flexDirection: he ? 'row-reverse' : 'row', gap: 12, marginTop: 4 }}>
                    {a.transcriptUrl ? (
                      <Pressable onPress={() => Linking.openURL(a.transcriptUrl)} accessibilityRole="link">
                        <Text style={{ fontSize: 12, color: ap.primary, fontWeight: '600' }}>📄 {he ? 'גיליון ציונים' : 'Transcript'}</Text>
                      </Pressable>
                    ) : null}
                    {a.cvUrl ? (
                      <Pressable onPress={() => Linking.openURL(a.cvUrl)} accessibilityRole="link">
                        <Text style={{ fontSize: 12, color: ap.primary, fontWeight: '600' }}>📄 {he ? 'קורות חיים' : 'CV'}</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </Line>
              ))}
            </Section>
          </>
        )}
      </ScrollView>
    </Modal>
  );
}
