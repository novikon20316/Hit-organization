import React, { useState, useRef } from 'react';
import * as Notifications from 'expo-notifications'
import axios from 'axios';
import {
  View, Text, Pressable, StyleSheet, ScrollView,Modal,
  ActivityIndicator, Alert, TextInput,
  Keyboard, TextInputProps
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context'
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  type User,
} from 'firebase/auth'
import { auth } from '../../src/firebase/firebase';
import { useRouter } from 'expo-router';
import type { Lang } from '../../components/i18n';
import { apiClient } from '@/src/api/apiClient';
import {
  HIT_FACULTIES,
  getFacultyByKey,
  getFilteredPrograms,
  PROGRAM_DEGREE_LENGTHS,
} from '@/constants/faculties';
import type { DegreeLevel, Program } from '@/types';

type FloatingInputProps = TextInputProps & {
  placeholder: string;
  isRtl: boolean;
};

// Creates the Firebase Auth account, or — if the email is already registered
// (e.g. the user closed the app after creating the account but before
// verifying/syncing) — signs back into that same pending account instead of
// failing outright. `alreadyVerified` tells the caller whether the
// Firestore profile sync can happen immediately or must wait for the
// verification-email step.
async function getOrCreateAuthUser(
  email: string,
  password: string
): Promise<{ user: User; alreadyVerified: boolean }> {
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    return { user: cred.user, alreadyVerified: false };
  } catch (e: any) {
    if (e.code !== 'auth/email-already-in-use') throw e;

    let cred;
    try {
      cred = await signInWithEmailAndPassword(auth, email, password);
    } catch {
      throw Object.assign(new Error('email-in-use-mismatched-password'), {
        code: 'auth/email-in-use-mismatched-password',
      });
    }
    return { user: cred.user, alreadyVerified: cred.user.emailVerified };
  }
}

