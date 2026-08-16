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
  ActivityIndicator, Modal, TextInput, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { auth } from '../../src/firebase/firebase';
import type { Lang } from '../../components/i18n';
import { TopBar, FACULTY_COLORS } from '../../components/shared';
import { ResponsiveScreen } from '../../components/ResponsiveScreen';
import { PERMISSION_FACULTY_IDS, hasActionGrant, type ScopeRule } from '../../constants/permissions';
import { getFilteredPrograms } from '../../constants/faculties';
import { apiClient } from '../../src/api/apiClient';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ProcessType = 'msc_thesis' | 'msc_project' | 'bsc_project';
export type TemplateStatus = 'pending_approval' | 'approved' | 'rejected' | 'superseded';

// Configurable approval/rejection routing — mirrors web/app/workflow-templates/types.ts.
// The standalone per-milestone gradingComponents rubric (the other web-only
// addition alongside this) stays web-editor-only on purpose, not ported here
// — but the two department-specific extensions below (staff record +
// defense's three-rubric final grade) are ported, since Data Science needs
// them configurable from mobile too.
export type ChainRole = 'supervisor' | 'examiner' | 'coordinator' | 'faculty_admin' | 'administrative_secretary' | 'grad_school_head' | 'program_head';
export type RejectionTarget = 'student' | string;

export interface ChainStage {
  id: string;
  role: ChainRole;
  action: 'grade' | 'approve';
  rejectTo: RejectionTarget;
}

export type MilestoneRoutingSpec = ChainStage[];

// Mirrors GradingComponentSpec/FormFieldSpec/FinalGradeRubric in
// server/src/services/workflowTemplates.ts and web/app/workflow-templates/types.ts.
export interface GradingComponentSpec {
  key: string;
  labelHe: string;
  labelEn: string;
  maxScore: number;
  weight: number;
  hasComment: boolean;
  visibleToStudent: boolean;
}

/** A single field in a staff-fillable online form (see MilestoneSpec's
 *  staffFormFields). Note: 'table' exists in the data model/server validation
 *  for future use, but — matching the web editor's own scope-limiting choice
 *  — this screen's type picker only offers text/textarea/date/number. */
export interface FormFieldSpec {
  key: string;
  labelHe: string;
  labelEn: string;
  type: 'text' | 'textarea' | 'date' | 'number' | 'table';
  required: boolean;
  /** Only meaningful when type === 'table' — not editable from this screen. */
  tableColumns?: Array<{ key: string; labelHe: string; labelEn: string; type: 'text' | 'number' | 'date' }>;
}

/** One of the three independently-scored rubrics that combine into a defense
 *  milestone's final grade — same shape as a single grader's gradingComponents
 *  list, just one of three. */
export interface FinalGradeRubric {
  components: GradingComponentSpec[];
  /** This rubric's share of the final grade (0-100) — the three rubrics'
   *  weights on a template must sum to 100, validated at proposal time. */
  weight: number;
}

export interface FinalGradeComponents {
  supervisorEvaluation: FinalGradeRubric;
  examinerProjectEvaluation: FinalGradeRubric;
  examinerDefenseEvaluation: FinalGradeRubric;
}

// Valid roles for a chain STAGE — includes 'examiner', which resolves to a
// milestone's own assigned examiner panel (see server-side
// scopeAuthorization.ts's resolveStaffForScope), letting a milestone type
// (e.g. a Poster session) be graded examiner-only, no supervisor stage.
export const CHAIN_ROLES: { key: ChainRole; he: string; en: string }[] = [
  { key: 'supervisor', he: 'מנחה', en: 'Supervisor' },
  { key: 'examiner', he: 'בוחן', en: 'Examiner' },
  { key: 'coordinator', he: 'רכז', en: 'Coordinator' },
  { key: 'faculty_admin', he: 'מנהל פקולטה', en: 'Faculty Admin' },
  { key: 'administrative_secretary', he: 'רכזת אדמיניסטרטיבית', en: 'Administrative Coordinator' },
  { key: 'grad_school_head', he: 'ראש בית ספר ללימודי מוסמכים', en: 'Grad School Head' },
  { key: 'program_head', he: 'ראש תוכנית', en: 'Program Head' },
];

// examinerSignoffRole/finalGradeSignoffRole are a single overall approver —
// 'examiner' is deliberately excluded (matches server-side SIGNOFF_ROLES).
export const SIGNOFF_ROLES = CHAIN_ROLES.filter((r) => r.key !== 'examiner');

// Exported so WorkflowTemplateEditor.tsx (the propose-version full screen)
// can share this single source of truth instead of duplicating the lookup.
export function chainRoleLabel(role: ChainRole, lang: Lang): string {
  return CHAIN_ROLES.find((r) => r.key === role)?.[lang] ?? role;
}

// Matches today's actual hardcoded runtime behavior — the fallback whenever a
// template has neither its own defaultRouting nor a milestone-level override.
export const DEFAULT_ROUTING: MilestoneRoutingSpec = [
  { id: 'supervisor', role: 'supervisor', action: 'grade', rejectTo: 'student' },
  { id: 'coordinator', role: 'coordinator', action: 'approve', rejectTo: 'student' },
];

