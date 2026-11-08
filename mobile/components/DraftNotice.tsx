// components/DraftNotice.tsx
// E3 — mobile twin of web/components/DraftNotice.tsx: says an examiner
// form's unsent draft was restored (with a way to start over) and whether
// autosave is keeping up. See hooks/useServerDraft.ts.
import React from 'react';
import { View, Text, Pressable } from 'react-native';
import type { DraftStatus } from '@/hooks/useServerDraft';

interface Props {
  he: boolean;
  restoredAt: string | null;
  status: DraftStatus;
  onDiscard: () => void;
}

export function DraftNotice({ he, restoredAt, status, onDiscard }: Props) {
  if (!restoredAt && status === 'idle') return null;
  const when = restoredAt
    ? new Date(restoredAt).toLocaleString(he ? 'he-IL' : 'en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : '';
  const text = { fontSize: 12, color: '#6B7280', textAlign: he ? 'right' : 'left' } as const;
  return (
    <View style={{ marginVertical: 6, gap: 4 }} accessibilityLiveRegion="polite">
      {restoredAt && (
        <View style={{ flexDirection: he ? 'row-reverse' : 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <Text style={text}>{he ? `שוחזרה טיוטה שלא נשלחה (${when}).` : `Restored your unsent draft (${when}).`}</Text>
          <Pressable onPress={onDiscard} accessibilityRole="button" hitSlop={6}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: '#2E86FF', textDecorationLine: 'underline' }}>{he ? 'התחל/י מחדש' : 'Start over'}</Text>
          </Pressable>
        </View>
      )}
      {status === 'saving' && <Text style={text}>{he ? 'שומר טיוטה…' : 'Saving draft…'}</Text>}
      {status === 'saved' && <Text style={text}>{he ? 'הטיוטה נשמרה — רק את/ה רואה אותה.' : 'Draft saved — only you can see it.'}</Text>}
      {status === 'error' && <Text style={[text, { color: '#B91C1C' }]}>{he ? 'שמירת הטיוטה נכשלה; התוכן עדיין כאן.' : 'Could not save the draft; your text is still here.'}</Text>}
    </View>
  );
}
