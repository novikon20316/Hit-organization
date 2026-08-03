// components/shared.tsx
// Shared across Supervisor, Examiner, and Admin pages

import React, { useEffect, useState } from 'react';
import {
  View, Text, Pressable, Modal, TextInput,
  ActivityIndicator, Image, Alert, Linking
} from 'react-native';
import { signOut } from 'firebase/auth';
import { auth, db } from '../src/firebase/firebase';
import { doc, getDoc, Timestamp } from 'firebase/firestore';
import { useRouter } from 'expo-router';
import type { Lang } from './i18n';
import { apiClient } from '../src/api/apiClient';
import DeleteAccountModal from './modals/DeleteAccountModal';
import HeaderMenu, { type HeaderMenuItem } from './HeaderMenu';
import { useNotifications } from '../src/context/NotificationsContext';
import { useActiveRole } from '../contexts/ActiveRoleContext';
import {
  TopBarStyles, HeaderMenuStyles, StatCardStyles, SectionHeaderStyles, FacultyBadgeStyles,
  StatusBadgeStyles, SecurityModalStyles,
} from '../constants/styles';

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
  data_science: {
    primary: '#0EA5E9',
    light:   '#F0F9FF',
    label:   { he: 'המחלקה למדעי הנתונים', en: 'Department of Data Science' },
  },
  all: {
    primary: '#334155',
    light:   '#F8FAFC',
    label:   { he: 'כל הפקולטות', en: 'All Faculties' },
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
// Every role gets its own hue so role badges/pickers are visually distinct at
// a glance — not just a single accent (e.g. red) toggled on/off per option.
// Explicit assignments per the user's spec: student=blue, coordinator=green,
// administrative_secretary=purple, system_admin=red, supervisor=grey. The
// remaining roles keep distinct hues that don't collide with these five.
export const ROLE_ACCENT = {
  student:              { bg: '#EFF6FF', text: '#2E86FF', label: { he: 'סטודנט',                 en: 'Student'                 } },
  supervisor:            { bg: '#F1F5F9', text: '#64748B', label: { he: 'מנחה',                    en: 'Supervisor'              } },
  secondary_supervisor:  { bg: '#EEF2FF', text: '#6366F1', label: { he: 'מנחה משני',                en: 'Secondary Supervisor'    } },
  examiner:              { bg: '#F5F3FF', text: '#8B5CF6', label: { he: 'בוחן',                    en: 'Examiner'                } },
  internal_examiner:     { bg: '#F5F3FF', text: '#8B5CF6', label: { he: 'בוחן פנימי',               en: 'Internal Examiner'       } },
  system_admin:          { bg: '#FEF2F2', text: '#EF4444', label: { he: 'מנהל מערכת',              en: 'System Admin'            } },
  coordinator:           { bg: '#ECFDF5', text: '#10B981', label: { he: 'רכז פרויקטים',            en: 'Coordinator'             } },
  faculty_admin:         { bg: '#ECFEFF', text: '#06B6D4', label: { he: 'מנהל פקולטה',              en: 'Faculty Admin'           } },
  grad_school_head:      { bg: '#F0FDFA', text: '#0D9488', label: { he: 'ראש בית ספר',              en: 'Grad School Head'        } },
  program_head:          { bg: '#FFF7ED', text: '#F97316', label: { he: 'ראש תוכנית',              en: 'Program Head'            } },
  administrative_secretary: { bg: '#FAF5FF', text: '#9333EA', label: { he: 'רכזת אדמיניסטרטיבית', en: 'Administrative Coordinator'} },
};

const DEFAULT_ROLE_ACCENT = { bg: '#F1F5F9', text: '#64748B', label: { he: 'תפקיד', en: 'Role' } };

// Safe lookup for arbitrary/unknown role strings (e.g. admin user lists,
// role pickers) — falls back to a neutral gray instead of throwing/blank.
export function getRoleAccent(role: string): { bg: string; text: string; label: { he: string; en: string } } {
  return (ROLE_ACCENT as Record<string, typeof DEFAULT_ROLE_ACCENT>)[role] ?? DEFAULT_ROLE_ACCENT;
}

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
// The right-hand action row used to be a lineup of individual icon buttons
// (lang, security, maintenance, delete-account, notification bell, sign out)
// — on screens with the most items (system_admin) that row was the tightest
// part of the header. Notifications and the language toggle are frequent,
// single-tap actions, so they stay as their own always-visible buttons; every
// other action (security, maintenance, delete-account, sign-out, and any
// page-specific extras) is consolidated into the "☰" HeaderMenu so the header
// stays a fixed, predictable width regardless of role. `extraMenuItems` lets a
// specific screen (e.g. admin/panel.tsx's Manage Files / Academic Year /
// Bulk Permissions buttons) fold its own page-level actions into the same
// menu instead of leaving them as a separate row of buttons on the page.
interface TopBarProps {
  name:      string;
  role:      keyof typeof ROLE_ACCENT;
  lang:      Lang;
  isRtl:     boolean;
  onToggleLang: () => void;
  onMaintenance?: () => void;
  onBeforeSignOut?: () => void | Promise<void>;
  extraMenuItems?: HeaderMenuItem[];
}

export function TopBar({
  name, role, lang, isRtl, onToggleLang, onMaintenance, onBeforeSignOut, extraMenuItems,
}: TopBarProps) {
  const router = useRouter();
  const accent = ROLE_ACCENT[role];
  const [securityModal, setSecurityModal] = useState(false);
  const [deleteAccountModal, setDeleteAccountModal] = useState(false);
  const [roleSwitcherModal, setRoleSwitcherModal] = useState(false);
  const { unreadCount } = useNotifications();
  const { roles, activeRole, setActiveRole } = useActiveRole();
  const hasMultipleRoles = roles.length > 1;

  const handleSignOut = async () => {
    await onBeforeSignOut?.();
    await signOut(auth);
    setTimeout(() => router.replace('/(auth)/login'), 100);
  };

  const handleAccountDeletionRequested = async () => {
    setDeleteAccountModal(false);
    await onBeforeSignOut?.();
    await signOut(auth);
    setTimeout(() => router.replace('/(auth)/login'), 100);
  };

  const menuItems: HeaderMenuItem[] = [
    {
      key: 'security', icon: '🔐',
      label: lang === 'he' ? 'אבטחה ואימות דו-שלבי' : 'Security & 2FA',
      onPress: () => setSecurityModal(true),
    },
    ...(role === 'system_admin' ? [{
      key: 'maintenance', icon: '🛠️',
      label: lang === 'he' ? 'מצב תחזוקה' : 'Maintenance mode',
      onPress: () => onMaintenance?.(),
    }] : []),
    ...(extraMenuItems ?? []).map((item, i) => ({ ...item, dividerBefore: i === 0 })),
    {
      key: 'delete-account', icon: '🗑️', dividerBefore: true,
      label: lang === 'he' ? 'מחיקת חשבון' : 'Delete account',
      onPress: () => setDeleteAccountModal(true),
    },
    {
      key: 'sign-out', icon: '🚪', danger: true,
      label: lang === 'he' ? 'יציאה' : 'Sign Out',
      onPress: handleSignOut,
    },
  ];

  return (
    <>
      <View style={[tb.bar, isRtl && tb.rowReverse]}>
        {/* Left: avatar + name — flexShrink so a long name/role list can never
            push the hamburger button off-screen */}
        <View style={[tb.left, isRtl && tb.rowReverse]}>
          <View style={[tb.avatar, { backgroundColor: accent.text }]}>
            <Text style={tb.avatarText}>{name?.charAt(0)?.toUpperCase() ?? '?'}</Text>
          </View>
          <View style={{ marginLeft: isRtl ? 0 : 10, marginRight: isRtl ? 10 : 0, flexShrink: 1, minWidth: 0 }}>
            <Text style={[tb.name, isRtl && tb.textRight]} numberOfLines={1} ellipsizeMode="tail">{name}</Text>
            {hasMultipleRoles ? (
              <Pressable
                style={[tb.roleBadge, { backgroundColor: accent.bg, flexDirection: 'row', alignItems: 'center' }]}
                onPress={() => setRoleSwitcherModal(true)}
                accessibilityLabel={lang === 'he' ? 'החלף תפקיד' : 'Switch role'}
              >
                <Text style={[tb.roleText, { color: accent.text }]}>
                  {accent.label[lang]}
                </Text>
                <Text style={[tb.roleText, { color: accent.text, marginLeft: 4 }]}>▾</Text>
              </Pressable>
            ) : (
              <View style={[tb.roleBadge, { backgroundColor: accent.bg }]}>
                <Text style={[tb.roleText, { color: accent.text }]}>
                  {accent.label[lang]}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Right: notifications + language stay as their own always-visible
            buttons (they're the two most frequent, single-tap actions);
            everything else that used to live here — plus any page-specific
            extras — is inside the hamburger's dropdown. */}
        <View style={[tb.right, isRtl && tb.rowReverse]}>
          <Pressable
            style={[tb.iconBtn, { position: 'relative' }]}
            onPress={() => router.push('/(tabs)/notifications')}
            accessibilityLabel={lang === 'he' ? 'התראות' : 'Notifications'}
          >
            <Text style={tb.iconBtnText}>🔔</Text>
            {!!unreadCount && unreadCount > 0 && (
              <View style={hm.badgeDot}>
                <Text style={hm.badgeDotText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
              </View>
            )}
          </Pressable>
          <Pressable style={tb.langBtn} onPress={onToggleLang}>
            <Text style={tb.langText}>{lang === 'he' ? 'EN' : 'עב'}</Text>
          </Pressable>
          <HeaderMenu items={menuItems} isRtl={isRtl} />
        </View>
      </View>

      {/* 2FA Modal — rendered outside the bar so it overlays the whole screen */}
      <SecurityModal
        visible={securityModal}
        onClose={() => setSecurityModal(false)}
        lang={lang}
      />

      <DeleteAccountModal
        visible={deleteAccountModal}
        onClose={() => setDeleteAccountModal(false)}
        lang={lang}
        onRequested={handleAccountDeletionRequested}
      />

      {/* Role switcher — only ever rendered for a multi-role user (see
          hasMultipleRoles above); lets them pick which role's dashboard
          they're currently viewing (see contexts/ActiveRoleContext.tsx). */}
      <Modal
        visible={roleSwitcherModal}
        transparent
        animationType="fade"
        onRequestClose={() => setRoleSwitcherModal(false)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', padding: 24 }}
          onPress={() => setRoleSwitcherModal(false)}
        >
          <View style={{ backgroundColor: '#fff', borderRadius: 16, paddingVertical: 8, overflow: 'hidden' }}>
            {roles.map((r) => {
              const roleAccent = ROLE_ACCENT[r] ?? accent;
              const isActive = r === activeRole;
              return (
                <Pressable
                  key={r}
                  onPress={() => {
                    setRoleSwitcherModal(false);
                    setActiveRole(r);
                  }}
                  style={{
                    flexDirection: isRtl ? 'row-reverse' : 'row',
                    alignItems: 'center',
                    paddingVertical: 14,
                    paddingHorizontal: 18,
                    backgroundColor: isActive ? roleAccent.bg : 'transparent',
                  }}
                >
                  <Text style={{ fontSize: 15, fontWeight: isActive ? '700' : '500', color: isActive ? roleAccent.text : '#1E293B' }}>
                    {roleAccent.label[lang]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Modal>
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
const tb = TopBarStyles;

const hm = HeaderMenuStyles;

const sc = StatCardStyles;

const sh = SectionHeaderStyles;

const fb = FacultyBadgeStyles;

const stb = StatusBadgeStyles;

// ─── Security Modal Styles ────────────────────────────────────────────────────
const sm = SecurityModalStyles;