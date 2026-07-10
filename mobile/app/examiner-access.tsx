// app/examiner-access.tsx
// Public screen — no Firebase Auth required.
// External examiners arrive via a deep-link:
//   myapp://examiner-access?token=<uuid>
//   https://myapp.example.com/examiner-access?token=<uuid>
//
// Flow:
//   1. Load → validate token from Firestore
//   2. If pending   → show Accept / Decline
//   3. If accepted  → show thesis download + opinion form
//   4. If submitted → show confirmation (read-only)
//   5. If declined / expired / invalid → show appropriate message

import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable, TextInput,
  ActivityIndicator, Alert, Linking, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { Timestamp } from 'firebase/firestore';

import {
  getExaminerToken,
  recordTokenOpened,
  recordThesisDownload,
  acceptExaminerToken,
  declineExaminerToken,
  submitExaminerOpinion,
  effectiveStatus,
  daysUntilExpiry,
  type ExaminerTokenDoc,
} from '@/src/firebase/examinerTokens';
import { apiClient } from '@/src/api/apiClient';
import type { Lang } from '@/components/i18n';
import { t } from '@/components/i18n';

// ─── Defense date submission — a SEPARATE concern from the review/opinion
// flow above (see server/src/services/defenseScheduling.ts). Routed through
// the public examiner-access API (not direct Firestore writes) since it
// requires reconciling both examiners' submissions atomically.
type DefenseDateStatus = 'not_open' | 'awaiting_your_dates' | 'awaiting_other_examiner' | 'matched' | 'conflict';

// ─── Opinion form fields ───────────────────────────────────────────────────────
// Adjust these to match your institution's review criteria.
const OPINION_CRITERIA = [
  { key: 'originality',   he: 'מקוריות ותרומה מדעית',  en: 'Originality & Scientific Contribution', max: 30 },
  { key: 'methodology',   he: 'מתודולוגיה ושיטות',      en: 'Methodology & Methods',                 max: 25 },
  { key: 'presentation',  he: 'כתיבה והצגה',             en: 'Writing & Presentation',                max: 25 },
  { key: 'knowledge',     he: 'שליטה בתחום',             en: 'Domain Knowledge',                      max: 20 },
] as const;

type CriterionKey = typeof OPINION_CRITERIA[number]['key'];

