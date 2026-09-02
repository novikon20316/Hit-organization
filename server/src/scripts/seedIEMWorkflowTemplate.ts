// src/scripts/seedIEMWorkflowTemplate.ts
//
// One-off: proposes + approves a new workflowTemplates version for
// (facultyId: 'industrial', processType: 'bsc_project',
// major: 'industrial_engineering_management') — the bachelor's Industrial
// Engineering & Management major's REAL paper-form content, digitized:
//   - Presentation 1 evaluation ("טופס להערכה מצגת 1") -> presentation_1,
//     a non-scored 4-question yes/no screening form (examinerFormFields).
//   - Presentation 2 evaluation ("טופס להערכה מצגת 2") -> presentation_2 AND
//     presentation_3 (the paper form is explicitly reused for both
//     milestones) — a 15-criterion 1-7 rubric (max 105) plus a separately-
//     entered poster score that does NOT count toward the 105 total.
//   - Project book evaluation ("טופס להערכת ספר פרויקט") -> project_book —
//     a 20-criterion 1-5 rubric, the project's final grade.
//
// All 4 milestones are examiner-only (examinerOnlyGrading: true) — there is
// no supervisor grading stage on any of them, matching the paper forms
// (which only ever have a single "מעריך"/evaluator signature line, filled
// by an assigned examiner, never the supervisor).
//
// IMPORTANT — major must be the EXACT string every time, never null: unlike
// data_science (a single-major faculty, where major: null safely means "the
// one major that exists"), 'industrial' also has 'technology_management'
// (bachelor's AND master's). Setting major: null here would silently also
// apply this template to technology_management's bachelor's students. See
// server/src/scripts/retireStaleDataScienceTemplate.ts for the real incident
// this precise mistake caused for data_science.
//
// Deliberately NOT set here (per the DS script's own precedent — staff
// configures these live via web/app/workflow-templates's editor):
//   - percentOfFinalGrade on presentation_1/2/3 (left at 0) — only
//     project_book (the final milestone) carries the full 100%.
//   - examinerCount (left at the editor's own default of 2 examiners per
//     milestone) — the user described a variable 2-3+ examiner panel;
//     adjust live per faculty preference.
//   - The poster score's scale (assumed 1-105 to match the presentation
//     rubric's own max, since the paper form gives no scale for it at all —
//     flagged in POSTER_SCORE_PLACEHOLDER below) and the due-date spacing
//     (dueDaysFromStart values below are placeholders, editable live).
//
// Only ever touches facultyId === 'industrial' AND
// major === 'industrial_engineering_management' — proposeWorkflowTemplate
// always creates a brand-new version, and approving it only supersedes this
// exact (processType, major) pair's own prior 'approved' doc (see
// workflowTemplates.ts's approveWorkflowTemplate). No other faculty/major's
// templates or DEFAULT_MILESTONES fallback are touched.
//
// SAFE BY DEFAULT: dry run (prints the full document, writes nothing) unless
// you pass --apply. Always run without --apply first and read the output.
//
// Usage (from server/):
//   npx tsx src/scripts/seedIEMWorkflowTemplate.ts             # dry run
//   npx tsx src/scripts/seedIEMWorkflowTemplate.ts --apply     # actually writes

import {
  proposeWorkflowTemplate,
  approveWorkflowTemplate,
  findApprovedTemplateId,
  type WorkflowMilestoneSpec,
  type FormFieldSpec,
  type GradingComponentSpec,
} from '../services/workflowTemplates.js';

const APPLY = process.argv.includes('--apply');
const SEED_ACTOR = 'system-seed-script:seedIEMWorkflowTemplate';
const FACULTY_ID = 'industrial';
const MAJOR = 'industrial_engineering_management';

// ─── "טופס להערכה מצגת 1" -> presentation_1.examinerFormFields ──────────────
const PRESENTATION_1_FIELDS: FormFieldSpec[] = [
  {
    key: 'topicSuitable',
    labelHe: 'האם נושא הפרויקט מתאים לתחום הנדסת תעשייה וניהול?',
    labelEn: 'Is the project topic suitable for the field of Industrial Engineering and Management?',
    type: 'yesno',
    required: true,
    commentRequiredOn: 'no',
  },
  {
    key: 'methodologySuitable',
    labelHe: 'האם המתודולוגיה הצפויה מתאימה לנושא הפרויקט?',
    labelEn: 'Is the expected methodology suitable for the project topic?',
    type: 'yesno',
    required: true,
    commentRequiredOn: 'no',
  },
  {
    key: 'dataCollectionRisk',
    labelHe: 'האם לצוות תהיה בעיה לאסוף נתונים הנדרשים לביצוע פרויקט?',
    labelEn: 'Will the team have trouble collecting the data required to carry out the project?',
    type: 'yesno',
    required: true,
    commentRequiredOn: 'yes',
  },
  {
    key: 'scopeSuitable',
    labelHe: 'האם ההיקף הצפוי מתאים לפרויקט גמר?',
    labelEn: 'Is the expected scope suitable for a final project?',
    type: 'yesno',
    required: true,
    commentRequiredOn: 'no',
  },
];

