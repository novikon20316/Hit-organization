// lib/studentTrack.ts
//
// Mirror of server/src/config/studentTrack.ts — keep in sync (same
// convention as faculties.ts/majors.ts). Client-side use is for conditional
// UI rendering only (e.g. showing the signup track-choice step) — the server
// copy is authoritative and re-derives policy independently on every write.
export type StudentTrack = 'project' | 'thesis';
export type TrackPolicy = 'coordinator_gated' | 'signup_choice' | 'project_only';

export const MASTERS_TRACK_POLICY: Record<string, TrackPolicy> = {
  computer_science: 'coordinator_gated',
  electrical_engineering: 'signup_choice',
  technology_management: 'signup_choice',
};

export function resolveTrackPolicy(degreeType: string | null | undefined, major: string | null | undefined): TrackPolicy {
  if (degreeType !== 'masters') return 'project_only';
  return MASTERS_TRACK_POLICY[major ?? ''] ?? 'project_only';
}

export function resolveEffectiveTrack(student: {
  degreeType?: string | null;
  major?: string | null;
  track?: string | null;
}): StudentTrack {
  const policy = resolveTrackPolicy(student.degreeType, student.major);
  if (policy === 'project_only') return 'project';
  return student.track === 'thesis' ? 'thesis' : 'project';
}
