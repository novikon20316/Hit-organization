// components/modals/EvaluationFormModal.tsx
//
// The per-student evaluation form (server: evaluationFormController.ts;
// template: finalGradeComponents.perStudent) — mobile port of
// web/components/EvaluationFormModal.tsx. The paper form's wide criteria
// table doesn't fit a phone, so each criterion is a card with its
// "נותן ההערכה" (supervisor/examiner) tag and one score per student. A form
// split across milestones (Electrical M.Sc. project: book + presentation)
// shows one section per milestone, each with its own graders, submission,
// signatures and approval. One component for the supervisor (fill, then
// approve/change the computed grades), an examiner (fill), and staff
// (read-only).

import React, { useCallback, useEffect, useState } from 'react';
import { Modal, View, Text, ScrollView, Pressable, TextInput, ActivityIndicator } from 'react-native';
import { apiClient } from '../../src/api/apiClient';
import { ap } from '../../constants/theme';
import type { Lang } from '../i18n';

interface Component { key: string; labelHe: string; labelEn: string; maxScore: number; groupHe?: string; groupEn?: string }
interface Signature {
  signerName: string; role: 'supervisor' | 'examiner' | 'coordinator'; positionHe: string; positionEn: string;
  facultyId: string; facultyNameHe: string; facultyNameEn: string; signedAt: string; code: string; valid: boolean;
}
type Scores = Record<string, Record<string, number>>;
interface Section {
  milestoneId: string; nameHe: string; nameEn: string; type: string; percent: number;
  totalsDisplay: 'points' | 'weighted';
  rubrics: Array<{ kind: string; giver: 'supervisor' | 'examiner'; weight: number; percentOfTotal: number; percentPerGrader: number; components: Component[] }>;
  viewer: { role: 'supervisor' | 'examiner' | null; canEdit: boolean; lockedReasonHe: string | null; lockedReasonEn: string | null; positionHe: string | null; positionEn: string | null };
  supervisor: { name: string; submitted: boolean; scores: Scores | null; comment: string | null; signature: Signature | null };
  examiners: Array<{ uid: string; name: string; positionHe: string; positionEn: string; submitted: boolean; scores: Scores | null; comment: string | null; signature: Signature | null }>;
  totals: Array<{ studentId: string; points: number | null; maxPoints: number; milestoneGrade: number | null; contribution: number | null }>;
  gradeApproved: boolean;
  gradeOverrideStatus: 'pending' | 'approved' | 'rejected' | null;
  approvals: { supervisor: Signature | null; coordinator: Signature | null };
}
interface FormView {
  milestoneId: string;
  titleHe: string; titleEn: string;
  header: Array<{ key: string; labelHe: string; labelEn: string; value: string | null }>;
  students: Array<{ id: string; name: string; idNumber: string | null }>;
  sections: Section[];
  studentTotals: Array<{
    studentId: string;
    otherMilestones: Array<{ type: string; nameHe: string; nameEn: string; percent: number; grade: number | null }>;
    projectFinalGrade: number | null;
  }>;
}

interface Props {
  visible: boolean;
  lang: Lang;
  milestoneId: string;
  onClose: () => void;
  onChanged?: () => void;
}

// milestoneId -> studentId -> componentKey -> raw input
type Draft = Record<string, Record<string, Record<string, string>>>;

function clampScoreInput(raw: string, max: number): string {
  if (raw === '') return raw;
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;
  return String(Math.min(Math.max(n, 0), max));
}

