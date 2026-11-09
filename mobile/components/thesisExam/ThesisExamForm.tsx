// components/thesisExam/ThesisExamForm.tsx
// The faculty's "טופס מבחן תיזה" (server's services/thesisExam.ts
// CS_THESIS_EXAM_FORM) — mobile counterpart of web's ThesisExamFormPanel.
// The header is filled by the system; an examiner fills the ratings,
// comments and grade components and signs by sending; a reviewer (committee /
// heads) reads every examiner's form. The data source is passed in.

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, TextInput, ActivityIndicator, Alert } from 'react-native';
import type { ThesisExamFormInput, ThesisExamFormView, ThesisExamSubmittedForm } from '@/src/api/apiClient';
import type { Lang } from '@/components/i18n';
import { C } from './shared';

export interface ThesisExamFormSource {
  load: () => Promise<ThesisExamFormView>;
  submit: (body: ThesisExamFormInput) => Promise<unknown>;
}

export function ThesisExamForm({ source, lang, onSubmitted }: { source: ThesisExamFormSource; lang: Lang; onSubmitted?: () => void }) {
  const he = lang === 'he';
  const isRtl = he;
  const align = { textAlign: (isRtl ? 'right' : 'left') as 'right' | 'left' };
  const [view, setView] = useState<ThesisExamFormView | null>(null);
  const [error, setError] = useState('');
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [components, setComponents] = useState<Record<string, string>>({});
  const [comments, setComments] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setView(await source.load());
      setError('');
    } catch (err: any) {
      setError(err?.response?.data?.message ?? (he ? 'הטעינה נכשלה' : 'Failed to load'));
    }
  }, [source, he]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
  useEffect(() => { void load(); }, [load]);

  if (!view) {
    return error
      ? <Text style={{ color: C.danger, ...align }} accessibilityRole="alert">{error}</Text>
      : <ActivityIndicator color={C.primary} style={{ marginTop: 20 }} />;
  }
  const { form } = view;
  const nums = form.gradeComponents.map((c) => Number(components[c.key]));
  const complete = form.gradeComponents.every((c) => components[c.key] !== undefined && components[c.key] !== '');
  const final = complete ? Math.round(form.gradeComponents.reduce((s, c, i) => s + nums[i]! * c.weight, 0) / 10) / 10 : null;

  const send = async () => {
    setBusy(true);
    setError('');
    try {
      await source.submit({
        ratings,
        components: Object.fromEntries(form.gradeComponents.map((c) => [c.key, Number(components[c.key])])),
        comments,
      });
      await load();
      onSubmitted?.();
    } catch (err: any) {
      setError(err?.response?.data?.message ?? (he ? 'השליחה נכשלה' : 'Sending failed'));
    } finally {
      setBusy(false);
    }
  };

  const submit = () => {
    if (form.questions.some((q) => !ratings[q.key])) { setError(he ? 'יש לדרג את כל השאלות.' : 'Rate every question.'); return; }
    if (!complete || nums.some((n) => !Number.isFinite(n) || n < 1 || n > 100)) { setError(he ? 'יש לתת ציון בין 1 ל-100 לכל מרכיב.' : 'Give every component a score from 1 to 100.'); return; }
    Alert.alert(
      he ? 'חתימה ושליחה' : 'Sign and send',
      he ? 'לאחר השליחה הטופס ייחתם דיגיטלית ולא ניתן יהיה לשנותו.' : 'Once sent, the form is digitally signed and cannot be changed.',
      [{ text: he ? 'ביטול' : 'Cancel', style: 'cancel' }, { text: he ? 'שליחה' : 'Send', onPress: () => { void send(); } }],
    );
  };

  return (
    <View>
      <Text style={{ fontSize: 17, fontWeight: '700', color: C.ink, ...align }}>{he ? form.titleHe : form.titleEn}</Text>
      <View style={{ marginTop: 8, borderWidth: 1, borderColor: C.line, borderRadius: 10, padding: 10, backgroundColor: C.paper, gap: 3 }}>
        {view.header.map((h) => (
          <Text key={h.key} style={{ fontSize: 13, color: C.ink, ...align }}>
            <Text style={{ color: C.muted }}>{he ? h.labelHe : h.labelEn}: </Text>{h.value ?? '—'}
          </Text>
        ))}
      </View>

      {view.all ? (
        <View style={{ marginTop: 12, gap: 12 }}>
          <Text style={{ fontSize: 13, color: C.muted, ...align }}>
            {he ? `${view.submittedCount} מתוך ${view.examinerCount} בוחנים הגישו.` : `${view.submittedCount} of ${view.examinerCount} examiners submitted.`}
          </Text>
          {view.all.map((e) => (
            <View key={e.index} style={{ borderWidth: 1, borderColor: C.line, borderRadius: 10, padding: 10, backgroundColor: '#fff' }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: C.ink, ...align }}>{he ? `שופט/ת ${e.index + 1}: ${e.name}` : `Judge ${e.index + 1}: ${e.name}`}</Text>
              {e.form ? <Submitted form={e.form} view={view} lang={lang} /> : <Text style={{ color: C.muted, ...align }}>{he ? 'טרם הוגש' : 'Not submitted yet'}</Text>}
            </View>
          ))}
          <GradeKey view={view} lang={lang} />
        </View>
      ) : view.mine ? (
        <Submitted form={view.mine} view={view} lang={lang} />
      ) : view.canEdit ? (
        <View style={{ marginTop: 12 }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: C.ink, ...align }}>
            {he
              ? `דירוג מ-${form.ratingScale.min} (${form.ratingScale.minLabelHe}) ועד ${form.ratingScale.max} (${form.ratingScale.maxLabelHe}):`
              : `Rate ${form.ratingScale.min} (${form.ratingScale.minLabelEn}) to ${form.ratingScale.max} (${form.ratingScale.maxLabelEn}):`}
          </Text>
          {form.questions.map((q, i) => (
            <View key={q.key} style={{ marginTop: 10 }}>
              <Text style={{ fontSize: 13, color: C.ink, ...align }}>{i + 1}. {he ? q.labelHe : q.labelEn}</Text>
              <View style={{ flexDirection: isRtl ? 'row-reverse' : 'row', flexWrap: 'wrap', gap: 5, marginTop: 6 }} accessibilityRole="radiogroup">
                {Array.from({ length: form.ratingScale.max - form.ratingScale.min + 1 }, (_, k) => form.ratingScale.min + k).map((n) => {
                  const on = ratings[q.key] === n;
                  return (
                    <Pressable
                      key={n}
                      onPress={() => setRatings((r) => ({ ...r, [q.key]: n }))}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: on }}
                      accessibilityLabel={`${i + 1}: ${n}`}
                      style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: on ? C.primary : C.line, backgroundColor: on ? C.primary : '#fff' }}
                    >
                      <Text style={{ fontSize: 13, fontWeight: '600', color: on ? '#fff' : C.ink }}>{n}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))}

          <Text style={{ marginTop: 14, fontSize: 13, fontWeight: '600', color: C.ink, ...align }}>{he ? 'הערות כלליות' : 'General comments'}</Text>
          <TextInput
            accessibilityLabel={he ? 'הערות כלליות' : 'General comments'}
            value={comments}
            onChangeText={setComments}
            multiline
            style={{ marginTop: 4, borderWidth: 1, borderColor: C.line, borderRadius: 8, padding: 10, minHeight: 80, fontSize: 13, backgroundColor: '#fff', textAlignVertical: 'top', ...align }}
          />

          <Text style={{ marginTop: 14, fontSize: 13, fontWeight: '600', color: C.ink, ...align }}>{he ? 'מפתח לקביעת הציון' : 'Grade breakdown'}</Text>
          {form.gradeComponents.map((c) => (
            <View key={c.key} style={{ flexDirection: isRtl ? 'row-reverse' : 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 6 }}>
              <Text style={{ flex: 1, fontSize: 13, color: C.ink, ...align }}>{he ? c.labelHe : c.labelEn} ({c.weight}%)</Text>
              <TextInput
                accessibilityLabel={`${he ? c.labelHe : c.labelEn} (1-100)`}
                value={components[c.key] ?? ''}
                onChangeText={(v) => setComponents((s) => ({ ...s, [c.key]: v.replace(/[^0-9.]/g, '') }))}
                keyboardType="numeric"
                placeholder="1-100"
                style={{ width: 70, borderWidth: 1, borderColor: C.line, borderRadius: 8, paddingVertical: 6, textAlign: 'center', fontSize: 14, backgroundColor: '#fff' }}
              />
            </View>
          ))}
          <View style={{ flexDirection: isRtl ? 'row-reverse' : 'row', justifyContent: 'space-between', marginTop: 8, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 6 }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: C.ink }}>{he ? 'ציון סופי (1-100)' : 'Final grade (1-100)'}</Text>
            <Text style={{ fontSize: 14, fontWeight: '700', color: C.ink }}>{final ?? '—'}</Text>
          </View>
          <GradeKey view={view} lang={lang} />

          {!!error && <Text style={{ marginTop: 8, color: C.danger, fontSize: 13, ...align }} accessibilityRole="alert">{error}</Text>}
          <Pressable
            onPress={submit}
            disabled={busy}
            accessibilityRole="button"
            style={{ marginTop: 14, backgroundColor: C.primary, borderRadius: 22, paddingVertical: 11, alignItems: 'center', opacity: busy ? 0.6 : 1 }}
          >
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700' }}>{he ? 'חתימה ושליחה' : 'Sign and send'}</Text>}
          </Pressable>
        </View>
      ) : (
        <Text style={{ marginTop: 12, padding: 10, borderRadius: 8, backgroundColor: C.paper, color: C.muted, fontSize: 13, ...align }}>
          {he ? view.lockedReasonHe : view.lockedReasonEn}
        </Text>
      )}
    </View>
  );
}

