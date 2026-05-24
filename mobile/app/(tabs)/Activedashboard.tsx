// student/screens/ActiveDashboard.tsx
import React, { useState } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet,
  Modal, TextInput, ActivityIndicator,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import {
  doc, updateDoc, serverTimestamp,
} from 'firebase/firestore';
import { db, auth } from '../../src/firebase/firebase';
import { tx, type Lang } from '../../components/i18n';
import type { ActiveProject, Milestone, MilestoneType, MilestoneStatus } from '../../hooks/useStudentData';
import { ActivateDashboardStyles } from '@/constants';
import { apiClient } from '../../src/api/apiClient';


interface Props {
  project:       ActiveProject;
  milestones:    Milestone[];
  nextMilestone: Milestone | null;
  progress:      number;
  lang:          Lang;
  isRtl:         boolean;
}

// ─── Milestone type labels ─────────────────────────────────────────────────────
const MILESTONE_LABEL: Record<MilestoneType, { he: string; en: string }> = {
  research_proposal: { he: 'הצעת מחקר',    en: 'Research Proposal' },
  progress_report:   { he: 'דו"ח התקדמות', en: 'Progress Report' },
  final_report:      { he: 'דו"ח מסכם',    en: 'Final Report' },
  defense:           { he: 'הגנה',          en: 'Defense' },
};

const STATUS_CONFIG: Record<MilestoneStatus, { color: string; bg: string; icon: string }> = {
  pending:              { color: '#8899BB', bg: '#F0F4FF', icon: '🕐' },
  submitted:            { color: '#F59E0B', bg: '#FFFBEB', icon: '📤' },
  supervisor_graded:    { color: '#3B82F6', bg: '#EFF6FF', icon: '👨‍🏫' },
  coordinator_approved: { color: '#8B5CF6', bg: '#F5F3FF', icon: '✅' },
  completed:            { color: '#10B981', bg: '#ECFDF5', icon: '🏁' },
};

