// components/modals/EvaluationFormModal.tsx
//
// The per-student evaluation form (server: evaluationFormController.ts;
// template: finalGradeComponents.perStudent) — mobile port of
// web/components/EvaluationFormModal.tsx. The paper form's wide criteria
// table doesn't fit a phone, so each criterion is a card with its
// "נותן ההערכה" (supervisor/examiner) tag and one score per student; the
// system-filled header, totals and digital signatures follow the web
// version. One component for the supervisor (fill, then approve/change the
// computed grades), an examiner (fill), and staff (read-only).

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, View, Text, ScrollView, Pressable, TextInput, ActivityIndicator } from 'react-native';
import { apiClient } from '../../src/api/apiClient';
import { ap } from '../../constants/theme';
import type { Lang } from '../i18n';

interface Component { key: string; labelHe: string; labelEn: string; maxScore: number; groupHe?: string; groupEn?: string }
interface Signature {
  signerName: string; role: 'supervisor' | 'examiner'; positionHe: string; positionEn: string;
  facultyId: string; facultyNameHe: string; facultyNameEn: string; signedAt: string; code: string; valid: boolean;
}
type Scores = Record<string, Record<string, number>>;
interface FormView {
  milestoneId: string;
  titleHe: string; titleEn: string;
  header: Array<{ key: string; labelHe: string; labelEn: string; value: string | null }>;
  students: Array<{ id: string; name: string; idNumber: string | null }>;
  rubrics: Array<{ kind: string; giver: 'supervisor' | 'examiner'; weight: number; components: Component[] }>;
  viewer: { role: 'supervisor' | 'secondary_supervisor' | 'examiner' | 'staff'; canEdit: boolean; lockedReasonHe: string | null; lockedReasonEn: string | null; positionHe: string | null; positionEn: string | null };
  supervisor: { name: string; submitted: boolean; scores: Scores | null; comment: string | null; signature: Signature | null };
  examiners: Array<{ uid: string; name: string; positionHe: string; positionEn: string; submitted: boolean; scores: Scores | null; comment: string | null; signature: Signature | null }>;
  totals: Array<{
    studentId: string; points: number | null; maxPoints: number; milestoneGrade: number | null; milestonePercent: number;
    otherMilestones: Array<{ type: string; nameHe: string; nameEn: string; percent: number; grade: number | null }>;
    projectFinalGrade: number | null;
  }>;
  gradeApproved: boolean;
  gradeOverrideStatus: 'pending' | 'approved' | 'rejected' | null;
}

interface Props {
  visible: boolean;
  lang: Lang;
  milestoneId: string;
  onClose: () => void;
  onChanged?: () => void;
}

function clampScoreInput(raw: string, max: number): string {
  if (raw === '') return raw;
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;
  return String(Math.min(Math.max(n, 0), max));
}

