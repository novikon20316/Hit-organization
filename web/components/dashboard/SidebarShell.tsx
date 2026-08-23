'use client';

// components/dashboard/SidebarShell.tsx
// The one reusable, permanent sidebar-nav + content-wrapper shared by every
// role's /<role>/layout.tsx. Started as app/admin/AdminSidebarNav.tsx
// (system_admin's Stitch-derived sidebar) — generalized so every other
// role can reuse it too, each with their own migrated DashboardShell
// `actions` content and their own color theme.
//
// Fixed width and position at all times — the only thing that moves it is
// <html dir> (RTL for Hebrew, LTR for English, see LanguageContext), which
// flexbox uses to place it on the trailing/leading side automatically.
//
// Two theme modes:
//  - 'tokens' (system_admin only): keeps using the existing hand-tuned
//    --admin-* Tailwind classes, pixel-matched to the approved Stitch
//    mockup — untouched by this refactor.
//  - 'accent' (every other role): every role has exactly one existing
//    accent hex (lib/facultyColors.ts's getRoleAccent) and no full color
//    system, so the sidebar's dark background/active/text tones are
//    derived from that single hex at render time (lib/colorTones.ts) —
//    gives each role a visually distinct sidebar with no new design assets
//    per role, and correctly differs for supervisor vs. secondary_supervisor
//    (same route, different accent) since it reads the signed-in user's
//    own activeRole rather than taking a hardcoded prop.

