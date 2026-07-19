// src/config/majors.ts
//
// Mirror of mobile/constants/faculties.ts's HIT_FACULTIES program slugs —
// keep in sync. Unlike degreeLengths.ts (bachelor's-length lookup only,
// missing master's-only programs like data_science), this is the full set
// of every valid major slug regardless of degree level — used to validate
// that a user's `major` field is always a real program, never free text or
// a facultyId fallback (scope-matching, e.g. coordinator assignment,
// depends on this).
export const VALID_MAJORS = new Set([
  'computer_science',
  'applied_mathematics',
  'electrical_engineering',
  'industrial_engineering_management',
  'technology_management',
  'instructional_technologies',
  'digital_medical_technologies',
  'industrial_design',
  'interior_design',
  'visual_communication_design',
  'design_for_technological_environment',
  'data_science',
]);

// Mirror of mobile/constants/faculties.ts / web/lib/faculties.ts's
// HIT_FACULTIES → programs mapping, flattened to just the major slugs per
// faculty — used to validate a supervisor's assignedMajors (and a
// project's major) actually belong to the faculty they're being set on,
// not just that the slug exists somewhere in the whole institution.
export const MAJORS_BY_FACULTY: Record<string, string[]> = {
  sciences: ['computer_science', 'applied_mathematics'],
  electrical: ['electrical_engineering'],
  industrial: ['industrial_engineering_management', 'technology_management'],
  learning_tech: ['instructional_technologies'],
  medical_tech: ['digital_medical_technologies'],
  design: ['industrial_design', 'interior_design', 'visual_communication_design', 'design_for_technological_environment'],
  data_science: ['data_science'],
};

export function majorsForFaculty(facultyId: string): string[] {
  return MAJORS_BY_FACULTY[facultyId] ?? [];
}
