// app/(tabs)/WorkflowTemplateManager.tsx
//
// Real, faculty-configurable milestone templates — see
// server/src/services/workflowTemplates.ts. Distinct from
// Facultytemplatemanager.tsx, which manages an unrelated concept (a
// project-proposal catalog supervisors submit to faculty admins).
//
// Three process types (msc_thesis / msc_project / bsc_project) each have
// their own milestone list. Proposing a new version requires approval before
// it takes effect: master's processes need the grad school head; bachelor's
// is approved by the faculty itself (faculty_admin/coordinator) — see
// server/src/controllers/workflowTemplateController.ts's canApprove().

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable,
  ActivityIndicator, Modal, TextInput, Alert, Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth } from '../../src/firebase/firebase';
import type { Lang } from '../../components/i18n';
import { TopBar, FACULTY_COLORS } from '../../components/shared';
import { ResponsiveScreen } from '../../components/ResponsiveScreen';
import { PERMISSION_FACULTY_IDS } from '../../constants/permissions';
import { apiClient } from '../../src/api/apiClient';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ProcessType = 'msc_thesis' | 'msc_project' | 'bsc_project';
export type TemplateStatus = 'pending_approval' | 'approved' | 'rejected' | 'superseded';

export interface MilestoneSpec {
  type: string;
  nameHe: string;
  nameEn: string;
  order: number;
  dueDaysFromStart: number;
  requiresExaminers: boolean;
}

export interface WorkflowTemplateDoc {
  id: string;
  facultyId: string;
  processType: ProcessType;
  version: number;
  status: TemplateStatus;
  milestones: MilestoneSpec[];
  createdBy: string;
  createdAt: string;
  proposedNote: string | null;
  approvedBy?: string;
  approvedAt?: string;
  rejectedBy?: string;
  rejectedAt?: string;
  rejectionReason?: string;
}

const PROCESS_TYPES: { key: ProcessType; he: string; en: string }[] = [
  { key: 'msc_thesis',  he: 'תזה לתואר שני',           en: "Master's Thesis" },
  { key: 'msc_project', he: 'פרויקט גמר לתואר שני',    en: "Master's Project" },
  { key: 'bsc_project', he: 'פרויקט לתואר ראשון',       en: "Bachelor's Project" },
];

const GRAD_SCHOOL_APPROVER_ROLES = ['grad_school_head', 'administrative_secretary', 'system_admin'];
const FACULTY_APPROVER_ROLES = ['faculty_admin', 'coordinator', 'administrative_secretary', 'system_admin'];
// No single "home" faculty — must explicitly pick which faculty they're
// viewing/proposing for (see workflowTemplateController.ts).
const CROSS_FACULTY_ROLES = ['system_admin', 'administrative_secretary', 'grad_school_head'];
const SELECTABLE_FACULTY_IDS = PERMISSION_FACULTY_IDS.filter((id) => id !== 'all');

function isMastersProcess(pt: ProcessType): boolean {
  return pt === 'msc_thesis' || pt === 'msc_project';
}

function canApproveRole(pt: ProcessType, role: string | null): boolean {
  if (!role) return false;
  return isMastersProcess(pt) ? GRAD_SCHOOL_APPROVER_ROLES.includes(role) : FACULTY_APPROVER_ROLES.includes(role);
}

