import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, Pressable,
  ActivityIndicator, Modal, TextInput, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { auth } from '../../src/firebase/firebase';
import { useRouter } from 'expo-router';
import type { Lang } from '../../components/i18n';
import { TopBar, FacultyBadge } from '../../components/shared';
import {type GradeWeights } from '../../components/Milestoneservice';
import { coordinatorHomeStyles } from '../../constants/styles';
import {tx} from '../../components/i18n';
import { apiClient } from '@/src/api/apiClient';
import { pickAndImportStaff, exportUsers, ImportSummary } from '@/src/api/userImportExport';
import { pickAndImportStudentRoster } from '@/src/api/studentRoster';
import {PendingMilestone, Project, InProgressProject, ExaminerUser, AssignedMilestone, DefensePanelMember} from '@/types'
import FloatingActionMenu from '@/components/FloatingActionMenu';
import DefenseBuildingPicker from '@/components/DefenseBuildingPicker';
import { BulkDueDateModal } from '@/components/modals';

const MILESTONE_LABEL: Record<string, { he: string; en: string }> = {
  research_proposal: { he: 'הצעת מחקר',    en: 'Research Proposal' },
  progress_report:   { he: 'דו"ח התקדמות', en: 'Progress Report'   },
  final_report:      { he: 'דו"ח מסכם',    en: 'Final Report'      },
  defense:           { he: 'הגנה',          en: 'Defense'           },
};

const MILESTONE_PROGRESS: Record<string, number> = {
  research_proposal: 25,
  progress_report:   50,
  final_report:      75,
  defense:           100,
};



