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
  ActivityIndicator, Alert, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { Timestamp } from 'firebase/firestore';
import { ExaminerAccessStyles } from '../constants/styles';

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
import { examinerSignatureStyle } from '@/utils/examinerSignature';

// ─── Defense date submission — a SEPARATE concern from the review/opinion
// flow above (see server/src/services/defenseScheduling.ts). Routed through
// the public examiner-access API (not direct Firestore writes) since it
// requires reconciling both examiners' submissions atomically.
type DefenseDateStatus = 'not_open' | 'awaiting_your_dates' | 'awaiting_other_examiners' | 'matched' | 'conflict';

// ─── Opinion form fields ───────────────────────────────────────────────────────
// Adjust these to match your institution's review criteria.
const OPINION_CRITERIA = [
  { key: 'originality',   he: 'מקוריות ותרומה מדעית',  en: 'Originality & Scientific Contribution', max: 30 },
  { key: 'methodology',   he: 'מתודולוגיה ושיטות',      en: 'Methodology & Methods',                 max: 25 },
  { key: 'presentation',  he: 'כתיבה והצגה',             en: 'Writing & Presentation',                max: 25 },
  { key: 'knowledge',     he: 'שליטה בתחום',             en: 'Domain Knowledge',                      max: 20 },
] as const;

// A unified {key, max, weight, he, en} shape covers both the hardcoded
// legacy rubric above and a milestone's configured gradingComponents
// (denormalized onto the token doc — see
// server/src/services/examinerAccess.ts's createExternalExaminerAccess,
// since an external examiner can't read the milestones collection
// directly). For the legacy rubric, weight === max, which makes the shared
// weighted-total formula ((score/max)*weight) collapse to a plain sum,
// exactly matching today's behavior.
interface ActiveGradingField { key: string; max: number; weight: number; he: string; en: string }

function activeGradingFields(doc: ExaminerTokenDoc | null): ActiveGradingField[] {
  if (doc?.gradingComponents?.length) {
    return doc.gradingComponents.map((c) => ({ key: c.key, max: c.maxScore, weight: c.weight, he: c.labelHe, en: c.labelEn }));
  }
  return OPINION_CRITERIA.map((c) => ({ key: c.key, max: c.max, weight: c.max, he: c.he, en: c.en }));
}