export default function ActiveDashboard({
  project, milestones, nextMilestone, progress, lang, isRtl,
}: Props) {
  const [submitModal,   setSubmitModal]   = useState(false);
  const [targetMilestone, setTargetMilestone] = useState<Milestone | null>(null);
  const [note,          setNote]          = useState('');
  const [files,         setFiles]         = useState<Array<{ uri: string; name: string }>>([]);
  const [submitting,    setSubmitting]    = useState(false);
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  const [activeTab,     setActiveTab]     = useState<'overview' | 'milestones' | 'grades'>('overview');

  // ── Days until deadline ────────────────────────────────────────────────────
  const daysUntil = (ts: any): number | null => {
    if (!ts?.toDate) return null;
    const diff = ts.toDate().getTime() - Date.now();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  // ── File picker ────────────────────────────────────────────────────────────
  const pickFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({ multiple: true });
    if (result.canceled || !result.assets?.length) return;
    setFiles((prev) => [
      ...prev,
      ...result.assets.map((a) => ({ uri: a.uri, name: a.name })),
    ]);
  };

  // ── Submit milestone ───────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!targetMilestone) return;
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    if (!nextMilestone)return;
    
    try {
      setSubmitting(true);
      setSubmitMessage(null);
    
      // 🚀 Create ONE FormData instance scoped to the whole function
      const formData = new FormData();

      // 🚀 Append each file from your state array to the form data
      if (files && files.length > 0) {
        files.forEach((f: any) => {
          const fileExtension = f.name?.split('.').pop()?.toLowerCase();
          const fallbackType = fileExtension === 'pdf' ? 'application/pdf' : 'application/octet-stream';
          formData.append('files', {
            uri: f.uri,
            name: f.name,
            type: f.mimeType || fallbackType, // fallback safely to pdf
          } as any);
        });
      }

      // 🚀 Append textual metadata such as the text submission notes
      formData.append('note', note);
      formData.append('milestoneId', nextMilestone.id);

      /* const fileUrls: string[] = [];
      for (const f of files) {
        const formData = new FormData();

        formData.append('file', {
          uri: f.uri,
          type: 'application/octet-stream',
          name: f.name,
        } as any);

        formData.append('upload_preset', 'MileStones');

        const res = await fetch(
          'https://api.cloudinary.com/v1_1/dp7stlfas/raw/upload',
          {
            method: 'POST',
            body: formData,
          }
        );

        const data = await res.json();
        console.log('Cloudinary response:', JSON.stringify(data)); // add this
        fileUrls.push(data.secure_url);
      }
      console.log("FINAL fileUrls:", fileUrls);
      console.log("HAS INVALID:", fileUrls.some(x => typeof x !== 'string'));
       Update milestone doc
      await updateDoc(doc(db, 'milestones', targetMilestone.id), {
        status:         'submitted',
        submittedAt:    serverTimestamp(),
        fileUrls:       fileUrls ,
        submissionNote: note,
      });*/

      await apiClient.post(`/api/milestones/${nextMilestone.id}/submit`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      setSubmitMessage('✅ ' + tx('submitSuccess', lang));
      setTimeout(() => {
        setSubmitModal(false);
        setFiles([]);
        setNote('');
        setSubmitMessage(null);
      }, 1500);
    } catch (e) {
      console.error('Submit milestone error:', e);
      setSubmitMessage(tx('submitError', lang));
    } finally {
      setSubmitting(false);
    }
  };

  const openSubmit = (m: Milestone) => {
    setTargetMilestone(m);
    setSubmitModal(true);
  };

  // ────────────────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>

      {/* ── Tab Bar ── */}
      <View style={styles.tabBar}>
        {([
          { key: 'overview',   labelHe: 'סקירה',     labelEn: 'Overview' },
          { key: 'milestones', labelHe: 'אבני דרך',  labelEn: 'Milestones' },
          { key: 'grades',     labelHe: 'ציונים',    labelEn: 'Grades' },
        ] as const).map((tab) => (
          <Pressable
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
              {lang === 'he' ? tab.labelHe : tab.labelEn}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* ══════════════ OVERVIEW TAB ══════════════ */}
        {activeTab === 'overview' && (
          <>
            {/* Project card */}
            <View style={styles.projectCard}>
              <View style={[styles.projectCardHeader, isRtl && styles.rowReverse]}>
                <Text style={styles.projectCardEmoji}>📁</Text>
                <View style={{ flex: 1, marginLeft: isRtl ? 0 : 10, marginRight: isRtl ? 10 : 0 }}>
                  <Text style={[styles.projectTitle, isRtl && styles.textRight]}>
                    {lang === 'he' ? project.titleHe : project.titleEn}
                  </Text>
                  <Text style={[styles.projectMeta, isRtl && styles.textRight]}>
                    👨‍🏫 {project.supervisorName} · {project.academicYear}
                  </Text>
                </View>
              </View>

              {/* Progress bar */}
              <View style={styles.progressSection}>
                <View style={[styles.progressLabelRow, isRtl && styles.rowReverse]}>
                  <Text style={styles.progressLabel}>
                    {lang === 'he' ? 'התקדמות' : 'Progress'}
                  </Text>
                  <Text style={styles.progressPct}>{progress}%</Text>
                </View>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${progress}%` }]} />
                </View>
                <Text style={[styles.progressSub, isRtl && styles.textRight]}>
                  {milestones.filter((m) => m.status === 'completed').length} / {milestones.length}{' '}
                  {lang === 'he' ? 'אבני דרך הושלמו' : 'milestones completed'}
                </Text>
              </View>
            </View>

            {/* Next milestone banner */}
            {nextMilestone && (
              <View style={styles.nextMilestone}>
                <View style={[styles.nextHeader, isRtl && styles.rowReverse]}>
                  <Text style={styles.nextLabel}>
                    ⚡ {tx('nextMilestone', lang)}
                  </Text>
                  {(() => {
                    const days = daysUntil(nextMilestone.dueDate);
                    const isOverdue = days !== null && days < 0;
                    const isToday   = days === 0;
                    return (
                      <View style={[
                        styles.daysBadge,
                        isOverdue ? styles.daysBadgeRed : isToday ? styles.daysBadgeOrange : styles.daysBadgeBlue,
                      ]}>
                        <Text style={styles.daysBadgeText}>
                          {isOverdue ? tx('overdue', lang)
                           : isToday ? tx('today', lang)
                           : `${days} ${tx('daysLeft', lang)}`}
                        </Text>
                      </View>
                    );
                  })()}
                </View>

                <Text style={[styles.nextTitle, isRtl && styles.textRight]}>
                  {lang === 'he'
                    ? MILESTONE_LABEL[nextMilestone.type].he
                    : MILESTONE_LABEL[nextMilestone.type].en}
                </Text>

                <Text style={[styles.nextDue, isRtl && styles.textRight]}>
                  {tx('dueDate', lang)}{' '}
                  {nextMilestone.dueDate?.toDate?.().toLocaleDateString(
                    lang === 'he' ? 'he-IL' : 'en-GB',
                    { day: 'numeric', month: 'long', year: 'numeric' }
                  )}
                </Text>

                {nextMilestone.status === 'pending' && (
                  <Pressable
                    style={styles.submitMilestoneBtn}
                    onPress={() => openSubmit(nextMilestone)}
                  >
                    <Text style={styles.submitMilestoneBtnText}>
                      {tx('submitMilestone', lang)}
                    </Text>
                  </Pressable>
                )}
              </View>
            )}

            {/* Description */}
            <View style={styles.descCard}>
              <Text style={[styles.descTitle, isRtl && styles.textRight]}>
                {lang === 'he' ? 'תיאור הפרויקט' : 'Project Description'}
              </Text>
              <Text style={[styles.descBody, isRtl && styles.textRight]}>
                {lang === 'he' ? project.descriptionHe : project.descriptionEn}
              </Text>
            </View>
          </>
        )}

        {/* ══════════════ MILESTONES TAB ══════════════ */}
        {activeTab === 'milestones' && (
          <>
            <Text style={[styles.sectionTitle, isRtl && styles.textRight]}>
              {tx('milestonesTitle', lang)}
            </Text>

            {milestones.map((m, index) => {
              const cfg   = STATUS_CONFIG[m.status];
              const days  = daysUntil(m.dueDate);
              const label = lang === 'he'
                ? MILESTONE_LABEL[m.type].he
                : MILESTONE_LABEL[m.type].en;
              const isDefense = m.type === 'defense';

              return (
                <View key={m.id} style={styles.milestoneCard}>
                  {/* Timeline dot + connector */}
                  <View style={styles.timelineCol}>
                    <View style={[styles.timelineDot, { backgroundColor: cfg.color }]}>
                      <Text style={styles.timelineNum}>{index + 1}</Text>
                    </View>
                    {index < milestones.length - 1 && (
                      <View style={[
                        styles.timelineLine,
                        m.status === 'completed' && styles.timelineLineDone,
                      ]} />
                    )}
                  </View>

                  {/* Content */}
                  <View style={[styles.milestoneContent, isRtl && styles.milestoneContentRtl]}>
                    {/* Header */}
                    <View style={[styles.milestoneHeader, isRtl && styles.rowReverse]}>
                      <Text style={styles.milestoneTitle}>{label}</Text>
                      <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
                        <Text style={[styles.statusBadgeText, { color: cfg.color }]}>
                          {cfg.icon} {lang === 'he'
                            ? ({
                                pending:              'ממתין',
                                submitted:            'הוגש',
                                supervisor_graded:    'נוקד ע"י מנחה',
                                coordinator_approved: 'אושר ע"י רכז',
                                completed:            'הושלם',
                              }[m.status])
                            : ({
                                pending:              'Pending',
                                submitted:            'Submitted',
                                supervisor_graded:    'Supervisor Graded',
                                coordinator_approved: 'Coordinator Approved',
                                completed:            'Completed',
                              }[m.status])
                          }
                        </Text>
                      </View>
                    </View>

                    {/* Due date */}
                    <Text style={[styles.milestoneDue, isRtl && styles.textRight]}>
                      📅 {tx('dueDate', lang)}{' '}
                      {m.dueDate?.toDate?.().toLocaleDateString(
                        lang === 'he' ? 'he-IL' : 'en-GB',
                        { day: 'numeric', month: 'short', year: 'numeric' }
                      )}
                      {days !== null && m.status === 'pending' && (
                        <Text style={[
                          styles.daysTag,
                          days < 0 ? { color: '#D32F2F' }
                          : days <= 7 ? { color: '#F59E0B' }
                          : { color: '#10B981' },
                        ]}>
                          {' '}({days < 0 ? `${Math.abs(days)} ${lang === 'he' ? 'ימי איחור' : 'days overdue'}` : `${days} ${tx('daysLeft', lang)}`})
                        </Text>
                      )}
                    </Text>

                    {/* Grade */}
                    {m.finalGrade !== null && (
                      <View style={styles.gradeChip}>
                        <Text style={styles.gradeChipText}>
                          {tx('grade', lang)}: {m.finalGrade}
                        </Text>
                      </View>
                    )}

                    {/* Defense info */}
                    {isDefense && m.defenseDate && (
                      <View style={styles.defenseInfo}>
                        <Text style={[styles.defenseRow, isRtl && styles.textRight]}>
                          📅 {tx('defenseDate', lang)}{' '}
                          {m.defenseDate.toDate().toLocaleDateString(
                            lang === 'he' ? 'he-IL' : 'en-GB',
                            { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }
                          )}
                        </Text>
                        {m.defenseRoom && (
                          <Text style={[styles.defenseRow, isRtl && styles.textRight]}>
                            🏫 {tx('defenseRoom', lang)} {m.defenseRoom}
                          </Text>
                        )}
                        {m.examinerNames?.length > 0 && (
                          <Text style={[styles.defenseRow, isRtl && styles.textRight]}>
                            👥 {tx('examiners', lang)} {m.examinerNames.join(', ')}
                          </Text>
                        )}
                      </View>
                    )}

                    {isDefense && !m.defenseDate && (
                      <Text style={[styles.notScheduled, isRtl && styles.textRight]}>
                        {tx('defenseNotScheduled', lang)}
                      </Text>
                    )}

                    {/* Submit button */}
                    {m.status === 'pending' && !isDefense && (
                      <Pressable
                        style={styles.milestoneSubmitBtn}
                        onPress={() => openSubmit(m)}
                      >
                        <Text style={styles.milestoneSubmitBtnText}>
                          {tx('submitMilestone', lang)}
                        </Text>
                      </Pressable>
                    )}

                    {/* Submitted files */}
                    {m.fileUrls?.length > 0 && (
                      <View style={styles.filesRow}>
                        <Text style={styles.filesLabel}>
                          📎 {m.fileUrls.length} {lang === 'he' ? 'קבצים הוגשו' : 'files submitted'}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              );
            })}
          </>
        )}

        {/* ══════════════ GRADES TAB ══════════════ */}
        {activeTab === 'grades' && (
          <>
            <Text style={[styles.sectionTitle, isRtl && styles.textRight]}>
              {lang === 'he' ? 'ציונים ומשקלים' : 'Grades & Weights'}
            </Text>

            {milestones.map((m) => {
              const label = lang === 'he'
                ? MILESTONE_LABEL[m.type].he
                : MILESTONE_LABEL[m.type].en;
              return (
                <View key={m.id} style={styles.gradeCard}>
                  <View style={[styles.gradeCardHeader, isRtl && styles.rowReverse]}>
                    <Text style={styles.gradeCardTitle}>{label}</Text>
                    {m.finalGrade !== null ? (
                      <View style={styles.gradePill}>
                        <Text style={styles.gradePillText}>{m.finalGrade}</Text>
                      </View>
                    ) : (
                      <Text style={styles.noGrade}>{tx('notGradedYet', lang)}</Text>
                    )}
                  </View>

                  <View style={styles.gradeProgress}>
                    <View style={[
                      styles.gradeProgressFill,
                      { width: m.finalGrade ? `${m.finalGrade}%` : '0%' },
                    ]} />
                  </View>
                </View>
              );
            })}

            {/* Final grade */}
            {milestones.every((m) => m.finalGrade !== null) && milestones.length > 0 && (
              <View style={styles.finalGradeCard}>
                <Text style={styles.finalGradeLabel}>{tx('finalGrade', lang)}</Text>
                <Text style={styles.finalGradeValue}>
                  {Math.round(
                    milestones.reduce((sum, m) => sum + (m.finalGrade ?? 0), 0) / milestones.length
                  )}
                </Text>
                <Text style={styles.finalGradeNote}>
                  {lang === 'he'
                    ? '* הציון מחושב לפי המשקלים שנקבעו על ידי רכז הפרויקטים'
                    : '* Grade calculated using weights set by the project coordinator'}
                </Text>
              </View>
            )}
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ── Submit Milestone Modal ── */}
      <Modal visible={submitModal} animationType="slide" presentationStyle="pageSheet">
        <ScrollView style={styles.modal} contentContainerStyle={styles.modalContent}>
          <View style={[styles.modalHeader, isRtl && styles.rowReverse]}>
            <Text style={styles.modalTitle}>
              {tx('submitTitle', lang)}{' '}
              {targetMilestone
                ? (lang === 'he'
                    ? MILESTONE_LABEL[targetMilestone.type].he
                    : MILESTONE_LABEL[targetMilestone.type].en)
                : ''}
            </Text>
            <Pressable onPress={() => { setSubmitModal(false); setFiles([]); setNote(''); }}>
              <Text style={styles.modalClose}>✕</Text>
            </Pressable>
          </View>

          {/* Files */}
          <Text style={[styles.fieldLabel, isRtl && styles.textRight]}>
            {tx('uploadFiles', lang)}
          </Text>
          {files.map((f, i) => (
            <View key={i} style={styles.fileRow}>
              <Text style={styles.fileName}>📎 {f.name}</Text>
              <Pressable onPress={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}>
                <Text style={styles.fileRemove}>✕</Text>
              </Pressable>
            </View>
          ))}
          <Pressable style={styles.uploadBtn} onPress={pickFile}>
            <Text style={styles.uploadBtnText}>
              + {lang === 'he' ? 'הוסף קובץ' : 'Add File'}
            </Text>
          </Pressable>

          {/* Note */}
          <Text style={[styles.fieldLabel, isRtl && styles.textRight]}>
            {tx('addNote', lang)}
          </Text>
          <TextInput
            style={[styles.textarea, isRtl && styles.textRight]}
            multiline
            numberOfLines={4}
            placeholder={tx('notePlaceholder', lang)}
            placeholderTextColor="#9BA8C0"
            value={note}
            onChangeText={setNote}
            textAlign={isRtl ? 'right' : 'left'}
          />

          {submitMessage && (
            <Text style={[
              styles.submitMsg,
              submitMessage.includes('✅') ? styles.submitMsgOk : styles.submitMsgErr,
            ]}>
              {submitMessage}
            </Text>
          )}

          <Pressable
            style={[styles.submitBtn, submitting && { opacity: 0.6 }]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            {submitting
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.submitBtnText}>{tx('submit', lang)}</Text>
            }
          </Pressable>
        </ScrollView>
      </Modal>
    </View>
  );
}

const styles = ActivateDashboardStyles