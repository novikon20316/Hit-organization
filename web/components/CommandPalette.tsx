'use client';

// components/CommandPalette.tsx
// Ctrl+K / ⌘K search, mounted once by DashboardShell. Screens come from the
// user's own sidebar menu (lib/roleChrome.ts) — so nothing outside their
// menu ever appears; projects and students come from GET /api/search, which
// only returns what the caller can already open (see the server's
// searchController.ts for the exact rules). Links go to the same pages the
// rest of the app uses, so each destination still runs its own checks.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useModalA11y } from '@/hooks/useModalA11y';
import { apiClient } from '@/lib/apiClient';
import { getChromeForRole } from '@/lib/roleChrome';
import type { AppRole } from '@/lib/roles';

interface Result {
  key: string;
  group: 'screens' | 'projects' | 'students';
  icon: string;
  label: string;
  sub?: string;
  href: string;
}

const RECORD_BASE: Partial<Record<AppRole, string>> = {
  coordinator: '/coordinator/records',
  administrative_secretary: '/administrative_coordinator/records',
  faculty_admin: '/faculty_admin/records',
  program_head: '/program_head/records',
  grad_school_head: '/grad_school_head/records',
  dean: '/dean/records',
  school_head: '/school_head/records',
};

/** Where a project result opens, for the role the user is viewing as. */
function projectHref(role: AppRole | undefined, p: { id: string; supervisorId: string | null }): string | null {
  if (role === 'system_admin') return `/admin/projects/${p.id}/milestones`;
  if (role === 'supervisor' || role === 'secondary_supervisor') return `/supervisor/records/${p.id}`;
  const base = role ? RECORD_BASE[role] : undefined;
  return base && p.supervisorId ? `${base}/${p.supervisorId}/${p.id}` : null;
}

/** Where a student result opens — the existing student page, or the
 *  role's own students list when it has no per-student page. */
function studentHref(role: AppRole | undefined, id: string): string | null {
  if (role === 'school_head') return '/school_head/dashboard?tab=students';
  if (role === 'administrative_secretary' || role === 'system_admin' || role === 'faculty_admin' || role === 'grad_school_head') {
    return `/administrative_coordinator/dashboard/students/${id}`;
  }
  return null;
}

const normalize = (s: string) => s.toLocaleLowerCase().normalize('NFKC');

