import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, Pressable, SafeAreaView,
  ActivityIndicator, Modal, TextInput, Alert, Switch,
} from 'react-native';

import { db, auth } from '../../src/firebase/firebase';
import { useRouter } from 'expo-router';
import type { Lang } from '../../components/i18n';
import { TopBar } from '../../components/shared';
import {facultyTemplateManager} from '../../constants'
import { apiClient } from '../../src/api/apiClient';
// ─── Types ────────────────────────────────────────────────────────────────────

export type DegreeType = 'bsc_project' | 'msc_thesis' | 'msc_project';

export interface MilestoneTemplateItem {
  id: string;               // local uuid within the template
  nameHe: string;
  nameEn: string;
  type: string;             // maps to system types or custom
  dueDaysFromStart: number; // e.g. 60 = due 60 days after project start
  requiredFiles: string[];  // labels like ['report', 'presentation']
  gradingCriteria: {
    key: string;
    heLabel: string;
    enLabel: string;
    maxScore: number;
  }[];
  supervisorWeight: number;   // 0–1
  examiner1Weight: number;
  examiner2Weight: number;
  requiresExaminers: boolean;
  order: number;
}

export interface MilestoneTemplate {
  id: string;
  facultyId: string;
  degreeType: DegreeType;
  nameHe: string;
  nameEn: string;
  milestones: MilestoneTemplateItem[];
  createdBy: string;
  status: 'active' | 'pending_approval' | 'rejected';
  proposedBy?: string;
  proposedByName?: string;
  proposedChanges?: Partial<MilestoneTemplate>;
  createdAt: any;
  updatedAt: any;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEGREE_TYPES: { key: DegreeType; he: string; en: string }[] = [
  { key: 'bsc_project', he: 'פרויקט תואר ראשון', en: 'B.Sc. Project' },
  { key: 'msc_thesis',  he: 'תזה תואר שני',       en: 'M.Sc. Thesis'  },
  { key: 'msc_project', he: 'פרויקט תואר שני',    en: 'M.Sc. Project' },
];

const DEFAULT_CRITERIA = [
  { key: 'understanding', heLabel: 'הבנת הנושא',   enLabel: 'Subject Understanding', maxScore: 25 },
  { key: 'methodology',   heLabel: 'מתודולוגיה',    enLabel: 'Methodology',           maxScore: 25 },
  { key: 'presentation',  heLabel: 'מצגת והצגה',    enLabel: 'Presentation',          maxScore: 25 },
  { key: 'answers',       heLabel: 'תשובות לשאלות', enLabel: 'Answers to Questions',  maxScore: 25 },
];

function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

function emptyMilestone(order: number): MilestoneTemplateItem {
  return {
    id: makeId(),
    nameHe: '',
    nameEn: '',
    type: 'custom',
    dueDaysFromStart: 90,
    requiredFiles: [],
    gradingCriteria: DEFAULT_CRITERIA,
    supervisorWeight: 0.4,
    examiner1Weight: 0.3,
    examiner2Weight: 0.3,
    requiresExaminers: false,
    order,
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function FacultyTemplateManager() {
  const router = useRouter();
  const [lang, setLang] = useState<Lang>('he');
  const isRtl = lang === 'he';

  const [adminName,    setAdminName]    = useState('');
  const [facultyId,    setFacultyId]    = useState('');
  const [loading,      setLoading]      = useState(true);
  const [unreadCount,  setUnreadCount]  = useState(0);
  const [templates,    setTemplates]    = useState<MilestoneTemplate[]>([]);
  const [pendingProps, setPendingProps] = useState<MilestoneTemplate[]>([]);
  const [activeTab,    setActiveTab]    = useState<'templates' | 'pending'>('templates');
  const [activeDegree, setActiveDegree] = useState<DegreeType>('bsc_project');
  const [saving,       setSaving]       = useState(false);

  // Editor modal
  const [editorOpen,   setEditorOpen]   = useState(false);
  const [editingTpl,   setEditingTpl]   = useState<MilestoneTemplate | null>(null);
  const [tplNameHe,    setTplNameHe]    = useState('');
  const [tplNameEn,    setTplNameEn]    = useState('');
  const [tplMilestones,setTplMilestones]= useState<MilestoneTemplateItem[]>([]);

  // Milestone editor inside the modal
  const [editingMs,    setEditingMs]    = useState<MilestoneTemplateItem | null>(null);
  const [msModal,      setMsModal]      = useState(false);
  // fields for milestone editor
  const [msNameHe,     setMsNameHe]     = useState('');
  const [msNameEn,     setMsNameEn]     = useState('');
  const [msDays,       setMsDays]       = useState('90');
  const [msFiles,      setMsFiles]      = useState('');   // comma-separated
  const [msExaminers,  setMsExaminers]  = useState(false);
  const [msWtSup,      setMsWtSup]      = useState('40');
  const [msWtEx1,      setMsWtEx1]      = useState('30');
  const [msWtEx2,      setMsWtEx2]      = useState('30');

  const uid = auth.currentUser?.uid;

  useEffect(() => {
    if (!uid) return;

    const loadAdminProfile = async () => {
      try {
        // 🚀 REPLACED: Get user document safely from Node.js token validation payload
        const response = await apiClient.get('/api/users/profile');
        const userData = response.data;

        setAdminName(userData.displayName || '');
        setFacultyId(userData.facultyId || '');
      } catch (err) {
        console.error('Failed loading admin context metadata profile:', err);
      }
    };

    loadAdminProfile();
  }, [uid]);


  // ── 2. Fetch Templates & Proposals (Runs once facultyId is resolved) ────
  useEffect(() => {
    if (!facultyId) return;

    const loadTemplatesAndProposals = async () => {
      try {
        setLoading(true);

        // 🚀 REPLACED: Calls centralized endpoint tracking active templates & pending submissions
        const response = await apiClient.get(`/api/faculty-templates/dashboard?facultyId=${facultyId}`);
        
        // Expected backend response properties: { activeTemplates: [...], pendingApprovals: [...] }
        setTemplates(response.data.activeTemplates || []);
        setPendingProps(response.data.pendingApprovals || []);
      } catch (err) {
        console.error('Failed compiling template records:', err);
      } finally {
        setLoading(false);
      }
    };

    loadTemplatesAndProposals();
  }, [facultyId]);


  // ── 3. Unread Notifications Count Badge ─────────────────────────────────
  useEffect(() => {
    if (!uid) return;

    const fetchNotificationBadges = async () => {
      try {
        // 🚀 REPLACED: Hits background telemetry metrics routine
        const response = await apiClient.get('/api/notifications/badge-count');
        setUnreadCount(response.data.unreadCount || 0);
      } catch (err) {
        console.log('Notification telemetry fetch failed:', err);
      }
    };

    fetchNotificationBadges();
    
    // Optional background optimization poll (e.g. refreshes every 30 seconds)
    const pollTimer = setInterval(fetchNotificationBadges, 30000);
    return () => clearInterval(pollTimer);
  }, [uid]);

  // ── Open editor ────────────────────────────────────────────────────────
  const openNewTemplate = () => {
    setEditingTpl(null);
    setTplNameHe('');
    setTplNameEn('');
    setTplMilestones([emptyMilestone(1)]);
    setEditorOpen(true);
  };

  const openEditTemplate = (tpl: MilestoneTemplate) => {
    setEditingTpl(tpl);
    setTplNameHe(tpl.nameHe);
    setTplNameEn(tpl.nameEn);
    setTplMilestones([...tpl.milestones]);
    setEditorOpen(true);
  };

  // ── Save template ──────────────────────────────────────────────────────
  const handleSaveTemplate = async () => {
    if (!tplNameHe.trim() || !tplNameEn.trim()) {
      Alert.alert(
        lang === 'he' ? 'שגיאה' : 'Error',
        lang === 'he' ? 'יש להזין שם לתבנית' : 'Please enter a template name'
      );
      return;
    }
    if (tplMilestones.length === 0) {
      Alert.alert(
        lang === 'he' ? 'שגיאה' : 'Error',
        lang === 'he' ? 'יש להוסיף לפחות אבן דרך אחת' : 'Add at least one milestone'
      );
      return;
    }

    setSaving(true);
    try {
      // 🚀 Clean up payload data structure (Server automatically manages timestamps!)
      const payload = {
        facultyId,
        degreeType: activeDegree,
        nameHe: tplNameHe.trim(),
        nameEn: tplNameEn.trim(),
        milestones: tplMilestones,
        createdBy: uid,
        status: 'active',
      };

      if (editingTpl) {
        // 🚀 REPLACED: updateDoc turned into a secure backend PUT request
        await apiClient.put(`/api/faculty-templates/${editingTpl.id}`, payload);

        // 💡 OPTIMIZATION: Instantly update your local UI list state array with edited changes
        setTemplates((prev) =>
          prev.map((item) =>
            item.id === editingTpl.id 
              ? ({ ...item, ...payload } as MilestoneTemplate) 
              : item
          )
        );
      } else {
        // 🚀 REPLACED: addDoc turned into a secure backend POST request
        const response = await apiClient.post('/api/faculty-templates', payload);
        
        // 💡 OPTIMIZATION: Prepend the new template returned by your backend (including its new generated ID) 
        if (response.data && response.data.template) {
          setTemplates((prev) => [response.data.template, ...prev]);
        }
      }

      setEditorOpen(false);
      Alert.alert('✅', lang === 'he' ? 'התבנית נשמרה' : 'Template saved');
    } catch (e: any) {
      console.error('Error saving template:', e);
      Alert.alert(
        '❌',
        e.response?.data?.error || (lang === 'he' ? 'שגיאה בשמירת התבנית' : 'Failed to save template')
      );
    } finally {
      setSaving(false);
    }
  };

  // ── Delete template ────────────────────────────────────────────────────
  const handleDelete = (tpl: MilestoneTemplate) => {
    Alert.alert(
      lang === 'he' ? 'מחיקת תבנית' : 'Delete Template',
      lang === 'he' ? 'האם אתה בטוח?' : 'Are you sure?',
      [
        { text: lang === 'he' ? 'ביטול' : 'Cancel', style: 'cancel' },
        {
          text: lang === 'he' ? 'מחק' : 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              // 🚀 REPLACED: Direct deleteDoc turned into a secure HTTP DELETE request
              await apiClient.delete(`/api/faculty-templates/${tpl.id}`);

              // 💡 OPTIMIZATION: Update the screen state automatically 
              // so the deleted template element vanishes from the layout view instantly!
              setTemplates((prev) => prev.filter((item) => item.id !== tpl.id));

              Alert.alert('✅', lang === 'he' ? 'התבנית נמחקה בהצלחה' : 'Template deleted successfully');
            } catch (err: any) {
              console.error("Delete operation failure:", err);
              Alert.alert(
                '❌', 
                err.response?.data?.error || (lang === 'he' ? 'מחיקת התבנית נכשלה' : 'Failed to delete template')
              );
            }
          },
        },
      ],
    );
  };

  // ── Approve / reject supervisor proposal ──────────────────────────────
  const handleApproveProposal = async (tpl: MilestoneTemplate) => {
    if (!tpl.proposedChanges) return;
    setSaving(true);
    try {
      // 🚀 REPLACED: Combined updateDoc and notification addDoc into one secure server call
      await apiClient.post(`/api/faculty-templates/proposals/${tpl.id}/approve`, {
        proposedChanges: tpl.proposedChanges,
        proposedBy: tpl.proposedBy,
        nameHe: tpl.nameHe,
        nameEn: tpl.nameEn
      });

      Alert.alert('✅', lang === 'he' ? 'הצעה אושרה' : 'Proposal approved');
      
      // 💡 If you have a local state refreshing function (like loadTemplates), call it here:
      setPendingProps((prev) => prev.filter((item) => item.id !== tpl.id));
    } catch (e: any) { 
      console.error(e); 
      Alert.alert('❌', e.response?.data?.error || (lang === 'he' ? 'שגיאה באישור ההצעה' : 'Error approving proposal'));
    } finally { 
      setSaving(false); 
    }
  };

  const handleRejectProposal = async (tpl: MilestoneTemplate) => {
    setSaving(true);
    try {
      // 🚀 REPLACED: Handled securely via a clean server-side resolution route
      await apiClient.post(`/api/faculty-templates/proposals/${tpl.id}/reject`, {
        proposedBy: tpl.proposedBy,
        nameHe: tpl.nameHe,
        nameEn: tpl.nameEn
      });

      Alert.alert('✅', lang === 'he' ? 'הצעה נדחתה' : 'Proposal rejected');
      
      // 💡 If you have a local state refreshing function, call it here:
      setPendingProps((prev) => prev.filter((item) => item.id !== tpl.id));

    } catch (e: any) { 
      console.error(e); 
      Alert.alert('❌', e.response?.data?.error || (lang === 'he' ? 'שגיאה בדחיית ההצעה' : 'Error rejecting proposal'));
    } finally { 
      setSaving(false); 
    }
  };

  // ── Milestone editor ───────────────────────────────────────────────────
  const openMilestoneEditor = (ms: MilestoneTemplateItem | null) => {
    if (ms) {
      setEditingMs(ms);
      setMsNameHe(ms.nameHe);
      setMsNameEn(ms.nameEn);
      setMsDays(String(ms.dueDaysFromStart));
      setMsFiles(ms.requiredFiles.join(', '));
      setMsExaminers(ms.requiresExaminers);
      setMsWtSup(String(Math.round(ms.supervisorWeight * 100)));
      setMsWtEx1(String(Math.round(ms.examiner1Weight * 100)));
      setMsWtEx2(String(Math.round(ms.examiner2Weight * 100)));
    } else {
      setEditingMs(null);
      setMsNameHe(''); setMsNameEn('');
      setMsDays('90'); setMsFiles('');
      setMsExaminers(false);
      setMsWtSup('100'); setMsWtEx1('0'); setMsWtEx2('0');
    }
    setMsModal(true);
  };

  const saveMilestone = () => {
    if (!msNameHe.trim() || !msNameEn.trim()) {
      Alert.alert(lang === 'he' ? 'שגיאה' : 'Error',
        lang === 'he' ? 'יש להזין שם לאבן הדרך' : 'Enter a milestone name');
      return;
    }
    const wtSup = parseFloat(msWtSup) || 0;
    const wtEx1 = parseFloat(msWtEx1) || 0;
    const wtEx2 = parseFloat(msWtEx2) || 0;
    if (Math.abs(wtSup + wtEx1 + wtEx2 - 100) > 0.5) {
      Alert.alert(lang === 'he' ? 'שגיאה' : 'Error',
        lang === 'he' ? 'סך המשקלות חייב להיות 100%' : 'Weights must sum to 100%');
      return;
    }
    const updated: MilestoneTemplateItem = {
      id: editingMs?.id ?? makeId(),
      nameHe: msNameHe.trim(),
      nameEn: msNameEn.trim(),
      type: 'custom',
      dueDaysFromStart: parseInt(msDays) || 90,
      requiredFiles: msFiles.split(',').map((f) => f.trim()).filter(Boolean),
      gradingCriteria: DEFAULT_CRITERIA,
      supervisorWeight: wtSup / 100,
      examiner1Weight:  wtEx1 / 100,
      examiner2Weight:  wtEx2 / 100,
      requiresExaminers: msExaminers,
      order: editingMs?.order ?? tplMilestones.length + 1,
    };
    if (editingMs) {
      setTplMilestones((prev) => prev.map((m) => m.id === editingMs.id ? updated : m));
    } else {
      setTplMilestones((prev) => [...prev, updated]);
    }
    setMsModal(false);
  };

  const removeMilestone = (id: string) => {
    setTplMilestones((prev) => prev.filter((m) => m.id !== id));
  };

  // ── Active template for this degree type ──────────────────────────────
  const degreeTemplates = templates.filter((t) => t.degreeType === activeDegree);

  if (loading) {
    return (
      <View style={s.centered}>
        <ActivityIndicator size="large" color="#7C3AED" />
      </View>
    );
  }

  return (
    <SafeAreaView style={s.root}>
      <TopBar
        name={adminName}
        role="faculty_admin"
        lang={lang}
        isRtl={isRtl}
        unreadCount={unreadCount}
        onToggleLang={() => setLang(lang === 'he' ? 'en' : 'he')}
        onBell={() => router.push('/(tabs)/notifications')}
      />

      {/* ── Main tabs ── */}
      <View style={s.tabBar}>
        {([
          { key: 'templates', he: 'תבניות אבני דרך', en: 'Milestone Templates', badge: 0 },
          { key: 'pending',   he: 'הצעות ממתינות',   en: 'Pending Proposals',   badge: pendingProps.length },
        ] as const).map((tab) => (
          <Pressable
            key={tab.key}
            style={[s.tab, activeTab === tab.key && s.tabActive]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Text style={[s.tabText, activeTab === tab.key && s.tabTextActive]}>
              {lang === 'he' ? tab.he : tab.en}
            </Text>
            {tab.badge > 0 && (
              <View style={s.badge}><Text style={s.badgeText}>{tab.badge}</Text></View>
            )}
          </Pressable>
        ))}
      </View>

      <ScrollView contentContainerStyle={s.content}>

        {/* ════════ TEMPLATES TAB ════════ */}
        {activeTab === 'templates' && (
          <>
            {/* Degree type selector */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.degreeBar}>
              {DEGREE_TYPES.map((dt) => (
                <Pressable
                  key={dt.key}
                  style={[s.degreeChip, activeDegree === dt.key && s.degreeChipActive]}
                  onPress={() => setActiveDegree(dt.key)}
                >
                  <Text style={[s.degreeChipText, activeDegree === dt.key && s.degreeChipTextActive]}>
                    {lang === 'he' ? dt.he : dt.en}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            {/* New template button */}
            <Pressable style={s.newBtn} onPress={openNewTemplate}>
              <Text style={s.newBtnText}>
                ＋ {lang === 'he' ? 'תבנית חדשה' : 'New Template'}
              </Text>
            </Pressable>

            {degreeTemplates.length === 0 ? (
              <View style={s.empty}>
                <Text style={s.emptyEmoji}>📋</Text>
                <Text style={s.emptyText}>
                  {lang === 'he'
                    ? 'אין תבנית לסוג תואר זה. הפקולטה תשתמש בתבנית הגלובלית.'
                    : 'No template for this degree type. Global template will be used.'}
                </Text>
              </View>
            ) : (
              degreeTemplates.map((tpl) => (
                <View key={tpl.id} style={s.tplCard}>
                  <View style={s.tplCardHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.tplName}>
                        {lang === 'he' ? tpl.nameHe : tpl.nameEn}
                      </Text>
                      <Text style={s.tplSub}>
                        {tpl.milestones.length}{' '}
                        {lang === 'he' ? 'אבני דרך' : 'milestones'}
                      </Text>
                    </View>
                    <View style={s.tplActions}>
                      <Pressable style={s.editBtn} onPress={() => openEditTemplate(tpl)}>
                        <Text style={s.editBtnText}>✏️</Text>
                      </Pressable>
                      <Pressable style={s.deleteBtn} onPress={() => handleDelete(tpl)}>
                        <Text style={s.deleteBtnText}>🗑️</Text>
                      </Pressable>
                    </View>
                  </View>

                  {/* Milestone list preview */}
                  {tpl.milestones
                    .sort((a, b) => a.order - b.order)
                    .map((ms, idx) => (
                      <View key={ms.id} style={s.msPreviewRow}>
                        <View style={s.msOrderBadge}>
                          <Text style={s.msOrderText}>{idx + 1}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={s.msPreviewName}>
                            {lang === 'he' ? ms.nameHe : ms.nameEn}
                          </Text>
                          <Text style={s.msPreviewMeta}>
                            📅 {lang === 'he' ? `יום ${ms.dueDaysFromStart}` : `Day ${ms.dueDaysFromStart}`}
                            {ms.requiredFiles.length > 0
                              ? `  ·  📎 ${ms.requiredFiles.join(', ')}`
                              : ''}
                            {ms.requiresExaminers
                              ? `  ·  👥 ${lang === 'he' ? 'בוחנים' : 'Examiners'}`
                              : ''}
                          </Text>
                        </View>
                      </View>
                    ))}
                </View>
              ))
            )}
          </>
        )}

        {/* ════════ PENDING PROPOSALS TAB ════════ */}
        {activeTab === 'pending' && (
          <>
            {pendingProps.length === 0 ? (
              <View style={s.empty}>
                <Text style={s.emptyEmoji}>✅</Text>
                <Text style={s.emptyText}>
                  {lang === 'he' ? 'אין הצעות ממתינות לאישור' : 'No pending proposals'}
                </Text>
              </View>
            ) : (
              pendingProps.map((tpl) => (
                <View key={tpl.id} style={s.proposalCard}>
                  <View style={s.proposalHeader}>
                    <Text style={s.proposalTitle}>
                      {lang === 'he' ? tpl.nameHe : tpl.nameEn}
                    </Text>
                    <View style={s.pendingBadge}>
                      <Text style={s.pendingBadgeText}>
                        {lang === 'he' ? 'ממתין' : 'Pending'}
                      </Text>
                    </View>
                  </View>

                  <Text style={s.proposalBy}>
                    👤 {lang === 'he' ? 'הוצע על ידי:' : 'Proposed by:'}{' '}
                    {tpl.proposedByName ?? tpl.proposedBy}
                  </Text>

                  <Text style={s.proposalDegree}>
                    🎓 {DEGREE_TYPES.find((d) => d.key === tpl.degreeType)?.[lang] ?? tpl.degreeType}
                  </Text>

                  {/* Show proposed changes summary */}
                  {tpl.proposedChanges?.milestones && (
                    <View style={s.changesBox}>
                      <Text style={s.changesTitle}>
                        {lang === 'he' ? '📝 שינויים מוצעים:' : '📝 Proposed changes:'}
                      </Text>
                      <Text style={s.changesText}>
                        {tpl.proposedChanges.milestones.length}{' '}
                        {lang === 'he' ? 'אבני דרך' : 'milestones'}
                        {' · '}
                        {lang === 'he' ? 'לעומת' : 'vs'}{' '}
                        {tpl.milestones.length}{' '}
                        {lang === 'he' ? 'קיימות' : 'current'}
                      </Text>
                      {tpl.proposedChanges.milestones.map((ms, i) => (
                        <Text key={i} style={s.changesItem}>
                          • {lang === 'he' ? ms.nameHe : ms.nameEn}
                          {' — '}
                          {lang === 'he' ? `יום ${ms.dueDaysFromStart}` : `Day ${ms.dueDaysFromStart}`}
                        </Text>
                      ))}
                    </View>
                  )}

                  <View style={s.proposalBtns}>
                    <Pressable
                      style={s.approveBtn}
                      onPress={() => handleApproveProposal(tpl)}
                      disabled={saving}
                    >
                      <Text style={s.approveBtnText}>
                        ✅ {lang === 'he' ? 'אשר' : 'Approve'}
                      </Text>
                    </Pressable>
                    <Pressable
                      style={s.rejectBtn}
                      onPress={() => handleRejectProposal(tpl)}
                      disabled={saving}
                    >
                      <Text style={s.rejectBtnText}>
                        ❌ {lang === 'he' ? 'דחה' : 'Reject'}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              ))
            )}
          </>
        )}

        <View style={{ height: 80 }} />
      </ScrollView>

      {/* ════════ TEMPLATE EDITOR MODAL ════════ */}
      <Modal visible={editorOpen} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={{ flex: 1, backgroundColor: '#F8F7FF' }}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>
              {editingTpl
                ? (lang === 'he' ? '✏️ עריכת תבנית' : '✏️ Edit Template')
                : (lang === 'he' ? '➕ תבנית חדשה'  : '➕ New Template')}
            </Text>
            <Pressable onPress={() => setEditorOpen(false)}>
              <Text style={s.modalClose}>✕</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={s.modalContent}>
            {/* Degree type display */}
            <View style={s.infoBox}>
              <Text style={s.infoBoxText}>
                🎓 {DEGREE_TYPES.find((d) => d.key === activeDegree)?.[lang]}
              </Text>
            </View>

            {/* Template name */}
            <Text style={s.fieldLabel}>{lang === 'he' ? 'שם התבנית (עברית)' : 'Template Name (Hebrew)'}</Text>
            <TextInput
              style={s.input}
              value={tplNameHe}
              onChangeText={setTplNameHe}
              placeholder="שם התבנית"
              textAlign="right"
            />

            <Text style={s.fieldLabel}>{lang === 'he' ? 'שם התבנית (אנגלית)' : 'Template Name (English)'}</Text>
            <TextInput
              style={s.input}
              value={tplNameEn}
              onChangeText={setTplNameEn}
              placeholder="Template name"
            />

            {/* Milestones list */}
            <View style={s.msSectionHeader}>
              <Text style={s.fieldLabel}>
                {lang === 'he' ? 'אבני דרך' : 'Milestones'} ({tplMilestones.length})
              </Text>
              <Pressable style={s.addMsBtn} onPress={() => openMilestoneEditor(null)}>
                <Text style={s.addMsBtnText}>＋ {lang === 'he' ? 'הוסף' : 'Add'}</Text>
              </Pressable>
            </View>

            {tplMilestones
              .sort((a, b) => a.order - b.order)
              .map((ms, idx) => (
                <View key={ms.id} style={s.msEditorRow}>
                  <View style={s.msOrderBadge}>
                    <Text style={s.msOrderText}>{idx + 1}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.msEditorName}>
                      {lang === 'he' ? ms.nameHe : ms.nameEn}
                    </Text>
                    <Text style={s.msEditorMeta}>
                      📅 {lang === 'he' ? `יום ${ms.dueDaysFromStart}` : `Day ${ms.dueDaysFromStart}`}
                      {ms.requiredFiles.length > 0 ? `  ·  📎 ${ms.requiredFiles.join(', ')}` : ''}
                      {ms.requiresExaminers ? `  ·  👥` : ''}
                    </Text>
                    <Text style={s.msWeightsText}>
                      {lang === 'he' ? 'מנחה' : 'Sup'}: {Math.round(ms.supervisorWeight * 100)}%
                      {ms.requiresExaminers
                        ? `  ·  E1: ${Math.round(ms.examiner1Weight * 100)}%  ·  E2: ${Math.round(ms.examiner2Weight * 100)}%`
                        : ''}
                    </Text>
                  </View>
                  <View style={s.msRowActions}>
                    <Pressable onPress={() => openMilestoneEditor(ms)} style={s.msActionBtn}>
                      <Text>✏️</Text>
                    </Pressable>
                    <Pressable onPress={() => removeMilestone(ms.id)} style={s.msActionBtn}>
                      <Text>🗑️</Text>
                    </Pressable>
                  </View>
                </View>
              ))}

            {/* Save */}
            <Pressable
              style={[s.saveBtn, saving && { opacity: 0.6 }]}
              onPress={handleSaveTemplate}
              disabled={saving}
            >
              {saving
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.saveBtnText}>
                    {lang === 'he' ? 'שמור תבנית' : 'Save Template'}
                  </Text>}
            </Pressable>

            <Pressable style={s.cancelBtn} onPress={() => setEditorOpen(false)}>
              <Text style={s.cancelBtnText}>{lang === 'he' ? 'ביטול' : 'Cancel'}</Text>
            </Pressable>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* ════════ MILESTONE EDITOR MODAL ════════ */}
      <Modal visible={msModal} animationType="slide" presentationStyle="formSheet">
        <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>
              {editingMs
                ? (lang === 'he' ? '✏️ עריכת אבן דרך' : '✏️ Edit Milestone')
                : (lang === 'he' ? '➕ אבן דרך חדשה'  : '➕ New Milestone')}
            </Text>
            <Pressable onPress={() => setMsModal(false)}>
              <Text style={s.modalClose}>✕</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={s.modalContent}>
            <Text style={s.fieldLabel}>{lang === 'he' ? 'שם (עברית)' : 'Name (Hebrew)'}</Text>
            <TextInput style={s.input} value={msNameHe} onChangeText={setMsNameHe}
              placeholder="שם אבן הדרך" textAlign="right" />

            <Text style={s.fieldLabel}>{lang === 'he' ? 'שם (אנגלית)' : 'Name (English)'}</Text>
            <TextInput style={s.input} value={msNameEn} onChangeText={setMsNameEn}
              placeholder="Milestone name" />

            <Text style={s.fieldLabel}>
              {lang === 'he' ? 'מועד הגשה (ימים מתחילת הפרויקט)' : 'Due (days from project start)'}
            </Text>
            <TextInput style={s.input} value={msDays} onChangeText={setMsDays}
              keyboardType="numeric" placeholder="90" />

            <Text style={s.fieldLabel}>
              {lang === 'he' ? 'קבצים נדרשים (מופרדים בפסיק)' : 'Required files (comma-separated)'}
            </Text>
            <TextInput style={s.input} value={msFiles} onChangeText={setMsFiles}
              placeholder={lang === 'he' ? 'דוח, מצגת, קוד' : 'report, presentation, code'} />

            {/* Requires examiners toggle */}
            <View style={s.toggleRow}>
              <Text style={s.fieldLabel}>
                {lang === 'he' ? 'דורש בוחנים חיצוניים' : 'Requires external examiners'}
              </Text>
              <Switch value={msExaminers} onValueChange={setMsExaminers}
                trackColor={{ true: '#7C3AED' }} />
            </View>

            {/* Grade weights */}
            <Text style={s.fieldLabel}>
              {lang === 'he' ? 'משקלות ציון (סה"כ 100%)' : 'Grade weights (must total 100%)'}
            </Text>

            {[
              { label: lang === 'he' ? 'מנחה (%)' : 'Supervisor (%)', value: msWtSup, set: setMsWtSup },
              ...(msExaminers ? [
                { label: lang === 'he' ? 'בוחן 1 (%)' : 'Examiner 1 (%)', value: msWtEx1, set: setMsWtEx1 },
                { label: lang === 'he' ? 'בוחן 2 (%)' : 'Examiner 2 (%)', value: msWtEx2, set: setMsWtEx2 },
              ] : []),
            ].map((f) => (
              <View key={f.label} style={s.weightRow}>
                <Text style={s.weightRowLabel}>{f.label}</Text>
                <TextInput style={s.weightInput} value={f.value}
                  onChangeText={f.set} keyboardType="numeric" />
              </View>
            ))}

            {/* Weight total indicator */}
            {(() => {
              const total = (parseFloat(msWtSup) || 0)
                + (msExaminers ? (parseFloat(msWtEx1) || 0) + (parseFloat(msWtEx2) || 0) : 0);
              const ok = Math.abs(total - 100) < 0.5;
              return (
                <Text style={[s.weightTotal, { color: ok ? '#10B981' : '#EF4444' }]}>
                  {lang === 'he' ? 'סה"כ:' : 'Total:'} {total}% {ok ? '✓' : '(must be 100%)'}
                </Text>
              );
            })()}

            <Pressable style={s.saveBtn} onPress={saveMilestone}>
              <Text style={s.saveBtnText}>
                {lang === 'he' ? 'שמור אבן דרך' : 'Save Milestone'}
              </Text>
            </Pressable>

            <Pressable style={s.cancelBtn} onPress={() => setMsModal(false)}>
              <Text style={s.cancelBtnText}>{lang === 'he' ? 'ביטול' : 'Cancel'}</Text>
            </Pressable>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = facultyTemplateManager;