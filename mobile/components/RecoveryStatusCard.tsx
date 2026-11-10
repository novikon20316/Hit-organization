// components/RecoveryStatusCard.tsx
// system_admin overview (app/admin/overview.tsx): is the nightly encrypted
// recovery file arriving, and is the decryption key due for rotation?
// Read-only — restoring is done from the web page /admin/recovery only
// (it needs the key file on a computer). Same GET /api/admin/recovery/status
// as web (server controllers/recoveryController.ts).

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { apiClient } from '@/src/api/apiClient';
import { ap } from '@/constants/theme';
import type { Lang } from './i18n';

interface RunSummary { at: number | null; ok: boolean; bytes: number; errors: Record<string, string> }
interface RecoveryStatus {
  configured: { publicKey: boolean; bucket: boolean; drive: boolean };
  key: { fingerprint: string | null; rotationDue: boolean; holders: Array<{ passphraseDue: boolean }> };
  lastSuccessAt: number | null;
  stale: boolean;
  runs: { daily: RunSummary | null; weekly: RunSummary | null; manual: RunSummary | null };
}

function fmt(ms: number | null, he: boolean): string {
  if (!ms) return '—';
  return new Date(ms).toLocaleString(he ? 'he-IL' : 'en-GB', { timeZone: 'Asia/Jerusalem', dateStyle: 'short', timeStyle: 'short' });
}

export function RecoveryStatusCard({ lang }: { lang: Lang }) {
  const he = lang === 'he';
  const [data, setData] = useState<RecoveryStatus | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    apiClient.get('/api/admin/recovery/status')
      .then((res) => { if (!cancelled) setData(res.data as RecoveryStatus); })
      .catch((err: any) => { if (!cancelled) setError(err?.response?.data?.error || (he ? 'טעינה נכשלה' : 'Failed to load')); });
    return () => { cancelled = true; };
  }, [he]);

  const align = he ? 'right' : 'left';
  const title = he ? 'גיבוי ושחזור' : 'Backup & recovery';

  if (!data) {
    return (
      <View style={styles.card}>
        <Text style={[styles.cardTitle, { textAlign: align }]}>{title}</Text>
        <Text style={[styles.text, { textAlign: align }]}>{error || (he ? 'טוען…' : 'Loading…')}</Text>
      </View>
    );
  }

  const problems: string[] = [];
  if (!data.configured.publicKey) problems.push(he ? 'לא הוגדר מפתח שחזור בשרת' : 'No recovery key set on the server');
  if (data.stale) problems.push(he ? 'אין קובץ שחזור תקין מ-36 השעות האחרונות' : 'No good recovery file in the last 36 hours');
  for (const r of [data.runs.daily, data.runs.weekly]) {
    if (r && Object.keys(r.errors).length) problems.push(`${he ? 'יעד נכשל' : 'Destination failed'}: ${Object.keys(r.errors).join(', ')}`);
  }
  if (data.key.rotationDue) problems.push(he ? 'הגיע הזמן להחליף את זוג המפתחות' : 'Time to rotate the key pair');
  if (data.key.holders.some((h) => h.passphraseDue)) problems.push(he ? 'הגיע הזמן להחליף סיסמת מפתח' : 'A key passphrase is due for change');

  return (
    <View style={styles.card}>
      <Text style={[styles.cardTitle, { textAlign: align }]}>{title}</Text>
      <Text style={[styles.text, { textAlign: align }]}>
        {he ? 'יומי אחרון' : 'Last daily'}: {data.runs.daily?.ok ? '✅' : data.runs.daily ? '❌' : ''} {fmt(data.runs.daily?.at ?? null, he)}
      </Text>
      <Text style={[styles.text, { textAlign: align }]}>
        {he ? 'שבועי (מלא) אחרון' : 'Last weekly (full)'}: {data.runs.weekly?.ok ? '✅' : data.runs.weekly ? '❌' : ''} {fmt(data.runs.weekly?.at ?? null, he)}
      </Text>
      {problems.map((p) => (
        <Text key={p} style={[styles.problem, { textAlign: align }]}>⚠ {p}</Text>
      ))}
      <Text style={[styles.hint, { textAlign: align }]}>
        {he ? 'בדיקת מפתח ושחזור — רק בעמוד "גיבוי ושחזור" באתר, ממחשב.' : 'Key test and restore — only on the web "Backup & Recovery" page, from a computer.'}
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
    gap: 6,
  },
  cardTitle: { fontSize: 13, fontWeight: '600', color: ap.onSurfaceVariant },
  text: { fontSize: 13, color: ap.onSurface },
  problem: { fontSize: 13, color: ap.error, fontWeight: '600' },
  hint: { fontSize: 12, color: ap.onSurfaceVariant },
});
