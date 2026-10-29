// src/routes/legal.ts
// Public, unauthenticated static pages required by app store review (Google
// Play's Data Safety section and store listing require a reachable privacy
// policy URL). Mounted at the app root in index.ts, so the path is exactly
// /privacy-policy — no prefix.
//
// TODO before shipping: make sure this server is reachable at a public HTTPS
// URL (the current dev apiUrl in mobile/app.json is a LAN IP, which Play
// will not accept).

import { Router, Request, Response } from 'express';
import { apiLimiter } from '../middleware/rateLimit.js';

const CONTACT_EMAIL = 'Support2HIT@gmail.com';
const INSTITUTION_NAME = 'Holon Institute of Technology (HIT)';
const EFFECTIVE_DATE = '2026-10-30';

const SECTIONS: { title: { he: string; en: string }; body: { he: string; en: string } }[] = [
  {
    title: { he: 'מי אנחנו', en: 'Who we are' },
    body: {
      he: `מדיניות פרטיות זו חלה על מערכת ניהול הפרויקטים ועבודות הגמר של ${INSTITUTION_NAME} (האתר והאפליקציה, להלן "האפליקציה"). הגורם האחראי על הנתונים שלך הוא ${INSTITUTION_NAME}. ניתן ליצור קשר בנושאי פרטיות בכתובת ${CONTACT_EMAIL}.`,
      en: `This privacy policy applies to ${INSTITUTION_NAME}'s project and thesis management system (the website and the app, the "App"). The data controller is ${INSTITUTION_NAME}. For privacy questions, contact ${CONTACT_EMAIL}.`,
    },
  },
  {
    title: { he: 'מידע שאנו אוספים', en: 'Information we collect' },
    body: {
      he:
        '• פרטי חשבון ופרופיל: שם מלא, כתובת אימייל, מספר טלפון, מספר תעודת זהות/סטודנט, פקולטה, תוכנית לימודים, שנת לימוד, תחום התמחות, שפת ממשק, ותמונת פרופיל (אם העלית). הסיסמה שלך מנוהלת ומאובטחת על ידי Firebase Authentication, ואיננו רואים או שומרים אותה בטקסט גלוי.\n' +
        '• מידע אקדמי: פרטי הפרויקט/עבודת הגמר, אבני דרך, קבצים שהגשת, ציונים, הערכות והערות של מנחים ובוחנים, שיוך מנחה/בוחן, פרטי תיאום הגנה והדוח המסכם.\n' +
        '• מסמכי מועמדות: קורות חיים וגיליון ציונים שהעלית בעת הגשת מועמדות לפרויקט, וכן קורסים שהשלמת והציונים בהם.\n' +
        '• תקשורת: הודעות ותמונות בצ׳אט, הודעות משוב, והתראות שנשלחות אליך (באפליקציה, באימייל, ב-SMS, ב-WhatsApp ובהתראות דחיפה).\n' +
        '• בוחנים חיצוניים (ללא חשבון): שם, אימייל, פרטי זיהוי, פרטי חשבון בנק ומסמכי מס הנדרשים לתשלום, וחוות הדעת וההערכות שהוגשו.\n' +
        '• נתוני מכשיר ושימוש: אסימון התראות דחיפה, סטטוס מקוון (מועד הפעילות האחרון והפלטפורמה), ודיווחי שגיאות טכניות.\n' +
        '• נתוני אבטחה ובקרה: זמני התחברות, מיקום משוער לפי כתובת IP (לזיהוי כניסות חשודות בלבד), מספר ניסיונות התחברות כושלים, ויומן של פעולות רגישות (למשל שינוי ציון, אישורים ושינוי הרשאות).',
      en:
        '• Account & profile details: full name, email address, phone number, ID/student number, faculty, degree program, year of study, specialization, interface language, and a profile photo (if you upload one). Your password is managed and secured by Firebase Authentication; we never see or store it in plain text.\n' +
        '• Academic data: your project/thesis details, milestones, files you submit, grades, supervisor and examiner evaluations and comments, supervisor/examiner assignments, defense scheduling, and your final report.\n' +
        '• Application documents: the CV and academic transcript you upload when applying to a project, and the courses you completed with their grades.\n' +
        '• Communications: chat messages and images, feedback messages, and notifications sent to you (in-app, email, SMS, WhatsApp and push).\n' +
        '• External examiners (no account): name, email, identity details, the bank account details and tax documents needed for payment, and the opinions and evaluations they submit.\n' +
        '• Device & usage data: a push-notification token, online status (last active time and platform), and technical error reports.\n' +
        '• Security & audit data: login timestamps, an approximate location derived from your IP address (used only to flag suspicious logins), failed login attempt counts, and a log of sensitive actions (e.g. grade changes, approvals, permission changes).',
    },
  },
  {
    title: { he: 'האם חובה למסור את המידע', en: 'Do you have to provide this information' },
    body: {
      he: 'אין חובה חוקית למסור את המידע. עם זאת, ללא פרטי החובה המסומנים בהרשמה (ובהם שם מלא, מספר תעודת זהות, אימייל וטלפון) לא ניתן להירשם ולהשתמש באפליקציה. תמונת פרופיל היא רשות.',
      en: 'You are not legally required to provide this information. However, without the required signup details (including full name, ID number, email and phone) you cannot register or use the App. A profile photo is optional.',
    },
  },
  {
    title: { he: 'כיצד אנו משתמשים במידע', en: 'How we use this information' },
    body: {
      he:
        'אנו משתמשים במידע כדי להפעיל את תהליך ניהול הפרויקט/עבודת הגמר (רישום, הגשת מועמדות ושיוך מנחה, מעקב אבני דרך, ציונים ואישורים, תיאום הגנה וגישת בוחנים), לשלוח לך התראות תפעוליות (באפליקציה, באימייל, ב-SMS וב-WhatsApp), לתאם פגישות ביומן Google של מנחים שבחרו לחבר אותו, לשלם לבוחנים חיצוניים, לאבטח את חשבונך (נעילה אוטומטית לאחר ניסיונות התחברות כושלים, אימות דו-שלבי) ולעמוד בדרישות ניהול הרישומים האקדמיים של המוסד.\n' +
        'בתוך המוסד, כל איש סגל רואה רק את המידע הנדרש לתפקידו (למשל המנחה שלך, רכזי הפקולטה והבוחנים של העבודה שלך).',
      en:
        'We use this information to run the project/thesis workflow (registration, project applications and supervisor assignment, milestone tracking, grades and approvals, defense scheduling, and examiner access), to send you operational notifications (in-app, email, SMS and WhatsApp), to schedule meetings in the Google Calendar of supervisors who chose to connect it, to pay external examiners, to secure your account (automatic lockout after repeated failed logins, two-factor authentication), and to meet the institution\'s academic recordkeeping requirements.\n' +
        'Within the institution, each staff member sees only what their role needs (e.g. your supervisor, your faculty\'s coordinators, and the examiners of your work).',
    },
  },
  {
    title: { he: 'עיבוד בעזרת בינה מלאכותית', en: 'AI-assisted processing' },
    body: {
      he:
        'אנו משתמשים בשירות של Anthropic (בינה מלאכותית) כדי:\n' +
        '• לחלץ קורסים וציונים מגיליון הציונים שהעלית ולהשוות אותם לדרישות הקדם של הפרויקט.\n' +
        '• להעריך את התאמת קורות החיים שלך לפרויקט.\n' +
        '• להציג למנחה המלצה (לאשר, לקבוע פגישה או לדחות) לגבי מועמדות לפרויקט. ההחלטה עצמה מתקבלת תמיד על ידי המנחה, לא על ידי המערכת.\n' +
        '• לסווג הודעות משוב. הודעות שמזוהות כבדיקה או כספאם נמחקות אוטומטית.',
      en:
        'We use Anthropic\'s AI service to:\n' +
        '• extract the courses and grades from the transcript you upload and compare them with the project\'s prerequisites;\n' +
        '• assess how well your CV fits the project;\n' +
        '• show the supervisor a recommendation (approve, meet, or reject) on a project application. The decision itself is always made by the supervisor, never by the system;\n' +
        '• classify feedback messages. Messages identified as tests or spam are deleted automatically.',
    },
  },
  {
    title: { he: 'עם מי אנו משתפים מידע', en: 'Who we share it with' },
    body: {
      he:
        'אנו משתמשים בספקים הבאים לעיבוד נתונים מטעמנו. הם אינם רשאים להשתמש בנתונים שלך למטרות משלהם:\n' +
        '• Google (Firebase Authentication, Firestore, Google Cloud) — אחסון חשבונות, בסיס הנתונים ואירוח השרת.\n' +
        '• Google Calendar — רק עבור מנחים שחיברו את היומן שלהם, לרישום פגישות עם סטודנטים.\n' +
        '• Expo — העברת התראות הדחיפה למכשיר שלך.\n' +
        '• Brevo — שליחת אימיילים תפעוליים (אימות הרשמה, התראות אבטחה, עדכונים).\n' +
        '• Twilio — שליחת הודעות SMS ו-WhatsApp.\n' +
        '• Cloudinary — אחסון קבצים שהעלית (הגשות, קבצים ותמונות בצ׳אט, קורות חיים ומסמכים נוספים).\n' +
        '• Anthropic — עיבוד בעזרת בינה מלאכותית, כמתואר בסעיף הקודם.\n' +
        '• Zoom — פגישות מקוונות להגנות שמתקיימות ב-Zoom או במתכונת משולבת. המערכת מוסרת ל-Zoom רק את שם הפרויקט ואת מועד ההגנה ומשכה. מי שמצטרף לפגישה מוסר ל-Zoom את השם שהוא מזין (ולפעמים אימייל), לפי תנאי השימוש והפרטיות של Zoom. קישור ההצטרפות מוצג רק למשתתפי ההגנה.\n' +
        '• ipinfo.io — זיהוי מיקום גס לפי כתובת IP, לצורך התראות אבטחה בלבד.\n' +
        'איננו מוכרים את המידע האישי שלך למפרסמים או לצדדים שלישיים.',
      en:
        'We use the following processors to handle data on our behalf. They are not permitted to use your data for their own purposes:\n' +
        '• Google (Firebase Authentication, Firestore, Google Cloud): account storage, the database, and server hosting.\n' +
        '• Google Calendar: only for supervisors who connected their calendar, to record meetings with students.\n' +
        '• Expo: delivering push notifications to your device.\n' +
        '• Brevo: sending operational emails (signup verification, security alerts, updates).\n' +
        '• Twilio: sending SMS and WhatsApp messages.\n' +
        '• Cloudinary: storage for files you upload (submissions, chat files and images, CVs and other documents).\n' +
        '• Anthropic: AI-assisted processing, as described in the previous section.\n' +
        '• Zoom: online meetings for defenses held on Zoom or in hybrid format. The system gives Zoom only the project title and the defense date and length. People who join the meeting give Zoom the name they enter (and sometimes an email), under Zoom\'s own terms and privacy policy. The join link is shown only to the defense participants.\n' +
        '• ipinfo.io: coarse IP-based location lookup, used only for login security alerts.\n' +
        'We do not sell your personal data to advertisers or other third parties.',
    },
  },
  {
    title: { he: 'היכן המידע נשמר', en: 'Where your data is stored' },
    body: {
      he: 'בסיס הנתונים והשרתים שלנו נמצאים בארצות הברית (Google Cloud). חלק מהספקים המפורטים למעלה מעבדים מידע גם מחוץ לישראל. המידע מועבר אליהם בתקשורת מוצפנת.',
      en: 'Our database and servers are located in the United States (Google Cloud). Some of the processors listed above also process data outside Israel. Data is sent to them over encrypted connections.',
    },
  },
  {
    title: { he: 'שמירת מידע ומחיקת חשבון', en: 'Data retention & account deletion' },
    body: {
      he:
        'חשבונות סטודנטים מסומנים ונבדקים אוטומטית לאחר מועד הסיום הצפוי של הלימודים, ועשויים להימחק בהתאם למדיניות השמירה של המוסד. באפשרותך לבקש בכל עת את מחיקת חשבונך מתוך האפליקציה. הבקשה כפופה לבדיקת זכאות (למשל, שאין תהליך אקדמי פעיל). קישור הצפייה בדוח המסכם תקף ל-30 יום, וניתן לקבל קישור חדש מלוח הבקרה.',
      en:
        'Student accounts are automatically flagged and reviewed after your expected graduation date, and may be deleted per the institution\'s retention policy. You may request deletion of your account at any time from within the App; the request is subject to an eligibility check (e.g. no active academic process in progress). The view-only link to your final report is valid for 30 days, and a new one is available from your dashboard.',
    },
  },
  {
    title: { he: 'האבטחה שלך', en: 'Security measures' },
    body: {
      he: 'כל התקשורת בין האפליקציה לשרתים שלנו מוצפנת (HTTPS). אנו תומכים באימות דו-שלבי (2FA), אימות כתובת אימייל בעת ההרשמה, ונעילת חשבון אוטומטית לאחר ניסיונות התחברות כושלים חוזרים. הגישה למידע מוגבלת לפי תפקיד, מספרי טלפון נשמרים במקום שרק השרת יכול לקרוא, ופעולות רגישות נרשמות ביומן.',
      en: 'All communication between the App and our servers is encrypted (HTTPS). We support two-factor authentication (2FA), email verification at signup, and automatic account lockout after repeated failed login attempts. Access to data is limited by role, phone numbers are stored where only the server can read them, and sensitive actions are logged.',
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
      he: `באפשרותך לבקש לעיין במידע האישי שלך, לתקן אותו או למחוק אותו, על ידי פנייה אלינו בכתובת ${CONTACT_EMAIL}. אם לדעתך לא טיפלנו בפנייה כראוי, באפשרותך לפנות לרשות להגנת הפרטיות.`,
      en: `You may request access to, correction of, or deletion of your personal data by contacting us at ${CONTACT_EMAIL}. If you believe we did not handle your request properly, you may contact the Israeli Privacy Protection Authority.`,
    },
  },
  {
    title: { he: 'שינויים במדיניות זו', en: 'Changes to this policy' },
    body: {
      he: `גרסה זו של המדיניות נכנסה לתוקף בתאריך ${EFFECTIVE_DATE}. ייתכן שנעדכן אותה מעת לעת; עדכונים מהותיים יימסרו בתוך האפליקציה.`,
      en: `This version of the policy took effect on ${EFFECTIVE_DATE}. We may update it from time to time; material changes will be communicated within the App.`,
    },
  },
];

