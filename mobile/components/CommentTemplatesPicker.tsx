// components/CommentTemplatesPicker.tsx
// The grader's own saved feedback snippets — mobile counterpart of web's
// components/CommentTemplatesPicker.tsx, same personal-only
// GET/PUT /api/users/me/comment-templates. Tap one to append it to the
// comment (still editable), save the current comment, or delete one.
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { apiClient } from '@/src/api/apiClient';
import { ap } from '@/constants/theme';
import type { Lang } from './i18n';

interface CommentTemplate { id: string; text: string }

export function CommentTemplatesPicker({ lang, currentText, onInsert }: { lang: Lang; currentText: string; onInsert: (text: string) => void }) {
  const he = lang === 'he';
  const align = he ? 'right' : 'left';
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<CommentTemplate[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || templates) return;
    apiClient.get('/api/users/me/comment-templates')
      .then((res) => setTemplates(res.data.templates as CommentTemplate[]))
      .catch(() => setError(he ? 'טעינת ההערות השמורות נכשלה' : 'Failed to load saved comments'));
  }, [open, templates, he]);

  const save = async (next: CommentTemplate[]) => {
    setBusy(true);
    setError('');
    try {
      const res = await apiClient.put('/api/users/me/comment-templates', { templates: next });
      setTemplates(res.data.templates as CommentTemplate[]);
    } catch (err: any) {
      setError(err?.response?.data?.message || (he ? 'השמירה נכשלה' : 'Failed to save'));
    } finally {
      setBusy(false);
    }
  };

  const text = currentText.trim();
  const alreadySaved = !!templates?.some((t) => t.text === text);

  return (
    <View style={{ marginTop: 8 }}>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={{ alignSelf: he ? 'flex-end' : 'flex-start', borderWidth: 1, borderColor: ap.outlineVariant, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}
      >
        <Text style={{ fontSize: 12, fontWeight: '600', color: ap.onSurface }}>📋 {he ? 'הערות שמורות' : 'Saved comments'}</Text>
      </Pressable>
      {open && (
        <View style={{ marginTop: 6, borderWidth: 1, borderColor: ap.outlineVariant, borderRadius: 10, padding: 8, backgroundColor: '#fff' }}>
          {!templates ? (
            error ? <Text style={{ fontSize: 12, color: '#EF4444', textAlign: align }}>{error}</Text> : <ActivityIndicator color={ap.primary} />
          ) : (
            <>
              {templates.length === 0 && (
                <Text style={{ fontSize: 12, color: ap.onSurfaceVariant, textAlign: align }}>
                  {he ? 'עוד אין הערות שמורות. כתבו הערה ושמרו אותה כאן.' : 'No saved comments yet. Write one and save it here.'}
                </Text>
              )}
              {templates.map((t) => (
                <View key={t.id} style={{ flexDirection: he ? 'row-reverse' : 'row', alignItems: 'flex-start', gap: 6, paddingVertical: 4 }}>
                  <Pressable
                    style={{ flex: 1 }}
                    onPress={() => { onInsert(t.text); setOpen(false); }}
                    accessibilityRole="button"
                    accessibilityLabel={`${he ? 'הוסף הערה שמורה' : 'Insert saved comment'}: ${t.text}`}
                  >
                    <Text style={{ fontSize: 13, color: ap.onSurface, textAlign: align }} numberOfLines={2}>{t.text}</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => save(templates.filter((x) => x.id !== t.id))}
                    disabled={busy}
                    accessibilityRole="button"
                    accessibilityLabel={he ? 'מחק הערה שמורה' : 'Delete saved comment'}
                    hitSlop={8}
                  >
                    <Text style={{ fontSize: 14, color: ap.outline }}>✕</Text>
                  </Pressable>
                </View>
              ))}
              <Pressable
                onPress={() => save([...templates, { id: '', text }])}
                disabled={busy || !text || alreadySaved || templates.length >= 30}
                accessibilityRole="button"
                style={{ marginTop: 6, borderWidth: 1, borderColor: ap.outlineVariant, borderRadius: 8, paddingVertical: 8, alignItems: 'center', opacity: busy || !text || alreadySaved ? 0.5 : 1 }}
              >
                <Text style={{ fontSize: 12, fontWeight: '600', color: ap.onSurface }}>＋ {he ? 'שמור את ההערה הנוכחית' : 'Save the current comment'}</Text>
              </Pressable>
              {error ? <Text style={{ marginTop: 4, fontSize: 12, color: '#EF4444', textAlign: align }}>{error}</Text> : null}
            </>
          )}
        </View>
      )}
    </View>
  );
}
