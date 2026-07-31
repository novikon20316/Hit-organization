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
import { getFilteredPrograms } from '../../constants/faculties';
import { apiClient } from '../../src/api/apiClient';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ProcessType = 'msc_thesis' | 'msc_project' | 'bsc_project';
export type TemplateStatus = 'pending_approval' | 'approved' | 'rejected' | 'superseded';

// Configurable approval/rejection routing — mirrors web/app/workflow-templates/types.ts.
// gradingComponents (the other web-only addition alongside this) stays
// web-editor-only on purpose, not ported here.
export type ChainRole = 'supervisor' | 'coordinator' | 'faculty_admin' | 'administrative_secretary' | 'grad_school_head' | 'program_head';
export type RejectionTarget = 'student' | string;

export interface ChainStage {
  id: string;
  role: ChainRole;
  action: 'grade' | 'approve';
  rejectTo: RejectionTarget;
}

export type MilestoneRoutingSpec = ChainStage[];

export const CHAIN_ROLES: { key: ChainRole; he: string; en: string }[] = [
  { key: 'supervisor', he: 'מנחה', en: 'Supervisor' },
  { key: 'coordinator', he: 'רכז', en: 'Coordinator' },
  { key: 'faculty_admin', he: 'מנהל פקולטה', en: 'Faculty Admin' },
  { key: 'administrative_secretary', he: 'מזכירה אקדמית', en: 'Administrative Secretary' },
  { key: 'grad_school_head', he: 'ראש בית ספר ללימודי מוסמכים', en: 'Grad School Head' },
  { key: 'program_head', he: 'ראש תוכנית', en: 'Program Head' },
];

function chainRoleLabel(role: ChainRole, lang: Lang): string {
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
  dueDaysFromStart: number;
  requiresExaminers: boolean;
  /** How many examiner slots a defense panel needs for this milestone. Only
   *  meaningful when requiresExaminers is true. Omitted means the legacy
   *  default of 2. Mirrors web/app/workflow-templates/types.ts. */
  examinerCount?: number;
  /** Per-milestone override of the template's defaultRouting. Omitted means
   *  this milestone inherits defaultRouting (or DEFAULT_ROUTING). */
  routing?: MilestoneRoutingSpec;
}

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
  approvedBy?: string;
  approvedAt?: string;
  retroactiveAppliedAt?: string;
  retroactiveAffectedCount?: number;
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
// system_admin and grad_school_head get a free faculty picker (no single
// "home" faculty — see workflowTemplateController.ts). administrative_secretary
// is scoped further still: never a free choice, only whichever subject(s)
// her own coordinatorScopes actually assign her (see isSecretary below).
const FREE_CHOICE_CROSS_FACULTY_ROLES = ['system_admin', 'grad_school_head'];
const SELECTABLE_FACULTY_IDS = PERMISSION_FACULTY_IDS.filter((id) => id !== 'all');

function isMastersProcess(pt: ProcessType): boolean {
  return pt === 'msc_thesis' || pt === 'msc_project';
}

