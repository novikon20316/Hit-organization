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
  '/administrative_coordinator/',
  '/grad_school_head/',
  '/admin/',
  '/notifications',
];

const ROLE_ROUTES: Record<string, string> = {
  student:              '/student/home',
  supervisor:           '/supervisor/home',
  secondary_supervisor: '/supervisor/home',
  coordinator:          '/coordinator/home',
  internal_examiner:    '/examinor/home',
  faculty_admin:        '/faculty_admin/dashboard',
  program_head:         '/program_head/program_head_dashboard',
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
    { name: 'supervisor/home',  iconActive: '📋', iconInactive: '📋', labelHe: 'פרויקטים', labelEn: 'Projects'  },
    { name: 'notifications',    iconActive: '🔔', iconInactive: '🔕', labelHe: 'התראות',   labelEn: 'Alerts'    },
  ],
  secondary_supervisor: [
    { name: 'supervisor/home',  iconActive: '📋', iconInactive: '📋', labelHe: 'פרויקטים', labelEn: 'Projects'  },
    { name: 'notifications',    iconActive: '🔔', iconInactive: '🔕', labelHe: 'התראות',   labelEn: 'Alerts'    },
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
  const [lang,   setLang]   = useState<'he' | 'en'>('he');
  const [unread, setUnread] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const { activeRole } = useActiveRole();

  // Keeps the tab bar in sync if the resolved highest-ranked role changes
  // live (e.g. an admin grants/revokes a role while the user is signed in) —
  // that updates ActiveRoleContext directly, not through a fresh auth-state
  // event, so this effect is what this file needs to pick up the change
  // without waiting on the fetch below.
  useEffect(() => {
    if (activeRole) setRole(activeRole);
  }, [activeRole]);

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

  const tabs = role ? (ROLE_TABS[role] ?? []) : [];
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