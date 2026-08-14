// lib/faculties.ts
// Ported from mobile/constants/faculties.ts — single source of truth for the
// college's faculty → degree-program structure. Keep in sync by hand; it
// changes about as often as the college adds a program (rare, reviewed).
//
// Source: AI-provided faculty/degree list (2026-07-10), not yet independently
// confirmed by the college — treat as provisional until verified, same
// caveat as the mobile copy.

import type { FacultyId, Lang } from './i18n';

export interface Program {
  key: string;
  /** Written to a student's `major` field — must be one of VALID_MAJORS below. */
  slug: string;
  label: Record<Lang, string>;
  level: 'bachelors' | 'masters';
}

export interface Faculty {
  key: FacultyId;
  label: Record<Lang, string>;
  programs: Program[];
}

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
    programs: [{ key: 'msc_ds', slug: 'data_science', label: { he: 'M.Sc במדעי הנתונים', en: 'M.Sc. in Data Science' }, level: 'masters' }],
  },
];

// Mirror of mobile/constants/faculties.ts's PROGRAM_DEGREE_LENGTHS — bachelor's
// program length in years, used to build the year-of-study picker during
// signup. Master's programs are always 2 years, handled separately (see
// app/(auth)/signup/page.tsx).
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

// Mirror of server/src/config/majors.ts — every valid `major` slug, used to
// validate client-side before the server round-trip bothers rejecting it.
export const VALID_MAJORS = new Set(HIT_FACULTIES.flatMap((f) => f.programs.map((p) => p.slug)));

// Program labels carry a leading degree abbreviation (e.g. "B.Sc. in Computer
// Science" / "B.Sc במדעי המחשב") meant for places that list full program
// names. A bachelor's and master's program can share the same `slug` (see
// Program.slug above) with degree level tracked separately elsewhere (e.g.
// ScopeDescriptor.degreeLevel, a project's degreeTypes) — anywhere that
// dedupes programs by slug must strip this prefix first, or the surviving
// label misleadingly implies only one degree level exists for that major.
const DEGREE_PREFIX_RE = /^(B\.Sc|M\.Sc|B\.A|M\.A|B\.Des|M\.Des)\.?\s+/i;
export function stripDegreePrefix(label: string): string {
  return label.replace(DEGREE_PREFIX_RE, '');
}
