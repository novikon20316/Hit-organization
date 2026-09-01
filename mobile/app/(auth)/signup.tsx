import React, { useState, useRef } from 'react';
import * as Notifications from 'expo-notifications'
import axios from 'axios';
import {
  View, Text, Pressable, ScrollView,Modal,
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
import { verifyStudentEligibility } from '@/src/api/studentRoster';
import {
  HIT_FACULTIES,
  getFacultyByKey,
  getFilteredPrograms,
  PROGRAM_DEGREE_LENGTHS,
} from '@/constants/faculties';
import type { DegreeLevel, Program } from '@/types';
import { resolveTrackPolicy, type StudentTrack } from '@/constants/studentTrack';
import { SignupStyles } from '../../constants/styles';

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

// Mirrors server/src/services/emailValidation.ts's STUDENT_ALLOWED_EMAIL_DOMAINS
// — checked here too so a student never gets as far as creating a Firebase
// Auth account (and receiving a verification email) with a domain the
// backend will reject anyway at the sync step.
const STUDENT_ALLOWED_EMAIL_DOMAINS = ['gmail.com', 'my.hit.ac.il'];

function isAllowedStudentEmailDomain(value: string): boolean {
  const at = value.lastIndexOf('@');
  if (at === -1) return false;
  const domain = value.slice(at + 1).trim().toLowerCase();
  return STUDENT_ALLOWED_EMAIL_DOMAINS.includes(domain);
}

const s = SignupStyles;

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
          accessibilityLabel={placeholder}
          {...props}
          placeholder=""
          onFocus={(e) => { setIsFocused(true); props.onFocus?.(e); }}
          onBlur={(e)  => { setIsFocused(false); props.onBlur?.(e); }}
          style={[s.input, { marginBottom: 0 }, isRtl && s.textRight, props.style]}
        />
      </View>
    );
  };

// Red border override for FloatingInput/Pressable fields once a field is
// flagged as missing/invalid after a failed save attempt.
const missingFieldStyle = { borderColor: '#EF4444' };

