'use client';

// components/dashboard/ThesisExamAlert.tsx
// Strip under the header of every signed-in page (DashboardShell) while a
// thesis exam step is waiting on this user — picking the 5 dates, approving
// the nomination or the date, filling the exam form. The sidebar link alone
// was easy to miss, and these steps hold up the whole exam (one person not
// picking blocks the date matching). Not dismissable: it goes away by itself
// once the step is done (NotificationsContext refetches on every new
// notification). Hidden on /thesis-exam itself, where the steps are.

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLanguage } from '@/contexts/LanguageContext';
import { useNotifications } from '@/contexts/NotificationsContext';
import { formatTaskDeadline, thesisExamTaskLabel } from '@/lib/thesisExamTasks';

export function ThesisExamAlert() {
  const { thesisExamTasks: tasks } = useNotifications();
  const { lang } = useLanguage();
  const pathname = usePathname();
  const he = lang === 'he';
  if (tasks.length === 0 || pathname?.startsWith('/thesis-exam')) return null;

  return (
    <div role="alert" className="border-b border-accent/40 bg-accent/15">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-2.5 sm:px-6">
        <div className="grid gap-0.5">
          {tasks.map((t) => (
            <p key={`${t.milestoneId}-${t.kind}`} className="text-sm text-ink">
              🎓 <span className="font-semibold">{he ? 'בחינת תזה' : 'Thesis exam'}</span>
              {t.studentNames.length > 0 ? ` — ${t.studentNames.join(', ')}` : ''}
              {': '}
              <span className="font-semibold">{thesisExamTaskLabel(t.kind, lang)}</span>
              {t.deadline ? (he ? ` עד ${formatTaskDeadline(t.deadline, lang)}` : ` by ${formatTaskDeadline(t.deadline, lang)}`) : ''}
            </p>
          ))}
        </div>
        <Link
          href="/thesis-exam"
          className="shrink-0 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-ink hover:opacity-90"
        >
          {he ? 'לביצוע עכשיו' : 'Do it now'}
        </Link>
      </div>
    </div>
  );
}
