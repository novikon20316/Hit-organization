import React, { useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, ScrollView,
  SafeAreaView, ActivityIndicator, Alert, TextInput,
} from 'react-native';
import { doc, setDoc } from 'firebase/firestore';
import { createUserWithEmailAndPassword } from 'firebase/auth'
import { db, auth } from '../../src/firebase/firebase';
import { useRouter } from 'expo-router';
import type { Lang } from '../../components/i18n';
import { DEGREE_LENGTHS } from '../../components/Notificationservice';

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
  const uid    = auth.currentUser?.uid;

  const [lang,        setLang]        = useState<Lang>('he');
  const [displayName, setDisplayName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
  const canSave = 
    displayName.trim().length > 1 && 
    phoneNumber.length >= 9 && 
    email.includes('@') && 
    degreeType && 
    major && 
    yearOfStudy;

  const handleSave = async () => {
    if (!canSave || !email || !password) {
      Alert.alert("Error", "Please fill all fields, including email and password.");
      return;
    }
    setSaving(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email.trim(), password);
      const newUid = userCredential.user.uid;
      console.log("User created in Auth with UID:", newUid);
      await setDoc(doc(db, 'users', newUid), {
        uid: newUid,
        displayName: displayName.trim(),
        email: email.trim().toLowerCase(),
        phoneNumber: phoneNumber.trim(),
        degreeType: degreeType,
        major: major,
        yearOfStudy: yearOfStudy,
        role: 'student',           // Critical for your app's navigation logic
        profileComplete: true,      // Tells the app not to show this setup again
        hasActiveProject: false,
        createdAt: new Date(),      // Good for sorting/admin purposes
      });
      router.replace('/(auth)/login');
    }catch (e: any) {
      console.error("Registration Error:", e);
      
      // Handle common Firebase errors
      let msg = e.message;
      if (e.code === 'auth/email-already-in-use') msg = "This email is already registered.";
      if (e.code === 'auth/weak-password') msg = "Password is too weak.";
      
      Alert.alert(lang === 'he' ? 'שגיאה' : 'Error', msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={s.root}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

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
          
          <TextInput
            style={[s.input, isRtl && s.textRight]}
            placeholder={lang === 'he' ? 'שם מלא' : 'Full Name'}
            value={displayName}
            onChangeText={setDisplayName}
          />

          <TextInput
            style={[s.input, isRtl && s.textRight]}
            placeholder={lang === 'he' ? 'כתובת אימייל' : 'Email Address'}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />

          <TextInput
            style={[s.input, isRtl && s.textRight]}
            placeholder={lang === 'he' ? 'מספר טלפון' : 'Phone Number'}
            value={phoneNumber}
            onChangeText={setPhoneNumber}
            keyboardType="phone-pad"
          />

          <TextInput
            style={[s.input, isRtl && s.textRight]}
            placeholder={lang === 'he' ? 'סיסמה' : 'Password'}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          {/* 
          <TextInput
            style={[s.input, isRtl && s.textRight]}
            placeholder={lang === 'he' ? 'תעודת זהות' : 'Student ID'}
            value={studentId}
            onChangeText={setStudentId}
            keyboardType="numeric"
          /> 
          */}
        </View>

        {/* --- Degree type --- */}
        <View style={s.section}>
          <Text style={[s.sectionTitle, isRtl && s.textRight]}>
            {lang === 'he' ? '1. סוג תואר' : '1. Degree Type'}
          </Text>
          <View style={[s.optionRow, isRtl && s.rowReverse]}>
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
            <Text style={[s.sectionTitle, isRtl && s.textRight]}>
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
            <Text style={[s.sectionTitle, isRtl && s.textRight]}>
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
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  // ... existing styles ...
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