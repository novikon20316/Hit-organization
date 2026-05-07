// student/screens/PendingScreen.tsx
import React from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, Alert,
} from 'react-native';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../src/firebase/firebase';
import { tx, type Lang } from '../../components/i18n';
import type { PendingApplication } from '../../hooks/useStudentData';

interface Props {
  application: PendingApplication;
  lang:        Lang;
  isRtl:       boolean;
}

export default function PendingScreen({ application, lang, isRtl }: Props) {
  const submittedDate = application.submittedAt?.toDate
    ? application.submittedAt.toDate().toLocaleDateString(
        lang === 'he' ? 'he-IL' : 'en-GB',
        { day: 'numeric', month: 'long', year: 'numeric' }
      )
    : '—';

  const handleWithdraw = () => {
    Alert.alert(
      lang === 'he' ? 'משיכת מועמדות' : 'Withdraw Application',
      lang === 'he'
        ? 'האם אתה בטוח שברצונך למשוך את המועמדות?'
        : 'Are you sure you want to withdraw your application?',
      [
        { text: lang === 'he' ? 'ביטול' : 'Cancel', style: 'cancel' },
        {
          text: lang === 'he' ? 'משוך' : 'Withdraw',
          style: 'destructive',
          onPress: async () => {
            await updateDoc(doc(db, 'applications', application.id), {
              status: 'withdrawn',
            });
          },
        },
      ]
    );
  };

  const isMeetingRequested = application.status === 'meeting_requested';

  return (
    <ScrollView contentContainerStyle={styles.container}>

      {/* Status illustration */}
      <View style={styles.illustrationWrap}>
        <View style={styles.pulseOuter}>
          <View style={styles.pulseInner}>
            <Text style={styles.pulseEmoji}>⏳</Text>
          </View>
        </View>
      </View>

      {/* Title */}
      <Text style={[styles.title, isRtl && styles.textCenter]}>
        {tx('pendingTitle', lang)}
      </Text>
      <Text style={[styles.subtitle, isRtl && styles.textCenter]}>
        {tx('pendingSubtitle', lang)}
      </Text>

      {/* Meeting requested banner */}
      {isMeetingRequested && (
        <View style={styles.meetingBanner}>
          <Text style={styles.meetingIcon}>📅</Text>
          <Text style={[styles.meetingText, isRtl && styles.textRight]}>
            {lang === 'he'
              ? 'המנחה ביקש להיפגש איתך לפני אישור המועמדות. יש לתאם פגישה.'
              : 'The supervisor has requested a meeting before approving your application. Please arrange a meeting.'}
          </Text>
        </View>
      )}

      {/* Application info card */}
      <View style={styles.infoCard}>
        <Row
          label={tx('pendingProject', lang)}
          value={lang === 'he' ? application.projectTitleHe : application.projectTitleEn}
          isRtl={isRtl}
        />
        <View style={styles.divider} />
        <Row
          label={tx('pendingSince', lang)}
          value={submittedDate}
          isRtl={isRtl}
        />
        <View style={styles.divider} />
        <Row
          label={lang === 'he' ? 'סטטוס' : 'Status'}
          value={isMeetingRequested
            ? (lang === 'he' ? '📅 נדרשת פגישה' : '📅 Meeting Requested')
            : (lang === 'he' ? '⏳ ממתין לאישור' : '⏳ Awaiting Review')}
          isRtl={isRtl}
          highlight
        />
      </View>

      {/* Info note */}
      <View style={styles.noteCard}>
        <Text style={styles.noteIcon}>ℹ️</Text>
        <Text style={[styles.noteText, isRtl && styles.textRight]}>
          {tx('pendingNote', lang)}
        </Text>
      </View>

      {/* Steps */}
      <View style={styles.stepsCard}>
        <Text style={[styles.stepsTitle, isRtl && styles.textRight]}>
          {lang === 'he' ? 'מה קורה עכשיו?' : "What happens next?"}
        </Text>
        {[
          {
            he: 'המנחה בודק את קורות החיים וגיליון הציונים שלך',
            en: 'The supervisor reviews your CV and transcript',
          },
          {
            he: isMeetingRequested
              ? 'המנחה ביקש להיפגש — תאם פגישה בהקדם'
              : 'המנחה יאשר, ידחה, או יבקש להיפגש',
            en: isMeetingRequested
              ? 'The supervisor wants to meet — schedule a meeting'
              : 'The supervisor will approve, reject, or request a meeting',
          },
          {
            he: 'תקבל/י התראה באפליקציה ובמייל עם קבלת תשובה',
            en: 'You will receive an in-app and email notification with the decision',
          },
          {
            he: 'עם אישור — הפרויקט יוצא לדרך!',
            en: 'Upon approval — the project begins!',
          },
        ].map((step, i) => (
          <View key={i} style={[styles.step, isRtl && styles.stepRtl]}>
            <View style={[
              styles.stepDot,
              isMeetingRequested && i === 1 ? styles.stepDotAlert : {},
            ]}>
              <Text style={styles.stepNum}>{i + 1}</Text>
            </View>
            <Text style={[styles.stepText, isRtl && styles.textRight]}>
              {lang === 'he' ? step.he : step.en}
            </Text>
          </View>
        ))}
      </View>

      {/* Withdraw */}
      <Pressable style={styles.withdrawBtn} onPress={handleWithdraw}>
        <Text style={styles.withdrawText}>{tx('withdrawApp', lang)}</Text>
      </Pressable>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

function Row({ label, value, isRtl, highlight }: {
  label: string; value: string; isRtl: boolean; highlight?: boolean;
}) {
  return (
    <View style={[styles.row, isRtl && styles.rowReverse]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, highlight && styles.rowValueHighlight]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container:    { padding: 20, backgroundColor: '#F0F4FF', alignItems: 'center' },
  textCenter:   { textAlign: 'center' },
  textRight:    { textAlign: 'right' },
  rowReverse:   { flexDirection: 'row-reverse' },

  illustrationWrap: { marginTop: 20, marginBottom: 24, alignItems: 'center' },
  pulseOuter: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: '#E3EEFF', justifyContent: 'center', alignItems: 'center',
  },
  pulseInner: {
    width: 70, height: 70, borderRadius: 35,
    backgroundColor: '#C5D9FF', justifyContent: 'center', alignItems: 'center',
  },
  pulseEmoji: { fontSize: 32 },

  title:    { fontSize: 22, fontWeight: '800', color: '#111', marginBottom: 8, textAlign: 'center' },
  subtitle: { fontSize: 14, color: '#667', textAlign: 'center', marginBottom: 24, lineHeight: 20 },

  meetingBanner: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: '#FFF8E1', borderRadius: 14, padding: 14,
    borderLeftWidth: 4, borderLeftColor: '#FFB300',
    marginBottom: 16, width: '100%',
  },
  meetingIcon: { fontSize: 18, marginRight: 10 },
  meetingText: { flex: 1, fontSize: 13, color: '#6D4C00', lineHeight: 19 },

  infoCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 18,
    width: '100%', marginBottom: 16,
    borderWidth: 1, borderColor: '#E0E8FF',
    shadowColor: '#2E86FF', shadowOpacity: 0.07, shadowRadius: 8, elevation: 2,
  },
  row:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: 4 },
  rowLabel:  { fontSize: 13, color: '#8899BB', fontWeight: '500' },
  rowValue:  { fontSize: 13, color: '#111', fontWeight: '600', flex: 1, textAlign: 'right', marginLeft: 8 },
  rowValueHighlight: { color: '#2E86FF' },
  divider:   { height: 1, backgroundColor: '#F0F4FF', marginVertical: 8 },

  noteCard: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: '#E8F4FD', borderRadius: 12, padding: 12,
    width: '100%', marginBottom: 16,
  },
  noteIcon: { fontSize: 16, marginRight: 8 },
  noteText: { flex: 1, fontSize: 12, color: '#1A5276', lineHeight: 18 },

  stepsCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 18,
    width: '100%', marginBottom: 20,
    borderWidth: 1, borderColor: '#E0E8FF',
  },
  stepsTitle: { fontSize: 14, fontWeight: '700', color: '#111', marginBottom: 14 },
  step:       { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  stepRtl:    { flexDirection: 'row-reverse' },
  stepDot: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: '#2E86FF', justifyContent: 'center', alignItems: 'center',
    marginRight: 10, marginLeft: 0, flexShrink: 0,
  },
  stepDotAlert: { backgroundColor: '#FFB300' },
  stepNum:  { color: '#fff', fontSize: 11, fontWeight: '800' },
  stepText: { flex: 1, fontSize: 13, color: '#445', lineHeight: 19 },

  withdrawBtn: {
    paddingVertical: 12, paddingHorizontal: 28,
    borderRadius: 12, borderWidth: 1, borderColor: '#FFCDD2',
    backgroundColor: '#FFF0F0',
  },
  withdrawText: { color: '#D32F2F', fontWeight: '600', fontSize: 14 },
});