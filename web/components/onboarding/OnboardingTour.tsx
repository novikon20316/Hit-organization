'use client';

// components/onboarding/OnboardingTour.tsx
// One-time, first-login "here's every tab" walkthrough — mounted by
// SidebarShell for every non-system_admin role. Spotlights each nav item in
// turn (via its [data-tour-id], set on the <Link> in SidebarShell) rather
// than navigating anywhere, so it never disturbs whatever page the user
// actually landed on. Step content comes straight from each role's own
// navSections.ts (SidebarNavItem.label/description) — nothing duplicated.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import { useModalA11y } from '@/hooks/useModalA11y';
import type { SidebarSection } from '@/components/dashboard/SidebarShell';

interface OnboardingTourProps {
  sections: SidebarSection[];
  quickActions?: SidebarSection;
}

interface TourStep {
  key: string;
  label: { he: string; en: string };
  description: { he: string; en: string };
}

const TOOLTIP_WIDTH = 300;
const GAP = 16;
const VIEWPORT_MARGIN = 16;

export function OnboardingTour({ sections, quickActions }: OnboardingTourProps) {
  const { lang } = useLanguage();
  const dialogRef = useRef<HTMLDivElement>(null);

  const steps: TourStep[] = [...sections, ...(quickActions ? [quickActions] : [])]
    .flatMap((section) => section.items)
    .filter((item) => !!item.description)
    .map((item) => ({ key: item.key, label: item.label, description: item.description! }));

  const [stepIndex, setStepIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const step = steps[stepIndex];
  // `steps` (and therefore `step`) is a fresh array/object on every render —
  // sections/quickActions often come from a per-render-rebuilt function
  // (e.g. buildCoordinatorNavSections) upstream, so object identity can't be
  // trusted here. Depending on the effect below on this primitive instead of
  // on `step` itself is what keeps it from re-running (and re-measuring, and
  // re-rendering) on every single render — using `step` directly caused an
  // infinite update loop.
  const stepKey = step?.key;

  const finish = useCallback(() => {
    setDismissed(true);
    // Best-effort — even if this fails, we don't want to trap the user in
    // an unresponsive tour; it'll simply reappear next login, which is the
    // same tolerable fallback as a lost network request anywhere else here.
    apiClient.completeOnboardingTour().catch(() => {});
  }, []);

  const measure = useCallback(() => {
    if (!stepKey) return;
    const el = document.querySelector(`[data-tour-id="${stepKey}"]`);
    setRect(el ? el.getBoundingClientRect() : null);
  }, [stepKey]);

  useEffect(() => {
    if (dismissed || !stepKey) return;
    const el = document.querySelector(`[data-tour-id="${stepKey}"]`);
    el?.scrollIntoView({ block: 'nearest' });
    measure();
    // Re-measure once more after scrollIntoView's (possibly smooth) motion
    // settles, since a mid-scroll rect would otherwise stick around briefly.
    const settleTimer = window.setTimeout(measure, 300);
    window.addEventListener('resize', measure);
    const navEl = document.querySelector('nav[aria-label]');
    navEl?.addEventListener('scroll', measure);
    return () => {
      window.clearTimeout(settleTimer);
      window.removeEventListener('resize', measure);
      navEl?.removeEventListener('scroll', measure);
    };
  }, [stepKey, dismissed, measure]);

  useModalA11y(dialogRef, !dismissed && steps.length > 0, finish);

  if (dismissed || steps.length === 0 || !step) return null;

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
    <div className="fixed inset-0 z-[70]" role="presentation">
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
        aria-labelledby="onboarding-tour-title"
        aria-describedby="onboarding-tour-body"
        className="fixed rounded-[var(--radius)] border border-line bg-surface p-4 shadow-lg outline-none"
        style={tooltipStyle}
      >
        <p className="text-xs font-medium text-muted">
          {lang === 'he' ? `שלב ${stepIndex + 1} מתוך ${steps.length}` : `Step ${stepIndex + 1} of ${steps.length}`}
        </p>
        <h2 id="onboarding-tour-title" className="mt-1 text-base font-semibold text-ink">
          {step.label[lang]}
        </h2>
        <p id="onboarding-tour-body" className="mt-1.5 text-sm text-muted">
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
