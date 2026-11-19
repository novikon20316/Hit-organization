// app/thesis-exam.tsx
// The CS M.Sc. thesis exam (server's services/thesisExam.ts) — mobile
// counterpart of web's app/thesis-exam/page.tsx. Top-level (like
// relay-tasks.tsx): everyone taking part reaches it from the TopBar menu or a
// notification — the supervisor nominates 2 examiners, the grad school head
// approves the nomination, every participant picks 5 dates with free hours,
// the program head then the grad school head approve the matched time, the
// examiners fill the exam form after the exam and the supervisor gives the
// research grade; the final grade (by the template's milestone weights, with
// its breakdown) goes to the grad school head, then to the administrative
// coordinator's final approval before Michlol. Each card shows only the viewer's actions; the server enforces them.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ActivityIndicator, Pressable, ScrollView, RefreshControl, TextInput, Modal, Alert, Linking, type LayoutChangeEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { apiClient, type ThesisExamCard, type ThesisExamGradeBreakdown, type ThesisExamNomineeInput } from '@/src/api/apiClient';
import type { Lang } from '@/components/i18n';
import { useLiveRefresh } from '@/hooks/useLiveRefresh';
import { C, THESIS_EXAM_STEPS, THESIS_EXAM_STATUS_LABEL, formatExamDay, formatExamDeadline, formatExamSlot, thesisExamStepIndex } from '@/components/thesisExam/shared';
import { AvailabilityPicker, Stepper, daysBetween, todayIso, isShabbat, EXAM_DAY_START, EXAM_MIN_MINUTES, fridayLatestEnd, latestEndFor, shiftTime } from '@/components/thesisExam/AvailabilityPicker';
import { ThesisExamForm, type ThesisExamFormSource } from '@/components/thesisExam/ThesisExamForm';

const errText = (err: any, fallback: string) => err?.response?.data?.message ?? fallback;

