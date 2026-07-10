// constants/faculties.ts
//
// Single source of truth for the college's faculty → degree-program structure.
// Used by: student signup ((auth)/signup.tsx), admin "create project"
// (components/modals/NewProjectModal.tsx), and anywhere else that needs to
// show a faculty or program picker.
//
// Faculty IDs here MUST stay in sync with FACULTY_COLORS (components/shared.tsx),
// FacultyId/FACULTY_LABELS (components/i18n.ts), VALID_FACULTY_IDS
// (firebase/roles.ts), and VALID_FACULTIES (server/src/services/userImportExport.ts).
//
// Source: AI-provided faculty/degree list (2026-07-10), not yet independently
// confirmed by the college — treat as provisional until verified. "School of
// Multidisciplinary Studies" is a known 8th faculty but is omitted here until
// its degree programs are known.
//
// Each program's `slug` (not `key`) is what gets written to a student's
// `major` field on their user doc — one slug per subject, shared across
// bachelor's/master's versions of the same subject (degreeType already tracks
// the level). `key` is only a stable, level-specific row identifier for the
// picker UI.

import { Faculty, Program } from '@/types';

export const HIT_FACULTIES: Faculty[] = [
  {
    key: 'sciences',
    label: { he: 'הפקולטה למדעים', en: 'Faculty of Sciences' },
    programs: [
      { key: 'bsc_cs', slug: 'computer_science', label: { he: 'B.Sc במדעי המחשב', en: 'B.Sc. in Computer Science' }, level: 'bachelors' },
      { key: 'bsc_math', slug: 'applied_mathematics', label: { he: 'B.Sc במתמטיקה שימושית', en: 'B.Sc. in Applied Mathematics' }, level: 'bachelors' },
      { key: 'msc_cs', slug: 'computer_science', label: { he: 'M.Sc במדעי המחשב', en: 'M.Sc. in Computer Science' }, level: 'masters' },
    ],
  },
  {
    key: 'electrical',
    label: { he: 'הפקולטה להנדסת חשמל ואלקטרוניקה', en: 'Faculty of Electrical and Electronics Engineering' },
    programs: [
      { key: 'bsc_ee', slug: 'electrical_engineering', label: { he: 'B.Sc בהנדסת חשמל ואלקטרוניקה', en: 'B.Sc. in Electrical and Electronics Engineering' }, level: 'bachelors' },
      { key: 'msc_ee', slug: 'electrical_engineering', label: { he: 'M.Sc בהנדסת חשמל ואלקטרוניקה', en: 'M.Sc. in Electrical and Electronics Engineering' }, level: 'masters' },
    ],
  },
  {
    key: 'industrial',
    label: { he: 'הפקולטה להנדסת תעשייה וניהול טכנולוגיה', en: 'Faculty of Industrial Engineering and Technology Management' },
    programs: [
      { key: 'bsc_ie', slug: 'industrial_engineering_management', label: { he: 'B.Sc בהנדסת תעשייה וניהול', en: 'B.Sc. in Industrial Engineering and Management' }, level: 'bachelors' },
      { key: 'bsc_tm', slug: 'technology_management', label: { he: 'B.Sc בניהול טכנולוגיה', en: 'B.Sc. in Technology Management' }, level: 'bachelors' },
      { key: 'msc_tm', slug: 'technology_management', label: { he: 'M.Sc בניהול טכנולוגיה', en: 'M.Sc. in Technology Management' }, level: 'masters' },
    ],
  },
  {
    key: 'learning_tech',
    label: { he: 'הפקולטה לטכנולוגיות למידה', en: 'Faculty of Instructional Technologies' },
    programs: [
      { key: 'ba_it', slug: 'instructional_technologies', label: { he: 'B.A בטכנולוגיות למידה', en: 'B.A. in Instructional Technologies' }, level: 'bachelors' },
      { key: 'ma_it', slug: 'instructional_technologies', label: { he: 'M.A בטכנולוגיות למידה', en: 'M.A. in Instructional Technologies' }, level: 'masters' },
    ],
  },
  {
    key: 'medical_tech',
    label: { he: 'הפקולטה לטכנולוגיות רפואיות', en: 'Faculty of Medical Technologies' },
    programs: [
      { key: 'bsc_dmt', slug: 'digital_medical_technologies', label: { he: 'B.Sc בטכנולוגיות דיגיטליות ברפואה', en: 'B.Sc. in Digital Medical Technologies' }, level: 'bachelors' },
    ],
  },
  {
    key: 'design',
    label: { he: 'הפקולטה לעיצוב', en: 'Faculty of Design' },
    programs: [
      { key: 'bdes_id', slug: 'industrial_design', label: { he: 'B.Des בעיצוב תעשייתי', en: 'B.Des. in Industrial Design' }, level: 'bachelors' },
      { key: 'bdes_int', slug: 'interior_design', label: { he: 'B.Des בעיצוב פנים', en: 'B.Des. in Interior Design' }, level: 'bachelors' },
      { key: 'bdes_vc', slug: 'visual_communication_design', label: { he: 'B.Des בעיצוב תקשורת חזותית', en: 'B.Des. in Visual Communication Design' }, level: 'bachelors' },
      { key: 'mdes', slug: 'design_for_technological_environment', label: { he: 'M.Des בעיצוב לסביבה טכנולוגית', en: 'M.Des. in Design for Technological Environment' }, level: 'masters' },
    ],
  },
  {
    key: 'data_science',
    label: { he: 'המחלקה למדעי הנתונים', en: 'Department of Data Science' },
    programs: [
      { key: 'msc_ds', slug: 'data_science', label: { he: 'M.Sc במדעי הנתונים', en: 'M.Sc. in Data Science' }, level: 'masters' },
    ],
  },
];

// Bachelor's-degree lengths in years, keyed by SLUG (matches what's actually
// stored in a user doc's `major` field — see server/src/controllers/userController.ts's
// mirror of this map). Only bachelor's programs need this (masters eligibility
// is a flat year-1/year-2 rule, see computeIsEligible). Provisional defaults:
// engineering B.Sc programs (Electrical, Industrial) = 4 years, every other
// bachelor's program = 3 years. Update per-program once the college confirms
// real lengths.
export const PROGRAM_DEGREE_LENGTHS: Record<string, number> = {
  computer_science: 3,
  applied_mathematics: 3,
  electrical_engineering: 4,
  industrial_engineering_management: 4,
  technology_management: 4,
  instructional_technologies: 3,
  digital_medical_technologies: 3,
  industrial_design: 3,
  interior_design: 3,
  visual_communication_design: 3,
  default: 4,
};

export function getFacultyByKey(key: string): Faculty | undefined {
  return HIT_FACULTIES.find((f) => f.key === key);
}

export function getFilteredPrograms(
  facultyKey: string,
  level: 'bachelors' | 'masters' | 'both',
): Program[] {
  const faculty = getFacultyByKey(facultyKey);
  if (!faculty) return [];
  if (level === 'both') return faculty.programs;
  return faculty.programs.filter((p) => p.level === level);
}

export function getProgramByKey(programKey: string): Program | undefined {
  for (const faculty of HIT_FACULTIES) {
    const program = faculty.programs.find((p) => p.key === programKey);
    if (program) return program;
  }
  return undefined;
}