// ─────────────────────────────────────────────────────────────────────────────
export default function ExaminerAccessScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();

  const [lang, setLang]         = useState<Lang>('he');
  const isRtl                    = lang === 'he';
  const L                        = (he: string, en: string) => lang === 'he' ? he : en;

  // Token & loading state
  const [phase, setPhase]        = useState<
    'loading' | 'invalid' | 'expired' | 'pending' |
    'accepted' | 'submitted' | 'declined' | 'superseded' | 'error' | 'otp_required'
  >('loading');
  const [tokenDoc, setTokenDoc]  = useState<ExaminerTokenDoc | null>(null);

  // Second-factor: a one-time code emailed to the examiner, required before
  // the token document (and everything behind it) becomes readable — see
  // firestore.rules' examinerTokens `allow get` condition.
  const [otpCode, setOtpCode]       = useState('');
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [otpSent, setOtpSent]       = useState(false);
  const [otpErrorMsg, setOtpErrorMsg] = useState('');

  // Accept/Decline flow
  const [declining, setDeclining]          = useState(false);
  const [declineReason, setDeclineReason]  = useState('');
  const [showDeclineForm, setShowDeclineForm] = useState(false);
  const [actionBusy, setActionBusy]        = useState(false);

  // Opinion form — keyed dynamically once tokenDoc's gradingComponents (if
  // any) is known; see the reset effect below.
  const [scores, setScores] = useState<Record<string, string>>(
    Object.fromEntries(OPINION_CRITERIA.map((c) => [c.key, '']))
  );
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
        setDateStatus('awaiting_other_examiners');
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
      // Reset the opinion form's field keys to match this token's rubric
      // (its configured gradingComponents, if any, else the hardcoded
      // default) — the fixed initial state above only covers the default.
      setScores(Object.fromEntries(activeGradingFields(doc).map((f) => [f.key, ''])));
      const status = effectiveStatus(doc);

      if (status === 'expired')   { setPhase('expired');   return; }
      if (status === 'declined')  { setPhase('declined');  return; }
      if (status === 'superseded') { setPhase('superseded'); return; }
      if (status === 'submitted') { setPhase('submitted'); return; }
      if (status === 'accepted')  { setPhase('accepted'); loadDefenseDateStatus(); return; }
      // default: 'pending'
      setPhase('pending');

      // Record the open action (fire-and-forget — don't block the UI)
      recordTokenOpened(token).catch(() => {});
    } catch (e: any) {
      // A denied read means the second-factor code hasn't been verified yet
      // (see firestore.rules) — that's the expected first-visit state, not
      // an error. Anything else (network, unexpected) falls through to the
      // generic error phase.
      if (e?.code === 'permission-denied') {
        setPhase('otp_required');
        return;
      }
      console.error('examiner-access: load error', e);
      setPhase('error');
    }
  }, [token]);

  useEffect(() => { loadToken(); }, [loadToken]);

  // ── Second-factor: request / verify one-time email code ───────────────────
  const handleRequestOtp = async () => {
    if (!token) return;
    setOtpErrorMsg('');
    setOtpSending(true);
    try {
      await apiClient.post(`/api/examiner-access/${token}/request-otp`);
      setOtpSent(true);
    } catch (e: any) {
      setOtpErrorMsg(
        e.response?.data?.message ||
        L('שליחת הקוד נכשלה. נסה שוב.', 'Failed to send the code. Please try again.')
      );
    } finally {
      setOtpSending(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!token || !otpCode.trim()) return;
    setOtpErrorMsg('');
    setOtpVerifying(true);
    try {
      await apiClient.post(`/api/examiner-access/${token}/verify-otp`, { code: otpCode.trim() });
      setOtpCode('');
      setOtpSent(false);
      setPhase('loading');
      await loadToken();
    } catch (e: any) {
      setOtpErrorMsg(
        e.response?.data?.message ||
        L('קוד שגוי. נסה שוב.', 'Incorrect code. Please try again.')
      );
    } finally {
      setOtpVerifying(false);
    }
  };

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
    const activeFields = activeGradingFields(tokenDoc);
    for (const c of activeFields) {
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

    const total = Math.round(activeFields.reduce((s, c) => s + ((parseFloat(scores[c.key] || '0')) / c.max) * c.weight, 0));

    setSubmittingOpinion(true);
    try {
      await submitExaminerOpinion(token, {
        criteria: Object.fromEntries(
          activeFields.map(c => [c.key, parseFloat(scores[c.key])])
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

  const totalScore = Math.round(
    activeGradingFields(tokenDoc).reduce((s, c) => s + ((parseFloat(scores[c.key] || '0') || 0) / c.max) * c.weight, 0)
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

  // ── One-time email code (second factor) ────────────────────────────────────
  if (phase === 'otp_required') {
    return (
      <SafeAreaView style={s.root}>
        <LangToggle lang={lang} onToggle={() => setLang(l => l === 'he' ? 'en' : 'he')} />
        <View style={s.centered}>
          <Text style={s.errorEmoji}>🔐</Text>
          <Text style={s.errorTitle}>
            {L('אימות נוסף נדרש', 'Additional Verification Required')}
          </Text>
          <Text style={s.errorSub}>
            {L(
              'לפני הצפייה בפרטים, עלינו לוודא שאתה אכן הבוחן שהוזמן. לחץ לשליחת קוד לכתובת המייל שלך.',
              'Before viewing the details, we need to confirm you are the invited examiner. Tap to send a code to your email.',
            )}
          </Text>

          {!otpSent ? (
            <Pressable
              style={[s.btnPrimary, otpSending && s.btnDisabled, { marginTop: 20 }]}
              onPress={handleRequestOtp}
              disabled={otpSending}
              accessibilityRole="button"
            >
              {otpSending
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.btnPrimaryText}>✉️ {L('שלח קוד למייל', 'Send code to my email')}</Text>
              }
            </Pressable>
          ) : (
            <View style={{ width: '100%', marginTop: 20 }}>
              <Text style={s.fieldLabel}>
                {L('הזן את הקוד שנשלח למייל שלך', 'Enter the code sent to your email')}
              </Text>
              <TextInput
                style={s.scoreInput}
                value={otpCode}
                onChangeText={setOtpCode}
                keyboardType="number-pad"
                placeholder="123456"
                placeholderTextColor="#9CA3AF"
                maxLength={6}
              />
              <Pressable
                style={[s.btnPrimary, (otpVerifying || !otpCode.trim()) && s.btnDisabled, { marginTop: 12 }]}
                onPress={handleVerifyOtp}
                disabled={otpVerifying || !otpCode.trim()}
                accessibilityRole="button"
              >
                {otpVerifying
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={s.btnPrimaryText}>{L('אמת קוד', 'Verify Code')}</Text>
                }
              </Pressable>
              <Pressable
                style={s.btnGhost}
                onPress={handleRequestOtp}
                disabled={otpSending}
                accessibilityRole="button"
              >
                <Text style={s.btnGhostText}>
                  {otpSending
                    ? L('שולח...', 'Sending...')
                    : L('שלח קוד חדש', 'Resend code')}
                </Text>
              </Pressable>
            </View>
          )}

          {!!otpErrorMsg && (
            <Text style={[s.errorSub, { color: '#DC2626', marginTop: 12 }]}>{otpErrorMsg}</Text>
          )}
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

  // ── Superseded (promoted to a replacement examiner) ─────────────────────────
  if (phase === 'superseded') {
    return (
      <SafeAreaView style={s.root}>
        <LangToggle lang={lang} onToggle={() => setLang(l => l === 'he' ? 'en' : 'he')} />
        <View style={s.centered}>
          <Text style={s.errorEmoji}>🔄</Text>
          <Text style={s.errorTitle}>{L('המשימה הועברה לבוחן אחר', 'This assignment was reassigned')}</Text>
          <Text style={s.errorSub}>
            {L(
              'שיפוט העבודה הועבר לבוחן אחר. אין צורך בפעולה נוספת מצדך.',
              'This review was reassigned to another examiner. No further action is needed from you.',
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
                accessibilityRole="button"
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
                accessibilityRole="button"
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
                accessibilityRole="button"
              >
                {actionBusy
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={s.btnPrimaryText}>{t.examinerDecline[lang]}</Text>
                }
              </Pressable>
              <Pressable style={s.btnGhost} onPress={() => setShowDeclineForm(false)} accessibilityRole="button">
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
          <Pressable style={s.downloadBtn} onPress={handleDownloadThesis} accessibilityRole="button">
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
                  accessibilityRole="button"
                >
                  {submittingDates
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={s.btnPrimaryText}>{L('שלח תאריכים', 'Submit dates')}</Text>
                  }
                </Pressable>
              </>
            )}
            {dateStatus === 'awaiting_other_examiners' && (
              <Text style={s.errorSub}>{L('התאריכים נשלחו — ממתין לשאר הבוחנים', 'Dates submitted — waiting on the other examiners')}</Text>
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

        {/* Opinion form — data_science's digitized paper form
            (Project_examiner.docx) is a structurally different, two-rubric
            flow; kept as a separate component (not a branch inline here)
            so this generic opinion form stays byte-for-byte unchanged for
            every other faculty's tokens. */}
        {tokenDoc?.facultyId === 'data_science' && tokenDoc?.finalGradeComponents ? (
          <DataScienceEvaluationSection
            token={token}
            tokenDoc={tokenDoc}
            lang={lang}
            onBothSubmitted={() => setPhase('submitted')}
          />
        ) : (
        <View style={s.section}>
          <Text style={s.sectionTitle}>{t.examinerSubmitOpinion[lang]}</Text>

          {/* Criteria */}
          {activeGradingFields(tokenDoc).map(c => (
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
              accessibilityRole="button"
              accessibilityState={{ selected: recommendation === opt.value }}
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
            accessibilityRole="button"
          >
            {submittingOpinion
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.btnPrimaryText}>{t.examinerSubmitOpinion[lang]}</Text>
            }
          </Pressable>
        </View>
        )}

        <BottomPadding />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Small sub-components ─────────────────────────────────────────────────────

function LangToggle({ lang, onToggle }: { lang: Lang; onToggle: () => void }) {
  return (
    <Pressable
      style={s.langToggle}
      onPress={onToggle}
      accessibilityRole="button"
      accessibilityLabel={lang === 'he' ? 'עבור לאנגלית' : 'Switch to Hebrew'}
    >
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

// ─── Data Science's digitized paper form (Project_examiner.docx) ────────────
// External-examiner equivalent of mobile/app/examinor/home.tsx's
// isDataScienceDocument flow — two independently-submitted rubrics
// (project/defense), header fields, mandatory validation, and a signature.
// Kept as its own component (not inlined in the parent's render) since it
// needs its own local state per rubric, same reasoning as web's sibling
// DataScienceExaminerEvaluationForm.tsx.
interface RubricField { key: string; labelHe: string; labelEn: string; maxScore: number }

function DsRubricSection({
  title, rubric, mandatory, done, lang, onSubmit,
}: {
  title: string;
  rubric: RubricField[];
  mandatory: boolean;
  done: boolean;
  lang: Lang;
  onSubmit: (scores: Record<string, number>, comment: string) => Promise<void>;
}) {
  const L = (he: string, en: string) => (lang === 'he' ? he : en);
  const [scores, setScores] = useState<Record<string, string>>(() => Object.fromEntries(rubric.map((c) => [c.key, ''])));
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const total = Math.round(rubric.reduce((sum, c) => sum + ((parseFloat(scores[c.key] || '0')) / c.maxScore) * c.maxScore, 0));

  if (done) {
    return (
      <View style={s.section}>
        <Text style={s.sectionTitle}>{title}</Text>
        <Text style={{ marginTop: 8, fontSize: 13, fontWeight: '700', color: '#10B981' }}>✅ {L('הוגש', 'Submitted')}</Text>
      </View>
    );
  }

  const handleSubmit = async () => {
    for (const c of rubric) {
      const raw = scores[c.key];
      const v = raw === undefined || raw === '' ? NaN : parseFloat(raw);
      if (!raw || isNaN(v) || v < 0 || v > c.maxScore) {
        const label = lang === 'he' ? c.labelHe : c.labelEn;
        Alert.alert(L('שגיאה', 'Error'), L(`יש להזין ציון עבור "${label}" בטווח 0–${c.maxScore}`, `Enter a score for "${label}" in the range 0–${c.maxScore}`));
        return;
      }
    }
    if (mandatory && !comment.trim()) {
      Alert.alert(L('שגיאה', 'Error'), L('יש למלא הערכה מילולית והערות', 'A written evaluation and comments are required'));
      return;
    }
    try {
      setSubmitting(true);
      await onSubmit(Object.fromEntries(rubric.map((c) => [c.key, parseFloat(scores[c.key]) || 0])), comment);
    } catch (e) {
      Alert.alert(L('שגיאה', 'Error'), String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      {rubric.map((c) => (
        <View key={c.key} style={s.criterionRow}>
          <View style={s.criterionHeader}>
            <Text style={s.criterionLabel}>{lang === 'he' ? c.labelHe : c.labelEn}</Text>
            <Text style={s.criterionMax}>/ {c.maxScore}</Text>
          </View>
          <TextInput
            style={s.scoreInput}
            value={scores[c.key] || ''}
            onChangeText={(v) => setScores((prev) => ({ ...prev, [c.key]: v }))}
            keyboardType="numeric"
            placeholder="0"
            placeholderTextColor="#9CA3AF"
          />
        </View>
      ))}
      <View style={s.totalRow}>
        <Text style={s.totalLabel}>{L('סה"כ', 'Total')}</Text>
        <Text style={s.totalScore}>{total} / 100</Text>
      </View>
      <Text style={s.fieldLabel}>{L('הערכה מילולית והערות', 'Written evaluation and comments')}{mandatory ? ' *' : ''}</Text>
      <TextInput
        style={s.textarea}
        value={comment}
        onChangeText={setComment}
        multiline
        numberOfLines={5}
        placeholder={L('הערות...', 'Comments...')}
        placeholderTextColor="#9CA3AF"
        textAlign={lang === 'he' ? 'right' : 'left'}
      />
      <Pressable style={[s.btnPrimary, submitting && s.btnDisabled]} onPress={handleSubmit} disabled={submitting} accessibilityRole="button">
        {submitting ? <ActivityIndicator color="#fff" /> : <Text style={s.btnPrimaryText}>{L('שלח', 'Submit')}</Text>}
      </Pressable>
    </View>
  );
}

function DataScienceEvaluationSection({
  token, tokenDoc, lang, onBothSubmitted,
}: {
  token: string;
  tokenDoc: ExaminerTokenDoc;
  lang: Lang;
  onBothSubmitted: () => void;
}) {
  const L = (he: string, en: string) => (lang === 'he' ? he : en);
  const opinion = (tokenDoc.opinion ?? {}) as { project?: unknown; defense?: unknown };
  const [projectDone, setProjectDone] = useState(!!opinion.project);
  const [defenseDone, setDefenseDone] = useState(!!opinion.defense);
  const components = tokenDoc.finalGradeComponents;
  if (!components) return null;

  const submit = async (kind: 'project' | 'defense', scores: Record<string, number>, comment: string) => {
    await apiClient.post(`/api/examiner-access/${token}/examiner-evaluation`, { kind, scores, comment });
    if (kind === 'project') setProjectDone(true); else setDefenseDone(true);
    if ((kind === 'project' && defenseDone) || (kind === 'defense' && projectDone)) onBothSubmitted();
  };

  const signature = examinerSignatureStyle(tokenDoc.examinerName, tokenDoc.facultyId ?? 'data_science', 'external', tokenDoc.major ?? null);
  const fmtDate = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US') : '—');

  return (
    <>
      <View style={s.section}>
        <Text style={s.sectionTitle}>📄 {L('טופס הערכת בוחן — עבודת הגמר', 'Examiner Evaluation Form — The Final Project')}</Text>
        <Text style={{ marginTop: 6, fontSize: 12, color: '#64748B' }}>{L('שנה"ל:', 'Academic year:')} {tokenDoc.academicYearHebrew ?? '—'}</Text>
        <Text style={{ marginTop: 2, fontSize: 12, color: '#64748B' }}>{L('תאריך תחילת פרויקט:', 'Project start date:')} {fmtDate(tokenDoc.projectStartDate)}</Text>
        <Text style={{ marginTop: 2, fontSize: 12, color: '#64748B' }}>{L('תאריך ההגנה:', 'Defense date:')} {fmtDate(tokenDoc.defenseDate)}</Text>
      </View>

      <DsRubricSection
        title={L('📄 הערכת בוחן — עבודת הגמר', '📄 Examiner Evaluation — The Project')}
        rubric={components.examinerProjectEvaluation.components}
        mandatory
        done={projectDone}
        lang={lang}
        onSubmit={(scores, comment) => submit('project', scores, comment)}
      />
      <DsRubricSection
        title={L('🛡 הערכת בוחן — בחינת ההגנה', '🛡 Examiner Evaluation — The Defense Exam')}
        rubric={components.examinerDefenseEvaluation.components}
        mandatory={false}
        done={defenseDone}
        lang={lang}
        onSubmit={(scores, comment) => submit('defense', scores, comment)}
      />

      {projectDone && defenseDone && (
        <View style={s.section}>
          <Text style={{ fontSize: 12, color: '#64748B' }}>{L('שם הבוחן', 'Examiner name')}</Text>
          <Text style={{ fontSize: 14, fontWeight: '600', color: '#1E293B', marginTop: 2 }}>{tokenDoc.examinerName}</Text>
          <Text style={{ fontSize: 12, color: '#64748B', marginTop: 10 }}>{L('תאריך', 'Date')}</Text>
          <Text style={{ fontSize: 14, color: '#1E293B', marginTop: 2 }}>{new Date().toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US')}</Text>
          <Text style={{ fontSize: 12, color: '#64748B', marginTop: 10 }}>{L('חתימה', 'Signature')}</Text>
          <Text style={{ fontSize: 22, marginTop: 2, color: signature.color, fontFamily: signature.fontFamily }}>{tokenDoc.examinerName}</Text>
        </View>
      )}
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = ExaminerAccessStyles;