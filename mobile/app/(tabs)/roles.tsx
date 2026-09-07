// app/(tabs)/roles.tsx — shared "Switch Role" screen for every multi-role user
// Only reachable via the "Roles" tab, which app/(tabs)/_layout.tsx only adds
// once the signed-in user holds more than one role (see ROLE_SWITCHER_TAB
// there) — mirrors web/lib/roleChrome.ts's "Switch Role" sidebar section.
import React from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import type { AppRole } from '@/components/i18n';
import { useActiveRole } from '@/contexts/ActiveRoleContext';
import { ROLE_ROUTES } from './_layout';

const ROLE_META: Record<AppRole, { icon: string; labelHe: string; labelEn: string }> = {
  student:                  { icon: '🏠', labelHe: 'סטודנט', labelEn: 'Student' },
  supervisor:               { icon: '📋', labelHe: 'מנחה', labelEn: 'Supervisor' },
  secondary_supervisor:     { icon: '📋', labelHe: 'מנחה משני', labelEn: 'Secondary Supervisor' },
  coordinator:              { icon: '📊', labelHe: 'רכז', labelEn: 'Coordinator' },
  faculty_admin:            { icon: '⚙️', labelHe: 'ראש מנהל פקולטה', labelEn: 'Faculty Admin' },
  program_head:             { icon: '🎓', labelHe: 'ראש תוכנית', labelEn: 'Program Head' },
  administrative_secretary: { icon: '📊', labelHe: 'רכזת אדמיניסטרטיבית', labelEn: 'Administrative Coordinator' },
  grad_school_head:         { icon: '🏛️', labelHe: 'ראש בית ספר ללימודי מוסמכים', labelEn: 'Grad School Head' },
  internal_examiner:        { icon: '✏️', labelHe: 'בוחן פנימי', labelEn: 'Internal Examiner' },
  system_admin:             { icon: '🛡️', labelHe: 'מנהל מערכת', labelEn: 'System Admin' },
};

export default function RolesScreen() {
  const router = useRouter();
  const { roles, activeRole, mainRole, setActiveRole, language } = useActiveRole();
  const isRtl = language === 'he';

  const handleSelect = (role: AppRole) => {
    if (role === activeRole) return;
    setActiveRole(role);
    router.replace((ROLE_ROUTES[role] ?? '/student/home') as any);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F7F9FC' }}>
      <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 }}>
        <Text style={{ fontSize: 20, fontWeight: '700', color: '#111827', textAlign: isRtl ? 'right' : 'left' }}>
          {isRtl ? 'החלפת תפקיד' : 'Switch Role'}
        </Text>
        <Text style={{ fontSize: 13, color: '#6B7280', marginTop: 4, textAlign: isRtl ? 'right' : 'left' }}>
          {isRtl
            ? 'בחר/י תפקיד כדי לראות את התפריט והנתונים שלו. ניתן לחזור לתפקיד הראשי בכל עת.'
            : "Pick a role to see its own menu and data. You can switch back to your main role any time."}
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}>
        {roles.map((role) => {
          const meta = ROLE_META[role];
          const isCurrent = role === activeRole;
          const isMain = role === mainRole;
          return (
            <Pressable
              key={role}
              onPress={() => handleSelect(role)}
              disabled={isCurrent}
              accessibilityRole="button"
              style={{
                flexDirection: isRtl ? 'row-reverse' : 'row',
                alignItems: 'center',
                gap: 12,
                backgroundColor: '#fff',
                borderRadius: 14,
                borderWidth: isCurrent ? 2 : 1,
                borderColor: isCurrent ? '#2E86FF' : '#E5E7EB',
                paddingVertical: 14,
                paddingHorizontal: 16,
                marginTop: 10,
                opacity: isCurrent ? 0.7 : 1,
              }}
            >
              <Text style={{ fontSize: 22 }}>{meta.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '600', color: '#111827', textAlign: isRtl ? 'right' : 'left' }}>
                  {isRtl ? meta.labelHe : meta.labelEn}
                </Text>
                {isMain && (
                  <Text style={{ fontSize: 11, color: '#2E86FF', marginTop: 2, textAlign: isRtl ? 'right' : 'left' }}>
                    {isRtl ? 'התפקיד הראשי שלך' : 'Your main role'}
                  </Text>
                )}
              </View>
              {isCurrent && (
                <View style={{ backgroundColor: '#EFF6FF', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#2E86FF' }}>
                    {isRtl ? 'פעיל כעת' : 'Current'}
                  </Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}
