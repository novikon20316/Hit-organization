'use client';

// app/admin/live-transportation/page.tsx
// system_admin-only live monitoring page: how many users are active right
// now (web + mobile, via server/src/controllers/presenceController.ts's
// heartbeat), a rolling chart of that count, a breakdown of recent action
// types, and a live table of recent user actions (login/logout plus every
// existing privilege-sensitive audit event — server/src/services/auditLog.ts).
// All three data sources are read directly via Firestore client listeners
// (mobile/firestore.rules restricts all three to system_admin) rather than
// polling a REST endpoint, so everything here updates instantly. The
// active-count chart's history comes from a durable `presenceHistory`
// collection sampled once a minute by services/presenceHistory.ts, not from
// local component state — it keeps accumulating even with no admin page
// open, and survives reloads/logouts instead of resetting on every mount.

import { useEffect, useMemo, useState } from 'react';
import { collection, doc, getDoc, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { apiClient } from '@/lib/apiClient';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useRequireRole } from '@/hooks/useRequireRole';
import { useLanguage } from '@/contexts/LanguageContext';
import type { AppRole } from '@/lib/i18n';
import { ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

const ADMIN_ROLES: AppRole[] = ['system_admin'];
// Must comfortably exceed usePresenceHeartbeat's ~25s send interval so a
// session isn't flickered "offline" between two heartbeats.
const ONLINE_WINDOW_MS = 60_000;
const TICK_MS = 5_000;
// server/src/services/presenceHistory.ts samples once a minute — this caps
// how many samples the chart pulls (6 hours' worth), not a time window, so
// no composite Firestore index is needed for the query.
const HISTORY_SAMPLE_LIMIT = 360;
const ACTIONS_TABLE_PAGE_SIZE = 15;

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
  explanation?: string;
  timestampMs: number | null;
}