export default function ThesisExamScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ lang?: string; milestoneId?: string }>();
  const [lang, setLang] = useState<Lang>(params.lang === 'en' ? 'en' : 'he');
  const he = lang === 'he';
  const isRtl = he;
  const [exams, setExams] = useState<ThesisExamCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [formFor, setFormFor] = useState<{ id: string; as?: 'supervisor' } | null>(null);

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

  // ?milestoneId=… (the supervisor dashboard's Quick Tasks) scrolls to and
  // rings that exam's card once it has laid out. Ring clears after a while.
  const scrollRef = useRef<ScrollView>(null);
  const focusId = typeof params.milestoneId === 'string' ? params.milestoneId : null;
  const [ringId, setRingId] = useState<string | null>(focusId);
  const scrolledRef = useRef(false);
  useEffect(() => {
    if (!ringId) return;
    const t = setTimeout(() => setRingId(null), 5000);
    return () => clearTimeout(t);
  }, [ringId]);
  const onExamLayout = (id: string) => (e: LayoutChangeEvent) => {
    if (id !== focusId || scrolledRef.current) return;
    scrolledRef.current = true;
    const y = e.nativeEvent.layout.y;
    setTimeout(() => scrollRef.current?.scrollTo({ y: Math.max(0, y - 8), animated: true }), 0);
  };

  const formSource = useMemo<ThesisExamFormSource | null>(() => formFor ? {
    load: () => apiClient.getThesisExamForm(formFor.id, formFor.as),
    submit: (body) => apiClient.submitThesisExamForm(formFor.id, body),
    submitSupervisor: (research) => apiClient.submitThesisExamSupervisorGrade(formFor.id, research),
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
          ref={scrollRef}
          contentContainerStyle={{ padding: 16, gap: 12 }}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} />}
        >
          {!!loadError && <Text style={{ color: C.danger, backgroundColor: C.dangerBg, padding: 10, borderRadius: 8 }} accessibilityRole="alert">{loadError}</Text>}
          {exams.length === 0 ? (
            <Text style={{ textAlign: 'center', color: C.faint, marginTop: 24 }}>{he ? 'אין בחינות תזה שבהן את/ה משתתף/ת כרגע.' : "You're not part of any thesis exam right now."}</Text>
          ) : exams.map((exam) => (
            <ExamCard key={exam.milestoneId} exam={exam} lang={lang} highlighted={exam.milestoneId === ringId} onLayout={onExamLayout(exam.milestoneId)} onChanged={load} onOpenForm={(as) => setFormFor({ id: exam.milestoneId, as })} />
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

function ExamCard({ exam, lang, highlighted = false, onLayout, onChanged, onOpenForm }: { exam: ThesisExamCard; lang: Lang; highlighted?: boolean; onLayout?: (e: LayoutChangeEvent) => void; onChanged: () => Promise<void>; onOpenForm: (as?: 'supervisor') => void }) {
  const he = lang === 'he';
  const align = { textAlign: (he ? 'right' : 'left') as 'right' | 'left' };
  const has = (a: ThesisExamCard['actions'][number]) => exam.actions.includes(a);
  return (
    <View onLayout={onLayout} style={{ backgroundColor: '#fff', borderRadius: 12, padding: 14, borderWidth: highlighted ? 2 : 1, borderColor: highlighted ? C.primary : C.line }}>
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
          {!!exam.lateEntryDeadline && !has('late_entry') && (
            <Text style={{ fontSize: 12, color: C.accent, fontWeight: '600', marginTop: 4, ...align }}>
              {he
                ? `המועד האחרון עבר — הרכזת האדמיניסטרטיבית משלימה את התאריכים החסרים עד ${formatExamDeadline(exam.lateEntryDeadline, lang)}, ואז המערכת תקבע מועד לפי מי שבחרו.`
                : `The deadline passed — the administrative coordinator is completing the missing dates until ${formatExamDeadline(exam.lateEntryDeadline, lang)}; then the system sets the time from those who picked.`}
            </Text>
          )}
          {has('late_entry') && <LateEntryPanel exam={exam} lang={lang} onDone={onChanged} />}
          {has('availability') && exam.window && (
            <AvailabilityPicker
              lang={lang}
              window={exam.window}
              count={exam.rules.datesPerParticipant}
              deadline={exam.lateEntryDeadline ?? exam.pickDeadline}
              initial={exam.myAvailability}
              onSubmit={async (entries) => { await apiClient.submitThesisExamAvailability(exam.milestoneId, entries); await onChanged(); }}
            />
          )}
        </View>
      )}

      {exam.excludedNames.length > 0 && exam.status !== 'exam_availability' && (
        <Text style={{ marginTop: 6, fontSize: 12, color: C.muted, ...align }}>{he ? 'המועד נקבע ללא תאריכים של' : 'Time set without dates from'}: {exam.excludedNames.join(', ')}</Text>
      )}
      {exam.status === 'exam_date_coordinator' && !has('set_date') && (
        <Text style={{ marginTop: 8, fontSize: 13, color: C.muted, ...align }}>
          {exam.coordinatorTask === 'set_hours'
            ? (he ? `נמצא מועד משותף${exam.hoursWindow ? `: ${formatExamSlot(exam.hoursWindow, lang)}` : ''} — הרכזת האדמיניסטרטיבית קובעת את שעות הבחינה.` : `A common time was found${exam.hoursWindow ? `: ${formatExamSlot(exam.hoursWindow, lang)}` : ''} — the administrative coordinator is setting the exam hours.`)
            : (he ? 'לא נמצא מועד משותף — הרכזת האדמיניסטרטיבית תקבע את המועד.' : 'No common time was found — the administrative coordinator will set the time.')}
        </Text>
      )}
      {has('set_date') && <CoordinatorDateForm exam={exam} lang={lang} onDone={onChanged} />}

      {(exam.status === 'exam_date_review' || exam.status === 'exam_date_final_review') && exam.proposedSlot && (
        <Text style={{ marginTop: 8, fontSize: 13, color: C.ink, ...align }}>
          {exam.slotSource === 'coordinator' ? (he ? 'המועד שקבעה הרכזת: ' : 'Time set by the coordinator: ') : (he ? 'המועד המשותף שנמצא: ' : 'Common time found: ')}<Text style={{ fontWeight: '700' }}>{formatExamSlot(exam.proposedSlot, lang)}</Text>
        </Text>
      )}
      {has('review_date') && <DateReview exam={exam} lang={lang} onDone={onChanged} />}

      {(exam.status === 'exam_scheduled' || exam.status === 'exam_committee_review' || exam.status === 'exam_grades_pending') && (
        <Text style={{ marginTop: 8, fontSize: 12, color: C.muted, ...align }}>
          {he ? `${exam.formsSubmittedCount} מתוך ${exam.examinerCount} בוחנים מילאו את טופס הבחינה` : `${exam.formsSubmittedCount} of ${exam.examinerCount} examiners filled in the exam form`}
        </Text>
      )}
      {has('form') && (
        <View style={{ flexDirection: 'row', marginTop: 8 }}>
          <PrimaryButton
            onPress={() => onOpenForm()}
            label={exam.myFormSubmitted ? (he ? 'צפייה בטופס ששלחתי' : 'View my form') : exam.formOpen ? (he ? 'מילוי טופס מבחן התזה' : 'Fill in the exam form') : (he ? 'טופס מבחן התזה' : 'Thesis exam form')}
          />
        </View>
      )}
      {has('supervisor_grade') && (
        <View style={{ marginTop: 8 }}>
          <View style={{ flexDirection: 'row' }}>
            <PrimaryButton
              onPress={() => onOpenForm('supervisor')}
              label={exam.supervisorGradeGiven ? (he ? 'צפייה בציון המחקר שנתתי' : 'View my research grade') : (he ? 'מתן ציון מחקר (מנחה)' : 'Give the research grade')}
            />
          </View>
          <Text style={{ marginTop: 4, fontSize: 11, color: C.muted, ...align }}>
            {he ? 'רכיב "מחקר על סמך חוות דעת המנחה" (40%) — נקבע על ידך בלבד ואינו גלוי לבוחנים.' : "The 'research, based on the supervisor's opinion' component (40%) — set by you only, not shown to the examiners."}
          </Text>
        </View>
      )}
      {has('view_forms') && (
        <View style={{ marginTop: 8, flexDirection: 'row' }}>
          <PrimaryButton onPress={() => onOpenForm()} label={he ? 'צפייה בטופסי הבוחנים' : "View the examiners' forms"} />
        </View>
      )}

      {exam.gradeBreakdown && <GradeBreakdownTable breakdown={exam.gradeBreakdown} lang={lang} />}
      {exam.gradeReview && exam.status !== 'exam_grade_review' && (
        <Text style={{ marginTop: 8, padding: 8, borderRadius: 8, fontSize: 12, backgroundColor: exam.gradeReview.decision === 'approve' ? C.successBg : C.dangerBg, color: exam.gradeReview.decision === 'approve' ? C.success : C.danger, ...align }}>
          {exam.gradeReview.decision === 'approve'
            ? (he ? `✓ אושר ע״י ראש בית הספר ללימודים מתקדמים (${exam.gradeReview.byName}, ${formatExamDeadline(exam.gradeReview.at, lang)})` : `✓ Approved by the grad school head (${exam.gradeReview.byName}, ${formatExamDeadline(exam.gradeReview.at, lang)})`)
            : (he ? `✗ נדחה ע״י ראש בית הספר ללימודים מתקדמים (${exam.gradeReview.byName}): ${exam.gradeReview.reason}` : `✗ Denied by the grad school head (${exam.gradeReview.byName}): ${exam.gradeReview.reason}`)}
        </Text>
      )}
      {exam.status === 'exam_grade_denied' && (
        <Text style={{ marginTop: 6, fontSize: 12, color: C.muted, ...align }}>{he ? 'ההמשך לאחר דחייה ייקבע בהמשך לפי הנחיות הפקולטה.' : "What follows a denial will be set by the faculty's rules."}</Text>
      )}
      {exam.status === 'exam_returned_to_supervisor' && (
        <Text style={{ marginTop: 6, fontSize: 12, color: C.muted, ...align }}>{he ? `הציון נמוך מ-${exam.rules.minPassingFinalGrade ?? ''} — התזה חוזרת למנחה להמשך עבודה עם הסטודנט/ית.` : `The grade is below ${exam.rules.minPassingFinalGrade ?? ''} — the thesis returns to the supervisor for more work with the student.`}</Text>
      )}
      {has('review_final_grade') && <GradeReviewPanel exam={exam} lang={lang} onDone={onChanged} />}
      {exam.status === 'exam_coordinator_approval' && !has('final_approval') && (
        <Text style={{ marginTop: 8, fontSize: 13, color: C.muted, ...align }}>{he ? 'ממתין לאישור הסופי של הרכזת האדמיניסטרטיבית לפני העברת הציון למכלול.' : "Awaiting the administrative coordinator's final approval before the grade goes to Michlol."}</Text>
      )}
      {has('final_approval') && <FinalApprovalPanel exam={exam} lang={lang} onDone={onChanged} />}
      {exam.status === 'exam_completed' && (
        <View style={{ marginTop: 8, padding: 8, borderRadius: 8, backgroundColor: C.successBg }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: C.success, ...align }}>
            🎓 {he ? 'התזה הושלמה — הציון הסופי אושר סופית' : 'Thesis completed — the final grade received final approval'}
            {exam.myFinalGrade != null ? ` · ${he ? 'הציון הסופי שלך' : 'Your final grade'}: ${exam.myFinalGrade}` : ''}
          </Text>
          {exam.finalApproval && (
            <Text style={{ fontSize: 11, color: C.success, marginTop: 2, ...align }}>{exam.finalApproval.byName} · {formatExamDeadline(exam.finalApproval.at, lang)}{exam.finalApproval.note ? ` · ${exam.finalApproval.note}` : ''}</Text>
          )}
        </View>
      )}
    </View>
  );
}

