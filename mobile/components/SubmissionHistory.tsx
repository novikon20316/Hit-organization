// components/SubmissionHistory.tsx
// S2 — mobile twin of web/app/student/home/SubmissionHistory.tsx: every
// earlier version of a milestone submission, what was decided on it, and
// what changed from the version before. Shows only what the student already
// saw on each round (decided 2026-11-08).
import React, { useState } from 'react';
import { View, Text, Pressable, Linking } from 'react-native';
import type { Lang } from './i18n';
import type { MilestoneRevision } from '@/types';
import { studentPalette } from '@/constants';

export function fileNameFromUrl(url: string, index: number, lang: Lang): string {
  try {
    const last = decodeURIComponent(url.split('?')[0]).split('/').filter(Boolean).pop();
    if (last) return last;
  } catch {
    // fall through to generic label below
  }
  return lang === 'he' ? `קובץ ${index + 1}` : `File ${index + 1}`;
}

interface Version {
  fileUrls: string[];
  submissionNote: string;
}

function changesBetween(prev: Version, next: Version, lang: Lang): string[] {
  const he = lang === 'he';
  const byName = (v: Version) => new Map(v.fileUrls.map((u, i) => [fileNameFromUrl(u, i, lang), u]));
  const before = byName(prev);
  const after = byName(next);
  const added = [...after.keys()].filter((n) => !before.has(n));
  const removed = [...before.keys()].filter((n) => !after.has(n));
  const replaced = [...after.keys()].filter((n) => before.has(n) && before.get(n) !== after.get(n));
  const out: string[] = [];
  if (added.length) out.push(`${he ? 'נוסף' : 'Added'}: ${added.join(', ')}`);
  if (removed.length) out.push(`${he ? 'הוסר' : 'Removed'}: ${removed.join(', ')}`);
  if (replaced.length) out.push(`${he ? 'הועלה מחדש' : 'Re-uploaded'}: ${replaced.join(', ')}`);
  if ((prev.submissionNote ?? '').trim() !== (next.submissionNote ?? '').trim()) out.push(he ? 'הערת ההגשה השתנתה' : 'Submission note changed');
  return out;
}

const fmt = (iso: string | null, lang: Lang) =>
  iso ? new Date(iso).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

export function SubmissionHistory({ history, current, lang }: { history: MilestoneRevision[]; current: Version & { submittedAt: string | null }; lang: Lang }) {
  const [open, setOpen] = useState(false);
  const he = lang === 'he';
  const align = he ? 'right' : 'left';
  const sorted = [...history].sort((a, b) => a.version - b.version);
  const latest = sorted[sorted.length - 1];
  const currentChanges = latest && current.submittedAt ? changesBetween(latest, current, lang) : [];
  const small = { fontSize: 12, color: studentPalette.onSurfaceVariant, textAlign: align } as const;

  const files = (urls: string[]) => urls.length > 0 && (
    <View style={{ flexDirection: he ? 'row-reverse' : 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
      {urls.map((url, i) => (
        <Pressable key={url} onPress={() => Linking.openURL(url)} accessibilityRole="link" hitSlop={4}>
          <Text style={{ fontSize: 12, color: studentPalette.primary, textDecorationLine: 'underline' }}>📥 {fileNameFromUrl(url, i, lang)}</Text>
        </Pressable>
      ))}
    </View>
  );

  return (
    <View style={{ marginTop: 8 }}>
      <Pressable onPress={() => setOpen((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: open }}>
        <Text style={[small, { fontWeight: '600' }]}>
          {open ? '▾' : '▸'} {he ? `היסטוריית הגשות (${history.length})` : `Submission history (${history.length})`}
        </Text>
      </Pressable>
      {open && (
        <View style={{ marginTop: 6, gap: 6 }}>
          {currentChanges.length > 0 && (
            <View style={{ borderRadius: 8, padding: 8, backgroundColor: studentPalette.primaryFixed }}>
              <Text style={[small, { fontWeight: '600', color: studentPalette.onSurface }]}>
                {he ? `ההגשה הנוכחית לעומת גרסה ${latest.version}:` : `Current submission vs version ${latest.version}:`}
              </Text>
              {currentChanges.map((c) => <Text key={c} style={small}>• {c}</Text>)}
            </View>
          )}
          {[...sorted].reverse().map((rev) => {
            const prev = sorted.find((v) => v.version === rev.version - 1);
            const changes = prev ? changesBetween(prev, rev, lang) : [];
            const fb = rev.supervisorFeedback;
            return (
              <View key={rev.version} style={{ borderRadius: 8, borderWidth: 1, borderColor: studentPalette.outlineVariant, padding: 8, backgroundColor: studentPalette.surfaceContainerLow }}>
                <Text style={[small, { fontWeight: '700', color: studentPalette.onSurface }]}>
                  {he ? `גרסה ${rev.version}` : `Version ${rev.version}`}
                  {rev.submittedAt ? ` · ${fmt(rev.submittedAt, lang)}` : ''}
                  {rev.decision === 'rejected' ? (he ? ' · ↩️ הוחזרה לתיקון' : ' · ↩️ Returned') : rev.decision === 'approved' ? (he ? ' · ✅ אושרה' : ' · ✅ Approved') : ''}
                </Text>
                {files(rev.fileUrls)}
                {!!rev.submissionNote && <Text style={[small, { marginTop: 4 }]}>{rev.submissionNote}</Text>}
                {!!rev.decisionReason && <Text style={[small, { marginTop: 4, color: studentPalette.error }]}>{rev.decisionReason}</Text>}
                {fb && (!!fb.comment || fb.fileUrls.length > 0) && (
                  <View style={{ marginTop: 6, padding: 6, borderRadius: 6, backgroundColor: studentPalette.surfaceContainerLowest }}>
                    <Text style={[small, { fontWeight: '600', color: studentPalette.onSurface }]}>{he ? 'הערות המנחה:' : "Supervisor's comments:"}</Text>
                    {!!fb.comment && <Text style={small}>{fb.comment}</Text>}
                    {files(fb.fileUrls)}
                  </View>
                )}
                {changes.length > 0 && (
                  <Text style={[small, { marginTop: 4, fontSize: 11 }]}>
                    {he ? `לעומת גרסה ${prev!.version}: ` : `vs version ${prev!.version}: `}{changes.join(' · ')}
                  </Text>
                )}
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}
