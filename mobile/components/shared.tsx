// components/shared.tsx
// Shared across Supervisor, Examiner, and Admin pages

import React from 'react';
import { Timestamp } from 'firebase/firestore';
import {
  View, Text, Pressable, StyleSheet,
} from 'react-native';
import { signOut } from 'firebase/auth';
import { auth } from '../src/firebase/firebase';
import { useRouter } from 'expo-router';
import type { Lang } from './i18n';


// ─── Faculty / Department color palette ───────────────────────────────────────
// Each faculty gets a unique accent color used on project cards, badges, borders
export const FACULTY_COLORS: Record<string, {
  primary: string;
  light: string;
  label: { he: string; en: string };
}> = {
  computer_science: {
    primary: '#2E86FF',
    light:   '#EFF6FF',
    label:   { he: 'מדעי המחשב',          en: 'Computer Science' },
  },
  electrical: {
    primary: '#F59E0B',
    light:   '#FFFBEB',
    label:   { he: 'הנדסת חשמל ואלקטרוניקה', en: 'Electrical Engineering' },
  },
  learning_technology: {
    primary: '#10B981',
    light:   '#ECFDF5',
    label:   { he: 'טכנולוגיות למידה',    en: 'Learning Technology' },
  },
  industrial: {
    primary: '#8B5CF6',
    light:   '#F5F3FF',
    label:   { he: 'הנדסת תעשייה וניהול', en: 'Industrial Engineering' },
  },
  mechanical: {
    primary: '#EF4444',
    light:   '#FEF2F2',
    label:   { he: 'הנדסה מכנית',         en: 'Mechanical Engineering' },
  },
  software: {
    primary: '#06B6D4',
    light:   '#ECFEFF',
    label:   { he: 'הנדסת תוכנה',         en: 'Software Engineering' },
  },
  // fallback for unknown facultyId
  default: {
    primary: '#64748B',
    light:   '#F1F5F9',
    label:   { he: 'פקולטה',              en: 'Faculty' },
  },
};

export function getFacultyColor(facultyId: string) {
  return FACULTY_COLORS[facultyId] ?? FACULTY_COLORS.default;
}

// ─── Role accent colors (for the top bar role badge) ──────────────────────────
export const ROLE_ACCENT = {
  supervisor:  { bg: '#EFF6FF', text: '#2E86FF', label: { he: 'מנחה',         en: 'Supervisor'  } },
  examiner:    { bg: '#F5F3FF', text: '#8B5CF6', label: { he: 'בוחן',          en: 'Examiner'    } },
  system_admin:{ bg: '#FEF2F2', text: '#EF4444', label: { he: 'מנהל מערכת',   en: 'System Admin'} },
  coordinator: { bg: '#ECFDF5', text: '#10B981', label: { he: 'רכז פרויקטים', en: 'Coordinator' } },
  faculty_admin:{ bg: '#ECFEFF', text: '#06B6D4', label: { he: 'מנהל פקולטה', en: 'Faculty Admin'} },
};

// ─── Shared TopBar component ──────────────────────────────────────────────────
interface TopBarProps {
  name:      string;
  role:      keyof typeof ROLE_ACCENT;
  lang:      Lang;
  isRtl:     boolean;
  unreadCount: number;
  onToggleLang: () => void;
  onBell:    () => void;
  onMaintenance?: () => void;
  onBeforeSignOut?: () => void;
}

export function TopBar({
  name, role, lang, isRtl, unreadCount, onToggleLang, onBell, onMaintenance, onBeforeSignOut,
}: TopBarProps) {
  const router = useRouter();
  const accent = ROLE_ACCENT[role];

  const handleSignOut = async () => {
    onBeforeSignOut?.();           // ← call it before signing out
    await signOut(auth);
    setTimeout(() => router.replace('/(auth)/login'), 100); // slight delay to ensure state updates before redirect
  };

  return (
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

      {/* Right: lang + bell + sign out */}
      <View style={[tb.right, isRtl && tb.rowReverse]}>
        <Pressable style={tb.langBtn} onPress={onToggleLang}>
          <Text style={tb.langText}>{lang === 'he' ? 'EN' : 'עב'}</Text>
        </Pressable>
        {role === 'system_admin' && (
                  <Pressable
                    style={{ paddingHorizontal: 6 }}
                    onPress={onMaintenance}
                  >
                    <Text style={{ fontSize: 18 }}>🛠️</Text>
                  </Pressable>
                )}
        <Pressable style={tb.bellBtn} onPress={onBell}>
          <Text style={tb.bellIcon}>🔔</Text>
          {unreadCount > 0 && (
            <View style={tb.badge}>
              <Text style={tb.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
            </View>
          )}
        </Pressable>

        <Pressable style={tb.signOutBtn} onPress={handleSignOut}>
          <Text style={tb.signOutText}>
            {lang === 'he' ? 'יציאה' : 'Sign Out'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

// ─── Shared stat card ─────────────────────────────────────────────────────────
export function StatCard({
  emoji, value, label, color = '#2E86FF',
}: {
  emoji: string; value: string | number; label: string; color?: string;
}) {
  return (
    <View style={[sc.card, { borderTopColor: color }]}>
      <Text style={sc.emoji}>{emoji}</Text>
      <Text style={[sc.value, { color }]}>{value}</Text>
      <Text style={sc.label}>{label}</Text>
    </View>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────
export function SectionHeader({ title, isRtl }: { title: string; isRtl: boolean }) {
  return (
    <Text style={[sh.title, isRtl && sh.right]}>{title}</Text>
  );
}

// ─── Faculty badge on project cards ──────────────────────────────────────────
export function FacultyBadge({ facultyId, lang }: { facultyId: string; lang: Lang }) {
  const fc = getFacultyColor(facultyId);
  return (
    <View style={[fb.badge, { backgroundColor: fc.light, borderColor: fc.primary }]}>
      <View style={[fb.dot, { backgroundColor: fc.primary }]} />
      <Text style={[fb.text, { color: fc.primary }]}>{fc.label[lang]}</Text>
    </View>
  );
}

// ─── Status badge ─────────────────────────────────────────────────────────────
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
      <Text style={[stb.text, { color: cfg.color }]}>
        {cfg[lang]}
      </Text>
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
  avatarText:   { color: '#fff', fontWeight: '700', fontSize: 16 },
  name:         { fontSize: 14, fontWeight: '600', color: '#111' },
  roleBadge:    { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, marginTop: 2, alignSelf: 'flex-start' },
  roleText:     { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },
  langBtn: {
    backgroundColor: '#F0F4FF', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: '#D0DEFF',
  },
  langText:   { fontSize: 12, fontWeight: '700', color: '#2E86FF' },
  bellBtn:    { position: 'relative', padding: 2 },
  bellIcon:   { fontSize: 22 },
  badge: {
    position: 'absolute', top: -3, right: -3,
    backgroundColor: '#FF3B30', borderRadius: 8,
    minWidth: 16, height: 16,
    justifyContent: 'center', alignItems: 'center', paddingHorizontal: 3,
  },
  badgeText:   { color: '#fff', fontSize: 9, fontWeight: '800' },
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
  emoji: { fontSize: 24, marginBottom: 6 },
  value: { fontSize: 26, fontWeight: '900', marginBottom: 2 },
  label: { fontSize: 11, color: '#8899BB', fontWeight: '500', textAlign: 'center' },
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