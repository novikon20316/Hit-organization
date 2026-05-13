// app/(tabs)/_layout.tsx
import { Tabs, usePathname, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../../src/firebase/firebase';
import { collection, query, where, onSnapshot, doc, getDoc } from 'firebase/firestore';

// Keep your existing haptic tab for the native press feel
import { HapticTab } from '@/components/haptic-tab';

// ─── Routes where the tab bar must be completely hidden ───────────────────────
const HIDDEN_TAB_ROUTES = [
  '/',
  '/index',
  '/login',
  '/register',
  '/student/profile-setup',
];

// ─── Known valid route prefixes — anything outside these is a 404 ─────────────
const KNOWN_PREFIXES = [
  '/student/',
  '/supervisor/',
  '/examiner/',
  '/coordinator/',
  '/faculty_admin/',
  '/admin/',
  '/notifications',
];

const ROLE_ROUTES: Record<string, string> = {
  student:       '/student/home',
  supervisor:    '/supervisor/home',
  coordinator:   '/coordinator/home',
  examiner:      '/examiner/home',
  faculty_admin: '/faculty_admin/dashboard',
  system_admin:  '/admin/panel',
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
    { name: 'student/home',     iconActive: '🏠', iconInactive: '🏚️', labelHe: 'בית',      labelEn: 'Home'      },
    { name: 'notifications',    iconActive: '🔔', iconInactive: '🔕', labelHe: 'התראות',   labelEn: 'Alerts'    },
  ],
  supervisor: [
    { name: 'supervisor/home',  iconActive: '📋', iconInactive: '📋', labelHe: 'פרויקטים', labelEn: 'Projects'  },
    { name: 'notifications',    iconActive: '🔔', iconInactive: '🔕', labelHe: 'התראות',   labelEn: 'Alerts'    },
  ],
  examiner: [
    { name: 'examiner/home',    iconActive: '✏️', iconInactive: '✏️', labelHe: 'הגנות',    labelEn: 'Defenses'  },
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
  system_admin: [
    { name: 'admin/home',       iconActive: '🛡️', iconInactive: '🛡️', labelHe: 'מערכת',   labelEn: 'System'    },
    { name: 'notifications',    iconActive: '🔔', iconInactive: '🔕', labelHe: 'התראות',   labelEn: 'Alerts'    },
  ],
};

// ─── Tab icon component ───────────────────────────────────────────────────────
function TabIcon({ emoji, label, focused, unread = 0 }: {
  emoji: string; label: string; focused: boolean; unread?: number;
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
      <Text style={[ti.label, focused && ti.labelFocused]}>{label}</Text>
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

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { setRole(null); setLoaded(true); return; }
      try {
        await user.getIdToken(true);
        const snap = await getDoc(doc(db, 'users', user.uid));
        if (snap.exists()) {
          const userRole = snap.data().role ?? 'student';
          setRole(userRole);
          setLang(snap.data().language ?? 'he');

          const isAuthScreen = ['/', '/index', '/login', '/register'].includes(pathname);
          if (isAuthScreen) {
            router.replace((ROLE_ROUTES[userRole] ?? '/student/home') as any);
          }
        }
      } catch {
        setRole(null);
      } finally {
        setLoaded(true);
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    const currentUser = auth.currentUser;
    if (!currentUser) return;

    const q = query(
      collection(db, 'notifications'),
      where('recipientId', '==', currentUser.uid),
      where('isRead', '==', false)
    );

    const unsub = onSnapshot(q, (snap) => setUnread(snap.size));
    return unsub;
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

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarButton: HapticTab,          // ← your existing haptic press kept
        tabBarShowLabel: false,           // we draw our own label inside TabIcon
        tabBarStyle: shouldHideTabs 
          ? styles.hidden
          : styles.tabBar,
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
              />
            ),
          }}
        />
      ))}



    </Tabs>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  tabBar: {
    backgroundColor:  '#FFFFFF',
    borderTopWidth:   1,
    borderTopColor:   '#E0E8FF',
    height:           Platform.OS === 'ios' ? 82 : 64,
    paddingBottom:    Platform.OS === 'ios' ? 20 : 6,
    paddingTop:       6,
    elevation:        8,
    shadowColor:      '#2E86FF',
    shadowOffset:     { width: 0, height: -2 },
    shadowOpacity:    0.08,
    shadowRadius:     12,
  },
  hidden: {
    display: 'none',
    height:  0,
  },
});

const ti = StyleSheet.create({
  wrap:        { alignItems: 'center', justifyContent: 'center', paddingTop: 2 },
  emoji:       { fontSize: 22 },
  emojiDim:    { opacity: 0.4 },
  badge: {
    position:         'absolute',
    top:              -4,
    right:            -8,
    backgroundColor:  '#EF4444',
    borderRadius:     8,
    minWidth:         16,
    height:           16,
    justifyContent:   'center',
    alignItems:       'center',
    paddingHorizontal: 3,
  },
  badgeText:    { color: '#fff', fontSize: 9, fontWeight: '800' },
  label:        { fontSize: 10, color: '#9BA8C0', fontWeight: '600', marginTop: 3 },
  labelFocused: { color: '#2E86FF' },
});

const nf = StyleSheet.create({
  root:  { flex: 1, justifyContent: 'center', alignItems: 'center',
           backgroundColor: '#F0F4FF', padding: 30 },
  emoji: { fontSize: 60, marginBottom: 16 },
  title: { fontSize: 22, fontWeight: '800', color: '#111', marginBottom: 8, textAlign: 'center' },
  sub:   { fontSize: 14, color: '#8899BB', textAlign: 'center', lineHeight: 20 },
});