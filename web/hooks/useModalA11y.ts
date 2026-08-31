'use client';

// hooks/useModalA11y.ts
// Escape-to-close, a focus trap, and focus restore for a dialog/modal —
// the three things every ad-hoc `fixed inset-0` overlay in this app was
// missing (see the accessibility audit). Attach `containerRef` to the
// dialog's own role="dialog" element and give that element `tabIndex={-1}`
// so it's a valid focus target when the dialog has no focusable children yet.
import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useModalA11y(
  containerRef: RefObject<HTMLElement | null>,
  open: boolean,
  onClose: () => void,
) {
  // Avoids retriggering the open-focus effect when callers pass an inline
  // arrow function for onClose (the overwhelmingly common case) — the ref
  // always calls the latest onClose without needing it in the deps array.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const container = containerRef.current;
    const initialFocusable = container?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    (initialFocusable ?? container)?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !container) return;

      const items = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (el) => el.offsetParent !== null,
      );
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    // Capture phase so a dialog-internal Escape/Tab handler never has to
    // coordinate with this one, and so it fires even if focus is inside an
    // iframe-free nested widget that would otherwise swallow the event.
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      previouslyFocused?.focus?.();
    };
  }, [open, containerRef]);
}