function canApproveRole(pt: ProcessType, role: string | null): boolean {
  if (!role) return false;
  return isMastersProcess(pt) ? GRAD_SCHOOL_APPROVER_ROLES.includes(role) : FACULTY_APPROVER_ROLES.includes(role);
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

function makeId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function emptyMilestone(order: number): MilestoneSpec {
  return { type: `custom_${makeId()}`, nameHe: '', nameEn: '', order, dueDaysFromStart: 90, requiresExaminers: false };
}

function makeStageId(): string {
  return `stage_${Math.random().toString(36).slice(2, 8)}`;
}

function emptyStage(): ChainStage {
  return { id: makeStageId(), role: 'coordinator', action: 'approve', rejectTo: 'student' };
}

function chainSummary(chain: MilestoneRoutingSpec, lang: Lang): string {
  return chain
    .map((stage) => `${chainRoleLabel(stage.role, lang)} (${stage.action === 'grade' ? (lang === 'he' ? 'מדרג' : 'grades') : (lang === 'he' ? 'מאשר' : 'approves')})`)
    .join(' → ');
}

// ─── Approval-chain editor ──────────────────────────────────────────────────
// Ordered stage list — reuses the same chip-row Pressable idiom this screen
// already uses 3x for faculty/process-type/major selection. Reordering
// (▲/▼, swap-adjacent-elements) ports web/app/workflow-templates/ChainEditor.tsx's
// own logic verbatim; no reorderable-list precedent existed on mobile before this.
function ChainEditor({ stages, onChange, lang }: { stages: ChainStage[]; onChange: (s: ChainStage[]) => void; lang: Lang }) {
  const updateStage = (idx: number, patch: Partial<ChainStage>) => {
    onChange(stages.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };
  const removeStage = (idx: number) => {
    const removedId = stages[idx]?.id;
    onChange(
      stages
        .filter((_, i) => i !== idx)
        .map((s) => (s.rejectTo === removedId ? { ...s, rejectTo: 'student' } : s))
    );
  };
  const moveStage = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= stages.length) return;
    const next = [...stages];
    [next[idx], next[target]] = [next[target]!, next[idx]!];
    onChange(next);
  };
  const addStage = () => onChange([...stages, emptyStage()]);

  const chip = (selected: boolean) => ({
    borderWidth: 1.5, borderColor: selected ? '#7C3AED' : '#DDD6FE',
    backgroundColor: selected ? '#7C3AED' : '#fff',
    borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5, marginEnd: 6,
  });
  const chipText = (selected: boolean) => ({ fontSize: 11, fontWeight: '600' as const, color: selected ? '#fff' : '#7C3AED' });

  return (
    <View>
      {stages.map((stage, idx) => {
        const rejectsForward = stage.rejectTo !== 'student' && stages.findIndex((s) => s.id === stage.rejectTo) > idx;
        return (
          <View key={stage.id} style={{ backgroundColor: '#F5F3FF', borderRadius: 10, padding: 10, marginTop: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#EDE9FE', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: '#7C3AED' }}>{idx + 1}</Text>
              </View>
              <View style={{ flex: 1 }} />
              <Pressable onPress={() => moveStage(idx, -1)} disabled={idx === 0} style={{ padding: 4, opacity: idx === 0 ? 0.3 : 1 }}>
                <Text>▲</Text>
              </Pressable>
              <Pressable onPress={() => moveStage(idx, 1)} disabled={idx === stages.length - 1} style={{ padding: 4, opacity: idx === stages.length - 1 ? 0.3 : 1 }}>
                <Text>▼</Text>
              </Pressable>
              <Pressable onPress={() => removeStage(idx)} style={{ padding: 4 }}>
                <Text>🗑️</Text>
              </Pressable>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 6 }}>
              {CHAIN_ROLES.map((r) => (
                <Pressable key={r.key} onPress={() => updateStage(idx, { role: r.key })} style={chip(stage.role === r.key)}>
                  <Text style={chipText(stage.role === r.key)}>{lang === 'he' ? r.he : r.en}</Text>
                </Pressable>
              ))}
            </ScrollView>

            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 6 }}>
              {(['grade', 'approve'] as const).map((a) => (
                <Pressable
                  key={a}
                  onPress={() => updateStage(idx, { action: a })}
                  style={{ flex: 1, borderWidth: 1.5, borderColor: stage.action === a ? '#7C3AED' : '#DDD6FE', backgroundColor: stage.action === a ? '#7C3AED' : '#fff', borderRadius: 8, paddingVertical: 6, alignItems: 'center' }}
                >
                  <Text style={chipText(stage.action === a)}>
                    {a === 'grade' ? (lang === 'he' ? 'מדרג' : 'Grades') : (lang === 'he' ? 'מאשר' : 'Approves')}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={{ fontSize: 11, color: '#8899BB', marginBottom: 4 }}>
              {lang === 'he' ? 'אם נדחה, יעבור אל:' : 'If rejected, goes to:'}
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <Pressable onPress={() => updateStage(idx, { rejectTo: 'student' })} style={chip(stage.rejectTo === 'student')}>
                <Text style={chipText(stage.rejectTo === 'student')}>{lang === 'he' ? 'הסטודנט' : 'Student'}</Text>
              </Pressable>
              {stages.map((s, i) => (
                <Pressable key={s.id} onPress={() => updateStage(idx, { rejectTo: s.id })} style={chip(stage.rejectTo === s.id)}>
                  <Text style={chipText(stage.rejectTo === s.id)}>
                    {chainRoleLabel(s.role, lang)}{i === idx ? (lang === 'he' ? ' (לשלב זה)' : ' (this stage)') : ''}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            {rejectsForward && (
              <Text style={{ fontSize: 10, color: '#F59E0B', marginTop: 4 }}>
                ⚠️ {lang === 'he' ? 'הדחייה קופצת קדימה בשרשרת' : 'This rejection jumps forward in the chain'}
              </Text>
            )}
          </View>
        );
      })}
      <Pressable onPress={addStage} style={{ borderWidth: 1, borderStyle: 'dashed', borderColor: '#DDD6FE', borderRadius: 8, paddingVertical: 8, alignItems: 'center', marginTop: 8 }}>
        <Text style={{ fontSize: 12, fontWeight: '600', color: '#374151' }}>＋ {lang === 'he' ? 'הוסף שלב' : 'Add Stage'}</Text>
      </Pressable>
    </View>
  );
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
  // administrative_secretary's own assigned subject(s) — {facultyId, major?}
  // tuples on her own user doc's coordinatorScopes (same generic field the
  // 'coordinator' role uses; see server/src/controllers/
  // workflowTemplateController.ts's resolveSecretaryScope). Never a free
  // choice: if she holds more than one, she picks among only her own.
  const [secretaryScopes, setSecretaryScopes] = useState<{ facultyId: string; major?: string }[]>([]);
  const [secretaryScopeIndex, setSecretaryScopeIndex] = useState(0);

  const isSecretary = userRole === 'administrative_secretary';
  const isFreeChoiceCrossFaculty = !!userRole && FREE_CHOICE_CROSS_FACULTY_ROLES.includes(userRole);
  const secretaryScope = isSecretary ? secretaryScopes[secretaryScopeIndex] : undefined;

  // Cross-faculty roles pick a real faculty explicitly; administrative_secretary
  // is resolved from her own scope; everyone else is locked to their own.
  const facultyId = isFreeChoiceCrossFaculty ? selectedFacultyId : isSecretary ? (secretaryScope?.facultyId ?? null) : ownFacultyId;
  const activeMajor: string | null = userRole === 'system_admin' ? selectedMajor : isSecretary ? (secretaryScope?.major ?? null) : null;

  const [templates, setTemplates] = useState<WorkflowTemplateDoc[]>([]);
  const [activeProcessType, setActiveProcessType] = useState<ProcessType>('msc_thesis');
  const [activeTab, setActiveTab] = useState<'current' | 'pending' | 'history'>('current');
  const [saving, setSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  // Approve, for a template proposed with applyMode 'now', shows a preview
  // of affected in-progress projects before actually confirming.
  const [approvePreview, setApprovePreview] = useState<{ tpl: WorkflowTemplateDoc; count: number } | null>(null);

  // Propose-editor modal
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMilestones, setEditorMilestones] = useState<MilestoneSpec[]>([]);
  const [editorNote, setEditorNote] = useState('');
  const [editorApplyMode, setEditorApplyMode] = useState<ApplyMode>('from_now_on');
  const [editorPreview, setEditorPreview] = useState<{ count: number } | null>(null);
  const [editorPreviewLoading, setEditorPreviewLoading] = useState(false);
  const [editorDefaultRouting, setEditorDefaultRouting] = useState<MilestoneRoutingSpec>(DEFAULT_ROUTING.map((s) => ({ ...s })));
  const [editorExaminerSignoffRole, setEditorExaminerSignoffRole] = useState<ChainRole | 'none'>('none');
  const [editorFinalGradeSignoffRole, setEditorFinalGradeSignoffRole] = useState<ChainRole>('grad_school_head');

  // Milestone row editor (inside the propose modal)
  const [msModalOpen, setMsModalOpen] = useState(false);
  const [editingMs, setEditingMs] = useState<MilestoneSpec | null>(null);
  const [msNameHe, setMsNameHe] = useState('');
  const [msNameEn, setMsNameEn] = useState('');
  const [msDays, setMsDays] = useState('90');
  const [msExaminers, setMsExaminers] = useState(false);
  const [msExaminerCount, setMsExaminerCount] = useState('2');
  const [msOverrideChain, setMsOverrideChain] = useState(false);
  const [msRouting, setMsRouting] = useState<MilestoneRoutingSpec>([emptyStage()]);

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
        setSecretaryScopes(res.data.coordinatorScopes ?? []);
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

  useEffect(() => { loadTemplates(); }, [loadTemplates]);

  const approvedForActive = templates.find((t) => t.processType === activeProcessType && t.status === 'approved');
  const pending = templates.filter((t) => t.status === 'pending_approval');
  const pendingForActive = pending.filter((t) => t.processType === activeProcessType);
  const history = templates.filter((t) => t.status === 'rejected' || t.status === 'superseded');
  const historyForActive = history.filter((t) => t.processType === activeProcessType);

  // ── Propose editor ──────────────────────────────────────────────────────
  const openEditor = () => {
    setEditorMilestones(
      approvedForActive
        ? approvedForActive.milestones.map((m) => ({ ...m }))
        : [emptyMilestone(1)]
    );
    setEditorNote('');
    setEditorApplyMode('from_now_on');
    setEditorPreview(null);
    setEditorDefaultRouting(
      approvedForActive?.defaultRouting && approvedForActive.defaultRouting.length > 0
        ? approvedForActive.defaultRouting.map((s) => ({ ...s }))
        : DEFAULT_ROUTING.map((s) => ({ ...s }))
    );
    // Legacy default matches the server's own resolveExaminerSignoffRole fallback.
    setEditorExaminerSignoffRole(approvedForActive?.examinerSignoffRole ?? (activeProcessType === 'msc_thesis' ? 'grad_school_head' : 'none'));
    setEditorFinalGradeSignoffRole(approvedForActive?.finalGradeSignoffRole ?? 'grad_school_head');
    setEditorOpen(true);
  };

  const handleApplyModeChange = async (mode: ApplyMode) => {
    setEditorApplyMode(mode);
    if (mode !== 'now' || !facultyId) return;
    setEditorPreviewLoading(true);
    try {
      const res = await apiClient.get('/api/workflow-templates/retroactive-preview', {
        params: { facultyId, major: activeMajor === null ? 'all' : activeMajor, processType: activeProcessType },
      });
      setEditorPreview({ count: res.data.count });
    } catch {
      setEditorPreview(null);
    } finally {
      setEditorPreviewLoading(false);
    }
  };

  const openMilestoneEditor = (ms: MilestoneSpec | null) => {
    if (ms) {
      setEditingMs(ms);
      setMsNameHe(ms.nameHe);
      setMsNameEn(ms.nameEn);
      setMsDays(String(ms.dueDaysFromStart));
      setMsExaminers(ms.requiresExaminers);
      setMsExaminerCount(String(ms.examinerCount ?? 2));
      setMsOverrideChain(!!(ms.routing && ms.routing.length > 0));
      setMsRouting(ms.routing && ms.routing.length > 0 ? ms.routing.map((s) => ({ ...s })) : [emptyStage()]);
    } else {
      setEditingMs(null);
      setMsNameHe(''); setMsNameEn(''); setMsDays('90'); setMsExaminers(false); setMsExaminerCount('2');
      setMsOverrideChain(false);
      setMsRouting([emptyStage()]);
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
    const examinerCount = parseInt(msExaminerCount, 10);
    if (msExaminers && (!Number.isFinite(examinerCount) || examinerCount < 1)) {
      Alert.alert(lang === 'he' ? 'שגיאה' : 'Error', lang === 'he' ? 'מספר בוחנים לא תקין' : 'Invalid examiner count');
      return;
    }
    if (editingMs) {
      setEditorMilestones((prev) => prev.map((m) => {
        if (m !== editingMs) return m;
        const next: MilestoneSpec = {
          ...m, nameHe: msNameHe.trim(), nameEn: msNameEn.trim(), dueDaysFromStart: days, requiresExaminers: msExaminers,
        };
        if (msExaminers) next.examinerCount = examinerCount;
        else delete next.examinerCount;
        // Turning the override off must actually clear a pre-existing
        // routing, not leave the stale chain behind.
        if (msOverrideChain) next.routing = msRouting;
        else delete next.routing;
        return next;
      }));
    } else {
      setEditorMilestones((prev) => {
        const next: MilestoneSpec = {
          type: `custom_${makeId()}`, nameHe: msNameHe.trim(), nameEn: msNameEn.trim(), order: prev.length + 1, dueDaysFromStart: days, requiresExaminers: msExaminers,
        };
        if (msExaminers) next.examinerCount = examinerCount;
        if (msOverrideChain) next.routing = msRouting;
        return [...prev, next];
      });
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
        major: activeMajor === null ? 'all' : activeMajor,
        applyMode: editorApplyMode,
        defaultRouting: editorDefaultRouting,
        examinerSignoffRole: editorExaminerSignoffRole,
        finalGradeSignoffRole: editorFinalGradeSignoffRole,
        ...(isFreeChoiceCrossFaculty || isSecretary ? { facultyId } : {}),
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
      {isSecretary && secretaryScopes.length === 0 && (
        <View style={{ marginHorizontal: 16, marginTop: 12, backgroundColor: '#FEF2F2', borderRadius: 10, padding: 12 }}>
          <Text style={{ color: '#B91C1C', fontSize: 13 }}>
            {lang === 'he'
              ? 'לא הוקצה לך תחום אחריות עדיין — פנה למנהל המערכת שיקצה לך תחום.'
              : 'No subject has been assigned to your account yet — ask your system_admin to assign one.'}
          </Text>
        </View>
      )}
      {isSecretary && secretaryScopes.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingHorizontal: 16, paddingTop: 12 }}>
          {secretaryScopes.map((s, i) => (
            <Pressable
              key={i}
              style={{
                borderWidth: 1.5, borderColor: secretaryScopeIndex === i ? '#7C3AED' : '#DDD6FE',
                backgroundColor: secretaryScopeIndex === i ? '#7C3AED' : '#fff',
                borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, marginRight: 8,
              }}
              onPress={() => setSecretaryScopeIndex(i)}
            >
              <Text style={{ color: secretaryScopeIndex === i ? '#fff' : '#7C3AED', fontWeight: '600', fontSize: 13 }}>
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
          { key: 'pending' as const, he: 'ממתין לאישור', en: 'Pending Approval', badge: pending.length },
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
                        📅 {lang === 'he' ? `יום ${m.dueDaysFromStart}` : `Day ${m.dueDaysFromStart}`}
                        {m.requiresExaminers ? `  ·  👥 ${lang === 'he' ? 'בוחנים' : 'Examiners'}` : ''}
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
                const canDelete = canApproveRole(tpl.processType, userRole);
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
                    {ms.routing && ms.routing.length > 0 ? `  ·  🔀 ${lang === 'he' ? 'שרשרת מותאמת' : 'custom chain'}` : ''}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <Pressable onPress={() => openMilestoneEditor(ms)} style={{ padding: 4 }}><Text>✏️</Text></Pressable>
                  <Pressable onPress={() => removeMilestoneRow(ms)} style={{ padding: 4 }}><Text>🗑️</Text></Pressable>
                </View>
              </View>
            ))}

            <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 4, marginTop: 20 }}>
              {lang === 'he' ? 'שרשרת אישור/דחייה ברירת מחדל' : 'Default approval/rejection chain'}
            </Text>
            <Text style={{ fontSize: 11, color: '#8899BB', marginBottom: 4 }}>
              {lang === 'he'
                ? 'חלה על כל אבן דרך שאין לה שרשרת משלה.'
                : "Applies to every milestone without its own override."}
            </Text>
            <ChainEditor stages={editorDefaultRouting} onChange={setEditorDefaultRouting} lang={lang} />

            <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 4, marginTop: 20 }}>
              {lang === 'he' ? 'אישור נוסף להזמנת בוחנים' : 'Second sign-off before examiner invitations go out'}
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
              <Pressable
                onPress={() => setEditorExaminerSignoffRole('none')}
                style={{ borderWidth: 1.5, borderColor: editorExaminerSignoffRole === 'none' ? '#7C3AED' : '#DDD6FE', backgroundColor: editorExaminerSignoffRole === 'none' ? '#7C3AED' : '#fff', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5, marginEnd: 6 }}
              >
                <Text style={{ fontSize: 11, fontWeight: '600', color: editorExaminerSignoffRole === 'none' ? '#fff' : '#7C3AED' }}>
                  {lang === 'he' ? 'ללא אישור נוסף' : 'No second sign-off'}
                </Text>
              </Pressable>
              {CHAIN_ROLES.map((r) => (
                <Pressable
                  key={r.key}
                  onPress={() => setEditorExaminerSignoffRole(r.key)}
                  style={{ borderWidth: 1.5, borderColor: editorExaminerSignoffRole === r.key ? '#7C3AED' : '#DDD6FE', backgroundColor: editorExaminerSignoffRole === r.key ? '#7C3AED' : '#fff', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5, marginEnd: 6 }}
                >
                  <Text style={{ fontSize: 11, fontWeight: '600', color: editorExaminerSignoffRole === r.key ? '#fff' : '#7C3AED' }}>
                    {lang === 'he' ? r.he : r.en}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 4, marginTop: 16 }}>
              {lang === 'he' ? 'אישור הציון הסופי (הגנה)' : 'Final grade sign-off (defense)'}
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
              {CHAIN_ROLES.map((r) => (
                <Pressable
                  key={r.key}
                  onPress={() => setEditorFinalGradeSignoffRole(r.key)}
                  style={{ borderWidth: 1.5, borderColor: editorFinalGradeSignoffRole === r.key ? '#7C3AED' : '#DDD6FE', backgroundColor: editorFinalGradeSignoffRole === r.key ? '#7C3AED' : '#fff', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5, marginEnd: 6 }}
                >
                  <Text style={{ fontSize: 11, fontWeight: '600', color: editorFinalGradeSignoffRole === r.key ? '#fff' : '#7C3AED' }}>
                    {lang === 'he' ? r.he : r.en}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 8, marginTop: 20 }}>
              {lang === 'he' ? 'מתי התבנית תיכנס לתוקף?' : 'When should this take effect?'}
            </Text>
            {([
              { key: 'from_now_on' as const, he: 'מכאן ואילך (רק תהליכים חדשים)', en: 'From now on (new processes only)' },
              { key: 'now' as const, he: 'עכשיו (גם תהליכים בעיצומם)', en: 'Now (also in-progress processes)' },
            ]).map((opt) => (
              <Pressable
                key={opt.key}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderColor: '#DDD6FE', borderRadius: 10, padding: 12, marginBottom: 8 }}
                onPress={() => handleApplyModeChange(opt.key)}
              >
                <View style={{
                  width: 18, height: 18, borderRadius: 9, borderWidth: 2,
                  borderColor: editorApplyMode === opt.key ? '#7C3AED' : '#DDD6FE',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  {editorApplyMode === opt.key && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#7C3AED' }} />}
                </View>
                <Text style={{ fontSize: 13, color: '#1F1235', flex: 1 }}>{lang === 'he' ? opt.he : opt.en}</Text>
              </Pressable>
            ))}
            {editorApplyMode === 'now' && (
              <Text style={{ fontSize: 12, color: '#EF4444', fontWeight: '600', marginBottom: 12 }}>
                {editorPreviewLoading
                  ? '…'
                  : editorPreview
                    ? (lang === 'he'
                        ? `⚡ יעדכן ${editorPreview.count} תהליכים בעיצומם ברגע שהתבנית תאושר`
                        : `⚡ Will update ${editorPreview.count} in-progress process(es) once approved`)
                    : (lang === 'he' ? 'לא ניתן היה לחשב תצוגה מקדימה' : 'Could not compute a preview')}
              </Text>
            )}

            <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6, marginTop: 8 }}>
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

            {msExaminers && (
              <>
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginTop: 12, marginBottom: 6 }}>
                  {lang === 'he' ? 'מספר בוחנים נדרש' : 'Required number of examiners'}
                </Text>
                <TextInput
                  style={{ borderWidth: 1.5, borderColor: '#DDD6FE', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14 }}
                  value={msExaminerCount}
                  onChangeText={setMsExaminerCount}
                  keyboardType="numeric"
                  placeholder="2"
                />
              </>
            )}

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151' }}>
                {lang === 'he' ? 'שרשרת אישור מותאמת לאבן דרך זו' : 'Override chain for this milestone'}
              </Text>
              <Switch value={msOverrideChain} onValueChange={setMsOverrideChain} trackColor={{ true: '#7C3AED' }} />
            </View>
            {msOverrideChain ? (
              <View style={{ marginTop: 10 }}>
                <ChainEditor stages={msRouting} onChange={setMsRouting} lang={lang} />
              </View>
            ) : (
              <Text style={{ fontSize: 11, color: '#8899BB', marginTop: 6 }}>
                {lang === 'he' ? 'ללא שינוי — ישתמש בשרשרת ברירת המחדל של התבנית.' : "Unchanged — inherits the template's default chain."}
              </Text>
            )}

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
