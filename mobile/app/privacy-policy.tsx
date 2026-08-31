// app/privacy-policy.tsx
// Public screen — no Firebase Auth required (linked from signup, and must be
// readable before an account exists). See also the server-hosted copy at
// GET /privacy-policy (server/src/routes/legal.ts), which is what should be
// pasted into the Google Play Console's Data Safety / Store Listing fields —
// app screens aren't reachable by Play's reviewer without installing the app.

import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { PrivacyPolicyStyles } from '../constants/styles';

type Lang = 'he' | 'en';

const CONTACT_EMAIL = 'Support2HIT@gmail.com';
const INSTITUTION_NAME = 'Holon Institute of Technology (HIT)';
const EFFECTIVE_DATE = '2026-08-31';

const SECTIONS: { title: { he: string; en: string }; body: { he: string; en: string } }[] = [
  {
    title: { he: 'מי אנחנו', en: 'Who we are' },
    body: {
      he: `מדיניות פרטיות זו חלה על אפליקציית ניהול הפרויקטים/עבודות הגמר של ${INSTITUTION_NAME} ("האפליקציה"). הגורם האחראי על הנתונים שלך הוא ${INSTITUTION_NAME}. ניתן ליצור קשר בנושאי פרטיות בכתובת ${CONTACT_EMAIL}.`,
      en: `This privacy policy applies to ${INSTITUTION_NAME}'s student project/thesis management app (the "App"). The data controller is ${INSTITUTION_NAME}. For privacy questions, contact ${CONTACT_EMAIL}.`,
    },
  },
  {
    title: { he: 'מידע שאנו אוספים', en: 'Information we collect' },
    body: {
      he:
        '• פרטי חשבון ופרופיל: שם מלא, כתובת אימייל, מספר טלפון, מספר תעודת זהות/סטודנט, פקולטה, תוכנית לימודים, שנת לימוד ושפת ממשק. הסיסמה שלך מנוהלת ומאובטחת על ידי Firebase Authentication ואיננו רואים או שומרים אותה בטקסט גלוי.\n' +
        '• מידע אקדמי: פרטי הפרויקט/עבודת הגמר שלך, אבני דרך, קבצים שהעלית, שיוך מנחה/בוחן ופרטי תיאום הגנה.\n' +
        '• תקשורת: הודעות צ׳אט בין סטודנטים, מנחים, בוחנים ורכזים; התראות שנשלחות אליך.\n' +
        '• נתוני מכשיר: אסימון התראות דחיפה (push token) עבור המכשיר שלך.\n' +
        '• נתוני אבטחה: זמני התחברות, מיקום משוער המבוסס על כתובת ה-IP שלך (לצורך זיהוי כניסות חשודות בלבד), ומספר ניסיונות התחברות כושלים.',
      en:
        '• Account & profile details: full name, email address, phone number, student/ID number, faculty, degree program, year of study, and interface language. Your password is managed and secured by Firebase Authentication — we never see or store it in plain text.\n' +
        '• Academic data: your project/thesis details, milestones, files you upload, supervisor/examiner assignments, and defense-scheduling information.\n' +
        '• Communications: in-app chat messages between students, supervisors, examiners, and coordinators; notifications sent to you.\n' +
        '• Device data: a push-notification token for your device.\n' +
        '• Security data: login timestamps, an approximate location derived from your IP address (used only to flag suspicious logins), and failed login attempt counts.',
    },
  },
  {
    title: { he: 'כיצד אנו משתמשים במידע', en: 'How we use this information' },
    body: {
      he:
        'אנו משתמשים במידע כדי להפעיל את תהליך ניהול הפרויקט/עבודת הגמר (רישום, שיוך מנחה, מעקב אבני דרך, תיאום הגנה וגישת בוחנים), לשלוח לך התראות ואימיילים תפעוליים, לאבטח את חשבונך (נעילה אוטומטית לאחר ניסיונות התחברות כושלים חוזרים, אימות דו-שלבי) ולעמוד בדרישות ניהול הרישומים האקדמיים של המוסד.',
      en:
        'We use this information to operate the project/thesis management workflow (enrollment, supervisor assignment, milestone tracking, defense scheduling, and examiner access), to send you operational notifications and emails, to secure your account (automatic lockout after repeated failed logins, two-factor authentication), and to meet the institution\'s academic recordkeeping requirements.',
    },
  },
  {
    title: { he: 'עם מי אנו משתפים מידע', en: 'Who we share it with' },
    body: {
      he:
        'אנו משתמשים בספקים הבאים לעיבוד נתונים מטעמנו — הם אינם רשאים להשתמש בנתונים שלך למטרות משלהם:\n' +
        '• Google Firebase (Authentication, Firestore, Cloud Messaging) — אחסון חשבונות, בסיס הנתונים והתראות הדחיפה.\n' +
        '• Expo — העברת התראות הדחיפה למכשיר שלך.\n' +
        '• Brevo — שליחת מיילים תפעוליים (אימות הרשמה, התראות אבטחה, עדכונים).\n' +
        '• Cloudinary — אחסון קבצים שהעלית (הגשות אבני דרך, קבצים מצורפים בצ׳אט, קורות חיים ומסמכים נוספים).\n' +
        '• Anthropic — עיבוד מבוסס בינה מלאכותית של קורות חיים וגיליונות ציונים שהעלית, לצורך בדיקת דרישות קדם וזכאות.\n' +
        '• ipinfo.io — זיהוי מיקום גס לפי כתובת IP, לצורך התראות אבטחה בלבד.\n' +
        'איננו מוכרים את המידע האישי שלך למפרסמים או לצדדים שלישיים.',
      en:
        'We use the following processors to handle data on our behalf — they are not permitted to use your data for their own purposes:\n' +
        '• Google Firebase (Authentication, Firestore, Cloud Messaging) — account storage, the app database, and push notifications.\n' +
        '• Expo — delivering push notifications to your device.\n' +
        '• Brevo — sending operational emails (signup verification, security alerts, updates).\n' +
        '• Cloudinary — storage for files you upload (milestone submissions, chat attachments, CVs, and other documents).\n' +
        '• Anthropic — AI-assisted processing of uploaded CVs and academic transcripts, for prerequisite/eligibility screening.\n' +
        '• ipinfo.io — coarse IP-based location lookup, used only for login security alerts.\n' +
        'We do not sell your personal data to advertisers or other third parties.',
    },
  },
  {
    title: { he: 'שמירת מידע ומחיקת חשבון', en: 'Data retention & account deletion' },
    body: {
      he:
        'חשבונות סטודנטים מסומנים ונבדקים אוטומטית לאחר מועד הסיום הצפוי של הלימודים, ועשויים להימחק בהתאם למדיניות השמירה של המוסד. באפשרותך לבקש בכל עת את מחיקת חשבונך מתוך האפליקציה; הבקשה כפופה לבדיקת זכאות (למשל, סיום תהליך אקדמי פעיל).',
      en:
        'Student accounts are automatically flagged and reviewed after your expected graduation date, and may be deleted per the institution\'s retention policy. You may request deletion of your account at any time from within the app; the request is subject to an eligibility check (e.g. no active academic process still in progress).',
    },
  },
  {
    title: { he: 'האבטחה שלך', en: 'Security measures' },
    body: {
      he: 'כל התקשורת בין האפליקציה לשרתים שלנו מוצפנת (HTTPS). אנו תומכים באימות דו-שלבי (2FA), אימות כתובת אימייל בעת ההרשמה, ונעילת חשבון אוטומטית לאחר ניסיונות התחברות כושלים חוזרים.',
      en: 'All communication between the app and our servers is encrypted (HTTPS). We support two-factor authentication (2FA), email verification at signup, and automatic account lockout after repeated failed login attempts.',
    },
  },
  {
    title: { he: 'קטינים', en: "Children's privacy" },
    body: {
      he: 'האפליקציה מיועדת לסטודנטים, מנחים, בוחנים וסגל של מוסד להשכלה גבוהה, ואינה מיועדת לשימוש על ידי ילדים.',
      en: 'The App is intended for enrolled higher-education students, supervisors, examiners, and staff, and is not directed at children.',
    },
  },
  {
    title: { he: 'הזכויות שלך', en: 'Your rights' },
    body: {
      he: `באפשרותך לבקש גישה, תיקון או מחיקה של המידע האישי שלך על ידי פנייה אלינו בכתובת ${CONTACT_EMAIL}.`,
      en: `You may request access to, correction of, or deletion of your personal data by contacting us at ${CONTACT_EMAIL}.`,
    },
  },
  {
    title: { he: 'שינויים במדיניות זו', en: 'Changes to this policy' },
    body: {
      he: `מדיניות זו נכנסה לתוקף בתאריך ${EFFECTIVE_DATE}. ייתכן שנעדכן אותה מעת לעת; עדכונים מהותיים יימסרו בתוך האפליקציה.`,
      en: `This policy took effect on ${EFFECTIVE_DATE}. We may update it from time to time; material changes will be communicated within the app.`,
    },
  },
];

export default function PrivacyPolicyScreen() {
  const router = useRouter();
  const [lang, setLang] = useState<Lang>('he');
  const isRtl = lang === 'he';

  return (
    <SafeAreaView style={s.root}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <View style={[s.topRow, isRtl && s.rowReverse]}>
          <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/(auth)/login'))}>
            <Text style={s.backText}>{isRtl ? '→ חזרה' : '← Back'}</Text>
          </Pressable>
          <Pressable style={s.langBtn} onPress={() => setLang(lang === 'he' ? 'en' : 'he')}>
            <Text style={s.langText}>{lang === 'he' ? 'EN' : 'עב'}</Text>
          </Pressable>
        </View>

        <Text style={[s.title, isRtl && s.textRight]}>
          {lang === 'he' ? 'מדיניות פרטיות' : 'Privacy Policy'}
        </Text>

        {SECTIONS.map((section) => (
          <View key={section.title.en} style={s.section}>
            <Text style={[s.sectionTitle, isRtl && s.textRight]}>{section.title[lang]}</Text>
            <Text style={[s.sectionBody, isRtl && s.textRight]}>{section.body[lang]}</Text>
          </View>
        ))}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = PrivacyPolicyStyles;