// ─── "טופס להערכה מצגת 2" -> presentation_2/3.gradingComponents ─────────────
// weight === maxScore (7) on every criterion so the plain sum reproduces the
// paper form's 1-105 range exactly (same "weight===max reproduces a
// plain-sum rubric" convention already used by GradeMilestoneModal/
// GradeExaminerModal elsewhere in this codebase).
const PRESENTATION_SCORE_COMPONENTS: GradingComponentSpec[] = [
  // מטרות פרויקט — Project goals
  { key: 'goalsSuitable', labelHe: 'מטרות פרויקט: מתאימות לנושא/בעיה', labelEn: 'Project goals: suitable for the topic/problem', maxScore: 7, weight: 7, hasComment: false, visibleToStudent: false, groupHe: 'מטרות פרויקט', groupEn: 'Project Goals' },
  { key: 'goalsClear', labelHe: 'מטרות פרויקט: הוצגו באופן ברור', labelEn: 'Project goals: presented clearly', maxScore: 7, weight: 7, hasComment: false, visibleToStudent: false, groupHe: 'מטרות פרויקט', groupEn: 'Project Goals' },
  { key: 'goalsAchieved', labelHe: 'מטרות פרויקט: הושגו במהלך הפרויקט', labelEn: 'Project goals: achieved during the project', maxScore: 7, weight: 7, hasComment: false, visibleToStudent: false, groupHe: 'מטרות פרויקט', groupEn: 'Project Goals' },
  // מתודולוגיה / שיטת עבודה — Methodology / work method
  { key: 'methodologySuitable', labelHe: 'מתודולוגיה/שיטת עבודה: מתאימה לנושא/בעיה', labelEn: 'Methodology/work method: suitable for the topic/problem', maxScore: 7, weight: 7, hasComment: false, visibleToStudent: false, groupHe: 'מתודולוגיה / שיטת עבודה', groupEn: 'Methodology / Work Method' },
  { key: 'methodologyClear', labelHe: 'מתודולוגיה/שיטת עבודה: הוצגה באופן ברור', labelEn: 'Methodology/work method: presented clearly', maxScore: 7, weight: 7, hasComment: false, visibleToStudent: false, groupHe: 'מתודולוגיה / שיטת עבודה', groupEn: 'Methodology / Work Method' },
  { key: 'methodologyMeetsRequirements', labelHe: 'מתודולוגיה/שיטת עבודה: עונה לדרישות הפרויקט בתחום הנדסת תעשייה וניהול', labelEn: "Methodology/work method: meets the project's requirements in Industrial Engineering & Management", maxScore: 7, weight: 7, hasComment: false, visibleToStudent: false, groupHe: 'מתודולוגיה / שיטת עבודה', groupEn: 'Methodology / Work Method' },
  // תוצרי פרויקט/ ממצאים — Project deliverables/findings
  { key: 'deliverablesSuitable', labelHe: 'תוצרי פרויקט/ממצאים: מתאימים לנושא/בעיה', labelEn: 'Project deliverables/findings: suitable for the topic/problem', maxScore: 7, weight: 7, hasComment: false, visibleToStudent: false, groupHe: 'תוצרי פרויקט/ ממצאים', groupEn: 'Project Deliverables / Findings' },
  { key: 'deliverablesComprehensive', labelHe: 'תוצרי פרויקט/ממצאים: מקיפים', labelEn: 'Project deliverables/findings: comprehensive', maxScore: 7, weight: 7, hasComment: false, visibleToStudent: false, groupHe: 'תוצרי פרויקט/ ממצאים', groupEn: 'Project Deliverables / Findings' },
  { key: 'deliverablesBasedOnData', labelHe: 'תוצרי פרויקט/ממצאים: מבוססים על מידע שנאסף ו/או על ספרות', labelEn: 'Project deliverables/findings: based on collected data and/or literature', maxScore: 7, weight: 7, hasComment: false, visibleToStudent: false, groupHe: 'תוצרי פרויקט/ ממצאים', groupEn: 'Project Deliverables / Findings' },
  { key: 'deliverablesClear', labelHe: 'תוצרי פרויקט/ממצאים: הוצגו באופן ברור', labelEn: 'Project deliverables/findings: presented clearly', maxScore: 7, weight: 7, hasComment: false, visibleToStudent: false, groupHe: 'תוצרי פרויקט/ ממצאים', groupEn: 'Project Deliverables / Findings' },
  // הצגה — Presentation
  { key: 'presentationWellBuilt', labelHe: 'הצגה: מצגת ברורה, ערוכה ובנויה היטב', labelEn: 'Presentation: clear, well-edited and well-structured', maxScore: 7, weight: 7, hasComment: false, visibleToStudent: false, groupHe: 'הצגה', groupEn: 'Presentation' },
  // Team-member mastery rows — the paper form has 3 fixed slots regardless of
  // actual team size; a 1-2 student team simply leaves the extra row(s) at 0.
  { key: 'teamMember1Mastery', labelHe: 'הצגה: חבר צוות 1 הפגין הבנה ושליטה בחומר', labelEn: 'Presentation: team member 1 demonstrated understanding and command of the material', maxScore: 7, weight: 7, hasComment: false, visibleToStudent: false, groupHe: 'הצגה', groupEn: 'Presentation' },
  { key: 'teamMember2Mastery', labelHe: 'הצגה: חבר צוות 2 הפגין הבנה ושליטה בחומר', labelEn: 'Presentation: team member 2 demonstrated understanding and command of the material', maxScore: 7, weight: 7, hasComment: false, visibleToStudent: false, groupHe: 'הצגה', groupEn: 'Presentation' },
  { key: 'teamMember3Mastery', labelHe: 'הצגה: חבר צוות 3 הפגין הבנה ושליטה בחומר', labelEn: 'Presentation: team member 3 demonstrated understanding and command of the material', maxScore: 7, weight: 7, hasComment: false, visibleToStudent: false, groupHe: 'הצגה', groupEn: 'Presentation' },
  { key: 'answeredQuestionsWell', labelHe: 'הצגה: ענו היטב לשאלות', labelEn: 'Presentation: answered questions well', maxScore: 7, weight: 7, hasComment: false, visibleToStudent: false, groupHe: 'הצגה', groupEn: 'Presentation' },
  // ציון הפוסטר — Poster score. The paper form gives it no scale at all
  // (just a blank line); assumed 1-105 to match the presentation rubric's
  // own max for direct comparability — CONFIRM/ADJUST this scale with staff,
  // then edit live via web/app/workflow-templates's rubric editor.
  { key: 'posterScore', labelHe: 'ציון הפוסטר (הנחת עבודה: סולם 1-105 — יש לאשר עם הצוות)', labelEn: 'Poster score (placeholder scale 1-105 — confirm with staff)', maxScore: 105, weight: 105, hasComment: false, visibleToStudent: false, excludeFromTotal: true },
];