const s = StyleSheet.create({
  // ... existing styles ...
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#445',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1.5,
    borderColor: '#E0E8FF',
    fontSize: 16,
    color: '#111',
  },
  // Keep the rest of your styles unchanged
  root:     { flex: 1, backgroundColor: '#F0F4FF' },
  content: { padding: 20 },
  rowReverse: { flexDirection: 'row-reverse' },
  textRight:  { textAlign: 'right' },
  textCenter: { textAlign: 'center' },
  langRow:  { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 8 },
  langBtn: {
    backgroundColor: '#EFF6FF', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: '#D0DEFF',
  },
  langText: { fontSize: 12, fontWeight: '700', color: '#2E86FF' },
  hero:       { alignItems: 'center', marginBottom: 32 },
  heroEmoji: { fontSize: 56, marginBottom: 12 },
  heroTitle: { fontSize: 26, fontWeight: '900', color: '#111', marginBottom: 8 },
  heroSub:    { fontSize: 14, color: '#8899BB', lineHeight: 20, textAlign: 'center' },
  section:      { marginBottom: 24 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: '#111', marginBottom: 14 },
  optionRow:     { flexDirection: 'row', gap: 12 },
  bigOption: {
    flex: 1, backgroundColor: '#fff', borderRadius: 16, padding: 18,
    alignItems: 'center', borderWidth: 2, borderColor: '#E0E8FF',
  },
  bigOptionActive:     { borderColor: '#2E86FF', backgroundColor: '#EFF6FF' },
  bigOptionEmoji:      { fontSize: 32, marginBottom: 8 },
  bigOptionText:       { fontSize: 14, fontWeight: '700', color: '#8899BB', textAlign: 'center' },
  bigOptionTextActive:{ color: '#2E86FF' },
  majorGrid:    { gap: 8 },
  majorOption: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14,
    borderWidth: 1.5, borderColor: '#E0E8FF',
  },
  majorOptionActive:  { borderColor: '#2E86FF', backgroundColor: '#EFF6FF' },
  majorText:          { fontSize: 14, fontWeight: '600', color: '#445', marginBottom: 2 },
  majorTextActive:    { color: '#2E86FF' },
  majorYears:         { fontSize: 11, color: '#9BA8C0' },
  majorYearsActive:   { color: '#60A5FA' },
  yearRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  yearOption: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14,
    alignItems: 'center', borderWidth: 1.5, borderColor: '#E0E8FF',
    minWidth: '45%', flex: 1,
  },
  yearOptionActive:      { borderColor: '#2E86FF', backgroundColor: '#EFF6FF' },
  yearOptionFinal:       { borderColor: '#10B981', borderStyle: 'dashed' },
  yearOptionFinalActive: { backgroundColor: '#ECFDF5', borderStyle: 'solid' },
  yearNum:               { fontSize: 15, fontWeight: '700', color: '#445', marginBottom: 4 },
  yearNumActive:         { color: '#2E86FF' },
  saveBtn: {
    backgroundColor: '#2E86FF', borderRadius: 16, paddingVertical: 16,
    alignItems: 'center', marginTop: 8,
    shadowColor: '#2E86FF', shadowOpacity: 0.35, shadowRadius: 12, elevation: 5,
  },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },
});

  const FloatingInput = ({ placeholder, isRtl, ...props }: FloatingInputProps) => {
    const [isFocused, setIsFocused] = useState(false);
    const showPlaceholder = !isFocused && !props.value;

    return (
      <View style={{ position: 'relative', marginBottom: 12 }}>
        {showPlaceholder && (
          <Text
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 16,
              left: !isRtl ? undefined : 16,
              right: !isRtl ? 16 : undefined,
              fontSize: 16,
              color: '#9BA8C0',
              zIndex: 1,
            }}
          >
            {placeholder}
          </Text>
        )}
        <TextInput
          {...props}
          placeholder=""
          onFocus={(e) => { setIsFocused(true); props.onFocus?.(e); }}
          onBlur={(e)  => { setIsFocused(false); props.onBlur?.(e); }}
          style={[s.input, { marginBottom: 0 }, isRtl && s.textRight, props.style]}
        />
      </View>
    );
  };