// ─────────────────────────────────────────────────────────────────────────────
export default function ExaminerAccessScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();

  const [lang, setLang]         = useState<Lang>('he');
  const isRtl                    = lang === 'he';
  const L                        = (he: string, en: string) => lang === 'he' ? he : en;

  // Token & loading state
  const [phase, setPhase]        = useState<
    'loading' | 'invalid' | 'expired' | 'pending' |
    'accepted' | 'submitted' | 'declined' | 'error'
  >('loading');
  const [tokenDoc, setTokenDoc]  = useState<ExaminerTokenDoc | null>(null);

  // Accept/Decline flow
  const [declining, setDeclining]          = useState(false);
  const [declineReason, setDeclineReason]  = useState('');
  const [showDeclineForm, setShowDeclineForm] = useState(false);
  const [actionBusy, setActionBusy]        = useState(false);

  // Opinion form
  const [scores, setScores]      = useState<Record<CriterionKey, string>>({
    originality: '', methodology: '', presentation: '', knowledge: '',
  });
  const [overallComments, setOverallComments] = useState('');
  const [recommendation, setRecommendation]   = useState<
    'approve' | 'approve_with_corrections' | 'major_revisions' | 'reject' | ''
  >('');
  const [submittingOpinion, setSubmittingOpinion] = useState(false);

  // Defense date submission
  const [dateStatus, setDateStatus] = useState<DefenseDateStatus>('not_open');
  const [dateWindow, setDateWindow] = useState<{ start: string; end: string } | null>(null);
  const [matchedDate, setMatchedDate] = useState<string | null>(null);
  const [dateDraft, setDateDraft] = useState('');
  const [submittingDates, setSubmittingDates] = useState(false);

  const loadDefenseDateStatus = useCallback(async () => {
    if (!token) return;
    try {
      const res = await apiClient.get(`/api/examiner-access/${token}/defense-dates`);
      setDateStatus(res.data.status);
      if (res.data.windowStart && res.data.windowEnd) {
        setDateWindow({ start: res.data.windowStart, end: res.data.windowEnd });
      }
      if (res.data.matchedDate) setMatchedDate(res.data.matchedDate);
    } catch (e) {
      console.error('examiner-access: defense-date status load error', e);
    }
  }, [token]);

  const handleSubmitDefenseDates = async () => {
    if (!token) return;
    const raw = dateDraft.split(',').map((s) => s.trim()).filter(Boolean);
    if (raw.length === 0 || raw.some((d) => !/^\d{4}-\d{2}-\d{2}$/.test(d))) {
      Alert.alert(L('שגיאה', 'Error'), L('יש להזין תאריכים בפורמט YYYY-MM-DD', 'Enter dates as YYYY-MM-DD'));
      return;
    }
    setSubmittingDates(true);
    try {
      const res = await apiClient.post(`/api/examiner-access/${token}/defense-dates`, { candidateDates: raw });
      if (res.data.matched) {
        setDateStatus('matched');
        setMatchedDate(res.data.matchedDate);
      } else if (res.data.conflict) {
        setDateStatus('conflict');
      } else {
        setDateStatus('awaiting_other_examiner');
      }
    } catch (e: any) {
      Alert.alert(L('שגיאה', 'Error'), e.response?.data?.message || String(e));
    } finally {
      setSubmittingDates(false);
    }
  };

  // ── Load token ─────────────────────────────────────────────────────────────
  const loadToken = useCallback(async () => {
    if (!token) { setPhase('invalid'); return; }

    try {
      const doc = await getExaminerToken(token);
      if (!doc) { setPhase('invalid'); return; }

      setTokenDoc(doc);
      const status = effectiveStatus(doc);

      if (status === 'expired')   { setPhase('expired');   return; }
      if (status === 'declined')  { setPhase('declined');  return; }
      if (status === 'submitted') { setPhase('submitted'); return; }
      if (status === 'accepted')  { setPhase('accepted'); loadDefenseDateStatus(); return; }
      // default: 'pending'
      setPhase('pending');

      // Record the open action (fire-and-forget — don't block the UI)
      recordTokenOpened(token).catch(() => {});
    } catch (e) {
      console.error('examiner-access: load error', e);
      setPhase('error');
    }
  }, [token]);

  useEffect(() => { loadToken(); }, [loadToken]);

  // ── Accept ─────────────────────────────────────────────────────────────────
  const handleAccept = async () => {
    if (!token) return;
    setActionBusy(true);
    try {
      await acceptExaminerToken(token);
      setPhase('accepted');
      loadDefenseDateStatus();
    } catch (e) {
      Alert.alert(L('שגיאה', 'Error'), String(e));
    } finally {
      setActionBusy(false);
    }
  };

  // ── Decline ────────────────────────────────────────────────────────────────
  const handleDecline = async () => {
    if (!token) return;
    if (!declineReason.trim()) {
      Alert.alert(
        L('שדה חובה', 'Required'),
        L('יש להזין סיבת דחייה', 'Please enter a reason for declining'),
      );
      return;
    }
    setActionBusy(true);
    try {
      await declineExaminerToken(token, declineReason.trim());
      setPhase('declined');
    } catch (e) {
      Alert.alert(L('שגיאה', 'Error'), String(e));
    } finally {
      setActionBusy(false);
      setShowDeclineForm(false);
    }
  };

  // ── Download thesis ────────────────────────────────────────────────────────
  const handleDownloadThesis = async () => {
    if (!tokenDoc?.thesisUrl || !token) return;
    try {
      await recordThesisDownload(token);
      Linking.openURL(tokenDoc.thesisUrl);
    } catch (e) {
      Alert.alert(L('שגיאה', 'Error'), L('לא ניתן לפתוח את הקובץ', 'Could not open the file'));
    }
  };

  // ── Submit opinion ─────────────────────────────────────────────────────────
  const handleSubmitOpinion = async () => {
    if (!token) return;

    // Validate scores
    for (const c of OPINION_CRITERIA) {
      const v = parseFloat(scores[c.key] || '');
      if (isNaN(v) || v < 0 || v > c.max) {
        Alert.alert(
          L('שגיאה בציון', 'Score error'),
          L(
            `הציון עבור "${c.he}" חייב להיות בין 0 ל-${c.max}`,
            `Score for "${c.en}" must be between 0 and ${c.max}`,
          ),
        );
        return;
      }
    }
    if (!recommendation) {
      Alert.alert(
        L('חסרה המלצה', 'Missing recommendation'),
        L('יש לבחור המלצה', 'Please select a recommendation'),
      );
      return;
    }
    if (!overallComments.trim()) {
      Alert.alert(
        L('חסרות הערות', 'Comments required'),
        L('יש להוסיף הערות כלליות', 'Please add overall comments'),
      );
      return;
    }

    const total = OPINION_CRITERIA.reduce((s, c) => s + parseFloat(scores[c.key] || '0'), 0);

    setSubmittingOpinion(true);
    try {
      await submitExaminerOpinion(token, {
        criteria: Object.fromEntries(
          OPINION_CRITERIA.map(c => [c.key, parseFloat(scores[c.key])])
        ),
        totalScore:     total,
        overallComments: overallComments.trim(),
        recommendation,
        submittedBy:    tokenDoc?.examinerName ?? '',
        submittedAt:    new Date().toISOString(),
      });
      setPhase('submitted');
    } catch (e) {
      Alert.alert(L('שגיאה', 'Error'), String(e));
    } finally {
      setSubmittingOpinion(false);
    }
  };

  const totalScore = OPINION_CRITERIA.reduce(
    (s, c) => s + (parseFloat(scores[c.key] || '0') || 0), 0
  );

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER PHASES
  // ─────────────────────────────────────────────────────────────────────────

  // ── Loading ────────────────────────────────────────────────────────────────
  if (phase === 'loading') {
    return (
      <View style={s.centered}>
        <ActivityIndicator size="large" color="#2E86FF" />
        <Text style={s.loadingText}>{t.examinerLinkLoading[lang]}</Text>
      </View>
    );
  }

  // ── Invalid / Error ────────────────────────────────────────────────────────
  if (phase === 'invalid' || phase === 'error') {
    return (
      <SafeAreaView style={s.root}>
        <LangToggle lang={lang} onToggle={() => setLang(l => l === 'he' ? 'en' : 'he')} />
        <View style={s.centered}>
          <Text style={s.errorEmoji}>🔗</Text>
          <Text style={s.errorTitle}>{t.examinerLinkExpired[lang]}</Text>
          <Text style={s.errorSub}>
            {L(
              'הקישור שקיבלת אינו תקין. פנה לרכז הפקולטה לקבלת קישור חדש.',
              'The link you received is invalid. Please contact the faculty coordinator for a new link.',
            )}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Expired ────────────────────────────────────────────────────────────────
  if (phase === 'expired') {
    return (
      <SafeAreaView style={s.root}>
        <LangToggle lang={lang} onToggle={() => setLang(l => l === 'he' ? 'en' : 'he')} />
        <View style={s.centered}>
          <Text style={s.errorEmoji}>⏰</Text>
          <Text style={s.errorTitle}>{L('הקישור פג תוקף', 'Link Expired')}</Text>
          <Text style={s.errorSub}>
            {L(
              'מועד השיפוט חלף. פנה לרכז הפקולטה לקבלת הארכה.',
              'The review deadline has passed. Please contact the faculty coordinator for an extension.',
            )}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Declined ───────────────────────────────────────────────────────────────
  if (phase === 'declined') {
    return (
      <SafeAreaView style={s.root}>
        <LangToggle lang={lang} onToggle={() => setLang(l => l === 'he' ? 'en' : 'he')} />
        <View style={s.centered}>
          <Text style={s.errorEmoji}>✋</Text>
          <Text style={s.errorTitle}>{t.examinerDeclined[lang]}</Text>
          <Text style={s.errorSub}>
            {L(
              'דחית את בקשת השיפוט. הרכז יפנה אליך אם יש שאלות.',
              'You have declined this review assignment. The coordinator will reach out if needed.',
            )}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Submitted ──────────────────────────────────────────────────────────────
  if (phase === 'submitted') {
    return (
      <SafeAreaView style={s.root}>
        <LangToggle lang={lang} onToggle={() => setLang(l => l === 'he' ? 'en' : 'he')} />
        <View style={s.centered}>
          <Text style={s.successEmoji}>✅</Text>
          <Text style={s.successTitle}>{t.examinerOpinionSent[lang]}</Text>
          <Text style={s.errorSub}>
            {L(
              'חוות הדעת שלך התקבלה. תודה על שיתוף הפעולה.',
              'Your opinion has been received. Thank you for your cooperation.',
            )}
          </Text>
          {tokenDoc?.submittedAt && (
            <Text style={s.metaChip}>
              {L('הוגש בתאריך:', 'Submitted at:')} {' '}
              {(tokenDoc.submittedAt as Timestamp).toDate().toLocaleString(
                lang === 'he' ? 'he-IL' : 'en-GB'
              )}
            </Text>
          )}
        </View>
      </SafeAreaView>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // COMMON HEADER (used in pending + accepted phases)
  // ─────────────────────────────────────────────────────────────────────────
  const Header = () => (
    <View style={[s.header, isRtl && s.headerRtl]}>
      <LangToggle lang={lang} onToggle={() => setLang(l => l === 'he' ? 'en' : 'he')} />
      <Text style={s.headerTitle}>{t.examinerLinkTitle[lang]}</Text>
      <Text style={s.headerSub}>{t.examinerLinkSubtitle[lang]}</Text>

      <View style={s.infoCard}>
        <InfoRow label={L('שם הבוחן', 'Examiner')}      value={tokenDoc?.examinerName ?? ''} />
        <InfoRow label={L('כותרת העבודה', 'Thesis')}    value={tokenDoc?.thesisTitle ?? ''} />
        <InfoRow label={L('שם הסטודנט', 'Student')}     value={tokenDoc?.studentName ?? ''} />
        {tokenDoc?.expiresAt && (
          <InfoRow
            label={t.examinerDeadline[lang]}
            value={`${(tokenDoc.expiresAt as Timestamp).toDate().toLocaleDateString(
              lang === 'he' ? 'he-IL' : 'en-GB'
            )} · ${daysUntilExpiry(tokenDoc)} ${t.examinerDaysLeft[lang]}`}
            accent
          />
        )}
      </View>

      <Text style={s.accessNote}>🔒 {t.examinerAccessLog[lang]}</Text>
    </View>
  );

  // ── PENDING ────────────────────────────────────────────────────────────────
  if (phase === 'pending') {
    return (
      <SafeAreaView style={s.root}>
        <ScrollView contentContainerStyle={s.scroll}>
          <Header />

          {!showDeclineForm ? (
            <View style={s.actionBlock}>
              <Pressable
                style={[s.btnPrimary, actionBusy && s.btnDisabled]}
                onPress={handleAccept}
                disabled={actionBusy}
              >
                {actionBusy
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={s.btnPrimaryText}>✅ {t.examinerAccept[lang]}</Text>
                }
              </Pressable>

              <Pressable
                style={[s.btnOutline, actionBusy && s.btnDisabled]}
                onPress={() => setShowDeclineForm(true)}
                disabled={actionBusy}
              >
                <Text style={s.btnOutlineText}>✋ {t.examinerDecline[lang]}</Text>
              </Pressable>
            </View>
          ) : (
            <View style={s.declineBlock}>
              <Text style={s.fieldLabel}>{t.examinerDeclineReason[lang]}</Text>
              <TextInput
                style={[s.textarea, isRtl && s.textRtl]}
                value={declineReason}
                onChangeText={setDeclineReason}
                multiline
                numberOfLines={4}
                placeholder={L('הסבר מדוע אינך יכול לשפט עבודה זו...', 'Explain why you cannot review this thesis...')}
                placeholderTextColor="#9CA3AF"
                textAlign={isRtl ? 'right' : 'left'}
              />
              <Pressable
                style={[s.btnDanger, actionBusy && s.btnDisabled]}
                onPress={handleDecline}
                disabled={actionBusy}
              >
                {actionBusy
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={s.btnPrimaryText}>{t.examinerDecline[lang]}</Text>
                }
              </Pressable>
              <Pressable style={s.btnGhost} onPress={() => setShowDeclineForm(false)}>
                <Text style={s.btnGhostText}>{t.cancel[lang]}</Text>
              </Pressable>
            </View>
          )}

          <BottomPadding />
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── ACCEPTED — show thesis + opinion form ──────────────────────────────────
  return (
    <SafeAreaView style={s.root}>
      <ScrollView contentContainerStyle={s.scroll}>
        <Header />

        {/* Accepted badge */}
        <View style={s.acceptedBanner}>
          <Text style={s.acceptedBannerText}>✅ {t.examinerAccepted[lang]}</Text>
        </View>

        {/* Download thesis */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>{t.examinerViewThesis[lang]}</Text>
          <Pressable style={s.downloadBtn} onPress={handleDownloadThesis}>
            <Text style={s.downloadBtnText}>📄 {t.examinerDownloadThesis[lang]}</Text>
          </Pressable>
        </View>

        {/* Defense date submission — separate from the thesis review above */}
        {dateStatus !== 'not_open' && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>
              📅 {L('בחירת תאריך הגנה', 'Defense date selection')}
            </Text>

            {dateStatus === 'awaiting_your_dates' && (
              <>
                {dateWindow && (
                  <Text style={[s.errorSub, { marginBottom: 10 }]}>
                    {L('בטווח', 'Within')} {dateWindow.start} – {dateWindow.end} · {L('ראשון–חמישי בלבד', 'Sun-Thu only')}
                  </Text>
                )}
                <TextInput
                  style={s.scoreInput}
                  value={dateDraft}
                  onChangeText={setDateDraft}
                  placeholder="YYYY-MM-DD, YYYY-MM-DD"
                  placeholderTextColor="#9CA3AF"
                />
                <Pressable
                  style={[s.btnPrimary, { marginTop: 10 }, submittingDates && s.btnDisabled]}
                  onPress={handleSubmitDefenseDates}
                  disabled={submittingDates}
                >
                  {submittingDates
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={s.btnPrimaryText}>{L('שלח תאריכים', 'Submit dates')}</Text>
                  }
                </Pressable>
              </>
            )}
            {dateStatus === 'awaiting_other_examiner' && (
              <Text style={s.errorSub}>{L('התאריכים נשלחו — ממתין לבוחן/ת השני/ה', 'Dates submitted — waiting on the other examiner')}</Text>
            )}
            {dateStatus === 'matched' && (
              <Text style={[s.errorSub, { color: '#10B981', fontWeight: '700' }]}>
                ✅ {L('נמצא תאריך משותף:', 'Common date found:')} {matchedDate}
              </Text>
            )}
            {dateStatus === 'conflict' && (
              <Text style={[s.errorSub, { color: '#EF4444', fontWeight: '700' }]}>
                ⚠️ {L('לא נמצא תאריך משותף — הרכז/ת פותר/ת', 'No common date found — coordinator resolving')}
              </Text>
            )}
          </View>
        )}

        {/* Opinion form */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>{t.examinerSubmitOpinion[lang]}</Text>

          {/* Criteria */}
          {OPINION_CRITERIA.map(c => (
            <View key={c.key} style={s.criterionRow}>
              <View style={s.criterionHeader}>
                <Text style={s.criterionLabel}>{lang === 'he' ? c.he : c.en}</Text>
                <Text style={s.criterionMax}>/ {c.max}</Text>
              </View>
              <TextInput
                style={s.scoreInput}
                value={scores[c.key]}
                onChangeText={v => setScores(prev => ({ ...prev, [c.key]: v }))}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor="#9CA3AF"
              />
            </View>
          ))}

          {/* Total */}
          <View style={s.totalRow}>
            <Text style={s.totalLabel}>{L('סה"כ', 'Total')}</Text>
            <Text style={[s.totalScore, { color: totalScore >= 60 ? '#10B981' : '#EF4444' }]}>
              {totalScore} / 100
            </Text>
          </View>

          {/* Recommendation */}
          <Text style={s.fieldLabel}>{L('המלצה', 'Recommendation')}</Text>
          {(
            [
              { value: 'approve',                   he: 'מאשר ללא תיקונים',         en: 'Approve without revisions' },
              { value: 'approve_with_corrections',  he: 'מאשר עם תיקונים קלים',    en: 'Approve with minor corrections' },
              { value: 'major_revisions',           he: 'נדרשים תיקונים מהותיים',  en: 'Major revisions required' },
              { value: 'reject',                    he: 'דחייה',                    en: 'Reject' },
            ] as const
          ).map(opt => (
            <Pressable
              key={opt.value}
              style={[s.radioRow, recommendation === opt.value && s.radioRowSelected]}
              onPress={() => setRecommendation(opt.value)}
            >
              <View style={[s.radioCircle, recommendation === opt.value && s.radioCircleSelected]} />
              <Text style={[s.radioLabel, recommendation === opt.value && s.radioLabelSelected]}>
                {lang === 'he' ? opt.he : opt.en}
              </Text>
            </Pressable>
          ))}

          {/* Overall comments */}
          <Text style={[s.fieldLabel, { marginTop: 16 }]}>{t.gradeComments[lang]}</Text>
          <TextInput
            style={[s.textarea, isRtl && s.textRtl]}
            value={overallComments}
            onChangeText={setOverallComments}
            multiline
            numberOfLines={6}
            placeholder={L('הערות כלליות לעבודה ולסטודנט...', 'General comments on the thesis and student...')}
            placeholderTextColor="#9CA3AF"
            textAlign={isRtl ? 'right' : 'left'}
          />

          {/* Submit */}
          <Pressable
            style={[s.btnPrimary, submittingOpinion && s.btnDisabled]}
            onPress={handleSubmitOpinion}
            disabled={submittingOpinion}
          >
            {submittingOpinion
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.btnPrimaryText}>{t.examinerSubmitOpinion[lang]}</Text>
            }
          </Pressable>
        </View>

        <BottomPadding />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Small sub-components ─────────────────────────────────────────────────────

function LangToggle({ lang, onToggle }: { lang: Lang; onToggle: () => void }) {
  return (
    <Pressable style={s.langToggle} onPress={onToggle}>
      <Text style={s.langToggleText}>{lang === 'he' ? 'EN' : 'עב'}</Text>
    </Pressable>
  );
}

function InfoRow({
  label, value, accent = false,
}: { label: string; value: string; accent?: boolean }) {
  return (
    <View style={s.infoRow}>
      <Text style={s.infoLabel}>{label}</Text>
      <Text style={[s.infoValue, accent && s.infoValueAccent]}>{value}</Text>
    </View>
  );
}

function BottomPadding() {
  return <View style={{ height: 60 }} />;
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root:        { flex: 1, backgroundColor: '#F0F4FF' },
  scroll:      { padding: 20 },
  centered:    { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },

  // Loading
  loadingText: { marginTop: 12, color: '#2E86FF', fontSize: 15 },

  // Error / status states
  errorEmoji:   { fontSize: 56, marginBottom: 16 },
  successEmoji: { fontSize: 56, marginBottom: 16 },
  errorTitle:   { fontSize: 20, fontWeight: '700', color: '#1E293B', textAlign: 'center', marginBottom: 8 },
  successTitle: { fontSize: 20, fontWeight: '700', color: '#10B981', textAlign: 'center', marginBottom: 8 },
  errorSub:     { fontSize: 14, color: '#64748B', textAlign: 'center', lineHeight: 22 },
  metaChip:     { marginTop: 16, fontSize: 13, color: '#64748B' },

  // Header
  header:        { marginBottom: 24 },
  headerRtl:     { alignItems: 'flex-end' },
  headerTitle:   { fontSize: 22, fontWeight: '800', color: '#1E293B', marginBottom: 4, marginTop: 48 },
  headerSub:     { fontSize: 14, color: '#64748B', marginBottom: 16 },

  // Info card
  infoCard:      { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12,
                   shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  infoRow:       { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6,
                   borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  infoLabel:     { fontSize: 13, color: '#64748B', flex: 1 },
  infoValue:     { fontSize: 13, color: '#1E293B', fontWeight: '600', flex: 2, textAlign: 'right' },
  infoValueAccent: { color: '#2E86FF' },
  accessNote:    { fontSize: 12, color: '#94A3B8', textAlign: 'center', marginTop: 4 },

  // Accepted banner
  acceptedBanner:     { backgroundColor: '#D1FAE5', borderRadius: 10, padding: 12,
                        alignItems: 'center', marginBottom: 20 },
  acceptedBannerText: { color: '#065F46', fontWeight: '700', fontSize: 15 },

  // Section
  section:       { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 16,
                   shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  sectionTitle:  { fontSize: 16, fontWeight: '700', color: '#1E293B', marginBottom: 12 },

  // Download
  downloadBtn:     { backgroundColor: '#2E86FF', borderRadius: 10, padding: 14, alignItems: 'center' },
  downloadBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  // Criterion rows
  criterionRow:    { marginBottom: 12 },
  criterionHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  criterionLabel:  { fontSize: 14, color: '#1E293B', fontWeight: '600' },
  criterionMax:    { fontSize: 13, color: '#64748B' },
  scoreInput:      { borderWidth: 1.5, borderColor: '#CBD5E1', borderRadius: 8,
                     padding: 10, fontSize: 16, color: '#1E293B', textAlign: 'center' },

  // Total
  totalRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                 paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#F1F5F9', marginBottom: 16 },
  totalLabel:  { fontSize: 15, fontWeight: '700', color: '#1E293B' },
  totalScore:  { fontSize: 22, fontWeight: '800' },

  // Radio
  radioRow:         { flexDirection: 'row', alignItems: 'center', paddingVertical: 10,
                      paddingHorizontal: 12, borderRadius: 8, marginBottom: 6,
                      backgroundColor: '#F8FAFC', borderWidth: 1.5, borderColor: '#E2E8F0' },
  radioRowSelected: { backgroundColor: '#EFF6FF', borderColor: '#2E86FF' },
  radioCircle:      { width: 18, height: 18, borderRadius: 9, borderWidth: 2,
                      borderColor: '#CBD5E1', marginEnd: 10 },
  radioCircleSelected: { borderColor: '#2E86FF', backgroundColor: '#2E86FF' },
  radioLabel:       { fontSize: 14, color: '#475569' },
  radioLabelSelected: { color: '#1E3A8A', fontWeight: '600' },

  // Field label
  fieldLabel: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 8 },

  // Textarea
  textarea:   { borderWidth: 1.5, borderColor: '#CBD5E1', borderRadius: 10,
                padding: 12, fontSize: 14, color: '#1E293B',
                minHeight: 120, textAlignVertical: 'top' },
  textRtl:    { textAlign: 'right' },

  // Action buttons
  actionBlock:  { gap: 12, marginBottom: 24 },
  declineBlock: { backgroundColor: '#fff', borderRadius: 12, padding: 16, gap: 12, marginBottom: 24 },

  btnPrimary:     { backgroundColor: '#2E86FF', borderRadius: 12, padding: 16, alignItems: 'center' },
  btnPrimaryText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  btnOutline:     { borderWidth: 2, borderColor: '#CBD5E1', borderRadius: 12,
                    padding: 16, alignItems: 'center', backgroundColor: '#fff' },
  btnOutlineText: { color: '#374151', fontSize: 16, fontWeight: '600' },
  btnDanger:      { backgroundColor: '#EF4444', borderRadius: 12, padding: 16, alignItems: 'center' },
  btnGhost:       { padding: 12, alignItems: 'center' },
  btnGhostText:   { color: '#64748B', fontSize: 15 },
  btnDisabled:    { opacity: 0.55 },

  // Lang toggle
  langToggle:     { position: 'absolute', top: 0, right: 0, zIndex: 10,
                    backgroundColor: '#fff', borderRadius: 8, paddingHorizontal: 12,
                    paddingVertical: 6, borderWidth: 1, borderColor: '#E2E8F0' },
  langToggleText: { fontWeight: '700', fontSize: 13, color: '#374151' },
});