// ─── "טופס להערכת ספר פרויקט" -> project_book.gradingComponents ────────────
// weight === maxScore (5) on every criterion, same plain-sum reasoning.
const PROJECT_BOOK_COMPONENTS: GradingComponentSpec[] = [
  // נושא/בעיה — Topic/problem
  { key: 'topicSuitableForFinalProject', labelHe: 'נושא/בעיה: מתאים לפרויקט גמר', labelEn: 'Topic/problem: suitable for a final project', maxScore: 5, weight: 5, hasComment: false, visibleToStudent: false, groupHe: 'נושא/בעיה', groupEn: 'Topic / Problem' },
  { key: 'topicOriginal', labelHe: 'נושא/בעיה: מקורי', labelEn: 'Topic/problem: original', maxScore: 5, weight: 5, hasComment: false, visibleToStudent: false, groupHe: 'נושא/בעיה', groupEn: 'Topic / Problem' },
  // מתודולוגיה — Methodology
  { key: 'methodSuitable', labelHe: 'מתודולוגיה: מתאימה לנושא/בעיה', labelEn: 'Methodology: suitable for the topic/problem', maxScore: 5, weight: 5, hasComment: false, visibleToStudent: false, groupHe: 'מתודולוגיה', groupEn: 'Methodology' },
  { key: 'methodScientificBasis', labelHe: 'מתודולוגיה: בסיס מדעי', labelEn: 'Methodology: scientific basis', maxScore: 5, weight: 5, hasComment: false, visibleToStudent: false, groupHe: 'מתודולוגיה', groupEn: 'Methodology' },
  { key: 'methodRich', labelHe: 'מתודולוגיה: עשירה', labelEn: 'Methodology: rich', maxScore: 5, weight: 5, hasComment: false, visibleToStudent: false, groupHe: 'מתודולוגיה', groupEn: 'Methodology' },
  { key: 'methodOriginal', labelHe: 'מתודולוגיה: מקורית', labelEn: 'Methodology: original', maxScore: 5, weight: 5, hasComment: false, visibleToStudent: false, groupHe: 'מתודולוגיה', groupEn: 'Methodology' },
  // תוצרי פרויקט / פתרון — Project deliverables / solution
  { key: 'solutionSuitable', labelHe: 'תוצרי פרויקט/פתרון: מתאימים לנושא/בעיה', labelEn: 'Project deliverables/solution: suitable for the topic/problem', maxScore: 5, weight: 5, hasComment: false, visibleToStudent: false, groupHe: 'תוצרי פרויקט / פתרון', groupEn: 'Project Deliverables / Solution' },
  { key: 'solutionComprehensive', labelHe: 'תוצרי פרויקט/פתרון: מקיפים', labelEn: 'Project deliverables/solution: comprehensive', maxScore: 5, weight: 5, hasComment: false, visibleToStudent: false, groupHe: 'תוצרי פרויקט / פתרון', groupEn: 'Project Deliverables / Solution' },
  { key: 'solutionVaried', labelHe: 'תוצרי פרויקט/פתרון: מגוונים', labelEn: 'Project deliverables/solution: varied', maxScore: 5, weight: 5, hasComment: false, visibleToStudent: false, groupHe: 'תוצרי פרויקט / פתרון', groupEn: 'Project Deliverables / Solution' },
  { key: 'solutionBasedOnData', labelHe: 'תוצרי פרויקט/פתרון: מבוססים על מידע שנאסף', labelEn: 'Project deliverables/solution: based on collected data', maxScore: 5, weight: 5, hasComment: false, visibleToStudent: false, groupHe: 'תוצרי פרויקט / פתרון', groupEn: 'Project Deliverables / Solution' },
  // סקירת ספרות — Literature review
  { key: 'literatureOriginal', labelHe: 'סקירת ספרות: מקורית', labelEn: 'Literature review: original', maxScore: 5, weight: 5, hasComment: false, visibleToStudent: false, groupHe: 'סקירת ספרות', groupEn: 'Literature Review' },
  { key: 'literatureSuitable', labelHe: 'סקירת ספרות: מתאימה לנושא/בעיה', labelEn: 'Literature review: suitable for the topic/problem', maxScore: 5, weight: 5, hasComment: false, visibleToStudent: false, groupHe: 'סקירת ספרות', groupEn: 'Literature Review' },
  { key: 'literatureComprehensiveAndCurrent', labelHe: 'סקירת ספרות: מקיפה ועדכנית', labelEn: 'Literature review: comprehensive and up to date', maxScore: 5, weight: 5, hasComment: false, visibleToStudent: false, groupHe: 'סקירת ספרות', groupEn: 'Literature Review' },
  { key: 'literatureCitedByStandard', labelHe: 'סקירת ספרות: רשימת המקורות כתובה לפי תקן', labelEn: 'Literature review: reference list written per standard', maxScore: 5, weight: 5, hasComment: false, visibleToStudent: false, groupHe: 'סקירת ספרות', groupEn: 'Literature Review' },
  // הצגה — Presentation (of the written book)
  { key: 'writingClearPhrasing', labelHe: 'הצגה: ניסוחים ברורים', labelEn: 'Presentation: clear phrasing', maxScore: 5, weight: 5, hasComment: false, visibleToStudent: false, groupHe: 'הצגה', groupEn: 'Presentation' },
  { key: 'writingInParagraphs', labelHe: 'הצגה: כתיבה בפסקאות', labelEn: 'Presentation: writing in paragraphs', maxScore: 5, weight: 5, hasComment: false, visibleToStudent: false, groupHe: 'הצגה', groupEn: 'Presentation' },
  { key: 'writingNoSpellingErrors', labelHe: 'הצגה: היעדר שגיאות כתיב', labelEn: 'Presentation: absence of spelling errors', maxScore: 5, weight: 5, hasComment: false, visibleToStudent: false, groupHe: 'הצגה', groupEn: 'Presentation' },
  { key: 'writingFluentReading', labelHe: 'הצגה: קריאה שוטפת וחלקה', labelEn: 'Presentation: smooth, fluent reading', maxScore: 5, weight: 5, hasComment: false, visibleToStudent: false, groupHe: 'הצגה', groupEn: 'Presentation' },
  // Standalone criteria (own category in the paper form, one row each)
  { key: 'appropriateScope', labelHe: 'היקף מתאים', labelEn: 'Appropriate scope', maxScore: 5, weight: 5, hasComment: false, visibleToStudent: false },
  { key: 'contributionToIndustryOrScience', labelHe: 'תרומה לתעשיות/לארגון מבוים/למדעי הנדסת תעשיה וניהול', labelEn: 'Contribution to industries/an established organization/Industrial Engineering & Management sciences', maxScore: 5, weight: 5, hasComment: false, visibleToStudent: false },
];