import { Suspense, useState, type CSSProperties, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { getRoleAccent } from '@/lib/facultyColors';
import { deriveSidebarTones } from '@/lib/colorTones';

export interface SidebarNavItem {
  key: string;
  icon: string;
  /** A function is used when the destination needs to reflect the current
   *  URL — e.g. a modal-opening quick action that should preserve
   *  whatever `?tab=` is already open, so closing it doesn't bounce the
   *  user back to the default tab. */
  href: string | ((searchParams: URLSearchParams) => string);
  label: { he: string; en: string };
  isActive: (pathname: string, searchParams: URLSearchParams) => boolean;
}

export interface SidebarSection {
  title: { he: string; en: string };
  items: SidebarNavItem[];
}

export type SidebarTheme = { mode: 'tokens'; tokenPrefix: 'admin' } | { mode: 'accent' };

interface SidebarShellProps {
  brand: { name: string; subtitle: { he: string; en: string } };
  sections: SidebarSection[];
  quickActions?: SidebarSection;
  theme: SidebarTheme;
  children: ReactNode;
}

type ThemeClasses = Record<'nav' | 'brand' | 'subtitle' | 'avatar' | 'sectionLabel' | 'itemActive' | 'itemInactive' | 'divider', string>;

// Isolated in its own component (rather than called directly in
// SidebarShell) because useSearchParams() forces whatever calls it into a
// Suspense boundary during prerendering (Next.js requirement) — this way
// every page under every role's layout gets that boundary for free instead
// of each page having to wrap itself.
function SidebarNavSections({
  sections,
  quickActions,
  cls,
  lang,
  onNavigate,
}: {
  sections: SidebarSection[];
  quickActions?: SidebarSection;
  cls: ThemeClasses;
  lang: 'he' | 'en';
  /** Closes the mobile drawer (a no-op at lg+, where the sidebar is always
   *  visible anyway) — without this, picking a link on a phone would leave
   *  the drawer covering the very page it just navigated to. */
  onNavigate: () => void;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const resolveHref = (href: SidebarNavItem['href']) => (typeof href === 'function' ? href(searchParams) : href);

  const renderSection = (section: SidebarSection) => (
    <div key={section.title.en} className="mb-4 px-3">
      <p className={`mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider ${cls.sectionLabel}`}>{section.title[lang]}</p>
      <ul className="flex flex-col gap-1">
        {section.items.map((item) => {
          const active = item.isActive(pathname, searchParams);
          return (
            <li key={item.key}>
              <Link
                href={resolveHref(item.href)}
                onClick={onNavigate}
                className={`flex items-center gap-3 rounded-admin px-3 py-2 text-sm transition-colors ${
                  active ? `border-e-4 font-bold ${cls.itemActive}` : cls.itemInactive
                }`}
              >
                <span className="text-base leading-none">{item.icon}</span>
                {item.label[lang]}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );

  return (
    <>
      {sections.map((section) => renderSection(section))}
      {quickActions && renderSection(quickActions)}
    </>
  );
}

export function SidebarShell({ brand, sections, quickActions, theme, children }: SidebarShellProps) {
  const router = useRouter();
  const { lang, t, toggleLang } = useLanguage();
  const { userData, activeRole, logout } = useAuth();
  // Below `lg` the sidebar has no other way to appear at all (see the nav's
  // own className below) — this is the only thing that makes it reachable
  // on a phone or a narrowed browser window, on every tab, not just a
  // role's own home page.
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    router.replace('/login');
  };

  const tones = theme.mode === 'accent' ? deriveSidebarTones(getRoleAccent(activeRole)) : null;
  const accentStyle: CSSProperties | undefined = tones
    ? ({
        '--sb-bg': tones.bg,
        '--sb-container': tones.container,
        '--sb-fg-muted': tones.fgMuted,
        '--sb-fg-active': tones.fgActive,
        '--sb-accent': tones.accentBright,
      } as CSSProperties)
    : undefined;

  const cls =
    theme.mode === 'tokens'
      ? {
          nav: 'bg-admin-tertiary border-admin-outline-variant',
          brand: 'text-admin-primary-fixed',
          subtitle: 'text-admin-tertiary-fixed-dim',
          avatar: 'bg-admin-tertiary-container text-admin-on-tertiary-container',
          sectionLabel: 'text-admin-tertiary-fixed-dim/70',
          itemActive: 'border-admin-primary-fixed bg-admin-tertiary-container text-admin-primary-fixed',
          itemInactive: 'text-admin-tertiary-fixed-dim hover:bg-admin-tertiary-container/60 hover:text-admin-on-tertiary-container',
          divider: 'border-admin-tertiary-fixed-dim/20',
        }
      : {
          nav: 'bg-[var(--sb-bg)] border-[var(--sb-fg-muted)]/20',
          brand: 'text-[var(--sb-fg-active)]',
          subtitle: 'text-[var(--sb-fg-muted)]',
          avatar: 'bg-[var(--sb-container)] text-[var(--sb-fg-active)]',
          sectionLabel: 'text-[var(--sb-fg-muted)]/70',
          itemActive: 'border-[var(--sb-accent)] bg-[var(--sb-container)] text-[var(--sb-fg-active)]',
          itemInactive: 'text-[var(--sb-fg-muted)] hover:bg-[var(--sb-container)]/60 hover:text-[var(--sb-fg-active)]',
          divider: 'border-[var(--sb-fg-muted)]/20',
        };

  const initial = (userData?.displayName || '?').charAt(0).toUpperCase();

  return (
    <div className="flex min-h-screen bg-paper">
      {/* Mobile-only menu toggle — the sidebar itself is `hidden` below
       *  `lg` (see the nav's className), so without this button there is no
       *  way at all to reach the menu on a phone or a narrowed window, on
       *  any tab. Fixed and high z-index so it stays reachable whether the
       *  drawer is open or closed. */}
      <button
        type="button"
        onClick={() => setMobileOpen((v) => !v)}
        aria-label={lang === 'he' ? (mobileOpen ? 'סגירת תפריט' : 'פתיחת תפריט') : mobileOpen ? 'Close menu' : 'Open menu'}
        className="fixed start-3 top-3 z-50 flex h-10 w-10 items-center justify-center rounded-full border border-line bg-surface text-lg text-ink shadow-sm lg:hidden"
      >
        {mobileOpen ? '✕' : '☰'}
      </button>

      {mobileOpen && (
        <div
          aria-hidden="true"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
        />
      )}

      <nav
        aria-label={lang === 'he' ? 'ניווט' : 'Navigation'}
        style={accentStyle}
        className={`${mobileOpen ? 'fixed inset-y-0 start-0 z-40 flex' : 'hidden'} w-64 shrink-0 flex-col gap-1 overflow-y-auto border-s py-6 lg:sticky lg:top-0 lg:z-auto lg:flex lg:h-screen ${cls.nav}`}
      >
        <div className="mb-8 flex items-center gap-3 px-4">
          <div
            title={brand.name}
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${cls.avatar}`}
          >
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className={`truncate text-lg font-bold ${cls.brand}`}>{brand.name}</h2>
            <p className={`truncate text-xs ${cls.subtitle}`}>{brand.subtitle[lang]}</p>
          </div>
        </div>

        <Suspense fallback={null}>
          <SidebarNavSections sections={sections} quickActions={quickActions} cls={cls} lang={lang} onNavigate={() => setMobileOpen(false)} />
        </Suspense>

        {/* Pinned to the very bottom via mt-auto, set apart from the nav
         *  links above by its own border — language + sign-out are account-
         *  level actions, not destinations, so they don't belong mixed in
         *  with the rest of the menu. */}
        <div className={`mt-auto border-t px-3 pt-3 ${cls.divider}`}>
          <button
            type="button"
            onClick={toggleLang}
            className={`flex w-full items-center gap-3 rounded-admin px-3 py-2 text-sm transition-colors ${cls.itemInactive}`}
          >
            <span className="text-base leading-none">🌐</span>
            {lang === 'he' ? t('english') : t('hebrew')}
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className={`flex w-full items-center gap-3 rounded-admin px-3 py-2 text-sm transition-colors ${cls.itemInactive} hover:!text-danger`}
          >
            <span className="text-base leading-none">🚪</span>
            {lang === 'he' ? 'יציאה' : 'Sign Out'}
          </button>
        </div>
      </nav>

      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