export interface MilestoneSpec {
  type: string;
  nameHe: string;
  nameEn: string;
  order: number;
  /** 'fixed' means `fixedDate` is used instead of `dueDaysFromStart` — the
   *  same absolute calendar date for every student under this template,
   *  regardless of when they individually enrolled. Omitted (or 'offset')
   *  is the original behavior. Mirrors web/app/workflow-templates/types.ts. */
  dateMode?: 'offset' | 'fixed';
  /** Ignored when dateMode === 'fixed'. */
  dueDaysFromStart: number;
  /** ISO date (YYYY-MM-DD). Only meaningful when dateMode === 'fixed'. */
  fixedDate?: string;
  requiresExaminers: boolean;
  /** How many examiner slots a defense panel needs for this milestone. Only
   *  meaningful when requiresExaminers is true. Omitted means the legacy
   *  default of 2. Mirrors web/app/workflow-templates/types.ts. */
  examinerCount?: number;
  /** Per-milestone override of the template's defaultRouting. Omitted means
   *  this milestone inherits defaultRouting (or DEFAULT_ROUTING). */
  routing?: MilestoneRoutingSpec;
  /** Only meaningful for research_proposal/progress_report-type milestones —
   *  lets staff (the supervisor) attach an official record alongside the
   *  student's own submission, either by uploading a file or filling
   *  staffFormFields online. Omitted/'none' keeps today's behavior. */
  staffRecordMode?: 'none' | 'upload_or_form';
  staffFormFields?: FormFieldSpec[];
  /** Only meaningful for the 'defense' milestone type — replaces the single
   *  shared gradingComponents rubric with three independent ones (supervisor /
   *  examiner-on-the-project / examiner-on-the-defense), combined via their
   *  own weights (summing to 100) into the milestone's final grade. */
  finalGradeComponents?: FinalGradeComponents;
  /** How much this milestone counts toward the project's OVERALL final
   *  grade (0-100), validated to sum to 100 across every milestone in the
   *  template before it can be proposed (see WorkflowTemplateEditor.tsx's
   *  handleSaveProposal). Distinct
   *  from gradingComponents[].weight, which is a rubric WITHIN one
   *  milestone. Omitted (pre-existing templates) means "defense = 100,
   *  everything else = 0" — today's implicit behavior. Mirrors
   *  web/app/workflow-templates/types.ts. */
  percentOfFinalGrade?: number;
  /** What the student must attach when submitting this milestone. 'none' is
   *  allowed but discouraged (flagged in the editor). Omitted (pre-existing
   *  templates) means no requirement recorded — treated as unrestricted at
   *  submission time. Mirrors web/app/workflow-templates/types.ts. */
  submissionRequirement?: SubmissionRequirement;
}

export type SubmissionRequirement = 'file' | 'comment' | 'both' | 'none';

export const SUBMISSION_REQUIREMENTS: { key: SubmissionRequirement; he: string; en: string }[] = [
  { key: 'file', he: 'קובץ', en: 'File' },
  { key: 'comment', he: 'הערה', en: 'Comment' },
  { key: 'both', he: 'קובץ והערה', en: 'File and comment' },
  { key: 'none', he: 'ללא (לא מומלץ)', en: 'Neither (not recommended)' },
];

export type ApplyMode = 'now' | 'from_now_on';

export interface WorkflowTemplateDoc {
  id: string;
  facultyId: string;
  processType: ProcessType;
  /** A major slug, or `null` for "all majors in this faculty" (the fallback
   *  tier — also what every pre-existing template effectively means). */
  major: string | null;
  version: number;
  status: TemplateStatus;
  milestones: MilestoneSpec[];
  createdBy: string;
  createdAt: string;
  proposedNote: string | null;
  applyMode: ApplyMode;
  /** Template-level default chain — any milestone without its own `routing`
   *  inherits this. Omitted means DEFAULT_ROUTING (today's hardcoded chain). */
  defaultRouting?: MilestoneRoutingSpec;
  /** Who must sign off on examiner invitations before they go out. Omitted →
   *  legacy default (grad_school_head for msc_thesis, none otherwise).
   *  'none' → no second tier, for any process type. */
  examinerSignoffRole?: ChainRole | 'none';
  /** Who signs off on a defense milestone's already-computed final grade.
   *  No 'none' option — always required. Omitted → legacy default
   *  (grad_school_head, for any process type). */
  finalGradeSignoffRole?: ChainRole;
  /** What a student with no active project sees first for this subject —
   *  omitted means 'browse_projects' (today's only behavior). */
  firstStepMode?: 'browse_projects' | 'choose_supervisor';
  /** Only meaningful when firstStepMode === 'choose_supervisor'. Omitted
   *  means true (the safer default — requires approval). */
  supervisorSelectionRequiresApproval?: boolean;
  approvedBy?: string;
  approvedAt?: string;
  retroactiveAppliedAt?: string;
  retroactiveAffectedCount?: number;
  rejectedBy?: string;
  rejectedAt?: string;
  rejectionReason?: string;
}

