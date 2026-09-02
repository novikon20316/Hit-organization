// app/admin/overview.tsx
// "Admin Mobile Overview" — system_admin's new mobile home screen (see
// firebase/roles.ts's getHomeRoute). A lightweight, glanceable system-health
// dashboard, styled after the same Stitch "Academic Precision" design used
// for the web admin screens (app/globals.css's --admin-* tokens) — the hex
// values below are the same ones, so the two platforms visually match.
//
// The full CRUD console (users/projects/milestones management) that used to
// be the system_admin home is reachable via app/admin/menu.tsx — a sectioned
// nav screen mirroring web's sidebar (web/app/admin/navConfig.ts) — from the
// "Open Admin Panel" button below. Its individual sections still live at
// app/admin/panel.tsx?tab=..., but that screen's own old-style in-page tab
// strip is gone now that admin/menu.tsx is the way to switch between them.
//
// Every tile here is backed by real data already used elsewhere in the app,
// not fabricated placeholder metrics:
//  - Active Now / Total Users: same /api/users/profile + /api/admin/
//    dashboard-summary endpoints app/admin/panel.tsx already calls.
//  - Active Now's live count: a direct Firestore listener on the `presence`
//    collection, same 60s "online" window as
//    web/app/admin/live-transportation/page.tsx.
//  - Critical Alerts: a direct Firestore listener on `auditLog`, filtered to
//    `login_failed` entries — same collection/rule web already reads from.
//  - Maintenance Mode toggle: the same real GET /api/system/maintenance-status
//    + POST/DELETE /api/admin/system/maintenance endpoints and the same
//    MaintenanceModal component app/admin/panel.tsx already uses.

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, Switch, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { collection, onSnapshot, orderBy, query, limit } from 'firebase/firestore';
import { db } from '@/src/firebase/firebase';
import { apiClient } from '@/src/api/apiClient';
import { TopBar, StatCard } from '@/components/shared';
import { MaintenanceModal } from '@/components/modals';
import type { Lang } from '@/components/i18n';

// Same "online" definition as web/app/admin/live-transportation/page.tsx —
// comfortably exceeds usePresenceHeartbeat's send interval so a session
// isn't flickered offline between two heartbeats.
const ONLINE_WINDOW_MS = 60_000;

// Same hex values as web's --admin-* tokens (app/globals.css).
const C = {
  primary: '#00236f',
  primaryContainer: '#1e3a8a',
  onPrimaryContainer: '#90a8ff',
  secondary: '#505f76',
  surface: '#faf8ff',
  surfaceContainerLowest: '#ffffff',
  surfaceContainerLow: '#f4f3fa',
  surfaceContainer: '#eeedf4',
  surfaceVariant: '#e3e1e9',
  onSurface: '#1a1b21',
  onSurfaceVariant: '#444651',
  outlineVariant: '#c5c5d3',
  error: '#ba1a1a',
  errorContainer: '#ffdad6',
  onErrorContainer: '#93000a',
  success: '#059669',
};

interface FailedLoginAlert {
  id: string;
  displayName: string;
  explanation?: string;
  timestampMs: number | null;
}

