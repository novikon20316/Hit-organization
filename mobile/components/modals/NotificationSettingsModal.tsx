// components/modals/NotificationSettingsModal.tsx
// The signed-in user's own notification settings — mobile counterpart of
// web's app/notifications/NotificationSettingsModal.tsx, on the same
// GET/PUT /api/users/me/notification-prefs (server notificationPrefs.ts).
// Per category: which outside channels also carry a notification, plus an
// optional daily email digest. In-app notifications, task badges and
// security & account alerts are always on.
import React, { useEffect, useState } from 'react';
import { Modal, View, Text, ScrollView, Pressable, Switch, ActivityIndicator } from 'react-native';
import { apiClient } from '../../src/api/apiClient';
import { ap } from '../../constants/theme';
import type { Lang } from '../i18n';

type Category = 'messages' | 'deadlines' | 'workflow' | 'announcements';
type Channel = 'email' | 'push' | 'sms' | 'whatsapp';
interface Prefs {
  channels: Record<Category, Record<Channel, boolean>>;
  emailDigest: boolean;
}

const CATEGORIES: Array<{ key: Category; he: string; en: string; hintHe: string; hintEn: string }> = [
  { key: 'messages', he: 'הודעות', en: 'Messages', hintHe: 'צ׳אט והודעות מהרכזת', hintEn: 'Chat and coordinator messages' },
  { key: 'deadlines', he: 'מועדים ותזכורות', en: 'Deadlines & reminders', hintHe: 'מועדי הגשה, איחורים, אבני דרך תקועות', hintEn: 'Due dates, overdue and stuck milestones' },
  { key: 'workflow', he: 'אישורים והתקדמות', en: 'Approvals & progress', hintHe: 'הגשות, ציונים, אישורים, מועמדויות, הגנות', hintEn: 'Submissions, grades, approvals, applications, defenses' },
  { key: 'announcements', he: 'הודעות כלליות', en: 'Announcements', hintHe: 'הודעות מערכת ופרויקטים חדשים', hintEn: 'System announcements and new projects' },
];

const CHANNELS: Array<{ key: Channel; he: string; en: string }> = [
  { key: 'email', he: 'דוא"ל', en: 'Email' },
  { key: 'push', he: 'התראה לנייד', en: 'Push' },
  { key: 'sms', he: 'SMS', en: 'SMS' },
  { key: 'whatsapp', he: 'WhatsApp', en: 'WhatsApp' },
];

export default function NotificationSettingsModal({ visible, lang, onClose }: { visible: boolean; lang: Lang; onClose: () => void }) {
  const he = lang === 'he';
  const align = he ? 'right' : 'left';
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    apiClient.get('/api/users/me/notification-prefs')
      .then((res) => setPrefs(res.data.prefs as Prefs))
      .catch((err: any) => setError(err?.response?.data?.message || (he ? 'הטעינה נכשלה' : 'Failed to load')));
  }, [he]);

  const toggle = (category: Category, channel: Channel) => {
    setSaved(false);
    setPrefs((p) => p && { ...p, channels: { ...p.channels, [category]: { ...p.channels[category], [channel]: !p.channels[category][channel] } } });
  };

  const save = async () => {
    if (!prefs) return;
    setSaving(true);
    setError('');
    try {
      const res = await apiClient.put('/api/users/me/notification-prefs', { prefs });
      setPrefs(res.data.prefs as Prefs);
      setSaved(true);
    } catch (err: any) {
      setError(err?.response?.data?.message || (he ? 'השמירה נכשלה' : 'Failed to save'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <ScrollView style={{ flex: 1, backgroundColor: ap.surfaceContainerLow }} contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <View style={{ flexDirection: he ? 'row-reverse' : 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: ap.onSurface }}>⚙️ {he ? 'הגדרות התראות' : 'Notification settings'}</Text>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={he ? 'סגור' : 'Close'} hitSlop={10}>
            <Text style={{ fontSize: 20, color: ap.outline }}>✕</Text>
          </Pressable>
        </View>
        <Text style={{ marginTop: 8, fontSize: 12, color: ap.onSurfaceVariant, textAlign: align }}>
          {he
            ? 'בחרו לאן תגיע כל התראה בנוסף למערכת. התראות בתוך המערכת ותגי משימות פתוחות תמיד פעילים. התראות אבטחה וחשבון נשלחות תמיד.'
            : 'Choose where each notification also goes, besides the app. In-app notifications and open-task badges are always on. Security & account alerts are always sent.'}
        </Text>

        {!prefs ? (
          <View style={{ marginTop: 24, alignItems: 'center' }}>
            {error ? <Text style={{ color: '#EF4444' }}>{error}</Text> : <ActivityIndicator color={ap.primary} />}
          </View>
        ) : (
          <>
            {CATEGORIES.map((cat) => (
              <View key={cat.key} style={{ marginTop: 14, backgroundColor: '#fff', borderRadius: 12, padding: 14 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: ap.onSurface, textAlign: align }}>{he ? cat.he : cat.en}</Text>
                <Text style={{ fontSize: 12, color: ap.onSurfaceVariant, textAlign: align, marginBottom: 6 }}>{he ? cat.hintHe : cat.hintEn}</Text>
                {CHANNELS.map((ch) => (
                  <View key={ch.key} style={{ flexDirection: he ? 'row-reverse' : 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 }}>
                    <Text style={{ fontSize: 14, color: ap.onSurface }}>{he ? ch.he : ch.en}</Text>
                    <Switch
                      value={prefs.channels[cat.key][ch.key]}
                      onValueChange={() => toggle(cat.key, ch.key)}
                      accessibilityLabel={`${he ? cat.he : cat.en} — ${he ? ch.he : ch.en}`}
                    />
                  </View>
                ))}
              </View>
            ))}

            <View style={{ marginTop: 14, backgroundColor: '#fff', borderRadius: 12, padding: 14, flexDirection: he ? 'row-reverse' : 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: ap.onSurface, textAlign: align }}>{he ? 'סיכום יומי בדוא"ל' : 'Daily email digest'}</Text>
                <Text style={{ fontSize: 12, color: ap.onSurfaceVariant, textAlign: align }}>
                  {he ? 'במקום מיילים מיידיים — פעם ביום בסביבות 08:00. התראות אבטחה נשלחות מיד.' : 'Instead of instant emails — once a day around 08:00. Security alerts are still sent right away.'}
                </Text>
              </View>
              <Switch
                value={prefs.emailDigest}
                onValueChange={() => { setSaved(false); setPrefs((p) => p && { ...p, emailDigest: !p.emailDigest }); }}
                accessibilityLabel={he ? 'סיכום יומי בדוא"ל' : 'Daily email digest'}
              />
            </View>

            {error ? <Text style={{ marginTop: 12, color: '#EF4444', textAlign: align }} accessibilityRole="alert">{error}</Text> : null}
            {saved ? <Text style={{ marginTop: 12, color: '#10B981', fontWeight: '600', textAlign: align }}>✅ {he ? 'ההגדרות נשמרו' : 'Settings saved'}</Text> : null}

            <Pressable
              onPress={save}
              disabled={saving}
              accessibilityRole="button"
              style={{ marginTop: 16, backgroundColor: ap.primary, borderRadius: 10, paddingVertical: 12, alignItems: 'center', opacity: saving ? 0.6 : 1 }}
            >
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={{ color: ap.onPrimary, fontWeight: '700', fontSize: 14 }}>{he ? 'שמור' : 'Save'}</Text>}
            </Pressable>
          </>
        )}
      </ScrollView>
    </Modal>
  );
}