function formatNumber(n: number | null | undefined): string {
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
              : `⚠ ${he ? 'החתימה אינה תקפה — הנתונים שונו לאחר החתימה' : 'Signature invalid — the data changed after signing'}`}
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
  const [draft, setDraft] = useState<Draft>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [busySection, setBusySection] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [overridingSection, setOverridingSection] = useState<string | null>(null);
  const [overrideGrades, setOverrideGrades] = useState<Record<string, string>>({});
  const [overrideReason, setOverrideReason] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await apiClient.get(`/api/projects/milestones/${milestoneId}/evaluation-form`);
      const data: FormView = res.data;
      setForm(data);
      setLoadError('');
      const nextDraft: Draft = {};
      const nextComments: Record<string, string> = {};
      for (const sec of data.sections) {
        const own = sec.viewer.role === 'supervisor' ? sec.supervisor : sec.viewer.role === 'examiner' ? sec.examiners.find((e) => e.scores) : undefined;
        nextDraft[sec.milestoneId] = Object.fromEntries(data.students.map((s) => [s.id, Object.fromEntries(Object.entries(own?.scores?.[s.id] ?? {}).map(([k, v]) => [k, String(v)]))]));
        nextComments[sec.milestoneId] = own?.comment ?? '';
      }
      setDraft(nextDraft);
      setComments(nextComments);
    } catch (err: any) {
      setLoadError(err.response?.data?.message || (he ? 'טעינת הטופס נכשלה' : 'Failed to load the form'));
    }
  }, [milestoneId, he]);

  useEffect(() => {
    if (visible) {
      setForm(null);
      setError('');
      setMessage('');
      setOverridingSection(null);
      load();
    }
  }, [visible, load]);

  const sectionTitle = { fontSize: 15, fontWeight: '800' as const, color: ap.onSurface, marginTop: 20, marginBottom: 8, textAlign: align as 'right' | 'left' };
  const card = { backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: ap.outlineVariant, padding: 12 };
  const button = { borderRadius: 8, paddingVertical: 12, alignItems: 'center' as const };
  const input = { width: 64, borderWidth: 1.5, borderColor: ap.outlineVariant, borderRadius: 8, paddingVertical: 6, textAlign: 'center' as const, fontSize: 14, color: ap.onSurface, backgroundColor: ap.surface };

  const editableComponentsOf = (sec: Section) =>
    sec.viewer.canEdit && sec.viewer.role ? sec.rubrics.filter((r) => r.giver === sec.viewer.role).flatMap((r) => r.components) : [];

  const submitSection = async (sec: Section) => {
    if (!form) return;
    const editable = editableComponentsOf(sec);
    setBusySection(sec.milestoneId);
    setError('');
    setMessage('');
    try {
      await apiClient.post(`/api/projects/milestones/${sec.milestoneId}/evaluation-form`, {
        scoresByStudent: Object.fromEntries(form.students.map((s) => [s.id, Object.fromEntries(editable.map((c) => [c.key, Number(draft[sec.milestoneId]?.[s.id]?.[c.key]) || 0]))])),
        comment: comments[sec.milestoneId] ?? '',
      });
      setMessage(he ? 'הטופס נחתם והוגש.' : 'The form was signed and submitted.');
      onChanged?.();
      await load();
    } catch (err: any) {
      setError(err.response?.data?.message || (he ? 'שליחת הטופס נכשלה' : 'Failed to submit the form'));
    } finally {
      setBusySection(null);
    }
  };

  const decideSection = async (sec: Section, decision: 'approve' | 'override') => {
    if (!form) return;
    setBusySection(sec.milestoneId);
    setError('');
    setMessage('');
    try {
      await apiClient.post(`/api/supervisor/milestones/${sec.milestoneId}/final-grade-decision`, decision === 'approve'
        ? { decision: 'approve' }
        : { decision: 'override', grades: Object.fromEntries(form.students.map((s) => [s.id, Number(overrideGrades[s.id])])), reason: overrideReason });
      setMessage(he ? 'ההחלטה נשלחה לאישור הרכז/ת.' : "The decision was sent for the coordinator's approval.");
      setOverridingSection(null);
      onChanged?.();
      await load();
    } catch (err: any) {
      setError(err.response?.data?.message || (he ? 'שליחת ההחלטה נכשלה' : 'Failed to submit the decision'));
    } finally {
      setBusySection(null);
    }
  };

  const renderSection = (sec: Section) => {
    if (!form) return null;
    const multi = form.sections.length > 1;
    const editable = editableComponentsOf(sec);
    const myGiver = sec.viewer.canEdit ? sec.viewer.role : null;
    const sectionDraft = draft[sec.milestoneId] ?? {};
    const allFilled = editable.length > 0 && form.students.every((s) => editable.every((c) => (sectionDraft[s.id]?.[c.key] ?? '') !== ''));
    const weighted = sec.totalsDisplay === 'weighted';
    const rows = sec.rubrics.flatMap((r) => r.components.map((c) => ({ ...c, giver: r.giver, percentPerGrader: r.percentPerGrader, percentOfTotal: r.percentOfTotal })));
    const computed = sec.totals.every((t) => t.milestoneGrade != null);
    const canDecide = sec.viewer.role === 'supervisor' && computed && !sec.gradeApproved && sec.gradeOverrideStatus !== 'pending';
    const busy = busySection === sec.milestoneId;

    const cellValue = (giver: 'supervisor' | 'examiner', studentId: string, key: string): string => {
      if (giver === 'supervisor') {
        if (!sec.supervisor.submitted) return '—';
        const v = sec.supervisor.scores?.[studentId]?.[key];
        return v == null ? '🔒' : String(v);
      }
      const visibleEvals = sec.examiners.filter((e) => e.scores);
      if (visibleEvals.length === 0) return sec.examiners.some((e) => e.submitted) ? '🔒' : '—';
      const values = visibleEvals.map((e) => e.scores?.[studentId]?.[key]).filter((v): v is number => v != null);
      if (values.length === 0) return '—';
      if (values.length === 1) return String(values[0]);
      return `${formatNumber(values.reduce((a, b) => a + b, 0) / values.length)} (${values.join(' / ')})`;
    };

    return (
      <View key={sec.milestoneId} style={multi ? { marginTop: 18, borderTopWidth: 2, borderTopColor: ap.outlineVariant, paddingTop: 6 } : undefined}>
        <Text style={sectionTitle}>{multi ? `${he ? sec.nameHe : sec.nameEn} · ${sec.percent}%` : he ? 'מרכיבי הציון' : 'Grade components'}</Text>
        <View style={{ gap: 10 }}>
          {rows.map((c, idx) => {
            const group = he ? c.groupHe : c.groupEn;
            const prevGroup = idx > 0 ? (he ? rows[idx - 1]!.groupHe : rows[idx - 1]!.groupEn) : undefined;
            const isMine = myGiver === c.giver;
            const weightText = weighted
              ? c.giver === 'examiner' && c.percentPerGrader !== c.percentOfTotal
                ? (he ? `${formatNumber(c.percentPerGrader)}% לכל בוחן` : `${formatNumber(c.percentPerGrader)}% per examiner`)
                : `${formatNumber(c.percentPerGrader)}%`
              : he ? `עד ${c.maxScore} נק'` : `up to ${c.maxScore} pts`;
            return (
              <View key={c.key}>
                {group && group !== prevGroup && (
                  <Text style={{ fontSize: 13, fontWeight: '800', color: ap.primary, marginBottom: 6, marginTop: idx > 0 ? 6 : 0, textAlign: align }}>{group}</Text>
                )}
                <View style={card}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: ap.onSurface, textAlign: align }}>{he ? c.labelHe : c.labelEn}</Text>
                  <Text style={{ marginTop: 4, fontSize: 12, color: ap.onSurfaceVariant, textAlign: align }}>
                    {he ? 'נותן ההערכה: ' : 'Evaluated by: '}{c.giver === 'supervisor' ? (he ? 'מנחה' : 'Supervisor') : (he ? 'בוחן' : 'Examiner')}{'  ·  '}{weightText}
                  </Text>
                  <View style={{ marginTop: 8, gap: 6 }}>
                    {form.students.map((s, i) => (
                      <View key={s.id} style={{ flexDirection: row, alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <Text style={{ flex: 1, fontSize: 13, color: ap.onSurfaceVariant, textAlign: align }}>
                          {form.students.length > 1 ? `${'I'.repeat(i + 1)}. ${s.name}` : he ? `ציון (0–${c.maxScore})` : `Score (0–${c.maxScore})`}
                        </Text>
                        {isMine ? (
                          <TextInput
                            keyboardType="number-pad"
                            accessibilityLabel={`${he ? c.labelHe : c.labelEn} — ${s.name}`}
                            value={sectionDraft[s.id]?.[c.key] ?? ''}
                            onChangeText={(v) => setDraft({ ...draft, [sec.milestoneId]: { ...sectionDraft, [s.id]: { ...sectionDraft[s.id], [c.key]: clampScoreInput(v, c.maxScore) } } })}
                            style={input}
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
        <View style={[card, { marginTop: 10, gap: 4 }]}>
          {form.students.map((s) => {
            const t = sec.totals.find((x) => x.studentId === s.id)!;
            const draftTotal = editable.reduce((sum, c) => sum + (Number(sectionDraft[s.id]?.[c.key]) || 0), 0);
            let text = '—';
            if (weighted && t.milestoneGrade != null) text = he ? `ציון ${t.milestoneGrade}/100 → ${formatNumber(t.contribution)} מתוך ${sec.percent}` : `grade ${t.milestoneGrade}/100 → ${formatNumber(t.contribution)} of ${sec.percent}`;
            else if (!weighted && t.points != null) text = `${formatNumber(t.points)}/${t.maxPoints}`;
            else if (myGiver && !weighted) text = `${draftTotal} (${he ? 'שלך' : 'yours'})`;
            return (
              <Text key={s.id} style={{ fontSize: 13, fontWeight: '700', color: ap.onSurface, textAlign: align }}>
                {form.students.length > 1 ? `${s.name}: ` : `${he ? 'סיכום' : 'Total'}: `}{text}
              </Text>
            );
          })}
        </View>

        {myGiver && (
          <TextInput
            multiline
            placeholder={he ? 'הערות' : 'Comments'}
            value={comments[sec.milestoneId] ?? ''}
            onChangeText={(v) => setComments({ ...comments, [sec.milestoneId]: v })}
            style={{ marginTop: 10, minHeight: 70, borderWidth: 1.5, borderColor: ap.outlineVariant, borderRadius: 8, padding: 10, fontSize: 14, color: ap.onSurface, backgroundColor: '#fff', textAlign: align, textAlignVertical: 'top' }}
          />
        )}

        <Text style={[sectionTitle, { fontSize: 13 }]}>{he ? 'חתימות' : 'Signatures'}</Text>
        <View style={{ gap: 10 }}>
          <SignatureCard he={he} label={he ? 'מנחה' : 'Supervisor'} signature={sec.supervisor.signature} pendingText={he ? `ממתין ל${sec.supervisor.name || 'מנחה'}` : `Awaiting ${sec.supervisor.name || 'the supervisor'}`} />
          {sec.examiners.map((e) => (
            <SignatureCard key={e.uid} he={he} label={he ? e.positionHe : e.positionEn} signature={e.signature} pendingText={he ? `ממתין ל${e.name}` : `Awaiting ${e.name}`} />
          ))}
          {sec.examiners.length === 0 && (
            <Text style={{ fontSize: 13, color: ap.outline, textAlign: align }}>{he ? 'טרם הוקצו בוחנים' : 'No examiners assigned yet'}</Text>
          )}
          {(sec.approvals.supervisor || sec.approvals.coordinator || computed) && (
            <>
              <SignatureCard he={he} label={he ? 'חתימת המנחה (אישור הציון)' : "Supervisor's signature (grade approval)"} signature={sec.approvals.supervisor} pendingText={he ? 'ממתין לאישור המנחה' : "Awaiting the supervisor's approval"} />
              <SignatureCard he={he} label={he ? 'חתימת רכז/ת פרויקטים' : "Projects coordinator's signature"} signature={sec.approvals.coordinator} pendingText={he ? 'ממתין לאישור הרכז/ת' : "Awaiting the coordinator's approval"} />
            </>
          )}
        </View>

        {sec.viewer.lockedReasonHe && sec.viewer.role && !canDecide && !sec.gradeApproved && sec.gradeOverrideStatus !== 'pending' && (
          <Text style={{ marginTop: 12, fontSize: 13, color: ap.onSurfaceVariant, textAlign: align }}>{he ? sec.viewer.lockedReasonHe : sec.viewer.lockedReasonEn}</Text>
        )}
        {sec.viewer.role === 'supervisor' && sec.gradeOverrideStatus === 'pending' && (
          <Text style={{ marginTop: 12, fontSize: 13, color: ap.onSurfaceVariant, textAlign: align }}>{he ? 'הציונים ממתינים לאישור הרכז/ת.' : "The grades are awaiting the coordinator's approval."}</Text>
        )}
        {sec.gradeApproved && (
          <Text style={{ marginTop: 12, fontSize: 13, fontWeight: '700', color: '#1B7F3B', textAlign: align }}>{he ? 'הציונים אושרו סופית.' : 'The grades were finalized.'}</Text>
        )}

        {myGiver && (
          <View style={{ marginTop: 12 }}>
            <Text style={{ fontSize: 12, color: ap.onSurfaceVariant, textAlign: align }}>
              {he
                ? `בהגשה הטופס ייחתם דיגיטלית בשמך (${sec.viewer.positionHe ?? ''}), כולל הפקולטה שלך וקוד חתימה ייחודי. ניתן לעדכן ולחתום מחדש עד שכל ההערכות יוגשו.`
                : `Submitting signs the form digitally in your name (${sec.viewer.positionEn ?? ''}), with your faculty and a unique signature code. You can update and re-sign until every evaluation is in.`}
            </Text>
            <Pressable
              onPress={() => submitSection(sec)}
              disabled={busy || !allFilled}
              accessibilityRole="button"
              style={[button, { marginTop: 8, backgroundColor: ap.primary, opacity: busy || !allFilled ? 0.5 : 1 }]}
            >
              <Text style={{ color: ap.onPrimary, fontWeight: '700' }}>{busy ? '…' : he ? '✍️ חתום/י והגש/י' : '✍️ Sign & submit'}</Text>
            </Pressable>
          </View>
        )}

        {canDecide && (
          <View style={[card, { marginTop: 12 }]}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: ap.onSurface, textAlign: align }}>
              {he ? 'כל ההערכות הוגשו — אישור הציונים המחושבים' : 'All evaluations are in — confirm the computed grades'}
            </Text>
            {overridingSection !== sec.milestoneId ? (
              <View style={{ flexDirection: row, gap: 8, marginTop: 10 }}>
                <Pressable onPress={() => decideSection(sec, 'approve')} disabled={busy} accessibilityRole="button" style={[button, { flex: 1, backgroundColor: ap.primary, opacity: busy ? 0.5 : 1 }]}>
                  <Text style={{ color: ap.onPrimary, fontWeight: '700' }}>{he ? '✍️ אשר/י וחתום/י' : '✍️ Approve & sign'}</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setOverridingSection(sec.milestoneId);
                    setOverrideGrades(Object.fromEntries(sec.totals.map((t) => [t.studentId, t.milestoneGrade != null ? String(t.milestoneGrade) : ''])));
                    setOverrideReason('');
                  }}
                  disabled={busy}
                  accessibilityRole="button"
                  style={[button, { flex: 1, borderWidth: 1, borderColor: ap.outlineVariant }]}
                >
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
                      style={input}
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
                    onPress={() => decideSection(sec, 'override')}
                    disabled={busy || !overrideReason.trim() || form.students.some((s) => (overrideGrades[s.id] ?? '') === '')}
                    accessibilityRole="button"
                    style={[button, { flex: 1, backgroundColor: ap.primary, opacity: busy || !overrideReason.trim() ? 0.5 : 1 }]}
                  >
                    <Text style={{ color: ap.onPrimary, fontWeight: '700' }}>{he ? '✍️ חתום/י ושלח/י' : '✍️ Sign & send'}</Text>
                  </Pressable>
                  <Pressable onPress={() => setOverridingSection(null)} accessibilityRole="button" style={[button, { flex: 1 }]}>
                    <Text style={{ color: ap.onSurfaceVariant }}>{he ? 'ביטול' : 'Cancel'}</Text>
                  </Pressable>
                </View>
              </View>
            )}
          </View>
        )}
      </View>
    );
  };

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

            {/* Students + weighted final grade */}
            <Text style={sectionTitle}>{he ? 'פרטי הסטודנט/ים' : 'Student details'}</Text>
            <View style={[card, { gap: 8 }]}>
              {form.students.map((s, i) => {
                const t = form.studentTotals.find((x) => x.studentId === s.id);
                return (
                  <View key={s.id} style={{ flexDirection: row, justifyContent: 'space-between', gap: 8 }}>
                    <Text style={{ flex: 1, fontSize: 13, color: ap.onSurface, textAlign: align }}>
                      {form.students.length > 1 ? `${'I'.repeat(i + 1)}. ` : ''}{s.name}{s.idNumber ? `  ·  ${he ? 'ת.ז.' : 'ID'} ${s.idNumber}` : ''}
                    </Text>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: ap.onSurface }}>
                      {he ? 'ציון סופי משוקלל: ' : 'Weighted final: '}{t?.projectFinalGrade ?? '—'}
                    </Text>
                  </View>
                );
              })}
            </View>

            {/* Milestones graded outside this form (e.g. the interim report) */}
            {form.studentTotals.some((t) => t.otherMilestones.length > 0) && (
              <View style={[card, { marginTop: 10, gap: 4 }]}>
                {(form.studentTotals[0]?.otherMilestones ?? []).map((o) => (
                  <Text key={o.type} style={{ fontSize: 13, color: ap.onSurface, textAlign: align }}>
                    <Text style={{ fontWeight: '700' }}>{he ? o.nameHe : o.nameEn} ({o.percent}%): </Text>
                    {form.students.map((s) => {
                      const g = form.studentTotals.find((x) => x.studentId === s.id)?.otherMilestones.find((x) => x.type === o.type)?.grade;
                      return `${form.students.length > 1 ? `${s.name} ` : ''}${g ?? (he ? 'טרם נוקד' : 'not graded yet')}`;
                    }).join(' · ')}
                  </Text>
                ))}
              </View>
            )}

            {form.sections.map(renderSection)}

            {!!error && <Text style={{ marginTop: 12, color: ap.error, textAlign: align }} accessibilityRole="alert">{error}</Text>}
            {!!message && <Text style={{ marginTop: 12, color: '#1B7F3B', textAlign: align }}>{message}</Text>}
          </>
        )}
      </ScrollView>
    </Modal>
  );
}
