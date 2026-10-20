// app/committees.tsx
// Mobile counterpart of web's app/committees/page.tsx (+ its
// CommitteeReviewModal / ChairDecisionModal). Top-level screen like
// relay-tasks.tsx — a committee member can hold any staff role, so it isn't
// nested under one role's folder. Reached from TopBar's "Committees" menu
// entry (coordinator-and-above, or a substituted supervisor — see TopBar)
// and from committee notification taps (notifications.tsx's
// TARGET_SCREEN_ROUTE). Committee setup/editing (system_admin) stays
// web-only.

import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ActivityIndicator, Pressable, ScrollView, RefreshControl, Modal, TextInput, Linking, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  apiClient,
  type CommitteeRecord, type CommitteePendingReview, type ChairDecisionPendingReview,
  type CommitteeReviewDetail, type DecisionRecipientCandidate,
} from '@/src/api/apiClient';
import { auth } from '@/src/firebase/firebase';
import { useActiveRole } from '@/contexts/ActiveRoleContext';
import { useLiveRefresh } from '@/hooks/useLiveRefresh';
import { facultyLabel, type FacultyId, type Lang } from '@/components/i18n';
import { majorsForFaculty, DEGREE_LEVELS } from '@/constants/permissions';

const C = {
  bg: '#F7F8FA', card: '#fff', line: '#E5E7EB', ink: '#1A1F36', muted: '#6B7280', faint: '#8899BB',
  primary: '#6E5A99', primaryBg: '#EFEBF6', success: '#10B981', successBg: '#ECFDF5', danger: '#EF4444', dangerBg: '#FEF2F2',
};

const RECIPIENT_ROLE_LABEL: Record<DecisionRecipientCandidate['role'], { he: string; en: string }> = {
  supervisor: { he: 'מנחה', en: 'Supervisor' },
  secondary_supervisor: { he: 'מנחה משני', en: 'Secondary Supervisor' },
  coordinator: { he: 'רכז', en: 'Coordinator' },
  administrative_secretary: { he: 'רכזת אדמיניסטרטיבית', en: 'Administrative Coordinator' },
  program_head: { he: 'ראש תוכנית', en: 'Program Head' },
};

const errMsg = (e: any, fallback: string) => e?.response?.data?.message || fallback;