export default function ProfileSetup() {
  const router = useRouter();
  const passwordRef = useRef<TextInput>(null); // ← add with other state declarations
  const [showPassword, setShowPassword] = useState(false); // ← add with other state declarations
  const [lang,        setLang]        = useState<Lang>('he');
  const [displayName, setDisplayName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [studentId, setStudentId] = useState('');
  const [faculty, setFaculty] = useState<string | null>(null);
  const [showFacultyModal, setShowFacultyModal] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  // const [studentId,   setStudentId]   = useState(''); // For future use
  // Which specific program ROW was picked (e.g. 'msc_cs') — used only to
  // drive the UI (highlighting, degree level, year count). The value actually
  // sent to the server is selectedProgram.slug, not this key — see handleSave.
  const [programKey, setProgramKey] = useState<string | null>(null);
  const [yearOfStudy, setYearOfStudy] = useState<number | null>(null);
  const [saving,      setSaving]      = useState(false);
  const [stage,       setStage]       = useState<'form' | 'verify'>('form');
  const [resending,   setResending]   = useState(false);
  const pendingUserRef = useRef<User | null>(null);

  const isRtl = lang === 'he';
  const selectedFacultyData = faculty ? getFacultyByKey(faculty) : undefined;
  const facultyPrograms: Program[] = faculty ? getFilteredPrograms(faculty, 'both') : [];
  const selectedProgram = facultyPrograms.find((p) => p.key === programKey);
  // The degree type (bachelors/masters) is inherent to the chosen program —
  // no separate "degree type" step needed.
  const degreeType: DegreeLevel | null = selectedProgram?.level ?? null;

  const yearOptions: number[] = (() => {
    if (!selectedProgram) return [];
    if (selectedProgram.level === 'masters') return [1, 2];
    const years = PROGRAM_DEGREE_LENGTHS[selectedProgram.slug] ?? PROGRAM_DEGREE_LENGTHS.default;
    return Array.from({ length: years }, (_, i) => i + 1);
  })();

  // Validation: Ensure Name and Phone are filled along with academic details
 

  // Writes the Firestore profile — only ever called once the account's email
  // is verified (either just now, or found already-verified on a resumed
  // signup). Firebase issues the ID token's email_verified claim itself, and
  // the server independently re-checks it, so this can't be bypassed by
  // skipping straight to this call.
  const finishRegistration = async (user: User) => {
    const idToken = await user.getIdToken(true); // force refresh so email_verified is current
    let expoPushToken: string | null = null;
    try {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status === 'granted') {
        const tokenData = await Notifications.getExpoPushTokenAsync();
        expoPushToken = tokenData.data;
      }
    } catch (e) {
      console.warn('Could not get push token during registration:', e);
      // Non-fatal — _layout.tsx will retry on next login
    }
    const response = await apiClient.post('/api/users/sync', {
        newUid: user.uid,
        email: email,
        role: 'student',
        facultyId: faculty,
        degreeType: degreeType,
        yearOfStudy: yearOfStudy,
        major: selectedProgram?.slug ?? null,
        studentId: studentId,
        hasActiveProject: false,
        expoPushToken: null,
        displayName,
        isActive: true,
        profileComplete: true,
        language: lang,
        additionalRoles: [],
        isEligibleForProcess: false,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
      }
    );

    if (!response.data?.success) {
      throw new Error('Sync failed: ' + (response.data?.message ?? 'unknown error'));
    }

    console.log("✅ Sync confirmed, navigating to login");
    // Small buffer so Firestore propagation completes before onAuthStateChanged fires on login
    await new Promise(resolve => setTimeout(resolve, 1000));
    router.replace('/(auth)/login');
  };

  const handleSave = async () => {
    if (!canSave || !email || !password) {
      Alert.alert("Error", "Please fill all fields.");
      return;
    }
    setSaving(true);
    try {
      const { user, alreadyVerified } = await getOrCreateAuthUser(email.trim(), password);

      if (alreadyVerified) {
        // Resuming a signup where the email was already confirmed but the
        // Firestore sync never completed (e.g. a network drop right at the
        // end) — finish it now instead of sending another verification email.
        await finishRegistration(user);
        return;
      }

      pendingUserRef.current = user;
      await sendEmailVerification(user);
      setStage('verify');

    } catch (e: any) {
      console.error("Registration Error:", e);
      let msg = e.message;
      if (e.code === 'auth/email-already-in-use' || e.code === 'auth/email-in-use-mismatched-password') {
        msg = lang === 'he'
          ? 'כתובת האימייל כבר רשומה. אם זה החשבון שלך, התחבר או אפס סיסמה.'
          : "This email is already registered. If it's yours, log in or reset your password.";
      }
      if (e.code === 'auth/weak-password') msg = "Password is too weak.";
      Alert.alert(lang === 'he' ? 'שגיאה' : 'Error', msg);
    } finally {
      setSaving(false);
    }
  };

  const handleContinueAfterVerify = async () => {
    const user = pendingUserRef.current ?? auth.currentUser;
    if (!user) {
      Alert.alert(lang === 'he' ? 'שגיאה' : 'Error', lang === 'he' ? 'אנא התחל מחדש את ההרשמה.' : 'Please restart signup.');
      setStage('form');
      return;
    }
    setSaving(true);
    try {
      await user.reload();
      if (!user.emailVerified) {
        Alert.alert(
          lang === 'he' ? 'עדיין לא מאומת' : 'Not verified yet',
          lang === 'he'
            ? 'בדוק את תיבת הדואר שלך (כולל ספאם) ולחץ על קישור האימות.'
            : 'Check your inbox (including spam) and click the verification link.'
        );
        return;
      }
      await finishRegistration(user);
    } catch (e: any) {
      console.error('Verify-continue error:', e);
      Alert.alert(lang === 'he' ? 'שגיאה' : 'Error', e.message ?? 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  };

  const handleResendEmail = async () => {
    const user = pendingUserRef.current ?? auth.currentUser;
    if (!user) return;
    setResending(true);
    try {
      await sendEmailVerification(user);
      Alert.alert(
        lang === 'he' ? 'נשלח' : 'Sent',
        lang === 'he' ? 'מייל האימות נשלח שוב.' : 'Verification email resent.'
      );
    } catch (e: any) {
      Alert.alert(lang === 'he' ? 'שגיאה' : 'Error', e.message ?? 'Could not resend email.');
    } finally {
      setResending(false);
    }
  };

  const isValidStudentId = (id: string): boolean => {
    return /^\d{9}$/.test(id);
  }

  const getPasswordStrength = (password: string): { valid: boolean; errors: string[] } => {
    const errors: string[] = [];
    if (password.length < 8)           errors.push('At least 8 characters');
    if (!/[A-Z]/.test(password))       errors.push('At least 1 uppercase letter');
    if (!/[a-z]/.test(password))       errors.push('At least 1 lowercase letter');
    if (!/[0-9]/.test(password))       errors.push('At least 1 digit');
    if (!/[^A-Za-z0-9]/.test(password)) errors.push('At least 1 symbol (!@#$...)');
    return { valid: errors.length === 0, errors };
  }

  const passwordCheck = getPasswordStrength(password);

  const canSave =
    displayName.trim().length > 1 &&
    phoneNumber.length >= 9 &&
    email.includes('@') &&
    isValidStudentId(studentId) &&      // ← added
    passwordCheck.valid &&              // ← added
    faculty &&
    programKey &&
    yearOfStudy;

  if (stage === 'verify') {
    return (
      <SafeAreaView style={s.root}>
        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
          <View style={[s.langRow, isRtl && s.rowReverse]}>
            <Pressable style={s.langBtn} onPress={() => setLang(lang === 'he' ? 'en' : 'he')}>
              <Text style={s.langText}>{lang === 'he' ? 'EN' : 'עב'}</Text>
            </Pressable>
          </View>

          <View style={s.hero}>
            <Text style={s.heroEmoji}>📧</Text>
            <Text style={[s.heroTitle, s.textCenter]}>
              {lang === 'he' ? 'אמת את כתובת האימייל שלך' : 'Verify your email'}
            </Text>
            <Text style={[s.heroSub, s.textCenter]}>
              {lang === 'he'
                ? `שלחנו קישור אימות לכתובת ${email}. לחץ על הקישור ואז חזור לכאן.`
                : `We sent a verification link to ${email}. Click the link, then come back here.`}
            </Text>
          </View>

          <Pressable
            style={[s.saveBtn, saving && { opacity: 0.5 }]}
            onPress={handleContinueAfterVerify}
            disabled={saving}
          >
            {saving
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.saveBtnText}>
                  {lang === 'he' ? "אימתתי — המשך" : "I've verified — Continue"}
                </Text>
            }
          </Pressable>

          <Pressable
            style={{ marginTop: 18, alignItems: 'center' }}
            onPress={handleResendEmail}
            disabled={resending}
          >
            <Text style={{ color: '#2E86FF', fontWeight: '700', fontSize: 14 }}>
              {resending
                ? (lang === 'he' ? 'שולח...' : 'Sending...')
                : (lang === 'he' ? 'שלח שוב את מייל האימות' : 'Resend verification email')}
            </Text>
          </Pressable>

          <Pressable
            style={{ marginTop: 24, alignItems: 'center' }}
            onPress={() => setStage('form')}
          >
            <Text style={{ color: '#8899BB', fontSize: 13 }}>
              {lang === 'he' ? '← חזור לטופס' : '← Back to form'}
            </Text>
          </Pressable>
        </ScrollView>
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
            {lang === 'he' ? 'ברוך הבא!' : 'Welcome!'}
          </Text>
          <Text style={[s.heroSub, isRtl && s.textCenter]}>
            {lang === 'he'
              ? 'נשמח להכיר אותך טוב יותר כדי להתאים לך את הפרויקט המושלם.'
              : "Let's get to know you better to find your perfect project."}
          </Text>
        </View>

        {/* --- Personal Info Section --- */}
        <View style={s.section}>
          <Text style={[s.sectionTitle, isRtl && s.textRight]}>
            {lang === 'he' ? 'פרטים אישיים' : 'Personal Details'}
          </Text>
          
          <FloatingInput
            placeholder={lang === 'he' ? 'שם מלא' : 'Full Name'}
            value={displayName}
            onChangeText={setDisplayName}
            isRtl={isRtl}
          />

          <FloatingInput
            placeholder={lang === 'he' ? 'כתובת אימייל' : 'Email Address'}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            isRtl={isRtl}
          />

          <FloatingInput
            placeholder={lang === 'he' ? 'מספר טלפון' : 'Phone Number'}
            value={phoneNumber}
            onChangeText={setPhoneNumber}
            keyboardType="phone-pad"
            maxLength={10}
            isRtl={isRtl}
          />

          <View style={{ position: 'relative', justifyContent: 'center', marginBottom: 12 }}>
          {!showPassword && !password && !passwordFocused && (    // ← add passwordFocused state
            <Text
              pointerEvents="none"
              style={{
                position: 'absolute',
                top: 16,
                left: !isRtl ? undefined : 16,
                right: isRtl ? 16 : undefined,
                fontSize: 16,
                color: '#9BA8C0',
                zIndex: 1,
              }}
            >
              {lang === 'he' ? 'סיסמה' : 'Password'}
            </Text>
          )}
          <TextInput
            ref={passwordRef}
            style={[
              s.input,
              { marginBottom: 0, paddingRight: 48 },
              !isRtl && s.textRight,
              password.length > 0 && {
                borderColor: getPasswordStrength(password).valid ? '#10B981' : '#EF4444'
              }
            ]}
            placeholder=""                                        // ← clear real placeholder
            placeholderTextColor="#9BA8C0"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            onFocus={() => setPasswordFocused(true)}              // ← add these
            onBlur={() => setPasswordFocused(false)}              // ← add these
          />
          <Pressable
            onPress={() => setShowPassword(prev => !prev)}
            style={{ position: 'absolute', right: 14, padding: 4 }}
          >
            <Text style={{ fontSize: 18 }}>{showPassword ? '🙈' : '👁️'}</Text>
          </Pressable>
        </View>

          {password.length > 0 && !getPasswordStrength(password).valid && (
            <View style={{ marginTop: -8, marginBottom: 8 }}>
              {getPasswordStrength(password).errors.map((err) => (
                <Text key={err} style={{ color: '#EF4444', fontSize: 12, textAlign: isRtl ? 'right' : 'left' }}>
                  {'• '}{err}
                </Text>
              ))}
            </View>
          )}

           
          <FloatingInput
            placeholder={lang === 'he' ? 'תעודת זהות' : 'Student ID'}
            value={studentId}
            onChangeText={setStudentId}
            keyboardType="numeric"
            maxLength={9}
            isRtl={isRtl}
            style={studentId.length > 0 ? {
              borderColor: isValidStudentId(studentId) ? '#10B981' : '#EF4444'
            } : {}}
          />
          {studentId.length > 0 && !isValidStudentId(studentId) && (
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
                borderColor: showFacultyModal ? '#2E86FF' : '#E0E8FF',
                minHeight: 50,
              }
            ]} 
            onPress={() => setShowFacultyModal(true)}
          >
            <View style={{ 
              flexDirection: isRtl ? 'row-reverse' : 'row', 
              justifyContent: 'space-between', 
              alignItems: 'center' 
            }}>
              <Text style={{
                fontSize: 16,
                color: '#333',
              }}>
                {selectedFacultyData ? selectedFacultyData.label[lang] : (lang === 'he' ? 'בחר פקולטה' : 'Select a faculty')}
              </Text>
              <Text style={{ fontSize: 12, color: '#8899BB' }}>▼</Text>
            </View>
          </Pressable>

        {/* --- Degree / program (the faculty determines which programs show up; each
             program already carries its own bachelors/masters level) --- */}
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
                    {p.level === 'masters'
                      ? (lang === 'he' ? 'תואר שני' : "Master's")
                      : (lang === 'he' ? 'תואר ראשון' : "Bachelor's")}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* --- Year of study --- */}
        {programKey && (
          <View style={s.section}>
            <Text style={[s.sectionTitle, !isRtl && s.textRight]}>
              {lang === 'he' ? '2. שנת לימוד נוכחית' : '2. Current Year of Study'}
            </Text>

            <View style={[s.yearRow, isRtl && s.rowReverse]}>
              {yearOptions.map((yr) => {
                const totalYears = yearOptions.length;
                const isFinalYear = degreeType === 'masters'
                  ? yr === 1
                  : yr >= (totalYears === 4 ? 3 : totalYears);
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
                    <Text style={[
                      s.yearNum,
                      yearOfStudy === yr && s.yearNumActive,
                    ]}>
                      {lang === 'he' ? `שנה ${['א׳','ב׳','ג׳','ד׳'][yr-1]}` : `Year ${yr}`}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        {/* Save button */}
        <Pressable
          style={[s.saveBtn, saving && { opacity: 0.5 }]}
          onPress={() => {
            if (!canSave) {
              Alert.alert(isRtl ? "חוסר בפרטים" : "Missing Info", 
                          isRtl ? "אנא מלא את כל השדות בצורה תקינה" : "Please fill all fields correctly");
              return;
            }
            handleSave();
          }}
          disabled={saving}
        >
          {saving
            ? <ActivityIndicator color="#fff" />
            : <Text style={s.saveBtnText}>
                {lang === 'he' ? 'שמור והמשך →' : 'Save & Continue →'}
              </Text>
          }
        </Pressable>

        <Pressable
          style={{ marginTop: 16, alignItems: 'center' }}
          onPress={() => router.push('/privacy-policy' as any)}
        >
          <Text style={{ color: '#8899BB', fontSize: 12, textAlign: 'center' }}>
            {lang === 'he'
              ? 'בהרשמה אתה מסכים למדיניות הפרטיות שלנו'
              : 'By signing up, you agree to our Privacy Policy'}
          </Text>
        </Pressable>

        <View style={{ height: 40 }} />
          


        {/* ─── POPUP LIST MODAL ─── */}
        <Modal
          visible={showFacultyModal}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShowFacultyModal(false)}
        >
          <Pressable 
            style={{ 
              flex: 1, 
              backgroundColor: 'rgba(0,0,0,0.4)', 
              justifyContent: 'center', 
              alignItems: 'center' 
            }} 
            onPress={() => setShowFacultyModal(false)}
          >
            <View style={{ 
              backgroundColor: '#fff', 
              borderRadius: 20, 
              padding: 20, 
              width: '85%', 
              maxHeight: '70%',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.1,
              shadowRadius: 12,
              elevation: 5
            }}>
              <Text style={{ 
                fontSize: 18, 
                fontWeight: '700', 
                marginBottom: 15, 
                color: '#111',
                textAlign: lang === 'he' ? 'right' : 'left'
              }}>
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
                      <Text style={{
                        fontSize: 15,
                        fontWeight: isSelected ? '700' : '500',
                        color: isSelected ? '#2E86FF' : '#444',
                        textAlign: lang === 'he' ? 'right' : 'left'
                      }}>
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

