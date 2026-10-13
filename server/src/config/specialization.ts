// src/config/specialization.ts
//
// Specialization (תחום) a student picks at signup, for the programs listed
// below only — currently just M.Sc Electrical Engineering, with a different
// list for thesis vs. project students. Shown as the
// "מגמה" column on the administrative coordinator's Students Report.
// Mirror of web/lib/specialization.ts / mobile/constants/specialization.ts —
// keep in sync (same convention as studentTrack.ts).
// Per major, per thesis/project track — the two tracks offer different lists,
// so nothing is offered until the track itself is chosen.
export const MASTERS_SPECIALIZATIONS: Record<string, { thesis: string[]; project: string[] }> = {
  electrical_engineering: {
    thesis: ['energy_power_systems', 'electro_optics', 'bioengineering'],
    project: ['energy_power_systems', 'electro_optics_image_processing', 'bioengineering', 'communication_engineering', 'micro_nano_electronics'],
  },
};

export function specializationsFor(
  degreeType: string | null | undefined,
  major: string | null | undefined,
  track: string | null | undefined,
): string[] {
  if (degreeType !== 'masters' || (track !== 'thesis' && track !== 'project')) return [];
  return MASTERS_SPECIALIZATIONS[major ?? '']?.[track] ?? [];
}

/** Options for an existing student, used when staff set it after signup. A
 *  student doc with no thesis/project track yet gets both tracks' options. */
export function specializationsForStudent(student: { degreeType?: string | null; major?: string | null; track?: string | null }): string[] {
  if (student.track === 'thesis' || student.track === 'project') {
    return specializationsFor(student.degreeType, student.major, student.track);
  }
  return [...new Set([
    ...specializationsFor(student.degreeType, student.major, 'thesis'),
    ...specializationsFor(student.degreeType, student.major, 'project'),
  ])];
}
