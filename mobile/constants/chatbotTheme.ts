// constants/chatbotTheme.ts
//
// "Academic Precision" tokens — AI chatbot screen only.
//
// Pulled from the Stitch design project "Unified Academic Project Manager"
// (screen: "Academic Assistant: Mobile AI Chatbot") so this reads as the same
// design as the ported --student-/--coordinator-/--admin- token blocks (see
// ./studentTheme.ts and the web app's globals.css). Its own block rather than
// reusing studentPalette because ChatbotFab (and this screen) is mounted on
// every role's home screen, not just the student one — it isn't any single
// role's screen, so it shouldn't borrow that role's name.
//
// Font stays the RN default system font, same reasoning as studentTheme.ts:
// the source design's Latin-only typefaces would break Hebrew glyph rendering.

export const chatbotPalette = {
  primary: '#00236f',
  primaryContainer: '#1e3a8a',
  onPrimary: '#ffffff',
  onPrimaryContainer: '#90a8ff',
  primaryFixed: '#dce1ff',

  secondary: '#505f76',

  surface: '#faf8ff',
  surfaceContainerLowest: '#ffffff',
  surfaceContainerLow: '#f4f3fa',
  surfaceContainer: '#eeedf4',

  onSurface: '#1a1b21',
  onSurfaceVariant: '#444651',
  outline: '#757682',
  outlineVariant: '#c5c5d3',

  online: '#22c55e',
} as const;

export const chatbotRadius = {
  sm: 2,
  md: 4,
  lg: 8,
  xl: 16,
} as const;

export const chatbotSpacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
} as const;
