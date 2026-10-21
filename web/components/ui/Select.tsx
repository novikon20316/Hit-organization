'use client';

// components/ui/Select.tsx
// Drop-in replacement for <select> (same props) that never makes the user
// pick the obvious: when exactly ONE real choice is left — ignoring the
// empty-value placeholder/"all" entry and disabled entries — it selects that
// choice itself (firing the caller's onChange like a real pick) and locks the
// field. E.g. picking the Data Science faculty leaves one major and one
// degree level, so both fill in on their own.
//
// Pass autoPick={false} where the empty entry is a real choice of its own
// ("— none —", "not set") rather than a placeholder or an "all" wildcard
// that means the same thing as the single remaining option.

import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type SelectHTMLAttributes } from 'react';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  autoPick?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { autoPick = true, disabled, className, children, ...rest },
  ref
) {
  const innerRef = useRef<HTMLSelectElement>(null);
  useImperativeHandle(ref, () => innerRef.current as HTMLSelectElement);
  const [onlyChoice, setOnlyChoice] = useState<string | null>(null);
  // Picked once per distinct choice — a caller that ignores the change
  // must not be re-sent it on every render.
  const autoPicked = useRef<string | null>(null);

  // No dependency list on purpose: options are children and can change on
  // any render (async loads, a parent field narrowing them). setOnlyChoice
  // with an unchanged value bails out, so this settles after one pass.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately runs every render, see above
  useEffect(() => {
    const el = innerRef.current;
    let only: string | null = null;
    if (el && autoPick && !disabled && !el.multiple) {
      const choices = Array.from(el.options).filter((o) => o.value !== '' && !o.disabled);
      if (choices.length === 1) only = choices[0].value;
    }
    setOnlyChoice(only);
    if (el && only !== null && el.value !== only && autoPicked.current !== only) {
      autoPicked.current = only;
      el.value = only;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (only === null) autoPicked.current = null;
  });

  return (
    <select
      ref={innerRef}
      disabled={disabled || onlyChoice !== null}
      className={`${className ?? ''} disabled:cursor-not-allowed`}
      {...rest}
    >
      {children}
    </select>
  );
});