export default function CommitteesScreen() {
  const router = useRouter();
  const { language } = useActiveRole();
  const [lang, setLang] = useState<Lang>(language === 'en' ? 'en' : 'he');
  const isRtl = lang === 'he';
  const L = (he: string, en: string) => (lang === 'he' ? he : en);
  const align = { textAlign: isRtl ? 'right' : 'left' } as const;
  const row = isRtl ? 'row-reverse' : 'row';
  const uid = auth.currentUser?.uid;

  const [myCommittees, setMyCommittees] = useState<CommitteeRecord[]>([]);
  const [pendingReviews, setPendingReviews] = useState<CommitteePendingReview[]>([]);
  const [chairDecisions, setChairDecisions] = useState<ChairDecisionPendingReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [deciding, setDeciding] = useState<ChairDecisionPendingReview | null>(null);

  const load = useCallback(async () => {
    try {
      const [mine, reviews, chair] = await Promise.all([
        apiClient.getMyCommittees(),
        apiClient.getMyPendingCommitteeReviews(),
        apiClient.getMyPendingChairDecisions(),
      ]);
      setMyCommittees(mine.committees);
      setPendingReviews(reviews.reviews);
      setChairDecisions(chair.reviews);
      setLoadError('');
    } catch (e) {
      setLoadError(errMsg(e, lang === 'he' ? 'הטעינה נכשלה' : 'Failed to load'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [lang]);

  useEffect(() => { load(); }, [load]);
  useLiveRefresh(load);

  const committeeLabel = (c: CommitteeRecord) =>
    `${facultyLabel(c.facultyId as FacultyId, lang)} · ${majorsForFaculty(c.facultyId).find((m) => m.slug === c.major)?.label[lang] ?? c.major} · ${
      DEGREE_LEVELS.find((d) => d.key === c.degreeLevel)?.label[lang] ?? c.degreeLevel
    } · ${c.type === 'thesis' ? L('תזה', 'Thesis') : L('פרויקט גמר', 'Final Project')}`;

  const card = { backgroundColor: C.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: C.line } as const;
  const sectionTitle = { fontSize: 15, fontWeight: '700' as const, color: C.ink, marginBottom: 8, marginTop: 18, ...align };
  const empty = { fontSize: 13, color: C.faint, ...align };
  const pill = { marginTop: 10, backgroundColor: C.primary, borderRadius: 20, paddingVertical: 8, alignItems: 'center' as const };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={{ flexDirection: row, alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 }}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel={L('חזור', 'Back')}>
          <Text style={{ fontSize: 15, color: '#2E86FF', fontWeight: '600' }}>{L('→ חזור', '← Back')}</Text>
        </Pressable>
        <Pressable onPress={() => setLang(lang === 'he' ? 'en' : 'he')} accessibilityRole="button" accessibilityLabel={L('החלף שפה לאנגלית', 'Switch language to Hebrew')}>
          <Text style={{ fontSize: 13, color: C.faint }}>{lang === 'he' ? 'EN' : 'עב'}</Text>
        </Pressable>
      </View>

      <Text style={{ fontSize: 20, fontWeight: '700', color: C.ink, marginHorizontal: 16, ...align }}>{L('ועדות', 'Committees')}</Text>
      <Text style={{ fontSize: 13, color: C.muted, marginHorizontal: 16, marginTop: 2, ...align }}>
        {L('ועדות תזה ופרויקט גמר', 'Thesis and final-project review committees')}
      </Text>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={C.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingTop: 0 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        >
          {!!loadError && (
            <Text accessibilityRole="alert" style={{ marginTop: 12, backgroundColor: C.dangerBg, color: C.danger, padding: 10, borderRadius: 8, ...align }}>{loadError}</Text>
          )}

          <Text style={sectionTitle}>{L('בדיקות ממתינות', 'Pending Reviews')}</Text>
          {pendingReviews.length === 0 ? (
            <Text style={empty}>{L('✅ אין הגשות הממתינות לבדיקתך', '✅ No submissions awaiting your review')}</Text>
          ) : (
            <View style={{ gap: 10 }}>
              {pendingReviews.map((r) => (
                <View key={r.milestoneId} style={card}>
                  <View style={{ flexDirection: row, justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <Text style={{ fontSize: 15, fontWeight: '600', color: C.ink, flexShrink: 1, ...align }}>
                      {lang === 'he' ? r.projectTitleHe : r.projectTitleEn}
                    </Text>
                    {r.isChairman && (
                      <Text style={{ fontSize: 11, fontWeight: '700', color: C.primary, backgroundColor: C.primaryBg, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 }}>
                        {L('יו"ר', 'Chair')}
                      </Text>
                    )}
                  </View>
                  <Text style={{ fontSize: 12, color: C.muted, marginTop: 4, ...align }}>
                    {L(`${r.voteCount}/${r.memberCount} הצביעו`, `${r.voteCount}/${r.memberCount} voted`)}
                  </Text>
                  <Pressable style={pill} onPress={() => setReviewingId(r.milestoneId)} accessibilityRole="button">
                    <Text style={{ color: '#fff', fontWeight: '600', fontSize: 13 }}>{L('בדיקה', 'Review')}</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          )}

          {chairDecisions.length > 0 && (
            <>
              <Text style={sectionTitle}>{L('החלטות יו"ר ממתינות', 'Pending chair decisions')}</Text>
              <View style={{ gap: 10 }}>
                {chairDecisions.map((r) => (
                  <View key={r.milestoneId} style={card}>
                    <Text style={{ fontSize: 15, fontWeight: '600', color: C.ink, ...align }}>{lang === 'he' ? r.nameHe : r.nameEn}</Text>
                    <Text style={{ fontSize: 12, color: C.muted, marginTop: 2, ...align }}>{lang === 'he' ? r.projectTitleHe : r.projectTitleEn}</Text>
                    {r.studentNames.length > 0 && <Text style={{ fontSize: 12, color: C.muted, marginTop: 2, ...align }}>👤 {r.studentNames.join(', ')}</Text>}
                    <Pressable style={pill} onPress={() => setDeciding(r)} accessibilityRole="button">
                      <Text style={{ color: '#fff', fontWeight: '600', fontSize: 13 }}>{L('החלטה', 'Decide')}</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            </>
          )}

          <Text style={sectionTitle}>{L('הוועדות שלי', 'My Committees')}</Text>
          {myCommittees.length === 0 ? (
            <Text style={empty}>{L('אינך חבר/ה באף ועדה', "You're not a member of any committee")}</Text>
          ) : (
            <View style={{ gap: 10 }}>
              {myCommittees.map((c) => (
                <View key={c.id} style={card}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: C.ink, ...align }}>{committeeLabel(c)}</Text>
                  <Text style={{ fontSize: 12, color: C.muted, marginTop: 2, ...align }}>
                    {c.chairmanId === uid ? L('את/ה היו"ר', "You're the chairman") : L('חבר/ת ועדה', 'Committee member')}
                    {' · '}
                    {L(`${c.memberIds.length} חברים`, `${c.memberIds.length} members`)}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}

      {reviewingId && (
        <ReviewModal milestoneId={reviewingId} uid={uid} lang={lang} onClose={() => setReviewingId(null)} onActed={load} />
      )}
      {deciding && (
        <ChairDecisionModal review={deciding} lang={lang} onClose={() => setDeciding(null)} onActed={load} />
      )}
    </SafeAreaView>
  );
}

// ─── Review: member vote, or the chairman's final decision ────────────────
function ReviewModal({ milestoneId, uid, lang, onClose, onActed }: {
  milestoneId: string; uid?: string; lang: Lang; onClose: () => void; onActed: () => void;
}) {
  const isRtl = lang === 'he';
  const L = (he: string, en: string) => (lang === 'he' ? he : en);
  const align = { textAlign: isRtl ? 'right' : 'left' } as const;
  const row = isRtl ? 'row-reverse' : 'row';

  const [detail, setDetail] = useState<CommitteeReviewDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [choice, setChoice] = useState<'approve' | 'reject' | ''>('');
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [recipients, setRecipients] = useState<{ enabled: boolean; candidates: DecisionRecipientCandidate[] } | null>(null);
  const [recipientId, setRecipientId] = useState('student');

  useEffect(() => {
    apiClient.getCommitteeReview(milestoneId)
      .then((res) => {
        setDetail(res);
        const mine = res.votes.find((v) => v.memberId === uid);
        if (mine && !res.isChairman) { setChoice(mine.vote); setComment(mine.comment); }
        if (res.isChairman) {
          apiClient.getCommitteeDecisionRecipients(milestoneId).then(setRecipients).catch(() => setRecipients({ enabled: false, candidates: [] }));
        }
      })
      .catch((e) => setError(errMsg(e, lang === 'he' ? 'הטעינה נכשלה' : 'Failed to load')))
      .finally(() => setLoading(false));
  }, [milestoneId, uid, lang]);

  const voterIds = detail ? detail.committee.memberIds.filter((id) => id !== detail.committee.chairmanId) : [];
  const missingVoterIds = detail ? voterIds.filter((id) => !detail.votes.some((v) => v.memberId === id)) : [];
  const nameOf = (id: string) => detail?.committee.memberNames[id] ?? id;

  const handleSave = async () => {
    if (!detail || !choice) return;
    if (choice === 'reject' && !comment.trim()) {
      setError(L('יש לפרט את סיבת הדחייה', 'A comment explaining the rejection is required'));
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (detail.isChairman) {
        await apiClient.submitCommitteeDecision(milestoneId, choice, comment.trim(), recipients?.enabled ? recipientId : undefined);
      } else {
        await apiClient.submitCommitteeVote(milestoneId, choice, comment.trim());
      }
      // Saved — close; the refetch drops it from the pending list.
      onActed();
      onClose();
    } catch (e) {
      setError(errMsg(e, detail.isChairman ? L('שמירת ההחלטה נכשלה', 'Failed to save the decision') : L('שמירת ההצבעה נכשלה', 'Failed to save your vote')));
    } finally {
      setSaving(false);
    }
  };

  const optionBtn = (value: 'approve' | 'reject', label: string) => {
    const active = choice === value;
    const ok = value === 'approve';
    return (
      <Pressable
        key={value}
        onPress={() => setChoice(value)}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        style={{
          flex: 1, borderRadius: 10, borderWidth: 1, paddingVertical: 10, alignItems: 'center',
          borderColor: active ? (ok ? C.success : C.danger) : C.line,
          backgroundColor: active ? (ok ? C.successBg : C.dangerBg) : C.card,
        }}
      >
        <Text style={{ fontWeight: '600', color: active ? (ok ? C.success : C.danger) : C.ink }}>{label}</Text>
      </Pressable>
    );
  };

  const disabled = !choice || saving || (!!detail?.isChairman && missingVoterIds.length > 0);

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={{ flexDirection: row, justifyContent: 'space-between', alignItems: 'center', padding: 16 }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: C.ink }}>{L('בדיקת ועדה', 'Committee Review')}</Text>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={L('סגור', 'Close')} hitSlop={10}>
              <Text style={{ fontSize: 18, color: C.muted }}>✕</Text>
            </Pressable>
          </View>

          {loading ? (
            <ActivityIndicator style={{ marginTop: 24 }} color={C.primary} />
          ) : !detail ? (
            <Text accessibilityRole="alert" style={{ margin: 16, backgroundColor: C.dangerBg, color: C.danger, padding: 10, borderRadius: 8, ...align }}>{error}</Text>
          ) : (
            <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 0, gap: 14 }} keyboardShouldPersistTaps="handled">
              <View style={{ backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.line, padding: 12 }}>
                <Text style={{ fontWeight: '600', color: C.ink, ...align }}>{L('הערת הסטודנט', "Student's note")}</Text>
                <Text style={{ color: C.muted, marginTop: 4, ...align }}>{detail.submissionNote || L('אין הערה', 'No note')}</Text>
                {detail.fileUrls.length > 0 && (
                  <View style={{ flexDirection: row, flexWrap: 'wrap', gap: 12, marginTop: 8 }}>
                    {detail.fileUrls.map((url, i) => (
                      <Pressable key={url} onPress={() => Linking.openURL(url)} accessibilityRole="link">
                        <Text style={{ color: '#2E86FF', textDecorationLine: 'underline', fontSize: 13 }}>📎 {L(`קובץ ${i + 1}`, `File ${i + 1}`)}</Text>
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>

              <View>
                <Text style={{ fontWeight: '600', color: C.ink, marginBottom: 6, ...align }}>
                  {L(`דעות חברי הוועדה (${detail.votes.length}/${voterIds.length})`, `Committee opinions (${detail.votes.length}/${voterIds.length})`)}
                </Text>
                <View style={{ gap: 6 }}>
                  {voterIds.map((memberId) => {
                    const v = detail.votes.find((x) => x.memberId === memberId);
                    return (
                      <View key={memberId} style={{ flexDirection: row, justifyContent: 'space-between', gap: 8, backgroundColor: C.card, borderRadius: 8, padding: 10 }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontWeight: '600', color: C.ink, fontSize: 13, ...align }}>{nameOf(memberId)}</Text>
                          {!!v?.comment && <Text style={{ color: C.muted, fontSize: 12, marginTop: 2, ...align }}>{v.comment}</Text>}
                        </View>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: v ? (v.vote === 'approve' ? C.success : C.danger) : C.faint }}>
                          {v ? (v.vote === 'approve' ? L('✓ בעד', '✓ Approve') : L('✗ נגד', '✗ Reject')) : L('טרם הצביע', 'Not yet voted')}
                        </Text>
                      </View>
                    );
                  })}
                </View>
                {!!detail.committee.chairmanId && (
                  <Text style={{ fontSize: 12, color: C.muted, marginTop: 6, ...align }}>
                    {L(`יו"ר: ${nameOf(detail.committee.chairmanId)} — קובע/ת את ההחלטה הסופית`, `Chair: ${nameOf(detail.committee.chairmanId)} — makes the final decision`)}
                  </Text>
                )}
              </View>

              <View style={{ backgroundColor: detail.isChairman ? C.primaryBg : C.card, borderRadius: 12, borderWidth: 1, borderColor: detail.isChairman ? C.primary : C.line, padding: 12 }}>
                <Text style={{ fontWeight: '700', color: detail.isChairman ? C.primary : C.ink, marginBottom: 8, ...align }}>
                  {detail.isChairman ? L('החלטה סופית (יו"ר)', 'Final Decision (Chairman)') : L('ההצבעה שלך', 'Your vote')}
                </Text>
                <View style={{ flexDirection: row, gap: 8 }}>
                  {detail.isChairman
                    ? [optionBtn('approve', L('✓ אישור', '✓ Approve')), optionBtn('reject', L('✗ דחייה', '✗ Reject'))]
                    : [optionBtn('approve', L('✓ בעד', '✓ Approve')), optionBtn('reject', L('✗ נגד', '✗ Reject'))]}
                </View>
                <TextInput
                  value={comment}
                  onChangeText={setComment}
                  multiline
                  placeholder={detail.isChairman ? L('נימוק ההחלטה (חובה בדחייה)', 'Reasoning (required if rejecting)') : L('הערה (חובה אם מצביעים נגד)', 'Comment (required if voting reject)')}
                  placeholderTextColor={C.faint}
                  style={{ marginTop: 8, minHeight: 64, borderWidth: 1, borderColor: C.line, borderRadius: 10, backgroundColor: '#fff', padding: 10, color: C.ink, textAlignVertical: 'top', ...align }}
                />

                {detail.isChairman && recipients?.enabled && (
                  <View style={{ marginTop: 10 }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: C.primary, marginBottom: 6, ...align }}>{L('העברת ההחלטה אל', 'Send the decision back to')}</Text>
                    {[{ id: 'student', label: L('הסטודנט/ית', 'The student') }, ...recipients.candidates.map((c) => ({ id: c.id, label: `${RECIPIENT_ROLE_LABEL[c.role][lang]} — ${c.name}` }))].map((opt) => (
                      <Pressable
                        key={opt.id}
                        onPress={() => setRecipientId(opt.id)}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: recipientId === opt.id }}
                        style={{ flexDirection: row, alignItems: 'center', gap: 8, paddingVertical: 6 }}
                      >
                        <Text style={{ fontSize: 16, color: C.primary }}>{recipientId === opt.id ? '◉' : '○'}</Text>
                        <Text style={{ color: C.ink, flexShrink: 1, ...align }}>{opt.label}</Text>
                      </Pressable>
                    ))}
                    {recipientId !== 'student' && (
                      <Text style={{ fontSize: 12, color: C.muted, marginTop: 2, ...align }}>
                        {L('מי שתבחר/י יהיה/תהיה אחראי/ת להעביר את התוצאה לסטודנט/ית בעצמו/ה.', 'Whoever you pick will be responsible for relaying this result to the student themselves.')}
                      </Text>
                    )}
                  </View>
                )}

                {detail.isChairman && missingVoterIds.length > 0 && (
                  <Text style={{ fontSize: 12, color: C.muted, marginTop: 8, ...align }}>
                    {L(`ממתין להצבעת: ${missingVoterIds.map(nameOf).join(', ')}`, `Waiting on a vote from: ${missingVoterIds.map(nameOf).join(', ')}`)}
                  </Text>
                )}

                <Pressable
                  onPress={handleSave}
                  disabled={disabled}
                  accessibilityRole="button"
                  style={{ marginTop: 10, backgroundColor: C.primary, borderRadius: 10, paddingVertical: 11, alignItems: 'center', opacity: disabled ? 0.55 : 1 }}
                >
                  {saving ? <ActivityIndicator color="#fff" size="small" /> : (
                    <Text style={{ color: '#fff', fontWeight: '700' }}>
                      {detail.isChairman ? L('קביעת ההחלטה הסופית', 'Finalize Decision') : L('שמירת ההצבעה', 'Save Vote')}
                    </Text>
                  )}
                </Pressable>
              </View>

              {!!error && (
                <Text accessibilityRole="alert" style={{ backgroundColor: C.dangerBg, color: C.danger, padding: 10, borderRadius: 8, ...align }}>{error}</Text>
              )}
            </ScrollView>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

// ─── Parallel chair decision (continue / not continue) ────────────────────
function ChairDecisionModal({ review, lang, onClose, onActed }: {
  review: ChairDecisionPendingReview; lang: Lang; onClose: () => void; onActed: () => void;
}) {
  const isRtl = lang === 'he';
  const L = (he: string, en: string) => (lang === 'he' ? he : en);
  const align = { textAlign: isRtl ? 'right' : 'left' } as const;
  const row = isRtl ? 'row-reverse' : 'row';
  const [decision, setDecision] = useState<'continue' | 'not_continue' | null>(null);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    setError('');
    if (!decision) { setError(L('יש לבחור החלטה', 'Choose a decision')); return; }
    if (!reason.trim()) { setError(L('יש לנמק את ההחלטה', 'A reason is required')); return; }
    setSubmitting(true);
    try {
      await apiClient.submitCommitteeChairDecision(review.milestoneId, decision, reason.trim());
      onActed();
      onClose();
    } catch (e) {
      setError(errMsg(e, L('השליחה נכשלה', 'Submission failed')));
    } finally {
      setSubmitting(false);
    }
  };

  const opt = (value: 'continue' | 'not_continue', label: string) => {
    const active = decision === value;
    const ok = value === 'continue';
    return (
      <Pressable
        key={value}
        onPress={() => setDecision(value)}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        style={{
          flex: 1, borderRadius: 10, borderWidth: 1, paddingVertical: 10, alignItems: 'center',
          borderColor: active ? (ok ? C.success : C.danger) : C.line,
          backgroundColor: active ? (ok ? C.successBg : C.dangerBg) : C.card,
        }}
      >
        <Text style={{ fontWeight: '600', color: active ? (ok ? C.success : C.danger) : C.ink }}>{label}</Text>
      </Pressable>
    );
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 16 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ backgroundColor: C.card, borderRadius: 14, padding: 18 }}>
          <View style={{ flexDirection: row, justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: 17, fontWeight: '700', color: C.ink }}>{L('החלטת יו"ר ועדה', 'Committee chair decision')}</Text>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={L('סגור', 'Close')} hitSlop={10}>
              <Text style={{ fontSize: 18, color: C.muted }}>✕</Text>
            </Pressable>
          </View>
          <Text style={{ color: C.muted, marginTop: 8, ...align }}>
            {lang === 'he' ? review.nameHe : review.nameEn} — {lang === 'he' ? review.projectTitleHe : review.projectTitleEn}
          </Text>
          {review.studentNames.length > 0 && <Text style={{ color: C.muted, fontSize: 12, marginTop: 2, ...align }}>👤 {review.studentNames.join(', ')}</Text>}
          <View style={{ flexDirection: row, gap: 8, marginTop: 14 }}>
            {opt('continue', L('✅ להמשיך', '✅ Continue'))}
            {opt('not_continue', L('⛔ לא להמשיך', '⛔ Not continue'))}
          </View>
          <Text style={{ fontWeight: '600', color: C.ink, marginTop: 12, marginBottom: 6, ...align }}>{L('נימוק', 'Reason')}</Text>
          <TextInput
            value={reason}
            onChangeText={setReason}
            multiline
            style={{ minHeight: 72, borderWidth: 1, borderColor: C.line, borderRadius: 10, padding: 10, color: C.ink, textAlignVertical: 'top', ...align }}
          />
          {!!error && <Text accessibilityRole="alert" style={{ marginTop: 10, backgroundColor: C.dangerBg, color: C.danger, padding: 10, borderRadius: 8, ...align }}>{error}</Text>}
          <Pressable
            onPress={handleSubmit}
            disabled={submitting}
            accessibilityRole="button"
            style={{ marginTop: 14, backgroundColor: C.primary, borderRadius: 10, paddingVertical: 11, alignItems: 'center', opacity: submitting ? 0.6 : 1 }}
          >
            {submitting ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ color: '#fff', fontWeight: '700' }}>{L('שליחה', 'Submit')}</Text>}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
