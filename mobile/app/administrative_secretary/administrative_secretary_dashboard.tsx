// app/administrative_secretary/administrative_secretary_dashboard.tsx
// Dashboard for מזכירה אדמיניסטרטיבית (Administrative Secretary).
// Manages bachelor's and master's project groups:
// open groups, assign students, schedule defenses, track submissions.

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable,
  ActivityIndicator, Alert, RefreshControl,
  TextInput, Modal, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { auth } from '../../src/firebase/firebase';
import { apiClient } from '@/src/api/apiClient';
import { TopBar, getFacultyColor } from '../../components/shared';
import { t, tx, type Lang } from '../../components/i18n';
import { createExaminerToken } from '@/src/firebase/createExaminerToken';
import DefenseBuildingPicker from '@/components/DefenseBuildingPicker';
import { BulkDueDateModal } from '@/components/modals';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProjectGroup {
  id:              string;
  projectTitle:    string;
  supervisorName:  string;
  facultyId:       string;
  trackType:       'bachelor_project' | 'masters_project';
  members:         Array<{ uid: string; name: string }>;
  currentMilestone:string;
  primaryStatus:   string;
  defenseDate:     string | null;
  defenseRoom:     string | null;
  submissionsCount:number;
  overdueCount:    number;
  isOverdue:       boolean;
}

interface DashboardData {
  coordinatorName: string;
  facultyId:       string;
  groups:          ProjectGroup[];
  stats: {
    totalGroups:     number;
    activeGroups:    number;
    scheduledDefenses:number;
    overdueGroups:   number;
  };
}

// ─── Send Examiner Modal ───────────────────────────────────────────────────────
interface SendExaminerModalProps {
  visible:  boolean;
  group:    ProjectGroup | null;
  lang:     Lang;
  onClose:  () => void;
  coordinatorUid:  string;
  coordinatorName: string;
}

