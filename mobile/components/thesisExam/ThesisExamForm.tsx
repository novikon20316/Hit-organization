// components/thesisExam/ThesisExamForm.tsx
// The faculty's "טופס מבחן תיזה" (server's services/thesisExam.ts
// CS_THESIS_EXAM_FORM) — mobile counterpart of web's ThesisExamFormPanel.
// The header is filled by the system.
//
// Since 2026-11-23 the supervisor is the exam's chairman and fills the whole
// form — research 40% (their opinion), writing 40% (agreed with the
// examiners), defense 20% — and sending it is their signature. The examiners
// grade nothing: they see the project's details and, once the chairman sent
// the form, sign it. Reviewers (committee / heads / coordinator) read it.
// Older exams, where the examiners filled their own forms, still render them.

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, TextInput, ActivityIndicator, Alert } from 'react-native';
import type { ThesisExamChairForm, ThesisExamChairFormInput, ThesisExamFormView, ThesisExamSignatureInfo, ThesisExamSubmittedForm } from '@/src/api/apiClient';
import type { Lang } from '@/components/i18n';
import { C } from './shared';

export interface ThesisExamFormSource {
  load: () => Promise<ThesisExamFormView>;
  /** The supervisor (exam chairman) sends the form — logged-in screen only. */
  submitChair?: (body: ThesisExamChairFormInput) => Promise<unknown>;
  /** An examiner signs the chairman's form. */
  sign?: () => Promise<unknown>;
  /** Older exams only: the supervisor's separate research grade. */
  submitSupervisor?: (research: number) => Promise<unknown>;
}

