// constants/studentTheme.ts
//
// "Academic Precision" tokens — student screens only.
//
// Pulled from the Stitch design project "Unified Academic Project Manager"
// (screens: Student Mobile Home, Mobile Milestone Tracker) so the
// student-facing mobile screens and the student-facing web pages read as one
// design. Deliberately separate from `palette`/`cardStyles` in ./theme and
// ./styles — those are shared by every role (student/supervisor/coordinator/
// admin/examiner); redefining them here instead of overwriting the shared
// ones keeps every other role's screens untouched.
//
// Font stays the RN default system font (see Fonts in ./theme) — the source
// design's Work Sans/Inter/JetBrains Mono are Latin-only and would break
// Hebrew glyph rendering, so only the color/spacing/radius/type-scale system
// was ported, not the typefaces.

import { StyleSheet } from 'react-native';

export const studentPalette = {
  primary: '#00236f',
  primaryContainer: '#1e3a8a',
  onPrimary: '#ffffff',
  onPrimaryContainer: '#90a8ff',
  primaryFixed: '#dce1ff',
  primaryFixedDim: '#b6c4ff',
  onPrimaryFixed: '#00164e',

  secondary: '#505f76',
  secondaryContainer: '#d0e1fb',
  onSecondaryContainer: '#54647a',

  surface: '#faf8ff',
  surfaceContainerLowest: '#ffffff',
  surfaceContainerLow: '#f4f3fa',
  surfaceContainer: '#eeedf4',
  surfaceContainerHigh: '#e9e7ef',
  surfaceVariant: '#e3e1e9',

  onSurface: '#1a1b21',
  onSurfaceVariant: '#444651',
  outline: '#757682',
  outlineVariant: '#c5c5d3',

  error: '#ba1a1a',
  errorContainer: '#ffdad6',
  onErrorContainer: '#93000a',

  // Status accents used by the milestone tracker card states.
  statusGraded: '#00236f',
  statusGradedBg: 'rgba(0, 35, 111, 0.1)',
  statusAwaiting: '#54647a',
  statusAwaitingBg: 'rgba(80, 95, 118, 0.12)',
  statusInProgress: '#54647a',
  statusInProgressBg: '#d0e1fb',
  statusUpcoming: '#757682',
  statusUpcomingBg: '#e3e1e9',
} as const;

export const studentRadius = {
  sm: 2,
  md: 4,
  lg: 8,
} as const;

export const studentSpacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const studentCardStyles = StyleSheet.create({
  base: {
    backgroundColor: studentPalette.surfaceContainerLowest,
    borderRadius: studentRadius.lg,
    borderWidth: 1,
    borderColor: studentPalette.outlineVariant,
    padding: studentSpacing.md,
  },
  metric: {
    backgroundColor: studentPalette.surfaceContainerLowest,
    borderRadius: studentRadius.lg,
    borderWidth: 1,
    borderColor: studentPalette.outlineVariant,
    padding: studentSpacing.md,
    justifyContent: 'space-between',
  },
});