// Exported so WorkflowTemplateEditor.tsx can render the same process-type
// label without duplicating this list.
export const PROCESS_TYPES: { key: ProcessType; he: string; en: string }[] = [
  { key: 'msc_thesis',  he: 'תזה לתואר שני',           en: "Master's Thesis" },
  { key: 'msc_project', he: 'פרויקט גמר לתואר שני',    en: "Master's Project" },
  { key: 'bsc_project', he: 'פרויקט לתואר ראשון',       en: "Bachelor's Project" },
];

// administrative_secretary is a proposer only — she must never be able to
// approve, reject, or delete a template herself (maker/checker separation;
// mirrors server/src/controllers/workflowTemplateController.ts).
const GRAD_SCHOOL_APPROVER_ROLES = ['grad_school_head', 'system_admin'];
const FACULTY_APPROVER_ROLES = ['faculty_admin', 'coordinator', 'system_admin'];
// system_admin and grad_school_head get a free faculty picker (no single
// "home" faculty — see workflowTemplateController.ts). administrative_secretary
// is scoped further still: never a free choice, only whichever subject(s)
// her own coordinatorScopes actually assign her (see isCoordinator below).
const FREE_CHOICE_CROSS_FACULTY_ROLES = ['system_admin', 'grad_school_head'];
const SELECTABLE_FACULTY_IDS = PERMISSION_FACULTY_IDS.filter((id) => id !== 'all');

function isMastersProcess(pt: ProcessType): boolean {
  return pt === 'msc_thesis' || pt === 'msc_project';
}

function canApproveRole(pt: ProcessType, role: string | null): boolean {
  if (!role) return false;
  return isMastersProcess(pt) ? GRAD_SCHOOL_APPROVER_ROLES.includes(role) : FACULTY_APPROVER_ROLES.includes(role);
}

/** Same decision as canApproveRole, but also honors a scoped 'approve_templates'
 *  detailed-permission grant (system_admin's Bulk/Edit-User Permissions
 *  editor) — lets a staff member outside the normal approver roles act on
 *  templates within their granted facultyId/major/degreeLevel/processType.
 *  Mirrors server/src/controllers/workflowTemplateController.ts's
 *  canApprove() + hasActionGrant() OR-gate. */
function canApproveTemplate(
  tpl: Pick<WorkflowTemplateDoc, 'processType' | 'facultyId' | 'major'>,
  role: string | null,
  permissionRules: ScopeRule[]
): boolean {
  if (canApproveRole(tpl.processType, role)) return true;
  return hasActionGrant({ role: role ?? undefined, permissionRules }, 'approve_templates', {
    facultyId: tpl.facultyId,
    major: tpl.major ?? undefined,
    degreeLevel: isMastersProcess(tpl.processType) ? 'masters' : 'bachelors',
    processType: tpl.processType === 'msc_thesis' ? 'thesis' : tpl.processType === 'msc_project' ? 'project' : undefined,
  });
}

/** Major options for a faculty, filtered to the degree level implied by the
 *  selected process type (bsc_project → bachelors, msc_* → masters). */
function majorOptionsFor(facultyId: string, processType: ProcessType, lang: Lang): { slug: string; label: string }[] {
  const level = isMastersProcess(processType) ? 'masters' : 'bachelors';
  const seen = new Set<string>();
  return getFilteredPrograms(facultyId, level)
    .filter((p) => !seen.has(p.slug) && seen.add(p.slug))
    .map((p) => ({ slug: p.slug, label: p.label[lang] }));
}