export function ThesisExamForm({ source, lang, onSubmitted }: { source: ThesisExamFormSource; lang: Lang; onSubmitted?: () => void }) {
  const he = lang === 'he';
  const isRtl = he;
  const align = { textAlign: (isRtl ? 'right' : 'left') as 'right' | 'left' };
  const [view, setView] = useState<ThesisExamFormView | null>(null);
  const [error, setError] = useState('');
  const [components, setComponents] = useState<Record<string, string>>({});
  const [comments, setComments] = useState('');
  const [research, setResearch] = useState('');
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
  const draftFinal = complete && nums.every((n) => Number.isFinite(n))
    ? Math.round(form.gradeComponents.reduce((s, c, i) => s + nums[i]! * c.weight, 0) / 10) / 10
    : null;

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      await load();
      onSubmitted?.();
    } catch (err: any) {
      setError(err?.response?.data?.message ?? (he ? 'השליחה נכשלה' : 'Sending failed'));
    } finally {
      setBusy(false);
    }
  };

  const submitChair = () => {
    if (!source.submitChair) return;
    if (!complete || nums.some((n) => !Number.isFinite(n) || n < 1 || n > 100)) { setError(he ? 'יש לתת ציון בין 1 ל-100 לכל אחד משלושת הרכיבים.' : 'Give each of the three components a score from 1 to 100.'); return; }
    Alert.alert(
      he ? 'חתימה ושליחה' : 'Sign and send',
      he ? `לאחר השליחה הטופס ייחתם דיגיטלית בשמך ולא ניתן יהיה לשנותו, והבוחנים יתבקשו לחתום עליו. ציון סופי: ${draftFinal ?? '—'}.` : `Once sent, the form is digitally signed in your name and can't be changed, and the examiners are asked to sign it. Final grade: ${draftFinal ?? '—'}.`,
      [{ text: he ? 'ביטול' : 'Cancel', style: 'cancel' }, {
        text: he ? 'שליחה' : 'Send',
        onPress: () => { void run(() => source.submitChair!({ components: Object.fromEntries(form.gradeComponents.map((c, i) => [c.key, nums[i]!])), comments })); },
      }],
    );
  };

  const signForm = () => {
    if (!source.sign) return;
    Alert.alert(
      he ? 'חתימה על טופס הבחינה' : 'Sign the exam form',
      he ? 'לחתום על טופס הבחינה? לא ניתן לבטל את החתימה.' : "Sign the exam form? The signature can't be undone.",
      [{ text: he ? 'ביטול' : 'Cancel', style: 'cancel' }, { text: he ? 'חתימה' : 'Sign', onPress: () => { void run(() => source.sign!()); } }],
    );
  };

  const submitResearch = () => {
    const v = Number(research);
    if (!source.submitSupervisor) return;
    if (research === '' || !Number.isFinite(v) || v < 1 || v > 100) { setError(he ? 'ציון המחקר בין 1 ל-100.' : 'The research score is 1–100.'); return; }
    Alert.alert(
      he ? 'חתימה ושליחה' : 'Sign and send',
      he ? 'לאחר השליחה הציון ייחתם דיגיטלית ולא ניתן יהיה לשנותו.' : 'Once sent, the grade is digitally signed and cannot be changed.',
      [{ text: he ? 'ביטול' : 'Cancel', style: 'cancel' }, { text: he ? 'שליחה' : 'Send', onPress: () => { void run(() => source.submitSupervisor!(v)); } }],
    );
  };

  const button = (onPress: () => void, label: string) => (
    <Pressable
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      style={{ marginTop: 14, backgroundColor: C.primary, borderRadius: 22, paddingVertical: 11, alignItems: 'center', opacity: busy ? 0.6 : 1 }}
    >
      {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700' }}>{label}</Text>}
    </Pressable>
  );
  const lockedNote = (text: string | null) => (
    <Text style={{ marginTop: 12, padding: 10, borderRadius: 8, backgroundColor: C.paper, color: C.muted, fontSize: 13, ...align }}>{text}</Text>
  );
  const errorLine = !!error && <Text style={{ marginTop: 8, color: C.danger, fontSize: 13, ...align }} accessibilityRole="alert">{error}</Text>;
  const locked = he ? view.lockedReasonHe : view.lockedReasonEn;

  let body: React.ReactNode;
  if (view.chair) {
    body = (
      <View style={{ marginTop: 12, gap: 10 }}>
        <ChairView chair={view.chair} view={view} lang={lang} />
        <Signatures view={view} lang={lang} />
        {view.canSign && source.sign && (
          <View style={{ borderWidth: 1, borderColor: C.primary, borderRadius: 10, padding: 10 }}>
            <Text style={{ fontSize: 13, color: C.ink, ...align }}>
              {he ? 'בלחיצה על "חתימה" את/ה מאשר/ת את טופס הבחינה כפי שמילא אותו יו"ר הבחינה. החתימה נשמרת דיגיטלית.' : "By tapping \"Sign\" you approve the exam form as the exam's chairman filled it. The signature is stored digitally."}
            </Text>
            {errorLine}
            {button(signForm, he ? '✍️ חתימה על הטופס' : '✍️ Sign the form')}
          </View>
        )}
      </View>
    );
  } else if (view.viewerKind === 'supervisor' && view.canEdit && source.submitChair) {
    body = (
      <View style={{ marginTop: 12 }}>
        <Text style={{ fontSize: 12, color: C.muted, ...align }}>
          {he
            ? 'כיו"ר הבחינה, את/ה ממלא/ת את שלושת רכיבי הציון. ציון כתיבת התזה נקבע בדיון בינך לבין הבוחנים. לאחר השליחה הטופס ייחתם בשמך וכל בוחן/ת יקבל/תקבל דוא"ל לחתימה; רק לאחר שכולם יחתמו הטופס יעבור לאישור ראש בית הספר ללימודים מתקדמים.'
            : "As the exam's chairman you fill in all three grade components. The thesis writing grade is agreed with the examiners. Once sent, the form is signed in your name and each examiner is emailed to sign it; only after everyone signs does it go to the grad school head."}
        </Text>
        {form.gradeComponents.map((c) => (
          <View key={c.key} style={{ flexDirection: isRtl ? 'row-reverse' : 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, color: C.ink, ...align }}>{he ? c.labelHe : c.labelEn} ({c.weight}%)</Text>
              <Text style={{ fontSize: 11, color: C.muted, ...align }}>{he ? c.noteHe : c.noteEn}</Text>
            </View>
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
        <View style={{ flexDirection: isRtl ? 'row-reverse' : 'row', justifyContent: 'space-between', marginTop: 10, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 6 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: C.ink }}>{he ? 'ציון סופי (משוקלל)' : 'Final grade (weighted)'}</Text>
          <Text style={{ width: 70, textAlign: 'center', fontSize: 13, fontWeight: '700', color: C.ink }}>{draftFinal ?? '—'}</Text>
        </View>
        <Text style={{ marginTop: 14, fontSize: 13, fontWeight: '600', color: C.ink, ...align }}>{he ? 'הערות (לא חובה)' : 'Comments (optional)'}</Text>
        <TextInput
          accessibilityLabel={he ? 'הערות' : 'Comments'}
          value={comments}
          onChangeText={setComments}
          multiline
          style={{ marginTop: 4, borderWidth: 1, borderColor: C.line, borderRadius: 8, padding: 10, minHeight: 70, fontSize: 13, backgroundColor: '#fff', textAlignVertical: 'top', ...align }}
        />
        <GradeKey view={view} lang={lang} />
        {errorLine}
        {button(submitChair, he ? 'חתימה ושליחה לבוחנים' : 'Sign and send to the examiners')}
      </View>
    );
  } else if (view.legacy || view.supervisorGrade || view.legacyResearchOpen) {
    // Older exams — the examiners filled their own forms.
    const researchC = form.gradeComponents.find((g) => g.key === 'research');
    const researchLabel = researchC ? `${he ? researchC.labelHe : researchC.labelEn} (${researchC.weight}%)` : '';
    body = view.viewerKind === 'reviewer' && view.all ? (
      <View style={{ marginTop: 12, gap: 12 }}>
        <Text style={{ fontSize: 13, color: C.muted, ...align }}>
          {he ? `${view.submittedCount} מתוך ${view.examinerCount} בוחנים הגישו.` : `${view.submittedCount} of ${view.examinerCount} examiners submitted.`}
        </Text>
        {view.summary && <LegacySummary view={view} lang={lang} />}
        {view.all.map((e) => (
          <View key={e.index} style={{ borderWidth: 1, borderColor: C.line, borderRadius: 10, padding: 10, backgroundColor: '#fff' }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: C.ink, ...align }}>{he ? `שופט/ת ${e.index + 1}: ${e.name}` : `Judge ${e.index + 1}: ${e.name}`}</Text>
            {e.form ? <Submitted form={e.form} view={view} lang={lang} /> : <Text style={{ color: C.muted, ...align }}>{he ? 'טרם הוגש' : 'Not submitted yet'}</Text>}
          </View>
        ))}
      </View>
    ) : view.viewerKind === 'supervisor' ? (
      view.supervisorGrade ? (
        <View style={{ marginTop: 12 }}>
          <View style={{ flexDirection: isRtl ? 'row-reverse' : 'row', justifyContent: 'space-between', gap: 8 }}>
            <Text style={{ flex: 1, fontSize: 13, color: C.ink, ...align }}>{researchLabel}</Text>
            <Text style={{ fontSize: 14, fontWeight: '700', color: C.ink }}>{view.supervisorGrade.research}</Text>
          </View>
          <Signature sig={view.supervisorGrade.signature} lang={lang} />
        </View>
      ) : view.legacyResearchOpen && source.submitSupervisor ? (
        <View style={{ marginTop: 12 }}>
          <View style={{ flexDirection: isRtl ? 'row-reverse' : 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <Text style={{ flex: 1, fontSize: 13, color: C.ink, ...align }}>{researchLabel}</Text>
            <TextInput
              accessibilityLabel={`${researchLabel} (1-100)`}
              value={research}
              onChangeText={(v) => setResearch(v.replace(/[^0-9.]/g, ''))}
              keyboardType="numeric"
              placeholder="1-100"
              style={{ width: 70, borderWidth: 1, borderColor: C.line, borderRadius: 8, paddingVertical: 6, textAlign: 'center', fontSize: 14, backgroundColor: '#fff' }}
            />
          </View>
          {errorLine}
          {button(submitResearch, he ? 'חתימה ושליחה' : 'Sign and send')}
        </View>
      ) : lockedNote(locked ?? (he ? 'טרם ניתן ציון.' : 'No grade given yet.'))
    ) : view.mine ? <Submitted form={view.mine} view={view} lang={lang} /> : lockedNote(locked);
  } else {
    body = lockedNote(locked ?? (he ? 'הטופס טרם נשלח.' : 'The form has not been sent yet.'));
  }

  return (
    <View>
      <Text style={{ fontSize: 17, fontWeight: '700', color: C.ink, ...align }}>{he ? form.titleHe : form.titleEn}</Text>
      <View style={{ marginTop: 8, borderWidth: 1, borderColor: C.line, borderRadius: 10, padding: 10, backgroundColor: C.paper, gap: 3 }}>
        {view.header.filter((h) => h.value).map((h) => (
          <Text key={h.key} style={{ fontSize: 13, color: C.ink, ...align }}>
            <Text style={{ color: C.muted }}>{he ? h.labelHe : h.labelEn}: </Text>{h.value}
          </Text>
        ))}
      </View>
      {body}
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

function Signature({ sig, lang }: { sig: ThesisExamSignatureInfo; lang: Lang }) {
  const he = lang === 'he';
  return (
    <Text style={{ marginTop: 4, fontSize: 11, color: C.muted, textAlign: he ? 'right' : 'left' }}>
      ✍️ {he ? `נחתם דיגיטלית על ידי ${sig.signerName}` : `Digitally signed by ${sig.signerName}`} · {new Date(sig.signedAt).toLocaleString(he ? 'he-IL' : 'en-GB')} · {sig.code}
    </Text>
  );
}

function ChairView({ chair, view, lang }: { chair: ThesisExamChairForm; view: ThesisExamFormView; lang: Lang }) {
  const he = lang === 'he';
  const row = { flexDirection: (he ? 'row-reverse' : 'row') as 'row-reverse' | 'row', justifyContent: 'space-between' as const, gap: 8, paddingVertical: 3 };
  const align = { textAlign: (he ? 'right' : 'left') as 'right' | 'left' };
  const value = (key: string) => (key === 'research' ? chair.research : key === 'writing' ? chair.writing : chair.defense);
  return (
    <View style={{ borderWidth: 1, borderColor: C.line, borderRadius: 10, padding: 10, backgroundColor: C.paper }}>
      <Text style={{ fontSize: 14, fontWeight: '700', color: C.ink, ...align }}>{he ? 'ציון משוקלל' : 'Weighted grade'}</Text>
      {view.form.gradeComponents.map((c) => (
        <View key={c.key} style={row}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 12, color: C.ink, ...align }}>{he ? c.labelHe : c.labelEn} ({c.weight}%)</Text>
            <Text style={{ fontSize: 11, color: C.muted, ...align }}>{he ? c.noteHe : c.noteEn}</Text>
          </View>
          <Text style={{ fontSize: 13, fontWeight: '700', color: C.ink }}>{value(c.key) ?? '—'}</Text>
        </View>
      ))}
      <View style={[row, { borderTopWidth: 1, borderTopColor: C.line, marginTop: 4 }]}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: C.ink }}>{he ? 'ציון סופי' : 'Final grade'}</Text>
        <Text style={{ fontSize: 13, fontWeight: '700', color: C.ink }}>{chair.finalGrade ?? '—'}</Text>
      </View>
      {!!chair.comments && (
        <Text style={{ marginTop: 6, fontSize: 12, color: C.ink, ...align }}>
          <Text style={{ fontWeight: '700' }}>{he ? 'הערות: ' : 'Comments: '}</Text>{chair.comments}
        </Text>
      )}
      <Text style={{ marginTop: 6, fontSize: 12, fontWeight: '600', color: C.ink, ...align }}>{he ? `יו"ר הבחינה: ${chair.chairName}` : `Exam chairman: ${chair.chairName}`}</Text>
      <Signature sig={chair.signature} lang={lang} />
      <GradeKey view={view} lang={lang} />
    </View>
  );
}

function Signatures({ view, lang }: { view: ThesisExamFormView; lang: Lang }) {
  const he = lang === 'he';
  const align = { textAlign: (he ? 'right' : 'left') as 'right' | 'left' };
  if (view.signatures.length === 0) return null;
  return (
    <View style={{ borderWidth: 1, borderColor: C.line, borderRadius: 10, padding: 10, backgroundColor: '#fff', gap: 6 }}>
      <Text style={{ fontSize: 14, fontWeight: '700', color: C.ink, ...align }}>
        {he ? `חתימות הבוחנים (${view.signedCount}/${view.signatures.length})` : `Examiners' signatures (${view.signedCount}/${view.signatures.length})`}
      </Text>
      {view.signatures.map((s) => (
        <View key={s.index}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: C.ink, ...align }}>{s.name}{s.isMe ? (he ? ' (את/ה)' : ' (you)') : ''}</Text>
          {s.signed && s.signature
            ? <Signature sig={s.signature} lang={lang} />
            : <Text style={{ fontSize: 11, color: C.danger, ...align }}>{he ? 'ממתין לחתימה' : 'Awaiting signature'}</Text>}
        </View>
      ))}
    </View>
  );
}