/** How the final grade is made — mirrors web's GradeBreakdownTable
 *  (app/thesis-exam/page.tsx), one row per milestone. */
function GradeBreakdownTable({ breakdown, lang }: { breakdown: ThesisExamGradeBreakdown; lang: Lang }) {
  const he = lang === 'he';
  const align = { textAlign: (he ? 'right' : 'left') as 'right' | 'left' };
  const row = { flexDirection: (he ? 'row-reverse' : 'row') as 'row-reverse' | 'row', alignItems: 'flex-start' as const, gap: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: C.line };
  const cell = (v: number | null | undefined) => (v == null ? '—' : String(v));
  const many = breakdown.students.length > 1;
  const grades = (g: Record<string, number | null>) => breakdown.students.map((s) => (many ? `${s.name}: ${cell(g[s.id])}` : cell(g[s.id]))).join(' · ');
  return (
    <View style={{ marginTop: 10, borderWidth: 1, borderColor: C.line, borderRadius: 10, padding: 10, backgroundColor: C.paper }}>
      <Text style={{ fontSize: 14, fontWeight: '700', color: C.ink, ...align }}>🧮 {he ? 'חישוב הציון הסופי' : 'How the final grade is computed'}</Text>
      <Text style={{ fontSize: 12, color: C.muted, marginTop: 2, ...align }}>{he ? 'ציון כל אבן דרך × המשקל שלה בתבנית התהליך המאושרת.' : "Each milestone's grade × its weight in the approved workflow template."}</Text>
      {breakdown.rows.map((r) => (
        <View key={r.type} style={row}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: r.percent === 0 ? C.muted : C.ink, ...align }}>{he ? r.nameHe : r.nameEn} · {r.percent}%</Text>
            {r.isExam && (
              <Text style={{ fontSize: 11, color: C.muted, marginTop: 2, ...align }}>
                {he ? 'מחקר (מנחה) 40%' : 'Research (supervisor) 40%'}: {cell(breakdown.exam.research)} · {he ? 'כתיבה 40%' : 'Writing 40%'}: {cell(breakdown.exam.writing)} · {he ? 'הגנה 20%' : 'Defense 20%'}: {cell(breakdown.exam.defense)}
              </Text>
            )}
          </View>
          <Text style={{ fontSize: 13, fontWeight: '700', color: r.percent === 0 ? C.muted : C.ink }}>{grades(r.grades)}</Text>
        </View>
      ))}
      <View style={[row, { borderBottomWidth: 0 }]}>
        <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: C.ink, ...align }}>{he ? 'ציון סופי' : 'Final grade'}</Text>
        <Text style={{ fontSize: 15, fontWeight: '800', color: C.primary }}>{grades(breakdown.finalGradeByStudent)}</Text>
      </View>
      {breakdown.missing.length > 0 && (
        <Text style={{ marginTop: 4, fontSize: 12, color: C.danger, ...align }}>{he ? 'חסר עדיין' : 'Still missing'}: {breakdown.missing.map((m) => m[lang]).join(' · ')}</Text>
      )}
    </View>
  );
}

