// components/shared.tsx
// Shared across Supervisor, Examiner, and Admin pages

import React, { useEffect, useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, Modal, TextInput,
  ActivityIndicator, Image, Alert, Linking
} from 'react-native';
import { signOut } from 'firebase/auth';
import { auth, db } from '../src/firebase/firebase';
import { doc, getDoc, Timestamp } from 'firebase/firestore';
import { useRouter } from 'expo-router';
import type { Lang } from './i18n';
import { NotificationBell } from './NotificationBell';
import { apiClient } from '../src/api/apiClient';

// ─── Faculty / Department color palette ───────────────────────────────────────
export const FACULTY_COLORS: Record<string, {
  primary: string;
  light:   string;
  label:   { he: string; en: string };
}> = {
  sciences: {
    primary: '#2E86FF',
    light:   '#EFF6FF',
    label:   { he: 'הפקולטה למדעים', en: 'Faculty of Sciences' },
  },
  electrical: {
    primary: '#F59E0B',
    light:   '#FFFBEB',
    label:   { he: 'הפקולטה להנדסת חשמל ואלקטרוניקה', en: 'Faculty of Electrical & Electronics Engineering' },
  },
  industrial: {
    primary: '#8B5CF6',
    light:   '#F5F3FF',
    label:   { he: 'הפקולטה להנדסת תעשייה וניהול טכנולוגיה', en: 'Faculty of Industrial Engineering & Technology Management' },
  },
  learning_tech: {
    primary: '#10B981',
    light:   '#ECFDF5',
    label:   { he: 'הפקולטה לטכנולוגיות למידה', en: 'Faculty of Learning Technologies' },
  },
  medical_tech: {
    primary: '#EF4444',
    light:   '#FEF2F2',
    label:   { he: 'הפקולטה לטכנולוגיות רפואיות', en: 'Faculty of Medical Technologies' },
  },
  design: {
    primary: '#EC4899',
    light:   '#FDF2F8',
    label:   { he: 'הפקולטה לעיצוב', en: 'Faculty of Design' },
  },
  default: {
    primary: '#64748B',
    light:   '#F1F5F9',
    label:   { he: 'פקולטה', en: 'Faculty' },
  },
};

export function getFacultyColor(facultyId: string) {
  return FACULTY_COLORS[facultyId] ?? FACULTY_COLORS.default;
}

// ─── Role accent colors ───────────────────────────────────────────────────────
export const ROLE_ACCENT = {
  supervisor:  { bg: '#EFF6FF', text: '#2E86FF', label: { he: 'מנחה',         en: 'Supervisor'  } },
  examiner:    { bg: '#F5F3FF', text: '#8B5CF6', label: { he: 'בוחן',          en: 'Examiner'    } },
  system_admin:{ bg: '#FEF2F2', text: '#EF4444', label: { he: 'מנהל מערכת',   en: 'System Admin'} },
  coordinator: { bg: '#ECFDF5', text: '#10B981', label: { he: 'רכז פרויקטים', en: 'Coordinator' } },
  faculty_admin:{ bg: '#ECFEFF', text: '#06B6D4', label: { he: 'מנהל פקולטה', en: 'Faculty Admin'} },
};

