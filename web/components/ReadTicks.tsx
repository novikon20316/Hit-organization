'use client';

// WhatsApp-style read receipt for a message the current user sent:
// one grey tick = delivered to the server, two blue ticks = the other
// participant has opened the chat since it was sent.

interface Props {
  seen: boolean;
  lang: 'he' | 'en';
  /** Colour of the single "sent" tick — defaults to the muted text colour;
   *  pass something lighter when rendered on top of a coloured bubble. */
  sentClassName?: string;
  className?: string;
}

export default function ReadTicks({ seen, lang, sentClassName = 'text-muted', className = '' }: Props) {
  const label = seen
    ? (lang === 'he' ? 'נקרא' : 'Seen')
    : (lang === 'he' ? 'נשלח' : 'Sent');
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={`inline-flex shrink-0 items-center ${seen ? 'text-[#34B7F1]' : sentClassName} ${className}`}
    >
      <svg width={seen ? 18 : 12} height="12" viewBox={seen ? '0 0 18 12' : '0 0 12 12'} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M1 6.5 4.2 9.5 11 2.5" />
        {seen && <path d="M7.5 9 8 9.5 15 2.5" />}
      </svg>
    </span>
  );
}
