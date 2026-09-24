// lib/milestoneLabel.ts
//
// Every dashboard that renders a milestone's name has its own hardcoded
// MILESTONE_LABEL map (student/home/types.ts, supervisor/dashboard/types.ts,
// coordinator/home/types.ts, examinor/home/types.ts, ArchivedProjectsTab.tsx)
// covering only the 5 legacy built-in milestone types (research_proposal,
// progress_report, final_report, defense, poster) — those predate the
// workflow-template system and have no name of their own. A custom milestone
// type a faculty admin creates via the Workflow Template Manager gets a
// generated type like `custom_xxxxx` with no entry in any of those maps, but
// DOES carry its own nameHe/nameEn (snapshotted onto the milestone doc at
// enrollment — see server/src/services/projectEnrollment.ts), which every
// call site used to ignore entirely, falling straight through to the raw
// type key. This is the one place that now knows to check nameHe/nameEn
// first — each screen keeps its own MILESTONE_LABEL for the legacy fallback,
// passed in rather than centralized, since a couple of screens intentionally
// carry a narrower subset (e.g. mobile's Reports filter has no `poster`).
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
