// constants/milestoneTheme.ts
//
// "Academic Precision" tokens for the shared mobile milestone-tracker card
// (components/MilestoneRoadmap.tsx) — ported from the Stitch design project
// "Unified Academic Project Manager" (screen: Mobile Milestone Tracker with
// Files). Kept role-neutral (unlike studentTheme.ts's `--student-` prefix)
// because MilestoneRoadmap is consumed by more than one role's screens
// (system_admin's project milestones screen, administrative_coordinator's
// student drill-down) — same reasoning as web's components/MilestoneTimeline
// .tsx, which reads the base (non role-prefixed) CSS tokens for the same
// reason. Values are identical to studentTheme.ts's palette on purpose: same
// source design, same "read as one design" goal.

import { StyleSheet } from 'react-native';

export const milestonePalette = {
  primary: '#00236f',
  primaryContainer: '#1e3a8a',
  onPrimary: '#ffffff',

  surface: '#faf8ff',
  surfaceContainerLowest: '#ffffff',
  surfaceContainerLow: '#f4f3fa',
  surfaceContainer: '#eeedf4',
  surfaceVariant: '#e3e1e9',

  onSurface: '#1a1b21',
  onSurfaceVariant: '#444651',
  outline: '#757682',
  outlineVariant: '#c5c5d3',

  error: '#ba1a1a',
  errorContainer: '#ffdad6',

  success: '#3f6b4c',
  successContainer: '#eaf1ec',
} as const;

export const milestoneRadius = {
  sm: 6,
  md: 10,
  lg: 14,
} as const;

export const milestoneSpacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
} as const;

export const milestoneCardStyles = StyleSheet.create({
  base: {
    backgroundColor: milestonePalette.surface,
    borderRadius: milestoneRadius.lg,
    borderWidth: 1,
    borderColor: milestonePalette.outlineVariant,
    padding: milestoneSpacing.md,
  },
});