// ── Older exams (before 2026-11-23) ─────────────────────────────────────────

function Submitted({ form, view, lang }: { form: ThesisExamSubmittedForm; view: ThesisExamFormView; lang: Lang }) {
  const he = lang === 'he';
  const row = { flexDirection: (he ? 'row-reverse' : 'row') as 'row-reverse' | 'row', justifyContent: 'space-between' as const, gap: 8, paddingVertical: 3 };
  const align = { textAlign: (he ? 'right' : 'left') as 'right' | 'left' };
  const writing = view.form.gradeComponents.find((c) => c.key === 'writing');
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
      {writing && (
        <View style={row}>
          <Text style={{ fontSize: 12, color: C.ink }}>{he ? writing.labelHe : writing.labelEn} ({writing.weight}%)</Text>
          <Text style={{ fontSize: 13, fontWeight: '700', color: C.ink }}>{form.components.writing ?? '—'}</Text>
        </View>
      )}
      <View style={row}>
        <Text style={{ flex: 1, fontSize: 12, color: C.muted, ...align }}>{he ? 'ממוצע סעיפים 1–5 (תרומה לרכיב מבחן ההגנה)' : 'Average of items 1–5 (share of the defense component)'}</Text>
        <Text style={{ fontSize: 13, fontWeight: '700', color: C.ink }}>{form.defenseContribution}</Text>
      </View>
      <Signature sig={form.signature} lang={lang} />
    </View>
  );
}

