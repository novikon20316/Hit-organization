// lib/defenseDisplay.ts
// Shared shapes + display rules for a defense's format (in-person / Zoom /
// hybrid). Written by server/src/controllers/coordinatorController.ts's
// assignDefense; mirrored in mobile/lib/defenseDisplay.ts — keep in sync.

export type DefenseMode = 'in_person' | 'zoom' | 'hybrid';

export interface DefenseZoomMeeting {
  meetingId: string | null;
  passcode: string | null;
  /** 'api' = created by the system through Zoom; 'manual' = staff pasted a link. */
  createdBy: 'api' | 'manual';
}

export type DefenseStaffBasePath = 'admin' | 'coordinator' | 'project-coordinator';

export interface DefenseLogisticsPayload {
  mode: DefenseMode;
  /** 'YYYY-MM-DD' — only sent when staff MOVE the agreed date. */
  date?: string;
  time: string;
  building?: string;
  room?: string;
  durationMinutes?: number;
  manualZoomLink?: string;
}

/** Whatever subset of the logistics fields a given screen's data carries. */
export interface DefenseLogisticsFields {
  defenseMode?: DefenseMode | null;
  defenseTime?: string | null;
  defenseBuilding?: string | null;
  defenseRoom?: string | null;
  onlineDefenseLink?: string | null;
  zoomMeeting?: DefenseZoomMeeting | null;
  defenseDurationMinutes?: number | null;
}

/** Docs written before the format choice existed have no defenseMode: a
 *  link alongside a room was the old "hybrid", a room alone was in-person. */
export function resolveDefenseMode(f: DefenseLogisticsFields): DefenseMode {
  if (f.defenseMode) return f.defenseMode;
  if (f.onlineDefenseLink) return f.defenseRoom ? 'hybrid' : 'zoom';
  return 'in_person';
}

export function defenseModeLabel(mode: DefenseMode, lang: 'he' | 'en'): string {
  if (mode === 'zoom') return lang === 'he' ? 'הגנה בזום' : 'Zoom defense';
  if (mode === 'hybrid') return lang === 'he' ? 'הגנה היברידית (פרונטלי + זום)' : 'Hybrid defense (in person + Zoom)';
  return lang === 'he' ? 'הגנה פרונטלית' : 'In-person defense';
}

export function defenseModeIcon(mode: DefenseMode): string {
  return mode === 'zoom' ? '💻' : mode === 'hybrid' ? '🏢💻' : '🏢';
}

/** Building/room are meaningless for a Zoom-only defense, even if a stale
 *  value is still on the doc. */
export function showsDefensePlace(f: DefenseLogisticsFields): boolean {
  return resolveDefenseMode(f) !== 'zoom';
}

export function showsDefenseLink(f: DefenseLogisticsFields): boolean {
  return resolveDefenseMode(f) !== 'in_person' && !!f.onlineDefenseLink;
}
