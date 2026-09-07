// components/guidance/types.ts
// Shared shape for a screen's field-guide content — one ordered array per
// screen is the single source of truth for both FieldGuideOverlay's
// walkthrough steps and that field's inline InfoTooltip (see e.g.
// app/workflow-templates/fieldGuide.ts), so copy never drifts between the
// two.
export interface FieldGuideStep {
  /** Matches this field's `data-field-guide-id` attribute. */
  key: string;
  label: { he: string; en: string };
  description: { he: string; en: string };
}
