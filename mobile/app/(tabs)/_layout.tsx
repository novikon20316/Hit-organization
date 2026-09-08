// app/(tabs)/_layout.tsx
import { Tabs, usePathname, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { View, Text, Platform, Alert } from 'react-native';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../../src/firebase/firebase';
import { apiClient } from '../../src/api/apiClient'; // 🚀 Added backend API client instance

// Keep your existing haptic tab for the native press feel
import { HapticTab } from '@/components/haptic-tab';
import { TabLayoutStyles, TabIconStyles, NotFoundScreenStyles } from '../../constants/styles';
import { getRoleAccent } from '../../components/shared';
import { useActiveRole } from '../../contexts/ActiveRoleContext';

// ─── Routes where the tab bar must be completely hidden ───────────────────────
const HIDDEN_TAB_ROUTES = [
  '/',
  '/index',
  '/login',
  '/register',
  '/student/profile-setup',
  '/account-deletion-pending',
  '/WorkflowTemplateManager',
  '/WorkflowTemplateEditor',
  '/Reports',
];

// ─── Known valid route prefixes — anything outside these is a 404 ─────────────
const KNOWN_PREFIXES = [
  '/student/',
  '/supervisor/',
  '/examinor/',
  '/coordinator/',
  '/faculty_admin/',
  '/program_head/',
  '/division_head/',
  '/dean/',
  '/administrative_coordinator/',
  '/grad_school_head/',
  '/admin/',
  '/notifications',
  '/roles',
];

// Exported so app/(tabs)/roles.tsx (the role-switcher screen) navigates to
// exactly the same routes login-time redirects use — some of these
// deliberately differ from firebase/roles.ts's getHomeRoute (e.g.
// program_head, administrative_secretary, grad_school_head), which is stale
// for mobile's actual route filenames; this table is the authoritative one.
export const ROLE_ROUTES: Record<string, string> = {
  student:              '/student/home',
  // The supervisor screen's actual file is app/supervisor/dashboard.tsx —
  // there has never been an app/supervisor/home.tsx (confirmed via git
  // history), so this and the matching ROLE_TABS entry below used to point
  // every supervisor/secondary_supervisor login at a route Expo Router can't
  // resolve.
  supervisor:           '/supervisor/dashboard',
  secondary_supervisor: '/supervisor/dashboard',
  coordinator:          '/coordinator/home',
  internal_examiner:    '/examinor/home',
  faculty_admin:        '/faculty_admin/dashboard',
  program_head:         '/program_head/program_head_dashboard',
  division_head:        '/division_head/division_head_dashboard',
  dean:                 '/dean/dean_dashboard',
  administrative_secretary:  '/administrative_coordinator/administrative_coordinator_dashboard',
  grad_school_head:     '/grad_school_head/grad_school_head_dashboard',
  system_admin:         '/admin/overview',
};

function isKnownRoute(pathname: string): boolean {
  if (HIDDEN_TAB_ROUTES.includes(pathname)) return true;
  return KNOWN_PREFIXES.some((p) => pathname.startsWith(p));
}

// ─── Tab definitions per role ─────────────────────────────────────────────────
const ROLE_TABS: Record<string, Array<{
  name:          string;
  iconActive:    string;
  iconInactive:  string;
  labelHe:       string;
  labelEn:       string;
}>> = {
  student: [
    { name: 'student/home',       iconActive: '🏠', iconInactive: '🏚️', labelHe: 'בית',      labelEn: 'Home'      },
    { name: 'student/milestones', iconActive: '🎯', iconInactive: '📌', labelHe: 'אבני דרך', labelEn: 'Milestones'},
    { name: 'notifications',      iconActive: '🔔', iconInactive: '🔕', labelHe: 'התראות',   labelEn: 'Alerts'    },
  ],
  supervisor: [
    { name: 'supervisor/dashboard', iconActive: '📋', iconInactive: '📋', labelHe: 'פרויקטים', labelEn: 'Projects'  },
    { name: 'notifications',        iconActive: '🔔', iconInactive: '🔕', labelHe: 'התראות',   labelEn: 'Alerts'    },
  ],
  secondary_supervisor: [
    { name: 'supervisor/dashboard', iconActive: '📋', iconInactive: '📋', labelHe: 'פרויקטים', labelEn: 'Projects'  },
    { name: 'notifications',        iconActive: '🔔', iconInactive: '🔕', labelHe: 'התראות',   labelEn: 'Alerts'    },
  ],
  internal_examiner: [
    { name: 'examinor/home',   iconActive: '✏️', iconInactive: '✏️', labelHe: 'הגנות',    labelEn: 'Defenses'  },
    { name: 'notifications',    iconActive: '🔔', iconInactive: '🔕', labelHe: 'התראות',   labelEn: 'Alerts'    },
  ],
  coordinator: [
    { name: 'coordinator/home', iconActive: '📊', iconInactive: '📊', labelHe: 'לוח בקרה', labelEn: 'Dashboard' },
    { name: 'notifications',    iconActive: '🔔', iconInactive: '🔕', labelHe: 'התראות',   labelEn: 'Alerts'    },
  ],
  faculty_admin: [
    { name: 'faculty_admin/home', iconActive: '⚙️', iconInactive: '⚙️', labelHe: 'ניהול',  labelEn: 'Admin'     },
    { name: 'notifications',      iconActive: '🔔', iconInactive: '🔕', labelHe: 'התראות', labelEn: 'Alerts'    },
  ],
  program_head: [
    { name: 'program_head/program_head_dashboard', iconActive: '🎓', iconInactive: '🎓', labelHe: 'לוח בקרה', labelEn: 'Dashboard' },
    { name: 'notifications',                        iconActive: '🔔', iconInactive: '🔕', labelHe: 'התראות',   labelEn: 'Alerts'    },
  ],
  division_head: [
    { name: 'division_head/division_head_dashboard', iconActive: '🧭', iconInactive: '🧭', labelHe: 'ממתין לאישור', labelEn: 'Approvals' },
    { name: 'notifications',                          iconActive: '🔔', iconInactive: '🔕', labelHe: 'התראות',       labelEn: 'Alerts'    },
  ],
  dean: [
    { name: 'dean/dean_dashboard', iconActive: '🏅', iconInactive: '🏅', labelHe: 'ממתין לאישור', labelEn: 'Approvals' },
    { name: 'notifications',       iconActive: '🔔', iconInactive: '🔕', labelHe: 'התראות',       labelEn: 'Alerts'    },
  ],
  administrative_secretary: [
    { name: 'administrative_coordinator/administrative_coordinator_dashboard', iconActive: '📊', iconInactive: '📊', labelHe: 'לוח בקרה', labelEn: 'Dashboard' },
    { name: 'notifications',                                      iconActive: '🔔', iconInactive: '🔕', labelHe: 'התראות',   labelEn: 'Alerts'    },
  ],
  grad_school_head: [
    { name: 'grad_school_head/grad_school_head_dashboard', iconActive: '🏛️', iconInactive: '🏛️', labelHe: 'לוח בקרה', labelEn: 'Dashboard' },
    { name: 'notifications',                                iconActive: '🔔', iconInactive: '🔕', labelHe: 'התראות',   labelEn: 'Alerts'    },
  ],
  system_admin: [
    { name: 'admin/home',       iconActive: '🛡️', iconInactive: '🛡️', labelHe: 'מערכת',   labelEn: 'System'    },
    { name: 'notifications',    iconActive: '🔔', iconInactive: '🔕', labelHe: 'התראות',   labelEn: 'Alerts'    },
  ],
};

// ─── Role-switcher tab ──────────────────────────────────────────────────────
// A multi-role user (e.g. a coordinator who is ALSO a supervisor in roles[])
// only ever got that primary role's 2-tab bar above — there was no way to
// reach the dashboard where their supervisor/examiner work (grading a
// submitted milestone, submitting examiner availability dates) actually
// lives, short of manually typing a URL. This appends one "Roles" tab
// whenever the user holds more than one role, opening app/(tabs)/roles.tsx —
// picking a role there calls setActiveRole (persisted — see
// ActiveRoleContext.tsx) and navigates to that role's own home route,
// swapping the ENTIRE tab bar to that role's, not just adding a link. Mirrors
// web/lib/roleChrome.ts's "Switch Role" sidebar section.
const ROLE_SWITCHER_TAB = { name: 'roles', iconActive: '🔄', iconInactive: '🔄', labelHe: 'תפקידים', labelEn: 'Roles' };

// ─── Tab icon component ───────────────────────────────────────────────────────
// accentColor comes from the signed-in user's role (see ROLE_ACCENT in
// components/shared.tsx) so the active tab reflects that role's color
// instead of the same hardcoded blue for every role.
function TabIcon({ emoji, label, focused, unread = 0, accentColor }: {
  emoji: string; label: string; focused: boolean; unread?: number; accentColor: string;
}) {
  return (
    <View style={ti.wrap}>
      <View>
        <Text style={[ti.emoji, !focused && ti.emojiDim]}>{emoji}</Text>
        {unread > 0 && (
          <View style={ti.badge}>
            <Text style={ti.badgeText}>{unread > 9 ? '9+' : unread}</Text>
          </View>
        )}
      </View>
      <Text style={[ti.label, focused && { color: accentColor }]}>{label}</Text>
    </View>
  );
}

// ─── 404 screen ───────────────────────────────────────────────────────────────
function NotFoundScreen({ lang }: { lang: 'he' | 'en' }) {
  return (
    <View style={nf.root}>
      <Text style={nf.emoji}>🔍</Text>
      <Text style={nf.title}>{lang === 'he' ? 'הדף לא נמצא' : 'Page Not Found'}</Text>
      <Text style={nf.sub}>
        {lang === 'he'
          ? 'הכתובת שביקשת אינה קיימת במערכת.'
          : "The route you requested doesn't exist."}
      </Text>
    </View>
  );
}

// ─── Main layout ──────────────────────────────────────────────────────────────
export default function TabLayout() {
  const pathname = usePathname();
  const router = useRouter(); // ← add this

  const [role,   setRole]   = useState<string | null>(null);
  const [roles,  setRoles]  = useState<string[]>([]);
  const [lang,   setLang]   = useState<'he' | 'en'>('he');
  const [unread, setUnread] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const { activeRole, roles: contextRoles } = useActiveRole();

  // Keeps the tab bar in sync if the resolved highest-ranked role (or the
  // full role set behind it) changes live (e.g. an admin grants/revokes a
  // role while the user is signed in) — that updates ActiveRoleContext
  // directly, not through a fresh auth-state event, so this effect is what
  // this file needs to pick up the change without waiting on the fetch
  // below. `roles` seeds from that same profile fetch as a fallback for the
  // brief window before this context resolves, then this takes over.
  useEffect(() => {
    if (activeRole) setRole(activeRole);
    if (contextRoles.length) setRoles(contextRoles);
  }, [activeRole, contextRoles]);

  // ── 1. Authenticated User Profile Routing Sync ────────────────────────

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { 
        setRole(null); 
        setLoaded(true); 
        return; 
      }
      try {
        await user.getIdToken(true);
        
        // 🚀 REPLACED: Changed database getDoc call to backend client profile request
        const response = await apiClient.get('/api/users/profile');
        const userData = response.data;

        if (userData) {
          const userRole = userData.role ?? 'student';
          setRole(userRole);
          setRoles(Array.isArray(userData.roles) && userData.roles.length ? userData.roles : [userRole]);
          setLang(userData.language ?? 'he');

          // Account is mid-grace-period (self-requested or auto-flagged as
          // graduated) — every role gets routed to the same cancel/notice
          // screen instead of their normal home, until they cancel or the
          // scheduled purge runs.
          if (userData.pendingDeletion) {
            if (pathname !== '/account-deletion-pending') {
              router.replace('/account-deletion-pending' as any);
            }
            return;
          }

          const isAuthScreen = ['/', '/index', '/login', '/register'].includes(pathname);
          if (isAuthScreen) {
            router.replace((ROLE_ROUTES[userRole] ?? '/student/home') as any);
          }
        }
      } catch (err) {
        console.error("Error loading user layout configurations:", err);
        setRole(null);
        Alert.alert(
          lang === 'he' ? 'שגיאה' : 'Error',
          lang === 'he'
            ? 'טעינת הפרופיל נכשלה. משוך לרענון או התחבר מחדש.'
            : 'Failed to load your profile. Pull to refresh or sign in again.',
        );
      } finally {
        setLoaded(true);
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!role || !auth.currentUser) return;

    const fetchUnreadCount = async () => {
      try {
        // 🚀 REPLACED: Pulls dashboard aggregation stats asynchronously instead of long-running snapshots
        const response = await apiClient.get('/api/notifications/inbox');
        
        // Assuming your backend payload formats unread counts dynamically
        // If your endpoint gives raw arrays, filter via: response.data.notifications.filter(n => !n.isRead).length
        setUnread(response.data.unreadCount ?? 0);
      } catch (err) {
        console.error("Error polling unread navigation badges:", err);
      }
    };

    fetchUnreadCount();

    // Setup network sync baseline to fetch new alert indicators cleanly every 30 seconds
    const badgeInterval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(badgeInterval);
  }, [role]);

  // Show 404 for completely unknown routes
  if (loaded && !isKnownRoute(pathname)) {
    return <NotFoundScreen lang={lang} />;
  }

  const shouldHideTabs =
    !loaded ||
    !role ||
    HIDDEN_TAB_ROUTES.includes(pathname) ||
    pathname.startsWith('/notifications') ||
    !isKnownRoute(pathname);

  // The role-switcher tab goes before the trailing notifications tab, which
  // every role's own list ends with — see ROLE_SWITCHER_TAB above.
  const baseTabs = role ? (ROLE_TABS[role] ?? []) : [];
  const roleSwitcherTabs = roles.length > 1 ? [ROLE_SWITCHER_TAB] : [];
  const tabs = role
    ? [...baseTabs.slice(0, -1), ...roleSwitcherTabs, ...baseTabs.slice(-1)]
    : [];
  const roleAccentColor = getRoleAccent(role ?? '').text;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarButton: HapticTab,          // ← your existing haptic press kept
        tabBarShowLabel: false,           // we draw our own label inside TabIcon
        tabBarStyle: shouldHideTabs
          ? styles.hidden
          : styles.tabBar,
        // Force every tab button to an equal, fixed share of the bar width
        // instead of sizing to its own icon/label content — without this,
        // each button's width is driven by its emoji + label (which differ
        // between the focused/unfocused icon and bold/regular label), so
        // buttons visibly resize on press and, with few tabs, the row falls
        // short of the full screen width instead of stretching to fill it.
        tabBarItemStyle: { flex: 1 },
      }}
    >
      {/* Render only the tabs for this role */}
      {tabs.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            tabBarIcon: ({ focused }) => (
              <TabIcon
                emoji={focused ? tab.iconActive : tab.iconInactive}
                label={lang === 'he' ? tab.labelHe : tab.labelEn}
                focused={focused}
                unread={tab.name === 'notifications' ? unread : 0}
                accentColor={roleAccentColor}
              />
            ),
          }}
        />
      ))}



    </Tabs>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = TabLayoutStyles;

const ti = TabIconStyles;

const nf = NotFoundScreenStyles;