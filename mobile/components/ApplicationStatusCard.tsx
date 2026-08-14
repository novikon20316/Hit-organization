// components/ApplicationStatusCard.tsx
// One row per pending application in BrowseProjects' "My Applications" panel
// — extracted from the old full-screen Pendingscreen.tsx now that a student
// can have several of these open at once instead of exactly one.
import React from 'react';
import { View, Text, Pressable, Alert } from 'react-native';
import type { Lang } from '../components/i18n';
import type { PendingApplication } from '@/types';
import { PendingScreenStyles as styles } from '@/constants';
import { apiClient } from '../src/api/apiClient';

interface Props {
  application: PendingApplication;
  lang: Lang;
  isRtl: boolean;
  onWithdrawn: () => void;
}

export default function ApplicationStatusCard({ application, lang, isRtl, onWithdrawn }: Props) {
  const submittedDate = application.submittedAt
    ? new Date(application.submittedAt).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric' })
    : '—';
  const isMeetingRequested = application.status === 'meeting_requested';
  const isAwaitingConfirmation = application.status === 'awaiting_student_confirmation';
  const reviewedDate = application.reviewedAt
    ? new Date(application.reviewedAt).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  const handleWithdraw = () => {
    Alert.alert(
      lang === 'he' ? 'משיכת מועמדות' : 'Withdraw Application',
      lang === 'he' ? 'האם אתה בטוח שברצונך למשוך את המועמדות?' : 'Are you sure you want to withdraw your application?',
      [
        { text: lang === 'he' ? 'ביטול' : 'Cancel', style: 'cancel' },
        {
          text: lang === 'he' ? 'משוך' : 'Withdraw',
          style: 'destructive',
          onPress: async () => {
            try {
              await apiClient.post(`/api/applications/${application.id}/withdraw`);
              onWithdrawn();
            } catch (err: any) {
              console.error(err);
              Alert.alert('Error', err.response?.data?.message || 'Action failed');
            }
          },
        },
      ]
    );
  };

  const confirmStart = async (decision: 'yes' | 'no') => {
    try {
      await apiClient.post(`/api/applications/${application.id}/confirm-start`, { decision });
      onWithdrawn();
    } catch (err: any) {
      console.error(err);
      Alert.alert('Error', err.response?.data?.message || 'Action failed');
    }
  };

  const handleDecline = () => {
    Alert.alert(
      lang === 'he' ? 'דחיית הפרויקט' : 'Decline the Project',
      lang === 'he'
        ? 'האם אתה בטוח שאינך רוצה להתחיל בפרויקט זה? המנחה יקבל התראה על כך.'
        : "Are you sure you don't want to start this project? The supervisor will be notified.",
      [
        { text: lang === 'he' ? 'ביטול' : 'Cancel', style: 'cancel' },
        { text: lang === 'he' ? 'כן, דחה' : 'Yes, decline', style: 'destructive', onPress: () => confirmStart('no') },
      ]
    );
  };

  return (
    <View style={[styles.infoCard, { marginBottom: 12 }]}>
      <View style={[styles.row, isRtl && styles.rowReverse]}>
        <Text style={styles.rowLabel}>{lang === 'he' ? application.projectTitleHe : application.projectTitleEn}</Text>
        <Text style={[styles.rowValue, styles.rowValueHighlight]}>
          {isAwaitingConfirmation
            ? (lang === 'he' ? '🎉 אושר — ממתין לאישורך' : '🎉 Approved — awaiting your decision')
            : isMeetingRequested
              ? (lang === 'he' ? '📅 נדרשת פגישה' : '📅 Meeting Requested')
              : (lang === 'he' ? '⏳ ממתין לאישור' : '⏳ Awaiting Review')}
        </Text>
      </View>
      <View style={styles.divider} />
      <View style={[styles.row, isRtl && styles.rowReverse]}>
        <Text style={styles.rowLabel}>{lang === 'he' ? 'הוגש בתאריך' : 'Submitted on'}</Text>
        <Text style={styles.rowValue}>{submittedDate}</Text>
      </View>

      {reviewedDate && isMeetingRequested && (
        <View style={[styles.row, isRtl && styles.rowReverse]}>
          <Text style={styles.rowLabel}>{lang === 'he' ? 'המנחה השיב בתאריך' : 'Supervisor answered on'}</Text>
          <Text style={styles.rowValue}>{reviewedDate}</Text>
        </View>
      )}

      {isMeetingRequested && (
        <View style={[styles.meetingBanner, { marginTop: 12, marginBottom: 0 }]}>
          <Text style={styles.meetingIcon}>📅</Text>
          <Text style={[styles.meetingText, isRtl && styles.textRight]}>
            {lang === 'he'
              ? 'המנחה ביקש להיפגש איתך לפני אישור המועמדות. יש לתאם פגישה.'
              : 'The supervisor has requested a meeting before approving your application. Please arrange a meeting.'}
          </Text>
        </View>
      )}

      {isAwaitingConfirmation && (
        <>
          <View style={[styles.confirmBanner, { marginTop: 12 }]}>
            <Text style={styles.confirmIcon}>🎉</Text>
            <Text style={[styles.confirmText, isRtl && styles.textRight]}>
              {lang === 'he'
                ? 'המנחה אישר את בקשתך! האם ברצונך להתחיל בפרויקט זה? אישור יסגור אוטומטית את שאר הבקשות הממתינות שלך.'
                : 'The supervisor approved your application! Do you want to start this project? Confirming will automatically close your other pending applications.'}
            </Text>
          </View>
          <View style={styles.confirmRow}>
            <Pressable style={styles.confirmYesBtn} onPress={() => confirmStart('yes')}>
              <Text style={styles.confirmYesText}>{lang === 'he' ? 'כן, התחל בפרויקט' : 'Yes, start this project'}</Text>
            </Pressable>
            <Pressable style={styles.withdrawBtn} onPress={handleDecline}>
              <Text style={styles.withdrawText}>{lang === 'he' ? 'לא, תודה' : 'No, thanks'}</Text>
            </Pressable>
          </View>
        </>
      )}

      {!isAwaitingConfirmation && (
        <Pressable style={[styles.withdrawBtn, { marginTop: 12, alignSelf: 'flex-start' }]} onPress={handleWithdraw}>
          <Text style={styles.withdrawText}>{lang === 'he' ? 'משוך מועמדות' : 'Withdraw Application'}</Text>
        </Pressable>
      )}
    </View>
  );
}
