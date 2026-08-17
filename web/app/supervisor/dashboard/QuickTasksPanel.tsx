'use client';

// app/supervisor/dashboard/QuickTasksPanel.tsx
// Read-only "what needs my attention" summary — Academic Precision's quick
// tasks panel, built from data already on the page (no new API calls).
// Surfaces the soonest project deadlines first, then the oldest pending
// applications, capped at 3 items total.

import { useLanguage } from '@/contexts/LanguageContext';
import type { MyProject, Application } from './types';

const URGENCY_ICON: Record<'red' | 'orange', string> = { red: '🔴', orange: '🟠' };
const URGENCY_TEXT: Record<'red' | 'orange', string> = { red: '#a8433a', orange: '#b8862e' };

function toMs(v: string | { seconds: number } | null): number {
  if (!v) return 0;
  return typeof v === 'object' ? v.seconds * 1000 : new Date(v).getTime();
}

interface QuickTasksPanelProps {
  myProjects: MyProject[];
  applications: Application[];
}

export function QuickTasksPanel({ myProjects, applications }: QuickTasksPanelProps) {
  const { lang } = useLanguage();

  const urgentProjects = myProjects
    .filter((p) => p.currentMilestone?.urgency === 'red' || p.currentMilestone?.urgency === 'orange')
    .sort((a, b) => (a.currentMilestone!.daysLeft ?? 0) - (b.currentMilestone!.daysLeft ?? 0));

  const pendingApps = applications
    .filter((a) => a.status === 'applied')
    .sort((a, b) => toMs(a.submittedAt) - toMs(b.submittedAt));

  const items = [
    ...urgentProjects.map((p) => {
      const urgency = p.currentMilestone!.urgency as 'red' | 'orange';
      const daysLeft = p.currentMilestone!.daysLeft;
      return {
        key: `p-${p.id}`,
        icon: URGENCY_ICON[urgency],
        color: URGENCY_TEXT[urgency],
        label: lang === 'he' ? p.currentMilestone!.nameHe : p.currentMilestone!.nameEn,
        title: lang === 'he' ? p.titleHe : p.titleEn,
        sub:
          daysLeft === null
            ? ''
            : daysLeft < 0
              ? lang === 'he'
                ? `באיחור של ${Math.abs(daysLeft)} ימים`
                : `${Math.abs(daysLeft)} days overdue`
              : lang === 'he'
                ? `${daysLeft} ימים נותרו`
                : `${daysLeft} days left`,
      };
    }),
    ...pendingApps.map((a) => ({
      key: `a-${a.id}`,
      icon: '📨',
      color: '#505f76',
      label: lang === 'he' ? 'מועמדות ממתינה' : 'New Applicant',
      title: a.studentName || (lang === 'he' ? 'שם לא זמין' : 'Name unavailable'),
      sub: lang === 'he' ? a.projectTitleHe : a.projectTitleEn,
    })),
  ].slice(0, 3);

  return (
    <div className="rounded-[8px] border border-[#c5c5d3] bg-white p-4">
      <h4 className="mb-3 border-b border-[#c5c5d3] pb-2 text-sm font-semibold text-[#1a1b21]">
        {lang === 'he' ? 'משימות מהירות' : 'Quick Tasks'}
      </h4>
      {items.length === 0 ? (
        <p className="text-xs text-[#444651]">{lang === 'he' ? 'אין משימות דחופות כרגע' : 'Nothing urgent right now'}</p>
      ) : (
        <div className="grid gap-3">
          {items.map((item, i) => (
            <div key={item.key} className={i > 0 ? 'border-t border-dashed border-[#c5c5d3] pt-3' : ''}>
              <div className="flex items-start gap-2">
                <span className="mt-0.5">{item.icon}</span>
                <div className="min-w-0">
                  <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide" style={{ color: item.color }}>
                    {item.label}
                  </p>
                  <p className="truncate text-sm font-medium leading-tight text-[#1a1b21]">{item.title}</p>
                  {item.sub && <p className="truncate text-xs leading-tight text-[#444651]">{item.sub}</p>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