/** What approving leads to — mirrors web's PassingHint. */
function PassingHint({ exam, lang }: { exam: ThesisExamCard; lang: Lang }) {
  const he = lang === 'he';
  const min = exam.rules.minPassingFinalGrade;
  const grades = Object.values(exam.gradeBreakdown?.finalGradeByStudent ?? {}).filter((g): g is number => g != null);
  if (min == null || grades.length === 0) return null;
  const low = grades.some((g) => g < min);
  return (
    <Text style={{ marginTop: 6, padding: 8, borderRadius: 8, fontSize: 12, backgroundColor: low ? C.dangerBg : C.successBg, color: low ? C.danger : C.success, textAlign: he ? 'right' : 'left' }}>
      {low
        ? (he ? `הציון נמוך מ-${min}. באישור — התזה תחזור למנחה להמשך עבודה עם הסטודנט/ית.` : `The grade is below ${min}. Approving returns the thesis to the supervisor for more work with the student.`)
        : (he ? `הציון ${min} ומעלה. באישור — יעבור לאישור הסופי של הרכזת האדמיניסטרטיבית.` : `The grade is ${min} or above. Approving sends it to the administrative coordinator's final approval.`)}
    </Text>
  );
}

function GradeReviewPanel({ exam, lang, onDone }: { exam: ThesisExamCard; lang: Lang; onDone: () => Promise<void> }) {
  const he = lang === 'he';
  const align = { textAlign: (he ? 'right' : 'left') as 'right' | 'left' };
  return (
    <ReasonedDecision
      lang={lang}
      approveLabel={he ? '✓ אישור הציון' : '✓ Approve the grade'}
      onDecide={async (decision, reason) => {
        const confirmed = await new Promise<boolean>((resolve) => {
          Alert.alert(
            decision === 'approve' ? (he ? 'אישור הציון הסופי' : 'Approve the final grade') : (he ? 'דחיית הציון הסופי' : 'Deny the final grade'),
            decision === 'approve' ? (he ? 'הציון יעבור לאישור הסופי של הרכזת האדמיניסטרטיבית.' : "It goes on to the administrative coordinator's final approval.") : (he ? 'לדחות את הציון הסופי?' : 'Deny the final grade?'),
            [
              { text: he ? 'ביטול' : 'Cancel', style: 'cancel', onPress: () => resolve(false) },
              { text: he ? 'אישור' : 'Confirm', style: decision === 'approve' ? 'default' : 'destructive', onPress: () => resolve(true) },
            ],
            { cancelable: true, onDismiss: () => resolve(false) },
          );
        });
        if (!confirmed) return;
        await apiClient.reviewThesisExamFinalGrade(exam.milestoneId, decision === 'approve' ? 'approve' : 'deny', reason);
        await onDone();
      }}
    >
      <Text style={{ fontSize: 13, fontWeight: '700', color: C.ink, ...align }}>{he ? 'אישור הציון הסופי' : 'Approve the final grade'}</Text>
      <PassingHint exam={exam} lang={lang} />
    </ReasonedDecision>
  );
}