// Same SECTIONS as web/app/privacy-policy/page.tsx and
// mobile/app/privacy-policy.tsx — keep the three in sync. Rendered here in
// BOTH languages (Hebrew, then English), since this public page is what the
// app stores link to and has no language toggle.
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function renderSections(lang: 'he' | 'en'): string {
  return SECTIONS.map((sec) => `  <h2>${escapeHtml(sec.title[lang])}</h2>\n  <p>${escapeHtml(sec.body[lang])}</p>`).join('\n');
}

const PRIVACY_POLICY_HTML = `<!DOCTYPE html>
<html lang="he">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>מדיניות פרטיות · Privacy Policy</title>
  <style>
    body { font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; max-width: 720px; margin: 0 auto; padding: 32px 20px; color: #111; line-height: 1.6; }
    h1 { font-size: 28px; margin-bottom: 8px; }
    h2 { font-size: 18px; margin-top: 28px; margin-bottom: 8px; }
    p { color: #333; white-space: pre-line; }
    .meta { color: #667; font-size: 13px; margin-bottom: 24px; }
    .lang { padding-bottom: 24px; }
    .lang + .lang { border-top: 1px solid #ddd; padding-top: 24px; }
  </style>
</head>
<body>
<section class="lang" dir="rtl" lang="he">
  <h1>מדיניות פרטיות</h1>
  <p class="meta">בתוקף מתאריך: ${EFFECTIVE_DATE} · הגורם האחראי: ${INSTITUTION_NAME} · יצירת קשר: ${CONTACT_EMAIL}</p>
${renderSections('he')}
</section>
<section class="lang" dir="ltr" lang="en">
  <h1>Privacy Policy</h1>
  <p class="meta">Effective date: ${EFFECTIVE_DATE} · Data controller: ${INSTITUTION_NAME} · Contact: ${CONTACT_EMAIL}</p>
${renderSections('en')}
</section>
</body>
</html>`;

const router = Router();

// Mounted outside app.use('/api', apiLimiter) in index.ts (this route has no
// /api prefix, per this file's own header comment), so it was the one route
// in the whole server with no rate limiting at all. Reusing apiLimiter
// directly here rather than restructuring the mount order for one route.
router.get('/privacy-policy', apiLimiter, (_req: Request, res: Response) => {
  res.type('html').send(PRIVACY_POLICY_HTML);
});

export default router;
