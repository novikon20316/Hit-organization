// components/guidance/types.ts
// Mirrors web's components/guidance/types.ts — one ordered array per screen
// is the single source of truth for both FieldGuideOverlay's walkthrough
// steps and that field's inline InfoTooltip.
export interface FieldGuideStep {
  /** Matches this field's FieldGuideTarget fieldKey. */
  key: string;
  label: { he: string; en: string };
  description: { he: string; en: string };
}