function formatPoints(n: number | null | undefined): string {
  if (n == null) return '—';
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function SignatureCard({ label, signature, pendingText, he }: { label: string; signature: Signature | null; pendingText: string; he: boolean }) {
  const align = he ? 'right' : 'left';
  return (
    <View style={{ borderWidth: 1, borderStyle: signature ? 'solid' : 'dashed', borderColor: signature && !signature.valid ? ap.error : ap.outlineVariant, backgroundColor: signature && !signature.valid ? ap.errorContainer : '#fff', borderRadius: 8, padding: 12 }}>
      <Text style={{ fontSize: 12, fontWeight: '700', color: ap.onSurfaceVariant, textAlign: align }}>{label}</Text>
      {signature ? (
        <>
          <Text style={{ marginTop: 4, fontSize: 22, fontStyle: 'italic', color: ap.primary, textAlign: align }}>{signature.signerName}</Text>
          <Text style={{ marginTop: 2, fontSize: 13, fontWeight: '600', color: ap.onSurface, textAlign: align }}>{signature.signerName} · {he ? signature.positionHe : signature.positionEn}</Text>
          <Text style={{ fontSize: 12, color: ap.onSurfaceVariant, textAlign: align }}>{he ? signature.facultyNameHe : signature.facultyNameEn}</Text>
          <Text style={{ marginTop: 2, fontSize: 12, color: ap.onSurfaceVariant, textAlign: align }}>
            {he ? 'נחתם דיגיטלית: ' : 'Digitally signed: '}
            {new Date(signature.signedAt).toLocaleString(he ? 'he-IL' : 'en-GB')}
          </Text>
          <Text style={{ marginTop: 2, fontSize: 12, color: ap.onSurface, textAlign: align }}>
            {he ? 'קוד חתימה: ' : 'Signature code: '}<Text style={{ fontWeight: '700', fontFamily: 'monospace' }}>{signature.code}</Text>
          </Text>
          <Text style={{ marginTop: 4, fontSize: 12, fontWeight: '700', color: signature.valid ? '#1B7F3B' : ap.error, textAlign: align }}>
            {signature.valid
              ? `✓ ${he ? 'החתימה תקפה' : 'Signature valid'}`
              : `⚠ ${he ? 'החתימה אינה תקפה — הציונים שונו לאחר החתימה' : 'Signature invalid — scores were changed after signing'}`}
          </Text>
        </>
      ) : (
        <Text style={{ marginTop: 6, fontSize: 13, color: ap.outline, textAlign: align }}>{pendingText}</Text>
      )}
    </View>
  );
}

export default function EvaluationFormModal({ visible, lang, milestoneId, onClose, onChanged }: Props) {
  const he = lang === 'he';
  const align = he ? 'right' : 'left';
  const row = he ? 'row-reverse' : 'row';
  const [form, setForm] = useState<FormView | null>(null);
  const [loadError, setLoadError] = useState('');
  const [draft, setDraft] = useState<Record<string, Record<string, string>>>({});
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [overriding, setOverriding] = useState(false);
  const [overrideGrades, setOverrideGrades] = useState<Record<string, string>>({});
  const [overrideReason, setOverrideReason] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await apiClient.get(`/api/projects/milestones/${milestoneId}/evaluation-form`);
      const data: FormView = res.data;
      setForm(data);
      setLoadError('');
      const own = data.viewer.role === 'supervisor' ? data.supervisor.scores : data.viewer.role === 'examiner' ? data.examiners.find((e) => e.scores)?.scores ?? null : null;
      const ownComment = data.viewer.role === 'supervisor' ? data.supervisor.comment : data.examiners.find((e) => e.comment != null)?.comment ?? null;
      setDraft(Object.fromEntries(data.students.map((s) => [s.id, Object.fromEntries(Object.entries(own?.[s.id] ?? {}).map(([k, v]) => [k, String(v)]))])));
      setComment(ownComment ?? '');
      setOverrideGrades(Object.fromEntries(data.totals.map((t) => [t.studentId, t.milestoneGrade != null ? String(t.milestoneGrade) : ''])));
    } catch (err: any) {
      setLoadError(err.response?.data?.message || (he ? 'טעינת הטופס נכשלה' : 'Failed to load the form'));
    }
  }, [milestoneId, he]);

  useEffect(() => {
    if (visible) {
      setForm(null);
      setError('');
      setMessage('');
      setOverriding(false);
      load();
    }
  }, [visible, load]);

  const myGiver: 'supervisor' | 'examiner' | null = form?.viewer.canEdit
    ? form.viewer.role === 'supervisor' ? 'supervisor' : form.viewer.role === 'examiner' ? 'examiner' : null
    : null;
  const editableComponents = useMemo(
    () => (form && myGiver ? form.rubrics.filter((r) => r.giver === myGiver).flatMap((r) => r.components) : []),
    [form, myGiver],
  );
  const allFilled = !!form && editableComponents.length > 0 && form.students.every((s) => editableComponents.every((c) => (draft[s.id]?.[c.key] ?? '') !== ''));

  const cellValue = (giver: 'supervisor' | 'examiner', studentId: string, key: string): string => {
    if (!form) return '';
    if (giver === 'supervisor') {
      if (!form.supervisor.submitted) return '—';
      const v = form.supervisor.scores?.[studentId]?.[key];
      return v == null ? '🔒' : String(v);
    }
    const visibleEvals = form.examiners.filter((e) => e.scores);
    if (visibleEvals.length === 0) return form.examiners.some((e) => e.submitted) ? '🔒' : '—';
    const values = visibleEvals.map((e) => e.scores?.[studentId]?.[key]).filter((v): v is number => v != null);
    if (values.length === 0) return '—';
    if (values.length === 1) return String(values[0]);
    return `${formatPoints(values.reduce((a, b) => a + b, 0) / values.length)} (${values.join(' / ')})`;
  };

  const handleSubmit = async () => {
    if (!form) return;
    setSubmitting(true);
    setError('');
    try {
      await apiClient.post(`/api/projects/milestones/${form.milestoneId}/evaluation-form`, {
        scoresByStudent: Object.fromEntries(form.students.map((s) => [s.id, Object.fromEntries(editableComponents.map((c) => [c.key, Number(draft[s.id]?.[c.key]) || 0]))])),
        comment,
      });
      setMessage(he ? 'הטופס נחתם והוגש.' : 'The form was signed and submitted.');
      onChanged?.();
      await load();
    } catch (err: any) {
      setError(err.response?.data?.message || (he ? 'שליחת הטופס נכשלה' : 'Failed to submit the form'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDecision = async (decision: 'approve' | 'override') => {
    if (!form) return;
    setSubmitting(true);
    setError('');
    try {
      await apiClient.post(`/api/supervisor/milestones/${form.milestoneId}/final-grade-decision`, decision === 'approve'
        ? { decision: 'approve' }
        : { decision: 'override', grades: Object.fromEntries(form.students.map((s) => [s.id, Number(overrideGrades[s.id])])), reason: overrideReason });
      setMessage(he ? 'ההחלטה נשלחה לאישור הרכז/ת.' : "The decision was sent for the coordinator's approval.");
      setOverriding(false);
      onChanged?.();
      await load();
    } catch (err: any) {
      setError(err.response?.data?.message || (he ? 'שליחת ההחלטה נכשלה' : 'Failed to submit the decision'));
    } finally {
      setSubmitting(false);
    }
  };

  const computed = !!form && form.totals.every((t) => t.milestoneGrade != null);
  const canDecide = !!form && form.viewer.role === 'supervisor' && computed && !form.gradeApproved && form.gradeOverrideStatus !== 'pending';
  const allComponents = form ? form.rubrics.flatMap((r) => r.components.map((c) => ({ ...c, giver: r.giver }))) : [];
  const sectionTitle = { fontSize: 15, fontWeight: '800' as const, color: ap.onSurface, marginTop: 20, marginBottom: 8, textAlign: align as 'right' | 'left' };
  const card = { backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: ap.outlineVariant, padding: 12 };
  const button = { borderRadius: 8, paddingVertical: 12, alignItems: 'center' as const };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <ScrollView style={{ flex: 1, backgroundColor: ap.surfaceContainerLow }} contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
        <View style={{ flexDirection: row, justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <Text style={{ flex: 1, fontSize: 18, fontWeight: '800', color: ap.onSurface, textAlign: align }}>
            {form ? (he ? form.titleHe : form.titleEn) : he ? 'טופס הערכה' : 'Evaluation form'}
          </Text>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={he ? 'סגור' : 'Close'} hitSlop={10}>
            <Text style={{ fontSize: 20, color: ap.outline }}>✕</Text>
          </Pressable>
        </View>

        {!form ? (
          loadError
            ? <Text style={{ marginTop: 16, color: ap.error, textAlign: align }} accessibilityRole="alert">{loadError}</Text>
            : <ActivityIndicator style={{ marginTop: 32 }} color={ap.primary} />
        ) : (
          <>
            {/* Header — filled in by the system */}
            <View style={[card, { marginTop: 14, gap: 6 }]}>
              {form.header.map((h) => (
                <Text key={h.key} style={{ fontSize: 13, color: ap.onSurface, textAlign: align }}>
                  <Text style={{ fontWeight: '700' }}>{he ? h.labelHe : h.labelEn}: </Text>
                  {h.value ?? (he ? 'טרם נקבע' : 'Not set yet')}
                </Text>
              ))}
            </View>

            {/* Students */}
            <Text style={sectionTitle}>{he ? 'פרטי הסטודנט/ים' : 'Student details'}</Text>
            <View style={[card, { gap: 8 }]}>
              {form.students.map((s, i) => {
                const t = form.totals.find((x) => x.studentId === s.id);
                return (
                  <View key={s.id} style={{ flexDirection: row, justifyContent: 'space-between', gap: 8 }}>
                    <Text style={{ flex: 1, fontSize: 13, color: ap.onSurface, textAlign: align }}>
                      {`${'I'.repeat(i + 1)}. ${s.name}`}{s.idNumber ? `  ·  ${he ? 'ת.ז.' : 'ID'} ${s.idNumber}` : ''}
                    </Text>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: ap.onSurface }}>
                      {he ? 'ציון סופי: ' : 'Final: '}{t?.projectFinalGrade ?? '—'}
                    </Text>
                  </View>
                );
              })}
            </View>

            {/* Criteria */}
            <Text style={sectionTitle}>{he ? 'מרכיבי הציון' : 'Grade components'}</Text>
            <View style={{ gap: 10 }}>
              {allComponents.map((c, idx) => {
                const group = he ? c.groupHe : c.groupEn;
                const prevGroup = idx > 0 ? (he ? allComponents[idx - 1]!.groupHe : allComponents[idx - 1]!.groupEn) : undefined;
                const editable = myGiver === c.giver;
                return (
                  <View key={c.key}>
                    {group && group !== prevGroup && (
                      <Text style={{ fontSize: 13, fontWeight: '800', color: ap.primary, marginBottom: 6, marginTop: idx > 0 ? 6 : 0, textAlign: align }}>{group}</Text>
                    )}
                    <View style={card}>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: ap.onSurface, textAlign: align }}>{he ? c.labelHe : c.labelEn}</Text>
                      <Text style={{ marginTop: 4, fontSize: 12, color: ap.onSurfaceVariant, textAlign: align }}>
                        {he ? 'נותן ההערכה: ' : 'Evaluated by: '}{c.giver === 'supervisor' ? (he ? 'מנחה' : 'Supervisor') : (he ? 'בוחן' : 'Examiner')}
                        {'  ·  '}{he ? `עד ${c.maxScore} נק'` : `up to ${c.maxScore} pts`}
                      </Text>
                      <View style={{ marginTop: 8, gap: 6 }}>
                        {form.students.map((s, i) => (
                          <View key={s.id} style={{ flexDirection: row, alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                            <Text style={{ flex: 1, fontSize: 13, color: ap.onSurfaceVariant, textAlign: align }}>{`${'I'.repeat(i + 1)}. ${s.name}`}</Text>
                            {editable ? (
                              <TextInput
                                keyboardType="number-pad"
                                accessibilityLabel={`${he ? c.labelHe : c.labelEn} — ${s.name}`}
                                value={draft[s.id]?.[c.key] ?? ''}
                                onChangeText={(v) => setDraft({ ...draft, [s.id]: { ...draft[s.id], [c.key]: clampScoreInput(v, c.maxScore) } })}
                                style={{ width: 64, borderWidth: 1.5, borderColor: ap.outlineVariant, borderRadius: 8, paddingVertical: 6, textAlign: 'center', fontSize: 14, color: ap.onSurface, backgroundColor: ap.surface }}
                              />
                            ) : (
                              <Text style={{ fontSize: 14, fontWeight: '700', color: ap.onSurface }}>{cellValue(c.giver, s.id, c.key)}</Text>
                            )}
                          </View>
                        ))}
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>

            {/* Totals */}
            <View style={[card, { marginTop: 12, gap: 4 }]}>
              {form.students.map((s) => {
                const t = form.totals.find((x) => x.studentId === s.id)!;
                const draftTotal = editableComponents.reduce((sum, c) => sum + (Number(draft[s.id]?.[c.key]) || 0), 0);
                return (
                  <View key={s.id}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: ap.onSurface, textAlign: align }}>
                      {s.name}: {t.points != null ? `${formatPoints(t.points)}/${t.maxPoints}` : myGiver ? `${draftTotal} (${he ? 'שלך' : 'yours'})` : '—'}
                    </Text>
                    {t.milestoneGrade != null && (
                      <Text style={{ fontSize: 12, color: ap.onSurfaceVariant, textAlign: align }}>
                        {he ? `אבן דרך זו (${t.milestonePercent}%)` : `This milestone (${t.milestonePercent}%)`}
                        {t.otherMilestones.map((o) => ` + ${he ? o.nameHe : o.nameEn} (${o.percent}%): ${o.grade ?? (he ? 'טרם נוקד' : 'not graded')}`).join('')}
                        {` = ${t.projectFinalGrade ?? (he ? 'טרם סופי' : 'not final yet')}`}
                      </Text>
                    )}
                  </View>
                );
              })}
            </View>

            {myGiver && (
              <>
                <Text style={sectionTitle}>{he ? 'הערות' : 'Comments'}</Text>
                <TextInput
                  multiline
                  value={comment}
                  onChangeText={setComment}
                  style={{ minHeight: 80, borderWidth: 1.5, borderColor: ap.outlineVariant, borderRadius: 8, padding: 10, fontSize: 14, color: ap.onSurface, backgroundColor: '#fff', textAlign: align, textAlignVertical: 'top' }}
                />
              </>
            )}

            {/* Signatures */}
            <Text style={sectionTitle}>{he ? 'חתימות' : 'Signatures'}</Text>
            <View style={{ gap: 10 }}>
              <SignatureCard he={he} label={he ? 'מנחה' : 'Supervisor'} signature={form.supervisor.signature} pendingText={he ? `ממתין ל${form.supervisor.name || 'מנחה'}` : `Awaiting ${form.supervisor.name || 'the supervisor'}`} />
              {form.examiners.map((e) => (
                <SignatureCard key={e.uid} he={he} label={he ? e.positionHe : e.positionEn} signature={e.signature} pendingText={he ? `ממתין ל${e.name}` : `Awaiting ${e.name}`} />
              ))}
              {form.examiners.length === 0 && (
                <Text style={{ fontSize: 13, color: ap.outline, textAlign: align }}>{he ? 'טרם הוקצו בוחנים' : 'No examiners assigned yet'}</Text>
              )}
            </View>

            {form.viewer.lockedReasonHe && (form.viewer.role === 'examiner' || form.viewer.role === 'supervisor') && !canDecide && (
              <Text style={{ marginTop: 14, fontSize: 13, color: ap.onSurfaceVariant, textAlign: align }}>{he ? form.viewer.lockedReasonHe : form.viewer.lockedReasonEn}</Text>
            )}
            {form.viewer.role === 'supervisor' && form.gradeOverrideStatus === 'pending' && (
              <Text style={{ marginTop: 14, fontSize: 13, color: ap.onSurfaceVariant, textAlign: align }}>{he ? 'הציונים ממתינים לאישור הרכז/ת.' : "The grades are awaiting the coordinator's approval."}</Text>
            )}
            {form.gradeApproved && (
              <Text style={{ marginTop: 14, fontSize: 13, fontWeight: '700', color: '#1B7F3B', textAlign: align }}>{he ? 'הציונים אושרו סופית.' : 'The grades were finalized.'}</Text>
            )}
            {!!error && <Text style={{ marginTop: 12, color: ap.error, textAlign: align }} accessibilityRole="alert">{error}</Text>}
            {!!message && <Text style={{ marginTop: 12, color: '#1B7F3B', textAlign: align }}>{message}</Text>}

            {myGiver && (
              <View style={{ marginTop: 16 }}>
                <Text style={{ fontSize: 12, color: ap.onSurfaceVariant, textAlign: align }}>
                  {he
                    ? `בהגשה הטופס ייחתם דיגיטלית בשמך (${form.viewer.positionHe ?? ''}), כולל הפקולטה שלך וקוד חתימה ייחודי. ניתן לעדכן ולחתום מחדש עד שכל ההערכות יוגשו.`
                    : `Submitting signs the form digitally in your name (${form.viewer.positionEn ?? ''}), with your faculty and a unique signature code. You can update and re-sign until every evaluation is in.`}
                </Text>
                <Pressable
                  onPress={handleSubmit}
                  disabled={submitting || !allFilled}
                  accessibilityRole="button"
                  style={[button, { marginTop: 8, backgroundColor: ap.primary, opacity: submitting || !allFilled ? 0.5 : 1 }]}
                >
                  <Text style={{ color: ap.onPrimary, fontWeight: '700' }}>{submitting ? '…' : he ? '✍️ חתום/י והגש/י' : '✍️ Sign & submit'}</Text>
                </Pressable>
              </View>
            )}

            {canDecide && (
              <View style={[card, { marginTop: 16 }]}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: ap.onSurface, textAlign: align }}>
                  {he ? 'כל ההערכות הוגשו — אישור הציונים המחושבים' : 'All evaluations are in — confirm the computed grades'}
                </Text>
                {!overriding ? (
                  <View style={{ flexDirection: row, gap: 8, marginTop: 10 }}>
                    <Pressable onPress={() => handleDecision('approve')} disabled={submitting} accessibilityRole="button" style={[button, { flex: 1, backgroundColor: ap.primary, opacity: submitting ? 0.5 : 1 }]}>
                      <Text style={{ color: ap.onPrimary, fontWeight: '700' }}>{he ? 'אשר/י את הציונים' : 'Approve the grades'}</Text>
                    </Pressable>
                    <Pressable onPress={() => setOverriding(true)} disabled={submitting} accessibilityRole="button" style={[button, { flex: 1, borderWidth: 1, borderColor: ap.outlineVariant }]}>
                      <Text style={{ color: ap.onSurface, fontWeight: '700' }}>{he ? 'שנה/י ציונים' : 'Change grades'}</Text>
                    </Pressable>
                  </View>
                ) : (
                  <View style={{ marginTop: 10, gap: 8 }}>
                    {form.students.map((s) => (
                      <View key={s.id} style={{ flexDirection: row, alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <Text style={{ flex: 1, fontSize: 13, color: ap.onSurface, textAlign: align }}>{s.name}</Text>
                        <TextInput
                          keyboardType="number-pad"
                          accessibilityLabel={`${he ? 'ציון עבור' : 'Grade for'} ${s.name}`}
                          value={overrideGrades[s.id] ?? ''}
                          onChangeText={(v) => setOverrideGrades({ ...overrideGrades, [s.id]: clampScoreInput(v, 100) })}
                          style={{ width: 64, borderWidth: 1.5, borderColor: ap.outlineVariant, borderRadius: 8, paddingVertical: 6, textAlign: 'center', fontSize: 14, backgroundColor: ap.surface }}
                        />
                      </View>
                    ))}
                    <TextInput
                      multiline
                      placeholder={he ? 'נימוק (חובה)' : 'Reason (required)'}
                      value={overrideReason}
                      onChangeText={setOverrideReason}
                      style={{ minHeight: 60, borderWidth: 1.5, borderColor: ap.outlineVariant, borderRadius: 8, padding: 10, fontSize: 14, backgroundColor: ap.surface, textAlign: align, textAlignVertical: 'top' }}
                    />
                    <View style={{ flexDirection: row, gap: 8 }}>
                      <Pressable
                        onPress={() => handleDecision('override')}
                        disabled={submitting || !overrideReason.trim() || form.students.some((s) => (overrideGrades[s.id] ?? '') === '')}
                        accessibilityRole="button"
                        style={[button, { flex: 1, backgroundColor: ap.primary, opacity: submitting || !overrideReason.trim() ? 0.5 : 1 }]}
                      >
                        <Text style={{ color: ap.onPrimary, fontWeight: '700' }}>{he ? 'שלח/י לאישור' : 'Send for approval'}</Text>
                      </Pressable>
                      <Pressable onPress={() => setOverriding(false)} accessibilityRole="button" style={[button, { flex: 1 }]}>
                        <Text style={{ color: ap.onSurfaceVariant }}>{he ? 'ביטול' : 'Cancel'}</Text>
                      </Pressable>
                    </View>
                  </View>
                )}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </Modal>
  );
}
