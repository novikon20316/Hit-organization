// src/config/degreeLengths.ts
//
// Shared by userController.ts (computeIsEligible) and accountDeletion.ts
// (graduation-based auto-deletion) — pulled out to its own module so neither
// has to import from the other (would otherwise be a circular import).
//
// Mirror of mobile/constants/faculties.ts's PROGRAM_DEGREE_LENGTHS — keep in
// sync. Keyed by the readable subject slug (e.g. 'computer_science',
// 'data_science'), not a facultyId.
export const DEGREE_LENGTHS: Record<string, number> = {
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