function SendExaminerModal({
  visible, group, lang, onClose, coordinatorUid, coordinatorName,
}: SendExaminerModalProps) {
  const [examinerName,        setExaminerName]        = useState('');
  const [examinerEmail,       setExaminerEmail]       = useState('');
  const [examinerInstitution, setExaminerInstitution] = useState('');
  const [examinerLanguage,    setExaminerLanguage]    = useState<'he' | 'en'>('he');
  const [thesisUrl,           setThesisUrl]           = useState('');
  const [reviewDays,          setReviewDays]          = useState('30');
  const [sending,             setSending]             = useState(false);
  const [generatedLink,       setGeneratedLink]       = useState<string | null>(null);

  const reset = () => {
    setExaminerName(''); setExaminerEmail(''); setExaminerInstitution('');
    setThesisUrl(''); setReviewDays('30'); setGeneratedLink(null);
    setExaminerLanguage('he');
  };

  const handleClose = () => { reset(); onClose(); };

  const handleSend = async () => {
    if (!group) return;
    if (!examinerName.trim() || !examinerEmail.trim()) {
      Alert.alert(
        lang === 'he' ? 'שדות חובה' : 'Required fields',
        lang === 'he' ? 'יש להזין שם ומייל של הבוחן' : 'Please enter examiner name and email',
      );
      return;
    }
    setSending(true);
    try {
      const { link } = await createExaminerToken({
        milestoneId:        group.currentMilestone,
        projectId:          group.id,
        studentId:          group.members[0]?.uid ?? '',
        studentName:        group.members.map(m => m.name).join(', '),
        thesisTitle:        group.projectTitle,
        thesisUrl:          thesisUrl.trim(),
        examinerName:       examinerName.trim(),
        examinerEmail:      examinerEmail.trim(),
        examinerInstitution:examinerInstitution.trim(),
        examinerLanguage,
        reviewDays:         parseInt(reviewDays, 10) || 30,
        opinionVisible:     true,
        opinionAnonymous:   false,
        createdByUid:       coordinatorUid,
        createdByName:      coordinatorName,
      });
      setGeneratedLink(link);
      Alert.alert(
        lang === 'he' ? '✅ הקישור נוצר' : '✅ Link created',
        lang === 'he'
          ? 'קישור הבוחן נוצר בהצלחה. העתק אותו ושלח לבוחן.'
          : 'Examiner link created. Copy and send it to the examiner.',
      );
    } catch (e: any) {
      Alert.alert(lang === 'he' ? 'שגיאה' : 'Error', String(e));
    } finally {
      setSending(false);
    }
  };

  const isRtl = lang === 'he';

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <ScrollView style={m.modal} contentContainerStyle={m.modalContent}>
        <Text style={m.modalTitle}>
          📧 {tx('send', lang)} {tx('externalExaminer', lang)}
        </Text>

        {group && (
          <View style={m.contextCard}>
            <Text style={m.contextTitle}>{group.projectTitle}</Text>
            <Text style={m.contextSub}>
              👥 {group.members.map(mem => mem.name).join(', ')}
            </Text>
          </View>
        )}

        {/* Examiner details */}
        {[
          { label: lang === 'he' ? 'שם הבוחן *' : 'Examiner name *',         value: examinerName,        set: setExaminerName,        key: 'name' },
          { label: lang === 'he' ? 'דוא"ל *' : 'Email *',                    value: examinerEmail,       set: setExaminerEmail,       key: 'email' },
          { label: lang === 'he' ? 'מוסד' : 'Institution',                   value: examinerInstitution, set: setExaminerInstitution, key: 'inst' },
          { label: lang === 'he' ? 'קישור לעבודה (URL)' : 'Thesis URL',      value: thesisUrl,           set: setThesisUrl,           key: 'url' },
          { label: lang === 'he' ? 'ימי שיפוט' : 'Review days',              value: reviewDays,          set: setReviewDays,          key: 'days' },
        ].map(field => (
          <View key={field.key} style={m.fieldWrap}>
            <Text style={m.fieldLabel}>{field.label}</Text>
            <TextInput
              style={[m.input, isRtl && { textAlign: 'right' }]}
              value={field.value}
              onChangeText={field.set}
              keyboardType={field.key === 'email' ? 'email-address' : field.key === 'days' ? 'numeric' : 'default'}
              autoCapitalize="none"
              placeholderTextColor="#9CA3AF"
            />
          </View>
        ))}

        {/* Language preference */}
        <Text style={m.fieldLabel}>{tx('examinerPreferredLanguage', lang)}</Text>
        <View style={m.langRow}>
          {(['he', 'en'] as const).map(l => (
            <Pressable
              key={l}
              style={[m.langBtn, examinerLanguage === l && m.langBtnActive]}
              onPress={() => setExaminerLanguage(l)}
            >
              <Text style={[m.langBtnText, examinerLanguage === l && m.langBtnTextActive]}>
                {l === 'he' ? 'עברית' : 'English'}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Generated link */}
        {generatedLink && (
          <View style={m.linkBox}>
            <Text style={m.linkLabel}>{lang === 'he' ? '🔗 קישור הבוחן:' : '🔗 Examiner link:'}</Text>
            <Text style={m.linkText} selectable>{generatedLink}</Text>
          </View>
        )}

        <Pressable
          style={[m.btnSend, sending && { opacity: 0.6 }]}
          onPress={handleSend}
          disabled={sending}
        >
          {sending
            ? <ActivityIndicator color="#fff" />
            : <Text style={m.btnSendText}>
                {generatedLink
                  ? (lang === 'he' ? 'שלח שוב' : 'Resend')
                  : (lang === 'he' ? '📧 צור קישור ושלח' : '📧 Create & Send Link')}
              </Text>
          }
        </Pressable>

        <Pressable style={m.btnCancel} onPress={handleClose}>
          <Text style={m.btnCancelText}>{tx('cancel', lang)}</Text>
        </Pressable>
      </ScrollView>
    </Modal>
  );
}

// ─── Defense Logistics Modal ────────────────────────────────────────────────
interface DefenseLogisticsModalProps {
  visible: boolean;
  group:   ProjectGroup | null;
  lang:    Lang;
  onClose: () => void;
  onSaved: () => void;
}

function DefenseLogisticsModal({ visible, group, lang, onClose, onSaved }: DefenseLogisticsModalProps) {
  const [time,     setTime]     = useState('');
  const [room,     setRoom]     = useState('');
  const [building, setBuilding] = useState('');
  const [saving,   setSaving]   = useState(false);

  const reset = () => { setTime(''); setRoom(''); setBuilding(''); };
  const handleClose = () => { reset(); onClose(); };

  const handleSave = async () => {
    if (!group) return;
    if (!time.trim() || !room.trim() || !building) {
      Alert.alert(
        lang === 'he' ? 'שגיאה' : 'Error',
        lang === 'he' ? 'יש למלא שעה, חדר ובניין' : 'Time, room, and building are all required',
      );
      return;
    }
    setSaving(true);
    try {
      await apiClient.post(`/api/project-coordinator/projects/${group.id}/assign-defense`, {
        time: time.trim(),
        room: room.trim(),
        building,
      });
      Alert.alert('✅', lang === 'he' ? 'פרטי ההגנה נשמרו בהצלחה' : 'Defense logistics saved successfully');
      reset();
      onSaved();
      onClose();
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.message || 'Failed to save defense logistics');
    } finally {
      setSaving(false);
    }
  };

  const isRtl = lang === 'he';

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <ScrollView style={m.modal} contentContainerStyle={m.modalContent}>
        <Text style={m.modalTitle}>
          🛡 {tx('scheduleDefense', lang)}
        </Text>

        {group && (
          <View style={m.contextCard}>
            <Text style={m.contextTitle}>{group.projectTitle}</Text>
            <Text style={m.contextSub}>
              👥 {group.members.map(mem => mem.name).join(', ')}
            </Text>
            {group.defenseDate && (
              <Text style={m.contextSub}>
                📅 {tx('defenseDate', lang)} {group.defenseDate}
              </Text>
            )}
          </View>
        )}

        <View style={m.fieldWrap}>
          <Text style={m.fieldLabel}>{tx('defenseTime', lang)}</Text>
          <TextInput
            style={[m.input, isRtl && { textAlign: 'right' }]}
            value={time}
            onChangeText={setTime}
            placeholder="HH:MM"
            placeholderTextColor="#9CA3AF"
          />
        </View>

        <View style={m.fieldWrap}>
          <Text style={m.fieldLabel}>{tx('defenseRoom', lang)}</Text>
          <TextInput
            style={[m.input, isRtl && { textAlign: 'right' }]}
            value={room}
            onChangeText={setRoom}
            placeholder={lang === 'he' ? 'חדר 101' : 'Room 101'}
            placeholderTextColor="#9CA3AF"
          />
        </View>

        <View style={m.fieldWrap}>
          <Text style={m.fieldLabel}>{tx('defenseBuilding', lang)}</Text>
          <DefenseBuildingPicker value={building} onChange={setBuilding} lang={lang} />
        </View>

        <Pressable
          style={[m.btnSend, saving && { opacity: 0.6 }]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving
            ? <ActivityIndicator color="#fff" />
            : <Text style={m.btnSendText}>{lang === 'he' ? 'שמור' : 'Save'}</Text>
          }
        </Pressable>

        <Pressable style={m.btnCancel} onPress={handleClose}>
          <Text style={m.btnCancelText}>{tx('cancel', lang)}</Text>
        </Pressable>
      </ScrollView>
    </Modal>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ProjectCoordinatorDashboard() {
  const router              = useRouter();
  const [lang, setLang]     = useState<Lang>('he');
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData]             = useState<DashboardData | null>(null);
  const [filterTrack, setFilterTrack] = useState<'all' | 'bachelor_project' | 'masters_project'>('all');
  const [filterOverdue, setFilterOverdue] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [examinerModalGroup, setExaminerModalGroup] = useState<ProjectGroup | null>(null);
  const [defenseModalGroup, setDefenseModalGroup] = useState<ProjectGroup | null>(null);
  const [showBulkDueDate, setShowBulkDueDate] = useState(false);

  const uid  = auth.currentUser?.uid ?? '';

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    try {
      const res = await apiClient.get(`/api/project-coordinator/${uid}/dashboard`);
      setData(res.data);
    } catch (e: any) {
      console.error('administrative_secretary dashboard error:', e);
      Alert.alert(
        lang === 'he' ? 'שגיאה' : 'Error',
        lang === 'he' ? 'לא ניתן לטעון נתונים' : 'Could not load data',
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [uid, lang]);

  useEffect(() => { fetchData(); }, [fetchData]);
  const onRefresh = () => { setRefreshing(true); fetchData(); };

  // ── Filter ─────────────────────────────────────────────────────────────────
  const filteredGroups = (data?.groups ?? []).filter(g => {
    const q = searchText.toLowerCase();
    const matchesSearch =
      !q ||
      g.projectTitle.toLowerCase().includes(q) ||
      g.supervisorName.toLowerCase().includes(q) ||
      g.members.some(m => m.name.toLowerCase().includes(q));
    const matchesTrack   = filterTrack === 'all' || g.trackType === filterTrack;
    const matchesOverdue = !filterOverdue || g.isOverdue;
    return matchesSearch && matchesTrack && matchesOverdue;
  });

  if (loading) {
    return (
      <View style={s.centered}>
        <ActivityIndicator size="large" color="#F59E0B" />
      </View>
    );
  }

  const fc = getFacultyColor(data?.facultyId ?? 'all');

  return (
    <SafeAreaView style={s.root}>
      <TopBar
        name={data?.coordinatorName ?? ''}
        role="administrative_secretary"
        lang={lang}
        isRtl={lang === 'he'}
        onToggleLang={() => setLang(l => l === 'he' ? 'en' : 'he')}
      />

      {/* Stats strip */}
      <View style={s.statsStrip}>
        {[
          { label: lang === 'he' ? 'קבוצות' : 'Groups',           value: data?.stats.totalGroups      ?? 0, color: '#F59E0B' },
          { label: lang === 'he' ? 'פעילות' : 'Active',           value: data?.stats.activeGroups     ?? 0, color: '#10B981' },
          { label: lang === 'he' ? 'הגנות מתוכננות' : 'Defenses', value: data?.stats.scheduledDefenses ?? 0, color: '#2E86FF' },
          { label: lang === 'he' ? 'באיחור' : 'Overdue',          value: data?.stats.overdueGroups    ?? 0, color: '#EF4444' },
        ].map(st => (
          <View key={st.label} style={s.statCard}>
            <Text style={[s.statValue, { color: st.color }]}>{st.value}</Text>
            <Text style={s.statLabel} numberOfLines={2}>{st.label}</Text>
          </View>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Search + filters */}
        <Pressable
          style={[s.filterChip, { alignSelf: 'flex-start', backgroundColor: '#FFF7ED', borderColor: '#F59E0B', marginBottom: 10 }]}
          onPress={() => setShowBulkDueDate(true)}
        >
          <Text style={[s.filterChipText, { color: '#92400E' }]}>
            📅 {lang === 'he' ? 'עדכון תאריכי יעד מרוכז' : 'Bulk Update Due Dates'}
          </Text>
        </Pressable>
        <TextInput
          style={s.searchInput}
          value={searchText}
          onChangeText={setSearchText}
          placeholder={tx('searchPlaceholder', lang)}
          placeholderTextColor="#9CA3AF"
          textAlign={lang === 'he' ? 'right' : 'left'}
        />
        <View style={s.filterRow}>
          {(['all', 'bachelor_project', 'masters_project'] as const).map(track => (
            <Pressable
              key={track}
              style={[s.filterChip, filterTrack === track && { backgroundColor: fc.primary }]}
              onPress={() => setFilterTrack(track)}
            >
              <Text style={[s.filterChipText, filterTrack === track && { color: '#fff' }]}>
                {track === 'all'
                  ? tx('all', lang)
                  : track === 'bachelor_project'
                    ? tx('trackBachelorProject', lang)
                    : tx('trackMastersProject', lang)}
              </Text>
            </Pressable>
          ))}
          <Pressable
            style={[s.filterChip, filterOverdue && { backgroundColor: '#EF4444' }]}
            onPress={() => setFilterOverdue(v => !v)}
          >
            <Text style={[s.filterChipText, filterOverdue && { color: '#fff' }]}>
              ⚠️ {lang === 'he' ? 'באיחור' : 'Overdue'}
            </Text>
          </Pressable>
        </View>

        {/* Group cards */}
        {filteredGroups.length === 0 ? (
          <View style={s.empty}>
            <Text style={s.emptyEmoji}>📭</Text>
            <Text style={s.emptyText}>{lang === 'he' ? 'אין קבוצות להצגה' : 'No groups to show'}</Text>
          </View>
        ) : (
          filteredGroups.map(group => (
            <View key={group.id} style={[s.card, { borderLeftColor: group.isOverdue ? '#EF4444' : fc.primary }]}>
              {/* Title + overdue */}
              <View style={s.cardHeaderRow}>
                <Text style={s.cardTitle} numberOfLines={2}>{group.projectTitle}</Text>
                {group.isOverdue && (
                  <View style={s.overduePill}>
                    <Text style={s.overduePillText}>⚠️ {tx('overdue', lang)}</Text>
                  </View>
                )}
              </View>

              {/* Supervisor */}
              <Text style={s.cardSub}>👨‍🏫 {group.supervisorName}</Text>

              {/* Members */}
              <Text style={s.cardSub}>
                👥 {group.members.map(m => m.name).join('  ·  ')}
              </Text>

              {/* Milestone + track */}
              <View style={s.metaRow}>
                <View style={[s.trackPill, { backgroundColor: group.trackType === 'bachelor_project' ? '#EFF6FF' : '#F5F3FF' }]}>
                  <Text style={[s.trackPillText, { color: group.trackType === 'bachelor_project' ? '#1D4ED8' : '#7C3AED' }]}>
                    {group.trackType === 'bachelor_project'
                      ? tx('trackBachelorProject', lang)
                      : tx('trackMastersProject', lang)}
                  </Text>
                </View>
                <Text style={s.milestoneText}>
                  📍 {group.currentMilestone}
                </Text>
              </View>

              {/* Defense date */}
              {group.defenseDate ? (
                <View style={s.defensePill}>
                  <Text style={s.defensePillText}>
                    🛡 {tx('defenseDate', lang)} {group.defenseDate}
                    {group.defenseRoom ? `  ·  ${group.defenseRoom}` : ''}
                  </Text>
                </View>
              ) : (
                <Text style={s.noDefenseText}>
                  📅 {tx('defenseNotScheduled', lang)}
                </Text>
              )}

              {/* Actions */}
              <View style={s.actionRow}>
                <Pressable
                  style={[s.actionBtn, { backgroundColor: '#EFF6FF' }]}
                  onPress={() =>
                    router.push({ pathname: '/admin/panel', params: { groupId: group.id } } as any)
                  }
                >
                  <Text style={[s.actionBtnText, { color: '#1D4ED8' }]}>
                    📁 {tx('view', lang)}
                  </Text>
                </Pressable>

                <Pressable
                  style={[s.actionBtn, { backgroundColor: '#F0FDF4' }]}
                  onPress={() => setDefenseModalGroup(group)}
                >
                  <Text style={[s.actionBtnText, { color: '#065F46' }]}>
                    🛡 {tx('scheduleDefense', lang)}
                  </Text>
                </Pressable>

                <Pressable
                  style={[s.actionBtn, { backgroundColor: '#FFF7ED' }]}
                  onPress={() => setExaminerModalGroup(group)}
                >
                  <Text style={[s.actionBtnText, { color: '#92400E' }]}>
                    📧 {tx('externalExaminer', lang)}
                  </Text>
                </Pressable>
              </View>
            </View>
          ))
        )}

        <View style={{ height: 60 }} />
      </ScrollView>

      {/* Send examiner token modal */}
      <SendExaminerModal
        visible={!!examinerModalGroup}
        group={examinerModalGroup}
        lang={lang}
        onClose={() => setExaminerModalGroup(null)}
        coordinatorUid={uid}
        coordinatorName={data?.coordinatorName ?? ''}
      />

      {/* Defense logistics modal */}
      <DefenseLogisticsModal
        visible={!!defenseModalGroup}
        group={defenseModalGroup}
        lang={lang}
        onClose={() => setDefenseModalGroup(null)}
        onSaved={fetchData}
      />

      <BulkDueDateModal
        visible={showBulkDueDate}
        onClose={() => setShowBulkDueDate(false)}
        lang={lang}
        projects={(data?.groups ?? []).map((g) => ({ id: g.id, label: g.projectTitle }))}
        onSaved={fetchData}
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root:     { flex: 1, backgroundColor: '#FFFBEB' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll:   { padding: 16 },

  statsStrip: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 10,
                backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  statCard:   { flex: 1, alignItems: 'center', paddingHorizontal: 2 },
  statValue:  { fontSize: 22, fontWeight: '800' },
  statLabel:  { fontSize: 10, color: '#64748B', textAlign: 'center', marginTop: 2 },

  searchInput: { backgroundColor: '#fff', borderRadius: 10, borderWidth: 1.5,
                 borderColor: '#E2E8F0', padding: 12, fontSize: 14, color: '#1E293B', marginBottom: 10 },
  filterRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  filterChip:  { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
                 backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0' },
  filterChipText: { fontSize: 12, color: '#475569', fontWeight: '600' },

  card:          { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 14,
                   borderLeftWidth: 4, shadowColor: '#000', shadowOpacity: 0.05,
                   shadowRadius: 6, elevation: 2 },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between',
                   alignItems: 'flex-start', marginBottom: 6, gap: 8 },
  cardTitle:     { fontSize: 15, fontWeight: '700', color: '#1E293B', flex: 1 },
  cardSub:       { fontSize: 13, color: '#64748B', marginBottom: 3 },
  overduePill:   { backgroundColor: '#FEE2E2', borderRadius: 8,
                   paddingHorizontal: 7, paddingVertical: 3 },
  overduePillText:{ color: '#991B1B', fontSize: 11, fontWeight: '700' },

  metaRow:       { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6, marginBottom: 6 },
  trackPill:     { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  trackPillText: { fontSize: 11, fontWeight: '600' },
  milestoneText: { fontSize: 12, color: '#64748B' },

  defensePill:     { backgroundColor: '#EFF6FF', borderRadius: 8, padding: 8, marginBottom: 6 },
  defensePillText: { color: '#1D4ED8', fontSize: 12, fontWeight: '600' },
  noDefenseText:   { fontSize: 12, color: '#94A3B8', marginBottom: 6 },

  actionRow:     { flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' },
  actionBtn:     { flex: 1, borderRadius: 8, padding: 9, alignItems: 'center', minWidth: 90 },
  actionBtnText: { fontSize: 12, fontWeight: '700' },

  empty:      { alignItems: 'center', paddingVertical: 48 },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyText:  { fontSize: 15, color: '#64748B' },
});

// ─── Send Examiner Modal styles ───────────────────────────────────────────────
const m = StyleSheet.create({
  modal:        { flex: 1, backgroundColor: '#F8FAFC' },
  modalContent: { padding: 20, paddingBottom: 60 },
  modalTitle:   { fontSize: 18, fontWeight: '800', color: '#1E293B', marginBottom: 16 },
  contextCard:  { backgroundColor: '#EFF6FF', borderRadius: 10, padding: 12, marginBottom: 16 },
  contextTitle: { fontSize: 14, fontWeight: '700', color: '#1E3A8A', marginBottom: 4 },
  contextSub:   { fontSize: 13, color: '#1D4ED8' },
  fieldWrap:    { marginBottom: 14 },
  fieldLabel:   { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 },
  input:        { borderWidth: 1.5, borderColor: '#CBD5E1', borderRadius: 8,
                  padding: 11, fontSize: 14, color: '#1E293B', backgroundColor: '#fff' },
  langRow:      { flexDirection: 'row', gap: 10, marginBottom: 16 },
  langBtn:      { flex: 1, borderWidth: 1.5, borderColor: '#CBD5E1', borderRadius: 8,
                  padding: 10, alignItems: 'center', backgroundColor: '#fff' },
  langBtnActive:{ backgroundColor: '#2E86FF', borderColor: '#2E86FF' },
  langBtnText:  { fontSize: 14, fontWeight: '600', color: '#374151' },
  langBtnTextActive: { color: '#fff' },
  linkBox:      { backgroundColor: '#F0FDF4', borderRadius: 10, padding: 12, marginBottom: 14 },
  linkLabel:    { fontSize: 13, fontWeight: '700', color: '#065F46', marginBottom: 6 },
  linkText:     { fontSize: 12, color: '#1E293B', fontFamily: 'monospace' },
  btnSend:      { backgroundColor: '#F59E0B', borderRadius: 12, padding: 15,
                  alignItems: 'center', marginBottom: 10 },
  btnSendText:  { color: '#fff', fontSize: 16, fontWeight: '700' },
  btnCancel:    { padding: 12, alignItems: 'center' },
  btnCancelText:{ color: '#64748B', fontSize: 15 },
});