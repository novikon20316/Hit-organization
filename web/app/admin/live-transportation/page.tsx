'use client';

// app/admin/live-transportation/page.tsx
// system_admin-only live monitoring page: how many users are active right
// now (web + mobile, via server/src/controllers/presenceController.ts's
// heartbeat), a rolling chart of that count, a breakdown of recent action
// types, and a live table of recent user actions (login/logout plus every
// existing privilege-sensitive audit event — server/src/services/auditLog.ts).
// Both data sources are read directly via Firestore client listeners
// (mobile/firestore.rules restricts both to system_admin) rather than
// polling a REST endpoint, so everything here updates instantly.

import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { useRequireRole } from '@/hooks/useRequireRole';
import { useLanguage } from '@/contexts/LanguageContext';
import type { AppRole } from '@/lib/i18n';
import { ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

const ADMIN_ROLES: AppRole[] = ['system_admin'];
// Must comfortably exceed usePresenceHeartbeat's ~25s send interval so a
// session isn't flickered "offline" between two heartbeats.
const ONLINE_WINDOW_MS = 60_000;
const TICK_MS = 5_000;
const HISTORY_WINDOW_MS = 30 * 60_000;

interface PresenceRow {
  uid: string;
  displayName: string;
  role: string;
  platform: 'web' | 'mobile';
  lastSeenMs: number | null;
}

interface AuditRow {
  id: string;
  userId: string;
  userDisplayName?: string;
  action: string;
  timestampMs: number | null;
}

export default function LiveTransportationPage() {
  const { loading: guardLoading, isAllowed } = useRequireRole(ADMIN_ROLES);
  const { lang } = useLanguage();

  const [presence, setPresence] = useState<PresenceRow[]>([]);
  const [auditRows, setAuditRows] = useState<AuditRow[]>([]);
  const [history, setHistory] = useState<Array<{ t: number; count: number }>>([]);
  const [now, setNow] = useState(() => Date.now());
  const [presenceError, setPresenceError] = useState('');
  const [auditError, setAuditError] = useState('');

  useEffect(() => {
    if (!isAllowed) return;
    const unsub = onSnapshot(
      collection(db, 'presence'),
      (snap) => {
        setPresenceError('');
        setPresence(
          snap.docs.map((d) => {
            const data = d.data() as Record<string, unknown>;
            const lastSeen = data.lastSeen as { toMillis?: () => number } | undefined;
            return {
              uid: d.id,
              displayName: (data.displayName as string) ?? '',
              role: (data.role as string) ?? '',
              platform: data.platform === 'mobile' ? 'mobile' : 'web',
              lastSeenMs: lastSeen?.toMillis ? lastSeen.toMillis() : null,
            } satisfies PresenceRow;
          })
        );
      },
      (err) => {
        // Most likely cause: the `presence` Firestore rule hasn't been
        // deployed yet (mobile/firestore.rules is edited locally but needs a
        // manual `firebase deploy --only firestore:rules`) — surface that
        // instead of leaving an uncaught console error and a silently-stuck
        // "0 active" count.
        console.error('presence listener error:', err);
        setPresenceError(lang === 'he' ? 'שגיאה בטעינת נתוני נוכחות — ייתכן שחוקי Firestore טרם פורסמו.' : 'Failed to load presence data — the Firestore rules may not be deployed yet.');
      }
    );
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `lang` is read inside the error callback only for its message text, not a dependency of the subscription itself
  }, [isAllowed]);

  useEffect(() => {
    if (!isAllowed) return;
    const q = query(collection(db, 'auditLog'), orderBy('timestamp', 'desc'), limit(100));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setAuditError('');
        setAuditRows(
          snap.docs.map((d) => {
            const data = d.data() as Record<string, unknown>;
            const ts = data.timestamp as { toMillis?: () => number } | undefined;
            return {
              id: d.id,
              userId: (data.userId as string) ?? '',
              userDisplayName: (data.userDisplayName as string) || undefined,
              action: (data.action as string) ?? '',
              timestampMs: ts?.toMillis ? ts.toMillis() : null,
            } satisfies AuditRow;
          })
        );
      },
      (err) => {
        console.error('auditLog listener error:', err);
        setAuditError(lang === 'he' ? 'שגיאה בטעינת יומן הפעולות.' : 'Failed to load the actions log.');
      }
    );
    return unsub;
  }, [isAllowed]);

  useEffect(() => {
    if (!isAllowed) return;
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, [isAllowed]);

  const onlineUsers = useMemo(
    () => presence.filter((p) => p.lastSeenMs !== null && now - (p.lastSeenMs as number) < ONLINE_WINDOW_MS),
    [presence, now]
  );

  // Sample the online count into a rolling chart series on every tick — a
  // separate effect (rather than folding into the memo above) so a sample is
  // recorded even during a quiet stretch with no presence/audit writes at all.
  useEffect(() => {
    setHistory((prev) => {
      const cutoff = now - HISTORY_WINDOW_MS;
      return [...prev, { t: now, count: onlineUsers.length }].filter((p) => p.t >= cutoff);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sample once per tick; onlineUsers is derived from the same tick via `now`
  }, [now]);

  const byPlatform = useMemo(
    () => ({
      web: onlineUsers.filter((u) => u.platform === 'web').length,
      mobile: onlineUsers.filter((u) => u.platform === 'mobile').length,
    }),
    [onlineUsers]
  );

  const actionCounts = useMemo(() => {
    const counts = new Map<string, number>();
    auditRows.forEach((r) => counts.set(r.action, (counts.get(r.action) ?? 0) + 1));
    return Array.from(counts.entries())
      .map(([action, count]) => ({ action, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [auditRows]);

  const timeFmt = (t: number) =>
    new Date(t).toLocaleTimeString(lang === 'he' ? 'he-IL' : 'en-US', { hour: '2-digit', minute: '2-digit' });

  if (guardLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper">
        <p className="text-sm text-muted">…</p>
      </div>
    );
  }

  return (
    <DashboardShell
      title={lang === 'he' ? 'תנועה חיה' : 'Live Transportation'}
      subtitle={lang === 'he' ? 'משתמשים פעילים ופעולות בזמן אמת' : 'Active users and actions in real time'}
    >
      <div className="grid gap-6">
        <section className="rounded-[var(--radius)] border border-line bg-surface p-4">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-ink">{lang === 'he' ? 'משתמשים מחוברים כעת' : 'Active now'}</h2>
            <span className="text-2xl font-bold text-primary">{onlineUsers.length}</span>
          </div>
          <p className="mt-1 text-xs text-muted">
            {lang === 'he' ? `אתר: ${byPlatform.web} · אפליקציה: ${byPlatform.mobile}` : `Web: ${byPlatform.web} · Mobile: ${byPlatform.mobile}`}
          </p>
          {presenceError && <p className="mt-2 rounded-md bg-danger-bg px-3 py-2 text-xs text-danger">{presenceError}</p>}
          <div className="mt-3 h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={history}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                <XAxis dataKey="t" tickFormatter={timeFmt} minTickGap={40} stroke="var(--muted)" fontSize={11} />
                <YAxis allowDecimals={false} width={30} stroke="var(--muted)" fontSize={11} />
                <Tooltip labelFormatter={(t) => timeFmt(t as number)} />
                <Area type="monotone" dataKey="count" stroke="var(--primary)" fill="var(--primary)" fillOpacity={0.2} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="rounded-[var(--radius)] border border-line bg-surface p-4">
          <h2 className="mb-3 text-sm font-semibold text-ink">{lang === 'he' ? 'פעולות נפוצות (100 אחרונות)' : 'Action breakdown (last 100)'}</h2>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={actionCounts} layout="vertical" margin={{ left: 16, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                <XAxis type="number" allowDecimals={false} stroke="var(--muted)" fontSize={11} />
                <YAxis type="category" dataKey="action" width={170} tick={{ fontSize: 11 }} stroke="var(--muted)" />
                <Tooltip />
                <Bar dataKey="count" fill="var(--primary)" isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="rounded-[var(--radius)] border border-line bg-surface p-4">
          <h2 className="mb-3 text-sm font-semibold text-ink">{lang === 'he' ? 'פעולות אחרונות' : 'Recent actions'}</h2>
          {auditError && <p className="mb-3 rounded-md bg-danger-bg px-3 py-2 text-xs text-danger">{auditError}</p>}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th className="py-2 pr-3">{lang === 'he' ? 'משתמש' : 'User'}</th>
                  <th className="py-2 pr-3">{lang === 'he' ? 'פעולה' : 'Action'}</th>
                  <th className="py-2 pr-3">{lang === 'he' ? 'תאריך' : 'Date'}</th>
                  <th className="py-2">{lang === 'he' ? 'שעה' : 'Time'}</th>
                </tr>
              </thead>
              <tbody>
                {auditRows.map((row) => {
                  const d = row.timestampMs ? new Date(row.timestampMs) : null;
                  return (
                    <tr key={row.id} className="border-b border-line/50">
                      <td className="py-2 pr-3 text-ink">{row.userDisplayName || row.userId}</td>
                      <td className="py-2 pr-3 text-ink">{row.action}</td>
                      <td className="py-2 pr-3 text-muted">{d ? d.toLocaleDateString() : '—'}</td>
                      <td className="py-2 text-muted">{d ? d.toLocaleTimeString() : '—'}</td>
                    </tr>
                  );
                })}
                {auditRows.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-sm text-muted">
                      {lang === 'he' ? 'אין פעולות עדיין' : 'No actions yet'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </DashboardShell>
  );
}