function FinalApprovalPanel({ exam, lang, onDone }: { exam: ThesisExamCard; lang: Lang; onDone: () => Promise<void> }) {
  const he = lang === 'he';
  const align = { textAlign: (he ? 'right' : 'left') as 'right' | 'left' };
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const send = async () => {
    setBusy(true);
    setError('');
    try {
      await apiClient.approveThesisExamFinalGrade(exam.milestoneId, note.trim());
      await onDone();
    } catch (err) {
      setError(errText(err, he ? 'הפעולה נכשלה' : 'Action failed'));
    } finally {
      setBusy(false);
    }
  };
  const approve = () => Alert.alert(
    he ? 'אישור סופי' : 'Final approval',
    he ? 'הסטודנט/ית יסיים/תסיים את התזה והציון יועבר למכלול.' : 'The student completes the thesis and the grade goes to Michlol.',
    [
      { text: he ? 'ביטול' : 'Cancel', style: 'cancel' },
      { text: he ? 'אישור' : 'Confirm', onPress: () => { void send(); } },
    ],
  );
  return (
    <View style={{ marginTop: 10, borderWidth: 1, borderColor: C.line, borderRadius: 10, padding: 10, backgroundColor: C.paper }}>
      <Text style={{ fontSize: 13, fontWeight: '700', color: C.ink, ...align }}>{he ? 'אישור סופי לפני העברה למכלול' : 'Final approval before Michlol'}</Text>
      <Text style={{ fontSize: 12, color: C.muted, marginTop: 2, ...align }}>{he ? 'ראש בית הספר ללימודים מתקדמים אישר את הציון. האישור שלך מסיים את התזה ומעביר את הציון למכלול (החיבור למכלול עדיין לא פעיל).' : 'The grad school head approved the grade. Your approval completes the thesis and sends the grade to Michlol (the Michlol connection is not live yet).'}</Text>
      <TextInput
        accessibilityLabel={he ? 'הערה (לא חובה)' : 'Note (optional)'}
        placeholder={he ? 'הערה (לא חובה)' : 'Note (optional)'}
        value={note}
        onChangeText={setNote}
        multiline
        style={{ marginTop: 8, borderWidth: 1, borderColor: C.line, borderRadius: 8, padding: 10, minHeight: 56, fontSize: 13, backgroundColor: '#fff', textAlignVertical: 'top', ...align }}
      />
      {!!error && <Text style={{ marginTop: 6, fontSize: 12, color: C.danger, ...align }} accessibilityRole="alert">{error}</Text>}
      <View style={{ flexDirection: 'row', marginTop: 8 }}>
        <PrimaryButton busy={busy} onPress={approve} label={he ? '✓ אישור סופי' : '✓ Final approval'} />
      </View>
    </View>
  );
}