export default function AdminOverviewScreen() {
  const router = useRouter();
  const [lang, setLang] = useState<Lang>('he');
  const isRtl = lang === 'he';
  const [adminName, setAdminName] = useState('');
  const [loading, setLoading] = useState(true);
  const [totalUsers, setTotalUsers] = useState(0);
  const [onlineCount, setOnlineCount] = useState(0);
  const [failedLoginCount, setFailedLoginCount] = useState(0);
  const [alerts, setAlerts] = useState<FailedLoginAlert[]>([]);

  // Maintenance mode (mobile platform) — same state shape and endpoints as
  // app/admin/panel.tsx's own maintenance controls, just triggered from here.
  const [maintenanceModal, setMaintenanceModal] = useState(false);
  const [maintenanceTitle, setMaintenanceTitle] = useState('');
  const [warnDays, setWarnDays] = useState(0);
  const [warnHours, setWarnHours] = useState(2);
  const [warnMinutes, setWarnMinutes] = useState(0);
  const [durDays, setDurDays] = useState(0);
  const [durHours, setDurHours] = useState(4);
  const [durMinutes, setDurMinutes] = useState(0);
  const [blockedRoles, setBlockedRoles] = useState<string[]>([]);
  const [broadcastEnabled, setBroadcastEnabled] = useState(true);
  const [maintenanceStatus, setMaintenanceStatus] = useState<{ isActive: boolean; title: string; endsAt: string | null } | null>(null);
  const [deactivatingMaintenance, setDeactivatingMaintenance] = useState(false);
  const [savingMaintenance, setSavingMaintenance] = useState(false);

  const fetchProfileAndSummary = useCallback(async () => {
    try {
      const [profile, summary] = await Promise.all([
        apiClient.get('/api/users/profile'),
        apiClient.get('/api/admin/dashboard-summary'),
      ]);
      setAdminName(profile.data?.displayName || 'Admin');
      if (profile.data?.language) setLang(profile.data.language);
      setTotalUsers((summary.data?.users ?? []).length);
    } catch (e) {
      console.error('Admin overview: failed to load profile/summary:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfileAndSummary();
  }, [fetchProfileAndSummary]);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'presence'),
      (snap) => {
        const now = Date.now();
        let count = 0;
        snap.forEach((d) => {
          const data = d.data() as Record<string, unknown>;
          const lastSeen = data.lastSeen as { toMillis?: () => number } | undefined;
          const ms = lastSeen?.toMillis ? lastSeen.toMillis() : null;
          if (ms !== null && now - ms < ONLINE_WINDOW_MS) count += 1;
        });
        setOnlineCount(count);
      },
      (err) => console.error('Admin overview: presence listener error:', err)
    );
    return unsub;
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'auditLog'), orderBy('timestamp', 'desc'), limit(50));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows: FailedLoginAlert[] = [];
        snap.forEach((d) => {
          const data = d.data() as Record<string, unknown>;
          if (data.action !== 'login_failed') return;
          const ts = data.timestamp as { toMillis?: () => number } | undefined;
          rows.push({
            id: d.id,
            displayName: (data.userDisplayName as string) || (data.userId as string) || '—',
            explanation: (data.explanation as string) || undefined,
            timestampMs: ts?.toMillis ? ts.toMillis() : null,
          });
        });
        setFailedLoginCount(rows.length);
        setAlerts(rows.slice(0, 5));
      },
      (err) => console.error('Admin overview: auditLog listener error:', err)
    );
    return unsub;
  }, []);

  const fetchMaintenanceStatus = useCallback(async () => {
    try {
      const res = await apiClient.get('/api/system/maintenance-status', { params: { platform: 'mobile' } });
      setMaintenanceStatus(res.data);
    } catch (e) {
      console.error('Admin overview: failed to load mobile maintenance status:', e);
      setMaintenanceStatus(null);
    }
  }, []);

  useEffect(() => {
    fetchMaintenanceStatus();
  }, [fetchMaintenanceStatus]);

  const saveMaintenance = async () => {
    setSavingMaintenance(true);
    try {
      const warnMs = warnDays * 86_400_000 + warnHours * 3_600_000 + warnMinutes * 60_000;
      const durMs = durDays * 86_400_000 + durHours * 3_600_000 + durMinutes * 60_000;
      await apiClient.post('/api/admin/system/maintenance', {
        platform: 'mobile',
        title: maintenanceTitle.trim() || 'Scheduled Maintenance',
        shutdownAt: Date.now() + warnMs,
        maintenanceDurMs: durMs,
        broadcastEnabled,
      });
      setMaintenanceModal(false);
      await fetchMaintenanceStatus();
    } catch (e) {
      console.error('Admin overview: failed to activate mobile maintenance:', e);
    } finally {
      setSavingMaintenance(false);
    }
  };

  const deactivateMaintenance = async () => {
    setDeactivatingMaintenance(true);
    try {
      await apiClient.delete('/api/admin/system/maintenance', { data: { platform: 'mobile' } });
      await fetchMaintenanceStatus();
    } catch (e) {
      console.error('Admin overview: failed to end mobile maintenance:', e);
    } finally {
      setDeactivatingMaintenance(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingRoot}>
        <ActivityIndicator size="large" color={C.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <TopBar
        name={adminName}
        role="system_admin"
        lang={lang}
        isRtl={isRtl}
        onToggleLang={() => setLang(lang === 'he' ? 'en' : 'he')}
        onMaintenance={() => { setMaintenanceModal(true); fetchMaintenanceStatus(); }}
      />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.wideTile}>
          <View>
            <Text style={styles.wideTileLabel}>{lang === 'he' ? 'משתמשים מחוברים כעת' : 'Active Now'}</Text>
            <Text style={styles.wideTileValue}>{onlineCount}</Text>
          </View>
          <View style={styles.wideTileIcon}>
            <Text style={{ fontSize: 22 }}>✅</Text>
          </View>
        </View>

        <View style={styles.statsRow}>
          <StatCard emoji="👥" value={totalUsers} label={lang === 'he' ? 'סה"כ משתמשים' : 'Total Users'} color={C.primary} isRtl={isRtl} />
          <StatCard
            emoji="🔑"
            value={failedLoginCount}
            label={lang === 'he' ? 'כניסות שנכשלו' : 'Failed Logins'}
            color={failedLoginCount > 0 ? C.error : C.secondary}
            isRtl={isRtl}
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{lang === 'he' ? 'פעולות מהירות' : 'Quick Toggles'}</Text>
          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleLabel}>{lang === 'he' ? 'מצב תחזוקה (אפליקציה)' : 'Maintenance Mode (mobile)'}</Text>
              {maintenanceStatus?.isActive && (
                <Text style={styles.toggleSubLabel}>{maintenanceStatus.title}</Text>
              )}
            </View>
            {deactivatingMaintenance ? (
              <ActivityIndicator size="small" color={C.primary} />
            ) : (
              <Switch
                value={!!maintenanceStatus?.isActive}
                onValueChange={(v) => (v ? setMaintenanceModal(true) : deactivateMaintenance())}
                trackColor={{ false: C.surfaceVariant, true: C.primary }}
                thumbColor="#fff"
              />
            )}
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.alertsHeader}>
            <Text style={styles.cardTitle}>{lang === 'he' ? 'התראות קריטיות' : 'Critical Alerts'}</Text>
            {failedLoginCount > 0 && (
              <View style={styles.alertsBadge}>
                <Text style={styles.alertsBadgeText}>{failedLoginCount}</Text>
              </View>
            )}
          </View>
          {alerts.length === 0 ? (
            <Text style={styles.emptyText}>{lang === 'he' ? 'אין התראות כרגע' : 'No alerts right now'}</Text>
          ) : (
            alerts.map((a) => (
              <View key={a.id} style={styles.alertItem}>
                <Text style={{ fontSize: 16 }}>⚠️</Text>
                <View style={{ flex: 1 }}>
                  <View style={styles.alertRow}>
                    <Text style={styles.alertName} numberOfLines={1}>{a.displayName}</Text>
                    <Text style={styles.alertTime}>
                      {a.timestampMs ? new Date(a.timestampMs).toLocaleTimeString(isRtl ? 'he-IL' : 'en-US', { hour: '2-digit', minute: '2-digit' }) : '—'}
                    </Text>
                  </View>
                  <Text style={styles.alertDetail} numberOfLines={1}>
                    {a.explanation || (lang === 'he' ? 'ניסיון התחברות שנכשל' : 'Failed login attempt')}
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>

        <Pressable style={styles.panelButton} onPress={() => router.push('/admin/menu' as any)} accessibilityRole="button">
          <Text style={styles.panelButtonText}>{lang === 'he' ? 'פתח פאנל ניהול מלא' : 'Open Admin Panel'}</Text>
        </Pressable>
      </ScrollView>

      <MaintenanceModal
        visible={maintenanceModal}
        setVisible={setMaintenanceModal}
        lang={lang}
        currentStatus={maintenanceStatus}
        onDeactivate={deactivateMaintenance}
        deactivating={deactivatingMaintenance}
        title={maintenanceTitle}
        setTitle={setMaintenanceTitle}
        warnDays={warnDays}
        setWarnDays={setWarnDays}
        warnHours={warnHours}
        setWarnHours={setWarnHours}
        warnMinutes={warnMinutes}
        setWarnMinutes={setWarnMinutes}
        durDays={durDays}
        setDurDays={setDurDays}
        durHours={durHours}
        setDurHours={setDurHours}
        durMinutes={durMinutes}
        setDurMinutes={setDurMinutes}
        broadcastEnabled={broadcastEnabled}
        setBroadcastEnabled={setBroadcastEnabled}
        blockedRoles={blockedRoles}
        setBlockedRoles={setBlockedRoles}
        onSave={saveMaintenance}
        saving={savingMaintenance}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.surface },
  loadingRoot: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surface },
  scrollContent: { padding: 16, gap: 12 },
  wideTile: {
    backgroundColor: C.surfaceContainerLowest,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.outlineVariant,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  wideTileLabel: { fontSize: 13, fontWeight: '500', color: C.onSurfaceVariant, marginBottom: 4 },
  wideTileValue: { fontSize: 28, fontWeight: '700', color: C.primary },
  wideTileIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#d0e1fb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsRow: { flexDirection: 'row', gap: 12 },
  card: {
    backgroundColor: C.surfaceContainerLowest,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.outlineVariant,
    padding: 16,
    gap: 8,
  },
  cardTitle: { fontSize: 13, fontWeight: '600', color: C.onSurfaceVariant },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
  toggleLabel: { fontSize: 14, color: C.onSurface },
  toggleSubLabel: { fontSize: 12, color: C.onSurfaceVariant, marginTop: 2 },
  alertsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  alertsBadge: { backgroundColor: C.errorContainer, borderRadius: 4, paddingHorizontal: 8, paddingVertical: 2 },
  alertsBadgeText: { color: C.error, fontSize: 11, fontWeight: '700' },
  emptyText: { fontSize: 13, color: C.onSurfaceVariant },
  alertItem: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: C.surfaceVariant,
  },
  alertRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  alertName: { fontSize: 13, fontWeight: '600', color: C.onSurface, flexShrink: 1 },
  alertTime: { fontSize: 11, color: C.onSurfaceVariant },
  alertDetail: { fontSize: 12, color: C.onSurfaceVariant, marginTop: 2 },
  panelButton: {
    backgroundColor: C.primary,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  panelButtonText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