function LegacySummary({ view, lang }: { view: ThesisExamFormView; lang: Lang }) {
  const he = lang === 'he';
  const s = view.summary!;
  const row = { flexDirection: (he ? 'row-reverse' : 'row') as 'row-reverse' | 'row', justifyContent: 'space-between' as const, gap: 8, paddingVertical: 3 };
  const align = { textAlign: (he ? 'right' : 'left') as 'right' | 'left' };
  const sub = (key: string) => key === 'research' ? (he ? 'ציון המנחה' : "Supervisor's grade") : key === 'writing' ? (he ? 'ממוצע הבוחנים' : "Examiners' average") : (he ? 'מחושב אוטומטית: ממוצע סעיפים 1–5 של כל הבוחנים' : 'Computed: the average of items 1–5 across all examiners');
  return (
    <View style={{ borderWidth: 1, borderColor: C.line, borderRadius: 10, padding: 10, backgroundColor: C.paper }}>
      <Text style={{ fontSize: 14, fontWeight: '700', color: C.ink, ...align }}>{he ? 'ציון משוקלל' : 'Combined grade'}</Text>
      {view.form.gradeComponents.map((c) => (
        <View key={c.key} style={row}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 12, color: C.ink, ...align }}>{he ? c.labelHe : c.labelEn} ({c.weight}%)</Text>
            <Text style={{ fontSize: 11, color: C.muted, ...align }}>{sub(c.key)}</Text>
          </View>
          <Text style={{ fontSize: 13, fontWeight: '700', color: C.ink }}>{s[c.key as 'research' | 'writing' | 'defense'] ?? '—'}</Text>
        </View>
      ))}
      <View style={[row, { borderTopWidth: 1, borderTopColor: C.line, marginTop: 4 }]}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: C.ink }}>{he ? 'ציון סופי' : 'Final grade'}</Text>
        <Text style={{ fontSize: 13, fontWeight: '700', color: C.ink }}>{s.finalGrade ?? '—'}</Text>
      </View>
      {view.supervisorGrade && <Signature sig={view.supervisorGrade.signature} lang={lang} />}
    </View>
  );
}