// Small red helper line shown under a field once `attemptedSubmit` is true
// and that field is still empty/invalid — the same red used for the
// email-domain and password-strength errors elsewhere on this form.
const RequiredNote = ({ isRtl, children }: { isRtl: boolean; children: React.ReactNode }) => (
  <Text style={{ color: '#EF4444', fontSize: 12, marginTop: -8, marginBottom: 8, textAlign: isRtl ? 'right' : 'left' }}>
    {children}
  </Text>
);

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
  const [chosenTrack, setChosenTrack] = useState<StudentTrack | null>(null);
  // Set once the user tries to save with the form incomplete — turns on the
  // red "required field" indicators below instead of just the blocking Alert.
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);
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
  const trackPolicy = selectedProgram ? resolveTrackPolicy(degreeType, selectedProgram.slug) : null;

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
        chosenTrack: trackPolicy === 'signup_choice' ? chosenTrack : undefined,
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
      Alert.alert(
        lang === 'he' ? 'שגיאה' : 'Error',
        lang === 'he' ? 'יש למלא את כל השדות כראוי.' : 'Please fill all fields correctly.'
      );
      return;
    }
    setSaving(true);
    try {
      // Fail fast, before any Firebase Auth account is created — the entered
      // ID + chosen degree must be on the faculty's pre-uploaded roster (see
      // server/src/services/studentRoster.ts). syncData re-checks this
      // authoritatively later; this is purely so an ineligible registration
      // doesn't leave behind a half-created account.
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
      let msg = lang === 'he' ? 'ההרשמה נכשלה. נסה שוב.' : 'Registration failed. Please try again.';
      if (e.code === 'auth/email-already-in-use' || e.code === 'auth/email-in-use-mismatched-password') {
        msg = lang === 'he'
          ? 'כתובת האימייל כבר רשומה. אם זה החשבון שלך, התחבר או אפס סיסמה.'
          : "This email is already registered. If it's yours, log in or reset your password.";
      }
      if (e.code === 'auth/weak-password') msg = lang === 'he' ? 'הסיסמה חלשה מדי.' : 'Password is too weak.';
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

  // Israeli ID (Teudat Zehut) check-digit validation, not just a 9-digit
  // length check — each digit is weighted 1/2 alternating from the left,
  // any two-digit product is folded to a single digit by summing its
  // digits (e.g. 9*2=18 -> 1+8=9), and the total must be a multiple of 10.
  const isValidStudentId = (id: string): boolean => {
    if (!/^\d{9}$/.test(id)) return false;
    let sum = 0;
    for (let i = 0; i < id.length; i++) {
      const product = Number(id[i]) * (i % 2 === 0 ? 1 : 2);
      sum += product > 9 ? product - 9 : product;
    }
    return sum % 10 === 0;
  }

  const isValidPhoneNumber = (value: string): boolean => {
    return /^\d{10}$/.test(value);
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
    isValidPhoneNumber(phoneNumber) &&
    isAllowedStudentEmailDomain(email) &&
    isValidStudentId(studentId) &&      // ← added
    passwordCheck.valid &&              // ← added
    faculty &&
    programKey &&
    yearOfStudy &&
    (trackPolicy !== 'signup_choice' || !!chosenTrack);

  if (stage === 'verify') {
    return (
      <SafeAreaView style={s.root}>
        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
          <View style={[s.langRow, isRtl && s.rowReverse]}>
            <Pressable
              style={s.langBtn}
              onPress={() => setLang(lang === 'he' ? 'en' : 'he')}
              accessibilityRole="button"
              accessibilityLabel={lang === 'he' ? 'החלף שפה לאנגלית' : 'Switch language to Hebrew'}
            >
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
            accessibilityRole="button"
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
            accessibilityRole="button"
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
            accessibilityRole="button"
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
          <Pressable
            style={s.langBtn}
            onPress={() => setLang(lang === 'he' ? 'en' : 'he')}
            accessibilityRole="button"
            accessibilityLabel={lang === 'he' ? 'החלף שפה לאנגלית' : 'Switch language to Hebrew'}
          >
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
            style={attemptedSubmit && displayName.trim().length <= 1 ? missingFieldStyle : undefined}
          />
          {attemptedSubmit && displayName.trim().length <= 1 && (
            <RequiredNote isRtl={isRtl}>{lang === 'he' ? 'שדה חובה' : 'Required field'}</RequiredNote>
          )}

          <FloatingInput
            placeholder={lang === 'he' ? 'כתובת אימייל' : 'Email Address'}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            isRtl={isRtl}
            style={(attemptedSubmit && email.length === 0) || (email.length > 0 && !isAllowedStudentEmailDomain(email)) ? missingFieldStyle : undefined}
          />
          {attemptedSubmit && email.length === 0 ? (
            <RequiredNote isRtl={isRtl}>{lang === 'he' ? 'שדה חובה' : 'Required field'}</RequiredNote>
          ) : email.length > 0 && !isAllowedStudentEmailDomain(email) ? (
            <RequiredNote isRtl={isRtl}>
              {lang === 'he'
                ? `יש להשתמש בכתובת ${STUDENT_ALLOWED_EMAIL_DOMAINS.map((d) => `@${d}`).join(' או ')} בלבד`
                : `Must be an ${STUDENT_ALLOWED_EMAIL_DOMAINS.map((d) => `@${d}`).join(' or ')} address`}
            </RequiredNote>
          ) : null}

          <FloatingInput
            placeholder={lang === 'he' ? 'מספר טלפון' : 'Phone Number'}
            value={phoneNumber}
            onChangeText={(t) => setPhoneNumber(t.replace(/\D/g, '').slice(0, 10))}
            keyboardType="phone-pad"
            maxLength={10}
            isRtl={isRtl}
            style={attemptedSubmit && !isValidPhoneNumber(phoneNumber) ? missingFieldStyle : undefined}
          />
          {attemptedSubmit && !isValidPhoneNumber(phoneNumber) && (
            <RequiredNote isRtl={isRtl}>
              {phoneNumber.length === 0
                ? (lang === 'he' ? 'שדה חובה' : 'Required field')
                : (lang === 'he' ? 'מספר טלפון חייב להכיל בדיוק 10 ספרות' : 'Phone number must be exactly 10 digits')}
            </RequiredNote>
          )}

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
              },
              attemptedSubmit && password.length === 0 && missingFieldStyle,
            ]}
            placeholder=""                                        // ← clear real placeholder
            placeholderTextColor="#9BA8C0"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            onFocus={() => setPasswordFocused(true)}              // ← add these
            onBlur={() => setPasswordFocused(false)}              // ← add these
            accessibilityLabel={lang === 'he' ? 'סיסמה' : 'Password'}
          />
          <Pressable
            onPress={() => setShowPassword(prev => !prev)}
            style={{ position: 'absolute', right: 14, padding: 4 }}
            accessibilityRole="button"
            accessibilityLabel={showPassword
              ? (lang === 'he' ? 'הסתר סיסמה' : 'Hide password')
              : (lang === 'he' ? 'הצג סיסמה' : 'Show password')}
          >
            <Text style={{ fontSize: 18 }}>{showPassword ? '🙈' : '👁️'}</Text>
          </Pressable>
        </View>

          {attemptedSubmit && password.length === 0 ? (
            <RequiredNote isRtl={isRtl}>{lang === 'he' ? 'שדה חובה' : 'Required field'}</RequiredNote>
          ) : password.length > 0 && !getPasswordStrength(password).valid && (
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
            } : attemptedSubmit ? missingFieldStyle : {}}
          />
          {attemptedSubmit && studentId.length === 0 ? (
            <RequiredNote isRtl={isRtl}>{lang === 'he' ? 'שדה חובה' : 'Required field'}</RequiredNote>
          ) : studentId.length > 0 && !isValidStudentId(studentId) && (
            <Text style={{ color: '#EF4444', fontSize: 12, marginTop: -8, marginBottom: 8, textAlign: isRtl ? 'right' : 'left' }}>
              {lang === 'he' ? 'מספר תעודת הזהות אינו תקין. בדוק את הספרות שהזנת' : 'Invalid ID number. Please check the digits you entered'}
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
              }
            ]}
            onPress={() => setShowFacultyModal(true)}
            accessibilityRole="button"
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
          {attemptedSubmit && !faculty && (
            <RequiredNote isRtl={isRtl}>{lang === 'he' ? 'יש לבחור פקולטה' : 'Please select a faculty'}</RequiredNote>
          )}

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
                  onPress={() => { setProgramKey(p.key); setYearOfStudy(null); setChosenTrack(null); }}
                  accessibilityRole="button"
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
            {attemptedSubmit && !programKey && (
              <RequiredNote isRtl={isRtl}>{lang === 'he' ? 'יש לבחור תוכנית לימודים' : 'Please select a program'}</RequiredNote>
            )}
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
                    accessibilityRole="button"
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
            {attemptedSubmit && !yearOfStudy && (
              <RequiredNote isRtl={isRtl}>{lang === 'he' ? 'יש לבחור שנת לימוד' : 'Please select a year of study'}</RequiredNote>
            )}
          </View>
        )}

        {/* --- Track (thesis vs. project) — only for programs where the
             student picks at signup and it locks immediately; a
             coordinator-gated program (e.g. M.Sc Computer Science) has no
             choice here at all, and everything else is project-only. --- */}
        {trackPolicy === 'signup_choice' && (
          <View style={s.section}>
            <Text style={[s.sectionTitle, !isRtl && s.textRight]}>
              {lang === 'he' ? '3. מסלול' : '3. Track'}
            </Text>
            <Text style={{ fontSize: 12, color: '#8899BB', marginBottom: 10, textAlign: isRtl ? 'right' : 'left' }}>
              {lang === 'he'
                ? 'בחירה זו סופית ולא ניתן לשנותה בעצמך לאחר ההרשמה.'
                : 'This choice is final — you will not be able to change it yourself after signing up.'}
            </Text>
            <View style={[s.yearRow, isRtl && s.rowReverse]}>
              {(['thesis', 'project'] as const).map((track) => (
                <Pressable
                  key={track}
                  style={[s.yearOption, chosenTrack === track && s.yearOptionActive]}
                  onPress={() => setChosenTrack(track)}
                  accessibilityRole="button"
                >
                  <Text style={[s.yearNum, chosenTrack === track && s.yearNumActive]}>
                    {track === 'thesis'
                      ? (lang === 'he' ? 'תזה' : 'Thesis')
                      : (lang === 'he' ? 'פרויקט' : 'Project')}
                  </Text>
                </Pressable>
              ))}
            </View>
            {attemptedSubmit && !chosenTrack && (
              <RequiredNote isRtl={isRtl}>{lang === 'he' ? 'יש לבחור מסלול' : 'Please select a track'}</RequiredNote>
            )}
          </View>
        )}

        {/* Save button */}
        <Pressable
          style={[s.saveBtn, saving && { opacity: 0.5 }]}
          onPress={() => {
            if (!canSave) {
              setAttemptedSubmit(true);
              Alert.alert(isRtl ? "חוסר בפרטים" : "Missing Info",
                          isRtl ? "אנא מלא את כל השדות המסומנים באדום" : "Please fill in the fields marked in red");
              return;
            }
            handleSave();
          }}
          disabled={saving}
          accessibilityRole="button"
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
          accessibilityRole="link"
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
                      accessibilityRole="button"
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

