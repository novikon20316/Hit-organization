// app/(auth)/completeProfile.tsx
//
// Reached only from login.tsx's "Continue with Google" flow, for a Google
// identity with no matching Firestore users/{uid} doc — i.e. a genuinely new
// account, not an existing one (existing accounts either log straight in, or
// go through the linking-password prompt on the login screen itself). Google
// already gives us a verified email + display name; this collects the same
// academic-info fields signup.tsx's form does (studentId/faculty/program/
// year/phone), then calls the exact same, unmodified POST /api/users/sync
// self-signup uses — no server changes were needed for this feature (see the
// plan for why: syncData already gates on the ID token's own email_verified
// claim, which Google-issued tokens always satisfy, validates newUid against
// the caller's own uid, and hard-locks role to 'student').

import React, { useEffect, useState } from 'react';
import {
  View, Text, Pressable, ScrollView, Modal,
  ActivityIndicator, Alert, TextInput, Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../../src/firebase/firebase';
import { useRouter } from 'expo-router';
import type { Lang } from '../../components/i18n';
import { apiClient } from '@/src/api/apiClient';
import { verifyStudentEligibility } from '@/src/api/studentRoster';
import { HIT_FACULTIES, getFacultyByKey, getFilteredPrograms, PROGRAM_DEGREE_LENGTHS } from '@/constants/faculties';
import type { DegreeLevel, Program } from '@/types';
import { getHomeRoute } from '@/firebase/roles';
import { useMaintenanceCheck } from '@/hooks/useMaintenanceCheck';
import { SignupStyles } from '../../constants/styles';

const s = SignupStyles;

function isValidStudentId(id: string): boolean {
  return /^\d{9}$/.test(id);
}

function isValidPhoneNumber(value: string): boolean {
  return /^\d{10}$/.test(value);
}

export default function CompleteProfile() {
  const router = useRouter();
  const checkMaintenance = useMaintenanceCheck();

  const [lang, setLang] = useState<Lang>('he');
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [studentId, setStudentId] = useState('');
  const [faculty, setFaculty] = useState<string | null>(null);
  const [showFacultyModal, setShowFacultyModal] = useState(false);
  const [programKey, setProgramKey] = useState<string | null>(null);
  const [yearOfStudy, setYearOfStudy] = useState<number | null>(null);
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);
  const [saving, setSaving] = useState(false);

  const isRtl = lang === 'he';

  // This screen only makes sense for an already-Google-authenticated,
  // Firestore-doc-less session — reached by navigation from login.tsx, never
  // by landing here with no session at all.
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) {
      router.replace('/(auth)/login');
      return;
    }
    setDisplayName(user.displayName ?? '');
    setEmail(user.email ?? '');
    setCheckingAuth(false);
  }, [router]);

  const selectedFacultyData = faculty ? getFacultyByKey(faculty) : undefined;
  const facultyPrograms: Program[] = faculty ? getFilteredPrograms(faculty, 'both') : [];
  const selectedProgram = facultyPrograms.find((p) => p.key === programKey);
  const degreeType: DegreeLevel | null = selectedProgram?.level ?? null;

  const yearOptions: number[] = (() => {
    if (!selectedProgram) return [];
    if (selectedProgram.level === 'masters') return [1, 2];
    const years = PROGRAM_DEGREE_LENGTHS[selectedProgram.slug] ?? PROGRAM_DEGREE_LENGTHS.default;
    return Array.from({ length: years }, (_, i) => i + 1);
  })();

  const canSave = Boolean(
    isValidPhoneNumber(phoneNumber) && isValidStudentId(studentId) && faculty && programKey && yearOfStudy
  );

  const handleSave = async () => {
    const user = auth.currentUser;
    if (!canSave || !user) return;
    setSaving(true);
    try {
      // Same fail-fast pre-check self-signup does — POST /api/users/sync
      // re-checks this authoritatively regardless.
      const eligibility = await verifyStudentEligibility({
        studentId,
        facultyId: faculty!,
        degreeType: degreeType!,
        major: selectedProgram?.slug ?? null,
      });
      if (!eligibility.eligible) {
        Alert.alert(
          lang === 'he' ? 'לא ניתן להירשם' : 'Cannot Register',
          eligibility.message ||
            (lang === 'he'
              ? 'תעודת הזהות שהוזנה אינה נמצאת ברשימת הסטודנטים המאושרים. פנה לרכז הפקולטה שלך.'
              : 'This ID number was not found on the approved students list. Please contact your faculty coordinator.')
        );
        return;
      }

      const idToken = await user.getIdToken(true);
      const response = await apiClient.post(
        '/api/users/sync',
        {
          newUid: user.uid,
          email,
          displayName: displayName || email,
          role: 'student',
          facultyId: faculty,
          degreeType,
          yearOfStudy,
          major: selectedProgram?.slug ?? null,
          studentId,
        },
        { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` } }
      );
      if (!response.data?.success) {
        throw new Error('Sync failed: ' + (response.data?.message ?? 'unknown error'));
      }

      // Already in a live, Google-verified session — no need for the
      // email-verification-flow's "go back to login" hop.
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      const userData = userDoc.data();
      const role = userData?.role ?? 'student';
      const maintenance = await checkMaintenance(role);
      if (maintenance.blocked) {
        router.replace({
          pathname: '/maintenance',
          params: { title: maintenance.title, endsAt: maintenance.endsAt ?? '' },
        } as any);
        return;
      }
      router.replace(getHomeRoute(role as any) as any);
    } catch (e: any) {
      console.error('completeProfile save error:', e);
      Alert.alert(lang === 'he' ? 'שגיאה' : 'Error', e.message ?? 'Registration failed.');
    } finally {
      setSaving(false);
    }
  };

  if (checkingAuth) {
    return (
      <SafeAreaView style={s.root}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color="#2E86FF" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.root}>
      <ScrollView
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onScrollBeginDrag={Keyboard.dismiss}
      >
        <View style={[s.langRow, isRtl && s.rowReverse]}>
          <Pressable style={s.langBtn} onPress={() => setLang(lang === 'he' ? 'en' : 'he')}>
            <Text style={s.langText}>{lang === 'he' ? 'EN' : 'עב'}</Text>
          </Pressable>
        </View>

        <View style={s.hero}>
          <Text style={s.heroEmoji}>🎓</Text>
          <Text style={[s.heroTitle, isRtl && s.textCenter]}>
            {lang === 'he' ? 'השלמת פרטי לימודים' : 'Complete Your Academic Info'}
          </Text>
          <Text style={[s.heroSub, isRtl && s.textCenter]}>
            {lang === 'he'
              ? `מחובר/ת כ-${email} · יש להיות ברשימת הסטודנטים המאושרים של הפקולטה`
              : `Signed in as ${email} · you'll need to be on your faculty's approved students list`}
          </Text>
        </View>

        <View style={s.section}>
          <Text style={[s.sectionTitle, isRtl && s.textRight]}>
            {lang === 'he' ? 'פרטים אישיים' : 'Personal Details'}
          </Text>

          <TextInput
            value={displayName}
            onChangeText={setDisplayName}
            placeholder={lang === 'he' ? 'שם מלא' : 'Full Name'}
            placeholderTextColor="#9BA8C0"
            style={[s.input, isRtl && s.textRight]}
          />

          <TextInput
            value={phoneNumber}
            onChangeText={(t) => setPhoneNumber(t.replace(/\D/g, '').slice(0, 10))}
            placeholder={lang === 'he' ? 'מספר טלפון' : 'Phone Number'}
            placeholderTextColor="#9BA8C0"
            keyboardType="phone-pad"
            maxLength={10}
            style={[s.input, isRtl && s.textRight, attemptedSubmit && !isValidPhoneNumber(phoneNumber) && { borderColor: '#EF4444' }]}
          />
          {attemptedSubmit && !isValidPhoneNumber(phoneNumber) && (
            <Text style={{ color: '#EF4444', fontSize: 12, marginTop: -8, marginBottom: 8, textAlign: isRtl ? 'right' : 'left' }}>
              {phoneNumber.length === 0
                ? (lang === 'he' ? 'שדה חובה' : 'Required field')
                : (lang === 'he' ? 'מספר טלפון חייב להכיל בדיוק 10 ספרות' : 'Phone number must be exactly 10 digits')}
            </Text>
          )}

          <TextInput
            value={studentId}
            onChangeText={setStudentId}
            placeholder={lang === 'he' ? 'תעודת זהות' : 'Student ID'}
            placeholderTextColor="#9BA8C0"
            keyboardType="numeric"
            maxLength={9}
            style={[
              s.input,
              isRtl && s.textRight,
              studentId.length > 0
                ? { borderColor: isValidStudentId(studentId) ? '#10B981' : '#EF4444' }
                : attemptedSubmit && { borderColor: '#EF4444' },
            ]}
          />
          {attemptedSubmit && studentId.length === 0 ? (
            <Text style={{ color: '#EF4444', fontSize: 12, marginTop: -8, marginBottom: 8, textAlign: isRtl ? 'right' : 'left' }}>
              {lang === 'he' ? 'שדה חובה' : 'Required field'}
            </Text>
          ) : studentId.length > 0 && !isValidStudentId(studentId) && (
            <Text style={{ color: '#EF4444', fontSize: 12, marginTop: -8, marginBottom: 8, textAlign: isRtl ? 'right' : 'left' }}>
              {lang === 'he' ? 'תעודת זהות חייבת להכיל 9 ספרות' : 'Student ID must be exactly 9 digits'}
            </Text>
          )}
        </View>

        <Text style={[s.label, { marginTop: 15 }, !isRtl && s.textRight]}>
          {lang === 'he' ? 'בחר פקולטה / מחלקה:' : 'Select Faculty / Department:'}
        </Text>
        <Pressable
          style={({ pressed }) => [
            s.input,
            {
              justifyContent: 'center',
              backgroundColor: pressed ? '#F0F4FF' : '#fff',
              borderColor: showFacultyModal ? '#2E86FF' : (attemptedSubmit && !faculty ? '#EF4444' : '#E0E8FF'),
              minHeight: 50,
            },
          ]}
          onPress={() => setShowFacultyModal(true)}
        >
          <View style={{ flexDirection: isRtl ? 'row-reverse' : 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: 16, color: '#333' }}>
              {selectedFacultyData ? selectedFacultyData.label[lang] : (lang === 'he' ? 'בחר פקולטה' : 'Select a faculty')}
            </Text>
            <Text style={{ fontSize: 12, color: '#8899BB' }}>▼</Text>
          </View>
        </Pressable>
        {attemptedSubmit && !faculty && (
          <Text style={{ color: '#EF4444', fontSize: 12, marginTop: 4, marginBottom: 8, textAlign: isRtl ? 'right' : 'left' }}>
            {lang === 'he' ? 'יש לבחור פקולטה' : 'Please select a faculty'}
          </Text>
        )}

        {faculty && (
          <View style={s.section}>
            <Text style={[s.sectionTitle, !isRtl && s.textRight]}>
              {lang === 'he' ? '1. תואר / מגמה' : '1. Degree / Program'}
            </Text>
            <View style={s.majorGrid}>
              {facultyPrograms.map((p) => (
                <Pressable
                  key={p.key}
                  style={[s.majorOption, programKey === p.key && s.majorOptionActive]}
                  onPress={() => { setProgramKey(p.key); setYearOfStudy(null); }}
                >
                  <Text style={[s.majorText, programKey === p.key && s.majorTextActive, isRtl && s.textRight]}>
                    {p.label[lang]}
                  </Text>
                  <Text style={[s.majorYears, programKey === p.key && s.majorYearsActive]}>
                    {p.level === 'masters' ? (lang === 'he' ? 'תואר שני' : "Master's") : (lang === 'he' ? 'תואר ראשון' : "Bachelor's")}
                  </Text>
                </Pressable>
              ))}
            </View>
            {attemptedSubmit && !programKey && (
              <Text style={{ color: '#EF4444', fontSize: 12, marginTop: 4 }}>
                {lang === 'he' ? 'יש לבחור תוכנית לימודים' : 'Please select a program'}
              </Text>
            )}
          </View>
        )}

        {programKey && (
          <View style={s.section}>
            <Text style={[s.sectionTitle, !isRtl && s.textRight]}>
              {lang === 'he' ? '2. שנת לימוד נוכחית' : '2. Current Year of Study'}
            </Text>
            <View style={[s.yearRow, isRtl && s.rowReverse]}>
              {yearOptions.map((yr) => {
                const totalYears = yearOptions.length;
                const isFinalYear = degreeType === 'masters' ? yr === 1 : yr >= (totalYears === 4 ? 3 : totalYears);
                return (
                  <Pressable
                    key={yr}
                    style={[
                      s.yearOption,
                      yearOfStudy === yr && s.yearOptionActive,
                      isFinalYear && s.yearOptionFinal,
                      yearOfStudy === yr && isFinalYear && s.yearOptionFinalActive,
                    ]}
                    onPress={() => setYearOfStudy(yr)}
                  >
                    <Text style={[s.yearNum, yearOfStudy === yr && s.yearNumActive]}>
                      {lang === 'he' ? `שנה ${['א׳', 'ב׳', 'ג׳', 'ד׳'][yr - 1]}` : `Year ${yr}`}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {attemptedSubmit && !yearOfStudy && (
              <Text style={{ color: '#EF4444', fontSize: 12, marginTop: 4 }}>
                {lang === 'he' ? 'יש לבחור שנת לימוד' : 'Please select a year of study'}
              </Text>
            )}
          </View>
        )}

        <Pressable
          style={[s.saveBtn, saving && { opacity: 0.5 }]}
          onPress={() => {
            if (!canSave) {
              setAttemptedSubmit(true);
              Alert.alert(
                isRtl ? 'חוסר בפרטים' : 'Missing Info',
                isRtl ? 'אנא מלא את כל השדות המסומנים באדום' : 'Please fill in the fields marked in red'
              );
              return;
            }
            handleSave();
          }}
          disabled={saving}
        >
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.saveBtnText}>{lang === 'he' ? 'סיום הרשמה →' : 'Finish Sign Up →'}</Text>}
        </Pressable>

        <View style={{ height: 40 }} />

        <Modal visible={showFacultyModal} transparent animationType="fade" onRequestClose={() => setShowFacultyModal(false)}>
          <Pressable
            style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' }}
            onPress={() => setShowFacultyModal(false)}
          >
            <View style={{ backgroundColor: '#fff', borderRadius: 20, padding: 20, width: '85%', maxHeight: '70%' }}>
              <Text style={{ fontSize: 18, fontWeight: '700', marginBottom: 15, color: '#111', textAlign: lang === 'he' ? 'right' : 'left' }}>
                {lang === 'he' ? 'בחר פקולטה' : 'Select Faculty'}
              </Text>
              <ScrollView showsVerticalScrollIndicator={false}>
                {HIT_FACULTIES.map((item) => {
                  const isSelected = item.key === faculty;
                  return (
                    <Pressable
                      key={item.key}
                      style={{
                        paddingVertical: 14,
                        paddingHorizontal: 16,
                        borderRadius: 10,
                        backgroundColor: isSelected ? '#EFF6FF' : 'transparent',
                        borderWidth: 1,
                        borderColor: isSelected ? '#2E86FF' : 'transparent',
                        marginBottom: 6,
                      }}
                      onPress={() => {
                        setFaculty(item.key);
                        setProgramKey(null);
                        setYearOfStudy(null);
                        setShowFacultyModal(false);
                      }}
                    >
                      <Text style={{ fontSize: 15, fontWeight: isSelected ? '700' : '500', color: isSelected ? '#2E86FF' : '#444', textAlign: lang === 'he' ? 'right' : 'left' }}>
                        {item.label[lang]}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          </Pressable>
        </Modal>
      </ScrollView>
    </SafeAreaView>
  );
}
