// app/(tabs)/WorkflowTemplateEditor.tsx
//
// Full-screen "Propose New Version" workflow-template editor — split out of
// WorkflowTemplateManager.tsx's list screen (previously a pageSheet Modal
// rendered inline there) because the form is large (milestone list,
// per-milestone routing, examiner/final-grade signoff role pickers,
// apply-mode selector, retroactive-preview, "copy from other process type"
// banner) and the modal made it look cramped/cut off.
//
// Reached via router.push from WorkflowTemplateManager.tsx with a JSON
// `payload` search param carrying everything the old openEditor() used to
// compute inline from in-memory state: the source template's
// milestones/defaultRouting/examinerSignoffRole/finalGradeSignoffRole (or
// blank defaults when proposing a first version), facultyId, activeMajor,
// activeProcessType, and the copied-from label. No extra API call is needed
// to seed this screen — WorkflowTemplateManager.tsx already had all of this
// in its own `templates` list state.
//
// Pure UI restructuring: same validation, same POST /api/workflow-templates
// (and retroactive-preview GET) request shapes as before. On successful
// submit this screen calls router.back() instead of closing a modal; the
// list screen refetches on focus (see its useFocusEffect) so the new pending
// proposal shows up there.

import React, { useMemo, useState } from 'react';
import {
  View, Text, ScrollView, Pressable,
  ActivityIndicator, Modal, TextInput, Alert, Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { Lang } from '../../components/i18n';
import { TopBar } from '../../components/shared';
import { ResponsiveScreen } from '../../components/ResponsiveScreen';
import { apiClient } from '../../src/api/apiClient';
import {
  CHAIN_ROLES, SIGNOFF_ROLES, DEFAULT_ROUTING, PROCESS_TYPES, chainRoleLabel, SUBMISSION_REQUIREMENTS,
  type ProcessType, type ChainRole, type ChainStage, type MilestoneRoutingSpec,
  type GradingComponentSpec, type FormFieldSpec, type FinalGradeComponents,
  type MilestoneSpec, type ApplyMode, type SubmissionRequirement,
} from './WorkflowTemplateManager';

// ─── Payload passed across the route boundary from WorkflowTemplateManager ──

export interface WorkflowTemplateEditorPayload {
  lang: Lang;
  userName: string;
  userRole: string;
  processType: ProcessType;
  facultyId: string | null;
  activeMajor: string | null;
  /** Mirrors the old `isFreeChoiceCrossFaculty || isCoordinator` check that
   *  decided whether the POST body should include an explicit facultyId. */
  includeFacultyIdInSubmit: boolean;
  /** Empty means "no source template" — this screen falls back to a single
   *  blank milestone, same as openEditor() used to. */
  milestones: MilestoneSpec[];
  defaultRouting: MilestoneRoutingSpec | null;
  examinerSignoffRole: ChainRole | 'none' | null;
  finalGradeSignoffRole: ChainRole | null;
  copiedFromLabel: string | null;
}

// ─── Milestone/stage id + blank-row helpers (moved from WorkflowTemplateManager —
// only ever used by this editor and its nested milestone sub-editor) ────────

function makeId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function emptyMilestone(order: number): MilestoneSpec {
  return { type: `custom_${makeId()}`, nameHe: '', nameEn: '', order, dueDaysFromStart: 90, requiresExaminers: false, submissionRequirement: 'both' };
}

function makeStageId(): string {
  return `stage_${Math.random().toString(36).slice(2, 8)}`;
}

function emptyStage(): ChainStage {
  return { id: makeStageId(), role: 'coordinator', action: 'approve', rejectTo: 'student' };
}

// ─── Approval-chain editor (moved verbatim from WorkflowTemplateManager) ───
// Ordered stage list — reuses the same chip-row Pressable idiom this screen
// already uses elsewhere. Reordering (▲/▼, swap-adjacent-elements) ports
// web/app/workflow-templates/ChainEditor.tsx's own logic verbatim.
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

// ─── Staff record + three-rubric final grade helpers (moved verbatim from
// WorkflowTemplateManager) ──────────────────────────────────────────────────
// Ports web/app/workflow-templates/MilestoneRowModal.tsx's emptyComponent/
// emptyFormField/FORM_FIELD_TYPES/RubricEditor verbatim (RN idiom).
function emptyGradingComponent(): GradingComponentSpec {
  return { key: `c_${Math.random().toString(36).slice(2, 8)}`, labelHe: '', labelEn: '', maxScore: 20, weight: 20, hasComment: true, visibleToStudent: true };
}

function emptyFormField(): FormFieldSpec {
  return { key: `f_${Math.random().toString(36).slice(2, 8)}`, labelHe: '', labelEn: '', type: 'text', required: false };
}

// Matches web's FORM_FIELD_TYPES — 'table' is deliberately not offered here
// either (see FormFieldSpec's doc comment in WorkflowTemplateManager.tsx).
const FORM_FIELD_TYPES: Array<{ value: FormFieldSpec['type']; he: string; en: string }> = [
  { value: 'text', he: 'טקסט קצר', en: 'Short text' },
  { value: 'textarea', he: 'טקסט ארוך', en: 'Long text' },
  { value: 'date', he: 'תאריך', en: 'Date' },
  { value: 'number', he: 'מספר', en: 'Number' },
];

// One rubric's component list + its own overall weight — used three times for
// a defense milestone's finalGradeComponents (supervisor / examiner-project /
// examiner-defense).
function GradingRubricEditor({
  title, components, setComponents, weight, setWeight, lang,
}: {
  title: string;
  components: GradingComponentSpec[];
  setComponents: (updater: (prev: GradingComponentSpec[]) => GradingComponentSpec[]) => void;
  weight: string;
  setWeight: (v: string) => void;
  lang: Lang;
}) {
  const weightSum = components.reduce((sum, c) => sum + (Number(c.weight) || 0), 0);
  const updateComponent = (idx: number, patch: Partial<GradingComponentSpec>) => {
    setComponents((prev) => prev.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  };
  const removeComponent = (idx: number) => setComponents((prev) => prev.filter((_, i) => i !== idx));

  return (
    <View style={{ borderWidth: 1, borderColor: '#DDD6FE', borderRadius: 10, padding: 10, backgroundColor: '#F5F3FF' }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontSize: 12, fontWeight: '700', color: '#1F1235', flex: 1 }}>
          {title}{components.length > 0 ? `  (${weightSum}/100)` : ''}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Text style={{ fontSize: 11, color: '#8899BB' }}>{lang === 'he' ? 'משקל כללי %' : 'Overall weight %'}</Text>
          <TextInput
            style={{ width: 44, borderWidth: 1, borderColor: '#DDD6FE', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3, fontSize: 12, textAlign: 'center', backgroundColor: '#fff' }}
            value={weight}
            onChangeText={setWeight}
            keyboardType="numeric"
          />
        </View>
      </View>

      {components.map((c, idx) => (
        <View key={c.key} style={{ backgroundColor: '#fff', borderRadius: 8, padding: 8, marginTop: 8 }}>
          <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
            <TextInput
              style={{ flex: 1, borderWidth: 1, borderColor: '#DDD6FE', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6, fontSize: 12 }}
              value={c.labelHe}
              onChangeText={(v) => updateComponent(idx, { labelHe: v })}
              placeholder={lang === 'he' ? 'שם (עברית)' : 'Name (Hebrew)'}
              textAlign="right"
            />
            <TextInput
              style={{ flex: 1, borderWidth: 1, borderColor: '#DDD6FE', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6, fontSize: 12 }}
              value={c.labelEn}
              onChangeText={(v) => updateComponent(idx, { labelEn: v })}
              placeholder={lang === 'he' ? 'שם (אנגלית)' : 'Name (English)'}
            />
            <Pressable onPress={() => removeComponent(idx)} style={{ padding: 4 }}>
              <Text>🗑️</Text>
            </Pressable>
          </View>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={{ fontSize: 11, color: '#8899BB' }}>{lang === 'he' ? 'ניקוד מקסימלי' : 'Max score'}</Text>
              <TextInput
                style={{ width: 44, borderWidth: 1, borderColor: '#DDD6FE', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3, fontSize: 12, textAlign: 'center' }}
                value={String(c.maxScore)}
                onChangeText={(v) => updateComponent(idx, { maxScore: Number(v) || 0 })}
                keyboardType="numeric"
              />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={{ fontSize: 11, color: '#8899BB' }}>{lang === 'he' ? 'משקל %' : 'Weight %'}</Text>
              <TextInput
                style={{ width: 44, borderWidth: 1, borderColor: '#DDD6FE', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3, fontSize: 12, textAlign: 'center' }}
                value={String(c.weight)}
                onChangeText={(v) => updateComponent(idx, { weight: Number(v) || 0 })}
                keyboardType="numeric"
              />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Switch value={c.hasComment} onValueChange={(v) => updateComponent(idx, { hasComment: v })} trackColor={{ true: '#7C3AED' }} />
              <Text style={{ fontSize: 11, color: '#8899BB' }}>{lang === 'he' ? 'שדה הערה' : 'Comment field'}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Switch value={c.visibleToStudent} onValueChange={(v) => updateComponent(idx, { visibleToStudent: v })} trackColor={{ true: '#7C3AED' }} />
              <Text style={{ fontSize: 11, color: '#8899BB' }}>{lang === 'he' ? 'גלוי לסטודנט' : 'Visible to student'}</Text>
            </View>
          </View>
        </View>
      ))}

      <Pressable
        onPress={() => setComponents((prev) => [...prev, emptyGradingComponent()])}
        style={{ backgroundColor: '#7C3AED', borderRadius: 8, paddingVertical: 6, alignItems: 'center', marginTop: 8 }}
      >
        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>＋ {lang === 'he' ? 'הוסף' : 'Add'}</Text>
      </Pressable>
    </View>
  );
}

// ─── Component ────────────────────────────────────────────────────────────

export default function WorkflowTemplateEditor() {
  const router = useRouter();
  const params = useLocalSearchParams<{ payload: string }>();

  const payload: WorkflowTemplateEditorPayload = useMemo(() => {
    try {
      return JSON.parse((params.payload as string) ?? '{}');
    } catch {
      return {} as WorkflowTemplateEditorPayload;
    }
  }, [params.payload]);

  const [lang, setLang] = useState<Lang>(payload.lang ?? 'he');
  const isRtl = lang === 'he';

  const [saving, setSaving] = useState(false);

  // Propose editor — seeded from the payload instead of an openEditor() call.
  const [editorMilestones, setEditorMilestones] = useState<MilestoneSpec[]>(
    payload.milestones && payload.milestones.length > 0
      ? payload.milestones.map((m) => ({ ...m }))
      : [emptyMilestone(1)]
  );
  const [editorNote, setEditorNote] = useState('');
  const [editorApplyMode, setEditorApplyMode] = useState<ApplyMode>('from_now_on');
  const [editorPreview, setEditorPreview] = useState<{ count: number } | null>(null);
  const [editorPreviewLoading, setEditorPreviewLoading] = useState(false);
  const [editorDefaultRouting, setEditorDefaultRouting] = useState<MilestoneRoutingSpec>(
    payload.defaultRouting && payload.defaultRouting.length > 0
      ? payload.defaultRouting.map((s) => ({ ...s }))
      : DEFAULT_ROUTING.map((s) => ({ ...s }))
  );
  // Legacy default matches the server's own resolveExaminerSignoffRole fallback.
  const [editorExaminerSignoffRole, setEditorExaminerSignoffRole] = useState<ChainRole | 'none'>(
    payload.examinerSignoffRole ?? (payload.processType === 'msc_thesis' ? 'grad_school_head' : 'none')
  );
  const [editorFinalGradeSignoffRole, setEditorFinalGradeSignoffRole] = useState<ChainRole>(
    payload.finalGradeSignoffRole ?? 'grad_school_head'
  );
  const editorCopiedFromLabel = payload.copiedFromLabel ?? null;

  // Milestone row editor (inside this screen) — stays a small in-screen
  // Modal, it's a focused sub-form, not the thing that needed to become a
  // full screen.
  const [msModalOpen, setMsModalOpen] = useState(false);
  const [editingMs, setEditingMs] = useState<MilestoneSpec | null>(null);
  const [msNameHe, setMsNameHe] = useState('');
  const [msNameEn, setMsNameEn] = useState('');
  const [msDateMode, setMsDateMode] = useState<'offset' | 'fixed'>('offset');
  const [msDays, setMsDays] = useState('90');
  const [msFixedDate, setMsFixedDate] = useState('');
  const [msPercentOfFinalGrade, setMsPercentOfFinalGrade] = useState('0');
  const [msExaminers, setMsExaminers] = useState(false);
  const [msExaminerCount, setMsExaminerCount] = useState('2');
  const [msOverrideChain, setMsOverrideChain] = useState(false);
  const [msRouting, setMsRouting] = useState<MilestoneRoutingSpec>([emptyStage()]);
  const [msSubmissionRequirement, setMsSubmissionRequirement] = useState<SubmissionRequirement>('both');
  // research_proposal/progress_report only — an official staff (supervisor)
  // record alongside the student's own submission.
  const [msStaffRecordMode, setMsStaffRecordMode] = useState<'none' | 'upload_or_form'>('none');
  const [msStaffFormFields, setMsStaffFormFields] = useState<FormFieldSpec[]>([]);
  // defense only — the three-independent-rubric final-grade workflow,
  // replacing the single shared gradingComponents rubric when enabled.
  const [msUseFinalGradeComponents, setMsUseFinalGradeComponents] = useState(false);
  const [msSupervisorEvalComponents, setMsSupervisorEvalComponents] = useState<GradingComponentSpec[]>([]);
  const [msSupervisorEvalWeight, setMsSupervisorEvalWeight] = useState('40');
  const [msExaminerProjectComponents, setMsExaminerProjectComponents] = useState<GradingComponentSpec[]>([]);
  const [msExaminerProjectWeight, setMsExaminerProjectWeight] = useState('30');
  const [msExaminerDefenseComponents, setMsExaminerDefenseComponents] = useState<GradingComponentSpec[]>([]);
  const [msExaminerDefenseWeight, setMsExaminerDefenseWeight] = useState('30');
  const msIsProposalOrMidterm = editingMs?.type === 'research_proposal' || editingMs?.type === 'progress_report';
  const msIsDefense = editingMs?.type === 'defense';

  const handleApplyModeChange = async (mode: ApplyMode) => {
    setEditorApplyMode(mode);
    if (mode !== 'now' || !payload.facultyId) return;
    setEditorPreviewLoading(true);
    try {
      const res = await apiClient.get('/api/workflow-templates/retroactive-preview', {
        params: { facultyId: payload.facultyId, major: payload.activeMajor === null ? 'all' : payload.activeMajor, processType: payload.processType },
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
      setMsDateMode(ms.dateMode === 'fixed' ? 'fixed' : 'offset');
      setMsDays(String(ms.dueDaysFromStart));
      setMsFixedDate(ms.fixedDate ?? '');
      setMsPercentOfFinalGrade(String(ms.percentOfFinalGrade ?? 0));
      setMsExaminers(ms.requiresExaminers);
      setMsExaminerCount(String(ms.examinerCount ?? 2));
      setMsOverrideChain(!!(ms.routing && ms.routing.length > 0));
      setMsRouting(ms.routing && ms.routing.length > 0 ? ms.routing.map((s) => ({ ...s })) : [emptyStage()]);
      setMsSubmissionRequirement(ms.submissionRequirement ?? 'both');
      setMsStaffRecordMode(ms.staffRecordMode ?? 'none');
      setMsStaffFormFields(ms.staffFormFields ? ms.staffFormFields.map((f) => ({ ...f })) : []);
      setMsUseFinalGradeComponents(!!ms.finalGradeComponents);
      setMsSupervisorEvalComponents(ms.finalGradeComponents?.supervisorEvaluation.components.map((c) => ({ ...c })) ?? []);
      setMsSupervisorEvalWeight(String(ms.finalGradeComponents?.supervisorEvaluation.weight ?? 40));
      setMsExaminerProjectComponents(ms.finalGradeComponents?.examinerProjectEvaluation.components.map((c) => ({ ...c })) ?? []);
      setMsExaminerProjectWeight(String(ms.finalGradeComponents?.examinerProjectEvaluation.weight ?? 30));
      setMsExaminerDefenseComponents(ms.finalGradeComponents?.examinerDefenseEvaluation.components.map((c) => ({ ...c })) ?? []);
      setMsExaminerDefenseWeight(String(ms.finalGradeComponents?.examinerDefenseEvaluation.weight ?? 30));
    } else {
      setEditingMs(null);
      setMsNameHe(''); setMsNameEn(''); setMsDateMode('offset'); setMsDays('90'); setMsFixedDate(''); setMsPercentOfFinalGrade('0'); setMsExaminers(false); setMsExaminerCount('2');
      setMsOverrideChain(false);
      setMsRouting([emptyStage()]);
      setMsSubmissionRequirement('both');
      setMsStaffRecordMode('none');
      setMsStaffFormFields([]);
      setMsUseFinalGradeComponents(false);
      setMsSupervisorEvalComponents([]); setMsSupervisorEvalWeight('40');
      setMsExaminerProjectComponents([]); setMsExaminerProjectWeight('30');
      setMsExaminerDefenseComponents([]); setMsExaminerDefenseWeight('30');
    }
    setMsModalOpen(true);
  };

  const saveMilestoneRow = () => {
    if (!msNameHe.trim() || !msNameEn.trim()) {
      Alert.alert(lang === 'he' ? 'שגיאה' : 'Error', lang === 'he' ? 'יש להזין שם לאבן הדרך' : 'Enter a milestone name');
      return;
    }
    let days = 0;
    let fixedDate = '';
    if (msDateMode === 'fixed') {
      if (!msFixedDate.trim() || isNaN(new Date(msFixedDate).getTime())) {
        Alert.alert(lang === 'he' ? 'שגיאה' : 'Error', lang === 'he' ? 'יש להזין תאריך יעד תקין' : 'Enter a valid due date');
        return;
      }
      fixedDate = msFixedDate;
    } else {
      days = parseInt(msDays, 10);
      if (!Number.isFinite(days) || days < 0) {
        Alert.alert(lang === 'he' ? 'שגיאה' : 'Error', lang === 'he' ? 'מספר ימים לא תקין' : 'Invalid number of days');
        return;
      }
    }
    const examinerCount = parseInt(msExaminerCount, 10);
    if (msExaminers && (!Number.isFinite(examinerCount) || examinerCount < 1)) {
      Alert.alert(lang === 'he' ? 'שגיאה' : 'Error', lang === 'he' ? 'מספר בוחנים לא תקין' : 'Invalid examiner count');
      return;
    }
    const percentOfFinalGrade = Number(msPercentOfFinalGrade);
    if (!Number.isFinite(percentOfFinalGrade) || percentOfFinalGrade < 0 || percentOfFinalGrade > 100) {
      Alert.alert(lang === 'he' ? 'שגיאה' : 'Error', lang === 'he' ? 'אחוז מהציון הסופי חייב להיות בין 0 ל-100' : 'Percentage of final grade must be between 0 and 100');
      return;
    }
    if (msIsProposalOrMidterm && msStaffRecordMode === 'upload_or_form') {
      if (msStaffFormFields.some((f) => !f.labelHe.trim() || !f.labelEn.trim())) {
        Alert.alert(lang === 'he' ? 'שגיאה' : 'Error', lang === 'he' ? 'יש להזין שם לכל שדה בטופס (עברית ואנגלית)' : 'Enter a name for every form field (Hebrew and English)');
        return;
      }
    }

    let finalGradeComponents: FinalGradeComponents | undefined;
    if (msIsDefense && msUseFinalGradeComponents) {
      const rubrics = [
        { label: lang === 'he' ? 'הערכת מנחה' : 'Supervisor evaluation', components: msSupervisorEvalComponents, weight: msSupervisorEvalWeight },
        { label: lang === 'he' ? 'הערכת בוחן — עבודת הגמר' : 'Examiner evaluation — the project', components: msExaminerProjectComponents, weight: msExaminerProjectWeight },
        { label: lang === 'he' ? 'הערכת בוחן — בחינת ההגנה' : 'Examiner evaluation — the defense exam', components: msExaminerDefenseComponents, weight: msExaminerDefenseWeight },
      ];
      for (const r of rubrics) {
        if (r.components.length === 0 || r.components.some((c) => !c.labelHe.trim() || !c.labelEn.trim())) {
          Alert.alert(lang === 'he' ? 'שגיאה' : 'Error', lang === 'he' ? `יש להגדיר לפחות מרכיב ציון אחד עם שם עבור: ${r.label}` : `Define at least one named grading component for: ${r.label}`);
          return;
        }
        const sum = r.components.reduce((s, c) => s + (Number(c.weight) || 0), 0);
        if (sum !== 100) {
          Alert.alert(lang === 'he' ? 'שגיאה' : 'Error', lang === 'he' ? `סכום המשקלים ב"${r.label}" חייב להיות 100 (כרגע ${sum})` : `Component weights in "${r.label}" must sum to 100 (currently ${sum})`);
          return;
        }
      }
      const w1 = Number(msSupervisorEvalWeight) || 0;
      const w2 = Number(msExaminerProjectWeight) || 0;
      const w3 = Number(msExaminerDefenseWeight) || 0;
      if (w1 + w2 + w3 !== 100) {
        Alert.alert(lang === 'he' ? 'שגיאה' : 'Error', lang === 'he' ? `סכום המשקלים הכלליים של שלושת המרכיבים חייב להיות 100 (כרגע ${w1 + w2 + w3})` : `The three rubrics' overall weights must sum to 100 (currently ${w1 + w2 + w3})`);
        return;
      }
      finalGradeComponents = {
        supervisorEvaluation: { components: msSupervisorEvalComponents, weight: w1 },
        examinerProjectEvaluation: { components: msExaminerProjectComponents, weight: w2 },
        examinerDefenseEvaluation: { components: msExaminerDefenseComponents, weight: w3 },
      };
    }

    if (editingMs) {
      setEditorMilestones((prev) => prev.map((m) => {
        if (m !== editingMs) return m;
        const next: MilestoneSpec = {
          ...m, nameHe: msNameHe.trim(), nameEn: msNameEn.trim(), dueDaysFromStart: days, percentOfFinalGrade, requiresExaminers: msExaminers,
          submissionRequirement: msSubmissionRequirement,
        };
        if (msDateMode === 'fixed') { next.dateMode = 'fixed'; next.fixedDate = fixedDate; }
        else { delete next.dateMode; delete next.fixedDate; }
        if (msExaminers) next.examinerCount = examinerCount;
        else delete next.examinerCount;
        // Turning the override off must actually clear a pre-existing
        // routing, not leave the stale chain behind. Same rule for
        // finalGradeComponents (three-rubric toggle) below.
        if (msOverrideChain) next.routing = msRouting;
        else delete next.routing;
        if (msIsProposalOrMidterm) {
          next.staffRecordMode = msStaffRecordMode;
          next.staffFormFields = msStaffRecordMode === 'upload_or_form' ? msStaffFormFields : [];
        }
        if (finalGradeComponents) next.finalGradeComponents = finalGradeComponents;
        else delete next.finalGradeComponents;
        return next;
      }));
    } else {
      setEditorMilestones((prev) => {
        const next: MilestoneSpec = {
          type: `custom_${makeId()}`, nameHe: msNameHe.trim(), nameEn: msNameEn.trim(), order: prev.length + 1, dueDaysFromStart: days, percentOfFinalGrade, requiresExaminers: msExaminers,
          submissionRequirement: msSubmissionRequirement,
        };
        if (msDateMode === 'fixed') { next.dateMode = 'fixed'; next.fixedDate = fixedDate; }
        if (msExaminers) next.examinerCount = examinerCount;
        if (msOverrideChain) next.routing = msRouting;
        if (msIsProposalOrMidterm) {
          next.staffRecordMode = msStaffRecordMode;
          next.staffFormFields = msStaffRecordMode === 'upload_or_form' ? msStaffFormFields : [];
        }
        if (finalGradeComponents) next.finalGradeComponents = finalGradeComponents;
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
    const totalPercent = editorMilestones.reduce((sum, m) => sum + (m.percentOfFinalGrade ?? 0), 0);
    if (Math.abs(totalPercent - 100) > 0.01) {
      Alert.alert(
        lang === 'he' ? 'שגיאה' : 'Error',
        lang === 'he'
          ? `סכום האחוזים מהציון הסופי של כל אבני הדרך חייב להיות 100 (כרגע ${totalPercent})`
          : `The final-grade percentages across all milestones must sum to 100 (currently ${totalPercent})`
      );
      return;
    }
    setSaving(true);
    try {
      await apiClient.post('/api/workflow-templates', {
        processType: payload.processType,
        milestones: editorMilestones,
        note: editorNote.trim() || undefined,
        major: payload.activeMajor === null ? 'all' : payload.activeMajor,
        applyMode: editorApplyMode,
        defaultRouting: editorDefaultRouting,
        examinerSignoffRole: editorExaminerSignoffRole,
        finalGradeSignoffRole: editorFinalGradeSignoffRole,
        ...(payload.includeFacultyIdInSubmit && payload.facultyId ? { facultyId: payload.facultyId } : {}),
      });
      Alert.alert(
        '✅',
        lang === 'he' ? 'ההצעה נשלחה לאישור' : 'Proposal submitted for approval'
      );
      // Mirrors the old onProposed behavior (jump the list to Pending) —
      // router.back() can't carry params, so replace back into the list
      // route with a signal it reads on focus (see its useFocusEffect).
      router.replace({ pathname: '/WorkflowTemplateManager', params: { initialTab: 'pending' } } as any);
    } catch (e: any) {
      Alert.alert('❌', e.response?.data?.message || (lang === 'he' ? 'שליחת ההצעה נכשלה' : 'Failed to submit proposal'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F8F7FF' }}>
      <TopBar
        name={payload.userName ?? ''}
        role={(payload.userRole as any) ?? 'faculty_admin'}
        lang={lang}
        isRtl={isRtl}
        onToggleLang={() => setLang(lang === 'he' ? 'en' : 'he')}
      />

      {/* Screen header — replaces the old modal's title + ✕ dismiss row */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#F0EBFF' }}>
        <Text style={{ fontSize: 18, fontWeight: '700', color: '#1F1235' }}>
          {lang === 'he' ? '➕ הצעת גרסה חדשה' : '➕ Propose New Version'}
        </Text>
        <Pressable onPress={() => router.back()}>
          <Text style={{ fontSize: 20, color: '#8899BB' }}>✕</Text>
        </Pressable>
      </View>

      <ResponsiveScreen>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <View style={{ backgroundColor: '#EDE9FE', borderRadius: 10, padding: 12, marginBottom: 16 }}>
          <Text style={{ fontSize: 13, color: '#5B21B6', fontWeight: '600' }}>
            🎓 {lang === 'he' ? PROCESS_TYPES.find((p) => p.key === payload.processType)?.he : PROCESS_TYPES.find((p) => p.key === payload.processType)?.en}
          </Text>
        </View>

        {editorCopiedFromLabel && (
          <View style={{ backgroundColor: '#E9F0F5', borderRadius: 10, padding: 12, marginBottom: 16 }}>
            <Text style={{ fontSize: 12, color: '#3E6C8C' }}>
              📋 {lang === 'he'
                ? `הועתק מתבנית ${editorCopiedFromLabel} — ניתן לערוך הכל לפני השליחה.`
                : `Copied from the ${editorCopiedFromLabel} template — everything below is still editable before you submit.`}
            </Text>
          </View>
        )}

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
                📅 {ms.dateMode === 'fixed'
                  ? (lang === 'he' ? `תאריך קבוע: ${ms.fixedDate ?? '—'}` : `Fixed: ${ms.fixedDate ?? '—'}`)
                  : (lang === 'he' ? `יום ${ms.dueDaysFromStart}` : `Day ${ms.dueDaysFromStart}`)}
                {ms.requiresExaminers ? '  ·  👥' : ''}
                {ms.staffRecordMode === 'upload_or_form' ? `  ·  📝 ${lang === 'he' ? 'רשומת מנחה' : 'Staff record'}` : ''}
                {ms.finalGradeComponents ? `  ·  ⚖️ ${lang === 'he' ? 'ציון משולש' : '3-rubric grading'}` : ''}
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
          {SIGNOFF_ROLES.map((r) => (
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
          {SIGNOFF_ROLES.map((r) => (
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
        <Pressable style={{ borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 10 }} onPress={() => router.back()}>
          <Text style={{ color: '#8899BB', fontSize: 14 }}>{lang === 'he' ? 'ביטול' : 'Cancel'}</Text>
        </Pressable>
      </ScrollView>
      </ResponsiveScreen>

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
            <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 }}>{lang === 'he' ? 'מועד יעד' : 'Due date'}</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
              <Pressable
                onPress={() => setMsDateMode('offset')}
                style={{ flex: 1, borderRadius: 8, paddingVertical: 8, alignItems: 'center', borderWidth: 1.5, borderColor: msDateMode === 'offset' ? '#7C3AED' : '#DDD6FE', backgroundColor: msDateMode === 'offset' ? '#7C3AED' : '#fff' }}
              >
                <Text style={{ fontSize: 12, fontWeight: '600', color: msDateMode === 'offset' ? '#fff' : '#374151' }}>
                  {lang === 'he' ? 'ימים מתחילת התהליך' : 'Days from start'}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setMsDateMode('fixed')}
                style={{ flex: 1, borderRadius: 8, paddingVertical: 8, alignItems: 'center', borderWidth: 1.5, borderColor: msDateMode === 'fixed' ? '#7C3AED' : '#DDD6FE', backgroundColor: msDateMode === 'fixed' ? '#7C3AED' : '#fff' }}
              >
                <Text style={{ fontSize: 12, fontWeight: '600', color: msDateMode === 'fixed' ? '#fff' : '#374151' }}>
                  {lang === 'he' ? 'תאריך קבוע' : 'Fixed date'}
                </Text>
              </Pressable>
            </View>
            {msDateMode === 'offset' ? (
              <TextInput style={{ borderWidth: 1.5, borderColor: '#DDD6FE', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, marginBottom: 12 }} value={msDays} onChangeText={setMsDays} keyboardType="numeric" placeholder="90" />
            ) : (
              <>
                <TextInput
                  style={{ borderWidth: 1.5, borderColor: '#DDD6FE', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, marginBottom: 4 }}
                  value={msFixedDate}
                  onChangeText={setMsFixedDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="#9CA3AF"
                />
                <Text style={{ fontSize: 11, color: '#8899BB', marginBottom: 12 }}>
                  {lang === 'he'
                    ? 'תאריך אחד לכל הסטודנטים בתבנית זו, ללא קשר למועד ההרשמה שלהם.'
                    : 'One date for every student under this template, regardless of when they enrolled.'}
                </Text>
              </>
            )}
            <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginTop: 12, marginBottom: 6 }}>
              {lang === 'he' ? 'אחוז מהציון הסופי' : '% of final grade'}
            </Text>
            <Text style={{ fontSize: 11, color: '#8899BB', marginBottom: 6 }}>
              {lang === 'he'
                ? 'כמה אבן דרך זו תורמת לציון הסופי הכולל של הפרויקט. סכום האחוזים של כל אבני הדרך בתבנית חייב להיות 100.'
                : "How much this milestone counts toward the project's overall final grade. Every milestone's percentage in the template must sum to 100."}
            </Text>
            <TextInput
              style={{ borderWidth: 1.5, borderColor: '#DDD6FE', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, marginBottom: 12 }}
              value={msPercentOfFinalGrade}
              onChangeText={setMsPercentOfFinalGrade}
              keyboardType="numeric"
              placeholder="0"
            />
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

            <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginTop: 16, marginBottom: 6 }}>
              {lang === 'he' ? 'מה נדרש בהגשת הסטודנט/ית' : "What the student's submission requires"}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {SUBMISSION_REQUIREMENTS.map((opt) => (
                <Pressable
                  key={opt.key}
                  onPress={() => setMsSubmissionRequirement(opt.key)}
                  style={{ borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1.5, borderColor: msSubmissionRequirement === opt.key ? '#7C3AED' : '#DDD6FE', backgroundColor: msSubmissionRequirement === opt.key ? '#7C3AED' : '#fff' }}
                >
                  <Text style={{ fontSize: 12, fontWeight: '600', color: msSubmissionRequirement === opt.key ? '#fff' : '#374151' }}>
                    {lang === 'he' ? opt.he : opt.en}
                  </Text>
                </Pressable>
              ))}
            </View>
            {msSubmissionRequirement === 'none' && (
              <Text style={{ fontSize: 11, color: '#EF4444', marginTop: 6 }}>
                {lang === 'he'
                  ? '⚠️ לא מומלץ — הסטודנט/ית יוכל/תוכל להגיש ללא כל קובץ או הערה.'
                  : "⚠️ Not recommended — the student will be able to submit with no file or comment at all."}
              </Text>
            )}

            {msIsProposalOrMidterm && (
              <View style={{ marginTop: 16, borderWidth: 1, borderColor: '#DDD6FE', borderRadius: 10, padding: 12 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 4 }}>
                  {lang === 'he' ? 'רשומת מנחה (אופציונלי)' : 'Staff record (optional)'}
                </Text>
                <Text style={{ fontSize: 11, color: '#8899BB', marginBottom: 8 }}>
                  {lang === 'he'
                    ? 'בנוסף להגשת הסטודנט/ית, ניתן לאפשר למנחה לצרף רשומה רשמית — קובץ מלא או טופס מקוון.'
                    : "On top of the student's own submission, let the supervisor attach an official record — either a completed file or an online form."}
                </Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Pressable
                    onPress={() => setMsStaffRecordMode('none')}
                    style={{ flex: 1, borderRadius: 8, paddingVertical: 8, alignItems: 'center', borderWidth: 1.5, borderColor: msStaffRecordMode === 'none' ? '#7C3AED' : '#DDD6FE', backgroundColor: msStaffRecordMode === 'none' ? '#7C3AED' : '#fff' }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '600', color: msStaffRecordMode === 'none' ? '#fff' : '#374151' }}>
                      {lang === 'he' ? 'ללא' : 'None'}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setMsStaffRecordMode('upload_or_form')}
                    style={{ flex: 1, borderRadius: 8, paddingVertical: 8, alignItems: 'center', borderWidth: 1.5, borderColor: msStaffRecordMode === 'upload_or_form' ? '#7C3AED' : '#DDD6FE', backgroundColor: msStaffRecordMode === 'upload_or_form' ? '#7C3AED' : '#fff' }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '600', color: msStaffRecordMode === 'upload_or_form' ? '#fff' : '#374151' }}>
                      {lang === 'he' ? 'קובץ או טופס' : 'File or form'}
                    </Text>
                  </Pressable>
                </View>

                {msStaffRecordMode === 'upload_or_form' && (
                  <View style={{ marginTop: 12 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ fontSize: 12, fontWeight: '600', color: '#374151' }}>
                        {lang === 'he' ? 'שדות הטופס המקוון' : 'Online form fields'}
                      </Text>
                      <Pressable
                        style={{ backgroundColor: '#7C3AED', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}
                        onPress={() => setMsStaffFormFields((prev) => [...prev, emptyFormField()])}
                      >
                        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>＋ {lang === 'he' ? 'הוסף' : 'Add'}</Text>
                      </Pressable>
                    </View>
                    {msStaffFormFields.length === 0 && (
                      <Text style={{ fontSize: 11, color: '#8899BB', marginTop: 4 }}>
                        {lang === 'he' ? 'ניתן להשאיר ריק — יאפשר רק העלאת קובץ.' : 'Can be left empty — that just leaves file upload as the only option.'}
                      </Text>
                    )}
                    {msStaffFormFields.map((f, idx) => (
                      <View key={f.key} style={{ backgroundColor: '#F5F3FF', borderRadius: 8, padding: 8, marginTop: 8 }}>
                        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                          <TextInput
                            style={{ flex: 1, borderWidth: 1, borderColor: '#DDD6FE', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6, fontSize: 12, backgroundColor: '#fff' }}
                            value={f.labelHe}
                            onChangeText={(v) => setMsStaffFormFields((prev) => prev.map((x, i) => (i === idx ? { ...x, labelHe: v } : x)))}
                            placeholder={lang === 'he' ? 'תווית (עברית)' : 'Label (Hebrew)'}
                            textAlign="right"
                          />
                          <TextInput
                            style={{ flex: 1, borderWidth: 1, borderColor: '#DDD6FE', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6, fontSize: 12, backgroundColor: '#fff' }}
                            value={f.labelEn}
                            onChangeText={(v) => setMsStaffFormFields((prev) => prev.map((x, i) => (i === idx ? { ...x, labelEn: v } : x)))}
                            placeholder={lang === 'he' ? 'תווית (אנגלית)' : 'Label (English)'}
                          />
                          <Pressable onPress={() => setMsStaffFormFields((prev) => prev.filter((_, i) => i !== idx))} style={{ padding: 4 }}>
                            <Text>🗑️</Text>
                          </Pressable>
                        </View>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                          {FORM_FIELD_TYPES.map((opt) => (
                            <Pressable
                              key={opt.value}
                              onPress={() => setMsStaffFormFields((prev) => prev.map((x, i) => (i === idx ? { ...x, type: opt.value } : x)))}
                              style={{ borderWidth: 1.5, borderColor: f.type === opt.value ? '#7C3AED' : '#DDD6FE', backgroundColor: f.type === opt.value ? '#7C3AED' : '#fff', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 4 }}
                            >
                              <Text style={{ fontSize: 11, fontWeight: '600', color: f.type === opt.value ? '#fff' : '#7C3AED' }}>
                                {lang === 'he' ? opt.he : opt.en}
                              </Text>
                            </Pressable>
                          ))}
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }}>
                          <Switch
                            value={f.required}
                            onValueChange={(v) => setMsStaffFormFields((prev) => prev.map((x, i) => (i === idx ? { ...x, required: v } : x)))}
                            trackColor={{ true: '#7C3AED' }}
                          />
                          <Text style={{ fontSize: 11, color: '#8899BB' }}>{lang === 'he' ? 'שדה חובה' : 'Required'}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}

            {msIsDefense && (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', flex: 1, marginEnd: 8 }}>
                  {lang === 'he' ? 'שימוש בתהליך ציון סופי משולש (מנחה + 2 בוחנים)' : 'Use three-rubric final grade (supervisor + 2 examiner rubrics)'}
                </Text>
                <Switch value={msUseFinalGradeComponents} onValueChange={setMsUseFinalGradeComponents} trackColor={{ true: '#7C3AED' }} />
              </View>
            )}

            {msIsDefense && msUseFinalGradeComponents && (
              <View style={{ marginTop: 12 }}>
                <Text style={{ fontSize: 11, color: '#8899BB', marginBottom: 10 }}>
                  {lang === 'he'
                    ? 'הציון הסופי יחושב אוטומטית משלושת המרכיבים לפי המשקל הכללי של כל אחד (חייבים לסכם ל-100). המנחה יוכל לאשר את הציון המחושב או לשנותו בנימוק, בכפוף לאישור הרכז.'
                    : "The final grade is computed automatically from the three rubrics, weighted by each one's overall share (must sum to 100). The supervisor can approve the computed grade or change it with a reason, subject to the coordinator's approval."}
                </Text>
                <GradingRubricEditor
                  title={lang === 'he' ? 'הערכת מנחה' : 'Supervisor evaluation'}
                  components={msSupervisorEvalComponents}
                  setComponents={setMsSupervisorEvalComponents}
                  weight={msSupervisorEvalWeight}
                  setWeight={setMsSupervisorEvalWeight}
                  lang={lang}
                />
                <View style={{ height: 10 }} />
                <GradingRubricEditor
                  title={lang === 'he' ? 'הערכת בוחן — עבודת הגמר' : 'Examiner evaluation — the project'}
                  components={msExaminerProjectComponents}
                  setComponents={setMsExaminerProjectComponents}
                  weight={msExaminerProjectWeight}
                  setWeight={setMsExaminerProjectWeight}
                  lang={lang}
                />
                <View style={{ height: 10 }} />
                <GradingRubricEditor
                  title={lang === 'he' ? 'הערכת בוחן — בחינת ההגנה' : 'Examiner evaluation — the defense exam'}
                  components={msExaminerDefenseComponents}
                  setComponents={setMsExaminerDefenseComponents}
                  weight={msExaminerDefenseWeight}
                  setWeight={setMsExaminerDefenseWeight}
                  lang={lang}
                />
              </View>
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
    </SafeAreaView>
  );
}
