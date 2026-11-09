// app/thesis-exam.tsx
// The CS M.Sc. thesis exam (server's services/thesisExam.ts) — mobile
// counterpart of web's app/thesis-exam/page.tsx. Top-level (like
// relay-tasks.tsx): everyone taking part reaches it from the TopBar menu or a
// notification — the supervisor nominates 2 examiners, the grad school head
// approves the nomination, every participant picks 5 dates with free hours,
// the program head then the grad school head approve the matched time, the
// examiners fill the exam form after the exam, and the committee reads the
// forms. Each card shows only the viewer's actions; the server enforces them.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ActivityIndicator, Pressable, ScrollView, RefreshControl, TextInput, Modal, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { apiClient, type ThesisExamCard, type ThesisExamNomineeInput } from '@/src/api/apiClient';
import type { Lang } from '@/components/i18n';
import { useLiveRefresh } from '@/hooks/useLiveRefresh';
import { C, THESIS_EXAM_STEPS, THESIS_EXAM_STATUS_LABEL, formatExamDay, formatExamSlot, thesisExamStepIndex } from '@/components/thesisExam/shared';
import { AvailabilityPicker, Stepper, daysBetween, todayIso } from '@/components/thesisExam/AvailabilityPicker';
import { ThesisExamForm, type ThesisExamFormSource } from '@/components/thesisExam/ThesisExamForm';

const errText = (err: any, fallback: string) => err?.response?.data?.message ?? fallback;

