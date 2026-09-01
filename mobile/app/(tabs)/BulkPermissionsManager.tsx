// app/(tabs)/BulkPermissionsManager.tsx
//
// Grants a view/action permission scope to EVERY user of a chosen role in
// one action — instead of the existing one-user-at-a-time checkbox flow
// (mobile/components/modals/PermissionsEditorModal.tsx, still available
// unchanged for individual exceptions). system_admin: unscoped. faculty_admin:
// locked server-side to their own faculty regardless of what this screen
// sends. grad_school_head: cross-faculty by design, same as elsewhere in
// this app.

import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth } from '../../src/firebase/firebase';
import type { Lang } from '../../components/i18n';
import { roleLabel } from '../../components/i18n';
import { TopBar, FACULTY_COLORS } from '../../components/shared';
import { ResponsiveScreen } from '../../components/ResponsiveScreen';
import { apiClient } from '../../src/api/apiClient';
import { VALID_ROLES } from '../../firebase/roles';
import {
  VIEW_TYPES, ACTION_TYPES, DEGREE_LEVELS, PROCESS_TYPES, PERMISSION_FACULTY_IDS,
  majorsForFaculty, degreeLevelsForFaculty, type ViewType, type ActionType, type DegreeLevel, type ProcessType,
} from '../../constants/permissions';

const TARGETABLE_ROLES = VALID_ROLES.filter((r) => r !== 'student');
const SELECTABLE_FACULTY_IDS = PERMISSION_FACULTY_IDS.filter((id) => id !== 'all');

function Pill({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        borderWidth: 1.5, borderColor: active ? '#7C3AED' : '#DDD6FE',
        backgroundColor: active ? '#7C3AED' : '#fff',
        borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7, marginRight: 6, marginBottom: 6,
      }}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text style={{ color: active ? '#fff' : '#7C3AED', fontWeight: '600', fontSize: 12 }}>{label}</Text>
    </Pressable>
  );
}

