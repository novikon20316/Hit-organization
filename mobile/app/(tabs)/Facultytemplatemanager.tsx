import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable,
  ActivityIndicator, Modal, TextInput, Alert,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context'
import { auth } from '../../src/firebase/firebase';
import { useRouter } from 'expo-router';
import type { Lang } from '../../components/i18n';
import { TopBar } from '../../components/shared';
import {facultyTemplateManager} from '../../constants'
import { apiClient } from '../../src/api/apiClient';

// ─── Types ────────────────────────────────────────────────────────────────────
// Matches the real backend schema (server/src/controllers/facultyTemplateController.ts)
// — a project/thesis proposal catalog entry, not a milestone template.

export type TemplateDegree = 'bachelors' | 'masters';
export type TemplateType = 'project' | 'thesis';
export type TemplateStatus = 'approved' | 'published' | 'pending' | 'rejected';

export interface FacultyTemplate {
  id: string;
  facultyId: string;
  titleHe: string;
  titleEn: string;
  descriptionHe: string;
  descriptionEn: string;
  skills: string;
  degree: TemplateDegree;
  type: TemplateType;
  supervisorId: string;
  createdBy: string;
  status: TemplateStatus;
  rejectionReason?: string;
  createdAt: any;
  updatedAt: any;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEGREES: { key: TemplateDegree; he: string; en: string }[] = [
  { key: 'bachelors', he: 'תואר ראשון', en: "Bachelor's" },
  { key: 'masters',   he: 'תואר שני',   en: "Master's"   },
];

const TYPES: { key: TemplateType; he: string; en: string }[] = [
  { key: 'project', he: 'פרויקט', en: 'Project' },
  { key: 'thesis',  he: 'תזה',    en: 'Thesis'  },
];

function degreeLabel(degree: TemplateDegree, lang: Lang): string {
  return DEGREES.find((d) => d.key === degree)?.[lang] ?? degree;
}
function typeLabel(type: TemplateType, lang: Lang): string {
  return TYPES.find((t) => t.key === type)?.[lang] ?? type;
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
  const [templates,    setTemplates]    = useState<FacultyTemplate[]>([]);
  const [pendingProps, setPendingProps] = useState<FacultyTemplate[]>([]);
  const [activeTab,    setActiveTab]    = useState<'templates' | 'pending'>('templates');
  const [saving,       setSaving]       = useState(false);

  // Editor modal
  const [editorOpen,        setEditorOpen]        = useState(false);
  const [editingTpl,        setEditingTpl]        = useState<FacultyTemplate | null>(null);
  const [tplTitleHe,        setTplTitleHe]        = useState('');
  const [tplTitleEn,        setTplTitleEn]        = useState('');
  const [tplDescriptionHe,  setTplDescriptionHe]  = useState('');
  const [tplDescriptionEn,  setTplDescriptionEn]  = useState('');
  const [tplSkills,         setTplSkills]         = useState('');
  const [tplDegree,         setTplDegree]         = useState<TemplateDegree>('bachelors');
  const [tplType,           setTplType]           = useState<TemplateType>('project');

  // Reject-reason modal (rejectTemplateProposal requires a reason)
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectingTpl,    setRejectingTpl]    = useState<FacultyTemplate | null>(null);
  const [rejectReason,    setRejectReason]    = useState('');

  const uid = auth.currentUser?.uid;