export function CommandPalette() {
  const router = useRouter();
  const { activeRole, roles } = useAuth();
  const { lang } = useLanguage();
  const he = lang === 'he';
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [remote, setRemote] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => { setOpen(false); setQuery(''); setRemote([]); setActive(0); }, []);
  useModalA11y(dialogRef, open, close);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Every screen in the user's own menu, minus "switch role" entries
  // (those change state, they aren't places).
  const screens = useMemo<Result[]>(() => {
    const chrome = getChromeForRole(activeRole, roles);
    if (!chrome) return [];
    const sections = [...chrome.sections, ...(chrome.quickActions ? [chrome.quickActions] : [])];
    const empty = new URLSearchParams();
    const seen = new Set<string>();
    return sections.flatMap((section) => section.items
      .filter((item) => !item.onSelect)
      .map((item) => ({
        key: `screen-${item.key}`,
        group: 'screens' as const,
        icon: item.icon,
        label: item.label[lang],
        sub: section.title[lang],
        href: typeof item.href === 'function' ? item.href(empty) : item.href,
      }))
      .filter((r) => (seen.has(r.href) ? false : (seen.add(r.href), true))));
  }, [activeRole, roles, lang]);

  useEffect(() => {
    const q = query.trim();
    if (!open || q.length < 2) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoading(true);
      apiClient.search(q)
        .then((res) => {
          if (cancelled) return;
          const projects = res.projects.flatMap((p): Result[] => {
            const href = projectHref(activeRole, p);
            return href ? [{ key: `project-${p.id}`, group: 'projects', icon: '📁', label: (he ? p.titleHe : p.titleEn) || p.titleHe || p.titleEn, sub: p.major ?? undefined, href }] : [];
          });
          const students = res.students.flatMap((s): Result[] => {
            const href = studentHref(activeRole, s.id);
            return href ? [{ key: `student-${s.id}`, group: 'students', icon: '🎓', label: s.displayName, sub: s.major ?? undefined, href }] : [];
          });
          setRemote([...projects, ...students]);
        })
        .catch(() => { if (!cancelled) setRemote([]); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 250);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [query, open, activeRole, he]);

  const q = normalize(query.trim());
  const screenHits = q ? screens.filter((s) => normalize(s.label).includes(q) || normalize(s.sub ?? '').includes(q)) : screens;
  const results = [...screenHits.slice(0, 8), ...(query.trim().length >= 2 ? remote : [])];
  const activeIndex = Math.min(active, Math.max(results.length - 1, 0));

  const go = (r: Result) => {
    close();
    router.push(r.href);
  };

  const onInputKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && results[activeIndex]) { e.preventDefault(); go(results[activeIndex]); }
  };

  const GROUP_LABEL: Record<Result['group'], string> = {
    screens: he ? 'מסכים' : 'Screens',
    projects: he ? 'פרויקטים' : 'Projects',
    students: he ? 'סטודנטים' : 'Students',
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-lg border border-line px-2.5 py-1.5 text-xs text-muted hover:border-primary hover:text-primary"
        aria-label={he ? 'חיפוש (Ctrl+K)' : 'Search (Ctrl+K)'}
      >
        🔍 <span className="hidden sm:inline">{he ? 'חיפוש' : 'Search'}</span>
        <kbd className="hidden rounded border border-line px-1 text-[10px] sm:inline" dir="ltr">Ctrl K</kbd>
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 p-4 pt-[12vh]" onClick={close}>
          <div
            ref={dialogRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label={he ? 'חיפוש' : 'Search'}
            className="w-full max-w-lg overflow-hidden rounded-[var(--radius)] border border-line bg-surface shadow-xl outline-none"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              autoFocus
              value={query}
              onChange={(e) => { setQuery(e.target.value); setActive(0); }}
              onKeyDown={onInputKey}
              placeholder={he ? 'חיפוש מסך, פרויקט או סטודנט…' : 'Search screens, projects or students…'}
              aria-label={he ? 'חיפוש' : 'Search'}
              role="combobox"
              aria-expanded={results.length > 0}
              aria-controls="command-palette-results"
              aria-activedescendant={results[activeIndex] ? `cp-${results[activeIndex].key}` : undefined}
              maxLength={60}
              className="w-full border-b border-line bg-surface px-4 py-3 text-sm text-ink outline-none placeholder:text-muted"
            />
            <ul id="command-palette-results" role="listbox" className="max-h-[50vh] overflow-y-auto py-1">
              {results.length === 0 && (
                <li className="px-4 py-3 text-sm text-muted">
                  {loading ? (he ? 'מחפש…' : 'Searching…') : (he ? 'לא נמצאו תוצאות' : 'No results')}
                </li>
              )}
              {results.map((r, i) => (
                <li key={r.key} id={`cp-${r.key}`} role="option" aria-selected={i === activeIndex}>
                  {(i === 0 || results[i - 1]!.group !== r.group) && (
                    <p className="px-4 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted">{GROUP_LABEL[r.group]}</p>
                  )}
                  <button
                    type="button"
                    onClick={() => go(r)}
                    onMouseEnter={() => setActive(i)}
                    className={`flex w-full items-center gap-3 px-4 py-2 text-start text-sm ${i === activeIndex ? 'bg-paper text-primary' : 'text-ink'}`}
                    tabIndex={-1}
                  >
                    <span aria-hidden="true">{r.icon}</span>
                    <span className="min-w-0 flex-1 truncate">{r.label}</span>
                    {r.sub && <span className="shrink-0 truncate text-xs text-muted">{r.sub}</span>}
                  </button>
                </li>
              ))}
              {loading && results.length > 0 && <li className="px-4 py-2 text-xs text-muted">{he ? 'מחפש…' : 'Searching…'}</li>}
            </ul>
            <p className="border-t border-line px-4 py-2 text-[11px] text-muted">
              {he ? '↑↓ לבחירה · Enter לפתיחה · Esc לסגירה' : '↑↓ to choose · Enter to open · Esc to close'}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