// ─── 2FA Security Modal ───────────────────────────────────────────────────────
// Self-contained — handles setup and verify flows internally.
function SecurityModal({ visible, onClose, lang }: {
  visible: boolean;
  onClose: () => void;
  lang: Lang;
}) {
  // 'loading' | 'status' | 'setup' | 'confirm_setup'
  const [screen, setScreen]         = useState<'loading' | 'status' | 'setup' | 'confirm_setup'>('loading');
  const [totpEnabled, setTotpEnabled] = useState(false);
  const [qrCode, setQrCode]         = useState<string | null>(null);
  const [otpauthUrl, setOtpauthUrl] = useState<string | null>(null);
  const [token, setToken]           = useState('');
  const [error, setError]           = useState('');
  const [busy, setBusy]             = useState(false);

  const isRtl = lang === 'he';

  // Load 2FA status whenever modal opens
  useEffect(() => {
    if (!visible) return;
    setScreen('loading');
    setToken('');
    setError('');
    setQrCode(null);

    const uid = auth.currentUser?.uid;
    if (!uid) { onClose(); return; }

    getDoc(doc(db, 'users', uid)).then(snap => {
      setTotpEnabled(snap.data()?.totp_enabled ?? false);
      setScreen('status');
    }).catch(() => setScreen('status'));
  }, [visible]);

  // Step 1: fetch QR from backend
  const handleStartSetup = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await apiClient.post('/api/auth/2fa/setup');
      setQrCode(res.data.qrCode);
      setOtpauthUrl(res.data.otpauthUrl);
      setScreen('setup');
    } catch {
      setError(lang === 'he' ? 'שגיאה בהפקת קוד QR' : 'Failed to generate QR code.');
    } finally {
      setBusy(false);
    }
  };

  // Step 2: confirm the 6-digit code to activate 2FA
  const handleConfirmSetup = async () => {
    if (token.length !== 6) {
      setError(lang === 'he' ? 'יש להזין 6 ספרות' : 'Enter the full 6-digit code.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await apiClient.post('/api/auth/2fa/verify', { token });
      setTotpEnabled(true);
      setScreen('status');
      Alert.alert(
        lang === 'he' ? '✅ הופעל בהצלחה' : '✅ 2FA Activated',
        lang === 'he' ? 'האימות הדו-שלבי הופעל על החשבון שלך.' : '2FA is now active on your account.',
      );
    } catch {
      setError(lang === 'he' ? 'קוד שגוי. נסה שנית.' : 'Invalid code. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const txt = {
    title:        lang === 'he' ? '🔐 אבטחת חשבון' : '🔐 Account Security',
    enabled:      lang === 'he' ? 'אימות דו-שלבי פעיל ✅' : 'Two-Factor Auth is active ✅',
    enabledSub:   lang === 'he' ? 'החשבון שלך מוגן עם אפליקציית אימות.' : 'Your account is protected with an authenticator app.',
    disabled:     lang === 'he' ? 'אימות דו-שלבי כבוי' : '2FA is not enabled',
    disabledSub:  lang === 'he' ? 'הוסף שכבת אבטחה נוספת לחשבון.' : 'Add an extra layer of security to your account.',
    enableBtn:    lang === 'he' ? 'הפעל 2FA' : 'Enable 2FA',
    scanTitle:    lang === 'he' ? 'סרוק את קוד ה-QR' : 'Scan the QR Code',
    scanSub:      lang === 'he' ? 'פתח את Google Authenticator או Authy וסרוק את הקוד.' : 'Open Google Authenticator or Authy and scan this code.',
    codeLabel:    lang === 'he' ? 'הזן את הקוד בן 6 הספרות' : 'Enter the 6-digit code',
    activateBtn:  lang === 'he' ? 'אמת והפעל' : 'Verify & Activate',
    close:        lang === 'he' ? 'סגור' : 'Close',
    back:         lang === 'he' ? '← חזור' : '← Back',
    contactAdmin: lang === 'he' ? 'לביטול 2FA, פנה למנהל המערכת.' : 'To disable 2FA, contact your system administrator.',
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="formSheet" onRequestClose={onClose}>
      <View style={sm.root}>

        {/* Header */}
        <View style={sm.header}>
          {screen === 'setup' && (
            <Pressable onPress={() => setScreen('status')} style={sm.backBtn}>
              <Text style={sm.backText}>{txt.back}</Text>
            </Pressable>
          )}
          <Text style={sm.title}>{txt.title}</Text>
          <Pressable onPress={onClose} style={sm.closeBtn}>
            <Text style={sm.closeText}>✕</Text>
          </Pressable>
        </View>

        {/* ── Loading ── */}
        {screen === 'loading' && (
          <View style={sm.centered}>
            <ActivityIndicator size="large" color="#2E86FF" />
          </View>
        )}

        {/* ── Status screen ── */}
        {screen === 'status' && (
          <View style={sm.body}>
            <View style={[sm.statusCard, totpEnabled ? sm.statusCardOn : sm.statusCardOff]}>
              <Text style={sm.statusIcon}>{totpEnabled ? '🛡️' : '⚠️'}</Text>
              <Text style={[sm.statusTitle, { color: totpEnabled ? '#10B981' : '#F59E0B' }]}>
                {totpEnabled ? txt.enabled : txt.disabled}
              </Text>
              <Text style={[sm.statusSub, isRtl && sm.textRight]}>
                {totpEnabled ? txt.enabledSub : txt.disabledSub}
              </Text>
            </View>

            {totpEnabled ? (
              <Text style={[sm.adminNote, isRtl && sm.textRight]}>{txt.contactAdmin}</Text>
            ) : (
              <Pressable
                style={[sm.primaryBtn, busy && sm.btnDisabled]}
                onPress={handleStartSetup}
                disabled={busy}
              >
                {busy
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={sm.primaryBtnText}>{txt.enableBtn}</Text>
                }
              </Pressable>
            )}
          </View>
        )}

        {/* ── Setup screen: show QR ── */}
        {screen === 'setup' && (
          <View style={sm.body}>
            <Text style={[sm.setupTitle, isRtl && sm.textRight]}>{txt.scanTitle}</Text>
            <Text style={[sm.setupSub, isRtl && sm.textRight]}>{txt.scanSub}</Text>

            {qrCode ? (
              <Image source={{ uri: qrCode }} style={sm.qr} />
            ) : (
              <View style={sm.qrPlaceholder}>
                <ActivityIndicator color="#2E86FF" />
              </View>
            )}

            {otpauthUrl && (
              <Pressable
                style={sm.openAuthBtn}
                onPress={() => Linking.openURL(otpauthUrl)}
              >
                <Text style={sm.openAuthText}>
                  {lang === 'he' ? '📱 פתח ב-Google Authenticator' : '📱 Open in Google Authenticator'}
                </Text>
              </Pressable>
            )}

            <Text style={[sm.codeLabel, isRtl && sm.textRight]}>{txt.codeLabel}</Text>
            <TextInput
              style={sm.codeInput}
              value={token}
              onChangeText={t => { setToken(t); setError(''); }}
              keyboardType="number-pad"
              maxLength={6}
              placeholder="000000"
              placeholderTextColor="#9BA8C0"
              textAlign="center"
              autoFocus
            />

            {error ? <Text style={sm.error}>{error}</Text> : null}

            <Pressable
              style={[sm.primaryBtn, (busy || token.length !== 6) && sm.btnDisabled]}
              onPress={handleConfirmSetup}
              disabled={busy || token.length !== 6}
            >
              {busy
                ? <ActivityIndicator color="#fff" />
                : <Text style={sm.primaryBtnText}>{txt.activateBtn}</Text>
              }
            </Pressable>
          </View>
        )}
      </View>
    </Modal>
  );
}

// ─── Shared TopBar component ──────────────────────────────────────────────────
interface TopBarProps {
  name:      string;
  role:      keyof typeof ROLE_ACCENT;
  lang:      Lang;
  isRtl:     boolean;
  onToggleLang: () => void;
  onMaintenance?: () => void;
  onBeforeSignOut?: () => void;
}

export function TopBar({
  name, role, lang, isRtl, onToggleLang, onMaintenance, onBeforeSignOut,
}: TopBarProps) {
  const router = useRouter();
  const accent = ROLE_ACCENT[role];
  const [securityModal, setSecurityModal] = useState(false);

  const handleSignOut = async () => {
    onBeforeSignOut?.();
    await signOut(auth);
    setTimeout(() => router.replace('/(auth)/login'), 100);
  };

  return (
    <>
      <View style={[tb.bar, isRtl && tb.rowReverse]}>
        {/* Left: avatar + name */}
        <View style={[tb.left, isRtl && tb.rowReverse]}>
          <View style={[tb.avatar, { backgroundColor: accent.text }]}>
            <Text style={tb.avatarText}>{name?.charAt(0)?.toUpperCase() ?? '?'}</Text>
          </View>
          <View style={{ marginLeft: isRtl ? 0 : 10, marginRight: isRtl ? 10 : 0 }}>
            <Text style={[tb.name, isRtl && tb.textRight]}>{name}</Text>
            <View style={[tb.roleBadge, { backgroundColor: accent.bg }]}>
              <Text style={[tb.roleText, { color: accent.text }]}>
                {accent.label[lang]}
              </Text>
            </View>
          </View>
        </View>

        {/* Right: lang + security + bell + maintenance + sign out */}
        <View style={[tb.right, isRtl && tb.rowReverse]}>
          <Pressable style={tb.langBtn} onPress={onToggleLang}>
            <Text style={tb.langText}>{lang === 'he' ? 'EN' : 'עב'}</Text>
          </Pressable>

          {/* 🔐 Security / 2FA button — visible to ALL roles */}
          <Pressable
            style={tb.iconBtn}
            onPress={() => setSecurityModal(true)}
            accessibilityLabel="Security settings"
          >
            <Text style={tb.iconBtnText}>🔐</Text>
          </Pressable>

          {role === 'system_admin' && (
            <Pressable style={tb.iconBtn} onPress={onMaintenance}>
              <Text style={tb.iconBtnText}>🛠️</Text>
            </Pressable>
          )}

          <NotificationBell />

          <Pressable style={tb.signOutBtn} onPress={handleSignOut}>
            <Text style={tb.signOutText}>
              {lang === 'he' ? 'יציאה' : 'Sign Out'}
            </Text>
          </Pressable>
        </View>
      </View>

      {/* 2FA Modal — rendered outside the bar so it overlays the whole screen */}
      <SecurityModal
        visible={securityModal}
        onClose={() => setSecurityModal(false)}
        lang={lang}
      />
    </>
  );
}

// ─── Shared stat card ─────────────────────────────────────────────────────────
export function StatCard({
  emoji, value, label, color = '#2E86FF', isRtl = false,
}: {
  emoji: string; value: string | number; label: string; color?: string; isRtl?: boolean;
}) {
  return (
    <View style={[sc.card, { borderTopColor: color }]}>
      <Text style={sc.emoji}>{emoji}</Text>
      <Text style={[sc.value, { color }]}>{value}</Text>
      <Text style={[sc.label, isRtl && sc.labelRight]}>{label}</Text>
    </View>
  );
}

export function SectionHeader({ title, isRtl }: { title: string; isRtl: boolean }) {
  return <Text style={[sh.title, isRtl && sh.right]}>{title}</Text>;
}

export function FacultyBadge({ facultyId, lang }: { facultyId: string; lang: Lang }) {
  const fc = getFacultyColor(facultyId);
  return (
    <View style={[fb.badge, { backgroundColor: fc.light, borderColor: fc.primary }]}>
      <View style={[fb.dot, { backgroundColor: fc.primary }]} />
      <Text style={[fb.text, { color: fc.primary }]}>{fc.label[lang]}</Text>
    </View>
  );
}

const STATUS_MAP = {
  pending:              { bg: '#F1F5F9', color: '#64748B', he: 'ממתין',           en: 'Pending' },
  submitted:            { bg: '#FFFBEB', color: '#F59E0B', he: 'הוגש',            en: 'Submitted' },
  supervisor_graded:    { bg: '#EFF6FF', color: '#2E86FF', he: 'נוקד ע"י מנחה',  en: 'Supervisor Graded' },
  coordinator_approved: { bg: '#ECFDF5', color: '#10B981', he: 'אושר ע"י רכז',   en: 'Coord. Approved' },
  completed:            { bg: '#ECFDF5', color: '#10B981', he: 'הושלם ✓',         en: 'Completed ✓' },
  approved:             { bg: '#ECFDF5', color: '#10B981', he: 'אושרה',           en: 'Approved' },
  rejected:             { bg: '#FEF2F2', color: '#EF4444', he: 'נדחתה',           en: 'Rejected' },
  meeting_requested:    { bg: '#FFF7ED', color: '#F97316', he: 'נדרשת פגישה',     en: 'Meeting Req.' },
  in_progress:          { bg: '#EFF6FF', color: '#2E86FF', he: 'בתהליך',          en: 'In Progress' },
  published:            { bg: '#F0FDF4', color: '#16A34A', he: 'פורסם',           en: 'Published' },
  draft:                { bg: '#F8FAFC', color: '#94A3B8', he: 'טיוטה',           en: 'Draft' },
};

export function StatusBadge({ status, lang }: { status: string; lang: Lang }) {
  const cfg = STATUS_MAP[status as keyof typeof STATUS_MAP] ?? STATUS_MAP.pending;
  return (
    <View style={[stb.badge, { backgroundColor: cfg.bg }]}>
      <Text style={[stb.text, { color: cfg.color }]}>{cfg[lang]}</Text>
    </View>
  );
}

export const toDate = (val: Timestamp | string | null | undefined): Date | null => {
  if (!val) return null;
  if (typeof val === 'string') {
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof (val as any).toDate === 'function') return (val as any).toDate();
  return null;
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const tb = StyleSheet.create({
  bar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1, borderBottomColor: '#E8EDF5',
    elevation: 2,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4,
  },
  rowReverse: { flexDirection: 'row-reverse' },
  textRight:  { textAlign: 'right' },
  left:       { flexDirection: 'row', alignItems: 'center' },
  right:      { flexDirection: 'row', alignItems: 'center', gap: 8 },
  avatar: {
    width: 38, height: 38, borderRadius: 19,
    justifyContent: 'center', alignItems: 'center',
  },
  avatarText:  { color: '#fff', fontWeight: '700', fontSize: 16 },
  name:        { fontSize: 14, fontWeight: '600', color: '#111' },
  roleBadge:   { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, marginTop: 2, alignSelf: 'flex-start' },
  roleText:    { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },
  langBtn: {
    backgroundColor: '#F0F4FF', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: '#D0DEFF',
  },
  langText:  { fontSize: 12, fontWeight: '700', color: '#2E86FF' },
  iconBtn:   { padding: 4 },
  iconBtnText: { fontSize: 18 },
  signOutBtn: {
    backgroundColor: '#FFF0F0', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: '#FFCDD2',
  },
  signOutText: { fontSize: 12, fontWeight: '600', color: '#D32F2F' },
});

const sc = StyleSheet.create({
  card: {
    flex: 1, backgroundColor: '#fff', borderRadius: 14,
    padding: 14, alignItems: 'center',
    borderTopWidth: 3,
    borderWidth: 1, borderColor: '#E0E8FF',
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 1,
  },
  emoji:      { fontSize: 24, marginBottom: 6 },
  value:      { fontSize: 26, fontWeight: '900', marginBottom: 2 },
  label:      { fontSize: 11, color: '#8899BB', fontWeight: '500', textAlign: 'center' },
  labelRight: { textAlign: 'right' },
});

const sh = StyleSheet.create({
  title: { fontSize: 15, fontWeight: '800', color: '#111', marginBottom: 12, marginTop: 4 },
  right: { textAlign: 'right' },
});

const fb = StyleSheet.create({
  badge: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, alignSelf: 'flex-start',
  },
  dot:  { width: 6, height: 6, borderRadius: 3, marginRight: 5 },
  text: { fontSize: 11, fontWeight: '600' },
});

const stb = StyleSheet.create({
  badge: { borderRadius: 8, paddingHorizontal: 9, paddingVertical: 3 },
  text:  { fontSize: 11, fontWeight: '700' },
});

// ─── Security Modal Styles ────────────────────────────────────────────────────
const sm = StyleSheet.create({
  root: {
    flex: 1, backgroundColor: '#F0F4FF',
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#E0E8FF',
  },
  title:    { fontSize: 17, fontWeight: '700', color: '#111', flex: 1, textAlign: 'center' },
  backBtn:  { padding: 4, minWidth: 60 },
  backText: { fontSize: 14, color: '#2E86FF', fontWeight: '600' },
  closeBtn: { padding: 4, minWidth: 60, alignItems: 'flex-end' },
  closeText:{ fontSize: 18, color: '#8899BB' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  body:     { flex: 1, padding: 24 },
  textRight:{ textAlign: 'right' },

  // Status card
  statusCard: {
    borderRadius: 16, padding: 24, alignItems: 'center',
    marginBottom: 24, borderWidth: 1,
  },
  statusCardOn:  { backgroundColor: '#ECFDF5', borderColor: '#10B981' },
  statusCardOff: { backgroundColor: '#FFFBEB', borderColor: '#F59E0B' },
  statusIcon:    { fontSize: 48, marginBottom: 12 },
  statusTitle:   { fontSize: 16, fontWeight: '700', marginBottom: 8, textAlign: 'center' },
  statusSub:     { fontSize: 13, color: '#667', textAlign: 'center', lineHeight: 20 },
  adminNote:     { fontSize: 12, color: '#8899BB', textAlign: 'center', marginTop: 8 },

  // Setup screen
  setupTitle:    { fontSize: 17, fontWeight: '700', color: '#111', marginBottom: 8 },
  setupSub:      { fontSize: 13, color: '#667', lineHeight: 20, marginBottom: 24 },
  qr: {
    width: 200, height: 200, alignSelf: 'center',
    marginBottom: 24, borderRadius: 12,
    borderWidth: 1, borderColor: '#E0E8FF',
  },
  qrPlaceholder: {
    width: 200, height: 200, alignSelf: 'center',
    marginBottom: 24, borderRadius: 12,
    backgroundColor: '#E0E8FF',
    justifyContent: 'center', alignItems: 'center',
  },
  codeLabel: { fontSize: 14, fontWeight: '600', color: '#334', marginBottom: 10 },
  codeInput: {
    borderWidth: 2, borderColor: '#2E86FF', borderRadius: 12,
    padding: 16, fontSize: 28, letterSpacing: 10,
    backgroundColor: '#fff', marginBottom: 12,
  },
  error: { color: '#E74C3C', fontSize: 13, textAlign: 'center', marginBottom: 10 },

  // Buttons
  primaryBtn: {
    backgroundColor: '#2E86FF', borderRadius: 12,
    padding: 16, alignItems: 'center', marginTop: 8,
  },
  btnDisabled:    { backgroundColor: '#A0C4FF' },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  openAuthBtn: {
    backgroundColor: '#F0F4FF', borderRadius: 12, padding: 14,
    alignItems: 'center', marginBottom: 16,
    borderWidth: 1, borderColor: '#2E86FF',
  },
  openAuthText: { color: '#2E86FF', fontWeight: '700', fontSize: 14 },
});