export default function BulkPermissionsManager() {
  const [lang, setLang] = useState<Lang>('he');
  const isRtl = lang === 'he';

  const [userRole, setUserRole] = useState<string | null>(null);
  const [ownFacultyId, setOwnFacultyId] = useState<string | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  const [targetRole, setTargetRole] = useState<string>('supervisor');
  const [facultyId, setFacultyId] = useState(''); // '' = all faculties
  const [major, setMajor] = useState('');
  const [degreeLevel, setDegreeLevel] = useState<DegreeLevel | ''>('');
  const [processType, setProcessType] = useState<ProcessType | ''>('');
  const [view, setView] = useState<ViewType[]>([]);
  const [actions, setActions] = useState<ActionType[]>([]);

  const [affectedCount, setAffectedCount] = useState<number | null>(null);
  const [applying, setApplying] = useState(false);

  const uid = auth.currentUser?.uid;
  const isFacultyLocked = userRole === 'faculty_admin';
  const effectiveFacultyId = isFacultyLocked ? (ownFacultyId ?? '') : facultyId;
  const majors = effectiveFacultyId ? majorsForFaculty(effectiveFacultyId) : [];
  const degreeLevelOptions = DEGREE_LEVELS.filter((d) => degreeLevelsForFaculty(effectiveFacultyId || 'all').includes(d.key));

  useEffect(() => {
    if (!uid) { setLoadingProfile(false); return; }
    (async () => {
      try {
        const res = await apiClient.get('/api/users/profile');
        setUserRole(res.data.role || null);
        setOwnFacultyId(res.data.facultyId || null);
      } catch (err) {
        console.error('BulkPermissionsManager: failed to load profile', err);
      } finally {
        setLoadingProfile(false);
      }
    })();
  }, [uid]);

  const loadPreview = useCallback(async () => {
    try {
      const res = await apiClient.get('/api/admin/permissions/users-by-role', { params: { role: targetRole } });
      const users: Array<{ facultyId: string | null }> = res.data.users ?? [];
      const scoped = effectiveFacultyId ? users.filter((u) => u.facultyId === effectiveFacultyId) : users;
      setAffectedCount(scoped.length);
    } catch {
      setAffectedCount(null);
    }
  }, [targetRole, effectiveFacultyId]);

  useEffect(() => { if (!loadingProfile) loadPreview(); }, [loadingProfile, loadPreview]);

  const toggleView = (key: ViewType) => setView((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  const toggleAction = (key: ActionType) => setActions((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  const handleApply = async () => {
    if (view.length === 0 && actions.length === 0) {
      Alert.alert(lang === 'he' ? 'שגיאה' : 'Error', lang === 'he' ? 'יש לבחור לפחות הרשאת צפייה או פעולה אחת' : 'Select at least one view or action permission');
      return;
    }
    setApplying(true);
    try {
      const res = await apiClient.post('/api/admin/permissions/apply-to-role', {
        targetRole,
        facultyId: effectiveFacultyId || undefined,
        major: major || undefined,
        degreeLevel: degreeLevel || undefined,
        processType: processType || undefined,
        view,
        actions,
      });
      Alert.alert(
        '✅',
        lang === 'he' ? `ההרשאה הוחלה על ${res.data.affectedCount} משתמשים` : `Permission applied to ${res.data.affectedCount} user(s)`
      );
    } catch (e: any) {
      Alert.alert(lang === 'he' ? 'שגיאה' : 'Error', e.response?.data?.message || (lang === 'he' ? 'הפעולה נכשלה' : 'Action failed'));
    } finally {
      setApplying(false);
    }
  };

  if (loadingProfile) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F3FF' }}>
        <ActivityIndicator size="large" color="#7C3AED" />
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F5F3FF' }}>
      <TopBar name="" role={(userRole as any) ?? 'system_admin'} lang={lang} isRtl={isRtl} onToggleLang={() => setLang(lang === 'he' ? 'en' : 'he')} />

      <ResponsiveScreen>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Text style={{ fontSize: 16, fontWeight: '800', color: '#111', marginBottom: 4, textAlign: isRtl ? 'right' : 'left' }}>
          {lang === 'he' ? 'הרשאות מרוכזות לפי תפקיד' : 'Bulk Permissions by Role'}
        </Text>
        <Text style={{ fontSize: 13, color: '#6B7280', marginBottom: 14, textAlign: isRtl ? 'right' : 'left' }}>
          {lang === 'he' ? 'החל הרשאה על כל המשתמשים בעלי תפקיד מסוים בבת אחת' : 'Apply a permission to every user of a role at once'}
        </Text>

        <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6, textAlign: isRtl ? 'right' : 'left' }}>
          {lang === 'he' ? 'תפקיד יעד' : 'Target role'}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {TARGETABLE_ROLES.map((r) => (
            <Pill key={r} label={roleLabel(r, lang)} active={targetRole === r} onPress={() => setTargetRole(r)} />
          ))}
        </View>

        {isFacultyLocked ? (
          <Text style={{ fontSize: 13, color: '#6B7280', marginTop: 10, textAlign: isRtl ? 'right' : 'left' }}>
            {lang === 'he' ? 'פקולטה: ' : 'Faculty: '}
            <Text style={{ fontWeight: '700', color: '#111' }}>{ownFacultyId ? FACULTY_COLORS[ownFacultyId]?.label[lang] ?? ownFacultyId : '—'}</Text>
            {' '}({lang === 'he' ? 'נעול לפקולטה שלך' : 'locked to your faculty'})
          </Text>
        ) : (
          <>
            <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginTop: 12, marginBottom: 6, textAlign: isRtl ? 'right' : 'left' }}>
              {lang === 'he' ? 'פקולטה' : 'Faculty'}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              <Pill label={lang === 'he' ? 'כל הפקולטות' : 'All faculties'} active={facultyId === ''} onPress={() => { setFacultyId(''); setMajor(''); }} />
              {SELECTABLE_FACULTY_IDS.map((id) => (
                <Pill
                key={id}
                label={FACULTY_COLORS[id]?.label[lang] ?? id}
                active={facultyId === id}
                onPress={() => {
                  setFacultyId(id);
                  setMajor('');
                  const validLevels = degreeLevelsForFaculty(id);
                  if (degreeLevel && !validLevels.includes(degreeLevel)) {
                    setDegreeLevel('');
                    setProcessType('');
                  }
                }}
              />
              ))}
            </View>
          </>
        )}

        {effectiveFacultyId && majors.length > 0 && (
          <>
            <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginTop: 12, marginBottom: 6, textAlign: isRtl ? 'right' : 'left' }}>
              {lang === 'he' ? 'מגמה (אופציונלי)' : 'Major (optional)'}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              <Pill label={lang === 'he' ? 'הכל' : 'All'} active={major === ''} onPress={() => setMajor('')} />
              {majors.map((m) => (
                <Pill key={m.slug} label={m.label[lang]} active={major === m.slug} onPress={() => setMajor(m.slug)} />
              ))}
            </View>
          </>
        )}

        <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginTop: 12, marginBottom: 6, textAlign: isRtl ? 'right' : 'left' }}>
          {lang === 'he' ? 'תואר (אופציונלי)' : 'Degree level (optional)'}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          <Pill label={lang === 'he' ? 'שני התארים' : 'Both'} active={degreeLevel === ''} onPress={() => { setDegreeLevel(''); setProcessType(''); }} />
          {degreeLevelOptions.map((d) => (
            <Pill key={d.key} label={d.label[lang]} active={degreeLevel === d.key} onPress={() => { setDegreeLevel(d.key); if (d.key !== 'masters') setProcessType(''); }} />
          ))}
        </View>

        {degreeLevel === 'masters' && (
          <>
            <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginTop: 12, marginBottom: 6, textAlign: isRtl ? 'right' : 'left' }}>
              {lang === 'he' ? 'מסלול (אופציונלי)' : 'Process type (optional)'}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              <Pill label={lang === 'he' ? 'שני המסלולים' : 'Both'} active={processType === ''} onPress={() => setProcessType('')} />
              {PROCESS_TYPES.map((p) => (
                <Pill key={p.key} label={p.label[lang]} active={processType === p.key} onPress={() => setProcessType(p.key)} />
              ))}
            </View>
          </>
        )}

        <View style={{ backgroundColor: '#fff', borderRadius: 10, padding: 12, marginTop: 14 }}>
          <Text style={{ fontSize: 13, color: '#111' }}>
            {lang === 'he' ? '👥 משתמשים שיושפעו: ' : '👥 Users affected: '}
            <Text style={{ fontWeight: '800' }}>{affectedCount ?? '—'}</Text>
          </Text>
        </View>

        <Text style={{ fontSize: 13, fontWeight: '700', color: '#111', marginTop: 16, marginBottom: 6, textAlign: isRtl ? 'right' : 'left' }}>
          👁️ {lang === 'he' ? 'צפייה' : 'View'}
        </Text>
        {VIEW_TYPES.map((v) => (
          <Pressable
            key={v.key}
            onPress={() => toggleView(v.key)}
            style={{ flexDirection: isRtl ? 'row-reverse' : 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 10, padding: 10, marginBottom: 6, borderWidth: 1, borderColor: '#E0E8FF' }}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: view.includes(v.key) }}
          >
            <View style={{ width: 20, height: 20, borderRadius: 5, borderWidth: 2, borderColor: '#7C3AED', backgroundColor: view.includes(v.key) ? '#7C3AED' : 'transparent', marginRight: isRtl ? 0 : 10, marginLeft: isRtl ? 10 : 0 }} />
            <Text style={{ fontSize: 13, color: '#111', flex: 1, textAlign: isRtl ? 'right' : 'left' }}>{v.label[lang]}</Text>
          </Pressable>
        ))}

        <Text style={{ fontSize: 13, fontWeight: '700', color: '#111', marginTop: 10, marginBottom: 6, textAlign: isRtl ? 'right' : 'left' }}>
          ⚡ {lang === 'he' ? 'פעולות' : 'Actions'}
        </Text>
        {ACTION_TYPES.map((a) => (
          <Pressable
            key={a.key}
            onPress={() => toggleAction(a.key)}
            style={{ flexDirection: isRtl ? 'row-reverse' : 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 10, padding: 10, marginBottom: 6, borderWidth: 1, borderColor: '#E0E8FF' }}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: actions.includes(a.key) }}
          >
            <View style={{ width: 20, height: 20, borderRadius: 5, borderWidth: 2, borderColor: '#7C3AED', backgroundColor: actions.includes(a.key) ? '#7C3AED' : 'transparent', marginRight: isRtl ? 0 : 10, marginLeft: isRtl ? 10 : 0 }} />
            <Text style={{ fontSize: 13, color: '#111', flex: 1, textAlign: isRtl ? 'right' : 'left' }}>{a.label[lang]}</Text>
          </Pressable>
        ))}

        <Pressable
          style={{ backgroundColor: '#7C3AED', borderRadius: 10, paddingVertical: 13, alignItems: 'center', marginTop: 16, opacity: applying ? 0.6 : 1 }}
          onPress={handleApply}
          disabled={applying}
          accessibilityRole="button"
        >
          {applying ? <ActivityIndicator color="#fff" /> : (
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>
              {lang === 'he' ? `החל על ${affectedCount ?? '?'} משתמשים` : `Apply to ${affectedCount ?? '?'} user(s)`}
            </Text>
          )}
        </Pressable>
      </ScrollView>
      </ResponsiveScreen>
    </SafeAreaView>
  );
}
