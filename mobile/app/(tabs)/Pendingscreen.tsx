// student/screens/PendingScreen.tsx
import React from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, Alert,
} from 'react-native';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../src/firebase/firebase';
import { tx, type Lang } from '../../components/i18n';
import type { PendingApplication } from '../../hooks/useStudentData';
import {PendingScreenStyles} from '@/constants'
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

const styles = PendingScreenStyles