  useEffect(() => {
    if (!uid) return;

    const loadAdminProfile = async () => {
      try {
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

  // ── Fetch templates & proposals — also called after every save/delete/
  //    approve/reject so state always reflects real Firestore data. ────────
  const loadTemplatesAndProposals = useCallback(async () => {
    if (!facultyId) return;
    try {
      setLoading(true);
      const response = await apiClient.get(`/api/faculty-templates/dashboard?facultyId=${facultyId}`);
      // Real response shape: { facultyId, templates, proposals, counts }
      setTemplates(response.data.templates || []);
      setPendingProps(response.data.proposals || []);
    } catch (err) {
      console.error('Failed compiling template records:', err);
    } finally {
      setLoading(false);
    }
  }, [facultyId]);

  useEffect(() => {
    loadTemplatesAndProposals();
  }, [loadTemplatesAndProposals]);

  // ── Unread Notifications Count Badge ─────────────────────────────────
  useEffect(() => {
    if (!uid) return;

    const fetchNotificationBadges = async () => {
      try {
        const response = await apiClient.get('/api/notifications/badge-count');
        setUnreadCount(response.data.unreadCount || 0);
      } catch (err) {
        console.log('Notification telemetry fetch failed:', err);
      }
    };

    fetchNotificationBadges();
    const pollTimer = setInterval(fetchNotificationBadges, 30000);
    return () => clearInterval(pollTimer);
  }, [uid]);

  // ── Open editor ────────────────────────────────────────────────────────
  const openNewTemplate = () => {
    setEditingTpl(null);
    setTplTitleHe('');
    setTplTitleEn('');
    setTplDescriptionHe('');
    setTplDescriptionEn('');
    setTplSkills('');
    setTplDegree('bachelors');
    setTplType('project');
    setEditorOpen(true);
  };

  const openEditTemplate = (tpl: FacultyTemplate) => {
    setEditingTpl(tpl);
    setTplTitleHe(tpl.titleHe);
    setTplTitleEn(tpl.titleEn);
    setTplDescriptionHe(tpl.descriptionHe ?? '');
    setTplDescriptionEn(tpl.descriptionEn ?? '');
    setTplSkills(tpl.skills ?? '');
    setTplDegree(tpl.degree);
    setTplType(tpl.type);
    setEditorOpen(true);
  };

  // ── Save template ──────────────────────────────────────────────────────
  const handleSaveTemplate = async () => {
    if (!tplTitleHe.trim() || !tplTitleEn.trim()) {
      Alert.alert(
        lang === 'he' ? 'שגיאה' : 'Error',
        lang === 'he' ? 'יש להזין כותרת לתבנית' : 'Please enter a template title'
      );
      return;
    }

    setSaving(true);
    try {
      // Matches createFacultyTemplate/updateFacultyTemplate's actual schema —
      // facultyId/createdBy/status are derived server-side, not sent here.
      const payload = {
        titleHe: tplTitleHe.trim(),
        titleEn: tplTitleEn.trim(),
        descriptionHe: tplDescriptionHe.trim(),
        descriptionEn: tplDescriptionEn.trim(),
        skills: tplSkills.trim(),
        degree: tplDegree,
        type: tplType,
      };

      if (editingTpl) {
        await apiClient.put(`/api/faculty-templates/${editingTpl.id}`, payload);
      } else {
        await apiClient.post('/api/faculty-templates', payload);
      }

      setEditorOpen(false);
      Alert.alert('✅', lang === 'he' ? 'התבנית נשמרה' : 'Template saved');
      await loadTemplatesAndProposals();
    } catch (e: any) {
      console.error('Error saving template:', e);
      Alert.alert(
        '❌',
        e.response?.data?.message || (lang === 'he' ? 'שגיאה בשמירת התבנית' : 'Failed to save template')
      );
    } finally {
      setSaving(false);
    }
  };

  // ── Delete template ────────────────────────────────────────────────────
  const handleDelete = (tpl: FacultyTemplate) => {
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
              await apiClient.delete(`/api/faculty-templates/${tpl.id}`);
              Alert.alert('✅', lang === 'he' ? 'התבנית נמחקה בהצלחה' : 'Template deleted successfully');
              await loadTemplatesAndProposals();
            } catch (err: any) {
              console.error("Delete operation failure:", err);
              Alert.alert(
                '❌',
                err.response?.data?.message || (lang === 'he' ? 'מחיקת התבנית נכשלה' : 'Failed to delete template')
              );
            }
          },
        },
      ],
    );
  };

  // ── Approve / reject supervisor proposal ──────────────────────────────
  const handleApproveProposal = async (tpl: FacultyTemplate) => {
    setSaving(true);
    try {
      await apiClient.post(`/api/faculty-templates/proposals/${tpl.id}/approve`, {});
      Alert.alert('✅', lang === 'he' ? 'הצעה אושרה' : 'Proposal approved');
      await loadTemplatesAndProposals();
    } catch (e: any) {
      console.error(e);
      Alert.alert('❌', e.response?.data?.message || (lang === 'he' ? 'שגיאה באישור ההצעה' : 'Error approving proposal'));
    } finally {
      setSaving(false);
    }
  };

  const openRejectModal = (tpl: FacultyTemplate) => {
    setRejectingTpl(tpl);
    setRejectReason('');
    setRejectModalOpen(true);
  };

  const handleRejectProposal = async () => {
    if (!rejectingTpl) return;
    if (!rejectReason.trim()) {
      Alert.alert(
        lang === 'he' ? 'שגיאה' : 'Error',
        lang === 'he' ? 'יש להזין סיבת דחייה' : 'A rejection reason is required'
      );
      return;
    }
    setSaving(true);
    try {
      // rejectTemplateProposal requires { reason } in the body.
      await apiClient.post(`/api/faculty-templates/proposals/${rejectingTpl.id}/reject`, {
        reason: rejectReason.trim(),
      });
      Alert.alert('✅', lang === 'he' ? 'הצעה נדחתה' : 'Proposal rejected');
      setRejectModalOpen(false);
      setRejectingTpl(null);
      await loadTemplatesAndProposals();
    } catch (e: any) {
      console.error(e);
      Alert.alert('❌', e.response?.data?.message || (lang === 'he' ? 'שגיאה בדחיית ההצעה' : 'Error rejecting proposal'));
    } finally {
      setSaving(false);
    }
  };

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
        onToggleLang={() => setLang(lang === 'he' ? 'en' : 'he')}
      />

      {/* ── Main tabs ── */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabBar}>
        {([
          { key: 'templates', he: 'תבניות פרויקט',  en: 'Project Templates', badge: 0 },
          { key: 'pending',   he: 'הצעות ממתינות',   en: 'Pending Proposals', badge: pendingProps.length },
        ] as const).map((tab) => (
          <Pressable
            key={tab.key}
            style={[s.tab, activeTab === tab.key && s.tabActive]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Text style={[s.tabText, activeTab === tab.key && s.tabTextActive]} numberOfLines={1}>
              {lang === 'he' ? tab.he : tab.en}
            </Text>
            {tab.badge > 0 && (
              <View style={s.badge}><Text style={s.badgeText}>{tab.badge}</Text></View>
            )}
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={s.content}>

        {/* ════════ TEMPLATES TAB ════════ */}
        {activeTab === 'templates' && (
          <>
            {/* New template button */}
            <Pressable style={s.newBtn} onPress={openNewTemplate}>
              <Text style={s.newBtnText}>
                ＋ {lang === 'he' ? 'תבנית חדשה' : 'New Template'}
              </Text>
            </Pressable>

            {templates.length === 0 ? (
              <View style={s.empty}>
                <Text style={s.emptyEmoji}>📋</Text>
                <Text style={s.emptyText}>
                  {lang === 'he'
                    ? 'אין תבניות פרויקט לפקולטה זו עדיין.'
                    : 'No project templates for this faculty yet.'}
                </Text>
              </View>
            ) : (
              templates.map((tpl) => (
                <View key={tpl.id} style={s.tplCard}>
                  <View style={s.tplCardHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.tplName}>
                        {lang === 'he' ? tpl.titleHe : tpl.titleEn}
                      </Text>
                      <Text style={s.tplSub}>
                        {degreeLabel(tpl.degree, lang)} · {typeLabel(tpl.type, lang)}
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

                  {(lang === 'he' ? tpl.descriptionHe : tpl.descriptionEn) ? (
                    <Text style={s.msPreviewMeta} numberOfLines={3}>
                      {lang === 'he' ? tpl.descriptionHe : tpl.descriptionEn}
                    </Text>
                  ) : null}

                  {tpl.skills ? (
                    <Text style={[s.msPreviewMeta, { marginTop: 4 }]}>
                      🛠️ {tpl.skills}
                    </Text>
                  ) : null}
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
                      {lang === 'he' ? tpl.titleHe : tpl.titleEn}
                    </Text>
                    <View style={tpl.status === 'rejected' ? s.pendingBadge : s.pendingBadge}>
                      <Text style={s.pendingBadgeText}>
                        {tpl.status === 'rejected'
                          ? (lang === 'he' ? 'נדחה' : 'Rejected')
                          : (lang === 'he' ? 'ממתין' : 'Pending')}
                      </Text>
                    </View>
                  </View>

                  <Text style={s.proposalDegree}>
                    🎓 {degreeLabel(tpl.degree, lang)} · {typeLabel(tpl.type, lang)}
                  </Text>

                  {(lang === 'he' ? tpl.descriptionHe : tpl.descriptionEn) ? (
                    <Text style={s.changesText}>
                      {lang === 'he' ? tpl.descriptionHe : tpl.descriptionEn}
                    </Text>
                  ) : null}

                  {tpl.skills ? (
                    <Text style={[s.changesText, { marginTop: 4 }]}>
                      🛠️ {tpl.skills}
                    </Text>
                  ) : null}

                  {tpl.status === 'rejected' && tpl.rejectionReason ? (
                    <Text style={[s.changesText, { marginTop: 6, color: '#B91C1C' }]}>
                      {lang === 'he' ? 'סיבת דחייה:' : 'Rejection reason:'} {tpl.rejectionReason}
                    </Text>
                  ) : null}

                  {tpl.status === 'pending' && (
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
                        onPress={() => openRejectModal(tpl)}
                        disabled={saving}
                      >
                        <Text style={s.rejectBtnText}>
                          ❌ {lang === 'he' ? 'דחה' : 'Reject'}
                        </Text>
                      </Pressable>
                    </View>
                  )}
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
            {/* Degree selector */}
            <Text style={s.fieldLabel}>{lang === 'he' ? 'תואר' : 'Degree'}</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {DEGREES.map((d) => (
                <Pressable
                  key={d.key}
                  style={[s.degreeChip, tplDegree === d.key && s.degreeChipActive]}
                  onPress={() => setTplDegree(d.key)}
                >
                  <Text style={[s.degreeChipText, tplDegree === d.key && s.degreeChipTextActive]}>
                    {lang === 'he' ? d.he : d.en}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Type selector */}
            <Text style={s.fieldLabel}>{lang === 'he' ? 'סוג עבודה' : 'Work Type'}</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {TYPES.map((t) => (
                <Pressable
                  key={t.key}
                  style={[s.degreeChip, tplType === t.key && s.degreeChipActive]}
                  onPress={() => setTplType(t.key)}
                >
                  <Text style={[s.degreeChipText, tplType === t.key && s.degreeChipTextActive]}>
                    {lang === 'he' ? t.he : t.en}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Title */}
            <Text style={s.fieldLabel}>{lang === 'he' ? 'כותרת (עברית)' : 'Title (Hebrew)'}</Text>
            <TextInput
              style={s.input}
              value={tplTitleHe}
              onChangeText={setTplTitleHe}
              placeholder="כותרת הפרויקט"
              textAlign="right"
            />

            <Text style={s.fieldLabel}>{lang === 'he' ? 'כותרת (אנגלית)' : 'Title (English)'}</Text>
            <TextInput
              style={s.input}
              value={tplTitleEn}
              onChangeText={setTplTitleEn}
              placeholder="Project title"
            />

            {/* Description */}
            <Text style={s.fieldLabel}>{lang === 'he' ? 'תיאור (עברית)' : 'Description (Hebrew)'}</Text>
            <TextInput
              style={[s.input, { minHeight: 80, textAlignVertical: 'top' }]}
              value={tplDescriptionHe}
              onChangeText={setTplDescriptionHe}
              placeholder="תיאור הפרויקט"
              textAlign="right"
              multiline
            />

            <Text style={s.fieldLabel}>{lang === 'he' ? 'תיאור (אנגלית)' : 'Description (English)'}</Text>
            <TextInput
              style={[s.input, { minHeight: 80, textAlignVertical: 'top' }]}
              value={tplDescriptionEn}
              onChangeText={setTplDescriptionEn}
              placeholder="Project description"
              multiline
            />

            {/* Skills */}
            <Text style={s.fieldLabel}>
              {lang === 'he' ? 'כישורים נדרשים' : 'Required skills'}
            </Text>
            <TextInput
              style={s.input}
              value={tplSkills}
              onChangeText={setTplSkills}
              placeholder={lang === 'he' ? 'Python, React, SQL' : 'Python, React, SQL'}
              textAlign={isRtl ? 'right' : 'left'}
            />

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

      {/* ════════ REJECT-REASON MODAL ════════ */}
      <Modal visible={rejectModalOpen} animationType="slide" presentationStyle="formSheet">
        <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>
              {lang === 'he' ? '❌ דחיית הצעה' : '❌ Reject Proposal'}
            </Text>
            <Pressable onPress={() => setRejectModalOpen(false)}>
              <Text style={s.modalClose}>✕</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={s.modalContent}>
            <Text style={s.fieldLabel}>
              {lang === 'he' ? 'סיבת הדחייה (חובה)' : 'Rejection reason (required)'}
            </Text>
            <TextInput
              style={[s.input, { minHeight: 100, textAlignVertical: 'top' }]}
              value={rejectReason}
              onChangeText={setRejectReason}
              placeholder={lang === 'he' ? 'הסבר לסטודנט/מנחה מדוע ההצעה נדחתה...' : 'Explain why this proposal was rejected...'}
              textAlign={isRtl ? 'right' : 'left'}
              multiline
            />

            <Pressable
              style={[s.saveBtn, { backgroundColor: '#EF4444' }, saving && { opacity: 0.6 }]}
              onPress={handleRejectProposal}
              disabled={saving}
            >
              {saving
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.saveBtnText}>
                    {lang === 'he' ? 'שלח דחייה' : 'Submit rejection'}
                  </Text>}
            </Pressable>

            <Pressable style={s.cancelBtn} onPress={() => setRejectModalOpen(false)}>
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
