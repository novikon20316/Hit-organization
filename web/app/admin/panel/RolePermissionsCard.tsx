'use client';

// app/admin/panel/RolePermissionsCard.tsx
// Right-side panel on the Overview tab, styled after the Stitch "Admin User
// Management" design's Role Permissions + Recent Security Events cards.
// Deliberately reuses data already loaded by page.tsx (no new fetches):
// role distribution comes from the same `users` list the stat tiles use,
// and "Recent Security Events" is the same `lockedUsers` lockout list the
// Users tab already shows — this card just gives it a glanceable home on
// Overview too, with a link into the full live audit log.

import Link from 'next/link';
import type { AdminUserRecord } from './types';
import type { AppRole } from '@/lib/i18n';

interface RolePermissionsCardProps {
  users: AdminUserRecord[];
  lockedUsers: Array<{ code: string; uid: string; email: string; displayName: string; ip: string; location: string; createdAt: string }>;
  lang: 'he' | 'en';
}

// A coarse, highest-to-lowest access ordering — real roles from lib/roles.ts,
// grouped the way the Stitch design groups them (System Admin, delegated
// admin tiers, Coordinator, everyone else) rather than one bar per role.
const TIERS: { key: string; label: { he: string; en: string }; roles: AppRole[] }[] = [
  { key: 'system_admin', label: { he: 'מנהל מערכת', en: 'System Admin' }, roles: ['system_admin'] },
  {
    key: 'delegated_admin',
    label: { he: 'הנהלה מואצלת', en: 'Delegated Admin' },
    roles: ['faculty_admin', 'program_head', 'grad_school_head', 'administrative_secretary'],
  },
  { key: 'coordinator', label: { he: 'רכזים', en: 'Coordinators' }, roles: ['coordinator'] },
  {
    key: 'staff',
    label: { he: 'סגל אקדמי', en: 'Academic Staff' },
    roles: ['supervisor', 'secondary_supervisor', 'internal_examiner'],
  },
];

export function RolePermissionsCard({ users, lockedUsers, lang }: RolePermissionsCardProps) {
  const total = Math.max(users.length, 1);
  const roleOf = (u: AdminUserRecord) => new Set([u.role, ...(u.roles ?? [])]);

  return (
    <div className="flex flex-col gap-4">
      <div className="relative overflow-hidden rounded-admin-lg border border-admin-outline-variant bg-admin-surface p-4 shadow-sm">
        <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-admin-primary/5 blur-2xl" />
        <h3 className="relative z-10 mb-4 flex items-center gap-2 text-base font-semibold text-admin-on-surface">
          🛡️ {lang === 'he' ? 'הרשאות לפי תפקיד' : 'Role Permissions'}
        </h3>
        <div className="relative z-10 space-y-4">
          {TIERS.map((tier) => {
            const count = users.filter((u) => tier.roles.some((r) => roleOf(u).has(r))).length;
            const pct = Math.round((count / total) * 100);
            return (
              <div key={tier.key}>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-[13px] font-medium text-admin-on-surface">{tier.label[lang]}</span>
                  <span className="text-xs text-admin-on-surface-variant">{count}</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-admin-surface-variant">
                  <div className="h-full rounded-full bg-admin-primary" style={{ width: `${Math.max(pct, count > 0 ? 4 : 0)}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-admin-lg border border-admin-outline-variant bg-admin-surface p-4">
        <h3 className="mb-3 border-b border-admin-outline-variant pb-2 text-xs font-semibold uppercase tracking-wider text-admin-on-surface-variant">
          {lang === 'he' ? 'אירועי אבטחה אחרונים' : 'Recent Security Events'}
        </h3>
        {lockedUsers.length === 0 ? (
          <p className="text-[13px] text-admin-on-surface-variant">
            {lang === 'he' ? 'אין חשבונות נעולים כרגע' : 'No locked accounts right now'}
          </p>
        ) : (
          <ul className="space-y-3">
            {lockedUsers.slice(0, 3).map((l) => (
              <li key={l.code} className="flex items-start gap-3">
                <span className="mt-0.5 text-admin-error">⚠️</span>
                <div className="min-w-0">
                  <p className="truncate text-[13px] text-admin-on-surface">{l.displayName || l.email}</p>
                  <p className="truncate text-[11px] text-admin-on-surface-variant">
                    {l.ip} • {new Date(l.createdAt).toLocaleTimeString(lang === 'he' ? 'he-IL' : 'en-US', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
        <Link
          href="/admin/live-transportation"
          className="mt-4 flex items-center justify-center gap-1 text-center text-xs font-medium text-admin-on-surface-variant hover:text-admin-primary"
        >
          {lang === 'he' ? 'צפייה ביומן המלא' : 'View Full Audit Log'}
        </Link>
      </div>
    </div>
  );
}
