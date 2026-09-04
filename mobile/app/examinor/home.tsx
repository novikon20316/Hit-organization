import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, Pressable,
  ActivityIndicator, Modal, TextInput, Alert} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import { auth } from '../../src/firebase/firebase';
import { useRouter, useLocalSearchParams } from 'expo-router';
import type { Lang } from '../../components/i18n';
import { TopBar, getFacultyColor } from '../../components/shared';
import {type GradeWeights, type IdentityGradeWeights } from '../../components/Milestoneservice';
import { examinerHomeStyles } from '../../constants/styles';
import { apiClient } from '@/src/api/apiClient';
import ChatbotFab from '@/components/ChatbotFab';
import { TourTarget } from '@/components/onboarding/TourTarget';
import {AssignedMilestone, GradingComponentSpec} from '@/types'
import { examinerSignatureStyle } from '@/utils/examinerSignature';
 
// ─── Constants ────────────────────────────────────────────────────────────────
 
const GRADING_CRITERIA = [
  { key: 'understanding', heLabel: 'הבנת הנושא',   enLabel: 'Subject Understanding', maxScore: 25 },
  { key: 'methodology',   heLabel: 'מתודולוגיה',    enLabel: 'Methodology',           maxScore: 25 },
  { key: 'presentation',  heLabel: 'מצגת והצגה',    enLabel: 'Presentation',          maxScore: 25 },
  { key: 'answers',       heLabel: 'תשובות לשאלות', enLabel: 'Answers to Questions',  maxScore: 25 },
];

// A unified {key, max, weight, heLabel, enLabel} shape covers both the
// hardcoded legacy rubric above and a milestone's configured
// gradingComponents — for the legacy rubric, weight === maxScore, which
// makes the shared weighted-total formula ((score/max)*weight) collapse to
// a plain sum, exactly matching today's behavior. See
// server/src/services/milestoneRouting.ts's computeGradingComponentsScore
// for the server-side twin of this formula.
interface ActiveGradingField {
  key: string; maxScore: number; weight: number; heLabel: string; enLabel: string;
  groupHe?: string; groupEn?: string;
  // True means this field is scored/validated like any other but excluded
  // from the rubric's total — e.g. a poster score recorded independently
  // alongside a presentation rubric. See workflowTemplates.ts's excludeFromTotal.
  excludeFromTotal?: boolean;
}

function activeGradingFields(m: AssignedMilestone | null): ActiveGradingField[] {
  if (m?.gradingComponents?.length) {
    return m.gradingComponents.map((c) => ({ key: c.key, maxScore: c.maxScore, weight: c.weight, heLabel: c.labelHe, enLabel: c.labelEn, groupHe: c.groupHe, groupEn: c.groupEn, excludeFromTotal: c.excludeFromTotal }));
  }
  return GRADING_CRITERIA.map((c) => ({ ...c, weight: c.maxScore }));
}

const MILESTONE_LABEL: Record<string, { he: string; en: string }> = {
  research_proposal: { he: 'הצעת מחקר',    en: 'Research Proposal' },
  progress_report:   { he: 'דו"ח התקדמות', en: 'Progress Report'   },
  final_report:      { he: 'דו"ח מסכם',    en: 'Final Report'      },
  defense:           { he: 'הגנה',          en: 'Defense'           },
  poster:            { he: 'פוסטר',        en: 'Poster Session'    },
  presentation_1:    { he: 'מצגת 1',        en: 'Presentation 1'    },
  presentation_2:    { he: 'מצגת 2',        en: 'Presentation 2'    },
  presentation_3:    { he: 'מצגת 3',        en: 'Presentation 3'    },
  project_book:      { he: 'ספר פרויקט',    en: 'Project Book'      },
};
 
// ─── Helpers ──────────────────────────────────────────────────────────────────
 
function parseDefenseDate(raw: string | null): Date | null {
  if (!raw) return null;
  const [datePart, timePart] = raw.trim().split(' ');
  if (!datePart) return null;
  const [day, month, year] = datePart.split('/').map(Number);
  const [hour = 0, minute = 0] = (timePart ?? '').split(':').map(Number);
  const d = new Date(year, month - 1, day, hour, minute);
  return isNaN(d.getTime()) ? null : d;
}
 
function daysUntil(date: Date): number {
  const now  = new Date();
  const diff = date.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}
 
// ─── Component ────────────────────────────────────────────────────────────────
 