const MILESTONES: WorkflowMilestoneSpec[] = [
  {
    type: 'presentation_1',
    nameHe: 'מצגת 1',
    nameEn: 'Presentation 1',
    order: 1,
    dueDaysFromStart: 45,
    requiresExaminers: true,
    examinerCount: 2,
    examinerOnlyGrading: true,
    percentOfFinalGrade: 0,
    examinerFormFields: PRESENTATION_1_FIELDS,
  },
  {
    type: 'presentation_2',
    nameHe: 'מצגת 2',
    nameEn: 'Presentation 2',
    order: 2,
    dueDaysFromStart: 100,
    requiresExaminers: true,
    examinerCount: 2,
    examinerOnlyGrading: true,
    percentOfFinalGrade: 0,
    gradingComponents: PRESENTATION_SCORE_COMPONENTS,
  },
  {
    type: 'presentation_3',
    nameHe: 'מצגת 3',
    nameEn: 'Presentation 3',
    order: 3,
    dueDaysFromStart: 160,
    requiresExaminers: true,
    examinerCount: 2,
    examinerOnlyGrading: true,
    percentOfFinalGrade: 0,
    // Same paper form as presentation_2 ("טופס להערכה מצגת 2" is explicitly
    // reused for both milestones) — a fresh array so each milestone owns its
    // own independent template snapshot.
    gradingComponents: PRESENTATION_SCORE_COMPONENTS.map((c) => ({ ...c })),
  },
  {
    type: 'project_book',
    nameHe: 'ספר פרויקט',
    nameEn: 'Project Book',
    order: 4,
    dueDaysFromStart: 220,
    requiresExaminers: true,
    examinerCount: 2,
    examinerOnlyGrading: true,
    percentOfFinalGrade: 100,
    gradingComponents: PROJECT_BOOK_COMPONENTS,
  },
];

