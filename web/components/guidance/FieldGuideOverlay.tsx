'use client';

// components/guidance/FieldGuideOverlay.tsx
// First-visit, per-tab/per-form "here's what every field means" walkthrough.
// Deliberately a sibling of components/onboarding/OnboardingTour.tsx rather
// than a modification of it — same proven spotlight+tooltip-card mechanics
// (copied, not shared, so the already-shipped app-wide tour can't regress),
// but scoped to one screen's fields instead of the whole sidebar, and gated
// per-guideKey (userData.seenFieldGuides) instead of the single app-wide
// hasSeenOnboardingTour flag. Targets [data-field-guide-id] — a separate
// attribute namespace from the tour's [data-tour-id] so a field and a nav
// item can never collide.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { apiClient } from '@/lib/apiClient';
import type { FieldGuideStep } from './types';

interface FieldGuideOverlayProps {
  /** Unique per screen/form — persisted in userData.seenFieldGuides once
   *  finished/dismissed, so this exact walkthrough never shows again. */
  guideKey: string;
  steps: FieldGuideStep[];
}

const TOOLTIP_WIDTH = 300;
const GAP = 16;
const VIEWPORT_MARGIN = 16;

export function FieldGuideOverlay({ guideKey, steps }: FieldGuideOverlayProps) {
  const { lang } = useLanguage();
  const { userData } = useAuth();
  const dialogRef = useRef<HTMLDivElement>(null);

  const [stepIndex, setStepIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const alreadySeen = !!userData?.seenFieldGuides?.includes(guideKey);
  const step = steps[stepIndex];
  const stepKey = step?.key;

  const finish = useCallback(() => {
    setDismissed(true);
    // Best-effort, same tolerant fallback as completeOnboardingTour — a lost
    // network call just means this walkthrough reappears next visit.
    apiClient.markFieldGuideSeen(guideKey).catch(() => {});
  }, [guideKey]);

  const measure = useCallback(() => {
    if (!stepKey) return;
    const el = document.querySelector(`[data-field-guide-id="${stepKey}"]`);
    setRect(el ? el.getBoundingClientRect() : null);
  }, [stepKey]);

  useEffect(() => {
    if (dismissed || alreadySeen || !stepKey) return;
    const el = document.querySelector(`[data-field-guide-id="${stepKey}"]`);
    el?.scrollIntoView({ block: 'center' });
    measure();
    const settleTimer = window.setTimeout(measure, 300);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.clearTimeout(settleTimer);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [stepKey, dismissed, alreadySeen, measure]);

  // Deliberately NOT using useModalA11y here (unlike OnboardingTour, which
  // it's otherwise modeled on) — that hook's document-level capture-phase
  // Escape/Tab handling is safe for OnboardingTour because it's always
  // mounted at the app root, never inside another dialog. This overlay is
  // routinely nested inside an actual modal (e.g. MilestoneRowModal, itself
  // a useModalA11y dialog); two such hooks both listening on `document`
  // would double-fire on Escape — dismissing this walkthrough AND closing
  // the parent modal in one keypress. A simple focus-on-open plus its own
  // Skip/Back/Next/Finish buttons is enough for a coach-mark step.
  useEffect(() => {
    if (dismissed || alreadySeen || !step) return;
    dialogRef.current?.focus();
  }, [dismissed, alreadySeen, step]);

  if (dismissed || alreadySeen || !userData || steps.length === 0 || !step) return null;

  const isLast = stepIndex === steps.length - 1;
  const isRtl = typeof document !== 'undefined' && document.documentElement.dir === 'rtl';

  let tooltipStyle: React.CSSProperties;
  if (rect && typeof window !== 'undefined') {
    const preferredLeft = isRtl ? rect.left - TOOLTIP_WIDTH - GAP : rect.right + GAP;
    const left = Math.min(
      Math.max(preferredLeft, VIEWPORT_MARGIN),
      window.innerWidth - TOOLTIP_WIDTH - VIEWPORT_MARGIN,
    );
    const top = Math.min(Math.max(rect.top, VIEWPORT_MARGIN), window.innerHeight - 260);
    tooltipStyle = { left, top, width: TOOLTIP_WIDTH };
  } else {
    tooltipStyle = { left: '50%', top: '50%', width: TOOLTIP_WIDTH, transform: 'translate(-50%, -50%)' };
  }

  return (
    <div className="fixed inset-0 z-[75]" role="presentation">
      {rect ? (
        <div
          className="pointer-events-none fixed rounded-lg border-2 border-primary transition-all duration-200"
          style={{
            top: rect.top - 6,
            left: rect.left - 6,
            width: rect.width + 12,
            height: rect.height + 12,
            boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.6)',
          }}
        />
      ) : (
        <div className="pointer-events-none fixed inset-0 bg-black/60" />
      )}

      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="field-guide-title"
        aria-describedby="field-guide-body"
        className="fixed rounded-[var(--radius)] border border-line bg-surface p-4 shadow-lg outline-none"
        style={tooltipStyle}
      >
        <p className="text-xs font-medium text-muted">
          {lang === 'he' ? `שדה ${stepIndex + 1} מתוך ${steps.length}` : `Field ${stepIndex + 1} of ${steps.length}`}
        </p>
        <h2 id="field-guide-title" className="mt-1 text-base font-semibold text-ink">
          {step.label[lang]}
        </h2>
        <p id="field-guide-body" className="mt-1.5 text-sm text-muted">
          {step.description[lang]}
        </p>

        <div className="mt-4 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={finish}
            className="text-sm font-medium text-muted hover:text-ink"
          >
            {lang === 'he' ? 'דלג' : 'Skip'}
          </button>
          <div className="flex items-center gap-2">
            {stepIndex > 0 && (
              <button
                type="button"
                onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
                className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-ink hover:bg-paper"
              >
                {lang === 'he' ? 'הקודם' : 'Back'}
              </button>
            )}
            <button
              type="button"
              onClick={() => (isLast ? finish() : setStepIndex((i) => i + 1))}
              className="rounded-lg bg-primary px-3.5 py-1.5 text-sm font-semibold text-primary-ink hover:bg-primary-hover"
            >
              {isLast ? (lang === 'he' ? 'סיום' : 'Finish') : lang === 'he' ? 'הבא' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
