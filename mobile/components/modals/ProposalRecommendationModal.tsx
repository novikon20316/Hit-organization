// components/modals/ProposalRecommendationModal.tsx
//
// The coordinator's full review of a research_proposal milestone — the
// actual submitted document (personal info per teammate, every field the
// student filled in, the supervisor's signature) with the tri-state
// decision ("המלצת רכז הפרויקטים": פרויקט מאושר / מאושר בתנאי / לא מאושר)
// and a mandatory-where-relevant comment at the bottom, mirroring
// web/app/coordinator/home/ProposalRecommendationModal.tsx (this repo
// doesn't share code between web/mobile) — the paper form has the
// recommendation and signature line AFTER the document content, not in a
// separate popup. Nothing is submitted until "Sign" is pressed — the
// radio/comment are pure local state until then, so the coordinator can
// freely change their mind.
import React, { useEffect, useState } from 'react';
import {
  Modal, View, Text, ScrollView, Pressable,
  TextInput, ActivityIndicator, Image,
} from 'react-native';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../src/firebase/firebase';
import { apiClient } from '../../src/api/apiClient';
import { examinerSignatureStyle } from '../../utils/examinerSignature';
import { tx, type Lang } from '../i18n';
import { ActivateDashboardStyles } from '../../constants/styles';
import type { PendingMilestone } from '@/types';

export type ProposalDecision = 'approved' | 'approved_conditionally' | 'rejected';

interface TeammateProfile {
  uid: string;
  displayName: string;
  studentId: string | null;
  phoneNumber: string | null;
  email: string | null;
  accumulatedCredits: number | null;
  photoUrl: string | null;
}

interface CoordinatorProfile {
  displayName: string;
  facultyId: string;
  major: string | null;
}

interface Props {
  milestone: PendingMilestone;
  coordinator: CoordinatorProfile | null;
  busy: boolean;
  lang: Lang;
  isRtl: boolean;
  onCancel: () => void;
  onConfirm: (decision: ProposalDecision, comment: string) => void;
}

const OPTIONS: Array<{ value: ProposalDecision; labelHe: string; labelEn: string }> = [
  { value: 'approved', labelHe: 'פרויקט מאושר', labelEn: 'Project approved' },
  { value: 'approved_conditionally', labelHe: 'פרויקט מאושר בתנאי', labelEn: 'Approved conditionally' },
  { value: 'rejected', labelHe: 'פרויקט לא מאושר', labelEn: 'Project not approved' },
];