// Local (not UTC) yyyy-mm-dd, matching the value an <input type="date"> emits
// — toISOString() would shift dates near midnight for non-UTC timezones.
const toIsoDate = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export default function LiveTransportationPage() {
  const { loading: guardLoading, isAllowed } = useRequireRole(ADMIN_ROLES);
  const { lang } = useLanguage();

  const [presence, setPresence] = useState<PresenceRow[]>([]);
  const [auditRows, setAuditRows] = useState<AuditRow[]>([]);
  const [history, setHistory] = useState<Array<{ t: number; count: number }>>([]);
  const [now, setNow] = useState(() => Date.now());
  const [presenceError, setPresenceError] = useState('');
  const [auditError, setAuditError] = useState('');
  const [historyError, setHistoryError] = useState('');
  // Denormalized userDisplayName is missing on most historical audit rows
  // (only the login action ever passed it — see auditLog.ts) — resolve the
  // rest client-side against the users collection instead. Keyed by uid,
  // with '' meaning "looked up, no name found" so a lookup is never retried
  // forever on every snapshot re-fire.
  const [resolvedNames, setResolvedNames] = useState<Record<string, string>>({});

  // Recent-actions table controls — search/filter/sort/pagination all run
  // client-side over the already-loaded last-100 auditRows.
  const [tableSearch, setTableSearch] = useState('');
  const [tableActionFilter, setTableActionFilter] = useState('all');
  const [tableDateFilter, setTableDateFilter] = useState('');
  const [tableSortKey, setTableSortKey] = useState<'user' | 'action' | 'date'>('date');
  const [tableSortDir, setTableSortDir] = useState<'asc' | 'desc'>('desc');
  const [tablePage, setTablePage] = useState(1);

  // Selected-row deletion — selection persists across pages/filters (a
  // multi-page bulk pick), cleared only on a successful delete.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmAction, setConfirmAction] = useState<'selected' | 'all' | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState('');

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
              explanation: (data.explanation as string) || undefined,
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
    const missing = Array.from(new Set(
      auditRows
        .filter((r) => !r.userDisplayName && r.userId && !(r.userId in resolvedNames))
        .map((r) => r.userId)
    ));
    if (missing.length === 0) return;

    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        missing.map(async (uid) => {
          try {
            const snap = await getDoc(doc(db, 'users', uid));
            const data = snap.data() as Record<string, unknown> | undefined;
            const name = (data?.displayName as string) || (data?.displayNameHe as string) || (data?.displayNameEn as string) || '';
            return [uid, name] as const;
          } catch (err) {
            console.error(`Failed resolving display name for uid ${uid}:`, err);
            return [uid, ''] as const;
          }
        })
      );
      if (cancelled) return;
      setResolvedNames((prev) => {
        const next = { ...prev };
        entries.forEach(([uid, name]) => { next[uid] = name; });
        return next;
      });
    })();
    return () => { cancelled = true; };
  }, [auditRows, isAllowed, resolvedNames]);

  useEffect(() => {
    if (!isAllowed) return;
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, [isAllowed]);

  const onlineUsers = useMemo(
    () => presence.filter((p) => p.lastSeenMs !== null && now - (p.lastSeenMs as number) < ONLINE_WINDOW_MS),
    [presence, now]
  );

  // Chart history comes from the server-persisted `presenceHistory` samples
  // (services/presenceHistory.ts, once a minute) rather than being built up
  // locally, so it's already populated on mount and keeps growing even when
  // no admin has this page open.
  useEffect(() => {
    if (!isAllowed) return;
    const q = query(collection(db, 'presenceHistory'), orderBy('timestamp', 'desc'), limit(HISTORY_SAMPLE_LIMIT));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setHistoryError('');
        const rows = snap.docs
          .map((d) => {
            const data = d.data() as Record<string, unknown>;
            const ts = data.timestamp as { toMillis?: () => number } | undefined;
            const t = ts?.toMillis ? ts.toMillis() : null;
            return t === null ? null : { t, count: (data.count as number) ?? 0 };
          })
          .filter((r): r is { t: number; count: number } => r !== null)
          .reverse();
        setHistory(rows);
      },
      (err) => {
        console.error('presenceHistory listener error:', err);
        setHistoryError(lang === 'he' ? 'שגיאה בטעינת היסטוריית הנוכחות.' : 'Failed to load presence history.');
      }
    );
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `lang` is read inside the error callback only for its message text, not a dependency of the subscription itself
  }, [isAllowed]);

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

  const displayNameFor = (row: AuditRow) => row.userDisplayName || resolvedNames[row.userId] || row.userId;

  const distinctActions = useMemo(
    () => Array.from(new Set(auditRows.map((r) => r.action))).sort(),
    [auditRows]
  );

  const filteredActionRows = useMemo(() => {
    const q = tableSearch.trim().toLowerCase();
    return auditRows.filter((row) => {
      const d = row.timestampMs ? new Date(row.timestampMs) : null;
      const actionOk = tableActionFilter === 'all' || row.action === tableActionFilter;
      const dateOk = !tableDateFilter || (d ? toIsoDate(d) === tableDateFilter : false);
      if (!actionOk || !dateOk) return false;
      if (!q) return true;
      const dateStr = d ? d.toLocaleDateString().toLowerCase() : '';
      const timeStr = d ? d.toLocaleTimeString().toLowerCase() : '';
      return (
        displayNameFor(row).toLowerCase().includes(q) ||
        row.action.toLowerCase().includes(q) ||
        (row.explanation ?? '').toLowerCase().includes(q) ||
        dateStr.includes(q) ||
        timeStr.includes(q)
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- displayNameFor reads resolvedNames, already a dep
  }, [auditRows, tableSearch, tableActionFilter, tableDateFilter, resolvedNames]);

  const sortedActionRows = useMemo(() => {
    const rows = [...filteredActionRows];
    rows.sort((a, b) => {
      let cmp = 0;
      if (tableSortKey === 'date') cmp = (a.timestampMs ?? 0) - (b.timestampMs ?? 0);
      else if (tableSortKey === 'user') cmp = displayNameFor(a).localeCompare(displayNameFor(b));
      else cmp = a.action.localeCompare(b.action);
      return tableSortDir === 'asc' ? cmp : -cmp;
    });
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- displayNameFor reads resolvedNames, already a dep
  }, [filteredActionRows, tableSortKey, tableSortDir, resolvedNames]);

  const actionsPageCount = Math.max(1, Math.ceil(sortedActionRows.length / ACTIONS_TABLE_PAGE_SIZE));
  const clampedActionsPage = Math.min(tablePage, actionsPageCount);
  const pagedActionRows = useMemo(() => {
    const start = (clampedActionsPage - 1) * ACTIONS_TABLE_PAGE_SIZE;
    return sortedActionRows.slice(start, start + ACTIONS_TABLE_PAGE_SIZE);
  }, [sortedActionRows, clampedActionsPage]);

  useEffect(() => {
    setTablePage(1);
  }, [tableSearch, tableActionFilter, tableDateFilter, tableSortKey, tableSortDir]);

  const toggleTableSort = (key: 'user' | 'action' | 'date') => {
    if (tableSortKey === key) {
      setTableSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setTableSortKey(key);
      setTableSortDir(key === 'date' ? 'desc' : 'asc');
    }
  };

  const sortArrow = (key: 'user' | 'action' | 'date') => (tableSortKey === key ? (tableSortDir === 'asc' ? ' ▲' : ' ▼') : '');

  const toggleRowSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allOnPageSelected = pagedActionRows.length > 0 && pagedActionRows.every((r) => selectedIds.has(r.id));
  const toggleSelectAllOnPage = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) pagedActionRows.forEach((r) => next.delete(r.id));
      else pagedActionRows.forEach((r) => next.add(r.id));
      return next;
    });
  };

  const runDelete = async (payload: { ids?: string[]; all?: boolean }) => {
    setDeleteBusy(true);
    setDeleteError('');
    try {
      await apiClient.deleteAuditLogEntries(payload);
      setSelectedIds(new Set());
      setConfirmAction(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : lang === 'he' ? 'המחיקה נכשלה' : 'Failed to delete.');
    } finally {
      setDeleteBusy(false);
    }
  };

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
          {historyError && <p className="mt-2 rounded-md bg-danger-bg px-3 py-2 text-xs text-danger">{historyError}</p>}
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
          {/* Recharts isn't RTL-aware — under the page's ambient dir="rtl" the
              SVG's tick labels (always plain English action names) end up
              mispositioned relative to the bars. Forcing this chart's own
              container to dir="ltr" keeps its internal layout consistent
              regardless of the page language. */}
          <div className="h-56 w-full" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={actionCounts} layout="vertical" margin={{ top: 5, right: 24, bottom: 5, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                <XAxis type="number" allowDecimals={false} stroke="var(--muted)" fontSize={11} />
                <YAxis type="category" dataKey="action" width={180} tick={{ fontSize: 11 }} stroke="var(--muted)" />
                <Tooltip />
                <Bar dataKey="count" fill="var(--primary)" isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="rounded-[var(--radius)] border border-line bg-surface p-4">
          <h2 className="mb-3 text-sm font-semibold text-ink">{lang === 'he' ? 'פעולות אחרונות (100 אחרונות)' : 'Recent actions (last 100)'}</h2>
          {auditError && <p className="mb-3 rounded-md bg-danger-bg px-3 py-2 text-xs text-danger">{auditError}</p>}
          {deleteError && <p className="mb-3 rounded-md bg-danger-bg px-3 py-2 text-xs text-danger">{deleteError}</p>}

          <div className="mb-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={selectedIds.size === 0}
              onClick={() => setConfirmAction('selected')}
              className="rounded-md border border-danger px-3 py-1.5 text-xs font-medium text-danger disabled:border-line disabled:text-muted disabled:opacity-50"
            >
              {lang === 'he' ? `מחק נבחרים (${selectedIds.size})` : `Delete selected (${selectedIds.size})`}
            </button>
            <button
              type="button"
              onClick={() => setConfirmAction('all')}
              className="rounded-md bg-danger px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
            >
              {lang === 'he' ? 'מחק את כל היומן' : 'Erase entire log'}
            </button>
          </div>

          <div className="mb-3 flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={tableSearch}
              onChange={(e) => setTableSearch(e.target.value)}
              placeholder={lang === 'he' ? 'חפש לפי משתמש, פעולה, תאריך או שעה...' : 'Search user, action, date, or time...'}
              className="min-w-[220px] flex-1 rounded-md border border-line bg-paper px-3 py-1.5 text-xs text-ink"
            />
            <select
              value={tableActionFilter}
              onChange={(e) => setTableActionFilter(e.target.value)}
              className="rounded-md border border-line bg-paper px-2 py-1.5 text-xs text-ink"
            >
              <option value="all">{lang === 'he' ? 'כל הפעולות' : 'All actions'}</option>
              {distinctActions.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
            <input
              type="date"
              value={tableDateFilter}
              onChange={(e) => setTableDateFilter(e.target.value)}
              className="rounded-md border border-line bg-paper px-2 py-1.5 text-xs text-ink"
            />
            {(tableSearch || tableActionFilter !== 'all' || tableDateFilter) && (
              <button
                type="button"
                onClick={() => { setTableSearch(''); setTableActionFilter('all'); setTableDateFilter(''); }}
                className="rounded-md border border-line px-2 py-1.5 text-xs text-muted hover:text-ink"
              >
                {lang === 'he' ? 'נקה' : 'Clear'}
              </button>
            )}
          </div>

          {/* dir="ltr" here too — under RTL a <table> mirrors column order by
              default, but these cells stay text-left, so headers and data
              visually detached from each other. Forcing LTR keeps column
              order and text alignment consistent (Hebrew header text still
              renders correctly — Unicode bidi shaping is per-run, not
              container-direction-dependent). */}
          <div className="overflow-x-auto" dir="ltr">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th className="py-2 pr-3">
                    <input
                      type="checkbox"
                      checked={allOnPageSelected}
                      onChange={toggleSelectAllOnPage}
                      aria-label={lang === 'he' ? 'בחר הכל בעמוד' : 'Select all on page'}
                    />
                  </th>
                  <th className="cursor-pointer select-none py-2 pr-3" onClick={() => toggleTableSort('user')}>
                    {(lang === 'he' ? 'משתמש' : 'User') + sortArrow('user')}
                  </th>
                  <th className="cursor-pointer select-none py-2 pr-3" onClick={() => toggleTableSort('action')}>
                    {(lang === 'he' ? 'פעולה' : 'Action') + sortArrow('action')}
                  </th>
                  <th className="py-2 pr-3">{lang === 'he' ? 'הערה' : 'Comment'}</th>
                  <th className="cursor-pointer select-none py-2 pr-3" onClick={() => toggleTableSort('date')}>
                    {(lang === 'he' ? 'תאריך' : 'Date') + sortArrow('date')}
                  </th>
                  <th className="py-2">{lang === 'he' ? 'שעה' : 'Time'}</th>
                </tr>
              </thead>
              <tbody>
                {pagedActionRows.map((row) => {
                  const d = row.timestampMs ? new Date(row.timestampMs) : null;
                  return (
                    <tr key={row.id} className="border-b border-line/50">
                      <td className="py-2 pr-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(row.id)}
                          onChange={() => toggleRowSelected(row.id)}
                          aria-label={lang === 'he' ? 'בחר שורה' : 'Select row'}
                        />
                      </td>
                      <td className="py-2 pr-3 text-ink">{displayNameFor(row)}</td>
                      <td className="py-2 pr-3 text-ink">{row.action}</td>
                      <td className="py-2 pr-3 text-muted">{row.explanation || '—'}</td>
                      <td className="py-2 pr-3 text-muted">{d ? d.toLocaleDateString() : '—'}</td>
                      <td className="py-2 text-muted">{d ? d.toLocaleTimeString() : '—'}</td>
                    </tr>
                  );
                })}
                {sortedActionRows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-sm text-muted">
                      {lang === 'he' ? 'אין פעולות תואמות' : 'No matching actions'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {sortedActionRows.length > 0 && (
            <div className="mt-3 flex items-center justify-between text-xs text-muted">
              <span>
                {lang === 'he'
                  ? `עמוד ${clampedActionsPage} מתוך ${actionsPageCount} (${sortedActionRows.length} תוצאות)`
                  : `Page ${clampedActionsPage} of ${actionsPageCount} (${sortedActionRows.length} results)`}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={clampedActionsPage <= 1}
                  onClick={() => setTablePage((p) => Math.max(1, p - 1))}
                  className="rounded-md border border-line px-2 py-1 disabled:opacity-40"
                >
                  {lang === 'he' ? 'הקודם' : 'Prev'}
                </button>
                <button
                  type="button"
                  disabled={clampedActionsPage >= actionsPageCount}
                  onClick={() => setTablePage((p) => Math.min(actionsPageCount, p + 1))}
                  className="rounded-md border border-line px-2 py-1 disabled:opacity-40"
                >
                  {lang === 'he' ? 'הבא' : 'Next'}
                </button>
              </div>
            </div>
          )}
        </section>
      </div>

      <ConfirmDialog
        open={confirmAction === 'selected'}
        title={lang === 'he' ? 'מחיקת פעולות נבחרות' : 'Delete selected actions'}
        message={
          lang === 'he'
            ? `למחוק לצמיתות ${selectedIds.size} פעולות שנבחרו? לא ניתן לשחזר.`
            : `Permanently delete ${selectedIds.size} selected action(s)? This cannot be undone.`
        }
        confirmLabel={lang === 'he' ? 'מחק' : 'Delete'}
        cancelLabel={lang === 'he' ? 'ביטול' : 'Cancel'}
        destructive
        busy={deleteBusy}
        onConfirm={() => runDelete({ ids: Array.from(selectedIds) })}
        onCancel={() => setConfirmAction(null)}
      />
      <ConfirmDialog
        open={confirmAction === 'all'}
        title={lang === 'he' ? 'מחיקת כל יומן הפעולות' : 'Erase entire audit log'}
        message={
          lang === 'he'
            ? 'פעולה זו תמחק לצמיתות את כל רשומות יומן הפעולות במערכת, כולל רשומות שאינן מוצגות כרגע. לא ניתן לשחזר.'
            : 'This permanently deletes every audit log entry in the system, including ones not currently shown. This cannot be undone.'
        }
        confirmLabel={lang === 'he' ? 'מחק הכל' : 'Erase all'}
        cancelLabel={lang === 'he' ? 'ביטול' : 'Cancel'}
        destructive
        busy={deleteBusy}
        onConfirm={() => runDelete({ all: true })}
        onCancel={() => setConfirmAction(null)}
      />
    </DashboardShell>
  );
}