async function main() {
  console.log(`Proposed Industrial Engineering & Management (${FACULTY_ID}/bsc_project/${MAJOR}) workflow template:\n`);
  console.log(JSON.stringify(MILESTONES, null, 2));

  if (!APPLY) {
    console.log('\nDry run only — re-run with --apply to actually propose and approve this version.');
    return;
  }

  const { id } = await proposeWorkflowTemplate({
    facultyId: FACULTY_ID,
    processType: 'bsc_project',
    major: MAJOR,
    milestones: MILESTONES,
    createdBy: SEED_ACTOR,
    note: 'Seeded from the faculty\'s real paper forms (טופס להערכה מצגת 1/2, טופס להערכת ספר פרויקט) — all 4 milestones are examiner-only, no supervisor grading stage.',
    applyMode: 'from_now_on',
  });
  console.log(`\nProposed template ${id}.`);

  await approveWorkflowTemplate(id, SEED_ACTOR);
  console.log(`Approved template ${id}.`);

  // Self-check — see the header comment above and
  // retireStaleDataScienceTemplate.ts for why this must never be skipped:
  // an exact-major approval that fails to resolve here means every real
  // industrial_engineering_management project will silently keep falling
  // back to a stale/wrong template instead of this one.
  const resolved = await findApprovedTemplateId(FACULTY_ID, 'bsc_project', MAJOR);
  if (resolved?.id === id) {
    console.log(`Self-check passed: findApprovedTemplateId('${FACULTY_ID}', 'bsc_project', '${MAJOR}') resolves to ${id}.`);
  } else {
    console.error(`Self-check FAILED: findApprovedTemplateId resolved to ${resolved?.id ?? 'null'}, expected ${id}. Investigate before relying on this template.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('seedIEMWorkflowTemplate failed:', err);
  process.exit(1);
});
