// components/ThesisExamAlert.tsx
// Mobile mirror of web/components/dashboard/ThesisExamAlert.tsx: a strip
// under the TopBar of every screen while a thesis exam step is waiting on
// this user (picking the 5 dates, approvals, the exam form). The menu entry
// alone was easy to miss, and one person not acting holds up the whole exam.
// Not dismissable — it goes away once the step is done (NotificationsContext
// refetches on every new notification). Hidden on the thesis-exam screen.

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import type { Lang } from './i18n';
import { useNotifications } from '../src/context/NotificationsContext';
import { formatTaskDeadline, thesisExamTaskLabel } from '../utils/thesisExamTasks';

const ACCENT = '#b8862e';

export function ThesisExamAlert({ lang, isRtl }: { lang: Lang; isRtl: boolean }) {
  const { thesisExamTasks: tasks } = useNotifications();
  const router = useRouter();
  const pathname = usePathname();
  const he = lang === 'he';
  if (tasks.length === 0 || pathname?.startsWith('/thesis-exam')) return null;

  return (
    <View style={s.wrap} accessibilityRole="alert">
      {tasks.map((t) => (
        <Text key={`${t.milestoneId}-${t.kind}`} style={[s.line, { textAlign: isRtl ? 'right' : 'left' }]}>
          🎓 <Text style={s.bold}>{he ? 'בחינת תזה' : 'Thesis exam'}</Text>
          {t.studentNames.length > 0 ? ` — ${t.studentNames.join(', ')}` : ''}
          {': '}
          <Text style={s.bold}>{thesisExamTaskLabel(t.kind, lang)}</Text>
          {t.deadline ? (he ? ` עד ${formatTaskDeadline(t.deadline, lang)}` : ` by ${formatTaskDeadline(t.deadline, lang)}`) : ''}
        </Text>
      ))}
      <Pressable
        style={[s.btn, { alignSelf: isRtl ? 'flex-end' : 'flex-start' }]}
        onPress={() => router.push({ pathname: '/thesis-exam', params: { lang } } as any)}
        accessibilityRole="button"
      >
        <Text style={s.btnText}>{he ? 'לביצוע עכשיו' : 'Do it now'}</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    backgroundColor: 'rgba(184,134,46,0.15)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(184,134,46,0.4)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 4,
  },
  line: { fontSize: 14, color: '#1f2933', lineHeight: 20 },
  bold: { fontWeight: '700' },
  btn: { marginTop: 4, backgroundColor: ACCENT, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 },
  btnText: { color: '#ffffff', fontSize: 13, fontWeight: '700' },
});
