// utils/milestoneLabel.ts
// Mirrors web/lib/milestoneLabel.ts — see that file's header comment for the
// full story. Every screen keeps its own local MILESTONE_LABEL map for the
// 5 legacy built-in types; this is the one shared place that checks a
// milestone's own nameHe/nameEn (set from the workflow template at
// enrollment — see server/src/services/projectEnrollment.ts) before falling
// back to that map, so a custom `custom_xxxxx` milestone type renders its
// configured name instead of its raw type key.
export interface MilestoneLike {
  type?: string | null;
  nameHe?: string | null;
  nameEn?: string | null;
}

export function milestoneDisplayName(
  m: MilestoneLike,
  lang: 'he' | 'en',
  labels: Record<string, { he: string; en: string }>
): string {
  const custom = lang === 'he' ? m.nameHe : m.nameEn;
  if (custom) return custom;
  const type = m.type ?? '';
  return labels[type]?.[lang] ?? type;
}