export default function ExaminerHome() {
  const router = useRouter();
  const [lang, setLang]   = useState<Lang>('he');
  const isRtl              = lang === 'he';
  const styles             = examinerHomeStyles;
 
  const [examinerName, setExaminerName] = useState('');
  const [loading,      setLoading]      = useState(true);
  // Lets a notification's "Go to dashboard" deep-link land on a specific tab
  // (?tab=...) instead of always opening on Projects — same convention the
  // web dashboard already supports (web's own tab key for this is
  // 'defenses', not 'projects' — kept as-is here to avoid touching every
  // other reference to 'projects' in this file).
  const EXAMINER_TABS: Array<'projects' | 'schedule'> = ['projects', 'schedule'];
  const { tab: tabParam } = useLocalSearchParams<{ tab?: string }>();
  const [activeTab,    setActiveTab]    = useState<'projects' | 'schedule'>(
    EXAMINER_TABS.includes(tabParam as 'projects' | 'schedule') ? (tabParam as 'projects' | 'schedule') : 'projects'
  );
  const [assignments,  setAssignments]  = useState<AssignedMilestone[]>([]);
  const [expandedCards,setExpandedCards]= useState<Record<string, boolean>>({});
 
  // Grade modal (100% unchanged from original)
  const [gradeModal,  setGradeModal]  = useState(false);
  const [selected,    setSelected]    = useState<AssignedMilestone | null>(null);
  const [scores,      setScores]      = useState<Record<string, string>>({});
  const [comments,    setComments]    = useState('');
  const [submitting,  setSubmitting]  = useState(false);

  // ── Three-rubric final-grade workflow (defense only, see
  //    workflowTemplates.ts's finalGradeComponents) — this examiner submits
  //    two independent rubrics ('project' + 'defense') instead of the single
  //    shared score above. Kept inline, mirroring the grade modal above's
  //    own convention (this screen doesn't extract its modals). ──────────
  const [evalModal,      setEvalModal]      = useState(false);
  const [evalTarget,     setEvalTarget]     = useState<{ milestone: AssignedMilestone; kind: 'project' | 'defense' } | null>(null);
  const [evalScores,     setEvalScores]     = useState<Record<string, string>>({});
  const [evalComment,    setEvalComment]    = useState('');
  const [evalFile,       setEvalFile]       = useState<{ uri: string; name: string; mimeType?: string } | null>(null);
  const [evalSubmitting, setEvalSubmitting] = useState(false);

  // ── Non-scored examiner Q&A workflow (see workflowTemplates.ts's
  //    examinerFormFields), e.g. the Industrial Engineering & Management
  //    "Presentation 1" yes/no form. Kept inline, same convention as the
  //    grade/eval modals above. ─────────────────────────────────────────
  const [formModal,      setFormModal]      = useState(false);
  const [formTarget,     setFormTarget]     = useState<AssignedMilestone | null>(null);
  const [formAnswers,    setFormAnswers]    = useState<Record<string, { value: string; comment: string }>>({});
  const [formSubmitting, setFormSubmitting] = useState(false);
  // Shown instead of auto-closing the modal, only for the data_science
  // document flow — see isDataScienceDocument below.
  const [evalSubmittedAt, setEvalSubmittedAt] = useState<Date | null>(null);

  const pickEvalFile = async () => {
    const result = await DocumentPicker.getDocumentAsync();
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    setEvalFile({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType ?? undefined });
  };

  const uid = auth.currentUser?.uid;
 
  // ── Candidate defense dates being composed for a given milestone — one
  //    row of text per candidate date (no comma-separated blob), so an
  //    examiner adds/removes one date at a time instead of hand-editing a
  //    CSV string. No native date-picker dependency in this app yet, so
  //    each row stays a plain YYYY-MM-DD text field, validated per-row.
  const [dateDrafts, setDateDrafts] = useState<Record<string, string[]>>({});
  const [submittingDates, setSubmittingDates] = useState<Record<string, boolean>>({});

  const dateRowsFor = (milestoneId: string): string[] => dateDrafts[milestoneId] ?? [''];
  const updateDateRow = (milestoneId: string, idx: number, value: string) =>
    setDateDrafts((prev) => {
      const rows = [...dateRowsFor(milestoneId)];
      rows[idx] = value;
      return { ...prev, [milestoneId]: rows };
    });
  const addDateRow = (milestoneId: string) =>
    setDateDrafts((prev) => ({ ...prev, [milestoneId]: [...dateRowsFor(milestoneId), ''] }));
  const removeDateRow = (milestoneId: string, idx: number) =>
    setDateDrafts((prev) => {
      const rows = dateRowsFor(milestoneId).filter((_, i) => i !== idx);
      return { ...prev, [milestoneId]: rows.length > 0 ? rows : [''] };
    });

  // ── Dashboard fetch — no uid in the URL, the server reads it from the
  //    auth token (see examinerController.getExaminerDashboard) ────────────
  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const [profileRes, dashboardRes] = await Promise.all([
        apiClient.get('/api/users/profile').catch(e => { console.error('❌ profile failed:', e.response?.status, e.response?.config?.url); throw e; }),
        apiClient.get('/api/examiner/dashboard').catch(e => { console.error('❌ dashboard failed:', e.response?.status, e.response?.config?.url); throw e; }),
      ]);
      setExaminerName(profileRes.data?.displayName || '');
      setAssignments(dashboardRes.data.milestones || []);
    } catch (err: any) {
      console.error('Error fetching dashboard data:', err);
      Alert.alert(
        lang === 'he' ? 'שגיאה בהבאת נתונים' : 'Data Fetch Error',
        lang === 'he' ? 'נכשלה טעינת נתוני השרת' : 'Could not synchronize data with backend server.'
      );
    } finally {
      setLoading(false);
    }
  };

  // Replace all 3 old functional useEffect loops with a single initialization effect
  useEffect(() => {
    fetchDashboardData();
  }, []);
 
  // ── Helpers (unchanged) ─────────────────────────────────────────────────
  const alreadyGraded = (m: AssignedMilestone): boolean => {
    // Three-rubric final-grade workflow (defense only) — "graded" means both
    // of this examiner's independent rubrics (project + defense) are in.
    if (m.finalGradeComponents) {
      const ev = m.examinerEvaluations?.[uid ?? ''];
      return !!ev?.project && !!ev?.defense;
    }
    // Non-scored examiner Q&A milestones (see workflowTemplates.ts's
    // examinerFormFields) track completion via examinerFormAnswers instead
    // of examinerScores — every requiresExaminers milestone gets an (empty)
    // examinerScores map at enrollment regardless of shape, so checking
    // examinerScores alone can't tell these two apart.
    if ((m.examinerFormFields?.length ?? 0) > 0) {
      return m.examinerFormAnswers?.[uid ?? ''] != null;
    }
    // Generic chain-routing milestones (see server/src/services/
    // milestoneRouting.ts's isChainDriven — e.g. the examiner-only 'poster'
    // type) carry neither examinerScores nor finalGradeComponents. Without
    // this check the legacy positional fallback below would read
    // examiner1Score/examiner2Score as `undefined !== null` (true) and show
    // "already graded" before this examiner ever submitted anything.
    if (m.stageScores != null) {
      return Object.values(m.stageScores).some((entry) => entry?.gradedBy === uid);
    }
    // Identity-keyed defense milestones (post-generalization) carry
    // examinerScores instead of the legacy examiner1Score/examiner2Score
    // pair — legacy milestones (no examinerScores at all) keep the old
    // "#1/#2" positional check, forever (no migration).
    if (m.examinerScores != null) return m.examinerScores[uid ?? ''] != null;
    const isExaminer1 = m.examinerIds[0] === uid;
    return isExaminer1 ? m.examiner1Score !== null : m.examiner2Score !== null;
  };

  const examinerEvaluationDone = (m: AssignedMilestone, kind: 'project' | 'defense'): boolean =>
    !!m.examinerEvaluations?.[uid ?? '']?.[kind];

  function isBeforeDefense(defenseDate: string | null): boolean {
    if (!defenseDate) return false;
    const date = new Date(defenseDate);
    return isNaN(date.getTime()) ? false : new Date() < date;
  }
 
  const openGradeModal = (m: AssignedMilestone) => {
    setSelected(m);
    const initial: Record<string, string> = {};
    activeGradingFields(m).forEach((c) => { initial[c.key] = ''; });
    setScores(initial);
    setComments('');
    setGradeModal(true);
  };

  const totalScore = () =>
    Math.round(activeGradingFields(selected).filter((c) => !c.excludeFromTotal).reduce((sum, c) => sum + ((parseFloat(scores[c.key] || '0')) / c.maxScore) * c.weight, 0));

  // Dynamic denominator — every existing rubric happens to sum its weights
  // to 100, so this is a no-op everywhere except a rubric that legitimately
  // sums higher (e.g. Industrial Engineering & Management's 1-105 rubric).
  const maxTotalScore = () =>
    activeGradingFields(selected).filter((c) => !c.excludeFromTotal).reduce((sum, c) => sum + c.weight, 0);

  // ── Examiner evaluation (three-rubric workflow) ───────────────────────────
  const evalRubric: GradingComponentSpec[] = evalTarget
    ? (evalTarget.kind === 'project'
        ? evalTarget.milestone.finalGradeComponents?.examinerProjectEvaluation.components ?? []
        : evalTarget.milestone.finalGradeComponents?.examinerDefenseEvaluation.components ?? [])
    : [];

  const evalTotal = Math.round(
    evalRubric.reduce((sum, c) => sum + ((parseFloat(evalScores[c.key] || '0')) / c.maxScore) * c.weight, 0)
  );

  // Project_examiner.docx's digitized paper form — header fields, mandatory
  // every-field validation, and a signature — is exclusive to data_science's
  // 'project' evaluation (the written thesis). The oral-defense rubric
  // ('defense', from a different paper form) and every other faculty's
  // 'project' evaluation keep today's exact behavior. See the identical
  // gate in web/app/examinor/home/ExaminerEvaluationModal.tsx.
  const isDataScienceDocument = evalTarget?.milestone.facultyId === 'data_science' && evalTarget?.kind === 'project';
  const evalSignature = examinerSignatureStyle(examinerName, evalTarget?.milestone.facultyId ?? '', 'internal', evalTarget?.milestone.major ?? null);

  const openEvalModal = (m: AssignedMilestone, kind: 'project' | 'defense') => {
    const rubric = kind === 'project'
      ? m.finalGradeComponents?.examinerProjectEvaluation.components ?? []
      : m.finalGradeComponents?.examinerDefenseEvaluation.components ?? [];
    const initial: Record<string, string> = {};
    rubric.forEach((c) => { initial[c.key] = ''; });
    setEvalTarget({ milestone: m, kind });
    setEvalScores(initial);
    setEvalComment('');
    setEvalFile(null);
    setEvalSubmittedAt(null);
    setEvalModal(true);
  };

  const handleSubmitEvaluation = async () => {
    if (!evalTarget) return;

    if (isDataScienceDocument) {
      for (const c of evalRubric) {
        const raw = evalScores[c.key];
        const v = raw === undefined || raw === '' ? NaN : parseFloat(raw);
        if (!raw || isNaN(v) || v < 0 || v > c.maxScore) {
          const label = lang === 'he' ? c.labelHe : c.labelEn;
          Alert.alert(
            lang === 'he' ? 'שגיאה' : 'Error',
            lang === 'he' ? `יש להזין ציון עבור "${label}" בטווח 0–${c.maxScore}` : `Enter a score for "${label}" in the range 0–${c.maxScore}`
          );
          return;
        }
      }
      if (!evalComment.trim()) {
        Alert.alert(
          lang === 'he' ? 'שגיאה' : 'Error',
          lang === 'he' ? 'יש למלא הערכה מילולית והערות' : 'A written evaluation and comments are required'
        );
        return;
      }
    }

    try {
      setEvalSubmitting(true);
      const scoresObj = Object.fromEntries(evalRubric.map((c) => [c.key, parseFloat(evalScores[c.key]) || 0]));
      if (evalFile) {
        const fileExtension = evalFile.name?.split('.').pop()?.toLowerCase();
        const fallbackType = fileExtension === 'pdf' ? 'application/pdf' : 'application/octet-stream';
        const formData = new FormData();
        formData.append('kind', evalTarget.kind);
        formData.append('scores', JSON.stringify(scoresObj));
        if (evalComment) formData.append('comment', evalComment);
        formData.append('files', { uri: evalFile.uri, name: evalFile.name, type: evalFile.mimeType || fallbackType } as any);
        await apiClient.post(`/api/projects/milestones/${evalTarget.milestone.id}/examiner-evaluation`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
          transformRequest: (data: any) => data,
        });
      } else {
        await apiClient.post(`/api/projects/milestones/${evalTarget.milestone.id}/examiner-evaluation`, {
          kind: evalTarget.kind,
          scores: scoresObj,
          comment: evalComment,
        });
      }
      if (isDataScienceDocument) {
        setEvalSubmittedAt(new Date());
      } else {
        Alert.alert(
          lang === 'he' ? '✅ הצלחה' : '✅ Success',
          lang === 'he' ? 'ההערכה נשלחה בהצלחה' : 'Evaluation submitted successfully'
        );
        setEvalModal(false);
      }
      await fetchDashboardData();
    } catch (e) {
      console.error(e);
      Alert.alert('Error', String(e));
    } finally {
      setEvalSubmitting(false);
    }
  };

  // ── Submit candidate defense dates ────────────────────────────────────────
  // Window/Sun-Thu validation is enforced server-side too — this mirrors it
  // client-side (day-of-week, window bounds, not-in-the-past) so a rejected
  // date is explained immediately in the examiner's own selected language,
  // rather than only surfacing as the server's raw, always-English message
  // (e.g. "Date 2026-09-05 falls on a weekend...") after a round-trip.
  const isMyDefensePanel = (m: AssignedMilestone) =>
    (m.defensePanel ?? []).some((p) => p.type === 'internal' && p.ref === uid);

  const toDateSafe = (val: unknown): Date | null => {
    if (!val) return null;
    if (typeof val === 'object' && val !== null && '_seconds' in (val as any)) return new Date((val as any)._seconds * 1000);
    const d = new Date(val as string);
    return isNaN(d.getTime()) ? null : d;
  };
  const toDateInputValue = (d: Date | null): string | undefined =>
    d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : undefined;

  const validateCandidateDate = (raw: string, m: AssignedMilestone): string | null => {
    const d = new Date(`${raw}T00:00:00`);
    if (isNaN(d.getTime()) || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      return lang === 'he' ? `פורמט לא תקין: ${raw} (YYYY-MM-DD)` : `Invalid format: ${raw} (YYYY-MM-DD)`;
    }
    const day = d.getDay(); // 0=Sun .. 6=Sat
    if (day === 5 || day === 6) return lang === 'he' ? 'יש לבחור תאריכים בימים ראשון עד חמישי בלבד' : 'Dates must be Sunday through Thursday';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (d < today) return lang === 'he' ? 'לא ניתן לבחור תאריך שכבר עבר' : 'Cannot pick a date that has already passed';
    const windowStartStr = toDateInputValue(toDateSafe(m.dateMatching?.windowStart));
    const windowEndStr = toDateInputValue(toDateSafe(m.dateMatching?.windowEnd));
    if (windowStartStr && raw < windowStartStr) return lang === 'he' ? 'התאריך מחוץ לטווח האפשרי' : 'This date is outside the allowed window';
    if (windowEndStr && raw > windowEndStr) return lang === 'he' ? 'התאריך מחוץ לטווח האפשרי' : 'This date is outside the allowed window';
    return null;
  };

  const handleSubmitDates = async (m: AssignedMilestone) => {
    const raw = dateRowsFor(m.id).map((s) => s.trim()).filter(Boolean);
    if (raw.length === 0) {
      Alert.alert(lang === 'he' ? 'שגיאה' : 'Error', lang === 'he' ? 'יש להזין לפחות תאריך אחד' : 'Enter at least one date');
      return;
    }
    for (const d of raw) {
      const validationError = validateCandidateDate(d, m);
      if (validationError) {
        Alert.alert(lang === 'he' ? 'שגיאה' : 'Error', validationError);
        return;
      }
    }
    try {
      setSubmittingDates((prev) => ({ ...prev, [m.id]: true }));
      const res = await apiClient.post(`/api/examiner/milestones/${m.id}/defense-dates`, { candidateDates: raw });
      if (res.data.matched) {
        Alert.alert('✅', lang === 'he' ? `נמצא תאריך משותף: ${res.data.matchedDate}` : `Common date found: ${res.data.matchedDate}`);
      } else if (res.data.conflict) {
        Alert.alert(
          lang === 'he' ? 'לא נמצא תאריך משותף' : 'No common date',
          lang === 'he' ? 'הרכז/ת עודכן/ה ותפתור/תפתור את ההתנגשות.' : 'The coordinator has been notified and will resolve this.'
        );
      } else {
        Alert.alert('✅', lang === 'he' ? 'התאריכים נשלחו — ממתין לשאר הבוחנים' : 'Dates submitted — waiting on the other examiners');
      }
      await fetchDashboardData();
    } catch (err: any) {
      // Deliberately NOT displaying err.response?.data?.message — that's the
      // server's raw, always-English validation text (see
      // validateCandidateDate's own comment above for why). The cases it
      // would normally explain (weekend, past, outside window, bad format)
      // are now caught client-side before ever reaching the server, so a
      // rejection here is almost always something generic (network,
      // already resolved) that this covers fine.
      console.error('examinor: submit defense dates error', err);
      Alert.alert(
        lang === 'he' ? 'שגיאה' : 'Error',
        lang === 'he' ? 'שליחת התאריכים נכשלה — נסה/י שוב' : 'Failed to submit dates — please try again'
      );
    } finally {
      setSubmittingDates((prev) => ({ ...prev, [m.id]: false }));
    }
  };

  // ── Submit grade (unchanged) ────────────────────────────────────────────
  const handleSubmitGrade = async () => {
    if (!selected || !uid) return;
 
    const activeFields = activeGradingFields(selected);
    for (const c of activeFields) {
      const v = parseFloat(scores[c.key] || '');
      if (isNaN(v) || v < 0 || v > c.maxScore) {
        Alert.alert(
          lang === 'he' ? 'שגיאה' : 'Error',
          lang === 'he'
            ? `ציון עבור "${c.heLabel}" חייב להיות בין 0 ל-${c.maxScore}`
            : `Score for "${c.enLabel}" must be between 0 and ${c.maxScore}`,
        );
        return;
      }
    }

    const score = totalScore();
    try {
      setSubmitting(true);

      // Goes through the shared grading endpoint (the same one the
      // supervisor UI uses). When the milestone has its own configured
      // rubric (see workflowTemplates.ts's GradingComponentSpec), the
      // per-component breakdown is sent as criteria too — the server
      // recomputes/validates the total from it rather than trusting the
      // client's score. Without a configured rubric, only the already-
      // computed total is sent, matching the prior behavior exactly.
      await apiClient.post(`/api/projects/milestones/${selected.id}/grade`, {
        projectId: selected.projectId,
        givenScore: score,
        comments,
        ...(selected.gradingComponents?.length
          ? { criteria: Object.fromEntries(activeFields.map((c) => [c.key, parseFloat(scores[c.key]) || 0])) }
          : {}),
      });

      Alert.alert(
        lang === 'he' ? '✅ הצלחה' : '✅ Success',
        lang === 'he' ? 'הציון נשמר בהצלחה' : 'Grade submitted successfully'
      );
      setGradeModal(false);
      await fetchDashboardData();
    } catch (e) {
      console.error(e);
      Alert.alert('Error', String(e));
    } finally {
      setSubmitting(false);
    }
  };
 
  // ── Examiner online form (see workflowTemplates.ts's examinerFormFields) ──
  const openFormModal = (m: AssignedMilestone) => {
    const initial: Record<string, { value: string; comment: string }> = {};
    (m.examinerFormFields ?? []).forEach((f) => { initial[f.key] = { value: '', comment: '' }; });
    setFormTarget(m);
    setFormAnswers(initial);
    setFormModal(true);
  };

  const setFormAnswerValue = (fieldKey: string, value: string) => {
    setFormAnswers((prev) => {
      const field = (formTarget?.examinerFormFields ?? []).find((f) => f.key === fieldKey);
      const keepComment = field?.commentRequiredOn === value ? prev[fieldKey]?.comment ?? '' : '';
      return { ...prev, [fieldKey]: { value, comment: keepComment } };
    });
  };

  const handleSubmitForm = async () => {
    if (!formTarget) return;
    const fields = formTarget.examinerFormFields ?? [];
    for (const f of fields) {
      const a = formAnswers[f.key] ?? { value: '', comment: '' };
      if (f.type === 'yesno') {
        if (a.value !== 'yes' && a.value !== 'no') {
          Alert.alert(lang === 'he' ? 'שגיאה' : 'Error', lang === 'he' ? `יש לבחור כן/לא עבור "${f.labelHe}"` : `Choose yes/no for "${f.labelEn}"`);
          return;
        }
        if (f.commentRequiredOn === a.value && !a.comment.trim()) {
          Alert.alert(lang === 'he' ? 'שגיאה' : 'Error', lang === 'he' ? `יש להוסיף הסבר עבור "${f.labelHe}"` : `An explanation is required for "${f.labelEn}"`);
          return;
        }
      } else if (f.required && !a.value.trim()) {
        Alert.alert(lang === 'he' ? 'שגיאה' : 'Error', lang === 'he' ? `יש למלא את "${f.labelHe}"` : `"${f.labelEn}" is required`);
        return;
      }
    }
    try {
      setFormSubmitting(true);
      const answers = Object.fromEntries(fields.map((f) => {
        const a = formAnswers[f.key] ?? { value: '', comment: '' };
        if (f.type === 'yesno') {
          const comment = a.comment.trim();
          return [f.key, comment ? { value: a.value, comment } : { value: a.value }];
        }
        return [f.key, { value: a.value.trim() }];
      }));
      await apiClient.post(`/api/projects/milestones/${formTarget.id}/examiner-form`, { answers });
      Alert.alert(lang === 'he' ? '✅ הצלחה' : '✅ Success', lang === 'he' ? 'הטופס נשלח בהצלחה' : 'Form submitted successfully');
      setFormModal(false);
      await fetchDashboardData();
    } catch (e) {
      console.error(e);
      Alert.alert('Error', String(e));
    } finally {
      setFormSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#10B981" />
      </View>
    );
  }
 
  // Schedule: only milestones with a defenseDate, sorted soonest first
  const scheduled = [...assignments]
    .filter((m) => !!m.defenseDate)
    .sort((a, b) => {
      const da = new Date(a.defenseDate!).getTime();
      const db_ = new Date(b.defenseDate!).getTime();
      return da - db_;
    });
 
  return (
    <SafeAreaView style={styles.root}>
      <TopBar
        name={examinerName}
        role="examiner"
        lang={lang}
        isRtl={isRtl}
        onToggleLang={() => setLang(lang === 'he' ? 'en' : 'he')}
      />
 
      {/* ── Tab bar ── */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabBar}>
        {([
          { key: 'projects', he: 'הגנות לבחינה', en: 'Defenses', badge: assignments.length },
          { key: 'schedule', he: 'לוח זמנים',     en: 'Schedule', badge: scheduled.length  },
        ] as const).map((tab) => (
          <TourTarget key={tab.key} tourKey={tab.key}>
            <Pressable
              style={[styles.tab, activeTab === tab.key && styles.tabActive]}
              onPress={() => setActiveTab(tab.key)}
              accessibilityRole="button"
            >
              <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]} numberOfLines={1}>
                {lang === 'he' ? tab.he : tab.en}
              </Text>
              {tab.badge > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{tab.badge}</Text>
                </View>
              )}
            </Pressable>
          </TourTarget>
        ))}
      </ScrollView>
 
      <ScrollView contentContainerStyle={styles.content}>
 
        {/* ════════ PROJECTS TAB ════════ */}
        {activeTab === 'projects' && (
          <>
            {assignments.length === 0 ? (
              <View style={styles.empty}>
                <Text style={styles.emptyEmoji}>📭</Text>
                <Text style={styles.emptyText}>
                  {lang === 'he' ? 'לא הוקצו לך הגנות לבחינה' : 'No defenses assigned to you'}
                </Text>
              </View>
            ) : (
              assignments.map((m) => {
                const graded        = alreadyGraded(m);
                const fc            = getFacultyColor(m.facultyId);
                const examinerIndex = m.examinerIds[0] === uid ? 1 : 2;
                const isIdentityKeyed = m.examinerScores != null;
                const isFormOnly = (m.examinerFormFields?.length ?? 0) > 0;
                // Panel size is configurable per faculty/degree (see
                // workflowTemplates.ts's examinerCount) — every OTHER
                // examiner on the panel, not just a single assumed peer.
                const otherExaminers = m.examinerIds
                  .filter((id) => id !== uid)
                  .map((otherUid) => ({
                    uid: otherUid,
                    name: (m.defensePanel ?? []).find((p) => p.ref === otherUid)?.displayName ?? (lang === 'he' ? 'לא ידוע' : 'Unknown'),
                    graded: isFormOnly ? m.examinerFormAnswers?.[otherUid] != null : m.examinerScores?.[otherUid] != null,
                  }));

                return (
                  <Pressable
                    key={m.id}
                    style={[styles.card, { borderLeftColor: fc.primary },
                      expandedCards[m.id] && styles.cardExpanded]}
                    onPress={() =>
                      setExpandedCards((prev) => ({ ...prev, [m.id]: !prev[m.id] }))
                    }
                    accessibilityRole="button"
                  >
                    {/* Title */}
                    <Text style={styles.cardTitle}>
                      {lang === 'he' ? m.projectTitleHe : m.projectTitleEn}
                    </Text>
 
                    {/* Students */}
                    <Text style={styles.cardMeta}>👤 {m.studentNames.join(', ')}</Text>
 
                    {/* Supervisor */}
                    <Text style={styles.cardMeta}>
                      👨‍🏫 {lang === 'he' ? 'מנחה:' : 'Supervisor:'} {m.supervisorName}
                    </Text>
 
                    {/* My slot / co-examiner */}
                    {isIdentityKeyed ? (
                      otherExaminers.length > 0 && (
                        <Text style={styles.cardMeta}>
                          🤝 {lang === 'he' ? (otherExaminers.length > 1 ? 'בוחנים נוספים:' : 'בוחן/ת נוסף/ת:') : otherExaminers.length > 1 ? 'Co-examiners:' : 'Co-examiner:'}{' '}
                          {otherExaminers
                            .map((oe) => `${oe.name} (${oe.graded ? (lang === 'he' ? 'ציון הוגש' : 'graded') : lang === 'he' ? 'טרם הוגש' : 'pending'})`)
                            .join(', ')}
                        </Text>
                      )
                    ) : (
                      <Text style={styles.cardMeta}>
                        🔢 {lang === 'he'
                          ? `אני בוחן #${examinerIndex}`
                          : `I am Examiner #${examinerIndex}`}
                      </Text>
                    )}
 
                    {/* Defense date pill */}
                    {m.defenseDate && (
                      <View style={styles.defensePill}>
                        <Text style={styles.defensePillText}>
                          📅 {m.defenseDate} {m.defenseRoom ? ` · ${m.defenseRoom}` : ''}
                        </Text>
                      </View>
                    )}

                    {/* Defense date submission — only while a window is open
                        and this examiner hasn't been resolved out of the round */}
                    {m.status === 'awaiting_defense_date' && isMyDefensePanel(m) && (
                      <View style={{ marginTop: 10, padding: 12, borderRadius: 10, backgroundColor: '#FFFBEB' }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: '#B45309', marginBottom: 6 }}>
                          📅 {lang === 'he' ? 'בחר תאריכים אפשריים להגנה' : 'Choose your available defense dates'}
                        </Text>
                        <Text style={{ fontSize: 12, color: '#92400E', marginBottom: 6 }}>
                          {lang === 'he'
                            ? 'המערכת תאתר אוטומטית תאריך שמתאים לכל חברי ועדת הבחינה. הוסף/י כמה תאריכים שתוכל/י — ככל שיותר, כך גדל הסיכוי למצוא תאריך משותף במהירות. אם לא יימצא תאריך משותף, הרכז/ת יפתור/תפתור את ההתנגשות.'
                            : "The system will automatically match a date that works for every panel member. Add as many dates as you can — the more you list, the more likely a common date is found quickly. If none is found, the coordinator will step in to resolve it."}
                        </Text>
                        {m.dateMatching && (
                          <Text style={{ fontSize: 12, color: '#92400E', marginBottom: 6 }}>
                            {lang === 'he' ? 'בטווח' : 'Within'} {' '}
                            {new Date(m.dateMatching.windowStart._seconds ? m.dateMatching.windowStart._seconds * 1000 : m.dateMatching.windowStart).toLocaleDateString()}
                            {' – '}
                            {new Date(m.dateMatching.windowEnd._seconds ? m.dateMatching.windowEnd._seconds * 1000 : m.dateMatching.windowEnd).toLocaleDateString()}
                            {' · '}{lang === 'he' ? 'ראשון–חמישי בלבד' : 'Sun-Thu only'}
                          </Text>
                        )}
                        <Text style={{ fontSize: 11, color: '#92400E', marginBottom: 4 }}>
                          {lang === 'he' ? 'פורמט: YYYY-MM-DD (למשל 2026-10-15)' : 'Format: YYYY-MM-DD (e.g. 2026-10-15)'}
                        </Text>
                        {dateRowsFor(m.id).map((row, idx) => (
                          <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6, gap: 6 }}>
                            <TextInput
                              style={[styles.scoreInput as any, { flex: 1 }]}
                              value={row}
                              onChangeText={(v) => updateDateRow(m.id, idx, v)}
                              placeholder="YYYY-MM-DD"
                              placeholderTextColor="#9CA3AF"
                            />
                            {dateRowsFor(m.id).length > 1 && (
                              <Pressable
                                onPress={() => removeDateRow(m.id, idx)}
                                accessibilityRole="button"
                                accessibilityLabel={lang === 'he' ? 'הסר תאריך' : 'Remove date'}
                                style={{ padding: 6 }}
                              >
                                <Text style={{ color: '#B91C1C', fontSize: 16 }}>✕</Text>
                              </Pressable>
                            )}
                          </View>
                        ))}
                        <Pressable
                          onPress={() => addDateRow(m.id)}
                          accessibilityRole="button"
                          style={{ alignSelf: 'flex-start', marginBottom: 8 }}
                        >
                          <Text style={{ color: '#B45309', fontWeight: '600', fontSize: 12 }}>
                            + {lang === 'he' ? 'הוסף תאריך נוסף' : 'Add another date'}
                          </Text>
                        </Pressable>
                        <Pressable
                          style={[styles.gradeBtn, { backgroundColor: '#F59E0B' }, submittingDates[m.id] && { opacity: 0.6 }]}
                          onPress={() => handleSubmitDates(m)}
                          disabled={!!submittingDates[m.id]}
                          accessibilityRole="button"
                        >
                          {submittingDates[m.id]
                            ? <ActivityIndicator color="#fff" />
                            : <Text style={styles.gradeBtnText}>{lang === 'he' ? 'שלח תאריכים' : 'Submit dates'}</Text>
                          }
                        </Pressable>
                      </View>
                    )}

                    {m.status === 'date_conflict' && (
                      <View style={{ marginTop: 10, padding: 12, borderRadius: 10, backgroundColor: '#FEF2F2' }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: '#B91C1C' }}>
                          ⚠️ {lang === 'he' ? 'לא נמצא תאריך משותף — הרכז/ת פותר/ת' : 'No common date found — coordinator resolving'}
                        </Text>
                      </View>
                    )}

                    {/* Grade weights */}
                    {m.gradeWeights && (
                      <View style={styles.weightsRow}>
                        {(isIdentityKeyed
                          ? [
                              { label: lang === 'he' ? 'מנחה' : 'Supervisor', w: m.gradeWeights.supervisorWeight, hl: false },
                              { label: lang === 'he' ? 'בוחנים (לכל אחד)' : 'Examiners (each)', w: (m.gradeWeights as IdentityGradeWeights).examinerWeight, hl: true },
                            ]
                          : [
                              { label: lang === 'he' ? 'מנחה'   : 'Supervisor', w: m.gradeWeights.supervisorWeight, hl: false },
                              { label: lang === 'he' ? 'בוחן 1' : 'Examiner 1', w: (m.gradeWeights as GradeWeights).examiner1Weight,  hl: examinerIndex === 1 },
                              { label: lang === 'he' ? 'בוחן 2' : 'Examiner 2', w: (m.gradeWeights as GradeWeights).examiner2Weight,  hl: examinerIndex === 2 },
                            ]
                        ).map((wt) => (
                          <View key={wt.label} style={[styles.weightChip, wt.hl && styles.weightChipHL]}>
                            <Text style={[styles.weightChipLabel, wt.hl && { color: '#fff' }]}>{wt.label}</Text>
                            <Text style={[styles.weightChipValue, wt.hl && { color: '#fff' }]}>{Math.round(wt.w * 100)}%</Text>
                          </View>
                        ))}
                      </View>
                    )}
 
                    {/* Expanded: milestone history */}
                    {expandedCards[m.id] && (
                      <View style={styles.expandedSection}>
                        <Text style={styles.sectionTitle}>
                          {lang === 'he' ? '📊 ציונים ומסמכים לפי אבן דרך' : '📊 Grades & Files by Milestone'}
                        </Text>
 
                        {m.milestoneHistory.map((mg) => {
                          const isGraded = mg.supervisorScore !== null;
                          const railColor = isGraded ? '#3F6B4C' : fc.primary;
                          return (
                            <View key={mg.type} style={[styles.milestoneBlock, { borderLeftColor: railColor }]}>
                              <View style={styles.milestoneHeaderRow}>
                                <Text style={styles.milestoneName}>
                                  {MILESTONE_LABEL[mg.type]?.[lang] ?? mg.type}
                                </Text>
                                <View style={[styles.milestoneBadge, { backgroundColor: isGraded ? '#EAF1EC' : '#FBF3E3' }]}>
                                  <Text style={[styles.milestoneBadgeText, { color: isGraded ? '#3F6B4C' : '#B8862E' }]}>
                                    {isGraded ? (lang === 'he' ? '✅ נוקד' : '✅ Graded') : (lang === 'he' ? '⏳ טרם ניתן' : '⏳ Not yet')}
                                  </Text>
                                </View>
                              </View>

                              <View style={styles.scoreRow}>
                                <Text style={styles.scoreLabel}>
                                  {lang === 'he' ? 'ציון מנחה' : 'Supervisor score'}
                                </Text>
                                <Text style={[styles.scoreValue, { color: isGraded ? '#3F6B4C' : '#9CA3AF' }]}>
                                  🏆 {isGraded ? `${mg.supervisorScore}` : (lang === 'he' ? 'טרם ניתן' : 'Not yet')}
                                </Text>
                              </View>

                              {mg.supervisorComment ? (
                                <Text style={styles.commentText}>💬 {mg.supervisorComment}</Text>
                              ) : null}

                              {mg.fileUrls.length > 0 ? (
                                <View style={{ marginTop: 6 }}>
                                  <Text style={styles.filesLabel}>
                                    {lang === 'he' ? 'קבצים שהוגשו' : 'Submitted Files'}
                                  </Text>
                                  <View style={styles.filesRow}>
                                    {mg.fileUrls.map((url, idx) => (
                                      <Pressable
                                        key={idx}
                                        style={styles.fileBtn}
                                        onPress={() =>
                                          router.push({ pathname: '/pdfViewer', params: { url } })
                                        }
                                        accessibilityRole="button"
                                      >
                                        <Text style={styles.fileBtnText}>
                                          📄 {lang === 'he' ? `קובץ ${idx + 1}` : `File ${idx + 1}`}
                                        </Text>
                                      </Pressable>
                                    ))}
                                  </View>
                                </View>
                              ) : (
                                <Text style={styles.noFiles}>
                                  {lang === 'he' ? 'לא הועלו קבצים' : 'No files uploaded'}
                                </Text>
                              )}
                            </View>
                          );
                        })}
                      </View>
                    )}
 
                    <Text style={styles.expandHint}>
                      {expandedCards[m.id] ? '▲' : '▼'}
                    </Text>
 
                    {/* Grade button — unchanged */}
                    {graded ? (
                      <View style={styles.gradedBadge}>
                        <Text style={styles.gradedBadgeText}>
                          ✅ {lang === 'he' ? 'ציון הוגש' : 'Grade submitted'}
                        </Text>
                      </View>
                    ) : isBeforeDefense(m.defenseDate) ? (
                      <View style={[styles.gradedBadge, { backgroundColor: '#FFF7ED', borderColor: '#F97316' }]}>
                        <Text style={[styles.gradedBadgeText, { color: '#F97316' }]}>
                          🕐 {lang === 'he'
                            ? `ניתן לציין רק לאחר ההגנה · ${new Date(m.defenseDate!).toLocaleDateString('he-IL', { day: 'numeric', month: 'long' })}`
                            : `Grading opens after the defense · ${new Date(m.defenseDate!).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}`}
                        </Text>
                      </View>
                    ) : m.finalGradeComponents ? (
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <Pressable
                          style={[styles.gradeBtn, { flex: 1, backgroundColor: fc.primary }, examinerEvaluationDone(m, 'project') && { opacity: 0.5 }]}
                          onPress={() => openEvalModal(m, 'project')}
                          disabled={examinerEvaluationDone(m, 'project')}
                          accessibilityRole="button"
                        >
                          <Text style={styles.gradeBtnText}>
                            {examinerEvaluationDone(m, 'project')
                              ? `✅ ${lang === 'he' ? 'עבודת הגמר' : 'The Project'}`
                              : `📄 ${lang === 'he' ? 'הערך עבודת גמר' : 'Grade the Project'}`}
                          </Text>
                        </Pressable>
                        <Pressable
                          style={[styles.gradeBtn, { flex: 1, backgroundColor: fc.primary }, examinerEvaluationDone(m, 'defense') && { opacity: 0.5 }]}
                          onPress={() => openEvalModal(m, 'defense')}
                          disabled={examinerEvaluationDone(m, 'defense')}
                          accessibilityRole="button"
                        >
                          <Text style={styles.gradeBtnText}>
                            {examinerEvaluationDone(m, 'defense')
                              ? `✅ ${lang === 'he' ? 'ההגנה' : 'The Defense'}`
                              : `🛡 ${lang === 'he' ? 'הערך הגנה' : 'Grade the Defense'}`}
                          </Text>
                        </Pressable>
                      </View>
                    ) : isFormOnly ? (
                      <Pressable
                        style={[styles.gradeBtn, { backgroundColor: fc.primary }]}
                        onPress={() => openFormModal(m)}
                        accessibilityRole="button"
                      >
                        <Text style={styles.gradeBtnText}>
                          📝 {lang === 'he' ? 'מלא/י טופס הערכה' : 'Fill Evaluation Form'}
                        </Text>
                      </Pressable>
                    ) : (
                      <Pressable
                        style={[styles.gradeBtn, { backgroundColor: fc.primary }]}
                        onPress={() => openGradeModal(m)}
                        accessibilityRole="button"
                      >
                        <Text style={styles.gradeBtnText}>
                          ✏️ {lang === 'he' ? 'הגש ציון' : 'Submit Grade'}
                        </Text>
                      </Pressable>
                    )}
                  </Pressable>
                );
              })
            )}
          </>
        )}
 
        {/* ════════ SCHEDULE TAB ════════ */}
        {activeTab === 'schedule' && (
          <>
            {scheduled.length === 0 ? (
              <View style={styles.empty}>
                <Text style={styles.emptyEmoji}>📅</Text>
                <Text style={styles.emptyText}>
                  {lang === 'he' ? 'אין הגנות מתוכננות עדיין' : 'No defenses scheduled yet'}
                </Text>
              </View>
            ) : (
              scheduled.map((m) => {
                const defDate   = new Date(m.defenseDate!);
                const isValid   = !isNaN(defDate.getTime());
                const days      = isValid ? daysUntil(defDate) : null;
                const fc        = getFacultyColor(m.facultyId);

                // Matches web's equivalent ladder (app/examinor/home/page.tsx) —
                // days===0/<=7/else use the base --danger/--accent/--success
                // hex so both platforms render the identical urgency color.
                const urgencyColor =
                  days === null ? '#6B7280' :
                  days < 0      ? '#9CA3AF' :
                  days === 0    ? '#A8433A' :
                  days <= 3     ? '#F97316' :
                  days <= 7     ? '#B8862E' :
                                  '#3F6B4C';

                const urgencyLabel = lang === 'he'
                  ? (days === null ? '—' : days < 0 ? 'עברה' : days === 0 ? 'היום!' : days === 1 ? 'מחר!' : `בעוד ${days} ימים`)
                  : (days === null ? '—' : days < 0 ? 'Past' : days === 0 ? 'Today!' : days === 1 ? 'Tomorrow!' : `In ${days} days`);

                const formattedDate = isValid
                  ? defDate.toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-GB', {
                      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
                    })
                  : (lang === 'he' ? 'תאריך לא זמין' : 'Date unavailable');

                const formattedTime = isValid
                  ? defDate.toLocaleTimeString(lang === 'he' ? 'he-IL' : 'en-US', {
                      hour: '2-digit', minute: '2-digit', hour12: false,
                    })
                  : '';

                return (
                  <View key={m.id} style={[styles.scheduleCard, { borderLeftColor: fc.primary }]}>

                    {/* Countdown badge */}
                    <View style={[styles.countdownBadge, { backgroundColor: urgencyColor }]}>
                      <Text style={styles.countdownText}>{urgencyLabel}</Text>
                    </View>

                    {/* Project title */}
                    <Text style={styles.scheduleTitle}>
                      {lang === 'he' ? m.projectTitleHe : m.projectTitleEn}
                    </Text>

                    {/* Students */}
                    <Text style={styles.cardMeta}>
                      👤 {m.studentNames.length > 0
                        ? (Array.isArray(m.studentNames) ? m.studentNames.join(', ') : m.studentNames)
                        : (lang === 'he' ? 'לא ידוע' : 'Unknown')}
                    </Text>

                    {/* Supervisor */}
                    <Text style={styles.cardMeta}>
                      👨‍🏫 {lang === 'he' ? 'מנחה:' : 'Supervisor:'} {m.supervisorName}
                    </Text>

                    {/* Date / Time / Room chips */}
                    <View style={styles.scheduleRow}>
                      <View style={styles.scheduleChip}>
                        <Text style={styles.scheduleChipLabel}>
                          {lang === 'he' ? 'תאריך' : 'Date'}
                        </Text>
                        <Text style={styles.scheduleChipValue}>{formattedDate}</Text>
                      </View>

                      {formattedTime ? (
                        <View style={styles.scheduleChip}>
                          <Text style={styles.scheduleChipLabel}>
                            {lang === 'he' ? 'שעה' : 'Time'}
                          </Text>
                          <Text style={styles.scheduleChipValue}>{formattedTime}</Text>
                        </View>
                      ) : null}

                      {m.defenseRoom ? (
                        <View style={styles.scheduleChip}>
                          <Text style={styles.scheduleChipLabel}>
                            {lang === 'he' ? 'חדר' : 'Room'}
                          </Text>
                          <Text style={styles.scheduleChipValue}>{m.defenseRoom}</Text>
                        </View>
                      ) : null}
                    </View>

                  </View>
                );
              })
            )}
          </>
        )}
 
        <View style={{ height: 60 }} />
      </ScrollView>
 
      {/* ════════ GRADE MODAL — 100% unchanged from original ════════ */}
      <Modal visible={gradeModal} animationType="slide" presentationStyle="pageSheet">
        <ScrollView style={styles.modal} contentContainerStyle={styles.modalContent}>
          <Text style={styles.modalTitle}>
            {lang === 'he' ? '✏️ טופס ציון בוחן' : '✏️ Examiner Grading Form'}
          </Text>
 
          {selected && (
            <View style={styles.context}>
              <Text style={styles.contextTitle}>
                {lang === 'he' ? selected.projectTitleHe : selected.projectTitleEn}
              </Text>
              <Text style={styles.contextSub}>👤 {selected.studentNames.join(', ')}</Text>
              {selected.defenseDate && 
                <Text style={styles.contextSub}>
                  📅 {selected.defenseDate}
                </Text>}
            </View>
          )}
 
          {activeGradingFields(selected).filter((c) => !c.excludeFromTotal).map((c, idx, arr) => {
            const group = lang === 'he' ? c.groupHe : c.groupEn;
            const prevGroup = idx > 0 ? (lang === 'he' ? arr[idx - 1]!.groupHe : arr[idx - 1]!.groupEn) : undefined;
            const showGroupHeader = !!group && group !== prevGroup;
            return (
              <View key={c.key} style={styles.criterionRow}>
                {showGroupHeader && (
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#6B7280', textTransform: 'uppercase', marginBottom: 4 }}>{group}</Text>
                )}
                <View style={styles.criterionHeader}>
                  <Text style={styles.criterionLabel}>
                    {lang === 'he' ? c.heLabel : c.enLabel}
                  </Text>
                  <Text style={styles.criterionMax}>/ {c.maxScore}</Text>
                </View>
                <TextInput
                  style={styles.scoreInput}
                  value={scores[c.key] || ''}
                  onChangeText={(v) => setScores((prev) => ({ ...prev, [c.key]: v }))}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor="#9CA3AF"
                />
              </View>
            );
          })}

          {activeGradingFields(selected).filter((c) => c.excludeFromTotal).length > 0 && (
            <>
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#6B7280', textTransform: 'uppercase', marginTop: 8, marginBottom: 4 }}>
                {lang === 'he' ? 'ציונים נפרדים (לא נכללים בסיכום)' : 'Separate scores (not included in the total)'}
              </Text>
              {activeGradingFields(selected).filter((c) => c.excludeFromTotal).map((c) => (
                <View key={c.key} style={styles.criterionRow}>
                  <View style={styles.criterionHeader}>
                    <Text style={styles.criterionLabel}>
                      {lang === 'he' ? c.heLabel : c.enLabel}
                    </Text>
                    <Text style={styles.criterionMax}>/ {c.maxScore}</Text>
                  </View>
                  <TextInput
                    style={styles.scoreInput}
                    value={scores[c.key] || ''}
                    onChangeText={(v) => setScores((prev) => ({ ...prev, [c.key]: v }))}
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor="#9CA3AF"
                  />
                </View>
              ))}
            </>
          )}

          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>
              {lang === 'he' ? 'סה"כ' : 'Total'}
            </Text>
            <Text style={[styles.totalScore,
              { color: totalScore() >= maxTotalScore() * 0.6 ? '#10B981' : '#EF4444' }]}>
              {totalScore()} / {maxTotalScore()}
            </Text>
          </View>
 
          <Text style={styles.fieldLabel}>
            {lang === 'he' ? 'הערות' : 'Comments'}
          </Text>
          <TextInput
            style={styles.textarea}
            value={comments}
            onChangeText={setComments}
            multiline
            numberOfLines={5}
            placeholder={lang === 'he' ? 'הערות לסטודנט...' : 'Comments to student...'}
            textAlign={isRtl ? 'right' : 'left'}
          />
 
          <Pressable
            style={[styles.submitBtn, submitting && { opacity: 0.6 }]}
            onPress={handleSubmitGrade}
            disabled={submitting}
            accessibilityRole="button"
          >
            {submitting
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.submitBtnText}>
                  {lang === 'he' ? 'שלח ציון' : 'Submit Grade'}
                </Text>
            }
          </Pressable>
 
          <Pressable style={styles.cancelBtn} onPress={() => setGradeModal(false)} accessibilityRole="button">
            <Text style={styles.cancelBtnText}>{lang === 'he' ? 'ביטול' : 'Cancel'}</Text>
          </Pressable>
        </ScrollView>
      </Modal>

      {/* ════════ EXAMINER FORM-ANSWERS MODAL — non-scored online form ════════
          Generic (not faculty-specific) renderer for a milestone's
          examinerFormFields (see workflowTemplates.ts) — e.g. the Industrial
          Engineering & Management "Presentation 1" form (yes/no questions,
          each with a comment that becomes mandatory only for a specific
          answer — see each field's own commentRequiredOn), or any other
          text/number/date/textarea field a template defines. */}
      <Modal visible={formModal} animationType="slide" presentationStyle="pageSheet">
        <ScrollView style={styles.modal} contentContainerStyle={styles.modalContent}>
          <Text style={styles.modalTitle}>
            📝 {formTarget ? (MILESTONE_LABEL[formTarget.type]?.[lang] ?? '') : ''}
          </Text>

          {formTarget && (
            <View style={styles.context}>
              <Text style={styles.contextTitle}>
                {lang === 'he' ? formTarget.projectTitleHe : formTarget.projectTitleEn}
              </Text>
              <Text style={styles.contextSub}>👤 {formTarget.studentNames.join(', ')}</Text>
              <Text style={styles.contextSub}>👨‍🏫 {lang === 'he' ? 'מנחה:' : 'Supervisor:'} {formTarget.supervisorName}</Text>
              <Text style={styles.contextSub}>🖊 {lang === 'he' ? 'מעריך:' : 'Evaluator:'} {examinerName}</Text>
              <Text style={styles.contextSub}>📅 {new Date().toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US')}</Text>
            </View>
          )}

          {(formTarget?.examinerFormFields ?? []).map((f, idx) => {
            const a = formAnswers[f.key] ?? { value: '', comment: '' };
            return (
              <View key={f.key} style={[styles.criterionRow, { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, padding: 10 }]}>
                <Text style={styles.criterionLabel}>
                  {idx + 1}. {lang === 'he' ? f.labelHe : f.labelEn}{f.type !== 'yesno' && f.required ? ' *' : ''}
                </Text>
                {f.type === 'yesno' ? (
                  <>
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                      <Pressable
                        onPress={() => setFormAnswerValue(f.key, 'yes')}
                        style={{
                          flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center',
                          borderWidth: 1, borderColor: a.value === 'yes' ? '#10B981' : '#E5E7EB',
                          backgroundColor: a.value === 'yes' ? '#10B981' : 'transparent',
                        }}
                        accessibilityRole="button"
                      >
                        <Text style={{ fontWeight: '700', color: a.value === 'yes' ? '#fff' : '#111827' }}>{lang === 'he' ? 'כן' : 'Yes'}</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => setFormAnswerValue(f.key, 'no')}
                        style={{
                          flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center',
                          borderWidth: 1, borderColor: a.value === 'no' ? '#10B981' : '#E5E7EB',
                          backgroundColor: a.value === 'no' ? '#10B981' : 'transparent',
                        }}
                        accessibilityRole="button"
                      >
                        <Text style={{ fontWeight: '700', color: a.value === 'no' ? '#fff' : '#111827' }}>{lang === 'he' ? 'לא' : 'No'}</Text>
                      </Pressable>
                    </View>
                    {(() => {
                      const commentEnabled = f.commentRequiredOn ? a.value === f.commentRequiredOn : a.value !== '';
                      const commentRequired = f.commentRequiredOn ? a.value === f.commentRequiredOn : false;
                      return (
                        <>
                          <TextInput
                            style={[styles.textarea, !commentEnabled && { opacity: 0.5 }]}
                            value={a.comment}
                            editable={commentEnabled}
                            onChangeText={(v) => setFormAnswers((prev) => ({ ...prev, [f.key]: { value: prev[f.key]?.value ?? '', comment: v } }))}
                            multiline
                            numberOfLines={2}
                            placeholder={
                              !commentEnabled
                                ? (lang === 'he' ? 'אין צורך בהסבר עבור תשובה זו' : 'No explanation needed for this answer')
                                : (lang === 'he' ? 'הסבר במשפט אחד...' : 'One-sentence explanation...')
                            }
                            placeholderTextColor="#9CA3AF"
                            textAlign={isRtl ? 'right' : 'left'}
                          />
                          {commentRequired && (
                            <Text style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>
                              {lang === 'he' ? '* הסבר חובה עבור תשובה זו' : '* An explanation is required for this answer'}
                            </Text>
                          )}
                        </>
                      );
                    })()}
                  </>
                ) : (
                  <TextInput
                    style={{
                      marginTop: 8, borderWidth: 1.5, borderColor: '#CBD5E1', borderRadius: 8, padding: 11,
                      fontSize: 14, color: '#1E293B', backgroundColor: '#fff',
                      ...(f.type === 'textarea' ? { minHeight: 90, textAlignVertical: 'top' as const } : {}),
                    }}
                    value={a.value}
                    onChangeText={(v) => setFormAnswers((prev) => ({ ...prev, [f.key]: { value: v, comment: prev[f.key]?.comment ?? '' } }))}
                    multiline={f.type === 'textarea'}
                    numberOfLines={f.type === 'textarea' ? 4 : 1}
                    keyboardType={f.type === 'number' ? 'numeric' : 'default'}
                    placeholder={f.type === 'date' ? 'YYYY-MM-DD' : undefined}
                    placeholderTextColor="#9CA3AF"
                    textAlign={isRtl ? 'right' : 'left'}
                  />
                )}
              </View>
            );
          })}

          <Pressable
            style={[styles.submitBtn, formSubmitting && { opacity: 0.6 }]}
            onPress={handleSubmitForm}
            disabled={formSubmitting}
            accessibilityRole="button"
          >
            {formSubmitting
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.submitBtnText}>{lang === 'he' ? 'שלח' : 'Submit'}</Text>
            }
          </Pressable>

          <Pressable style={styles.cancelBtn} onPress={() => setFormModal(false)} accessibilityRole="button">
            <Text style={styles.cancelBtnText}>{lang === 'he' ? 'ביטול' : 'Cancel'}</Text>
          </Pressable>
        </ScrollView>
      </Modal>

      {/* ════════ EXAMINER EVALUATION MODAL — three-rubric workflow only ════════
          One examiner's half of the three-rubric final-grade workflow (see
          workflowTemplates.ts's finalGradeComponents) — 'project' scores the
          written project/thesis, 'defense' scores the oral defense
          performance; each examiner submits both, independently. Kept inline
          alongside the grade modal above, matching this screen's existing
          convention of not extracting its modals into components. */}
      <Modal visible={evalModal} animationType="slide" presentationStyle="pageSheet">
        <ScrollView style={styles.modal} contentContainerStyle={styles.modalContent}>
        {evalSubmittedAt ? (
          <>
            <Text style={styles.modalTitle}>✅ {lang === 'he' ? 'ההערכה נשלחה' : 'Evaluation submitted'}</Text>
            <View style={{ marginTop: 16, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, padding: 14, backgroundColor: '#F8FAFC' }}>
              <Text style={{ fontSize: 12, color: '#64748B' }}>{lang === 'he' ? 'שם הבוחן' : 'Examiner name'}</Text>
              <Text style={{ fontSize: 14, fontWeight: '600', color: '#1E293B', marginTop: 2 }}>{examinerName}</Text>
              <Text style={{ fontSize: 12, color: '#64748B', marginTop: 10 }}>{lang === 'he' ? 'תאריך' : 'Date'}</Text>
              <Text style={{ fontSize: 14, color: '#1E293B', marginTop: 2 }}>
                {evalSubmittedAt.toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US')}
              </Text>
              <Text style={{ fontSize: 12, color: '#64748B', marginTop: 10 }}>{lang === 'he' ? 'חתימה' : 'Signature'}</Text>
              <Text style={{ fontSize: 22, marginTop: 2, color: evalSignature.color, fontFamily: evalSignature.fontFamily }}>
                {examinerName}
              </Text>
            </View>
            <Pressable style={styles.submitBtn} onPress={() => setEvalModal(false)} accessibilityRole="button">
              <Text style={styles.submitBtnText}>{lang === 'he' ? 'סגור' : 'Close'}</Text>
            </Pressable>
          </>
        ) : (
          <>
          <Text style={styles.modalTitle}>
            {evalTarget?.kind === 'project'
              ? (lang === 'he' ? '📄 הערכת בוחן — עבודת הגמר' : '📄 Examiner Evaluation — The Project')
              : (lang === 'he' ? '🛡 הערכת בוחן — בחינת ההגנה' : '🛡 Examiner Evaluation — The Defense Exam')}
          </Text>

          {evalTarget && (
            <View style={styles.context}>
              <Text style={styles.contextTitle}>
                {lang === 'he' ? evalTarget.milestone.projectTitleHe : evalTarget.milestone.projectTitleEn}
              </Text>
              <Text style={styles.contextSub}>👤 {evalTarget.milestone.studentNames.join(', ')}</Text>
              {isDataScienceDocument && (
                <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#E2E8F0' }}>
                  <Text style={{ fontSize: 12, color: '#64748B' }}>
                    {lang === 'he' ? 'שנה"ל:' : 'Academic year:'} {evalTarget.milestone.academicYearHebrew ?? '—'}
                  </Text>
                  <Text style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                    {lang === 'he' ? 'תאריך תחילת פרויקט:' : 'Project start date:'}{' '}
                    {evalTarget.milestone.projectStartDate ? new Date(evalTarget.milestone.projectStartDate).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US') : '—'}
                  </Text>
                  <Text style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                    {lang === 'he' ? 'תאריך ההגנה:' : 'Defense date:'}{' '}
                    {evalTarget.milestone.defenseDate ? new Date(evalTarget.milestone.defenseDate).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US') : '—'}
                  </Text>
                </View>
              )}
            </View>
          )}

          {evalRubric.map((c) => (
            <View key={c.key} style={styles.criterionRow}>
              <View style={styles.criterionHeader}>
                <Text style={styles.criterionLabel}>
                  {lang === 'he' ? c.labelHe : c.labelEn}
                </Text>
                <Text style={styles.criterionMax}>/ {c.maxScore}</Text>
              </View>
              <TextInput
                style={styles.scoreInput}
                value={evalScores[c.key] || ''}
                onChangeText={(v) => setEvalScores((prev) => ({ ...prev, [c.key]: v }))}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor="#9CA3AF"
              />
            </View>
          ))}

          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>
              {lang === 'he' ? 'סה"כ' : 'Total'}
            </Text>
            <Text style={[styles.totalScore,
              { color: evalTotal >= 60 ? '#10B981' : '#EF4444' }]}>
              {evalTotal} / 100
            </Text>
          </View>

          <Text style={styles.fieldLabel}>
            {lang === 'he' ? 'הערכה מילולית והערות' : 'Written evaluation and comments'}{isDataScienceDocument ? ' *' : ''}
          </Text>
          <TextInput
            style={styles.textarea}
            value={evalComment}
            onChangeText={setEvalComment}
            multiline
            numberOfLines={5}
            placeholder={lang === 'he' ? 'הערות לסטודנט...' : 'Comments to student...'}
            textAlign={isRtl ? 'right' : 'left'}
          />

          <Text style={styles.fieldLabel}>
            {lang === 'he' ? 'קובץ מצורף (אופציונלי)' : 'Attached file (optional)'}
          </Text>
          <Pressable
            onPress={pickEvalFile}
            style={{ borderWidth: 1.5, borderColor: '#CBD5E1', borderRadius: 10, padding: 12, backgroundColor: '#fff' }}
            accessibilityRole="button"
          >
            <Text style={{ fontSize: 13, color: evalFile ? '#1E293B' : '#94A3B8' }}>
              {evalFile ? `📄 ${evalFile.name}` : (lang === 'he' ? 'בחר/י קובץ...' : 'Choose a file...')}
            </Text>
          </Pressable>

          <Pressable
            style={[styles.submitBtn, evalSubmitting && { opacity: 0.6 }]}
            onPress={handleSubmitEvaluation}
            disabled={evalSubmitting}
            accessibilityRole="button"
          >
            {evalSubmitting
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.submitBtnText}>
                  {lang === 'he' ? 'שלח' : 'Submit'}
                </Text>
            }
          </Pressable>

          <Pressable style={styles.cancelBtn} onPress={() => setEvalModal(false)} accessibilityRole="button">
            <Text style={styles.cancelBtnText}>{lang === 'he' ? 'ביטול' : 'Cancel'}</Text>
          </Pressable>
          </>
        )}
        </ScrollView>
      </Modal>

      <ChatbotFab lang={lang} corner="bottom-left" />
    </SafeAreaView>
  );
}