// components/modals/Enforce2FAModal.tsx
//
// system_admin action: announce a grace-period deadline after which every
// user must have two-factor authentication set up. Activating bulk-notifies
// every existing user (in-app + email, bilingual Hebrew/English instructions)
// — see server/src/controllers/twoFactorEnforcementController.ts. Self-
// contained (fetches its own status on open), same shell as
// StudentStatusesModal.tsx (reuses MaintenanceModalStyles).

import React, { useEffect, useState } from 'react';
import { Modal, View, Text, ScrollView, Pressable, ActivityIndicator, Alert } from 'react-native';
import { apiClient } from '../../src/api/apiClient';
import { MaintenanceModalStyles } from '../../constants/styles';

type Props = {
  visible: boolean;
  onClose: () => void;
  lang: 'he' | 'en';
};

interface Status {
  active: boolean;
  announcedAt: string | null;
  deadline: string | null;
  createdBy: string | null;
}

const DAY_OPTIONS = [1, 2, 3, 5, 7, 10, 14, 21, 30];

function daysRemaining(deadline: string | null): number | null {
  if (!deadline) return null;
  return Math.ceil((new Date(deadline).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}

export default function Enforce2FAModal({ visible, onClose, lang }: Props) {
  const isHe = lang === 'he';

  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [graceDays, setGraceDays] = useState(7);
  const [activating, setActivating] = useState(false);
  const [deactivating, setDeactivating] = useState(false);

  useEffect(() => {
    if (!visible) return;
    (async () => {
      try {
        setLoading(true);
        const res = await apiClient.get('/api/admin/system/2fa-enforcement-status');
        setStatus(res.data);
      } catch (e) {
        console.error('Failed to load 2FA enforcement status:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, [visible]);

  const remaining = daysRemaining(status?.deadline ?? null);
  const pastDeadline = remaining !== null && remaining <= 0;

  const handleActivate = async () => {
    try {
      setActivating(true);
      const res = await apiClient.post('/api/admin/system/enforce-2fa', { graceDays });
      setStatus({ active: true, deadline: res.data.deadline, announcedAt: null, createdBy: null });
      Alert.alert(
        '✅',
        isHe
          ? `האכיפה הופעלה — ${res.data.notified} משתמשים קיבלו הודעה`
          : `Enforcement activated — ${res.data.notified} users notified`
      );
    } catch (e: any) {
      Alert.alert(isHe ? 'שגיאה' : 'Error', e.response?.data?.message || (isHe ? 'הפעלת האכיפה נכשלה' : 'Failed to activate enforcement'));
    } finally {
      setActivating(false);
    }
  };

  const handleDeactivate = async () => {
    try {
      setDeactivating(true);
      await apiClient.delete('/api/admin/system/enforce-2fa');
      setStatus((prev) => (prev ? { ...prev, active: false } : prev));
    } catch (e: any) {
      Alert.alert(isHe ? 'שגיאה' : 'Error', e.response?.data?.message || (isHe ? 'ביטול האכיפה נכשל' : 'Failed to cancel enforcement'));
    } finally {
      setDeactivating(false);
    }
  };

  const previewText = isHe
    ? `🔐 אימות דו-שלבי (2FA) יהפוך לחובה בעוד ${graceDays} ${graceDays === 1 ? 'יום' : 'ימים'}\n\nהחל מהתאריך שנקבע, המערכת תחייב 2FA לכל המשתמשים. מומלץ להגדיר זאת כבר עכשיו.\nאיך להפעיל: היכנסו ל"אימות דו-שלבי" בהגדרות ← סרקו את קוד ה-QR באמצעות Google Authenticator ← הזינו את הקוד בן 6 הספרות.`
    : `🔐 Two-Factor Authentication (2FA) Becomes Mandatory in ${graceDays} ${graceDays === 1 ? 'day' : 'days'}\n\nStarting on the deadline date, the system will require 2FA for every user. We recommend setting it up now.\nHow to enable it: open "Two-Factor Authentication" in Settings → scan the QR code using Google Authenticator → enter the 6-digit code.`;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={[s.sheet, { maxHeight: '92%' }]}>
          <View style={s.header}>
            <View style={s.headerLeft}>
              <View style={s.headerIcon}>
                <Text style={s.headerIconText}>🔐</Text>
              </View>
              <View>
                <Text style={s.headerTitle}>{isHe ? 'אכיפת אימות דו-שלבי' : 'Enforce 2FA'}</Text>
                <Text style={s.headerSub}>{isHe ? 'חובה לכל המשתמשים' : 'Mandatory for all users'}</Text>
              </View>
            </View>
            <Pressable style={s.closeBtn} onPress={onClose} accessibilityRole="button" accessibilityLabel={isHe ? 'סגור' : 'Close'}>
              <Text style={s.closeBtnText}>✕</Text>
            </Pressable>
          </View>

          <ScrollView style={s.body} contentContainerStyle={{ paddingBottom: 8 }}>
            <View style={s.section}>
              <Text style={s.fieldHint}>
                {isHe
                  ? 'כל המשתמשים יקבלו הודעה (במערכת + אימייל) בעברית ובאנגלית עם הסבר כיצד להפעיל. בתום התקופה, מי שלא הגדיר יחויב לסרוק קוד QR לפני המשך שימוש.'
                  : "Every user gets a notice (in-app + email) in Hebrew and English explaining how to enable it. Once the deadline passes, anyone who hasn't set it up will be required to scan a QR code before continuing."}
              </Text>

              {loading ? (
                <ActivityIndicator />
              ) : status?.active ? (
                <View style={s.statusCard}>
                  <View>
                    <Text style={s.statusTitle}>
                      {isHe ? 'אכיפה פעילה — ' : 'Enforcement active — '}
                      <Text style={pastDeadline ? s.statusBlocked : s.statusLive}>
                        {pastDeadline
                          ? isHe ? 'המועד עבר' : 'deadline passed'
                          : isHe ? `${remaining} ${remaining === 1 ? 'יום נותר' : 'ימים נותרו'}` : `${remaining} ${remaining === 1 ? 'day' : 'days'} left`}
                      </Text>
                    </Text>
                    {status.deadline && (
                      <Text style={s.statusSub}>
                        {isHe ? 'תאריך יעד: ' : 'Deadline: '}
                        {new Date(status.deadline).toLocaleDateString(isHe ? 'he-IL' : 'en-US')}
                      </Text>
                    )}
                  </View>
                  <Pressable style={[s.endNowBtn, deactivating && s.endNowBtnDisabled]} onPress={handleDeactivate} disabled={deactivating}>
                    <Text style={s.endNowBtnText}>{deactivating ? '…' : isHe ? 'בטל אכיפה' : 'Cancel'}</Text>
                  </Pressable>
                </View>
              ) : (
                <Text style={{ fontSize: 13, color: '#0F172A' }}>{isHe ? 'אין אכיפה פעילה כרגע' : 'No enforcement currently active'}</Text>
              )}
            </View>

            <View style={s.divider} />

            <View style={s.section}>
              <Text style={s.sectionLabel}>{isHe ? 'תקופת התארגנות' : 'Grace period'}</Text>
              <View style={s.rolesGrid}>
                {DAY_OPTIONS.map((d) => (
                  <Pressable
                    key={d}
                    style={[s.roleChip, graceDays === d && s.roleChipSelected]}
                    onPress={() => setGraceDays(d)}
                  >
                    <Text style={[s.roleChipText, graceDays === d && s.roleChipTextSelected]}>
                      {d} {isHe ? (d === 1 ? 'יום' : 'ימים') : d === 1 ? 'day' : 'days'}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={s.section}>
              <View style={s.previewBox}>
                <Text style={s.previewLabel}>{isHe ? 'מה המשתמשים יקבלו' : 'What users will receive'}</Text>
                <Text style={s.previewText}>{previewText}</Text>
              </View>
            </View>
          </ScrollView>

          <View style={s.footer}>
            <Pressable
              style={[s.saveBtn, activating && s.saveBtnDisabled]}
              onPress={handleActivate}
              disabled={activating}
            >
              <Text style={s.saveBtnText}>
                {activating ? '…' : status?.active ? (isHe ? `עדכן ל-${graceDays} ימים ושלח שוב` : `Update to ${graceDays} days & re-notify`) : (isHe ? 'הפעל ושלח לכולם' : 'Activate & notify everyone')}
              </Text>
            </Pressable>
            <Pressable style={s.cancelBtn} onPress={onClose}>
              <Text style={s.cancelBtnText}>{isHe ? 'סגור' : 'Close'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = MaintenanceModalStyles;