export default function ThesisExamScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ lang?: string }>();
  const [lang, setLang] = useState<Lang>(params.lang === 'en' ? 'en' : 'he');
  const he = lang === 'he';
  const isRtl = he;
  const [exams, setExams] = useState<ThesisExamCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [formFor, setFormFor] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiClient.getMyThesisExams();
      setExams(res.exams);
      setLoadError('');
    } catch (err) {
      setLoadError(errText(err, he ? 'הטעינה נכשלה' : 'Failed to load'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [he]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
  useEffect(() => { void load(); }, [load]);
  useLiveRefresh(load);

  const formSource = useMemo<ThesisExamFormSource | null>(() => formFor ? {
    load: () => apiClient.getThesisExamForm(formFor),
    submit: (body) => apiClient.submitThesisExamForm(formFor, body),
  } : null, [formFor]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.paper }}>
      <View style={{ flexDirection: isRtl ? 'row-reverse' : 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 }}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} accessibilityRole="button" accessibilityLabel={he ? 'חזרה' : 'Back'}>
          <Text style={{ fontSize: 15, color: C.primary, fontWeight: '600' }}>{he ? 'חזרה →' : '← Back'}</Text>
        </Pressable>
        <Pressable onPress={() => setLang(he ? 'en' : 'he')} accessibilityRole="button" accessibilityLabel={he ? 'English' : 'עברית'}>
          <Text style={{ fontSize: 13, color: C.faint }}>{he ? 'EN' : 'עב'}</Text>
        </Pressable>
      </View>
      <Text style={{ fontSize: 20, fontWeight: '700', color: C.ink, marginHorizontal: 16, textAlign: isRtl ? 'right' : 'left' }} accessibilityRole="header">
        {he ? 'בחינת תזה' : 'Thesis Exam'}
      </Text>
      <Text style={{ fontSize: 13, color: C.muted, marginHorizontal: 16, marginTop: 2, textAlign: isRtl ? 'right' : 'left' }}>
        {he ? 'מינוי בוחנים, בחירת מועד, אישורים וטופס הבחינה' : 'Examiner nomination, scheduling, approvals and the exam form'}
      </Text>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator size="large" color={C.primary} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 12 }}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} />}
        >
          {!!loadError && <Text style={{ color: C.danger, backgroundColor: C.dangerBg, padding: 10, borderRadius: 8 }} accessibilityRole="alert">{loadError}</Text>}
          {exams.length === 0 ? (
            <Text style={{ textAlign: 'center', color: C.faint, marginTop: 24 }}>{he ? 'אין בחינות תזה שבהן את/ה משתתף/ת כרגע.' : "You're not part of any thesis exam right now."}</Text>
          ) : exams.map((exam) => (
            <ExamCard key={exam.milestoneId} exam={exam} lang={lang} onChanged={load} onOpenForm={() => setFormFor(exam.milestoneId)} />
          ))}
        </ScrollView>
      )}

      <Modal visible={!!formFor} animationType="slide" onRequestClose={() => setFormFor(null)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
          <View style={{ flexDirection: isRtl ? 'row-reverse' : 'row', justifyContent: 'flex-end', paddingHorizontal: 16, paddingTop: 8 }}>
            <Pressable onPress={() => setFormFor(null)} accessibilityRole="button" accessibilityLabel={he ? 'סגירה' : 'Close'} hitSlop={10}>
              <Text style={{ fontSize: 20, color: C.muted }}>✕</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
            {formSource && <ThesisExamForm source={formSource} lang={lang} onSubmitted={() => { void load(); }} />}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

function Steps({ status, lang }: { status: ThesisExamCard['status']; lang: Lang }) {
  const current = thesisExamStepIndex(status);
  return (
    <View style={{ flexDirection: lang === 'he' ? 'row-reverse' : 'row', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
      {THESIS_EXAM_STEPS.map((s, i) => {
        const done = i < current;
        const now = i === current;
        return (
          <View key={s.status} style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10, backgroundColor: done ? C.successBg : now ? C.primary : '#EEF0F4' }}>
            <Text style={{ fontSize: 10, fontWeight: now ? '700' : '500', color: done ? C.success : now ? '#fff' : C.muted }}>{done ? '✓ ' : ''}{lang === 'he' ? s.he : s.en}</Text>
          </View>
        );
      })}
    </View>
  );
}

function PrimaryButton({ label, onPress, busy, danger }: { label: string; onPress: () => void; busy?: boolean; danger?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      style={{ flex: 1, borderRadius: 20, paddingVertical: 9, alignItems: 'center', backgroundColor: danger ? '#fff' : C.primary, borderWidth: danger ? 1 : 0, borderColor: C.line, opacity: busy ? 0.6 : 1 }}
    >
      {busy ? <ActivityIndicator color={danger ? C.danger : '#fff'} size="small" /> : <Text style={{ color: danger ? C.danger : '#fff', fontWeight: '600', fontSize: 13 }}>{label}</Text>}
    </Pressable>
  );
}

function ExamCard({ exam, lang, onChanged, onOpenForm }: { exam: ThesisExamCard; lang: Lang; onChanged: () => Promise<void>; onOpenForm: () => void }) {
  const he = lang === 'he';
  const align = { textAlign: (he ? 'right' : 'left') as 'right' | 'left' };
  const has = (a: ThesisExamCard['actions'][number]) => exam.actions.includes(a);
  return (
    <View style={{ backgroundColor: '#fff', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: C.line }}>
      <Text style={{ fontSize: 15, fontWeight: '700', color: C.ink, ...align }} numberOfLines={2}>{he ? exam.projectTitleHe : exam.projectTitleEn}</Text>
      <Text style={{ fontSize: 12, color: C.muted, marginTop: 2, ...align }}>
        {exam.studentNames.join(', ')}{exam.supervisorName ? ` · ${he ? 'מנחה' : 'Supervisor'}: ${exam.supervisorName}` : ''}
      </Text>
      <Text style={{ fontSize: 13, fontWeight: '600', color: C.ink, marginTop: 6, ...align }}>{THESIS_EXAM_STATUS_LABEL[exam.status][lang]}</Text>
      <Steps status={exam.status} lang={lang} />

      {exam.examinerNames.length > 0 && (
        <Text style={{ fontSize: 12, color: C.muted, marginTop: 8, ...align }}>{he ? 'בוחנים' : 'Examiners'}: {exam.examinerNames.join(', ')}</Text>
      )}
      {exam.schedule && (
        <Text style={{ marginTop: 8, padding: 8, borderRadius: 8, backgroundColor: C.successBg, color: C.success, fontWeight: '700', fontSize: 13, ...align }}>
          🗓️ {formatExamSlot(exam.schedule, lang)}
        </Text>
      )}

      {has('nominate') && <NominationEditor exam={exam} lang={lang} onDone={onChanged} />}
      {has('review_nomination') && <NominationReview exam={exam} lang={lang} onDone={onChanged} />}

      {exam.status === 'exam_availability' && (
        <View style={{ marginTop: 8 }}>
          <Text style={{ fontSize: 12, color: C.muted, ...align }}>
            {he ? `סבב ${exam.availabilityRound} · ${exam.submittedCount} מתוך ${exam.participantCount} בחרו תאריכים` : `Round ${exam.availabilityRound} · ${exam.submittedCount} of ${exam.participantCount} picked dates`}
          </Text>
          {exam.pendingParticipants.length > 0 && (
            <Text style={{ fontSize: 12, color: C.muted, marginTop: 2, ...align }}>{he ? 'טרם בחרו' : 'Still to pick'}: {exam.pendingParticipants.map((p) => p.name).join(', ')}</Text>
          )}
          {has('availability') && exam.window && (
            <AvailabilityPicker
              lang={lang}
              window={exam.window}
              count={exam.rules.datesPerParticipant}
              initial={exam.myAvailability}
              onSubmit={async (entries) => { await apiClient.submitThesisExamAvailability(exam.milestoneId, entries); await onChanged(); }}
            />
          )}
        </View>
      )}

      {exam.status === 'exam_date_coordinator' && !has('set_date') && (
        <Text style={{ marginTop: 8, fontSize: 13, color: C.muted, ...align }}>
          {he ? 'לא נמצא מועד משותף — הרכזת האדמיניסטרטיבית תקבע את המועד.' : 'No common time was found — the administrative coordinator will set the time.'}
        </Text>
      )}
      {has('set_date') && <CoordinatorDateForm exam={exam} lang={lang} onDone={onChanged} />}

      {(exam.status === 'exam_date_review' || exam.status === 'exam_date_final_review') && exam.proposedSlot && (
        <Text style={{ marginTop: 8, fontSize: 13, color: C.ink, ...align }}>
          {exam.slotSource === 'coordinator' ? (he ? 'המועד שקבעה הרכזת: ' : 'Time set by the coordinator: ') : (he ? 'המועד המשותף שנמצא: ' : 'Common time found: ')}<Text style={{ fontWeight: '700' }}>{formatExamSlot(exam.proposedSlot, lang)}</Text>
        </Text>
      )}
      {has('review_date') && <DateReview exam={exam} lang={lang} onDone={onChanged} />}

      {(exam.status === 'exam_scheduled' || exam.status === 'exam_committee_review') && (
        <Text style={{ marginTop: 8, fontSize: 12, color: C.muted, ...align }}>
          {he ? `${exam.formsSubmittedCount} מתוך ${exam.examinerCount} בוחנים מילאו את טופס הבחינה` : `${exam.formsSubmittedCount} of ${exam.examinerCount} examiners filled in the exam form`}
        </Text>
      )}
      {has('form') && (
        <View style={{ flexDirection: 'row', marginTop: 8 }}>
          <PrimaryButton
            onPress={onOpenForm}
            label={exam.myFormSubmitted ? (he ? 'צפייה בטופס ששלחתי' : 'View my form') : exam.formOpen ? (he ? 'מילוי טופס מבחן התזה' : 'Fill in the exam form') : (he ? 'טופס מבחן התזה' : 'Thesis exam form')}
          />
        </View>
      )}
      {has('view_forms') && (
        <View style={{ marginTop: 8 }}>
          <View style={{ flexDirection: 'row' }}><PrimaryButton onPress={onOpenForm} label={he ? 'צפייה בטופסי הבוחנים' : "View the examiners' forms"} /></View>
          {exam.myRoles.committee && (
            <Text style={{ marginTop: 4, fontSize: 11, color: C.muted, ...align }}>{he ? 'הפעולות של הוועדה בהתאם לטפסים יוגדרו בהמשך.' : "The committee's actions on the forms will be defined later."}</Text>
          )}
        </View>
      )}
    </View>
  );
}

type NomineeDraft = { type: 'internal'; uid: string } | { type: 'external'; name: string; email: string; institution: string };

function NominationEditor({ exam, lang, onDone }: { exam: ThesisExamCard; lang: Lang; onDone: () => Promise<void> }) {
  const he = lang === 'he';
  const isRtl = he;
  const align = { textAlign: (he ? 'right' : 'left') as 'right' | 'left' };
  const [candidates, setCandidates] = useState<{ uid: string; name: string }[]>([]);
  const [slots, setSlots] = useState<NomineeDraft[]>(() => Array.from({ length: exam.rules.examinerCount }, () => ({ type: 'internal', uid: '' })));
  const [pickerFor, setPickerFor] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    apiClient.getThesisExamCandidates(exam.milestoneId)
      .then((res) => { if (!cancelled) setCandidates(res.candidates); })
      .catch((err) => { if (!cancelled) setError(errText(err, '')); });
    return () => { cancelled = true; };
  }, [exam.milestoneId]);

  const setSlot = (i: number, next: NomineeDraft) => setSlots((prev) => prev.map((s, idx) => (idx === i ? next : s)));
  const nameOf = (uid: string) => candidates.find((c) => c.uid === uid)?.name ?? '';
  const filtered = candidates.filter((c) => !search.trim() || c.name.toLowerCase().includes(search.trim().toLowerCase()));
  const input = { borderWidth: 1, borderColor: C.line, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, backgroundColor: '#fff', marginTop: 6, ...align };

  const submit = async () => {
    const examiners: ThesisExamNomineeInput[] = [];
    for (const s of slots) {
      if (s.type === 'internal') {
        if (!s.uid) { setError(he ? 'יש לבחור את כל הבוחנים.' : 'Choose every examiner.'); return; }
        examiners.push({ type: 'internal', uid: s.uid });
      } else {
        if (!s.name.trim() || !s.email.trim()) { setError(he ? 'יש למלא שם ודוא"ל לכל בוחן חיצוני.' : 'Fill in a name and email for each outside examiner.'); return; }
        examiners.push({ type: 'external', name: s.name.trim(), email: s.email.trim(), ...(s.institution.trim() ? { institution: s.institution.trim() } : {}) });
      }
    }
    setBusy(true);
    setError('');
    try {
      await apiClient.nominateThesisExaminers(exam.milestoneId, examiners);
      await onDone();
    } catch (err) {
      setError(errText(err, he ? 'השליחה נכשלה' : 'Sending failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ marginTop: 10, borderWidth: 1, borderColor: C.line, borderRadius: 10, padding: 10, backgroundColor: C.paper }}>
      <Text style={{ fontSize: 14, fontWeight: '700', color: C.ink, ...align }}>{he ? `מינוי ${exam.rules.examinerCount} בוחנים` : `Nominate ${exam.rules.examinerCount} examiners`}</Text>
      {exam.lastNominationRejection && (
        <Text style={{ marginTop: 6, padding: 8, borderRadius: 8, backgroundColor: C.dangerBg, color: C.danger, fontSize: 12, ...align }}>
          {he ? `המינוי הקודם נדחה על ידי ${exam.lastNominationRejection.decidedByName}: ` : `The previous nomination was rejected by ${exam.lastNominationRejection.decidedByName}: `}
          {exam.lastNominationRejection.reason}
        </Text>
      )}
      {slots.map((s, i) => (
        <View key={i} style={{ marginTop: 10, borderWidth: 1, borderColor: C.line, borderRadius: 8, padding: 8, backgroundColor: '#fff' }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: C.muted, ...align }}>{he ? `בוחן/ת ${i + 1}` : `Examiner ${i + 1}`}</Text>
          <View style={{ flexDirection: isRtl ? 'row-reverse' : 'row', gap: 6, marginTop: 6 }} accessibilityRole="radiogroup">
            {(['internal', 'external'] as const).map((t) => {
              const on = s.type === t;
              return (
                <Pressable
                  key={t}
                  onPress={() => setSlot(i, t === 'internal' ? { type: 'internal', uid: '' } : { type: 'external', name: '', email: '', institution: '' })}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, borderWidth: 1, borderColor: on ? C.primary : C.line, backgroundColor: on ? '#EEF4FF' : '#fff' }}
                >
                  <Text style={{ fontSize: 12, color: C.ink, fontWeight: on ? '700' : '500' }}>{t === 'internal' ? (he ? 'מהמכון' : 'From the college') : (he ? 'בוחן/ת חיצוני/ת' : 'Outside examiner')}</Text>
                </Pressable>
              );
            })}
          </View>
          {s.type === 'internal' ? (
            <Pressable onPress={() => { setSearch(''); setPickerFor(i); }} accessibilityRole="button" style={[input, { paddingVertical: 10 }]}>
              <Text style={{ fontSize: 13, color: s.uid ? C.ink : C.faint, ...align }}>{s.uid ? nameOf(s.uid) : (he ? '— בחירת בוחן/ת —' : '— Choose an examiner —')}</Text>
            </Pressable>
          ) : (
            <>
              <TextInput accessibilityLabel={he ? 'שם מלא' : 'Full name'} placeholder={he ? 'שם מלא' : 'Full name'} value={s.name} onChangeText={(v) => setSlot(i, { ...s, name: v })} style={input} />
              <TextInput accessibilityLabel={he ? 'דוא"ל' : 'Email'} placeholder={he ? 'דוא"ל' : 'Email'} value={s.email} onChangeText={(v) => setSlot(i, { ...s, email: v })} keyboardType="email-address" autoCapitalize="none" style={[input, { textAlign: 'left' }]} />
              <TextInput accessibilityLabel={he ? 'מוסד' : 'Institution'} placeholder={he ? 'מוסד (לא חובה)' : 'Institution (optional)'} value={s.institution} onChangeText={(v) => setSlot(i, { ...s, institution: v })} style={input} />
            </>
          )}
        </View>
      ))}
      {!!error && <Text style={{ marginTop: 8, fontSize: 12, color: C.danger, ...align }} accessibilityRole="alert">{error}</Text>}
      <View style={{ flexDirection: 'row', marginTop: 10 }}>
        <PrimaryButton busy={busy} onPress={submit} label={he ? 'שליחה לאישור ראש בית הספר' : 'Send to the grad school head'} />
      </View>

      <Modal visible={pickerFor !== null} animationType="slide" transparent onRequestClose={() => setPickerFor(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, maxHeight: '75%' }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: C.ink, ...align }}>{he ? 'בחירת בוחן/ת' : 'Choose an examiner'}</Text>
            <TextInput accessibilityLabel={he ? 'חיפוש' : 'Search'} placeholder={he ? 'חיפוש לפי שם' : 'Search by name'} value={search} onChangeText={setSearch} style={input} />
            <ScrollView style={{ marginTop: 8 }} keyboardShouldPersistTaps="handled">
              {filtered.map((c) => (
                <Pressable
                  key={c.uid}
                  onPress={() => { if (pickerFor !== null) setSlot(pickerFor, { type: 'internal', uid: c.uid }); setPickerFor(null); }}
                  accessibilityRole="button"
                  style={{ paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: C.line }}
                >
                  <Text style={{ fontSize: 14, color: C.ink, ...align }}>{c.name}</Text>
                </Pressable>
              ))}
              {filtered.length === 0 && <Text style={{ color: C.faint, marginTop: 12, textAlign: 'center' }}>{he ? 'לא נמצאו' : 'None found'}</Text>}
            </ScrollView>
            <Pressable onPress={() => setPickerFor(null)} accessibilityRole="button" style={{ marginTop: 10, alignItems: 'center', paddingVertical: 8 }}>
              <Text style={{ color: C.primary, fontWeight: '600' }}>{he ? 'ביטול' : 'Cancel'}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function ReasonedDecision({ lang, onDecide, approveLabel, children }: {
  lang: Lang;
  onDecide: (decision: 'approve' | 'reject', reason: string) => Promise<void>;
  approveLabel: string;
  children?: React.ReactNode;
}) {
  const he = lang === 'he';
  const align = { textAlign: (he ? 'right' : 'left') as 'right' | 'left' };
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const decide = async (decision: 'approve' | 'reject') => {
    if (decision === 'reject' && !reason.trim()) { setError(he ? 'יש לכתוב את סיבת הדחייה.' : 'Write the reason for rejecting.'); return; }
    setBusy(true);
    setError('');
    try {
      await onDecide(decision, reason.trim());
      setReason('');
    } catch (err) {
      setError(errText(err, he ? 'הפעולה נכשלה' : 'Action failed'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={{ marginTop: 10, borderWidth: 1, borderColor: C.line, borderRadius: 10, padding: 10, backgroundColor: C.paper }}>
      {children}
      <TextInput
        accessibilityLabel={he ? 'סיבת דחייה (חובה בדחייה)' : 'Reason (required to reject)'}
        placeholder={he ? 'סיבת דחייה (חובה בדחייה)' : 'Reason (required to reject)'}
        value={reason}
        onChangeText={setReason}
        multiline
        style={{ marginTop: 8, borderWidth: 1, borderColor: C.line, borderRadius: 8, padding: 10, minHeight: 56, fontSize: 13, backgroundColor: '#fff', textAlignVertical: 'top', ...align }}
      />
      {!!error && <Text style={{ marginTop: 6, fontSize: 12, color: C.danger, ...align }} accessibilityRole="alert">{error}</Text>}
      <View style={{ flexDirection: he ? 'row-reverse' : 'row', gap: 8, marginTop: 8 }}>
        <PrimaryButton busy={busy} onPress={() => decide('approve')} label={approveLabel} />
        <PrimaryButton busy={busy} danger onPress={() => decide('reject')} label={he ? '✗ דחייה' : '✗ Reject'} />
      </View>
    </View>
  );
}

function NominationReview({ exam, lang, onDone }: { exam: ThesisExamCard; lang: Lang; onDone: () => Promise<void> }) {
  const he = lang === 'he';
  const align = { textAlign: (he ? 'right' : 'left') as 'right' | 'left' };
  return (
    <ReasonedDecision
      lang={lang}
      approveLabel={he ? '✓ אישור המינוי' : '✓ Approve'}
      onDecide={async (decision, reason) => {
        const res = await apiClient.decideThesisExamNomination(exam.milestoneId, decision, reason);
        if (res.emailFailed?.length) Alert.alert(he ? 'שים/י לב' : 'Note', he ? `שליחת הדוא"ל נכשלה עבור: ${res.emailFailed.join(', ')}` : `The email failed for: ${res.emailFailed.join(', ')}`);
        await onDone();
      }}
    >
      <Text style={{ fontSize: 13, fontWeight: '700', color: C.ink, ...align }}>
        {he ? 'מינוי הבוחנים שהוגש' : 'Submitted nomination'}{exam.nomination ? ` · ${exam.nomination.submittedByName}` : ''}
      </Text>
      {exam.nomination?.examiners.map((e, i) => (
        <Text key={i} style={{ fontSize: 13, color: C.ink, marginTop: 4, ...align }}>
          {i + 1}. <Text style={{ fontWeight: '700' }}>{e.name}</Text> — {e.type === 'internal' ? (he ? 'מהמכון' : 'from the college') : `${he ? 'חיצוני/ת' : 'outside'}${e.institution ? `, ${e.institution}` : ''}${e.email ? ` (${e.email})` : ''}`}
        </Text>
      ))}
    </ReasonedDecision>
  );
}

function DateReview({ exam, lang, onDone }: { exam: ThesisExamCard; lang: Lang; onDone: () => Promise<void> }) {
  const he = lang === 'he';
  const align = { textAlign: (he ? 'right' : 'left') as 'right' | 'left' };
  return (
    <ReasonedDecision
      lang={lang}
      approveLabel={he ? '✓ אישור המועד' : '✓ Approve the date'}
      onDecide={async (decision, reason) => { await apiClient.decideThesisExamDate(exam.milestoneId, decision, reason); await onDone(); }}
    >
      <Text style={{ fontSize: 12, color: C.muted, ...align }}>
        {exam.remainingSlots && exam.remainingSlots > 0
          ? (he ? `בדחייה יוצע המועד המשותף הבא (נותרו עוד ${exam.remainingSlots}).` : `Rejecting offers the next common time (${exam.remainingSlots} more).`)
          : (he ? 'אין מועד נוסף — בדחייה הרכזת האדמיניסטרטיבית תקבע מועד אחר.' : 'No other time — rejecting sends it to the administrative coordinator to set another.')}
      </Text>
      {exam.rejectedSlots.map((r, i) => (
        <Text key={i} style={{ fontSize: 11, color: C.muted, marginTop: 3, ...align }}>
          ✗ {formatExamDay(r.slot.date, lang)} {r.slot.from}–{r.slot.to} · {r.byName}: {r.reason}
        </Text>
      ))}
    </ReasonedDecision>
  );
}

function CoordinatorDateForm({ exam, lang, onDone }: { exam: ThesisExamCard; lang: Lang; onDone: () => Promise<void> }) {
  const he = lang === 'he';
  const isRtl = he;
  const align = { textAlign: (he ? 'right' : 'left') as 'right' | 'left' };
  const days = useMemo(() => {
    const start = todayIso();
    const end = new Date(`${start}T12:00:00Z`);
    end.setUTCDate(end.getUTCDate() + 60);
    return daysBetween(start, end.toISOString().slice(0, 10));
  }, []);
  const [date, setDate] = useState('');
  const [from, setFrom] = useState('10:00');
  const [to, setTo] = useState('11:00');
  const [note, setNote] = useState('');
  const [showPicks, setShowPicks] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!date) { setError(he ? 'יש לבחור תאריך.' : 'Choose a date.'); return; }
    if (to <= from) { setError(he ? 'שעת הסיום חייבת להיות אחרי שעת ההתחלה.' : 'The end time must be after the start time.'); return; }
    setBusy(true);
    setError('');
    try {
      await apiClient.setThesisExamCoordinatorDate(exam.milestoneId, { date, from, to, note: note.trim() });
      await onDone();
    } catch (err) {
      setError(errText(err, he ? 'השמירה נכשלה' : 'Saving failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ marginTop: 10, borderWidth: 1, borderColor: C.line, borderRadius: 10, padding: 10, backgroundColor: C.paper }}>
      <Text style={{ fontSize: 14, fontWeight: '700', color: C.ink, ...align }}>{he ? 'לא נמצא מועד משותף — יש לקבוע תאריך ושעות' : 'No common time — set the date and hours'}</Text>
      <Text style={{ fontSize: 12, color: C.muted, marginTop: 2, ...align }}>{he ? 'המועד יועבר לאישור ראש התוכנית ולאחר מכן ראש בית הספר.' : 'The time goes to the program head, then the grad school head.'}</Text>
      {exam.rejectedSlots.map((r, i) => (
        <Text key={i} style={{ fontSize: 11, color: C.muted, marginTop: 3, ...align }}>✗ {formatExamDay(r.slot.date, lang)} {r.slot.from}–{r.slot.to} · {r.byName}: {r.reason}</Text>
      ))}
      {exam.availabilityPicks.length > 0 && (
        <View style={{ marginTop: 8 }}>
          <Pressable onPress={() => setShowPicks((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: showPicks }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: C.primary, ...align }}>{showPicks ? '▾ ' : '▸ '}{he ? 'התאריכים שבחרו המשתתפים' : "Participants' picks"}</Text>
          </Pressable>
          {showPicks && exam.availabilityPicks.map((p, i) => (
            <Text key={i} style={{ fontSize: 11, color: C.ink, marginTop: 4, ...align }}>
              <Text style={{ fontWeight: '700' }}>{p.name}: </Text>
              {p.entries.length === 0 ? (he ? 'לא בחר/ה' : 'no picks') : p.entries.map((e) => `${formatExamDay(e.date, lang)} ${e.from}–${e.to}`).join(' · ')}
            </Text>
          ))}
        </View>
      )}
      <Text style={{ fontSize: 12, color: C.muted, marginTop: 10, ...align }}>{he ? 'תאריך' : 'Date'}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 6, flexDirection: isRtl ? 'row-reverse' : 'row' }}>
        {days.map((d) => {
          const on = date === d;
          return (
            <Pressable
              key={d}
              onPress={() => setDate(d)}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={formatExamDay(d, lang, { weekday: 'long', day: 'numeric', month: 'long' })}
              style={{ paddingHorizontal: 9, paddingVertical: 6, borderRadius: 14, borderWidth: 1, borderColor: on ? C.primary : C.line, backgroundColor: on ? C.primary : '#fff' }}
            >
              <Text style={{ fontSize: 12, fontWeight: on ? '700' : '500', color: on ? '#fff' : C.ink }}>{formatExamDay(d, lang)}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <View style={{ flexDirection: isRtl ? 'row-reverse' : 'row', flexWrap: 'wrap', gap: 12, marginTop: 6 }}>
        <Stepper lang={lang} label={he ? 'משעה' : 'From'} value={from} onChange={setFrom} />
        <Stepper lang={lang} label={he ? 'עד' : 'To'} value={to} onChange={setTo} />
      </View>
      <TextInput
        accessibilityLabel={he ? 'הערה (לא חובה)' : 'Note (optional)'}
        placeholder={he ? 'הערה (לא חובה)' : 'Note (optional)'}
        value={note}
        onChangeText={setNote}
        multiline
        style={{ marginTop: 8, borderWidth: 1, borderColor: C.line, borderRadius: 8, padding: 10, minHeight: 48, fontSize: 13, backgroundColor: '#fff', textAlignVertical: 'top', ...align }}
      />
      {!!error && <Text style={{ marginTop: 6, fontSize: 12, color: C.danger, ...align }} accessibilityRole="alert">{error}</Text>}
      <View style={{ flexDirection: 'row', marginTop: 8 }}>
        <PrimaryButton busy={busy} onPress={submit} label={he ? 'קביעת המועד ושליחה לאישור' : 'Set the time and send for approval'} />
      </View>
    </View>
  );
}
