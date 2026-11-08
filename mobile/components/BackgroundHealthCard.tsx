// components/BackgroundHealthCard.tsx
// system_admin overview (app/admin/overview.tsx): server background jobs that
// failed or stopped running on time, and the last 7 days' notification
// failure rate per channel. Compact mobile counterpart of web's
// components/BackgroundHealthPanels.tsx — same GET /api/admin/system-health
// (server services/systemHealth.ts) and the same "late" rule; refreshed every
// minute while the screen is open.

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { apiClient } from '@/src/api/apiClient';
import { ap } from '@/constants/theme';
import type { Lang } from './i18n';

type DeliveryChannel = 'email' | 'push' | 'sms' | 'whatsapp';

interface SystemJobHealth {
  id: string;
  labelHe: string;
  labelEn: string;
  intervalMs: number;
  lastStartedAtMs: number | null;
  lastOk: boolean | null;
  lastError: string | null;
}

interface SystemHealthResponse {
  jobs: SystemJobHealth[];
  delivery: { day: string; channels: Record<DeliveryChannel, Record<string, number>> }[];
  nowMs: number;
}

const REFRESH_MS = 60_000;
// Must match web's BackgroundHealthPanels.tsx.
const LATE_GRACE_MS = 10 * 60_000;

const CHANNEL_LABEL: Record<DeliveryChannel, { he: string; en: string }> = {
  email: { he: 'דוא"ל', en: 'Email' },
  push: { he: 'התראות לנייד', en: 'Push' },
  sms: { he: 'SMS', en: 'SMS' },
  whatsapp: { he: 'WhatsApp', en: 'WhatsApp' },
};
const CHANNELS = Object.keys(CHANNEL_LABEL) as DeliveryChannel[];

function jobProblem(job: SystemJobHealth, nowMs: number): 'failed' | 'late' | null {
  if (job.lastStartedAtMs == null) return null;
  if (job.lastOk === false) return 'failed';
  if (nowMs - job.lastStartedAtMs > job.intervalMs * 2 + LATE_GRACE_MS) return 'late';
  return null;
}

export function BackgroundHealthCard({ lang }: { lang: Lang }) {
  const he = lang === 'he';
  const [data, setData] = useState<SystemHealthResponse | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    apiClient.get('/api/admin/system-health')
      .then((res) => { setData(res.data as SystemHealthResponse); setError(''); })
      .catch((err: any) => setError(err?.response?.data?.message || (he ? 'טעינה נכשלה' : 'Failed to load')));
  }, [he]);

  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  const align = he ? 'right' : 'left';

  if (!data) {
    return (
      <View style={styles.card}>
        <Text style={[styles.cardTitle, { textAlign: align }]}>{he ? 'משימות רקע ומסירת התראות' : 'Background jobs & delivery'}</Text>
        <Text style={[styles.emptyText, { textAlign: align }]}>{error || (he ? 'טוען…' : 'Loading…')}</Text>
      </View>
    );
  }

  const problems = data.jobs
    .map((job) => ({ job, problem: jobProblem(job, data.nowMs) }))
    .filter((j) => j.problem != null);
  const neverRan = data.jobs.filter((j) => j.lastStartedAtMs == null).length;

  return (
    <View style={styles.card}>
      <View style={[styles.header, he && { flexDirection: 'row-reverse' }]}>
        <Text style={styles.cardTitle}>{he ? 'משימות רקע בשרת' : 'Background jobs'}</Text>
        {problems.length > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{problems.length}</Text>
          </View>
        )}
      </View>
      {problems.length === 0 ? (
        <Text style={[styles.emptyText, { textAlign: align }]}>
          {he ? 'כל המשימות רצות בזמן' : 'All jobs running on time'}
          {neverRan > 0 ? (he ? ` · ${neverRan} עדיין ללא ריצה מתועדת` : ` · ${neverRan} with no run recorded yet`) : ''}
        </Text>
      ) : (
        problems.map(({ job, problem }) => (
          <View key={job.id} style={styles.item}>
            <Text style={[styles.itemName, { textAlign: align }]}>
              {problem === 'failed' ? '❌' : '⏰'} {he ? job.labelHe : job.labelEn} — {problem === 'failed' ? (he ? 'נכשלה' : 'failed') : (he ? 'באיחור' : 'late')}
            </Text>
            {problem === 'failed' && job.lastError ? (
              <Text style={[styles.itemDetail, { textAlign: align }]} numberOfLines={2}>{job.lastError}</Text>
            ) : null}
          </View>
        ))
      )}

      <Text style={[styles.cardTitle, { textAlign: align, marginTop: 8 }]}>{he ? 'כשלונות מסירה — 7 ימים' : 'Delivery failures — 7 days'}</Text>
      <View style={[styles.channelRow, he && { flexDirection: 'row-reverse' }]}>
        {CHANNELS.map((channel) => {
          let sent = 0;
          let failed = 0;
          for (const day of data.delivery) {
            sent += day.channels[channel]?.sent ?? 0;
            failed += day.channels[channel]?.failed ?? 0;
          }
          const rate = sent + failed > 0 ? Math.round((failed / (sent + failed)) * 100) : null;
          return (
            <View key={channel} style={styles.channel}>
              <Text style={[styles.channelValue, rate != null && rate >= 10 && { color: ap.error }]}>{rate == null ? '—' : `${rate}%`}</Text>
              <Text style={styles.channelLabel}>{CHANNEL_LABEL[channel][lang]}</Text>
              <Text style={styles.channelLabel}>{failed}/{sent + failed}</Text>
            </View>
          );
        })}
      </View>
      <Text style={[styles.itemDetail, { textAlign: align }]}>
        {he ? 'פירוט מלא בעמוד תקינות המערכת באתר.' : 'Full details on the web System Health page.'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: ap.surfaceContainerLowest,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: ap.outlineVariant,
    padding: 16,
    gap: 8,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { fontSize: 13, fontWeight: '600', color: ap.onSurfaceVariant },
  badge: { backgroundColor: ap.errorContainer, borderRadius: 4, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { color: ap.error, fontSize: 11, fontWeight: '700' },
  emptyText: { fontSize: 13, color: ap.onSurfaceVariant },
  item: { paddingVertical: 6, borderTopWidth: 1, borderTopColor: ap.surfaceVariant },
  itemName: { fontSize: 13, fontWeight: '600', color: ap.onSurface },
  itemDetail: { fontSize: 12, color: ap.onSurfaceVariant, marginTop: 2 },
  channelRow: { flexDirection: 'row', gap: 8 },
  channel: { flex: 1, alignItems: 'center', paddingVertical: 6, borderRadius: 6, backgroundColor: ap.surfaceContainerLow },
  channelValue: { fontSize: 18, fontWeight: '700', color: ap.onSurface },
  channelLabel: { fontSize: 11, color: ap.onSurfaceVariant },
});