export default function ProposalRecommendationModal({
  milestone: m, coordinator, busy, lang, isRtl, onCancel, onConfirm,
}: Props) {
  const [decision, setDecision] = useState<ProposalDecision>('approved');
  const [comment, setComment] = useState('');
  const [teammates, setTeammates] = useState<TeammateProfile[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const resolved = await Promise.all((m.studentIds ?? []).map(async (uid): Promise<TeammateProfile> => {
        const [userSnap, photoRes] = await Promise.all([
          getDoc(doc(db, 'users', uid)),
          apiClient.get(`/api/users/${uid}/photo-url`).catch(() => ({ data: { photoUrl: null } })),
        ]);
        const u = userSnap.data();
        return {
          uid,
          displayName: u?.displayName ?? '',
          studentId: u?.studentId ?? null,
          phoneNumber: u?.phoneNumber ?? null,
          email: u?.email ?? null,
          accumulatedCredits: typeof u?.accumulatedCredits === 'number' ? u.accumulatedCredits : null,
          photoUrl: photoRes.data?.photoUrl ?? null,
        };
      }));
      if (!cancelled) setTeammates(resolved);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m.id]);

  const commentRequired = decision !== 'approved';
  const canConfirm = !commentRequired || comment.trim().length > 0;
  const fields = m.studentFormFields ?? [];

  const resolveLockedValue = (f: NonNullable<PendingMilestone['studentFormFields']>[number]): string => {
    if (f.autoFill === 'submissionDate') {
      return m.submittedAt ? new Date(m.submittedAt).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US') : '—';
    }
    if (f.autoFill === 'supervisorName') return m.supervisorName ?? '—';
    return '—';
  };

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet">
      <ScrollView style={styles.modal} contentContainerStyle={styles.modalContent}>
        <View style={[styles.modalHeader, isRtl && styles.rowReverse]}>
          <Text style={styles.modalTitle}>{lang === 'he' ? 'הצעה לפרויקט גמר' : 'Final Project Proposal'}</Text>
          <Pressable onPress={onCancel} accessibilityRole="button" accessibilityLabel={lang === 'he' ? 'סגור' : 'Close'}>
            <Text style={styles.modalClose}>✕</Text>
          </Pressable>
        </View>
        <Text style={local.subtitle}>{lang === 'he' ? m.projectTitleHe : m.projectTitleEn}</Text>

        <Text style={[styles.fieldLabel, isRtl && styles.textRight]}>{lang === 'he' ? 'פרטי הסטודנט/ית/ים' : "Student(s)' details"}</Text>
        {!teammates ? (
          <ActivityIndicator />
        ) : (
          teammates.map((tm) => (
            <View key={tm.uid} style={{ flexDirection: isRtl ? 'row-reverse' : 'row', gap: 10, marginBottom: 10, padding: 8, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 8 }}>
              <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: '#F1F0EC', overflow: 'hidden' }}>
                {tm.photoUrl && <Image source={{ uri: tm.photoUrl }} style={{ width: 52, height: 52 }} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={local.detailText}>{lang === 'he' ? 'שם: ' : 'Name: '}{tm.displayName || '—'}</Text>
                <Text style={local.detailText}>{lang === 'he' ? 'ת.ז.: ' : 'ID: '}{tm.studentId || '—'}</Text>
                <Text style={local.detailText}>{lang === 'he' ? 'טלפון: ' : 'Phone: '}{tm.phoneNumber || '—'}</Text>
                <Text style={local.detailText}>{lang === 'he' ? 'דוא"ל: ' : 'Email: '}{tm.email || '—'}</Text>
                <Text style={local.detailText}>
                  {lang === 'he' ? 'נ"ז צבור: ' : 'Credits: '}{tm.accumulatedCredits ?? (lang === 'he' ? 'טרם התקבל' : 'Pending')}
                </Text>
              </View>
            </View>
          ))
        )}

        {fields.map((f) => {
          const v = m.studentFormData?.[f.key];
          return (
            <View key={f.key} style={{ marginBottom: 12 }}>
              <Text style={[styles.fieldLabel, isRtl && styles.textRight]}>{lang === 'he' ? f.labelHe : f.labelEn}</Text>
              {f.locked ? (
                <Text style={local.lockedText}>{resolveLockedValue(f)}</Text>
              ) : f.type === 'table' ? (
                (Array.isArray(v) ? v : []).map((row: Record<string, unknown>, i: number) => (
                  <Text key={i} style={[local.detailText, isRtl && styles.textRight]}>
                    {(f.tableColumns ?? []).map((c) => String(row[c.key] ?? '')).join(' · ')}
                  </Text>
                ))
              ) : (
                <Text style={[local.expandedText, isRtl && styles.textRight]}>{v != null && v !== '' ? String(v) : '—'}</Text>
              )}
            </View>
          );
        })}

        {m.supervisorSignedByName && (
          <View style={{ flexDirection: isRtl ? 'row-reverse' : 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginBottom: 12, padding: 8, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 8 }}>
            <Text style={local.detailText}>{lang === 'he' ? 'נחתם ע"י המנחה:' : 'Signed by supervisor:'}</Text>
            <Text style={examinerSignatureStyle(m.supervisorSignedByName, m.facultyId, 'supervisor', null)}>{m.supervisorSignedByName}</Text>
            {m.supervisorSignedAt && (
              <Text style={local.detailText}>{new Date(m.supervisorSignedAt).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US')}</Text>
            )}
          </View>
        )}

        <View style={{ borderTopWidth: 1, borderTopColor: '#E0E8FF', paddingTop: 12, marginTop: 4 }}>
          <Text style={[styles.sectionTitle, isRtl && styles.textRight]}>{lang === 'he' ? 'המלצת רכז הפרויקטים' : "Coordinator's recommendation"}</Text>
          {OPTIONS.map((opt) => (
            <Pressable
              key={opt.value}
              onPress={() => setDecision(opt.value)}
              style={[local.radioRow, isRtl && styles.rowReverse, decision === opt.value && local.radioRowActive]}
              accessibilityRole="radio"
              accessibilityState={{ selected: decision === opt.value }}
            >
              <Text style={local.radioText}>{decision === opt.value ? '🔘' : '⚪'} {lang === 'he' ? opt.labelHe : opt.labelEn}</Text>
            </Pressable>
          ))}

          <Text style={[styles.fieldLabel, isRtl && styles.textRight]}>
            {lang === 'he' ? 'הערה' : 'Comment'}{commentRequired ? ' *' : ''}
          </Text>
          <TextInput
            style={[styles.textarea, isRtl && styles.textRight]}
            multiline
            numberOfLines={3}
            value={comment}
            onChangeText={setComment}
            textAlign={isRtl ? 'right' : 'left'}
            placeholder={
              decision === 'approved_conditionally'
                ? (lang === 'he' ? 'פרט/י את התנאים לאישור...' : 'Describe the conditions for approval...')
                : decision === 'rejected'
                  ? (lang === 'he' ? 'סיבת אי-האישור...' : 'Reason the project was not approved...')
                  : (lang === 'he' ? 'הערה (אופציונלי)...' : 'Comment (optional)...')
            }
            placeholderTextColor="#9BA8C0"
          />

          {coordinator && (
            <View style={{ flexDirection: isRtl ? 'row-reverse' : 'row', alignItems: 'center', gap: 6, marginTop: 8 }}>
              <Text style={local.detailText}>{lang === 'he' ? 'חתימה:' : 'Signature:'}</Text>
              <Text style={examinerSignatureStyle(coordinator.displayName, coordinator.facultyId, 'coordinator', coordinator.major)}>
                {coordinator.displayName}
              </Text>
            </View>
          )}
        </View>

        <Pressable
          style={[styles.submitBtn, (busy || !canConfirm) && { opacity: 0.6 }]}
          onPress={() => canConfirm && onConfirm(decision, comment.trim())}
          disabled={busy || !canConfirm}
          accessibilityRole="button"
        >
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitBtnText}>✍️ {lang === 'he' ? 'חתום ושלח החלטה' : 'Sign & submit decision'}</Text>}
        </Pressable>
        <Pressable onPress={onCancel} style={{ marginTop: 10, alignItems: 'center' }} accessibilityRole="button">
          <Text style={{ color: '#8899BB' }}>{lang === 'he' ? 'ביטול' : 'Cancel'}</Text>
        </Pressable>
      </ScrollView>
    </Modal>
  );
}

const styles = ActivateDashboardStyles;

const local = {
  subtitle: { fontSize: 13, color: '#8899BB', marginTop: -14, marginBottom: 16 } as const,
  detailText: { fontSize: 12, color: '#445', marginBottom: 2 } as const,
  lockedText: { fontSize: 14, color: '#8899BB', paddingVertical: 4 } as const,
  expandedText: { fontSize: 14, color: '#111' } as const,
  radioRow: {
    borderWidth: 1, borderColor: '#E0E8FF', borderRadius: 10,
    paddingVertical: 10, paddingHorizontal: 12, marginBottom: 8, backgroundColor: '#fff',
  } as const,
  radioRowActive: { borderColor: '#2E86FF', backgroundColor: '#EFF6FF' } as const,
  radioText: { fontSize: 14, color: '#111' } as const,
};
