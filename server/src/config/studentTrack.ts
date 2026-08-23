// src/config/studentTrack.ts
//
// Whether a student can be on the 'thesis' track at all, and who decides it,
// is driven entirely by their major + degreeType — see resolveTrackPolicy.
// Mirror of mobile/constants/studentTrack.ts / web/lib/studentTrack.ts — keep
// in sync (same convention as majors.ts/faculties.ts).
//
// - coordinator_gated: fixed to 'project' until a coordinator marks the
//   student thesis-eligible (see services/studentTrack.ts's
//   setThesisEligibility) — only then can the student choose for themselves.
// - signup_choice: the student picks their track once, during signup, and it
//   locks immediately — they can never change it themselves afterward.
// - project_only: always 'project', no thesis concept, no choice UI ever.
//   Every masters major not explicitly listed below falls back to this, and
//   EVERY bachelors degree is project_only regardless of major (a thesis
//   track doesn't exist below masters level).
export type StudentTrack = 'project' | 'thesis';
export type TrackPolicy = 'coordinator_gated' | 'signup_choice' | 'project_only';

export const MASTERS_TRACK_POLICY: Record<string, TrackPolicy> = {
  computer_science: 'coordinator_gated',
  electrical_engineering: 'signup_choice',
  technology_management: 'signup_choice',
  // instructional_technologies, design_for_technological_environment,
  // data_science all fall back to 'project_only' below — no thesis track for them.
};

// A coordinator_gated student's grade average, entered manually today (see
// services/studentTrack.ts's setThesisEligibilityFromAverage) — planned to
// eventually be pulled automatically from המכלול (Michlol) instead. At or
// above this, the student is offered the thesis-vs-project choice; below it,
// they stay fixed on project. A coordinator/program_head/administrative
// coordinator can still manually override either outcome afterward.
export const THESIS_ELIGIBILITY_THRESHOLD = 90;

export function resolveTrackPolicy(degreeType: string | null | undefined, major: string | null | undefined): TrackPolicy {
  if (degreeType !== 'masters') return 'project_only';
  return MASTERS_TRACK_POLICY[major ?? ''] ?? 'project_only';
}

/** A coordinator_gated student who hasn't chosen yet (track is null/unset)
 *  behaves as 'project' in the meantime — "fixed to projects until upgraded"
 *  per the business rule. project_only students always resolve to 'project'
 *  even if some stale/corrupt doc ever had track set to 'thesis'. */
export function resolveEffectiveTrack(student: {
  degreeType?: string | null;
  major?: string | null;
  track?: string | null;
}): StudentTrack {
  const policy = resolveTrackPolicy(student.degreeType, student.major);
  if (policy === 'project_only') return 'project';
  return student.track === 'thesis' ? 'thesis' : 'project';
}