type NomineeDraft = { type: 'internal'; uid: string } | { type: 'external'; name: string; email: string; institution: string };

/** The administrative coordinator, after the 48h deadline: who didn't pick,
 *  how to reach them, and a picker to enter what they give her by phone.
 *  Mirrors web's LateEntryPanel (app/thesis-exam/page.tsx). */
function LateEntryPanel({ exam, lang, onDone }: { exam: ThesisExamCard; lang: Lang; onDone: () => Promise<void> }) {
  const he = lang === 'he';
  const align = { textAlign: he ? 'right' : 'left' } as const;
  const [open, setOpen] = useState<number | null>(null);
  const ROLE: Record<string, { he: string; en: string }> = {
    student: { he: 'סטודנט/ית', en: 'Student' }, supervisor: { he: 'מנחה', en: 'Supervisor' },
    committee: { he: 'חבר/ת ועדה', en: 'Committee' }, examiner: { he: 'בוחן/ת', en: 'Examiner' },
  };
  return (
    <View style={{ marginTop: 10, borderWidth: 1, borderColor: C.accent, borderRadius: 10, padding: 10, backgroundColor: C.accentBg }}>
      <Text style={{ fontSize: 14, fontWeight: '700', color: C.ink, ...align }}>📞 {he ? 'משתתפים שלא בחרו תאריכים בזמן' : "Participants who didn't pick in time"}</Text>
      <Text style={{ fontSize: 12, color: C.muted, marginTop: 2, ...align }}>
        {he
          ? `יש ליצור קשר ולהזין את התאריכים שלהם עד ${formatExamDeadline(exam.lateEntryDeadline!, lang)}. לאחר מכן המערכת תקבע את המועד לפי מי שכן בחרו.`
          : `Contact them and enter their dates by ${formatExamDeadline(exam.lateEntryDeadline!, lang)}. After that the system sets the time from those who did pick.`}
      </Text>
      {exam.lateParticipants.map((p) => (
        <View key={p.index} style={{ marginTop: 8, backgroundColor: '#fff', borderRadius: 8, padding: 8 }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: C.ink, ...align }}>
            {p.name} <Text style={{ fontSize: 12, fontWeight: '400', color: C.muted }}>({p.roles.map((r) => ROLE[r]?.[lang] ?? r).join(', ')})</Text>
          </Text>
          {p.phone ? (
            <Pressable onPress={() => { void Linking.openURL(`tel:${p.phone}`); }} accessibilityRole="link">
              <Text style={{ fontSize: 13, color: C.primary, marginTop: 2, ...align }}>📞 {p.phone}</Text>
            </Pressable>
          ) : (
            <Text style={{ fontSize: 12, color: C.muted, marginTop: 2, ...align }}>{he ? 'אין טלפון במערכת' : 'No phone on file'}</Text>
          )}
          {!!p.email && (
            <Pressable onPress={() => { void Linking.openURL(`mailto:${p.email}`); }} accessibilityRole="link">
              <Text style={{ fontSize: 13, color: C.primary, marginTop: 2, ...align }}>✉️ {p.email}</Text>
            </Pressable>
          )}
          <Pressable
            onPress={() => setOpen(open === p.index ? null : p.index)}
            accessibilityRole="button"
            style={{ marginTop: 6, alignSelf: he ? 'flex-end' : 'flex-start', borderWidth: 1, borderColor: C.line, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 5 }}
          >
            <Text style={{ fontSize: 12, color: C.ink, fontWeight: '600' }}>{open === p.index ? (he ? 'סגירה' : 'Close') : (he ? 'הזנת תאריכים' : 'Enter dates')}</Text>
          </Pressable>
          {open === p.index && exam.window && (
            <AvailabilityPicker
              lang={lang}
              window={exam.window}
              count={exam.rules.datesPerParticipant}
              initial={null}
              allowFewer
              onSubmit={async (entries) => { await apiClient.enterThesisExamLateDates(exam.milestoneId, p.index, entries); setOpen(null); await onDone(); }}
            />
          )}
        </View>
      ))}
    </View>
  );
}

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
    // No Saturdays (Shabbat) — same rule as the participants' picker.
    return daysBetween(start, end.toISOString().slice(0, 10)).filter((d) => !isShabbat(d));
  }, []);
  // A common window was found: the date is fixed and the hours must sit
  // inside it — she only narrows it to the exam's actual hours.
  const win = exam.coordinatorTask === 'set_hours' ? exam.hoursWindow : null;
  const [date, setDate] = useState(win?.date ?? '');
  const [from, setFrom] = useState(win?.from ?? '10:00');
  const [to, setTo] = useState(win ? (shiftTime(win.from, 120) < win.to ? shiftTime(win.from, 120) : win.to) : '11:00');
  const [note, setNote] = useState('');
  const [showPicks, setShowPicks] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!date) { setError(he ? 'יש לבחור תאריך.' : 'Choose a date.'); return; }
    if (win && (from < win.from || to > win.to)) { setError(he ? `יש לבחור שעות בתוך המועד המשותף: ${win.from}–${win.to}.` : `Pick hours inside the common time: ${win.from}–${win.to}.`); return; }
    const fridayEnd = fridayLatestEnd(date);
    if (fridayEnd && (to > fridayEnd || from >= fridayEnd)) { setError(he ? `יום שישי — ניתן לבחור שעות עד ${fridayEnd} בלבד (כניסת שבת).` : `Friday — hours only until ${fridayEnd} (Shabbat begins).`); return; }
    if (to <= from) { setError(he ? 'שעת הסיום חייבת להיות אחרי שעת ההתחלה.' : 'The end time must be after the start time.'); return; }
    if (to < shiftTime(from, EXAM_MIN_MINUTES)) { setError(he ? `הבחינה צריכה להימשך ${EXAM_MIN_MINUTES} דקות לפחות.` : `The exam must be at least ${EXAM_MIN_MINUTES} minutes.`); return; }
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
      <Text style={{ fontSize: 14, fontWeight: '700', color: C.ink, ...align }}>
        {win
          ? (he ? `נמצא מועד משותף: ${formatExamSlot(win, lang)} — יש לקבוע את שעות הבחינה בתוך הטווח` : `Common time found: ${formatExamSlot(win, lang)} — set the exam hours inside it`)
          : (he ? 'לא נמצא מועד משותף — יש לקבוע תאריך ושעות' : 'No common time — set the date and hours')}
      </Text>
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
      <Text style={{ fontSize: 12, color: C.muted, marginTop: 10, ...align }}>{he ? 'תאריך' : 'Date'}{win ? `: ${formatExamDay(win.date, lang, { weekday: 'long', day: 'numeric', month: 'long' })}` : ''}</Text>
      {!win && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 6, flexDirection: isRtl ? 'row-reverse' : 'row' }}>
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
      </ScrollView>}
      <View style={{ flexDirection: isRtl ? 'row-reverse' : 'row', flexWrap: 'wrap', gap: 12, marginTop: 6 }}>
        <Stepper lang={lang} min={win ? win.from : EXAM_DAY_START} max={win ? win.to : latestEndFor(date)} label={he ? 'משעה' : 'From'} value={from} onChange={setFrom} />
        <Stepper lang={lang} min={win ? win.from : EXAM_DAY_START} max={win ? win.to : latestEndFor(date)} label={he ? 'עד' : 'To'} value={to} onChange={setTo} />
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
        <PrimaryButton busy={busy} onPress={submit} label={win ? (he ? 'קביעת השעות ושליחה לאישור' : 'Set the hours and send for approval') : he ? 'קביעת המועד ושליחה לאישור' : 'Set the time and send for approval'} />
      </View>
    </View>
  );
}