export default function CoordinatorHome() {
  const router = useRouter();
  const [lang, setLang] = useState<Lang>('he');
  const isRtl = lang === 'he';

  const [coordinatorName, setCoordinatorName] = useState('');
  const [loading, setLoading]     = useState(true);
  
  const [activeTab, setActiveTab] = useState<'pending' | 'defense' | 'inProgress' | 'deadlines' | 'recommendations'>('pending');
  const [defenseSort, setDefenseSort] = useState<'daysLeft' | 'needsExaminers' | 'name'>('daysLeft');
  const [deadlines, setDeadlines] = useState<any[]>([]);
  const [loadingDeadlines, setLoadingDeadlines] = useState(false);
  const [showBulkDueDate, setShowBulkDueDate] = useState(false);
  const [pendingMilestones, setPendingMilestones] = useState<PendingMilestone[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [inProgressProjects, setInProgressProjects] = useState<InProgressProject[]>([]);
  const [defenseSetups,    setDefenseSetups]    = useState<PendingMilestone[]>([]);
  const [allExaminers,     setAllExaminers]     = useState<ExaminerUser[]>([]);

  // Approve modal (milestone 1 & 2)
  const [approveModal,     setApproveModal]     = useState(false);
  const [selectedMilestone,setSelectedMilestone]= useState<PendingMilestone | null>(null);

  // Assign examiners modal (milestone 3)
  const [assignModal,      setAssignModal]      = useState(false);
  const [examiner1Id,      setExaminer1Id]      = useState('');
  const [examiner2Id,      setExaminer2Id]      = useState('');
  const [weightSupervisor, setWeightSupervisor] = useState('30');
  const [weightExaminer1,  setWeightExaminer1]  = useState('35');
  const [weightExaminer2,  setWeightExaminer2]  = useState('35');
  // External examiner support — no app account, gets a one-time access link
  // by email instead of being picked from the internal examiner list.
  const [examiner1Type, setExaminer1Type] = useState<'internal' | 'external'>('internal');
  const [examiner2Type, setExaminer2Type] = useState<'internal' | 'external'>('internal');
  const [examiner1Ext,  setExaminer1Ext]  = useState({ name: '', email: '', institution: '' });
  const [examiner2Ext,  setExaminer2Ext]  = useState({ name: '', email: '', institution: '' });

  // Defense logistics modal (time/room/building only — the DATE itself comes
  // from the examiner date-matching flow, not from the coordinator).
  const [selectedProjectForDefense, setSelectedProjectForDefense] = useState<Project | null>(null);
  const [selectedDefenseMilestone, setSelectedDefenseMilestone] = useState<AssignedMilestone | null>(null);
  const [defenseModal,     setDefenseModal]     = useState(false);
  const [defenseTime,      setDefenseTime]      = useState('');
  const [defenseRoom,      setDefenseRoom]      = useState('');
  const [defenseBuilding,  setDefenseBuilding]  = useState('');

  // Date-conflict resolution modal (no common date found between examiners)
  const [conflictModal, setConflictModal] = useState(false);
  const [conflictProject, setConflictProject] = useState<Project | null>(null);
  const [conflictMilestone, setConflictMilestone] = useState<AssignedMilestone | null>(null);
  const [replacedExaminerKey, setReplacedExaminerKey] = useState('');
  const [replacementType, setReplacementType] = useState<'internal' | 'external'>('internal');
  const [replacementInternalId, setReplacementInternalId] = useState('');
  const [replacementExt, setReplacementExt] = useState({ name: '', email: '', institution: '' });

  const [projectId, setProjectId] = useState<string>('')
  const [saving, setSaving] = useState(false);
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});
  const coordinatorId = auth.currentUser?.uid || '';
  const [expandedStudents, setExpandedStudents] = useState<Record<string, boolean>>({});
  // Examiner recommendations
  const [examinerRecs,    setExaminerRecs]    = useState<any[]>([]);
  const [recsTab,         setRecsTab]         = useState(false);
  // Import / export roster (Excel) — scoped to this coordinator's own faculty
  const [exportingUsers,  setExportingUsers]  = useState(false);
  const [importingStaff,  setImportingStaff]  = useState(false);
  const [importingRoster, setImportingRoster] = useState(false);



  const toggleStudentExpansion = (projectId: string, studentIndex: number) => {
    const key = `${projectId}-${studentIndex}`;
    setExpandedStudents(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleCardExpansion = (milestoneId: string) => {
    setExpandedCards((prev) => ({
      ...prev,
      [milestoneId]: !prev[milestoneId],
    }));
  };


  // ── 1. Unified Fetch Loop ───────────────────────────────────────────
  const fetchCoordinatorDashboard = async () => {
    try {
      if (!auth.currentUser) return;
      setLoading(true);

      // 🚀 Replaced all multi-collection snapshots with one optimized backend matrix call
      const [profileRes, dashboardRes, examinersRes] = await Promise.all([
        apiClient.get('/api/users/profile').catch(e => { console.error('❌ profile failed:', e.response?.status, e.response?.config?.url); throw e; }),
        apiClient.get('/api/coordinator/dashboard').catch(e => { console.error('❌ dashboard failed:', e.response?.status, e.response?.config?.url); throw e; }),
        apiClient.get('/api/examiner/get-list').catch(e => { console.error('❌ examiners failed:', e.response?.status, e.response?.config?.url); throw e; }),
        
      ]);     
      const ActiveProjects = await apiClient.get('/api/projects/ActiveProjects')
      setInProgressProjects(ActiveProjects.data.InProgress || [])
      setCoordinatorName(profileRes.data?.displayName || 'Coordinator');
      if (profileRes.data?.language) setLang(profileRes.data.language);
      const allMilestones = dashboardRes.data.pendingMilestones || [];
      setPendingMilestones(allMilestones.filter(
        (m: PendingMilestone) =>
          !(m.type === 'final_report' && m.status === 'graded')
      ));
      setDefenseSetups(allMilestones.filter(
        (m: PendingMilestone) =>
          m.type === 'final_report' && (m.status === 'graded' || m.status === 'coordinator_approved')
      ));
      setProjects(dashboardRes.data.projects || []);
      setAllExaminers(examinersRes.data || []);
      try {
        const recsRes = await apiClient.get('/api/coordinator/examiner-recommendations');
        setExaminerRecs(recsRes.data.recommendations ?? []);
      } catch (_) { /* non-fatal */ }
    } catch (err) {
      console.error("Failed fetching coordinator panel matrix:", err);
      Alert.alert(
        lang === 'he' ? 'שגיאה' : 'Error',
        lang === 'he' ? 'טעינת לוח הבקרה נכשלה.' : 'Failed to load the dashboard.',
        [
          { text: lang === 'he' ? 'ביטול' : 'Cancel', style: 'cancel' },
          { text: lang === 'he' ? 'נסה שוב' : 'Retry', onPress: () => fetchCoordinatorDashboard() },
        ],
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCoordinatorDashboard();
  }, []);

  // ── Import / export faculty roster (Excel) ──────────────────────────────────
  // Scoped server-side to this coordinator's own facultyId — rows in the
  // uploaded file for other faculties are skipped and reported, not imported.
  const showImportSummary = (summary: ImportSummary) => {
    const failedLines = summary.details
      .filter((d) => d.status === 'failed')
      .map((d) => `#${d.row} ${d.email || '—'}: ${d.reason}`)
      .slice(0, 10)
      .join('\n');

    Alert.alert(
      lang === 'he' ? '📥 תוצאות ייבוא' : '📥 Import Results',
      lang === 'he'
        ? `נוצרו: ${summary.created}\nדולגו (פקולטה אחרת/כפילות): ${summary.skipped}\nנכשלו: ${summary.failed}\nמתוך ${summary.totalRows} שורות` +
          (failedLines ? `\n\n${failedLines}` : '')
        : `Created: ${summary.created}\nSkipped (other faculty/duplicate): ${summary.skipped}\nFailed: ${summary.failed}\nof ${summary.totalRows} rows` +
          (failedLines ? `\n\n${failedLines}` : '')
    );
  };

  const handleExportUsers = async () => {
    setExportingUsers(true);
    try {
      await exportUsers('coordinator');
    } catch (e: any) {
      console.error('Export users error:', e);
      Alert.alert(
        lang === 'he' ? 'שגיאה' : 'Error',
        lang === 'he' ? 'ייצוא המשתמשים נכשל' : 'Failed to export users'
      );
    } finally {
      setExportingUsers(false);
    }
  };

  const handleImportStaff = async () => {
    setImportingStaff(true);
    try {
      const summary = await pickAndImportStaff('coordinator');
      if (!summary) return; // user cancelled the picker
      showImportSummary(summary);
      fetchCoordinatorDashboard();
    } catch (e: any) {
      console.error('Import staff error:', e);
      Alert.alert(
        lang === 'he' ? 'שגיאה' : 'Error',
        e.response?.data?.message || (lang === 'he' ? 'ייבוא הסגל נכשל' : 'Failed to import staff')
      );
    } finally {
      setImportingStaff(false);
    }
  };

  // Uploads the pre-registration student roster for this coordinator's own
  // faculty (see server/src/services/studentRoster.ts) — signup checks
  // entered ID+degree against this before a student account can be created.
  const handleImportStudentRoster = async () => {
    setImportingRoster(true);
    try {
      const summary = await pickAndImportStudentRoster('coordinator');
      if (!summary) return; // user cancelled the picker
      const failedLines = summary.details
        .filter((d) => d.status === 'failed')
        .map((d) => `#${d.row} ${d.studentId || '—'}: ${d.reason}`)
        .slice(0, 10)
        .join('\n');
      Alert.alert(
        lang === 'he' ? '🎓 תוצאות ייבוא רשימת סטודנטים' : '🎓 Student Roster Import Results',
        lang === 'he'
          ? `נוספו: ${summary.imported}\nדולגו: ${summary.skipped}\nנכשלו: ${summary.failed}\nמתוך ${summary.totalRows} שורות` +
            (failedLines ? `\n\n${failedLines}` : '')
          : `Added: ${summary.imported}\nSkipped: ${summary.skipped}\nFailed: ${summary.failed}\nof ${summary.totalRows} rows` +
            (failedLines ? `\n\n${failedLines}` : '')
      );
    } catch (e: any) {
      console.error('Import student roster error:', e);
      Alert.alert(
        lang === 'he' ? 'שגיאה' : 'Error',
        e.response?.data?.message || (lang === 'he' ? 'ייבוא רשימת הסטודנטים נכשל' : 'Failed to import the student roster')
      );
    } finally {
      setImportingRoster(false);
    }
  };

  useEffect(() => {
    if (activeTab !== 'deadlines') return;
    const fetchDeadlines = async () => {
      if(coordinatorId === '') return;
      try {
        setLoadingDeadlines(true);
        const res = await apiClient.get(`/api/staff/${coordinatorId}/deadlines`);
        setDeadlines(res.data.deadlines || []);
      } catch (e) {
        console.error('Failed to load deadlines', e);
        Alert.alert('Error', 'Failed to load deadlines');
      } finally {
        setLoadingDeadlines(false);
      }
    };
    fetchDeadlines();
  }, [activeTab]);

  // ── Approve milestone (research_proposal or progress_report) ─────────────
  const handleApprove = async (milestone: PendingMilestone) => {
    if (milestone.type === 'final_report') {
      // Open assign examiners modal instead
      setSelectedMilestone(milestone);
      setProjectId(milestone.projectId);
      setExaminer1Id('');
      setExaminer2Id('');
      setExaminer1Type('internal');
      setExaminer2Type('internal');
      setExaminer1Ext({ name: '', email: '', institution: '' });
      setExaminer2Ext({ name: '', email: '', institution: '' });
      setWeightSupervisor('30');
      setWeightExaminer1('35');
      setWeightExaminer2('35');
      setAssignModal(true);
      return;
    }
    try {
      setSaving(true);
      // 🚀 Moved scoring computations & structural calculations to the server
      await apiClient.post(`/api/coordinator/${milestone.id}/approve`);
      
      Alert.alert('✅', lang === 'he' ? 'אבן הדרך אושרה בהצלחה' : 'Milestone approved successfully');
      fetchCoordinatorDashboard();
    } catch (err) {
      Alert.alert('Error', 'Failed to submit approval.');
    } finally {
      setSaving(false);
    }
  };
  //--- Reject milestone (research_proposal or progress_report) ----------------------
  const handleReject = async (milestone: PendingMilestone) => {
    try {
      setSaving(true);
      // 🚀 We send the ID and the reason to the server. 
      // The server handles the update AND the notification creation.
      await apiClient.post(`/api/coordinator/${milestone.id}/reject`, {
        id: milestone.id,
        projectId: milestone.projectId,
        studentNames: milestone.studentNames,
        supervisorId: milestone.supervisorId, 
      });

      Alert.alert('✅', lang === 'he' ? 'אבן הדרך נדחתה' : 'Milestone rejected');
      fetchCoordinatorDashboard(); // Refresh UI
    } catch (err) {
      console.error("Reject error:", err);
      Alert.alert('Error', 'Failed to reject milestone');
    } finally {
      setSaving(false);
    }
  };
  // ── Assign examiners + weights (final_report) ─────────────────────────────
  // Each slot is either an internal examiner (existing app user, picked from
  // the dropdown) or an external one (no app account — gets a one-time
  // access link by email instead; see server/src/services/examinerAccess.ts).
  const buildExaminerPayload = (
    type: 'internal' | 'external',
    id: string,
    ext: { name: string; email: string; institution: string }
  ) =>
    type === 'internal'
      ? { type: 'internal' as const, uid: id }
      : { type: 'external' as const, name: ext.name.trim(), email: ext.email.trim(), institution: ext.institution.trim() };

  const handleAssignExaminers = async () => {
    if (!selectedMilestone) return;
    const currentProjectId = selectedMilestone.projectId;

    if (examiner1Type === 'internal' && !examiner1Id) {
      Alert.alert(lang === 'he' ? 'שגיאה' : 'Error',
        lang === 'he' ? 'יש לבחור בוחן 1' : 'Please select examiner 1');
      return;
    }
    if (examiner1Type === 'external' && (!examiner1Ext.name.trim() || !examiner1Ext.email.trim())) {
      Alert.alert(lang === 'he' ? 'שגיאה' : 'Error',
        lang === 'he' ? 'שם ואימייל לבוחן 1 הם שדות חובה' : 'Name and email are required for examiner 1');
      return;
    }
    if (examiner2Type === 'internal' && !examiner2Id) {
      Alert.alert(lang === 'he' ? 'שגיאה' : 'Error',
        lang === 'he' ? 'יש לבחור בוחן 2' : 'Please select examiner 2');
      return;
    }
    if (examiner2Type === 'external' && (!examiner2Ext.name.trim() || !examiner2Ext.email.trim())) {
      Alert.alert(lang === 'he' ? 'שגיאה' : 'Error',
        lang === 'he' ? 'שם ואימייל לבוחן 2 הם שדות חובה' : 'Name and email are required for examiner 2');
      return;
    }
    if (examiner1Type === 'internal' && examiner2Type === 'internal' && examiner1Id === examiner2Id) {
      Alert.alert(lang === 'he' ? 'שגיאה' : 'Error',
        lang === 'he' ? 'יש לבחור שני בוחנים שונים' : 'Please select two different examiners');
      return;
    }
    if (
      examiner1Type === 'external' && examiner2Type === 'external' &&
      examiner1Ext.email.trim().toLowerCase() === examiner2Ext.email.trim().toLowerCase()
    ) {
      Alert.alert(lang === 'he' ? 'שגיאה' : 'Error',
        lang === 'he' ? 'יש להזין שני בוחנים חיצוניים שונים' : 'Please enter two different external examiners');
      return;
    }

    const w1 = parseFloat(weightSupervisor) / 100;
    const w2 = parseFloat(weightExaminer1) / 100;
    const w3 = parseFloat(weightExaminer2) / 100;
    if (Math.abs(w1 + w2 + w3 - 1) > 0.01) {
      Alert.alert(lang === 'he' ? 'שגיאה' : 'Error',
        lang === 'he' ? 'סך המשקלות חייב להיות 100%' : 'Weights must sum to 100%');
      return;
    }
    try {
      setSaving(true);

      const examinerPayload = [
        buildExaminerPayload(examiner1Type, examiner1Id, examiner1Ext),
        buildExaminerPayload(examiner2Type, examiner2Id, examiner2Ext),
      ];

      // 🚀 The server validates the examiners, assigns the internal ones,
      // emails a one-time access link to any external examiner, AND opens
      // the defense date-matching window — both examiners will be prompted
      // to submit candidate dates; the coordinator no longer picks a date.
      await apiClient.post(`/api/coordinator/projects/${projectId}/assign-examiners`, {
        examiners: examinerPayload,
        milestoneId: selectedMilestone.id,
        studentIds: selectedMilestone.studentIds,
      });

      setAssignModal(false);
      Alert.alert(
        '✅',
        lang === 'he'
          ? 'בוחנים שובצו בהצלחה. כל בוחן יתבקש לבחור תאריכים אפשריים להגנה.'
          : 'Examiners assigned successfully. Each will be asked to submit their available defense dates.'
      );
      fetchCoordinatorDashboard();
    } catch (err) {
      console.error("Assignment error:", err);
      // The server will send a meaningful error if assignment is invalid
      Alert.alert('Error', (err as any).response?.data?.message || 'Failed to assign examiners');
    } finally {
      setSaving(false);
    }
  };

  // ── Re-open defense scheduling for a project whose examiners are already
  //    assigned but whose defense milestone never opened (stuck at 'pending').
  //    Pre-fills the same assign-examiners modal with the known examiners —
  //    submitting it re-runs the normal assign-examiners flow, which is what
  //    actually opens the panel on the milestone.
  const handleReopenDefenseScheduling = (project: Project, milestone: AssignedMilestone) => {
    const [e1, e2] = project.examinerIds ?? [];
    setSelectedMilestone({
      id: milestone.id,
      projectId: project.id,
      projectTitleHe: project.titleHe,
      projectTitleEn: project.titleEn,
      type: 'defense',
      status: milestone.status,
      studentNames: milestone.studentNames,
      studentIds: project.enrolledStudentIds ?? [],
      supervisorId: project.supervisorId ?? '',
      supervisorScore: null,
      examinerIds: project.examinerIds ?? [],
      examiner1Score: null,
      examiner2Score: null,
      gradeWeights: null,
      dueDate: milestone.dueDate,
      facultyId: project.facultyId,
      defenseDate: milestone.defenseDate,
      defenseRoom: milestone.defenseRoom,
    });
    setProjectId(project.id);
    setExaminer1Id(e1 ?? '');
    setExaminer2Id(e2 ?? '');
    setExaminer1Type('internal');
    setExaminer2Type('internal');
    setExaminer1Ext({ name: '', email: '', institution: '' });
    setExaminer2Ext({ name: '', email: '', institution: '' });
    setWeightSupervisor('30');
    setWeightExaminer1('35');
    setWeightExaminer2('35');
    setAssignModal(true);
  };

  // ── Set defense logistics (time/room/building) — the date itself was
  //    already locked in by the examiner date-matching flow ─────────────────
  const handleSetDefense = async () => {
    if (!selectedProjectForDefense || !defenseTime.trim() || !defenseRoom.trim() || !defenseBuilding.trim()) {
      Alert.alert(
        lang === 'he' ? 'שגיאה' : 'Error',
        lang === 'he' ? 'יש למלא שעה, חדר ובניין' : 'Time, room, and building are all required'
      );
      return;
    }
    try {
      setSaving(true);
      await apiClient.post(`/api/coordinator/projects/${selectedProjectForDefense.id}/assign-defense`, {
        time: defenseTime.trim(),
        room: defenseRoom.trim(),
        building: defenseBuilding.trim(),
      });

      setDefenseModal(false);
      setDefenseTime('');
      setDefenseRoom('');
      setDefenseBuilding('');
      Alert.alert('✅', lang === 'he' ? 'פרטי ההגנה נשמרו בהצלחה' : 'Defense logistics saved successfully');
      fetchCoordinatorDashboard();
    } catch (err) {
      console.log("error: ", err)
      Alert.alert('Error', (err as any).response?.data?.message || 'Failed to save defense logistics');
    } finally {
      setSaving(false);
    }
  };

  const openDefenseLogisticsModal = (project: Project, milestone: AssignedMilestone) => {
    setSelectedProjectForDefense(project);
    setSelectedDefenseMilestone(milestone);
    setDefenseTime('');
    setDefenseRoom('');
    setDefenseBuilding('');
    setDefenseModal(true);
  };

  // ── Date-conflict resolution (examiners had no common date) ──────────────
  const openConflictModal = (project: Project, milestone: AssignedMilestone) => {
    setConflictProject(project);
    setConflictMilestone(milestone);
    const panel = milestone.defensePanel ?? [];
    setReplacedExaminerKey(panel[0] ? `${panel[0].type}:${panel[0].ref}` : '');
    setReplacementType('internal');
    setReplacementInternalId('');
    setReplacementExt({ name: '', email: '', institution: '' });
    setConflictModal(true);
  };

  const handleKeepExaminers = async () => {
    if (!conflictMilestone) return;
    try {
      setSaving(true);
      const res = await apiClient.post(`/api/coordinator/milestones/${conflictMilestone.id}/resolve-date-conflict`, {
        action: 'keep_examiners',
      });
      setConflictModal(false);
      Alert.alert(
        '✅',
        lang === 'he'
          ? `נבחר תאריך הגנה: ${res.data.date}`
          : `Defense date auto-selected: ${res.data.date}`
      );
      fetchCoordinatorDashboard();
    } catch (err) {
      Alert.alert('Error', (err as any).response?.data?.message || 'Failed to auto-select a date');
    } finally {
      setSaving(false);
    }
  };

  const handleReplaceExaminer = async () => {
    if (!conflictMilestone || !replacedExaminerKey) return;
    if (replacementType === 'internal' && !replacementInternalId) {
      Alert.alert(lang === 'he' ? 'שגיאה' : 'Error', lang === 'he' ? 'יש לבחור בוחן חלופי' : 'Please select a replacement examiner');
      return;
    }
    if (replacementType === 'external' && (!replacementExt.name.trim() || !replacementExt.email.trim())) {
      Alert.alert(lang === 'he' ? 'שגיאה' : 'Error', lang === 'he' ? 'שם ואימייל הם שדות חובה' : 'Name and email are required');
      return;
    }
    try {
      setSaving(true);
      await apiClient.post(`/api/coordinator/milestones/${conflictMilestone.id}/resolve-date-conflict`, {
        action: 'replace_examiner',
        replacedExaminerKey,
        newExaminer: buildExaminerPayload(replacementType, replacementInternalId, replacementExt),
      });
      setConflictModal(false);
      Alert.alert('✅', lang === 'he' ? 'הבוחן הוחלף — ממתין לתאריכים מהבוחן החדש' : 'Examiner replaced — awaiting the new examiner\'s dates');
      fetchCoordinatorDashboard();
    } catch (err) {
      Alert.alert('Error', (err as any).response?.data?.message || 'Failed to replace examiner');
    } finally {
      setSaving(false);
    }
  };

  // Defense milestones that need coordinator attention right now: either
  // stuck in a date conflict, or date-confirmed and waiting on time/room/
  // building. (`awaiting_defense_date`/`scheduled` need no coordinator action.)
  const defenseSchedulingItems = projects.flatMap((p) =>
    (p.milestones ?? [])
      .filter((m) => m.type === 'defense' && (m.status === 'date_conflict' || m.status === 'defense_date_set'))
      .map((m) => ({ project: p, milestone: m }))
  );

  // Defense milestones where examiners are already assigned and the panel is
  // just waiting on the (automatic) date-matching process — no coordinator
  // action needed here, but the coordinator should still be able to SEE who
  // is already in the defense pipeline and who their examiners are.
  const awaitingDateItems = projects.flatMap((p) =>
    (p.milestones ?? [])
      .filter((m) => m.type === 'defense' && m.status === 'awaiting_defense_date')
      .map((m) => ({ project: p, milestone: m }))
  );

  // The matched defense date lives on the milestone's `dueDate` field (set by
  // the date-matching flow), not `defenseDate` — and it can arrive either as
  // an ISO string, a client Timestamp instance, or an Admin-SDK-serialized
  // `{ _seconds, _nanoseconds }` object depending on the code path, so
  // normalize all three shapes here.
  const parseServerDate = (value: any): Date | null => {
    if (!value) return null;
    if (typeof value === 'string') {
      const d = new Date(value);
      return isNaN(d.getTime()) ? null : d;
    }
    if (typeof value.toDate === 'function') return value.toDate();
    if (typeof value._seconds === 'number') return new Date(value._seconds * 1000);
    return null;
  };

  // Defenses that already took place (scheduled, date in the past) but where
  // at least one panel member — internal or external — hasn't submitted a
  // grade yet. Grading itself is tracked per-examiner in `examinerGrading`
  // (keyed by defensePanel ref), not the legacy examiner1Score/examiner2Score
  // fields, which only apply to earlier milestone types.
  const now = Date.now();
  const expiredUngradedItems = projects.flatMap((p) =>
    (p.milestones ?? [])
      .filter((m) => {
        if (m.type !== 'defense' || m.status !== 'scheduled') return false;
        const defenseDate = parseServerDate(m.dueDate);
        if (!defenseDate || defenseDate.getTime() >= now) return false;
        const grading = m.examinerGrading ?? {};
        return (m.defensePanel ?? []).some((member) => !grading[member.ref]?.gradedAt);
      })
      .map((m) => ({ project: p, milestone: m }))
  );

  // Defenses that are fully confirmed (time/room/building set, status
  // 'scheduled') but whose date hasn't arrived yet. These previously had no
  // bucket at all — invisible from the moment logistics were set until the
  // date passed — so the coordinator lost visibility on confirmed defenses.
  const scheduledUpcomingItems = projects.flatMap((p) =>
    (p.milestones ?? [])
      .filter((m) => {
        if (m.type !== 'defense' || m.status !== 'scheduled') return false;
        const defenseDate = parseServerDate(m.dueDate);
        return !!defenseDate && defenseDate.getTime() >= now;
      })
      .map((m) => ({ project: p, milestone: m }))
  );

  // Defense milestones stuck at their initial 'pending' state even though the
  // project already has examiners assigned — meaning assignExaminers ran and
  // wrote onto the project, but maybeOpenDefenseScheduling() never actually
  // opened the panel on the milestone itself (e.g. it threw, or the panel was
  // written some other way). Without this bucket these are permanently
  // invisible: 'pending' isn't a status any other bucket looks for.
  const stuckPendingItems = projects.flatMap((p) =>
    (p.milestones ?? [])
      .filter((m) => m.type === 'defense' && m.status === 'pending' && (p.examinerIds ?? []).length > 0)
      .map((m) => ({ project: p, milestone: m }))
  );

  const daysUntilDefense = (date: Date | null): number | null =>
    date ? Math.ceil((date.getTime() - now) / (1000 * 60 * 60 * 24)) : null;

  // ── Unified, colorable, sortable list of every defense-related card ──
  // Merges the five buckets above so the whole tab can be sorted by one
  // criterion (name / needs-examiners / days-left) instead of five fixed,
  // unsorted sections.
  const defenseCards = [
    ...defenseSetups.map((m) => ({
      kind: 'setup' as const,
      key: m.id,
      titleHe: m.projectTitleHe,
      titleEn: m.projectTitleEn,
      daysLeft: null as number | null,
      needsExaminers: true,
      setup: m,
    })),
    ...stuckPendingItems.map(({ project, milestone }) => ({
      kind: 'stuckPending' as const,
      key: milestone.id,
      titleHe: project.titleHe,
      titleEn: project.titleEn,
      daysLeft: null as number | null,
      needsExaminers: true,
      project,
      milestone,
    })),
    ...awaitingDateItems.map(({ project, milestone }) => ({
      kind: 'awaitingDate' as const,
      key: milestone.id,
      titleHe: project.titleHe,
      titleEn: project.titleEn,
      daysLeft: null as number | null,
      needsExaminers: false,
      project,
      milestone,
    })),
    ...defenseSchedulingItems.map(({ project, milestone }) => ({
      kind: (milestone.status === 'date_conflict' ? 'conflict' : 'dateSet') as 'conflict' | 'dateSet',
      key: milestone.id,
      titleHe: project.titleHe,
      titleEn: project.titleEn,
      daysLeft: milestone.status === 'defense_date_set' ? daysUntilDefense(parseServerDate(milestone.dueDate)) : null,
      needsExaminers: false,
      project,
      milestone,
    })),
    ...scheduledUpcomingItems.map(({ project, milestone }) => ({
      kind: 'scheduledUpcoming' as const,
      key: milestone.id,
      titleHe: project.titleHe,
      titleEn: project.titleEn,
      daysLeft: daysUntilDefense(parseServerDate(milestone.dueDate)),
      needsExaminers: false,
      project,
      milestone,
    })),
    ...expiredUngradedItems.map(({ project, milestone }) => ({
      kind: 'expiredUngraded' as const,
      key: milestone.id,
      titleHe: project.titleHe,
      titleEn: project.titleEn,
      daysLeft: daysUntilDefense(parseServerDate(milestone.dueDate)),
      needsExaminers: false,
      project,
      milestone,
    })),
  ];

  // Color = status priority first (conflicts/overdue always red, pending
  // action always amber), then urgency-by-date for confirmed defenses.
  const getDefenseAccent = (card: typeof defenseCards[number]): string => {
    if (card.kind === 'conflict' || card.kind === 'expiredUngraded') return '#EF4444';
    if (card.kind === 'setup' || card.kind === 'awaitingDate' || card.kind === 'stuckPending') return '#F59E0B';
    if (card.daysLeft === null) return '#F59E0B';
    if (card.daysLeft <= 3) return '#EF4444';
    if (card.daysLeft <= 7) return '#F59E0B';
    return '#10B981';
  };

  const sortedDefenseCards = [...defenseCards].sort((a, b) => {
    if (defenseSort === 'name') {
      const an = (lang === 'he' ? a.titleHe : a.titleEn) || '';
      const bn = (lang === 'he' ? b.titleHe : b.titleEn) || '';
      return an.localeCompare(bn);
    }
    if (defenseSort === 'needsExaminers' && a.needsExaminers !== b.needsExaminers) {
      return a.needsExaminers ? -1 : 1;
    }
    // Soonest/most-overdue first; items with no confirmed date yet sink to the bottom.
    if (a.daysLeft === null && b.daysLeft === null) return 0;
    if (a.daysLeft === null) return 1;
    if (b.daysLeft === null) return -1;
    return a.daysLeft - b.daysLeft;
  });

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#8B5CF6" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <TopBar
        name={coordinatorName}
        role="coordinator"
        lang={lang}
        isRtl={isRtl}
        onToggleLang={() => setLang(lang === 'he' ? 'en' : 'he')}
      />

      <Pressable
        style={{ marginHorizontal: 16, marginTop: 4, marginBottom: 8, backgroundColor: '#EDE9FE', borderRadius: 10, paddingVertical: 10, alignItems: 'center' }}
        onPress={() => router.push('/WorkflowTemplateManager' as any)}
      >
        <Text style={{ color: '#7C3AED', fontWeight: '700', fontSize: 13 }}>
          🧬 {lang === 'he' ? 'ניהול תבניות אבני דרך' : 'Manage Milestone Templates'}
        </Text>
      </Pressable>

      <Pressable
        style={{ marginHorizontal: 16, marginBottom: 8, backgroundColor: '#DBEAFE', borderRadius: 10, paddingVertical: 10, alignItems: 'center' }}
        onPress={() => router.push('/Reports' as any)}
      >
        <Text style={{ color: '#2E86FF', fontWeight: '700', fontSize: 13 }}>
          📊 {lang === 'he' ? 'דוחות' : 'Reports'}
        </Text>
      </Pressable>

      <View style={styles.tabBar}>
        {([
          { key: 'pending', heLabel: 'ממתין לאישור', enLabel: 'Pending Approval', badge: pendingMilestones.length },
          { key: 'defense', heLabel: 'הגנות',         enLabel: 'Defenses',         badge: sortedDefenseCards.length },
          { key: 'inProgress', heLabel: 'פרויקטים פעילים', enLabel: 'In Progress',       badge: inProgressProjects.length },
          { key: 'recommendations', heLabel: 'המלצות בוחנים', enLabel: 'Examiner Recs', badge: examinerRecs.length },
        ] as const).map((tab) => (
          <Pressable
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
              {lang === 'he' ? tab.heLabel : tab.enLabel}
            </Text>
            {tab.badge > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{tab.badge}</Text>
              </View>
            )}
          </Pressable>
        ))}
        <Pressable
          style={[styles.tab, activeTab === 'deadlines' && styles.tabActive]}
          onPress={() => setActiveTab('deadlines')}
        >
          <Text style={styles.tabText}>{lang === 'he' ? 'מועדי הגשה' : 'DeadLines'}</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>

        {activeTab === 'pending' && (
          <>
            {pendingMilestones.length === 0 ? (
              <View style={styles.empty}>
                <Text style={styles.emptyEmoji}>✅</Text>
                <Text style={styles.emptyText}>
                  {lang === 'he' ? 'אין אבני דרך הממתינות לאישור' : 'No milestones awaiting approval'}
                </Text>
              </View>
            ) : (
              pendingMilestones.map((m) => (
                <Pressable
                  key={m.id}
                  style={[
                    styles.card,
                    expandedCards[m.id] && styles.cardExpanded,
                  ]}
                  onPress={() => toggleCardExpansion(m.id)}
                >
                  <View style={styles.cardHeader}>
                    <Text style={styles.milestoneType}>
                      {MILESTONE_LABEL[m.type]?.[lang]}
                    </Text>
                    <FacultyBadge facultyId={m.facultyId} lang={lang} />
                  </View>
                  <Text style={styles.cardTitle}>
                    {lang === 'he' ? m.projectTitleHe : m.projectTitleEn}
                  </Text>
                  <Text style={styles.cardMeta}>👤 {m.studentNames.join(', ')}</Text>
                  {m.supervisorScore !== null && (
                    <Text style={styles.cardMeta}>
                      ✏️ {lang === 'he' ? 'ציון מנחה:' : 'Supervisor score:'} {m.supervisorScore}
                    </Text>
                  )}
                  {expandedCards[m.id] && (
                    <View style={styles.expandedSection}>

                      {/* Supervisor comment */}
                      {(m.supervisorScore !== null || m.supervisorComment) ? (
                        <View style={styles.expandedBox}>
                          <Text style={styles.expandedTitle}>
                            {lang === 'he' ? '💬 מנחה' : '💬 Supervisor'}
                          </Text>
                          {m.supervisorScore !== null && (
                            <Text style={styles.expandedText}>
                              {lang === 'he' ? 'ציון:' : 'Score:'} {m.supervisorScore}/100
                            </Text>
                          )}
                          {m.supervisorComment ? (
                            <Text style={styles.expandedText}>{m.supervisorComment}</Text>
                          ) : null}
                        </View>
                      ) : null}

                      {/* Student submission note */}
                      {m.submissionNote ? (
                        <View style={styles.expandedBox}>
                          <Text style={styles.expandedTitle}>
                            {lang === 'he' ? '📝 הערת סטודנט' : '📝 Student Note'}
                          </Text>

                          <Text style={styles.expandedText}>
                            {m.submissionNote}
                          </Text>
                        </View>
                      ) : null}

                      {/* Uploaded files */}
                      {m.fileUrls && m.fileUrls.length > 0 && (
                        <View style={styles.expandedBox}>
                          <Text style={styles.expandedTitle}>
                            {lang === 'he' ? '📎 קבצים שהועלו' : '📎 Uploaded Files'}
                          </Text>

                          {m.fileUrls.map((url, index) => (
                            <Pressable
                              key={index}
                              style={styles.fileBtn}
                              onPress={() => {
                                console.log('url:', url); // add this
                                router.push({
                                  pathname: '/pdfViewer',
                                  params: { url },
                                })}
                              }
                            >
                              <Text style={styles.fileBtnText}>
                                📄 {lang === 'he'
                                  ? `קובץ ${index + 1}`
                                  : `File ${index + 1}`}
                              </Text>
                            </Pressable>
                          ))}
                        </View>
                      )}
                    </View>
                  )}

                  {/* ── Action buttons ── */}
                  <View style={styles.actionRow}>
                    <Pressable
                      style={styles.approveBtn}
                      onPress={() => handleApprove(m)}
                    >
                      <Text style={styles.approveBtnText}>
                        {m.type === 'final_report'
                          ? (lang === 'he' ? '👥 אשר + הקצה בוחנים' : '👥 Approve + Assign Examiners')
                          : (lang === 'he' ? '✅ אשר' : '✅ Approve')}
                      </Text>
                    </Pressable>
                    <Pressable
                      style={styles.rejectBtn}
                      onPress={() => handleReject(m)}
                    >
                      <Text style={styles.rejectBtnText}>
                        {m.type === 'final_report'
                          ? (lang === 'he' ? '👥 דחה + אל תקצה בוחנים' : '👥 Reject + Do Not Assign Examiners')
                          : (lang === 'he' ? '❌ דחה' : '❌ Reject')}
                      </Text>
                    </Pressable>
                  </View>
                </Pressable>
              ))
            )}
          </>
        )}

        {activeTab === 'defense' && (
  <>
    {/* ── Sort selector ── */}
    <View style={styles.sortRow}>
      {([
        { key: 'daysLeft' as const,       heLabel: 'ימים להגנה',      enLabel: 'Days left' },
        { key: 'needsExaminers' as const, heLabel: 'טרם הוקצו בוחנים', enLabel: 'Needs examiners' },
        { key: 'name' as const,           heLabel: 'שם פרויקט',        enLabel: 'Name' },
      ]).map((opt) => (
        <Pressable
          key={opt.key}
          style={[styles.sortChip, defenseSort === opt.key && styles.sortChipActive]}
          onPress={() => setDefenseSort(opt.key)}
        >
          <Text style={[styles.sortChipText, defenseSort === opt.key && styles.sortChipTextActive]}>
            {lang === 'he' ? opt.heLabel : opt.enLabel}
          </Text>
        </Pressable>
      ))}
    </View>

    {sortedDefenseCards.length === 0 ? (
      <View style={styles.empty}>
        <Text style={styles.emptyEmoji}>🎓</Text>
        <Text style={styles.emptyText}>
          {lang === 'he' ? 'אין הגנות לתיאום' : 'No defenses to schedule'}
        </Text>
      </View>
    ) : (
      sortedDefenseCards.map((card) => {
        const accentStyle = { borderLeftWidth: 4, borderLeftColor: getDefenseAccent(card) };

        // ── Bucket 1: final report graded — needs approval + examiner assignment ──
        if (card.kind === 'setup') {
          const m = card.setup;
          return (
            <Pressable
              key={card.key}
              style={[styles.card, accentStyle, expandedCards[m.id] && styles.cardExpanded]}
              onPress={() => toggleCardExpansion(m.id)}
            >
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>
                  {lang === 'he' ? m.projectTitleHe : m.projectTitleEn}
                </Text>
                <FacultyBadge facultyId={m.facultyId} lang={lang} />
              </View>

              <Text style={styles.cardMeta}>👤 {m.studentNames.join(', ')}</Text>
              {m.supervisorName ? (
                <Text style={styles.cardMeta}>👨‍🏫 {lang === 'he' ? 'מנחה:' : 'Supervisor:'} {m.supervisorName}</Text>
              ) : null}
              {m.examinerIds.length > 0 && (
                <Text style={styles.cardMeta}>
                  🔬 {lang === 'he' ? 'בוחנים הוקצו' : 'Examiners assigned'}: {m.examinerIds.length}
                </Text>
              )}
              {m.defenseDate ? (
                <View style={styles.defenseDateBadge}>
                  <Text style={styles.defenseDateText}>
                    📅 {m.defenseDate}{m.defenseRoom ? ` | ${m.defenseRoom}` : ''}
                  </Text>
                </View>
              ) : null}

              {expandedCards[m.id] && (
                <View style={styles.expandedSection}>
                  <View style={styles.expandedBox}>
                    <Text style={styles.expandedTitle}>
                      {lang === 'he' ? '👤 סטודנטים' : '👤 Students'}
                    </Text>
                    {m.studentNames.map((name, i) => (
                      <Text key={i} style={styles.expandedText}>• {name}</Text>
                    ))}
                  </View>

                  {m.supervisorName ? (
                    <View style={styles.expandedBox}>
                      <Text style={styles.expandedTitle}>
                        {lang === 'he' ? '👨‍🏫 מנחה' : '👨‍🏫 Supervisor'}
                      </Text>
                      <Text style={styles.expandedText}>{m.supervisorName}</Text>
                    </View>
                  ) : null}

                  {m.milestoneGrades && m.milestoneGrades.length > 0 && (
                    <View style={styles.expandedBox}>
                      <Text style={styles.expandedTitle}>
                        {lang === 'he' ? '📊 ציונים לפי אבן דרך' : '📊 Grades by Milestone'}
                      </Text>
                      {m.milestoneGrades.map((mg, i) => (
                        <View key={i} style={styles.gradeRow}>
                          <Text style={styles.expandedText}>
                            {MILESTONE_LABEL[mg.type]?.[lang] ?? mg.type}
                          </Text>
                          <Text style={[
                            styles.expandedText,
                            { fontWeight: '700', color: mg.score !== null ? '#10B981' : '#8899BB' }
                          ]}>
                            {mg.score !== null ? `${mg.score}/100` : (lang === 'he' ? 'טרם נוקד' : 'Not graded')}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              )}

              <View style={styles.actionRow}>
                <Pressable style={styles.approveBtn} onPress={() => handleApprove(m)}>
                  <Text style={styles.approveBtnText}>
                    {lang === 'he' ? '👥 אשר + הקצה בוחנים' : '👥 Approve + Assign Examiners'}
                  </Text>
                </Pressable>
                <Pressable style={styles.rejectBtn} onPress={() => handleReject(m)}>
                  <Text style={styles.rejectBtnText}>
                    {lang === 'he' ? '👥 דחה + אל תקצה בוחנים' : '👥 Reject + Do Not Assign Examiners'}
                  </Text>
                </Pressable>
              </View>
            </Pressable>
          );
        }

        // ── Bucket: examiners assigned on the project but the defense
        //    milestone never opened — stuck at 'pending', needs a coordinator
        //    action to re-open scheduling. ──
        if (card.kind === 'stuckPending') {
          const { milestone, project } = card;
          return (
            <View key={card.key} style={[styles.card, accentStyle]}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>
                  {lang === 'he' ? project.titleHe : project.titleEn}
                </Text>
                <FacultyBadge facultyId={project.facultyId} lang={lang} />
              </View>
              <Text style={styles.cardMeta}>👤 {milestone.studentNames.join(', ')}</Text>
              <Text style={[styles.cardMeta, { color: '#F59E0B', fontWeight: '700' }]}>
                ⚠️ {lang === 'he'
                  ? 'בוחנים משובצים בפרויקט אך לא נפתח מסלול ההגנה'
                  : 'Examiners assigned but the defense pipeline never opened'}
              </Text>
              <Pressable style={styles.approveBtn} onPress={() => handleReopenDefenseScheduling(project, milestone)}>
                <Text style={styles.approveBtnText}>
                  {lang === 'he' ? '🔄 פתח מסלול הגנה' : '🔄 Re-open defense scheduling'}
                </Text>
              </Pressable>
            </View>
          );
        }

        // ── Bucket 2: examiners assigned, waiting on dates from them ──
        if (card.kind === 'awaitingDate') {
          const { milestone, project } = card;
          return (
            <View key={card.key} style={[styles.card, accentStyle]}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>
                  {lang === 'he' ? project.titleHe : project.titleEn}
                </Text>
                <FacultyBadge facultyId={project.facultyId} lang={lang} />
              </View>
              <Text style={styles.cardMeta}>👤 {milestone.studentNames.join(', ')}</Text>
              <Text style={styles.cardMeta}>
                🔬 {lang === 'he' ? 'בוחנים:' : 'Examiners:'} {(milestone.defensePanel ?? []).map((e) => e.displayName).join(', ') || '—'}
              </Text>
              <Text style={[styles.cardMeta, { color: '#F59E0B', fontWeight: '700' }]}>
                ⏳ {lang === 'he' ? 'ממתין לתאריכים מהבוחנים' : 'Waiting on dates from examiners'}
              </Text>
            </View>
          );
        }

        // ── Bucket 3: date conflict — needs coordinator to resolve ──
        if (card.kind === 'conflict') {
          const { milestone, project } = card;
          return (
            <View key={card.key} style={[styles.card, accentStyle]}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>
                  {lang === 'he' ? project.titleHe : project.titleEn}
                </Text>
                <FacultyBadge facultyId={project.facultyId} lang={lang} />
              </View>
              <Text style={[styles.cardMeta, { color: '#EF4444', fontWeight: '700' }]}>
                ⚠️ {lang === 'he' ? 'לא נמצא תאריך משותף בין הבוחנים' : 'No common date found between examiners'}
              </Text>
              <Pressable style={styles.approveBtn} onPress={() => openConflictModal(project, milestone)}>
                <Text style={styles.approveBtnText}>
                  {lang === 'he' ? '🛠️ פתור התנגשות' : '🛠️ Resolve conflict'}
                </Text>
              </Pressable>
            </View>
          );
        }

        // ── Bucket 4: date matched — needs coordinator to set logistics ──
        if (card.kind === 'dateSet') {
          const { milestone, project } = card;
          return (
            <View key={card.key} style={[styles.card, accentStyle]}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>
                  {lang === 'he' ? project.titleHe : project.titleEn}
                </Text>
                <FacultyBadge facultyId={project.facultyId} lang={lang} />
              </View>
              <Text style={[styles.cardMeta, { color: '#10B981', fontWeight: '700' }]}>
                📅 {lang === 'he' ? 'מועד הגנה אושר — יש לקבוע שעה, חדר ובניין' : 'Defense date confirmed — set time, room & building'}
                {card.daysLeft !== null ? ` (${card.daysLeft}${lang === 'he' ? ' ימים' : 'd'})` : ''}
              </Text>
              <Pressable style={styles.approveBtn} onPress={() => openDefenseLogisticsModal(project, milestone)}>
                <Text style={styles.approveBtnText}>
                  {lang === 'he' ? '📍 קבע פרטים' : '📍 Set logistics'}
                </Text>
              </Pressable>
            </View>
          );
        }

        // ── Bucket 5: fully confirmed, upcoming — no coordinator action needed ──
        if (card.kind === 'scheduledUpcoming') {
          const { milestone, project } = card;
          const defenseDateObj = parseServerDate(milestone.dueDate);
          return (
            <View key={card.key} style={[styles.card, accentStyle]}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>
                  {lang === 'he' ? project.titleHe : project.titleEn}
                </Text>
                <FacultyBadge facultyId={project.facultyId} lang={lang} />
              </View>
              <Text style={styles.cardMeta}>👤 {milestone.studentNames.join(', ')}</Text>
              <Text style={styles.cardMeta}>
                🔬 {lang === 'he' ? 'בוחנים:' : 'Examiners:'} {(milestone.defensePanel ?? []).map((e) => e.displayName).join(', ') || '—'}
              </Text>
              {defenseDateObj && (
                <View style={styles.defenseDateBadge}>
                  <Text style={styles.defenseDateText}>
                    📅 {defenseDateObj.toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-GB')}
                    {milestone.defenseTime ? ` ${milestone.defenseTime}` : ''}
                    {milestone.defenseRoom ? ` | ${milestone.defenseRoom}` : ''}
                  </Text>
                </View>
              )}
              <Text style={[styles.cardMeta, { color: getDefenseAccent(card), fontWeight: '700' }]}>
                ⏳ {card.daysLeft} {lang === 'he' ? 'ימים להגנה' : card.daysLeft === 1 ? 'day left' : 'days left'}
              </Text>
            </View>
          );
        }

        // ── Bucket 6: defense date has passed, still awaiting a grade ──
        const { milestone, project } = card;
        const panel = milestone.defensePanel ?? [];
        const grading = milestone.examinerGrading ?? {};
        const pendingExaminers = panel.filter((e) => !grading[e.ref]?.gradedAt);
        const defenseDateObj = parseServerDate(milestone.dueDate);

        return (
          <View key={card.key} style={[styles.card, accentStyle]}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>
                {lang === 'he' ? project.titleHe : project.titleEn}
              </Text>
              <FacultyBadge facultyId={project.facultyId} lang={lang} />
            </View>
            <Text style={styles.cardMeta}>👤 {milestone.studentNames.join(', ')}</Text>
            {defenseDateObj && (
              <Text style={[styles.cardMeta, { color: '#EF4444', fontWeight: '700' }]}>
                📅 {lang === 'he' ? 'תאריך הגנה שחלף:' : 'Defense date passed:'}{' '}
                {defenseDateObj.toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-GB')}
              </Text>
            )}
            <Text style={[styles.cardMeta, { color: '#EF4444', fontWeight: '700' }]}>
              ⚠️ {lang === 'he' ? 'ממתין לציון מ:' : 'Awaiting grade from:'}{' '}
              {pendingExaminers.map((e) => e.displayName).join(', ') || (lang === 'he' ? 'בוחן/ים' : 'examiner(s)')}
            </Text>
          </View>
        );
      })
    )}
  </>
        )}
        {activeTab === 'inProgress' && (
          <>
            {inProgressProjects.length === 0 ? (
              <View style={styles.empty}>
                <Text style={styles.emptyEmoji}>📁</Text>
                <Text style={styles.emptyText}>
                  {lang === 'he' ? 'אין פרויקטים פעילים' : 'No projects in progress'}
                </Text>
              </View>
            ) : (
              inProgressProjects.map((p) => (
        <View
          key={p.id}
          style={[styles.card, expandedCards[p.id] && styles.cardExpanded]} // Re-applied the card expanded style here
        >
          {/* ── Header (Now Clickable again to expand the general project card view) ── */}
          <Pressable 
            style={styles.cardHeader}
            onPress={() => toggleCardExpansion(p.id)} // Restored general project card expansion toggle
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.milestoneType}>
                {lang === 'he' ? p.projectTitleHe : p.projectTitleEn}
              </Text>
            </View>
            <FacultyBadge facultyId={p.facultyId} lang={lang} />
          </Pressable>

          {/* ── Project Metadata ── */}
          <Text style={[styles.cardMeta, !isRtl && styles.textRight]}>
            👤 {p.students?.length > 0 
                ? (lang === 'he' ? `${p.students.length} סטודנטים` : `${p.students.length} students`) 
                : (lang === 'he' ? 'אין סטודנטים' : 'No students')}
          </Text>
          <Text style={[styles.cardMeta, !isRtl && styles.textRight]}>
            👨‍🏫 {lang === 'he' ? 'מנחה:' : 'Supervisor:'} {p.supervisorName}
          </Text>

          {/* ── Only display the nested student content if the main card is expanded ── */}
          {expandedCards[p.id] && (
            <View style={{ marginTop: 15 }}>
              {p.students?.map((student: any, sIdx: number) => {
                const studentKey = `${p.id}-${sIdx}`;
                const isStudentExpanded = expandedStudents[studentKey];

                return (
                  <View key={sIdx} style={{ marginBottom: 12 }}>
                    
                    {/* Clickable Row: Student Name + Progress Bar */}
                    <Pressable 
                      onPress={() => toggleStudentExpansion(p.id, sIdx)}
                      style={[{ flexDirection: isRtl ? 'row-reverse' : 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 }]}
                    >
                      <Text style={{ fontSize: 14, fontWeight: '600', color: '#111', width: 80, textAlign: isRtl ? 'right' : 'left' }}>
                        {student.name}
                      </Text>
                      
                      <View style={{ flex: 1, marginHorizontal: 10 }}>
                        <View style={{ flexDirection: isRtl ? 'row-reverse' : 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                          <Text style={{ fontSize: 10, color: '#8899BB' }}>
                            {lang === 'he' ? 'התקדמות' : 'Progress'}
                          </Text>
                          <Text style={{ fontSize: 10, fontWeight: '700', color: '#2E86FF' }}>
                            {student.progress}%
                          </Text>
                        </View>
                        {/* Visual Bar */}
                        <View style={{ height: 6, backgroundColor: '#E0E8FF', borderRadius: 3, overflow: 'hidden' }}>
                          <View style={{
                            height: '100%',
                            width: `${student.progress}%`,
                            backgroundColor: student.progress === 100 ? '#10B981' : '#2E86FF',
                            borderRadius: 3,
                          }} />
                        </View>
                      </View>

                      <Text style={{ color: '#C0CCDD', fontSize: 10 }}>
                        {isStudentExpanded ? '▲' : '▼'}
                      </Text>
                    </Pressable>

                    {/* Nested Child: This Specific Student's Milestones Breakdown */}
                    {isStudentExpanded && (
                      <View style={[styles.expandedBox, { marginTop: 8, padding: 10, backgroundColor: '#FAFAFA', borderRadius: 6 }]}>
                        {student.milestones?.length === 0 ? (
                          <Text style={styles.expandedText}>
                            {lang === 'he' ? 'לא נוצרו אבני דרך לסטודנט זה' : 'No milestones created for this student'}
                          </Text>
                        ) : (
                          student.milestones.map((m: any, mIdx: number) => {
                            let displayStatus = '';
                            let statusColor = '';

                            if (m.status === 'coordinator_approved' || m.status === 'completed') {
                              const grade = m.finalGrade ?? m.supervisorScore;
                              displayStatus =  grade !== null && grade !== undefined
                                ? (lang === 'he'
                                    ? `אושר (${grade}/100)`
                                    : `Approved (${grade}/100)`)
                                : (lang === 'he' ? 'אושר' : 'Approved');
                              statusColor = '#10B981';
                            } else if (m.status === 'submitted' || m.status === 'supervisor_graded' || m.status === 'graded') {
                              displayStatus = lang === 'he' ? 'הוגש' : 'Submitted';
                              statusColor = '#F59E0B';
                            } else {
                              displayStatus = lang === 'he' ? 'טרם הוגש' : 'Not submitted yet';
                              statusColor = '#8899BB';
                            }

                            return (
                              <View
                                key={mIdx}
                                style={[{
                                  flexDirection: isRtl ? 'row-reverse' : 'row',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                  paddingVertical: 6,
                                  borderBottomWidth: mIdx < student.milestones.length - 1 ? 1 : 0,
                                  borderBottomColor: '#F0F4FF',
                                }]}
                              >
                                <Text style={[{ fontSize: 13, fontWeight: '500', color: '#333' }, !isRtl && styles.textRight]}>
                                  {MILESTONE_LABEL[m.type]?.[lang] ?? m.type}
                                </Text>
                                
                                <Text style={[{ fontSize: 13, fontWeight: '700', color: statusColor }, isRtl && styles.textRight]}>
                                  {displayStatus}
                                </Text>
                              </View>
                            );
                          })
                        )}
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          )}

          {/* Bottom visual toggle indicators for the main card layout expansion */}
          <Pressable onPress={() => toggleCardExpansion(p.id)} style={{ paddingVertical: 4 }}>
            <Text style={{ textAlign: 'center', color: '#C0CCDD', fontSize: 11, marginTop: 6 }}>
              {expandedCards[p.id] ? '▲' : '▼'}
            </Text>
          </Pressable>
        </View>
      ))
            )}
          </>
        )}

        {activeTab === 'deadlines' && (
          <>
            <Pressable
              style={[styles.submitBtn, { marginBottom: 14 }]}
              onPress={() => setShowBulkDueDate(true)}
            >
              <Text style={styles.submitBtnText}>
                📅 {lang === 'he' ? 'עדכון תאריכי יעד מרוכז' : 'Bulk Update Due Dates'}
              </Text>
            </Pressable>
            {loadingDeadlines ? (
              <ActivityIndicator size="large" />
            ) : deadlines.length === 0 ? (
              <View style={styles.centered}><Text>{lang === 'he' ? 'אין מועדי הגשה' : 'No deadlines'}</Text></View>
            ) : (
              deadlines.map((d) => (
                <View key={`${d.milestoneId}-${d.studentId}`} style={[styles.card, { borderLeftWidth: 4, borderLeftColor: '#F59E0B' }]}>
                  {/* Student Name - Bold Header */}
                  <Text style={[styles.cardTitle, { marginBottom: 12 }]}>👤 {d.studentName}</Text>

                  {/* Info Grid */}
                  <View style={{ marginBottom: 8 }}>
                    {/* Degree Type & Year of Study */}
                    <View style={{ marginBottom: 6 }}>
                      <Text style={styles.deadlineLabel}>
                        {lang === 'he' ? 'תואר:' : 'Degree:'} <Text style={styles.deadlineValue}>{d.degreeType || 'N/A'}</Text>
                      </Text>
                      <Text style={styles.deadlineLabel}>
                        {lang === 'he' ? 'שנה:' : 'Year:'} <Text style={styles.deadlineValue}>{d.yearOfStudy || '—'}</Text>
                      </Text>
                    </View>

                    {/* Project/Thesis Name */}
                    <View style={{ marginBottom: 6 }}>
                      <Text style={styles.deadlineLabel}>
                        {lang === 'he' ? 'פרויקט:' : 'Project:'} <Text style={styles.deadlineValue}>{d.projectTitle || 'N/A'}</Text>
                      </Text>
                    </View>

                    {/* Current Milestone */}
                    <View style={{ marginBottom: 6 }}>
                      <Text style={styles.deadlineLabel}>
                        {lang === 'he' ? 'אבן דרך:' : 'Milestone:'} <Text style={styles.deadlineValue}>{d.milestoneName || 'N/A'}</Text>
                      </Text>
                    </View>

                    {/* Days Until Due - Color Coded */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text style={styles.deadlineLabel}>
                        {lang === 'he' ? 'ימים לסיום:' : 'Days Left:'}
                      </Text>
                      <Text
                        style={[
                          styles.deadlineDaysLeft,
                          {
                            color: d.daysLeft !== null && d.daysLeft < 0 ? '#EF4444' : '#10B981',
                            fontWeight: '700',
                          },
                        ]}
                      >
                        {d.daysLeft !== null ? `${d.daysLeft} ${lang === 'he' ? 'ימים' : 'days'}` : 'N/A'}
                      </Text>
                    </View>

                    {/* Class (for coordinator) */}
                    {d.class ? (
                      <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#E2E8F0' }}>
                        <Text style={styles.deadlineLabel}>
                          {lang === 'he' ? 'קבוצה:' : 'Class:'} <Text style={styles.deadlineValue}>{d.class}</Text>
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              ))
            )}
          </>
        )}

        {activeTab === 'recommendations' && (
          <>
            {examinerRecs.length === 0 ? (
              <View style={styles.empty}>
                <Text style={styles.emptyEmoji}>👥</Text>
                <Text style={styles.emptyText}>
                  {lang === 'he' ? 'אין המלצות בוחנים ממתינות' : 'No pending examiner recommendations'}
                </Text>
              </View>
            ) : (
              examinerRecs.map((rec: any) => (
                <View key={rec.id} style={[styles.card, expandedCards[rec.id] && styles.cardExpanded]}>
                  <Pressable onPress={() => toggleCardExpansion(rec.id)}>
                    <Text style={styles.cardTitle}>
                      {lang === 'he' ? rec.projectTitleHe : rec.projectTitleEn}
                    </Text>
                    <Text style={styles.cardMeta}>
                      👨‍🏫 {lang === 'he' ? 'מנחה:' : 'Supervisor:'} {rec.supervisorName}
                    </Text>
                    <Text style={styles.cardMeta}>
                      👥 {rec.recommendedExaminers?.length ?? 0}{' '}
                      {lang === 'he' ? 'בוחנים הומלצו' : 'examiners recommended'}
                    </Text>
                  </Pressable>

                  {expandedCards[rec.id] && (
                    <View style={styles.expandedSection}>
                      {(rec.recommendedExaminers ?? []).map((ex: any, i: number) => (
                        <View key={i} style={[styles.expandedBox, { marginBottom: 8 }]}>
                          <Text style={styles.expandedTitle}>
                            {lang === 'he' ? `עדיפות ${ex.priority}` : `Priority ${ex.priority}`}
                            {' · '}
                            {ex.type === 'internal' ? tx('examinerInternal', lang) : tx('examinerExternal', lang)}
                          </Text>
                          <Text style={styles.expandedText}>👤 {ex.name}</Text>
                          {ex.email ? <Text style={styles.expandedText}>✉️ {ex.email}</Text> : null}
                          {ex.institution ? <Text style={styles.expandedText}>🏛 {ex.institution}</Text> : null}
                          {ex.expertise ? <Text style={styles.expandedText}>🔬 {ex.expertise}</Text> : null}
                        </View>
                      ))}

                      <View style={styles.actionRow}>
                        <Pressable
                          style={styles.approveBtn}
                          onPress={async () => {
                            try {
                              await apiClient.post(`/api/coordinator/examiner-recommendations/${rec.id}/approve`);
                              Alert.alert('✅', lang === 'he' ? 'ההמלצה אושרה' : 'Recommendation approved');
                              fetchCoordinatorDashboard();
                            } catch {
                              Alert.alert('Error', 'Failed to approve');
                            }
                          }}
                        >
                          <Text style={styles.approveBtnText}>
                            {lang === 'he' ? '✅ אשר המלצה' : '✅ Approve'}
                          </Text>
                        </Pressable>
                        <Pressable
                          style={styles.rejectBtn}
                          onPress={async () => {
                            try {
                              await apiClient.post(`/api/coordinator/examiner-recommendations/${rec.id}/reject`);
                              Alert.alert('✅', lang === 'he' ? 'ההמלצה נדחתה' : 'Recommendation rejected');
                              fetchCoordinatorDashboard();
                            } catch {
                              Alert.alert('Error', 'Failed to reject');
                            }
                          }}
                        >
                          <Text style={styles.rejectBtnText}>
                            {lang === 'he' ? '❌ דחה' : '❌ Reject'}
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                  )}
                </View>
              ))
            )}
          </>
        )}

        <View style={{ height: 60 }} />
      </ScrollView>

      <FloatingActionMenu
        lang={lang}
        isRtl={isRtl}
        corner="bottom-right"
        color="#8B5CF6"
        actions={[
          { key: 'import', icon: '📥', label: lang === 'he' ? 'ייבוא סגל' : 'Import Staff', onPress: handleImportStaff, loading: importingStaff },
          { key: 'importRoster', icon: '🎓', label: lang === 'he' ? 'ייבוא רשימת סטודנטים' : 'Import Student Roster', onPress: handleImportStudentRoster, loading: importingRoster },
          { key: 'export', icon: '📤', label: lang === 'he' ? 'ייצוא לאקסל' : 'Export Roster', onPress: handleExportUsers, loading: exportingUsers },
        ]}
      />

      {/* ── Approve modal (simple confirm for milestone 1 & 2) ── */}
      <Modal visible={approveModal} animationType="fade" transparent>
        <View style={styles.overlay}>
          <View style={styles.dialog}>
            <Text style={styles.dialogTitle}>
              {lang === 'he' ? 'אישור אבן דרך' : 'Approve Milestone'}
            </Text>
            <View style={styles.dialogBtns}>
              <Pressable style={styles.dialogCancel} onPress={() => setApproveModal(false)}>
                <Text>{lang === 'he' ? 'ביטול' : 'Cancel'}</Text>
              </Pressable>
              <Pressable
                style={styles.dialogConfirm}
                onPress={() => { setApproveModal(false); selectedMilestone && handleApprove(selectedMilestone); }}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>
                  {lang === 'he' ? 'אשר' : 'Confirm'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Assign examiners modal ── */}
      <Modal visible={assignModal} animationType="slide" presentationStyle="pageSheet">
        <ScrollView style={styles.modal} contentContainerStyle={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setAssignModal(false)}>
              <Text style={styles.backButton}>
                ← {lang === 'he' ? 'חזור' : 'Back'}
              </Text>
            </Pressable>
          </View>
          <Text style={styles.modalTitle}>
            {lang === 'he' ? '👥 הקצאת בוחנים ומשקלות' : '👥 Assign Examiners & Weights'}
          </Text>

          <Text style={styles.fieldLabel}>
            {lang === 'he' ? 'בוחן 1' : 'Examiner 1'}
          </Text>
          <View style={{ flexDirection: isRtl ? 'row-reverse' : 'row', gap: 8, marginBottom: 8 }}>
            <Pressable
              style={[styles.examinerOption, { flex: 1 }, examiner1Type === 'internal' && styles.examinerOptionActive]}
              onPress={() => setExaminer1Type('internal')}
            >
              <Text style={[styles.examinerOptionText, examiner1Type === 'internal' && { color: '#fff' }]}>
                {lang === 'he' ? 'בוחן פנימי' : 'Internal'}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.examinerOption, { flex: 1 }, examiner1Type === 'external' && styles.examinerOptionActive]}
              onPress={() => setExaminer1Type('external')}
            >
              <Text style={[styles.examinerOptionText, examiner1Type === 'external' && { color: '#fff' }]}>
                {lang === 'he' ? 'בוחן חיצוני' : 'External'}
              </Text>
            </Pressable>
          </View>

          {examiner1Type === 'internal' ? (
            allExaminers
              .filter((ex) => ex.id !== examiner2Id)
              .map((ex) => (
              <Pressable
                key={ex.id}
                style={[styles.examinerOption, examiner1Id === ex.id && styles.examinerOptionActive]}
                onPress={() => setExaminer1Id(ex.id)}
              >
                <Text style={[styles.examinerOptionText, examiner1Id === ex.id && { color: '#fff' }]}>
                  {ex.displayName} · {ex.email}
                </Text>
              </Pressable>
            ))
          ) : (
            [
              { label: lang === 'he' ? 'שם *' : 'Name *', value: examiner1Ext.name, key: 'name' as const },
              { label: lang === 'he' ? 'אימייל *' : 'Email *', value: examiner1Ext.email, key: 'email' as const },
              { label: lang === 'he' ? 'מוסד' : 'Institution', value: examiner1Ext.institution, key: 'institution' as const },
            ].map((f) => (
              <View key={f.key} style={{ marginBottom: 8 }}>
                <Text style={styles.weightLabel}>{f.label}</Text>
                <TextInput
                  style={styles.weightInput}
                  value={f.value}
                  onChangeText={(v) => setExaminer1Ext((prev) => ({ ...prev, [f.key]: v }))}
                  keyboardType={f.key === 'email' ? 'email-address' : 'default'}
                  autoCapitalize={f.key === 'email' ? 'none' : 'sentences'}
                />
              </View>
            ))
          )}

          <Text style={styles.fieldLabel}>
            {lang === 'he' ? 'בוחן 2' : 'Examiner 2'}
          </Text>
          <View style={{ flexDirection: isRtl ? 'row-reverse' : 'row', gap: 8, marginBottom: 8 }}>
            <Pressable
              style={[styles.examinerOption, { flex: 1 }, examiner2Type === 'internal' && styles.examinerOptionActive]}
              onPress={() => setExaminer2Type('internal')}
            >
              <Text style={[styles.examinerOptionText, examiner2Type === 'internal' && { color: '#fff' }]}>
                {lang === 'he' ? 'בוחן פנימי' : 'Internal'}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.examinerOption, { flex: 1 }, examiner2Type === 'external' && styles.examinerOptionActive]}
              onPress={() => setExaminer2Type('external')}
            >
              <Text style={[styles.examinerOptionText, examiner2Type === 'external' && { color: '#fff' }]}>
                {lang === 'he' ? 'בוחן חיצוני' : 'External'}
              </Text>
            </Pressable>
          </View>

          {examiner2Type === 'internal' ? (
            allExaminers
              .filter((ex) => ex.id !== examiner1Id)
              .map((ex) => (
              <Pressable
                key={ex.id}
                style={[styles.examinerOption, examiner2Id === ex.id && styles.examinerOptionActive]}
                onPress={() => setExaminer2Id(ex.id)}
              >
                <Text style={[styles.examinerOptionText, examiner2Id === ex.id && { color: '#fff' }]}>
                  {ex.displayName} · {ex.email}
                </Text>
              </Pressable>
            ))
          ) : (
            [
              { label: lang === 'he' ? 'שם *' : 'Name *', value: examiner2Ext.name, key: 'name' as const },
              { label: lang === 'he' ? 'אימייל *' : 'Email *', value: examiner2Ext.email, key: 'email' as const },
              { label: lang === 'he' ? 'מוסד' : 'Institution', value: examiner2Ext.institution, key: 'institution' as const },
            ].map((f) => (
              <View key={f.key} style={{ marginBottom: 8 }}>
                <Text style={styles.weightLabel}>{f.label}</Text>
                <TextInput
                  style={styles.weightInput}
                  value={f.value}
                  onChangeText={(v) => setExaminer2Ext((prev) => ({ ...prev, [f.key]: v }))}
                  keyboardType={f.key === 'email' ? 'email-address' : 'default'}
                  autoCapitalize={f.key === 'email' ? 'none' : 'sentences'}
                />
              </View>
            ))
          )}

          <Text style={styles.fieldLabel}>
            {lang === 'he' ? 'משקלות ציון (סה"כ 100%)' : 'Grade Weights (must total 100%)'}
          </Text>

          {[
            { label: lang === 'he' ? 'משקל מנחה (%)' : 'Supervisor weight (%)', value: weightSupervisor, set: setWeightSupervisor },
            { label: lang === 'he' ? 'משקל בוחן 1 (%)' : 'Examiner 1 weight (%)', value: weightExaminer1, set: setWeightExaminer1 },
            { label: lang === 'he' ? 'משקל בוחן 2 (%)' : 'Examiner 2 weight (%)', value: weightExaminer2, set: setWeightExaminer2 },
          ].map((field) => (
            <View key={field.label}>
              <Text style={styles.weightLabel}>{field.label}</Text>
              <TextInput
                style={styles.weightInput}
                value={field.value}
                onChangeText={field.set}
                keyboardType="numeric"
                placeholder="0"
              />
            </View>
          ))}

          <Text style={styles.weightSum}>
            {lang === 'he' ? 'סה"כ:' : 'Total:'}{' '}
            {(parseFloat(weightSupervisor || '0') + parseFloat(weightExaminer1 || '0') + parseFloat(weightExaminer2 || '0'))}%
          </Text>

          <Pressable
            style={[styles.submitBtn, saving && { opacity: 0.6 }]}
            onPress={handleAssignExaminers}
            disabled={saving}
          >
            {saving
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.submitBtnText}>{lang === 'he' ? 'שמור והקצה' : 'Save & Assign'}</Text>
            }
          </Pressable>

          <Pressable style={styles.cancelBtn} onPress={() => setAssignModal(false)}>
            <Text style={styles.cancelBtnText}>{lang === 'he' ? 'ביטול' : 'Cancel'}</Text>
          </Pressable>
        </ScrollView>
      </Modal>

      {/* ── Defense logistics modal — date already confirmed by examiners,
             coordinator sets time/room/building only ── */}
      <Modal visible={defenseModal} animationType="slide" presentationStyle="formSheet">
        <ScrollView style={styles.modal} contentContainerStyle={styles.modalContent}>
          <Text style={styles.modalTitle}>
            {lang === 'he' ? '📍 פרטי ההגנה' : '📍 Defense Logistics'}
          </Text>
          {selectedDefenseMilestone?.defenseDate ? (
            <Text style={styles.fieldLabel}>
              {lang === 'he' ? 'תאריך שנקבע:' : 'Confirmed date:'} {selectedDefenseMilestone.defenseDate}
            </Text>
          ) : null}

          <Text style={styles.fieldLabel}>
            {lang === 'he' ? 'שעה' : 'Time'}
          </Text>
          <TextInput
            style={styles.input}
            value={defenseTime}
            onChangeText={setDefenseTime}
            placeholder="HH:MM"
          />

          <Text style={styles.fieldLabel}>
            {lang === 'he' ? 'חדר' : 'Room'}
          </Text>
          <TextInput
            style={styles.input}
            value={defenseRoom}
            onChangeText={setDefenseRoom}
            placeholder={lang === 'he' ? 'חדר 101' : 'Room 101'}
          />

          <Text style={styles.fieldLabel}>
            {lang === 'he' ? 'בניין' : 'Building'}
          </Text>
          <DefenseBuildingPicker value={defenseBuilding} onChange={setDefenseBuilding} lang={lang} />

          <Pressable
            style={[styles.submitBtn, saving && { opacity: 0.6 }]}
            onPress={handleSetDefense}
            disabled={saving}
          >
            {saving
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.submitBtnText}>{lang === 'he' ? 'שמור' : 'Save'}</Text>
            }
          </Pressable>

          <Pressable style={styles.cancelBtn} onPress={() => setDefenseModal(false)}>
            <Text style={styles.cancelBtnText}>{lang === 'he' ? 'ביטול' : 'Cancel'}</Text>
          </Pressable>
        </ScrollView>
      </Modal>

      {/* ── Date-conflict resolution modal ── */}
      <Modal visible={conflictModal} animationType="slide" presentationStyle="pageSheet">
        <ScrollView style={styles.modal} contentContainerStyle={styles.modalContent}>
          <Text style={styles.modalTitle}>
            {lang === 'he' ? '⚠️ לא נמצא תאריך משותף' : '⚠️ No common date found'}
          </Text>
          <Text style={styles.fieldLabel}>
            {lang === 'he'
              ? 'ניתן לשמור על אותם בוחנים ולתת למערכת לבחור תאריך (25–40 יום מהיום), או להחליף אחד הבוחנים ולהתחיל תהליך בחירה חדש עבורו.'
              : 'You can keep the same examiners and let the system auto-pick a date (25-40 days out), or replace one examiner and restart date selection for just them.'}
          </Text>

          <Pressable
            style={[styles.submitBtn, saving && { opacity: 0.6 }]}
            onPress={handleKeepExaminers}
            disabled={saving}
          >
            {saving
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.submitBtnText}>
                  {lang === 'he' ? '1️⃣ שמור בוחנים ובחר תאריך אוטומטית' : '1️⃣ Keep examiners & auto-pick a date'}
                </Text>
            }
          </Pressable>

          <Text style={[styles.fieldLabel, { marginTop: 16 }]}>
            {lang === 'he' ? '2️⃣ או החלף בוחן:' : '2️⃣ Or replace an examiner:'}
          </Text>

          <Text style={styles.weightLabel}>{lang === 'he' ? 'בוחן להחלפה' : 'Examiner to replace'}</Text>
          {(conflictMilestone?.defensePanel ?? []).map((member: DefensePanelMember) => {
            const key = `${member.type}:${member.ref}`;
            return (
              <Pressable
                key={key}
                style={[styles.examinerOption, replacedExaminerKey === key && styles.examinerOptionActive]}
                onPress={() => setReplacedExaminerKey(key)}
              >
                <Text style={[styles.examinerOptionText, replacedExaminerKey === key && { color: '#fff' }]}>
                  {member.displayName} {member.type === 'external' ? `(${lang === 'he' ? 'חיצוני' : 'external'})` : ''}
                </Text>
              </Pressable>
            );
          })}

          <View style={{ flexDirection: isRtl ? 'row-reverse' : 'row', gap: 8, marginVertical: 8 }}>
            <Pressable
              style={[styles.examinerOption, { flex: 1 }, replacementType === 'internal' && styles.examinerOptionActive]}
              onPress={() => setReplacementType('internal')}
            >
              <Text style={[styles.examinerOptionText, replacementType === 'internal' && { color: '#fff' }]}>
                {lang === 'he' ? 'בוחן פנימי' : 'Internal'}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.examinerOption, { flex: 1 }, replacementType === 'external' && styles.examinerOptionActive]}
              onPress={() => setReplacementType('external')}
            >
              <Text style={[styles.examinerOptionText, replacementType === 'external' && { color: '#fff' }]}>
                {lang === 'he' ? 'בוחן חיצוני' : 'External'}
              </Text>
            </Pressable>
          </View>

          {replacementType === 'internal' ? (
            allExaminers.map((ex) => (
              <Pressable
                key={ex.id}
                style={[styles.examinerOption, replacementInternalId === ex.id && styles.examinerOptionActive]}
                onPress={() => setReplacementInternalId(ex.id)}
              >
                <Text style={[styles.examinerOptionText, replacementInternalId === ex.id && { color: '#fff' }]}>
                  {ex.displayName} · {ex.email}
                </Text>
              </Pressable>
            ))
          ) : (
            [
              { label: lang === 'he' ? 'שם *' : 'Name *', value: replacementExt.name, key: 'name' as const },
              { label: lang === 'he' ? 'אימייל *' : 'Email *', value: replacementExt.email, key: 'email' as const },
              { label: lang === 'he' ? 'מוסד' : 'Institution', value: replacementExt.institution, key: 'institution' as const },
            ].map((f) => (
              <View key={f.key} style={{ marginBottom: 8 }}>
                <Text style={styles.weightLabel}>{f.label}</Text>
                <TextInput
                  style={styles.weightInput}
                  value={f.value}
                  onChangeText={(v) => setReplacementExt((prev) => ({ ...prev, [f.key]: v }))}
                  keyboardType={f.key === 'email' ? 'email-address' : 'default'}
                  autoCapitalize={f.key === 'email' ? 'none' : 'sentences'}
                />
              </View>
            ))
          )}

          <Pressable
            style={[styles.submitBtn, saving && { opacity: 0.6 }]}
            onPress={handleReplaceExaminer}
            disabled={saving}
          >
            {saving
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.submitBtnText}>{lang === 'he' ? 'החלף בוחן' : 'Replace examiner'}</Text>
            }
          </Pressable>

          <Pressable style={styles.cancelBtn} onPress={() => setConflictModal(false)}>
            <Text style={styles.cancelBtnText}>{lang === 'he' ? 'ביטול' : 'Cancel'}</Text>
          </Pressable>
        </ScrollView>
      </Modal>

      <BulkDueDateModal
        visible={showBulkDueDate}
        onClose={() => setShowBulkDueDate(false)}
        lang={lang}
        projects={projects.map((p) => ({ id: p.id, label: lang === 'he' ? p.titleHe : p.titleEn }))}
      />
    </SafeAreaView>
  );
}

const styles = coordinatorHomeStyles;