import React, { useState, useRef } from 'react';
import * as Notifications from 'expo-notifications'
import axios from 'axios';
import {
  View, Text, Pressable, StyleSheet, ScrollView,Modal,
  ActivityIndicator, Alert, TextInput,
  Keyboard, TextInputProps 
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context'
import { createUserWithEmailAndPassword } from 'firebase/auth'
import { auth } from '../../src/firebase/firebase';
import { useRouter } from 'expo-router';
import type { Lang } from '../../components/i18n';

type FloatingInputProps = TextInputProps & {
  placeholder: string;
  isRtl: boolean;
};

const DEGREE_LENGTHS: Record<string, number> = {
  computer_science: 3,
  electrical: 4,
  software: 3,
  industrial: 4,
  mechanical: 4,
  learning_technology: 3,
  default: 4,
};

type DegreeType = 'bachelors' | 'masters';
type Major = keyof typeof DEGREE_LENGTHS;

const MAJORS: Array<{ id: Major; he: string; en: string; years: number }> = [
  { id: 'computer_science',    he: 'מדעי המחשב',            en: 'Computer Science',       years: 3 },
  { id: 'electrical',          he: 'הנדסת חשמל ואלקטרוניקה',  en: 'Electrical Engineering', years: 4 },
  { id: 'software',            he: 'הנדסת תוכנה',             en: 'Software Engineering',   years: 3 },
  { id: 'industrial',          he: 'הנדסת תעשייה וניהול',      en: 'Industrial Engineering', years: 4 },
  { id: 'mechanical',          he: 'הנדסה מכנית',             en: 'Mechanical Engineering', years: 4 },
  { id: 'learning_technology', he: 'טכנולוגיות למידה',        en: 'Learning Technology',    years: 3 },
];

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
  const [faculty, setFaculty] = useState<Major>('computer_science');
  const [showFacultyModal, setShowFacultyModal] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  // const [studentId,   setStudentId]   = useState(''); // For future use
  const [degreeType,  setDegreeType]  = useState<DegreeType | null>(null);
  const [major,       setMajor]       = useState<Major | null>(null);
  const [yearOfStudy, setYearOfStudy] = useState<number | null>(null);
  const [saving,      setSaving]      = useState(false);

  const isRtl = lang === 'he';
  const selectedMajorData = MAJORS.find((m) => m.id === major);

  const yearOptions: number[] = (() => {
    if (!degreeType) return [];
    if (degreeType === 'masters') return [1, 2];
    if (!major || !selectedMajorData) return [1, 2, 3, 4];
    return Array.from({ length: selectedMajorData.years }, (_, i) => i + 1);
  })();

  // Validation: Ensure Name and Phone are filled along with academic details
 

  const handleSave = async () => {
    if (!canSave || !email || !password) {
      Alert.alert("Error", "Please fill all fields.");
      return;
    }
    setSaving(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email.trim(), password);
      const user = userCredential.user;
      const idToken = await user.getIdToken();
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
      const response = await axios.post(
        'http://10.100.102.22:5000/api/users/sync',
        {
          newUid: user.uid,
          email: email,
          role: 'student',
          facultyId: faculty,
          degreeType: degreeType,
          yearOfStudy: yearOfStudy,
          major: faculty,
          studentId: studentId,
          hasActiveProject: false,
          expoPushToken: null,
          displayName,
          isActive: true,
          profileComplete: true,
          language: lang,
          additionalRoles: [] 
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

    } catch (e: any) {
      console.error("Registration Error:", e);
      let msg = e.message;
      if (e.code === 'auth/email-already-in-use') msg = "This email is already registered.";
      if (e.code === 'auth/weak-password') msg = "Password is too weak.";
      Alert.alert(lang === 'he' ? 'שגיאה' : 'Error', msg);
    } finally {
      setSaving(false);
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
    degreeType && 
    major && 
    yearOfStudy;

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
                {MAJORS.find(m => m.id === faculty)?.[lang] || faculty}
              </Text>
              <Text style={{ fontSize: 12, color: '#8899BB' }}>▼</Text>
            </View>
          </Pressable>
        {/* --- Degree type --- */}
        <View style={s.section}>
          <Text style={[s.sectionTitle, !isRtl && s.textRight]}>
            {lang === 'he' ? '1. סוג תואר' : '1. Degree Type'}
          </Text>
          <View style={[s.optionRow, !isRtl && s.rowReverse]}>
            {([
              { id: 'bachelors', he: 'תואר ראשון', en: "Bachelor's", emoji: '🎓' },
              { id: 'masters',   he: 'תואר שני',   en: "Master's",   emoji: '🏛️' },
            ] as const).map((d) => (
              <Pressable
                key={d.id}
                style={[s.bigOption, degreeType === d.id && s.bigOptionActive]}
                onPress={() => { setDegreeType(d.id); setMajor(null); setYearOfStudy(null); }}
              >
                <Text style={s.bigOptionEmoji}>{d.emoji}</Text>
                <Text style={[s.bigOptionText, degreeType === d.id && s.bigOptionTextActive]}>
                  {lang === 'he' ? d.he : d.en}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
        
        {/* --- Major --- */}
        {degreeType && (
          <View style={s.section}>
            <Text style={[s.sectionTitle, !isRtl && s.textRight]}>
              {lang === 'he' ? '2. מגמה / חוג' : '2. Major / Department'}
            </Text>
            <View style={s.majorGrid}>
              {MAJORS.map((m) => (
                <Pressable
                  key={m.id}
                  style={[s.majorOption, major === m.id && s.majorOptionActive]}
                  onPress={() => { setMajor(m.id); setYearOfStudy(null); }}
                >
                  <Text style={[s.majorText, major === m.id && s.majorTextActive, isRtl && s.textRight]}>
                    {lang === 'he' ? m.he : m.en}
                  </Text>
                  <Text style={[s.majorYears, major === m.id && s.majorYearsActive]}>
                    {degreeType === 'masters'
                      ? (lang === 'he' ? '2 שנות לימוד' : '2 years')
                      : (lang === 'he' ? `${m.years} שנות לימוד` : `${m.years} years`)}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* --- Year of study --- */}
        {major && (
          <View style={s.section}>
            <Text style={[s.sectionTitle, !isRtl && s.textRight]}>
              {lang === 'he' ? '3. שנת לימוד נוכחית' : '3. Current Year of Study'}
            </Text>

            <View style={[s.yearRow, isRtl && s.rowReverse]}>
              {yearOptions.map((yr) => {
                const isFinalYear = degreeType === 'masters'
                  ? yr === 1
                  : selectedMajorData
                    ? yr >= (selectedMajorData.years === 4 ? 3 : selectedMajorData.years)
                    : false;
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
                {MAJORS.map((item) => {
                  const isSelected = item.id === faculty;
                  return (
                    <Pressable
                      key={item.id}
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
                        setFaculty(item.id); // 🚀 Sets the faculty state correctly!
                        setShowFacultyModal(false); // Closes the picker list automatically
                      }}
                    >
                      <Text style={{
                        fontSize: 15,
                        fontWeight: isSelected ? '700' : '500',
                        color: isSelected ? '#2E86FF' : '#444',
                        textAlign: lang === 'he' ? 'right' : 'left'
                      }}>
                        {lang === 'he' ? item.he : item.en}
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