function GradeKey({ view, lang }: { view: ThesisExamFormView; lang: Lang }) {
  const he = lang === 'he';
  const [open, setOpen] = useState(false);
  const align = { textAlign: (he ? 'right' : 'left') as 'right' | 'left' };
  return (
    <View style={{ marginTop: 10, borderWidth: 1, borderColor: C.line, borderRadius: 8, padding: 8, backgroundColor: C.paper }}>
      <Pressable onPress={() => setOpen((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: open }}>
        <Text style={{ fontSize: 12, fontWeight: '700', color: C.ink, ...align }}>{open ? '▾ ' : '▸ '}{he ? 'מפתח ציונים ודגשים' : 'Grade key'}</Text>
      </Pressable>
      {open && view.form.gradeKey.map((g) => (
        <View key={g.range} style={{ marginTop: 6 }}>
          <Text style={{ fontSize: 12, color: C.ink, ...align }}><Text style={{ fontWeight: '700' }}>{g.range}</Text> · {he ? g.statusHe : g.statusEn}</Text>
          {!!(he ? g.publicationHe : g.publicationEn) && <Text style={{ fontSize: 11, color: C.muted, ...align }}>{he ? g.publicationHe : g.publicationEn}</Text>}
        </View>
      ))}
    </View>
  );
}

function Submitted({ form, view, lang }: { form: ThesisExamSubmittedForm; view: ThesisExamFormView; lang: Lang }) {
  const he = lang === 'he';
  const row = { flexDirection: (he ? 'row-reverse' : 'row') as 'row-reverse' | 'row', justifyContent: 'space-between' as const, gap: 8, paddingVertical: 3 };
  const align = { textAlign: (he ? 'right' : 'left') as 'right' | 'left' };
  return (
    <View style={{ marginTop: 8 }}>
      {view.form.questions.map((q, i) => (
        <View key={q.key} style={row}>
          <Text style={{ flex: 1, fontSize: 12, color: C.ink, ...align }}>{i + 1}. {he ? q.labelHe : q.labelEn}</Text>
          <Text style={{ fontSize: 13, fontWeight: '700', color: C.ink }}>{form.ratings[q.key]}</Text>
        </View>
      ))}
      {!!form.comments && (
        <Text style={{ marginTop: 6, fontSize: 12, color: C.ink, ...align }}>
          <Text style={{ fontWeight: '700' }}>{he ? 'הערות: ' : 'Comments: '}</Text>{form.comments}
        </Text>
      )}
      {view.form.gradeComponents.map((c) => (
        <View key={c.key} style={row}>
          <Text style={{ fontSize: 12, color: C.ink }}>{he ? c.labelHe : c.labelEn} ({c.weight}%)</Text>
          <Text style={{ fontSize: 13, fontWeight: '700', color: C.ink }}>{form.components[c.key]}</Text>
        </View>
      ))}
      <View style={[row, { borderTopWidth: 1, borderTopColor: C.line, marginTop: 4 }]}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: C.ink }}>{he ? 'ציון סופי' : 'Final grade'}</Text>
        <Text style={{ fontSize: 13, fontWeight: '700', color: C.ink }}>{form.finalGrade}</Text>
      </View>
      <Text style={{ marginTop: 4, fontSize: 11, color: C.muted, ...align }}>
        ✍️ {he ? `נחתם דיגיטלית על ידי ${form.signature.signerName}` : `Digitally signed by ${form.signature.signerName}`} · {new Date(form.signature.signedAt).toLocaleString(he ? 'he-IL' : 'en-GB')} · {form.signature.code}
      </Text>
    </View>
  );
}
