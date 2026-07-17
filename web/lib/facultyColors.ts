// lib/facultyColors.ts
// Web-native color mapping for faculty and role badges. Deliberately NOT a
// port of mobile's FACULTY_COLORS (components/shared.tsx) — that palette
// (bright red/blue/amber) was chosen for a mobile app UI and would clash
// with this site's institutional paper/navy/brass system. Same faculty and
// role KEYS as mobile (so data lines up), different, calmer hex values.

import type { FacultyId } from './i18n';
import type { AppRole } from './roles';

export const FACULTY_COLORS: Record<FacultyId, string> = {
  sciences: '#3E6C8C',
  electrical: '#8A6A3B',
  industrial: '#736B8C',
  learning_tech: '#3F7A73',
  medical_tech: '#8C4F6B',
  design: '#6E5A99',
  data_science: '#5C7A3F',
  all: '#5A6472',
};

export const ROLE_ACCENTS: Record<AppRole, string> = {
  student: '#4C6B8A',
  supervisor: '#6E5A3B',
  secondary_supervisor: '#8A7550',
  coordinator: '#3F6B4C',
  faculty_admin: '#1E3A5F',
  program_head: '#16304E',
  administrative_secretary: '#7A6A53',
  grad_school_head: '#6E5A99',
  internal_examiner: '#8C4F6B',
  system_admin: '#B8862E',
};

export function getFacultyColor(id: string | undefined): string {
  return FACULTY_COLORS[(id as FacultyId) ?? 'all'] ?? FACULTY_COLORS.all;
}

export function getRoleAccent(role: string | undefined): string {
  return ROLE_ACCENTS[role as AppRole] ?? '#6B7280';
}

/** #RRGGBB -> rgba(...) — used for tinted badge backgrounds. Kept as a
 *  runtime helper (not Tailwind arbitrary classes) since these colors are
 *  data-driven and Tailwind can't statically discover a class name built
 *  from a variable. */
export function withAlpha(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
