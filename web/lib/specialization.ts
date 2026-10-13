// lib/specialization.ts
//
// Mirror of server/src/config/specialization.ts — keep in sync. Client-side
// use is for conditional UI (the signup specialization step) and labels
// only; the server re-validates on every write.
export const SPECIALIZATION_LABELS: Record<string, { he: string; en: string }> = {
  energy_power_systems: { he: 'תחום אנרגיה ומערכות הספק', en: 'Energy and Power Systems' },
  electro_optics: { he: 'תחום אלקטרואופטיקה', en: 'Electro-Optics' },
  electro_optics_image_processing: { he: 'תחום אלקטרואופטיקה ועיבוד תמונה', en: 'Electro-Optics and Image Processing' },
  bioengineering: { he: 'תחום ביו הנדסה', en: 'Bioengineering' },
  communication_engineering: { he: 'תחום הנדסת תקשורת', en: 'Communication Engineering' },
  micro_nano_electronics: { he: 'תחום מיקרו וננו אלקטרוניקה', en: 'Micro and Nano Electronics' },
};

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

export function specializationLabel(key: string | null | undefined, lang: 'he' | 'en'): string | null {
  return key ? SPECIALIZATION_LABELS[key]?.[lang] ?? null : null;
}