// Used by the "current template" display below to summarize a chain — the
// full editable chain UI (ChainEditor) now lives in
// WorkflowTemplateEditor.tsx, alongside the milestone-row sub-editor and its
// staff-record/rubric helpers, since those are only ever used by the
// propose-version screen.
function chainSummary(chain: MilestoneRoutingSpec, lang: Lang): string {
  return chain
    .map((stage) => `${chainRoleLabel(stage.role, lang)} (${stage.action === 'grade' ? (lang === 'he' ? 'מדרג' : 'grades') : (lang === 'he' ? 'מאשר' : 'approves')})`)
    .join(' → ');
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
  const [selectedMajor, setSelectedMajor] = useState<string | null>(null);
  // The administrative coordinator's own assigned subject(s) — {facultyId, major?}
  // tuples on her own user doc's coordinatorScopes (same generic field the
  // 'coordinator' role uses; see server/src/controllers/
  // workflowTemplateController.ts's resolveCoordinatorScope). Never a free
  // choice: if she holds more than one, she picks among only her own.
  const [coordinatorScopes, setCoordinatorScopes] = useState<{ facultyId: string; major?: string }[]>([]);
  const [coordinatorScopeIndex, setCoordinatorScopeIndex] = useState(0);
  // A system_admin can grant an individual staff member 'approve_templates'
  // via the detailed-permissions editor — see canApproveTemplate above.
  const [permissionRules, setPermissionRules] = useState<ScopeRule[]>([]);

  const isCoordinator = userRole === 'administrative_secretary';
  const isFreeChoiceCrossFaculty = !!userRole && FREE_CHOICE_CROSS_FACULTY_ROLES.includes(userRole);
  const coordinatorScope = isCoordinator ? coordinatorScopes[coordinatorScopeIndex] : undefined;

  // Cross-faculty roles pick a real faculty explicitly; administrative_secretary
  // is resolved from her own scope; everyone else is locked to their own.
  const facultyId = isFreeChoiceCrossFaculty ? selectedFacultyId : isCoordinator ? (coordinatorScope?.facultyId ?? null) : ownFacultyId;
  const activeMajor: string | null = userRole === 'system_admin' ? selectedMajor : isCoordinator ? (coordinatorScope?.major ?? null) : null;

  const [templates, setTemplates] = useState<WorkflowTemplateDoc[]>([]);
  const [activeProcessType, setActiveProcessType] = useState<ProcessType>('msc_thesis');
  const [activeTab, setActiveTab] = useState<'current' | 'pending' | 'history'>('current');
  const [saving, setSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  // Approve, for a template proposed with applyMode 'now', shows a preview
  // of affected in-progress projects before actually confirming.
  const [approvePreview, setApprovePreview] = useState<{ tpl: WorkflowTemplateDoc; count: number } | null>(null);

  // Reject-reason modal
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const router = useRouter();
  const { initialTab } = useLocalSearchParams<{ initialTab?: string }>();
  const uid = auth.currentUser?.uid;

  // WorkflowTemplateEditor.tsx replaces back into this route with
  // ?initialTab=pending after a successful proposal (mirrors the old
  // in-modal onProposed behavior of jumping straight to the Pending tab).
  // Cleared via router.setParams so it doesn't re-fire on a later focus.
  useEffect(() => {
    // administrative_secretary has no Pending Approval tab (see the tabs
    // list below) — she proposes/edits templates but has no approval
    // authority, and shouldn't see what's awaiting someone else's decision.
    if (initialTab === 'pending' && !isCoordinator) {
      setActiveTab('pending');
      router.setParams({ initialTab: undefined } as any);
    }
  }, [initialTab, isCoordinator]);

  useEffect(() => {
    if (!uid) { setLoading(false); return; }
    (async () => {
      try {
        const res = await apiClient.get('/api/users/profile');
        setUserName(res.data.displayName || '');
        setUserRole(res.data.role || null);
        setOwnFacultyId(res.data.facultyId || null);
        setCoordinatorScopes(res.data.coordinatorScopes ?? []);
        setPermissionRules(res.data.permissionRules ?? []);
        // No facultyId on the profile (shouldn't happen for the roles that
        // can reach this screen) — nothing left to load, stop spinning.
        if (!res.data.facultyId && !FREE_CHOICE_CROSS_FACULTY_ROLES.includes(res.data.role) && res.data.role !== 'administrative_secretary') {
          setLoading(false);
        }
      } catch (err) {
        console.error('WorkflowTemplateManager: failed to load profile', err);
        setLoading(false);
      }
    })();
  }, [uid]);

  useEffect(() => {
    if (isFreeChoiceCrossFaculty && !selectedFacultyId && SELECTABLE_FACULTY_IDS.length > 0) {
      setSelectedFacultyId(SELECTABLE_FACULTY_IDS[0]!);
    }
  }, [isFreeChoiceCrossFaculty, selectedFacultyId]);

  const loadTemplates = useCallback(async () => {
    if (!facultyId) { setLoading(false); return; }
    try {
      setLoading(true);
      const res = await apiClient.get('/api/workflow-templates', { params: { facultyId, major: activeMajor === null ? 'all' : activeMajor } });
      setTemplates(res.data.templates || []);
    } catch (err) {
      console.error('WorkflowTemplateManager: failed to load templates', err);
    } finally {
      setLoading(false);
    }
  }, [facultyId, activeMajor]);

  // Refetch whenever this screen regains focus — in particular after
  // returning from WorkflowTemplateEditor.tsx's propose-version screen, so a
  // freshly submitted proposal shows up without a manual pull-to-refresh.
  // (Also covers the initial mount, replacing the old plain useEffect.)
  useFocusEffect(useCallback(() => { loadTemplates(); }, [loadTemplates]));

  const approvedForActive = templates.find((t) => t.processType === activeProcessType && t.status === 'approved');
  // msc_thesis <-> msc_project only — bsc_project has no sibling to copy
  // from/to (it's the only bachelor's process type).
  const otherProcessType: ProcessType | null =
    activeProcessType === 'msc_thesis' ? 'msc_project'
    : activeProcessType === 'msc_project' ? 'msc_thesis'
    : null;
  const approvedForOther = otherProcessType
    ? templates.find((t) => t.processType === otherProcessType && t.status === 'approved')
    : undefined;
  const pending = templates.filter((t) => t.status === 'pending_approval');
  const pendingForActive = pending.filter((t) => t.processType === activeProcessType);
  const history = templates.filter((t) => t.status === 'rejected' || t.status === 'superseded');
  const historyForActive = history.filter((t) => t.processType === activeProcessType);

  // ── Propose editor ──────────────────────────────────────────────────────
  // The propose-version form now lives in WorkflowTemplateEditor.tsx, a real
  // routed full screen (see that file) instead of a pageSheet Modal here.
  // `source` lets the "Copy from <other process type>" button pre-fill the
  // draft from the sibling process type's approved template instead of this
  // one's own — everything stays fully editable there before submitting.
  // This just builds the payload the editor screen needs (mirrors what the
  // old openEditor() used to compute inline) and navigates to it; no extra
  // API call is needed since `templates` is already loaded here.
  const openEditorScreen = (source?: WorkflowTemplateDoc) => {
    const from = source ?? approvedForActive;
    const otherLabel = otherProcessType ? PROCESS_TYPES.find((p) => p.key === otherProcessType) : undefined;
    const payload = {
      lang,
      userName,
      userRole: userRole ?? 'faculty_admin',
      processType: activeProcessType,
      facultyId,
      activeMajor,
      includeFacultyIdInSubmit: isFreeChoiceCrossFaculty || isCoordinator,
      milestones: from ? from.milestones : [],
      defaultRouting: from?.defaultRouting ?? null,
      examinerSignoffRole: from?.examinerSignoffRole ?? null,
      finalGradeSignoffRole: from?.finalGradeSignoffRole ?? null,
      firstStepMode: from?.firstStepMode ?? null,
      supervisorSelectionRequiresApproval: from?.supervisorSelectionRequiresApproval ?? null,
      copiedFromLabel: source && otherLabel ? (lang === 'he' ? otherLabel.he : otherLabel.en) : null,
    };
    router.push({ pathname: '/WorkflowTemplateEditor', params: { payload: JSON.stringify(payload) } } as any);
  };

  // ── Approve / reject / delete ───────────────────────────────────────────
  // For an applyMode:'now' proposal, show a preview of affected in-progress
  // projects before actually approving — final confirmation re-fetched
  // right here since time may have passed since the proposal was created.
  const handleApproveClick = async (tpl: WorkflowTemplateDoc) => {
    if (tpl.applyMode !== 'now') {
      handleApprove(tpl);
      return;
    }
    setSaving(true);
    try {
      const res = await apiClient.get('/api/workflow-templates/retroactive-preview', {
        params: { facultyId: tpl.facultyId, major: tpl.major === null ? 'all' : tpl.major, processType: tpl.processType },
      });
      setApprovePreview({ tpl, count: res.data.count });
    } catch (e: any) {
      Alert.alert('❌', e.response?.data?.message || (lang === 'he' ? 'טעינת התצוגה המקדימה נכשלה' : 'Failed to load the preview'));
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async (tpl: WorkflowTemplateDoc) => {
    setSaving(true);
    try {
      await apiClient.post(`/api/workflow-templates/${tpl.id}/approve`);
      setApprovePreview(null);
      Alert.alert('✅', lang === 'he' ? 'התבנית אושרה' : 'Template approved');
      await loadTemplates();
    } catch (e: any) {
      Alert.alert('❌', e.response?.data?.message || (lang === 'he' ? 'האישור נכשל' : 'Approval failed'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setSaving(true);
    try {
      await apiClient.delete(`/api/workflow-templates/${id}`);
      setConfirmDeleteId(null);
      await loadTemplates();
    } catch (e: any) {
      Alert.alert('❌', e.response?.data?.message || (lang === 'he' ? 'המחיקה נכשלה' : 'Delete failed'));
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

      {/* Faculty selector — system_admin/grad_school_head only (no single "home" faculty) */}
      {isFreeChoiceCrossFaculty && (
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

      {/* administrative_secretary's own subject — no free choice */}
      {isCoordinator && coordinatorScopes.length === 0 && (
        <View style={{ marginHorizontal: 16, marginTop: 12, backgroundColor: '#FEF2F2', borderRadius: 10, padding: 12 }}>
          <Text style={{ color: '#B91C1C', fontSize: 13 }}>
            {lang === 'he'
              ? 'לא הוקצה לך תחום אחריות עדיין — פנה למנהל המערכת שיקצה לך תחום.'
              : 'No subject has been assigned to your account yet — ask your system_admin to assign one.'}
          </Text>
        </View>
      )}
      {isCoordinator && coordinatorScopes.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingHorizontal: 16, paddingTop: 12 }}>
          {coordinatorScopes.map((s, i) => (
            <Pressable
              key={i}
              style={{
                borderWidth: 1.5, borderColor: coordinatorScopeIndex === i ? '#7C3AED' : '#DDD6FE',
                backgroundColor: coordinatorScopeIndex === i ? '#7C3AED' : '#fff',
                borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, marginRight: 8,
              }}
              onPress={() => setCoordinatorScopeIndex(i)}
            >
              <Text style={{ color: coordinatorScopeIndex === i ? '#fff' : '#7C3AED', fontWeight: '600', fontSize: 13 }}>
                {FACULTY_COLORS[s.facultyId]?.label[lang] ?? s.facultyId}{s.major ? ` — ${s.major}` : ''}
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

      {/* Subject/major selector — system_admin only; administrative_secretary
          is auto-resolved from her own scope above, everyone else stays
          whole-faculty (major: null). */}
      {userRole === 'system_admin' && facultyId && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingHorizontal: 16, paddingTop: 12 }}>
          <Pressable
            style={{
              borderWidth: 1.5, borderColor: selectedMajor === null ? '#7C3AED' : '#DDD6FE',
              backgroundColor: selectedMajor === null ? '#7C3AED' : '#fff',
              borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, marginRight: 8,
            }}
            onPress={() => setSelectedMajor(null)}
          >
            <Text style={{ color: selectedMajor === null ? '#fff' : '#7C3AED', fontWeight: '600', fontSize: 13 }}>
              {lang === 'he' ? 'כל המגמות' : 'All majors'}
            </Text>
          </Pressable>
          {majorOptionsFor(facultyId, activeProcessType, lang).map((m) => (
            <Pressable
              key={m.slug}
              style={{
                borderWidth: 1.5, borderColor: selectedMajor === m.slug ? '#7C3AED' : '#DDD6FE',
                backgroundColor: selectedMajor === m.slug ? '#7C3AED' : '#fff',
                borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, marginRight: 8,
              }}
              onPress={() => setSelectedMajor(m.slug)}
            >
              <Text style={{ color: selectedMajor === m.slug ? '#fff' : '#7C3AED', fontWeight: '600', fontSize: 13 }}>
                {m.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

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
          // administrative_secretary proposes/edits templates but has no
          // approval authority (see canApproveTemplate) — she also
          // shouldn't see what's awaiting someone else's decision.
          ...(isCoordinator ? [] : [{ key: 'pending' as const, he: 'ממתין לאישור', en: 'Pending Approval', badge: pendingForActive.length }]),
          { key: 'history' as const, he: 'היסטוריה', en: 'History' },
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
                <Text style={{ fontSize: 11, color: '#1F1235', backgroundColor: '#F5F3FF', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6, marginBottom: 8 }}>
                  🔀 {lang === 'he' ? 'שרשרת ברירת מחדל: ' : 'Default chain: '}
                  {chainSummary(approvedForActive.defaultRouting && approvedForActive.defaultRouting.length > 0 ? approvedForActive.defaultRouting : DEFAULT_ROUTING, lang)}
                </Text>
                <Text style={{ fontSize: 11, color: '#5B21B6', backgroundColor: '#EFEBF6', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6, marginBottom: 8, fontWeight: '600' }}>
                  🎓 {lang === 'he'
                    ? `אישור ציון סופי (הגנה): ${chainRoleLabel(approvedForActive.finalGradeSignoffRole ?? 'grad_school_head', lang)}`
                    : `Final grade sign-off (defense): ${chainRoleLabel(approvedForActive.finalGradeSignoffRole ?? 'grad_school_head', lang)}`}
                </Text>
                {(() => {
                  const resolvedSignoff = approvedForActive.examinerSignoffRole
                    ?? (approvedForActive.processType === 'msc_thesis' ? 'grad_school_head' : 'none');
                  if (resolvedSignoff === 'none') return null;
                  return (
                    <Text style={{ fontSize: 11, color: '#5B21B6', backgroundColor: '#EFEBF6', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6, marginBottom: 8, fontWeight: '600' }}>
                      🎓 {lang === 'he'
                        ? `הזמנת בוחנים דורשת אישור: ${chainRoleLabel(resolvedSignoff as ChainRole, lang)}`
                        : `Examiner invitations require sign-off from: ${chainRoleLabel(resolvedSignoff as ChainRole, lang)}`}
                    </Text>
                  );
                })()}
                {approvedForActive.milestones.sort((a, b) => a.order - b.order).map((m, idx) => (
                  <View key={m.type} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderTopWidth: idx > 0 ? 1 : 0, borderTopColor: '#F3F0FF', gap: 10 }}>
                    <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: '#EDE9FE', alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#7C3AED' }}>{idx + 1}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: '#1F1235' }}>{lang === 'he' ? m.nameHe : m.nameEn}</Text>
                      <Text style={{ fontSize: 11, color: '#8899BB' }}>
                        📅 {m.dateMode === 'fixed'
                          ? (lang === 'he' ? `תאריך קבוע: ${m.fixedDate ?? '—'}` : `Fixed: ${m.fixedDate ?? '—'}`)
                          : (lang === 'he' ? `יום ${m.dueDaysFromStart}` : `Day ${m.dueDaysFromStart}`)}
                        {m.requiresExaminers ? `  ·  👥 ${lang === 'he' ? 'בוחנים' : 'Examiners'}` : ''}
                        {m.staffRecordMode === 'upload_or_form' ? `  ·  📝 ${lang === 'he' ? 'רשומת מנחה' : 'Staff record'}` : ''}
                        {m.finalGradeComponents ? `  ·  ⚖️ ${lang === 'he' ? 'ציון משולש' : '3-rubric grading'}` : ''}
                      </Text>
                      {m.routing && m.routing.length > 0 && (
                        <Text style={{ fontSize: 10, color: '#F59E0B', marginTop: 2 }}>
                          🔀 {lang === 'he' ? 'שרשרת מותאמת: ' : 'Custom chain: '}{chainSummary(m.routing, lang)}
                        </Text>
                      )}
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

            {!isCoordinator && pendingForActive.length > 0 && (
              <Text style={{ fontSize: 12, color: '#F59E0B', fontWeight: '600', marginBottom: 10 }}>
                {lang === 'he' ? '⏳ יש הצעה ממתינה לאישור לתהליך זה' : '⏳ A proposal is pending approval for this process'}
              </Text>
            )}

            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable
                style={{ flex: 1, backgroundColor: '#7C3AED', borderRadius: 12, paddingVertical: 13, alignItems: 'center' }}
                onPress={() => openEditorScreen()}
              >
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>
                  ＋ {lang === 'he' ? 'הצע גרסה חדשה' : 'Propose New Version'}
                </Text>
              </Pressable>
              {approvedForOther && (
                <Pressable
                  style={{ flex: 1, backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#7C3AED', borderRadius: 12, paddingVertical: 13, alignItems: 'center' }}
                  onPress={() => openEditorScreen(approvedForOther)}
                >
                  <Text style={{ color: '#7C3AED', fontWeight: '700', fontSize: 13 }}>
                    📋 {lang === 'he'
                      ? `העתק מ${otherProcessType ? PROCESS_TYPES.find((p) => p.key === otherProcessType)?.he : ''}`
                      : `Copy from ${otherProcessType ? PROCESS_TYPES.find((p) => p.key === otherProcessType)?.en : ''}`}
                  </Text>
                </Pressable>
              )}
            </View>
          </>
        )}

        {activeTab === 'pending' && !isCoordinator && (
          <>
            {pendingForActive.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                <Text style={{ fontSize: 40, marginBottom: 10 }}>✅</Text>
                <Text style={{ fontSize: 14, color: '#8899BB' }}>
                  {lang === 'he' ? 'אין הצעות ממתינות' : 'No pending proposals'}
                </Text>
              </View>
            ) : (
              pendingForActive.map((tpl) => {
                const canApprove = canApproveTemplate(tpl, userRole, permissionRules);
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
                    {tpl.applyMode === 'now' && (
                      <Text style={{ fontSize: 12, color: '#EF4444', fontWeight: '600', marginBottom: 6 }}>
                        ⚡ {lang === 'he' ? 'תחול מיידית על תהליכים בעיצומם' : 'Applies immediately to in-progress processes'}
                      </Text>
                    )}
                    {!canApprove && (
                      <Text style={{ fontSize: 12, color: '#9BA8C0', fontStyle: 'italic' }}>
                        {isMastersProcess(tpl.processType)
                          ? (lang === 'he' ? 'ממתין לאישור ראש בית הספר ללימודי מוסמכים' : 'Awaiting grad school head approval')
                          : (lang === 'he' ? 'ממתין לאישור הפקולטה' : 'Awaiting faculty approval')}
                      </Text>
                    )}
                    {canApprove && confirmDeleteId === tpl.id ? (
                      <View style={{ marginTop: 8 }}>
                        <Text style={{ fontSize: 13, color: '#EF4444', marginBottom: 8 }}>
                          {lang === 'he' ? 'למחוק את ההצעה הזו לצמיתות?' : 'Permanently delete this proposal?'}
                        </Text>
                        <View style={{ flexDirection: 'row', gap: 10 }}>
                          <Pressable
                            style={{ flex: 1, backgroundColor: '#EF4444', borderRadius: 10, paddingVertical: 11, alignItems: 'center' }}
                            onPress={() => handleDelete(tpl.id)}
                            disabled={saving}
                          >
                            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>{lang === 'he' ? 'מחק' : 'Delete'}</Text>
                          </Pressable>
                          <Pressable
                            style={{ flex: 1, borderWidth: 1, borderColor: '#DDD6FE', borderRadius: 10, paddingVertical: 11, alignItems: 'center' }}
                            onPress={() => setConfirmDeleteId(null)}
                          >
                            <Text style={{ color: '#374151', fontWeight: '600', fontSize: 14 }}>{lang === 'he' ? 'ביטול' : 'Cancel'}</Text>
                          </Pressable>
                        </View>
                      </View>
                    ) : canApprove ? (
                      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                        <Pressable
                          style={{ flex: 1, backgroundColor: '#10B981', borderRadius: 10, paddingVertical: 11, alignItems: 'center' }}
                          onPress={() => handleApproveClick(tpl)}
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
                        <Pressable
                          style={{ borderWidth: 1, borderColor: '#DDD6FE', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, alignItems: 'center' }}
                          onPress={() => setConfirmDeleteId(tpl.id)}
                          disabled={saving}
                        >
                          <Text>🗑️</Text>
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                );
              })
            )}
          </>
        )}

        {activeTab === 'history' && (
          <>
            {historyForActive.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                <Text style={{ fontSize: 14, color: '#8899BB' }}>
                  {lang === 'he' ? 'אין היסטוריה להצגה' : 'No history to show'}
                </Text>
              </View>
            ) : (
              historyForActive.map((tpl) => {
                const canDelete = canApproveTemplate(tpl, userRole, permissionRules);
                const ptLabel = PROCESS_TYPES.find((p) => p.key === tpl.processType);
                return (
                  <View key={tpl.id} style={{ backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 14, opacity: 0.92 }}>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: '#111' }}>
                      {lang === 'he' ? ptLabel?.he : ptLabel?.en} · {lang === 'he' ? `גרסה ${tpl.version}` : `Version ${tpl.version}`}
                      {' · '}
                      <Text style={{ color: tpl.status === 'rejected' ? '#EF4444' : '#8899BB' }}>
                        {tpl.status === 'rejected' ? (lang === 'he' ? 'נדחה' : 'Rejected') : (lang === 'he' ? 'הוחלף' : 'Superseded')}
                      </Text>
                    </Text>
                    <Text style={{ fontSize: 12, color: '#8899BB', marginTop: 4, marginBottom: 8 }}>
                      {tpl.milestones.length} {lang === 'he' ? 'אבני דרך' : 'milestones'}
                      {tpl.rejectionReason ? ` · ${tpl.rejectionReason}` : ''}
                    </Text>
                    {tpl.retroactiveAffectedCount !== undefined && (
                      <Text style={{ fontSize: 12, color: '#8899BB', marginBottom: 8 }}>
                        {lang === 'he' ? `הוחל רטרואקטיבית על ${tpl.retroactiveAffectedCount} תהליכים` : `Retroactively applied to ${tpl.retroactiveAffectedCount} process(es)`}
                      </Text>
                    )}
                    {canDelete && (
                      confirmDeleteId === tpl.id ? (
                        <View>
                          <Text style={{ fontSize: 13, color: '#EF4444', marginBottom: 8 }}>{lang === 'he' ? 'למחוק לצמיתות?' : 'Permanently delete?'}</Text>
                          <View style={{ flexDirection: 'row', gap: 10 }}>
                            <Pressable
                              style={{ flex: 1, backgroundColor: '#EF4444', borderRadius: 10, paddingVertical: 11, alignItems: 'center' }}
                              onPress={() => handleDelete(tpl.id)}
                              disabled={saving}
                            >
                              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>{lang === 'he' ? 'מחק' : 'Delete'}</Text>
                            </Pressable>
                            <Pressable
                              style={{ flex: 1, borderWidth: 1, borderColor: '#DDD6FE', borderRadius: 10, paddingVertical: 11, alignItems: 'center' }}
                              onPress={() => setConfirmDeleteId(null)}
                            >
                              <Text style={{ color: '#374151', fontWeight: '600', fontSize: 14 }}>{lang === 'he' ? 'ביטול' : 'Cancel'}</Text>
                            </Pressable>
                          </View>
                        </View>
                      ) : (
                        <Pressable
                          style={{ borderWidth: 1, borderColor: '#DDD6FE', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, alignSelf: 'flex-start' }}
                          onPress={() => setConfirmDeleteId(tpl.id)}
                        >
                          <Text style={{ color: '#EF4444', fontWeight: '600', fontSize: 13 }}>🗑️ {lang === 'he' ? 'מחק' : 'Delete'}</Text>
                        </Pressable>
                      )
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

      {/* ── Retroactive-apply confirm modal (applyMode 'now' only) ── */}
      <Modal visible={!!approvePreview} animationType="fade" transparent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20, width: '100%', maxWidth: 360 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#1F1235' }}>
              ⚡ {lang === 'he' ? 'החלה רטרואקטיבית' : 'Retroactive application'}
            </Text>
            <Text style={{ fontSize: 14, color: '#374151', marginTop: 10 }}>
              {approvePreview && (lang === 'he'
                ? `אישור התבנית יעדכן מיידית ${approvePreview.count} תהליכים בעיצומם.`
                : `Approving this template will immediately update ${approvePreview.count} in-progress process(es).`)}
            </Text>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
              <Pressable
                style={{ flex: 1, borderWidth: 1.5, borderColor: '#DDD6FE', borderRadius: 10, paddingVertical: 12, alignItems: 'center' }}
                onPress={() => setApprovePreview(null)}
                disabled={saving}
              >
                <Text style={{ color: '#374151', fontWeight: '600', fontSize: 14 }}>{lang === 'he' ? 'ביטול' : 'Cancel'}</Text>
              </Pressable>
              <Pressable
                style={{ flex: 1, backgroundColor: '#7C3AED', borderRadius: 10, paddingVertical: 12, alignItems: 'center' }}
                onPress={() => approvePreview && handleApprove(approvePreview.tpl)}
                disabled={saving}
              >
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>{lang === 'he' ? 'אשר בכל זאת' : 'Confirm & Approve'}</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
