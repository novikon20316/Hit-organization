// app/(auth)/signup.tsx
// Restyled to match web's app/(auth)/signup/page.tsx design (same paper/
// surface/ink palette, role-rail card, labeled fields) — validation/
// registration logic below is unchanged. The faculty/program/year/track
// pickers stay as native grids and a modal (there's no equivalent to a
// web <select> here), just re-skinned with the same tokens.
import React, { useState, useRef } from 'react';
import * as Notifications from 'expo-notifications'
import {
  View, Text, Pressable, ScrollView, Modal,
  ActivityIndicator, Alert, TextInput,
  Keyboard, StyleSheet,
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

// Same tokens as web's app/globals.css (--paper/--surface/--ink/--muted/
// --line/--primary/--success*/--danger*/--accent) — kept local to this
// screen since mobile's dashboards draw from a separate palette
// (constants/theme.ts's `ap`/`palette`), and this signup screen exists
// purely to visually match web's.
const colors = {
  paper: '#f7f6f2',
  surface: '#ffffff',
  ink: '#1c2333',
  muted: '#6b7280',
  line: '#e4e1d8',
  primary: '#1e3a5f',
  primaryTint: 'rgba(30,58,95,0.08)',
  primaryInk: '#ffffff',
  success: '#3f6b4c',
  successBg: '#eaf1ec',
  danger: '#a8433a',
  dangerBg: '#f7e9e7',
  accent: '#b8862e',
  accentBg: 'rgba(184,134,46,0.12)',
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

function ErrorNote({ isRtl, children }: { isRtl: boolean; children: React.ReactNode }) {
  return <Text style={[styles.errorText, isRtl && styles.textRight]}>{children}</Text>;
}

export default function ProfileSetup() {
  const router = useRouter();
  const passwordRef = useRef<TextInput>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [lang,        setLang]        = useState<Lang>('he');
  const [displayName, setDisplayName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [studentId, setStudentId] = useState('');
  const [faculty, setFaculty] = useState<string | null>(null);
  const [showFacultyModal, setShowFacultyModal] = useState(false);
  const [nameFocused, setNameFocused] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [phoneFocused, setPhoneFocused] = useState(false);
  const [studentIdFocused, setStudentIdFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
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
        phoneNumber: phoneNumber,
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
    isValidStudentId(studentId) &&
    passwordCheck.valid &&
    faculty &&
    programKey &&
    yearOfStudy &&
    (trackPolicy !== 'signup_choice' || !!chosenTrack);

  if (stage === 'verify') {
    return (
      <SafeAreaView style={styles.root}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={[styles.langRow, isRtl && styles.rowReverse]}>
            <Pressable
              style={styles.langBtn}
              onPress={() => setLang(lang === 'he' ? 'en' : 'he')}
              accessibilityRole="button"
              accessibilityLabel={lang === 'he' ? 'החלף שפה לאנגלית' : 'Switch language to Hebrew'}
            >
              <Text style={styles.langText}>{lang === 'he' ? 'EN' : 'עב'}</Text>
            </Pressable>
          </View>

          <View style={styles.hero}>
            <Text style={styles.heroEmoji}>📧</Text>
            <Text style={styles.title}>
              {lang === 'he' ? 'אמת את כתובת האימייל שלך' : 'Verify your email'}
            </Text>
            <Text style={styles.subtitle}>
              {lang === 'he'
                ? `שלחנו קישור אימות לכתובת ${email}. לחץ על הקישור ואז חזור לכאן.`
                : `We sent a verification link to ${email}. Click the link, then come back here.`}
            </Text>
          </View>

          <Pressable
            style={[styles.saveBtn, saving && styles.buttonDisabled]}
            onPress={handleContinueAfterVerify}
            disabled={saving}
            accessibilityRole="button"
          >
            {saving
              ? <ActivityIndicator color={colors.primaryInk} />
              : <Text style={styles.saveBtnText}>
                  {lang === 'he' ? "אימתתי — המשך" : "I've verified — Continue"}
                </Text>
            }
          </Pressable>

          <Pressable
            style={styles.resendLink}
            onPress={handleResendEmail}
            disabled={resending}
            accessibilityRole="button"
          >
            <Text style={styles.resendLinkText}>
              {resending
                ? (lang === 'he' ? 'שולח...' : 'Sending...')
                : (lang === 'he' ? 'שלח שוב את מייל האימות' : 'Resend verification email')}
            </Text>
          </Pressable>

          <Pressable
            style={styles.backLink}
            onPress={() => setStage('form')}
            accessibilityRole="button"
          >
            <Text style={styles.backLinkText}>
              {lang === 'he' ? '← חזור לטופס' : '← Back to form'}
            </Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onScrollBeginDrag={Keyboard.dismiss}
      >

        <View style={[styles.langRow, isRtl && styles.rowReverse]}>
          <Pressable
            style={styles.langBtn}
            onPress={() => setLang(lang === 'he' ? 'en' : 'he')}
            accessibilityRole="button"
            accessibilityLabel={lang === 'he' ? 'החלף שפה לאנגלית' : 'Switch language to Hebrew'}
          >
            <Text style={styles.langText}>{lang === 'he' ? 'EN' : 'עב'}</Text>
          </Pressable>
        </View>

        <View style={styles.headerBlock}>
          <Text style={styles.title}>
            {lang === 'he' ? 'הרשמת סטודנט' : 'Student Sign Up'}
          </Text>
          <Text style={styles.subtitle}>
            {lang === 'he'
              ? 'ליצירת חשבון יש להיות ברשימת הסטודנטים המאושרים של הפקולטה'
              : "You'll need to be on your faculty's approved students list"}
          </Text>
        </View>

        <View style={styles.card}>
          <Field label={lang === 'he' ? 'שם מלא' : 'Full Name'}>
            <TextInput
              value={displayName}
              onChangeText={setDisplayName}
              onFocus={() => setNameFocused(true)}
              onBlur={() => setNameFocused(false)}
              style={[
                styles.input,
                isRtl && styles.textRight,
                nameFocused && styles.inputFocused,
                attemptedSubmit && displayName.trim().length <= 1 && styles.inputError,
              ]}
              accessibilityLabel={lang === 'he' ? 'שם מלא' : 'Full Name'}
            />
          </Field>
          {attemptedSubmit && displayName.trim().length <= 1 && (
            <ErrorNote isRtl={isRtl}>{lang === 'he' ? 'שדה חובה' : 'Required field'}</ErrorNote>
          )}

          <Field label={lang === 'he' ? 'דוא"ל' : 'Email'}>
            <TextInput
              value={email}
              onChangeText={setEmail}
              onFocus={() => setEmailFocused(true)}
              onBlur={() => setEmailFocused(false)}
              keyboardType="email-address"
              autoCapitalize="none"
              style={[
                styles.input,
                styles.ltrInput,
                emailFocused && styles.inputFocused,
                ((attemptedSubmit && email.length === 0) || (email.length > 0 && !isAllowedStudentEmailDomain(email))) && styles.inputError,
              ]}
              accessibilityLabel={lang === 'he' ? 'דוא"ל' : 'Email'}
            />
          </Field>
          {attemptedSubmit && email.length === 0 ? (
            <ErrorNote isRtl={isRtl}>{lang === 'he' ? 'שדה חובה' : 'Required field'}</ErrorNote>
          ) : email.length > 0 && !isAllowedStudentEmailDomain(email) ? (
            <ErrorNote isRtl={isRtl}>
              {lang === 'he'
                ? `יש להשתמש בכתובת ${STUDENT_ALLOWED_EMAIL_DOMAINS.map((d) => `@${d}`).join(' או ')} בלבד`
                : `Must be an ${STUDENT_ALLOWED_EMAIL_DOMAINS.map((d) => `@${d}`).join(' or ')} address`}
            </ErrorNote>
          ) : null}

          <Field label={lang === 'he' ? 'טלפון (10 ספרות)' : 'Phone (10 digits)'}>
            <TextInput
              value={phoneNumber}
              onChangeText={(t) => setPhoneNumber(t.replace(/\D/g, '').slice(0, 10))}
              onFocus={() => setPhoneFocused(true)}
              onBlur={() => setPhoneFocused(false)}
              keyboardType="phone-pad"
              maxLength={10}
              style={[
                styles.input,
                styles.ltrInput,
                phoneFocused && styles.inputFocused,
                attemptedSubmit && !isValidPhoneNumber(phoneNumber) && styles.inputError,
              ]}
              accessibilityLabel={lang === 'he' ? 'טלפון' : 'Phone'}
            />
          </Field>
          {attemptedSubmit && !isValidPhoneNumber(phoneNumber) && (
            <ErrorNote isRtl={isRtl}>
              {phoneNumber.length === 0
                ? (lang === 'he' ? 'שדה חובה' : 'Required field')
                : (lang === 'he' ? 'מספר טלפון חייב להכיל בדיוק 10 ספרות' : 'Phone number must be exactly 10 digits')}
            </ErrorNote>
          )}

          <Field label={lang === 'he' ? 'סיסמה' : 'Password'}>
            <View style={styles.passwordRow}>
              <TextInput
                ref={passwordRef}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                onFocus={() => setPasswordFocused(true)}
                onBlur={() => setPasswordFocused(false)}
                style={[
                  styles.input,
                  styles.ltrInput,
                  styles.passwordInput,
                  passwordFocused && styles.inputFocused,
                  password.length > 0 && (passwordCheck.valid ? styles.inputSuccess : styles.inputError),
                  attemptedSubmit && password.length === 0 && styles.inputError,
                ]}
                accessibilityLabel={lang === 'he' ? 'סיסמה' : 'Password'}
              />
              <Pressable
                onPress={() => setShowPassword(prev => !prev)}
                style={styles.eyeButton}
                accessibilityRole="button"
                accessibilityLabel={showPassword
                  ? (lang === 'he' ? 'הסתר סיסמה' : 'Hide password')
                  : (lang === 'he' ? 'הצג סיסמה' : 'Show password')}
              >
                <Text style={{ fontSize: 18 }}>{showPassword ? '🙈' : '👁️'}</Text>
              </Pressable>
            </View>
          </Field>
          {attemptedSubmit && password.length === 0 ? (
            <ErrorNote isRtl={isRtl}>{lang === 'he' ? 'שדה חובה' : 'Required field'}</ErrorNote>
          ) : password.length > 0 && !passwordCheck.valid && (
            <View style={styles.passwordErrorList}>
              {passwordCheck.errors.map((err) => (
                <ErrorNote key={err} isRtl={isRtl}>{'• '}{err}</ErrorNote>
              ))}
            </View>
          )}

          <Field label={lang === 'he' ? 'מספר תעודת זהות (9 ספרות)' : 'Student ID (9 digits)'}>
            <TextInput
              value={studentId}
              onChangeText={(t) => setStudentId(t.replace(/\D/g, '').slice(0, 9))}
              keyboardType="numeric"
              maxLength={9}
              onFocus={() => setStudentIdFocused(true)}
              onBlur={() => setStudentIdFocused(false)}
              style={[
                styles.input,
                styles.ltrInput,
                studentIdFocused && styles.inputFocused,
                studentId.length > 0
                  ? (isValidStudentId(studentId) ? styles.inputSuccess : styles.inputError)
                  : (attemptedSubmit && styles.inputError),
              ]}
              accessibilityLabel={lang === 'he' ? 'מספר תעודת זהות' : 'Student ID'}
            />
          </Field>
          {attemptedSubmit && studentId.length === 0 ? (
            <ErrorNote isRtl={isRtl}>{lang === 'he' ? 'שדה חובה' : 'Required field'}</ErrorNote>
          ) : studentId.length > 0 && !isValidStudentId(studentId) && (
            <ErrorNote isRtl={isRtl}>
              {lang === 'he' ? 'מספר תעודת הזהות אינו תקין. בדוק את הספרות שהזנת' : 'Invalid ID number. Please check the digits you entered'}
            </ErrorNote>
          )}

          <Field label={lang === 'he' ? 'פקולטה' : 'Faculty'}>
            <Pressable
              style={[
                styles.selectInput,
                showFacultyModal && styles.inputFocused,
                attemptedSubmit && !faculty && styles.inputError,
              ]}
              onPress={() => setShowFacultyModal(true)}
              accessibilityRole="button"
            >
              <Text style={selectedFacultyData ? styles.selectValue : styles.selectPlaceholder}>
                {selectedFacultyData ? selectedFacultyData.label[lang] : (lang === 'he' ? 'בחר פקולטה' : 'Select a faculty')}
              </Text>
              <Text style={styles.selectChevron}>▾</Text>
            </Pressable>
          </Field>
          {attemptedSubmit && !faculty && (
            <ErrorNote isRtl={isRtl}>{lang === 'he' ? 'יש לבחור פקולטה' : 'Please select a faculty'}</ErrorNote>
          )}

          {/* --- Degree / program (the faculty determines which programs show up; each
               program already carries its own bachelors/masters level) --- */}
          {faculty && (
            <Field label={lang === 'he' ? 'תוכנית לימודים' : 'Program'}>
              <View style={styles.majorGrid}>
                {facultyPrograms.map((p) => (
                  <Pressable
                    key={p.key}
                    style={[styles.majorOption, programKey === p.key && styles.majorOptionActive]}
                    onPress={() => { setProgramKey(p.key); setYearOfStudy(null); setChosenTrack(null); }}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.majorText, programKey === p.key && styles.majorTextActive, isRtl && styles.textRight]}>
                      {p.label[lang]}
                    </Text>
                    <Text style={[styles.majorYears, programKey === p.key && styles.majorYearsActive]}>
                      {p.level === 'masters'
                        ? (lang === 'he' ? 'תואר שני' : "Master's")
                        : (lang === 'he' ? 'תואר ראשון' : "Bachelor's")}
                    </Text>
                  </Pressable>
                ))}
              </View>
              {attemptedSubmit && !programKey && (
                <ErrorNote isRtl={isRtl}>{lang === 'he' ? 'יש לבחור תוכנית לימודים' : 'Please select a program'}</ErrorNote>
              )}
            </Field>
          )}

          {/* --- Year of study --- */}
          {programKey && (
            <Field label={lang === 'he' ? 'שנת לימודים' : 'Year of Study'}>
              <View style={[styles.yearRow, isRtl && styles.rowReverse]}>
                {yearOptions.map((yr) => {
                  const totalYears = yearOptions.length;
                  const isFinalYear = degreeType === 'masters'
                    ? yr === 1
                    : yr >= (totalYears === 4 ? 3 : totalYears);
                  return (
                    <Pressable
                      key={yr}
                      style={[
                        styles.yearOption,
                        yearOfStudy === yr && styles.yearOptionActive,
                        isFinalYear && styles.yearOptionFinal,
                        yearOfStudy === yr && isFinalYear && styles.yearOptionFinalActive,
                      ]}
                      onPress={() => setYearOfStudy(yr)}
                      accessibilityRole="button"
                    >
                      <Text style={[
                        styles.yearNum,
                        yearOfStudy === yr && styles.yearNumActive,
                      ]}>
                        {lang === 'he' ? `שנה ${['א׳','ב׳','ג׳','ד׳'][yr-1]}` : `Year ${yr}`}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {attemptedSubmit && !yearOfStudy && (
                <ErrorNote isRtl={isRtl}>{lang === 'he' ? 'יש לבחור שנת לימוד' : 'Please select a year of study'}</ErrorNote>
              )}
            </Field>
          )}

          {/* --- Track (thesis vs. project) — only for programs where the
               student picks at signup and it locks immediately; a
               coordinator-gated program (e.g. M.Sc Computer Science) has no
               choice here at all, and everything else is project-only. --- */}
          {trackPolicy === 'signup_choice' && (
            <Field label={lang === 'he' ? 'מסלול' : 'Track'}>
              <Text style={[styles.trackNote, isRtl && styles.textRight]}>
                {lang === 'he'
                  ? 'בחירה זו סופית ולא ניתן לשנותה בעצמך לאחר ההרשמה.'
                  : 'This choice is final — you will not be able to change it yourself after signing up.'}
              </Text>
              <View style={[styles.yearRow, isRtl && styles.rowReverse]}>
                {(['thesis', 'project'] as const).map((track) => (
                  <Pressable
                    key={track}
                    style={[styles.yearOption, chosenTrack === track && styles.yearOptionActive]}
                    onPress={() => setChosenTrack(track)}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.yearNum, chosenTrack === track && styles.yearNumActive]}>
                      {track === 'thesis'
                        ? (lang === 'he' ? 'תזה' : 'Thesis')
                        : (lang === 'he' ? 'פרויקט' : 'Project')}
                    </Text>
                  </Pressable>
                ))}
              </View>
              {attemptedSubmit && !chosenTrack && (
                <ErrorNote isRtl={isRtl}>{lang === 'he' ? 'יש לבחור מסלול' : 'Please select a track'}</ErrorNote>
              )}
            </Field>
          )}

          <Pressable
            style={styles.privacyLink}
            onPress={() => router.push('/privacy-policy' as any)}
            accessibilityRole="link"
          >
            <Text style={styles.privacyText}>
              {lang === 'he'
                ? 'בהרשמה אתה מסכים למדיניות הפרטיות שלנו'
                : 'By signing up, you agree to our Privacy Policy'}
            </Text>
          </Pressable>

          <Pressable
            style={[styles.saveBtn, saving && styles.buttonDisabled]}
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
              ? <ActivityIndicator color={colors.primaryInk} />
              : <Text style={styles.saveBtnText}>
                  {lang === 'he' ? 'הרשמה' : 'Sign Up'}
                </Text>
            }
          </Pressable>
        </View>

        <Pressable
          style={styles.loginLink}
          onPress={() => router.replace('/(auth)/login' as any)}
          accessibilityRole="link"
        >
          <Text style={styles.loginLinkText}>
            {lang === 'he' ? 'כבר יש לך חשבון? התחבר' : 'Already have an account? Log in'}
          </Text>
        </Pressable>

        <View style={{ height: 40 }} />

        {/* ─── Faculty picker modal ─── */}
        <Modal
          visible={showFacultyModal}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShowFacultyModal(false)}
        >
          <Pressable
            style={styles.modalOverlay}
            onPress={() => setShowFacultyModal(false)}
          >
            <View style={styles.modalDialog}>
              <Text style={[styles.modalTitle, isRtl && styles.textRight]}>
                {lang === 'he' ? 'בחר פקולטה' : 'Select Faculty'}
              </Text>

              <ScrollView showsVerticalScrollIndicator={false}>
                {HIT_FACULTIES.map((item) => {
                  const isSelected = item.key === faculty;
                  return (
                    <Pressable
                      key={item.key}
                      style={[styles.modalItem, isSelected && styles.modalItemActive]}
                      onPress={() => {
                        setFaculty(item.key);
                        setProgramKey(null);
                        setYearOfStudy(null);
                        setShowFacultyModal(false);
                      }}
                      accessibilityRole="button"
                    >
                      <Text style={[
                        styles.modalItemText,
                        isSelected && styles.modalItemTextActive,
                        isRtl && styles.textRight,
                      ]}>
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

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  scrollContent: { padding: 20, paddingBottom: 40 },

  langRow: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 12 },
  langBtn: {
    backgroundColor: colors.surface, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: colors.line,
  },
  langText: { fontSize: 12, fontWeight: '700', color: colors.primary },

  headerBlock: { alignItems: 'center', marginBottom: 20 },
  title: { fontSize: 22, fontWeight: '600', color: colors.ink, textAlign: 'center' },
  subtitle: { fontSize: 13, color: colors.muted, marginTop: 4, textAlign: 'center' },

  hero: { alignItems: 'center', marginBottom: 24 },
  heroEmoji: { fontSize: 40, marginBottom: 8 },

  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
    padding: 20,
  },

  field: { marginBottom: 14 },
  label: { fontSize: 13, fontWeight: '500', color: colors.ink, marginBottom: 6 },

  input: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.paper,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.ink,
  },
  ltrInput: { textAlign: 'left', writingDirection: 'ltr' },
  inputFocused: { borderColor: colors.primary, backgroundColor: colors.surface },
  inputError: { borderColor: colors.danger },
  inputSuccess: { borderColor: colors.success },

  passwordRow: { position: 'relative', justifyContent: 'center' },
  passwordInput: { paddingRight: 44 },
  eyeButton: { position: 'absolute', right: 10, padding: 4 },

  errorText: { color: colors.danger, fontSize: 12, marginTop: 4 },
  passwordErrorList: { marginTop: 4 },

  selectInput: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.paper,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  selectValue: { fontSize: 14, color: colors.ink },
  selectPlaceholder: { fontSize: 14, color: colors.muted },
  selectChevron: { fontSize: 12, color: colors.muted },

  majorGrid: { gap: 8 },
  majorOption: {
    backgroundColor: colors.surface, borderRadius: 10, padding: 14,
    borderWidth: 1, borderColor: colors.line,
  },
  majorOptionActive: { borderColor: colors.primary, backgroundColor: colors.primaryTint },
  majorText: { fontSize: 14, fontWeight: '600', color: colors.ink, marginBottom: 2 },
  majorTextActive: { color: colors.primary },
  majorYears: { fontSize: 11, color: colors.muted },
  majorYearsActive: { color: colors.primary },

  yearRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  yearOption: {
    backgroundColor: colors.surface, borderRadius: 10, padding: 14,
    alignItems: 'center', borderWidth: 1, borderColor: colors.line,
    minWidth: '45%', flex: 1,
  },
  yearOptionActive: { borderColor: colors.primary, backgroundColor: colors.primaryTint },
  yearOptionFinal: { borderColor: colors.accent, borderStyle: 'dashed' },
  yearOptionFinalActive: { backgroundColor: colors.accentBg, borderStyle: 'solid' },
  yearNum: { fontSize: 15, fontWeight: '700', color: colors.ink },
  yearNumActive: { color: colors.primary },

  trackNote: { fontSize: 12, color: colors.muted, marginBottom: 10 },

  privacyLink: { marginTop: 4, marginBottom: 4, alignItems: 'center' },
  privacyText: { fontSize: 12, color: colors.muted, textAlign: 'center' },

  saveBtn: { backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 12, alignItems: 'center', marginTop: 12 },
  saveBtnText: { color: colors.primaryInk, fontSize: 14, fontWeight: '600' },
  buttonDisabled: { opacity: 0.6 },

  loginLink: { marginTop: 16, alignItems: 'center' },
  loginLinkText: { color: colors.primary, fontSize: 13 },

  resendLink: { marginTop: 18, alignItems: 'center' },
  resendLinkText: { color: colors.primary, fontWeight: '700', fontSize: 14 },
  backLink: { marginTop: 24, alignItems: 'center' },
  backLinkText: { color: colors.muted, fontSize: 13 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  modalDialog: {
    backgroundColor: colors.surface, borderRadius: 12, padding: 20,
    width: '85%', maxHeight: '70%',
  },
  modalTitle: { fontSize: 16, fontWeight: '700', marginBottom: 14, color: colors.ink },
  modalItem: { paddingVertical: 14, paddingHorizontal: 16, borderRadius: 8, borderWidth: 1, borderColor: 'transparent', marginBottom: 6 },
  modalItemActive: { backgroundColor: colors.primaryTint, borderColor: colors.primary },
  modalItemText: { fontSize: 15, fontWeight: '500', color: colors.ink },
  modalItemTextActive: { fontWeight: '700', color: colors.primary },

  rowReverse: { flexDirection: 'row-reverse' },
  textRight: { textAlign: 'right' },
});