function makeId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function emptyMilestone(order: number): MilestoneSpec {
  return { type: `custom_${makeId()}`, nameHe: '', nameEn: '', order, dueDaysFromStart: 90, requiresExaminers: false };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function WorkflowTemplateManager() {
  const [lang, setLang] = useState<Lang>('he');
  const isRtl = lang === 'he';

  const [loading, setLoading]     = useState(true);
  const [userName, setUserName]   = useState('');
  const [userRole, setUserRole]   = useState<string | null>(null);
  const [ownFacultyId, setOwnFacultyId] = useState<string | null>(null);
  const [selectedFacultyId, setSelectedFacultyId] = useState<string | null>(null);

  const isCrossFaculty = !!userRole && CROSS_FACULTY_ROLES.includes(userRole);
  // Cross-faculty roles pick a real faculty explicitly; everyone else is
  // locked to their own.
  const facultyId = isCrossFaculty ? selectedFacultyId : ownFacultyId;

  const [templates, setTemplates] = useState<WorkflowTemplateDoc[]>([]);
  const [activeProcessType, setActiveProcessType] = useState<ProcessType>('msc_thesis');
  const [activeTab, setActiveTab] = useState<'current' | 'pending'>('current');
  const [saving, setSaving] = useState(false);

  // Propose-editor modal
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMilestones, setEditorMilestones] = useState<MilestoneSpec[]>([]);
  const [editorNote, setEditorNote] = useState('');

  // Milestone row editor (inside the propose modal)
  const [msModalOpen, setMsModalOpen] = useState(false);
  const [editingMs, setEditingMs] = useState<MilestoneSpec | null>(null);
  const [msNameHe, setMsNameHe] = useState('');
  const [msNameEn, setMsNameEn] = useState('');
  const [msDays, setMsDays] = useState('90');
  const [msExaminers, setMsExaminers] = useState(false);

  // Reject-reason modal
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const uid = auth.currentUser?.uid;

  useEffect(() => {
    if (!uid) { setLoading(false); return; }
    (async () => {
      try {
        const res = await apiClient.get('/api/users/profile');
        setUserName(res.data.displayName || '');
        setUserRole(res.data.role || null);
        setOwnFacultyId(res.data.facultyId || null);
        // No facultyId on the profile (shouldn't happen for the roles that
        // can reach this screen) — nothing left to load, stop spinning.
        if (!res.data.facultyId && !CROSS_FACULTY_ROLES.includes(res.data.role)) setLoading(false);
      } catch (err) {
        console.error('WorkflowTemplateManager: failed to load profile', err);
        setLoading(false);
      }
    })();
  }, [uid]);

  useEffect(() => {
    if (isCrossFaculty && !selectedFacultyId && SELECTABLE_FACULTY_IDS.length > 0) {
      setSelectedFacultyId(SELECTABLE_FACULTY_IDS[0]!);
    }
  }, [isCrossFaculty, selectedFacultyId]);

  const loadTemplates = useCallback(async () => {
    if (!facultyId) return;
    try {
      setLoading(true);
      const res = await apiClient.get(`/api/workflow-templates?facultyId=${facultyId}`);
      setTemplates(res.data.templates || []);
    } catch (err) {
      console.error('WorkflowTemplateManager: failed to load templates', err);
    } finally {
      setLoading(false);
    }
  }, [facultyId]);

  useEffect(() => { loadTemplates(); }, [loadTemplates]);

  const approvedForActive = templates.find((t) => t.processType === activeProcessType && t.status === 'approved');
  const pending = templates.filter((t) => t.status === 'pending_approval');
  const pendingForActive = pending.filter((t) => t.processType === activeProcessType);

  // ── Propose editor ──────────────────────────────────────────────────────
  const openEditor = () => {
    setEditorMilestones(
      approvedForActive
        ? approvedForActive.milestones.map((m) => ({ ...m }))
        : [emptyMilestone(1)]
    );
    setEditorNote('');
    setEditorOpen(true);
  };

  const openMilestoneEditor = (ms: MilestoneSpec | null) => {
    if (ms) {
      setEditingMs(ms);
      setMsNameHe(ms.nameHe);
      setMsNameEn(ms.nameEn);
      setMsDays(String(ms.dueDaysFromStart));
      setMsExaminers(ms.requiresExaminers);
    } else {
      setEditingMs(null);
      setMsNameHe(''); setMsNameEn(''); setMsDays('90'); setMsExaminers(false);
    }
    setMsModalOpen(true);
  };

  const saveMilestoneRow = () => {
    if (!msNameHe.trim() || !msNameEn.trim()) {
      Alert.alert(lang === 'he' ? 'שגיאה' : 'Error', lang === 'he' ? 'יש להזין שם לאבן הדרך' : 'Enter a milestone name');
      return;
    }
    const days = parseInt(msDays, 10);
    if (!Number.isFinite(days) || days < 0) {
      Alert.alert(lang === 'he' ? 'שגיאה' : 'Error', lang === 'he' ? 'מספר ימים לא תקין' : 'Invalid number of days');
      return;
    }
    if (editingMs) {
      setEditorMilestones((prev) => prev.map((m) => (m === editingMs
        ? { ...m, nameHe: msNameHe.trim(), nameEn: msNameEn.trim(), dueDaysFromStart: days, requiresExaminers: msExaminers }
        : m)));
    } else {
      setEditorMilestones((prev) => [
        ...prev,
        { type: `custom_${makeId()}`, nameHe: msNameHe.trim(), nameEn: msNameEn.trim(), order: prev.length + 1, dueDaysFromStart: days, requiresExaminers: msExaminers },
      ]);
    }
    setMsModalOpen(false);
  };

  const removeMilestoneRow = (ms: MilestoneSpec) => {
    setEditorMilestones((prev) => prev.filter((m) => m !== ms).map((m, i) => ({ ...m, order: i + 1 })));
  };

  const handleSaveProposal = async () => {
    if (editorMilestones.length === 0) {
      Alert.alert(lang === 'he' ? 'שגיאה' : 'Error', lang === 'he' ? 'יש להוסיף לפחות אבן דרך אחת' : 'Add at least one milestone');
      return;
    }
    setSaving(true);
    try {
      await apiClient.post('/api/workflow-templates', {
        processType: activeProcessType,
        milestones: editorMilestones,
        note: editorNote.trim() || undefined,
        ...(isCrossFaculty ? { facultyId } : {}),
      });
      setEditorOpen(false);
      Alert.alert(
        '✅',
        lang === 'he' ? 'ההצעה נשלחה לאישור' : 'Proposal submitted for approval'
      );
      await loadTemplates();
      setActiveTab('pending');
    } catch (e: any) {
      Alert.alert('❌', e.response?.data?.message || (lang === 'he' ? 'שליחת ההצעה נכשלה' : 'Failed to submit proposal'));
    } finally {
      setSaving(false);
    }
  };

  // ── Approve / reject ────────────────────────────────────────────────────
  const handleApprove = async (tpl: WorkflowTemplateDoc) => {
    setSaving(true);
    try {
      await apiClient.post(`/api/workflow-templates/${tpl.id}/approve`);
      Alert.alert('✅', lang === 'he' ? 'התבנית אושרה' : 'Template approved');
      await loadTemplates();
    } catch (e: any) {
      Alert.alert('❌', e.response?.data?.message || (lang === 'he' ? 'האישור נכשל' : 'Approval failed'));
    } finally {
      setSaving(false);
    }
  };

  const openRejectModal = (tpl: WorkflowTemplateDoc) => {
    setRejectingId(tpl.id);
    setRejectReason('');
    setRejectOpen(true);
  };

  const handleReject = async () => {
    if (!rejectingId) return;
    if (!rejectReason.trim()) {
      Alert.alert(lang === 'he' ? 'שגיאה' : 'Error', lang === 'he' ? 'יש להזין סיבת דחייה' : 'A rejection reason is required');
      return;
    }
    setSaving(true);
    try {
      await apiClient.post(`/api/workflow-templates/${rejectingId}/reject`, { reason: rejectReason.trim() });
      setRejectOpen(false);
      setRejectingId(null);
      Alert.alert('✅', lang === 'he' ? 'התבנית נדחתה' : 'Template rejected');
      await loadTemplates();
    } catch (e: any) {
      Alert.alert('❌', e.response?.data?.message || (lang === 'he' ? 'הדחייה נכשלה' : 'Rejection failed'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F3FF' }}>
        <ActivityIndicator size="large" color="#7C3AED" />
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F5F3FF' }}>
      <TopBar
        name={userName}
        role={(userRole as any) ?? 'faculty_admin'}
        lang={lang}
        isRtl={isRtl}
        onToggleLang={() => setLang(lang === 'he' ? 'en' : 'he')}
      />

      {/* Faculty selector — cross-faculty roles only (no single "home" faculty) */}
      {isCrossFaculty && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingHorizontal: 16, paddingTop: 12 }}>
          {SELECTABLE_FACULTY_IDS.map((id) => (
            <Pressable
              key={id}
              style={{
                borderWidth: 1.5, borderColor: selectedFacultyId === id ? '#7C3AED' : '#DDD6FE',
                backgroundColor: selectedFacultyId === id ? '#7C3AED' : '#fff',
                borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, marginRight: 8,
              }}
              onPress={() => setSelectedFacultyId(id)}
            >
              <Text style={{ color: selectedFacultyId === id ? '#fff' : '#7C3AED', fontWeight: '600', fontSize: 13 }}>
                {FACULTY_COLORS[id]?.label[lang] ?? id}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {/* Process type selector */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingHorizontal: 16, paddingTop: 12 }}>
        {PROCESS_TYPES.map((pt) => (
          <Pressable
            key={pt.key}
            style={{
              borderWidth: 1.5, borderColor: activeProcessType === pt.key ? '#7C3AED' : '#DDD6FE',
              backgroundColor: activeProcessType === pt.key ? '#7C3AED' : '#fff',
              borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, marginRight: 8,
            }}
            onPress={() => setActiveProcessType(pt.key)}
          >
            <Text style={{ color: activeProcessType === pt.key ? '#fff' : '#7C3AED', fontWeight: '600', fontSize: 13 }}>
              {lang === 'he' ? pt.he : pt.en}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Tab bar — fixed size (not flex:1), matches admin/panel.tsx's
          tabsContainer, wrapped in a horizontal ScrollView so extra tabs
          slide into view instead of shrinking/growing with tab count. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ flexDirection: 'row', marginTop: 14, paddingHorizontal: 16, gap: 8 }}
      >
        {([
          { key: 'current' as const, he: 'תבנית נוכחית', en: 'Current Template' },
          { key: 'pending' as const, he: 'ממתין לאישור', en: 'Pending Approval', badge: pending.length },
        ]).map((tab) => (
          <Pressable
            key={tab.key}
            style={{
              width: 110, height: 46, paddingVertical: 14, paddingHorizontal: 18, borderRadius: 10,
              alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
              backgroundColor: activeTab === tab.key ? '#EDE9FE' : 'transparent',
            }}
            onPress={() => setActiveTab(tab.key)}
          >
            <Text
              style={{ fontSize: 13, fontWeight: activeTab === tab.key ? '700' : '500', color: activeTab === tab.key ? '#7C3AED' : '#8899BB' }}
              numberOfLines={1}
            >
              {lang === 'he' ? tab.he : tab.en}{'badge' in tab && tab.badge ? ` (${tab.badge})` : ''}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <ResponsiveScreen>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {activeTab === 'current' && (
          <>
            {approvedForActive ? (
              <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 14 }}>
                <Text style={{ fontSize: 13, color: '#8899BB', marginBottom: 8 }}>
                  {lang === 'he' ? `גרסה ${approvedForActive.version} · מאושר` : `Version ${approvedForActive.version} · Approved`}
                </Text>
                {approvedForActive.milestones.sort((a, b) => a.order - b.order).map((m, idx) => (
                  <View key={m.type} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderTopWidth: idx > 0 ? 1 : 0, borderTopColor: '#F3F0FF', gap: 10 }}>
                    <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: '#EDE9FE', alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#7C3AED' }}>{idx + 1}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: '#1F1235' }}>{lang === 'he' ? m.nameHe : m.nameEn}</Text>
                      <Text style={{ fontSize: 11, color: '#8899BB' }}>
                        📅 {lang === 'he' ? `יום ${m.dueDaysFromStart}` : `Day ${m.dueDaysFromStart}`}
                        {m.requiresExaminers ? `  ·  👥 ${lang === 'he' ? 'בוחנים' : 'Examiners'}` : ''}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                <Text style={{ fontSize: 40, marginBottom: 10 }}>📋</Text>
                <Text style={{ fontSize: 14, color: '#8899BB', textAlign: 'center', paddingHorizontal: 24 }}>
                  {lang === 'he'
                    ? 'אין תבנית מאושרת לתהליך זה — נעשה שימוש בברירת המחדל של המערכת.'
                    : 'No approved template for this process yet — the system default is used.'}
                </Text>
              </View>
            )}

            {pendingForActive.length > 0 && (
              <Text style={{ fontSize: 12, color: '#F59E0B', fontWeight: '600', marginBottom: 10 }}>
                {lang === 'he' ? '⏳ יש הצעה ממתינה לאישור לתהליך זה' : '⏳ A proposal is pending approval for this process'}
              </Text>
            )}

            <Pressable
              style={{ backgroundColor: '#7C3AED', borderRadius: 12, paddingVertical: 13, alignItems: 'center' }}
              onPress={openEditor}
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>
                ＋ {lang === 'he' ? 'הצע גרסה חדשה' : 'Propose New Version'}
              </Text>
            </Pressable>
          </>
        )}

        {activeTab === 'pending' && (
          <>
            {pending.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                <Text style={{ fontSize: 40, marginBottom: 10 }}>✅</Text>
                <Text style={{ fontSize: 14, color: '#8899BB' }}>
                  {lang === 'he' ? 'אין הצעות ממתינות' : 'No pending proposals'}
                </Text>
              </View>
            ) : (
              pending.map((tpl) => {
                const canApprove = canApproveRole(tpl.processType, userRole);
                const ptLabel = PROCESS_TYPES.find((p) => p.key === tpl.processType);
                return (
                  <View key={tpl.id} style={{ backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 14, borderLeftWidth: 4, borderLeftColor: '#F59E0B' }}>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: '#111' }}>
                      {lang === 'he' ? ptLabel?.he : ptLabel?.en} · {lang === 'he' ? `גרסה ${tpl.version}` : `Version ${tpl.version}`}
                    </Text>
                    <Text style={{ fontSize: 12, color: '#8899BB', marginTop: 4, marginBottom: 8 }}>
                      {tpl.milestones.length} {lang === 'he' ? 'אבני דרך' : 'milestones'}
                      {tpl.proposedNote ? ` · ${tpl.proposedNote}` : ''}
                    </Text>
                    {!canApprove && (
                      <Text style={{ fontSize: 12, color: '#9BA8C0', fontStyle: 'italic' }}>
                        {isMastersProcess(tpl.processType)
                          ? (lang === 'he' ? 'ממתין לאישור ראש בית הספר ללימודי מוסמכים' : 'Awaiting grad school head approval')
                          : (lang === 'he' ? 'ממתין לאישור הפקולטה' : 'Awaiting faculty approval')}
                      </Text>
                    )}
                    {canApprove && (
                      <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
                        <Pressable
                          style={{ flex: 1, backgroundColor: '#10B981', borderRadius: 10, paddingVertical: 11, alignItems: 'center' }}
                          onPress={() => handleApprove(tpl)}
                          disabled={saving}
                        >
                          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>✅ {lang === 'he' ? 'אשר' : 'Approve'}</Text>
                        </Pressable>
                        <Pressable
                          style={{ flex: 1, backgroundColor: '#EF4444', borderRadius: 10, paddingVertical: 11, alignItems: 'center' }}
                          onPress={() => openRejectModal(tpl)}
                          disabled={saving}
                        >
                          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>❌ {lang === 'he' ? 'דחה' : 'Reject'}</Text>
                        </Pressable>
                      </View>
                    )}
                  </View>
                );
              })
            )}
          </>
        )}

        <View style={{ height: 60 }} />
      </ScrollView>
      </ResponsiveScreen>

      {/* ── Propose-version editor modal ── */}
      <Modal visible={editorOpen} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={{ flex: 1, backgroundColor: '#F8F7FF' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#F0EBFF' }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: '#1F1235' }}>
              {lang === 'he' ? '➕ הצעת גרסה חדשה' : '➕ Propose New Version'}
            </Text>
            <Pressable onPress={() => setEditorOpen(false)}>
              <Text style={{ fontSize: 20, color: '#8899BB' }}>✕</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ padding: 20 }}>
            <View style={{ backgroundColor: '#EDE9FE', borderRadius: 10, padding: 12, marginBottom: 16 }}>
              <Text style={{ fontSize: 13, color: '#5B21B6', fontWeight: '600' }}>
                🎓 {lang === 'he' ? PROCESS_TYPES.find((p) => p.key === activeProcessType)?.he : PROCESS_TYPES.find((p) => p.key === activeProcessType)?.en}
              </Text>
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151' }}>
                {lang === 'he' ? 'אבני דרך' : 'Milestones'} ({editorMilestones.length})
              </Text>
              <Pressable style={{ backgroundColor: '#7C3AED', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 }} onPress={() => openMilestoneEditor(null)}>
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>＋ {lang === 'he' ? 'הוסף' : 'Add'}</Text>
              </Pressable>
            </View>

            {editorMilestones.sort((a, b) => a.order - b.order).map((ms, idx) => (
              <View key={ms.type} style={{ flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#F5F3FF', borderRadius: 12, padding: 12, marginTop: 8, gap: 10 }}>
                <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: '#EDE9FE', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#7C3AED' }}>{idx + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#1F1235' }}>{lang === 'he' ? ms.nameHe : ms.nameEn}</Text>
                  <Text style={{ fontSize: 11, color: '#8899BB', marginTop: 2 }}>
                    📅 {lang === 'he' ? `יום ${ms.dueDaysFromStart}` : `Day ${ms.dueDaysFromStart}`}
                    {ms.requiresExaminers ? '  ·  👥' : ''}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <Pressable onPress={() => openMilestoneEditor(ms)} style={{ padding: 4 }}><Text>✏️</Text></Pressable>
                  <Pressable onPress={() => removeMilestoneRow(ms)} style={{ padding: 4 }}><Text>🗑️</Text></Pressable>
                </View>
              </View>
            ))}

            <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6, marginTop: 20 }}>
              {lang === 'he' ? 'הערה להצעה (אופציונלי)' : 'Note for this proposal (optional)'}
            </Text>
            <TextInput
              style={{ borderWidth: 1.5, borderColor: '#DDD6FE', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, backgroundColor: '#fff', color: '#111', minHeight: 70, textAlignVertical: 'top' }}
              value={editorNote}
              onChangeText={setEditorNote}
              placeholder={lang === 'he' ? 'למה מוצע השינוי...' : 'Why this change is proposed...'}
              textAlign={isRtl ? 'right' : 'left'}
              multiline
            />

            <Pressable
              style={[{ backgroundColor: '#7C3AED', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 24 }, saving && { opacity: 0.6 }]}
              onPress={handleSaveProposal}
              disabled={saving}
            >
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>{lang === 'he' ? 'שלח לאישור' : 'Submit for Approval'}</Text>}
            </Pressable>
            <Pressable style={{ borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 10 }} onPress={() => setEditorOpen(false)}>
              <Text style={{ color: '#8899BB', fontSize: 14 }}>{lang === 'he' ? 'ביטול' : 'Cancel'}</Text>
            </Pressable>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* ── Milestone row editor modal ── */}
      <Modal visible={msModalOpen} animationType="slide" presentationStyle="formSheet">
        <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#F0EBFF' }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: '#1F1235' }}>
              {editingMs ? (lang === 'he' ? '✏️ עריכת אבן דרך' : '✏️ Edit Milestone') : (lang === 'he' ? '➕ אבן דרך חדשה' : '➕ New Milestone')}
            </Text>
            <Pressable onPress={() => setMsModalOpen(false)}><Text style={{ fontSize: 20, color: '#8899BB' }}>✕</Text></Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: 20 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 }}>{lang === 'he' ? 'שם (עברית)' : 'Name (Hebrew)'}</Text>
            <TextInput style={{ borderWidth: 1.5, borderColor: '#DDD6FE', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, marginBottom: 12 }} value={msNameHe} onChangeText={setMsNameHe} placeholder="שם אבן הדרך" textAlign="right" />
            <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 }}>{lang === 'he' ? 'שם (אנגלית)' : 'Name (English)'}</Text>
            <TextInput style={{ borderWidth: 1.5, borderColor: '#DDD6FE', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, marginBottom: 12 }} value={msNameEn} onChangeText={setMsNameEn} placeholder="Milestone name" />
            <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 }}>{lang === 'he' ? 'מועד יעד (ימים מתחילת התהליך)' : 'Due (days from process start)'}</Text>
            <TextInput style={{ borderWidth: 1.5, borderColor: '#DDD6FE', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, marginBottom: 12 }} value={msDays} onChangeText={setMsDays} keyboardType="numeric" placeholder="90" />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151' }}>{lang === 'he' ? 'דורש בוחנים' : 'Requires examiners'}</Text>
              <Switch value={msExaminers} onValueChange={setMsExaminers} trackColor={{ true: '#7C3AED' }} />
            </View>
            <Pressable style={{ backgroundColor: '#7C3AED', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 24 }} onPress={saveMilestoneRow}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>{lang === 'he' ? 'שמור אבן דרך' : 'Save Milestone'}</Text>
            </Pressable>
            <Pressable style={{ borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 10 }} onPress={() => setMsModalOpen(false)}>
              <Text style={{ color: '#8899BB', fontSize: 14 }}>{lang === 'he' ? 'ביטול' : 'Cancel'}</Text>
            </Pressable>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* ── Reject-reason modal ── */}
      <Modal visible={rejectOpen} animationType="slide" presentationStyle="formSheet">
        <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#F0EBFF' }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: '#1F1235' }}>{lang === 'he' ? '❌ דחיית הצעה' : '❌ Reject Proposal'}</Text>
            <Pressable onPress={() => setRejectOpen(false)}><Text style={{ fontSize: 20, color: '#8899BB' }}>✕</Text></Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: 20 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 }}>{lang === 'he' ? 'סיבת הדחייה (חובה)' : 'Rejection reason (required)'}</Text>
            <TextInput
              style={{ borderWidth: 1.5, borderColor: '#DDD6FE', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, minHeight: 100, textAlignVertical: 'top' }}
              value={rejectReason}
              onChangeText={setRejectReason}
              placeholder={lang === 'he' ? 'הסבר מדוע ההצעה נדחתה...' : 'Explain why this proposal was rejected...'}
              textAlign={isRtl ? 'right' : 'left'}
              multiline
            />
            <Pressable
              style={[{ backgroundColor: '#EF4444', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 24 }, saving && { opacity: 0.6 }]}
              onPress={handleReject}
              disabled={saving}
            >
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>{lang === 'he' ? 'שלח דחייה' : 'Submit Rejection'}</Text>}
            </Pressable>
            <Pressable style={{ borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 10 }} onPress={() => setRejectOpen(false)}>
              <Text style={{ color: '#8899BB', fontSize: 14 }}>{lang === 'he' ? 'ביטול' : 'Cancel'}</Text>
            </Pressable>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}
