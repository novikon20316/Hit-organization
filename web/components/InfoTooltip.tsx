'use client';

// components/InfoTooltip.tsx
// Small click-to-reveal (i) info button dropped next to a field's label to
// explain that field's purpose. Self-contained — takes plain {he, en} text,
// not coupled to the first-visit walkthrough system in
// components/guidance/FieldGuideOverlay.tsx (a screen's field-guide content
// file is the single source of truth for both, but this component itself
// doesn't know that). Positioning math (viewport clamp + RTL flip) mirrors
// components/onboarding/OnboardingTour.tsx lines 93-104, anchored on this
// button's own rect instead of a spotlighted nav item.
import { useEffect, useRef, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';

interface InfoTooltipProps {
  text: { he: string; en: string };
  /** Accessible label for the button itself, defaults to a generic
   *  "more info" — pass one when several info buttons sit close together
   *  and a screen-reader user needs to tell them apart. */
  label?: string;
}

const CARD_WIDTH = 260;
const GAP = 6;
const VIEWPORT_MARGIN = 12;

export function InfoTooltip({ text, label }: InfoTooltipProps) {
  const { lang } = useLanguage();
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState<React.CSSProperties>({});
  const btnRef = useRef<HTMLButtonElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const reposition = () => {
      const btn = btnRef.current;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      const isRtl = document.documentElement.dir === 'rtl';
      const preferredLeft = isRtl ? rect.right - CARD_WIDTH : rect.left;
      const left = Math.min(
        Math.max(preferredLeft, VIEWPORT_MARGIN),
        window.innerWidth - CARD_WIDTH - VIEWPORT_MARGIN,
      );
      const top = rect.bottom + GAP;
      setStyle({ left, top, width: CARD_WIDTH });
    };

    reposition();
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);

    const handlePointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (btnRef.current?.contains(target) || cardRef.current?.contains(target)) return;
      setOpen(false);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
        btnRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
      document.removeEventListener('mousedown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [open]);

  return (
    <span className="relative inline-flex align-middle">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={label ?? (lang === 'he' ? 'מידע נוסף' : 'More info')}
        aria-expanded={open}
        className="ms-1 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-line text-[10px] font-semibold leading-none text-muted hover:border-primary hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
      >
        i
      </button>
      {open && (
        <div
          ref={cardRef}
          role="tooltip"
          className="fixed z-[80] rounded-[var(--radius)] border border-line bg-surface p-3 text-xs leading-relaxed text-ink shadow-lg"
          style={style}
        >
          {text[lang]}
        </div>
      )}
    </span>
  );
}
