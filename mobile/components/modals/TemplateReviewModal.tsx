// components/modals/TemplateReviewModal.tsx
// "Review before approving" for a pending workflow-template version — mobile
// counterpart of web's app/workflow-templates/TemplateReviewModal.tsx, on the
// same read-only GET /api/workflow-templates/:id/review (server
// workflowTemplateReview.ts): warnings, what changes, a step-by-step
// walkthrough with who would act, and per-project impact for "apply now".
// Approve here hands back to the screen's usual approve flow (including its
// own retroactive confirmation).
import React, { useEffect, useState } from 'react';
import { Modal, View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { apiClient } from '../../src/api/apiClient';
import { ap } from '../../constants/theme';
import type { Lang } from '../i18n';

type Bilingual = { he: string; en: string };
type FieldChange = { field: string; label: Bilingual; before: string; after: string };
type Who = { kind: 'project' } | { kind: 'staff'; count: number; names: string[] } | { kind: 'committee'; name: string | null; memberCount: number | null };

interface TemplateReview {
  baseline: { version: number | null; isDefault: boolean };
  milestones: Array<{ type: string; nameHe: string; nameEn: string; change: 'added' | 'removed' | 'changed' | 'unchanged'; fields: FieldChange[] }>;
  settings: FieldChange[];
  warnings: Array<{ severity: 'error' | 'warning' | 'info'; he: string; en: string }>;
  walkthrough: Array<{
    type: string; nameHe: string; nameEn: string;
    due: { kind: 'offset'; days: number } | { kind: 'fixed'; date: string } | { kind: 'synced'; withType: string };
    sampleDueDate: string;
    stages: Array<{ role: string; action: 'grade' | 'approve' | 'notify'; who: Who }>;
  }>;
  impact: Array<{
    id: string;
    studentNames: string[];
    changes: Array<{ type: string; nameHe: string; nameEn: string; action: 'update' | 'create' | 'keep_started' | 'keep_removed'; dueBefore: string | null; dueAfter: string | null }>;
  }> | null;
}

interface Props {
  visible: boolean;
  lang: Lang;
  templateId: string;
  canApprove: boolean;
  roleLabel: (role: string) => string;
  onApprove: () => void;
  onClose: () => void;
}

type Section = 'changes' | 'walkthrough' | 'impact';

const SEVERITY: Record<'error' | 'warning' | 'info', { bg: string; fg: string; icon: string }> = {
  error: { bg: '#FDECEA', fg: '#B3261E', icon: '⛔' },
  warning: { bg: '#FEF3C7', fg: '#92400E', icon: '⚠️' },
  info: { bg: '#F1F5F9', fg: '#334155', icon: 'ℹ️' },
};
const CHANGE: Record<'added' | 'removed' | 'changed' | 'unchanged', Bilingual & { color: string }> = {
  added: { he: 'חדשה', en: 'Added', color: '#10B981' },
  removed: { he: 'הוסרה', en: 'Removed', color: '#EF4444' },
  changed: { he: 'שונתה', en: 'Changed', color: '#2563EB' },
  unchanged: { he: 'ללא שינוי', en: 'Unchanged', color: '#94A3B8' },
};
const IMPACT: Record<'update' | 'create' | 'keep_started' | 'keep_removed', Bilingual> = {
  update: { he: 'תעודכן', en: 'Updated' },
  create: { he: 'תיווצר', en: 'Created' },
  keep_started: { he: 'נשארת (כבר התחילה)', en: 'Kept (already started)' },
  keep_removed: { he: 'נשארת (הוסרה מהתבנית)', en: 'Kept (removed from template)' },
};
const ACTION: Record<'grade' | 'approve' | 'notify', Bilingual> = {
  grade: { he: 'נותן/ת ציון', en: 'grades' },
  approve: { he: 'מאשר/ת', en: 'approves' },
  notify: { he: 'מקבל/ת עדכון', en: 'is notified' },
};

function formatDate(iso: string | null, lang: Lang): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function TemplateReviewModal({ visible, lang, templateId, canApprove, roleLabel, onApprove, onClose }: Props) {
  const he = lang === 'he';
  const align = he ? 'right' : 'left';
  const [review, setReview] = useState<TemplateReview | null>(null);
  const [error, setError] = useState('');
  const [section, setSection] = useState<Section>('changes');

  useEffect(() => {
    let cancelled = false;
    apiClient.get(`/api/workflow-templates/${templateId}/review`)
      .then((res) => { if (!cancelled) setReview(res.data as TemplateReview); })
      .catch((err: any) => { if (!cancelled) setError(err?.response?.data?.message || (he ? 'טעינת הסקירה נכשלה' : 'Failed to load the review')); });
    return () => { cancelled = true; };
  }, [templateId, he]);

  const name = (x: { nameHe: string; nameEn: string }) => (he ? x.nameHe : x.nameEn);
  const errorCount = review?.warnings.filter((w) => w.severity === 'error').length ?? 0;
  const sections: Array<{ key: Section; label: string }> = [
    { key: 'changes', label: he ? 'מה משתנה' : 'Changes' },
    { key: 'walkthrough', label: he ? 'שלב-אחר-שלב' : 'Step by step' },
    ...(review?.impact ? [{ key: 'impact' as const, label: he ? `בתהליך (${review.impact.length})` : `In progress (${review.impact.length})` }] : []),
  ];

  const whoText = (who: Who): string => {
    if (who.kind === 'project') return he ? 'לפי הפרויקט' : 'per project';
    if (who.kind === 'committee') {
      return who.memberCount != null
        ? (he ? `ועדה · ${who.memberCount} חברים` : `committee · ${who.memberCount} members`)
        : (he ? 'הוועדה של חוג הסטודנט' : "the student's major committee");
    }
    if (who.count === 0) return he ? 'אף אחד — השלב ייתקע' : 'nobody — this step would get stuck';
    const more = who.count - who.names.length;
    return `${who.names.join(', ')}${more > 0 ? (he ? ` ועוד ${more}` : ` +${more} more`) : ''}`;
  };

  const fieldRows = (fields: FieldChange[]) => fields.map((f) => (
    <Text key={f.field} style={{ fontSize: 12, color: ap.onSurfaceVariant, textAlign: align, marginTop: 2 }}>
      {he ? f.label.he : f.label.en}: <Text style={{ textDecorationLine: 'line-through' }}>{f.before}</Text> → <Text style={{ color: ap.onSurface }}>{f.after}</Text>
    </Text>
  ));

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: ap.surfaceContainerLow }}>
        <View style={{ flexDirection: he ? 'row-reverse' : 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingBottom: 12 }}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: ap.onSurface }}>{he ? 'סקירה לפני אישור' : 'Review before approving'}</Text>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={he ? 'סגור' : 'Close'} hitSlop={10}>
            <Text style={{ fontSize: 20, color: ap.outline }}>✕</Text>
          </Pressable>
        </View>

        {!review ? (
          <View style={{ padding: 20, alignItems: 'center' }}>
            {error ? <Text style={{ color: '#EF4444', textAlign: 'center' }}>{error}</Text> : <ActivityIndicator color={ap.primary} />}
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 0, paddingBottom: 40, gap: 10 }}>
            <Text style={{ fontSize: 12, color: ap.onSurfaceVariant, textAlign: align }}>
              {review.baseline.isDefault
                ? (he ? 'בהשוואה לברירת המחדל של המערכת (אין גרסה מאושרת)' : 'Compared with the system default (no approved version yet)')
                : (he ? `בהשוואה לגרסה ${review.baseline.version ?? ''} המאושרת` : `Compared with approved version ${review.baseline.version ?? ''}`)}
            </Text>

            {review.warnings.length === 0 ? (
              <Text style={{ backgroundColor: '#E8F5E9', color: '#1B5E20', borderRadius: 8, padding: 10, fontSize: 13, textAlign: align }}>
                ✅ {he ? 'לא נמצאו בעיות.' : 'No problems found.'}
              </Text>
            ) : review.warnings.map((w, i) => (
              <Text key={i} style={{ backgroundColor: SEVERITY[w.severity].bg, color: SEVERITY[w.severity].fg, borderRadius: 8, padding: 10, fontSize: 13, textAlign: align }}>
                {SEVERITY[w.severity].icon} {he ? w.he : w.en}
              </Text>
            ))}

            <View style={{ flexDirection: he ? 'row-reverse' : 'row', gap: 6, marginTop: 6 }}>
              {sections.map((s) => (
                <Pressable
                  key={s.key}
                  onPress={() => setSection(s.key)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: section === s.key }}
                  style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: section === s.key ? ap.primary : '#fff', borderWidth: 1, borderColor: section === s.key ? ap.primary : ap.outlineVariant }}
                >
                  <Text style={{ fontSize: 12, fontWeight: '600', color: section === s.key ? ap.onPrimary : ap.onSurface }}>{s.label}</Text>
                </Pressable>
              ))}
            </View>

            {section === 'changes' && (
              <>
                {review.milestones.map((m) => (
                  <View key={m.type} style={{ backgroundColor: '#fff', borderRadius: 10, padding: 12 }}>
                    <View style={{ flexDirection: he ? 'row-reverse' : 'row', justifyContent: 'space-between', gap: 8 }}>
                      <Text style={{ fontSize: 14, fontWeight: '600', color: ap.onSurface, flexShrink: 1, textAlign: align }}>{name(m)}</Text>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: CHANGE[m.change].color }}>{he ? CHANGE[m.change].he : CHANGE[m.change].en}</Text>
                    </View>
                    {fieldRows(m.fields)}
                  </View>
                ))}
                {review.settings.length > 0 && (
                  <View style={{ backgroundColor: '#fff', borderRadius: 10, padding: 12 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: ap.onSurface, textAlign: align }}>{he ? 'הגדרות התבנית' : 'Template settings'}</Text>
                    {fieldRows(review.settings)}
                  </View>
                )}
              </>
            )}

            {section === 'walkthrough' && review.walkthrough.map((m, i) => (
              <View key={m.type} style={{ backgroundColor: '#fff', borderRadius: 10, padding: 12 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: ap.onSurface, textAlign: align }}>{i + 1}. {name(m)}</Text>
                <Text style={{ fontSize: 12, color: ap.onSurfaceVariant, textAlign: align, marginTop: 2 }}>
                  {m.due.kind === 'offset'
                    ? (he ? `${m.due.days} ימים מתחילת הפרויקט` : `${m.due.days} days after start`)
                    : m.due.kind === 'fixed'
                      ? (he ? `מועד קבוע: ${formatDate(m.due.date, lang)}` : `Fixed: ${formatDate(m.due.date, lang)}`)
                      : (he ? `כמו ${m.due.withType}` : `Same as ${m.due.withType}`)}
                  {' · '}
                  {he ? `מתחיל היום: ${formatDate(m.sampleDueDate, lang)}` : `Starting today: ${formatDate(m.sampleDueDate, lang)}`}
                </Text>
                {m.stages.map((s, si) => (
                  <Text key={si} style={{ fontSize: 12, marginTop: 4, textAlign: align, color: s.who.kind === 'staff' && s.who.count === 0 ? '#B3261E' : ap.onSurfaceVariant }}>
                    <Text style={{ fontWeight: '600', color: ap.onSurface }}>{si + 1}) {roleLabel(s.role)} {ACTION[s.action][lang]}: </Text>
                    {whoText(s.who)}
                  </Text>
                ))}
              </View>
            ))}

            {section === 'impact' && review.impact && (
              review.impact.length === 0 ? (
                <Text style={{ fontSize: 13, color: ap.onSurfaceVariant, textAlign: align }}>{he ? 'אין פרויקטים בתהליך שיושפעו.' : 'No in-progress projects would be affected.'}</Text>
              ) : review.impact.map((p) => (
                <View key={p.id} style={{ backgroundColor: '#fff', borderRadius: 10, padding: 12 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: ap.onSurface, textAlign: align }}>👤 {p.studentNames.join(', ') || p.id}</Text>
                  {p.changes.map((c) => (
                    <Text key={c.type} style={{ fontSize: 12, color: ap.onSurfaceVariant, textAlign: align, marginTop: 3 }}>
                      {name(c)} — <Text style={{ fontWeight: '600', color: c.action === 'update' || c.action === 'create' ? ap.primary : ap.onSurfaceVariant }}>{IMPACT[c.action][lang]}</Text>
                      {' · '}
                      {c.action === 'update' && c.dueBefore !== c.dueAfter
                        ? `${formatDate(c.dueBefore, lang)} → ${formatDate(c.dueAfter, lang)}`
                        : formatDate(c.dueAfter ?? c.dueBefore, lang)}
                    </Text>
                  ))}
                </View>
              ))
            )}
          </ScrollView>
        )}

        {canApprove && review && (
          <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: ap.outlineVariant, backgroundColor: '#fff' }}>
            <Pressable onPress={onApprove} accessibilityRole="button" style={{ backgroundColor: '#10B981', borderRadius: 10, paddingVertical: 12, alignItems: 'center' }}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>
                ✅ {errorCount > 0 ? (he ? `אשר בכל זאת (${errorCount} בעיות)` : `Approve anyway (${errorCount} problems)`) : (he ? 'אשר' : 'Approve')}
              </Text>
            </Pressable>
          </View>
        )}
      </View>
    </Modal>
  );
}
