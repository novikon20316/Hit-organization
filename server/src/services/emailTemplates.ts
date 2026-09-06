import { WEBSITE_URL } from '../config/links.js';

// MEDIUM FIX: every template below interpolates `data.*` straight into HTML
// with no escaping — several of those fields are other users' free-text
// input reaching a THIRD party's inbox unsanitized: new_message's
// senderName/preview (a chat message's sender name and raw text, read by
// the other participant) and application_received's studentName (an
// applicant's own display name, read by their prospective supervisor) are
// the clearest examples, but any current or future field is equally at
// risk. A user could set their displayName/message text to
// `<a href="...">Urgent: verify your account</a>` and have it render as
// live, clickable markup inside a legitimate system email — a credible
// phishing/tracking vector. Escaped once here (applied to every field
// before it reaches any template) rather than patched per-template, so a
// future template can't reintroduce the same gap by forgetting to escape.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeEmailData(data: Record<string, string>): Record<string, string> {
  const escaped: Record<string, string> = {};
  for (const [key, value] of Object.entries(data)) {
    escaped[key] = typeof value === 'string' ? escapeHtml(value) : value;
  }
  return escaped;
}

export type NotificationType =
  | 'project_published'
  | 'application_received'
  | 'application_approved'
  | 'application_declined_by_student'
  | 'application_rejected'
  | 'meeting_requested'
  | 'milestone_graded'
  | 'milestone_submitted'
  | 'milestone_deadline_7d'
  | 'milestone_deadline_1d'
  | 'milestone_overdue'
  | 'broadcast'
  | 'new_message'
  | 'account_created'
  | 'examiner_access_link'
  | 'examiner_otp_code'
  | 'defense_dates_requested'
  | 'defense_date_matched'
  | 'defense_day_access_link'
  | 'totp_recovery_code'
  | 'login_security_alert'
  | 'temp_password_issued'
  | 'suspicious_login_admin_alert'
  | 'two_factor_enforcement_notice'
  | 'general';

interface EmailTemplate {
  subjectHe: string;
  subjectEn: string;
  bodyHe:    (data: Record<string, string>) => string;
  bodyEn:    (data: Record<string, string>) => string;
  /** When true, buildEmailHtml sends BOTH language versions in one email
   *  (Hebrew section, then English) instead of picking one via `lang` —
   *  for account-creation mail, the recipient hasn't set a language
   *  preference in the app yet, so there's no reliable single language
   *  to pick. */
  bilingual?: boolean;
}

export const EMAIL_TEMPLATES: Record<NotificationType, EmailTemplate> = {
  project_published: {
    subjectHe: '📢 פרויקט חדש פורסם',
    subjectEn: '📢 New Project Published',
    bodyHe: (d) => `
      <p>שלום ${d.name || ''},</p>
      <p>פרויקט חדש <strong>${d.projectTitle || ''}</strong> פורסם ומחכה לבקשות.</p>
      <p>היכנס למערכת כדי לצפות בפרטים ולהגיש מועמדות.</p>
    `,
    bodyEn: (d) => `
      <p>Hello ${d.name || ''},</p>
      <p>A new project <strong>${d.projectTitle || ''}</strong> has been published and is accepting applications.</p>
      <p>Log in to view details and apply.</p>
    `,
  },

  application_received: {
    subjectHe: '📥 התקבלה בקשה חדשה',
    subjectEn: '📥 New Application Received',
    bodyHe: (d) => `
      <p>שלום ${d.name || ''},</p>
      <p>הסטודנט/ית <strong>${d.studentName || ''}</strong> הגיש/ה בקשה להצטרף לפרויקט <strong>${d.projectTitle || ''}</strong>.</p>
      <p>היכנס למערכת לצפייה בפרטי הבקשה ולמענה.</p>
    `,
    bodyEn: (d) => `
      <p>Hello ${d.name || ''},</p>
      <p><strong>${d.studentName || ''}</strong> has applied to join your project <strong>${d.projectTitle || ''}</strong>.</p>
      <p>Log in to review the application and respond.</p>
    `,
  },

  application_approved: {
    subjectHe: '✅ בקשתך אושרה!',
    subjectEn: '✅ Your Application Was Approved!',
    bodyHe: (d) => `
      <p>שלום ${d.name || ''},</p>
      <p>בקשתך לפרויקט <strong>${d.projectTitle || ''}</strong> אושרה!</p>
      <p>היכנס/י למערכת ואשר/י שברצונך להתחיל בפרויקט זה — אישור יסגור אוטומטית כל בקשה ממתינה אחרת שהגשת.</p>
    `,
    bodyEn: (d) => `
      <p>Hello ${d.name || ''},</p>
      <p>Your application for project <strong>${d.projectTitle || ''}</strong> has been approved!</p>
      <p>Log in and confirm whether you want to start this project — confirming will automatically close any other pending application you've submitted.</p>
    `,
  },

  application_declined_by_student: {
    subjectHe: '😕 הסטודנט/ית החליט/ה שלא להתחיל בפרויקט',
    subjectEn: '😕 Student Decided Not to Start the Project',
    bodyHe: (d) => `
      <p>שלום ${d.name || ''},</p>
      <p><strong>${d.studentName || ''}</strong> בחר/ה שלא להתחיל את הפרויקט <strong>${d.projectTitle || ''}</strong> לאחר שהבקשה אושרה.</p>
      <p>הפרויקט עדיין פתוח לבקשות נוספות.</p>
    `,
    bodyEn: (d) => `
      <p>Hello ${d.name || ''},</p>
      <p><strong>${d.studentName || ''}</strong> decided not to start the project <strong>${d.projectTitle || ''}</strong> after their application was approved.</p>
      <p>The project remains open for other applications.</p>
    `,
  },

  application_rejected: {
    subjectHe: '❌ בקשתך נדחתה',
    subjectEn: '❌ Your Application Was Not Approved',
    bodyHe: (d) => `
      <p>שלום ${d.name || ''},</p>
      <p>לצערנו, בקשתך לפרויקט <strong>${d.projectTitle || ''}</strong> לא אושרה הפעם.</p>
      <p>אל תתייאש — ישנם פרויקטים נוספים הפתוחים לבקשות.</p>
    `,
    bodyEn: (d) => `
      <p>Hello ${d.name || ''},</p>
      <p>Unfortunately, your application for project <strong>${d.projectTitle || ''}</strong> was not approved this time.</p>
      <p>Don't give up — there are other projects open for applications.</p>
    `,
  },

  meeting_requested: {
    subjectHe: '📅 בקשת פגישה',
    subjectEn: '📅 Meeting Requested',
    bodyHe: (d) => `
      <p>שלום ${d.name || ''},</p>
      <p>המנחה שלך מבקש/ת לקיים פגישה לפני קבלת החלטה על בקשתך לפרויקט <strong>${d.projectTitle || ''}</strong>.</p>
      <p>היכנס למערכת לתיאום מועד.</p>
    `,
    bodyEn: (d) => `
      <p>Hello ${d.name || ''},</p>
      <p>Your supervisor would like to meet before deciding on your application for <strong>${d.projectTitle || ''}</strong>.</p>
      <p>Log in to arrange a time.</p>
    `,
  },

  milestone_graded: {
    subjectHe: '✏️ אבן הדרך שלך קיבלה ציון',
    subjectEn: '✏️ Your Milestone Has Been Graded',
    bodyHe: (d) => `
      <p>שלום ${d.name || ''},</p>
      <p>אבן הדרך <strong>${d.milestoneTitle || ''}</strong> קיבלה ציון: <strong>${d.grade || ''}</strong>.</p>
      <p>היכנס למערכת לצפייה בפרטים המלאים.</p>
    `,
    bodyEn: (d) => `
      <p>Hello ${d.name || ''},</p>
      <p>Your milestone <strong>${d.milestoneTitle || ''}</strong> has been graded: <strong>${d.grade || ''}</strong>.</p>
      <p>Log in to see the full details.</p>
    `,
  },

  milestone_deadline_7d: {
    subjectHe: '⏰ תזכורת: 7 ימים לסיום אבן הדרך',
    subjectEn: '⏰ Reminder: 7 Days Until Milestone Deadline',
    bodyHe: (d) => `
      <p>שלום ${d.name || ''},</p>
      <p>נותרו <strong>7 ימים</strong> למסור את <strong>${d.milestoneTitle || ''}</strong>.</p>
      <p>הכן את הגשתך בזמן!</p>
    `,
    bodyEn: (d) => `
      <p>Hello ${d.name || ''},</p>
      <p>You have <strong>7 days</strong> left to submit <strong>${d.milestoneTitle || ''}</strong>.</p>
      <p>Make sure your submission is ready on time!</p>
    `,
  },

  milestone_deadline_1d: {
    subjectHe: '🚨 מחר הוא המועד האחרון!',
    subjectEn: '🚨 Tomorrow Is the Deadline!',
    bodyHe: (d) => `
      <p>שלום ${d.name || ''},</p>
      <p><strong>מחר</strong> הוא המועד האחרון למסור את <strong>${d.milestoneTitle || ''}</strong>.</p>
      <p>אל תשכח להגיש!</p>
    `,
    bodyEn: (d) => `
      <p>Hello ${d.name || ''},</p>
      <p><strong>Tomorrow</strong> is the final deadline for submitting <strong>${d.milestoneTitle || ''}</strong>.</p>
      <p>Don't forget to submit!</p>
    `,
  },

  milestone_overdue: {
    subjectHe: '⏰ אבן הדרך שלך באיחור',
    subjectEn: '⏰ Your Milestone Is Overdue',
    bodyHe: (d) => `
      <p>שלום ${d.name || ''},</p>
      <p>אבן הדרך <strong>${d.milestoneTitle || ''}</strong> באיחור של <strong>${d.daysLate || ''}</strong> ${d.daysLate === '1' ? 'יום' : 'ימים'}.</p>
      <p>אנא הגש/י בהקדם האפשרי כדי למנוע עיכוב נוסף בתהליך.</p>
    `,
    bodyEn: (d) => `
      <p>Hello ${d.name || ''},</p>
      <p>Your milestone <strong>${d.milestoneTitle || ''}</strong> is <strong>${d.daysLate || ''}</strong> day(s) overdue.</p>
      <p>Please submit as soon as possible to avoid further delay.</p>
    `,
  },

  milestone_submitted: {
    subjectHe: '📤 הגשה חדשה ממתינה לבדיקה',
    subjectEn: '📤 New Milestone Submission',
    bodyHe: (d) => `
      <p>שלום ${d.name || ''},</p>
      <p>הוגשה אבן דרך חדשה: <strong>${d.milestoneTitle || ''}</strong>${d.projectTitle ? ` בפרויקט <strong>${d.projectTitle}</strong>` : ''}.</p>
      <p>היכנס למערכת לצפייה בהגשה ולמתן ציון.</p>
    `,
    bodyEn: (d) => `
      <p>Hello ${d.name || ''},</p>
      <p>A new milestone submission is waiting for review: <strong>${d.milestoneTitle || ''}</strong>${d.projectTitle ? ` (project <strong>${d.projectTitle}</strong>)` : ''}.</p>
      <p>Log in to review the submission and enter a grade.</p>
    `,
  },

  broadcast: {
    subjectHe: '📢 הודעה כללית מהמערכת',
    subjectEn: '📢 System Broadcast',
    bodyHe: (d) => `
      <p>שלום ${d.name || ''},</p>
      <p>${d.message || ''}</p>
    `,
    bodyEn: (d) => `
      <p>Hello ${d.name || ''},</p>
      <p>${d.message || ''}</p>
    `,
  },

  new_message: {
    subjectHe: '💬 הודעה חדשה מ־',
    subjectEn: '💬 New Message from ',
    bodyHe: (d) => `
      <p>שלום ${d.name || ''},</p>
      <p>קיבלת הודעה חדשה מ<strong>${d.senderName || 'משתמש'}</strong>:</p>
      <blockquote style="border-left:3px solid #2E86FF;padding-left:12px;color:#555">
        ${d.preview || ''}
      </blockquote>
      <p>היכנס למערכת לצפייה ולמענה.</p>
    `,
    bodyEn: (d) => `
      <p>Hello ${d.name || ''},</p>
      <p>You have a new message from <strong>${d.senderName || 'a user'}</strong>:</p>
      <blockquote style="border-left:3px solid #2E86FF;padding-left:12px;color:#555">
        ${d.preview || ''}
      </blockquote>
      <p>Log in to view and reply.</p>
    `,
  },

  account_created: {
    subjectHe: '🎓 מנהל המערכת של HIT הוסיף אותך למערכת פרויקטי הגמר',
    subjectEn: '🎓 HIT\'s System Administrator Added You to the Projects & Thesis System',
    bilingual: true,
    bodyHe: (d) => `
      <p>שלום ${d.name || ''},</p>
      <p>מנהל המערכת (system_admin) של HIT הוסיף אותך למערכת ניהול פרויקטי הגמר ועבודות התזה.</p>
      <p>אימייל: <strong>${d.email || ''}</strong><br/>
      סיסמה זמנית: <strong>${d.tempPassword || ''}</strong></p>
      <p>🌐 <a href="${WEBSITE_URL}">כניסה למערכת דרך האתר</a></p>
      ${d.appLinkIos || d.appLinkAndroid ? `
      <p>הורד את האפליקציה:<br/>
      ${d.appLinkIos ? `<a href="${d.appLinkIos}">📱 iPhone (App Store)</a><br/>` : ''}
      ${d.appLinkAndroid ? `<a href="${d.appLinkAndroid}">🤖 Android (Google Play)</a>` : ''}
      </p>` : ''}
      <p><strong>בכניסה הראשונה תתבקש להחליף את הסיסמה הזמנית — זהו שלב חובה.</strong></p>
    `,
    bodyEn: (d) => `
      <p>Hello ${d.name || ''},</p>
      <p>HIT's system administrator has added you to the Final Projects and Thesis Management System.</p>
      <p>Email: <strong>${d.email || ''}</strong><br/>
      Temporary password: <strong>${d.tempPassword || ''}</strong></p>
      <p>🌐 <a href="${WEBSITE_URL}">Log in via the website</a></p>
      ${d.appLinkIos || d.appLinkAndroid ? `
      <p>Download the app:<br/>
      ${d.appLinkIos ? `<a href="${d.appLinkIos}">📱 iPhone (App Store)</a><br/>` : ''}
      ${d.appLinkAndroid ? `<a href="${d.appLinkAndroid}">🤖 Android (Google Play)</a>` : ''}
      </p>` : ''}
      <p><strong>On your first login you'll be required to change this temporary password — this step is mandatory.</strong></p>
    `,
  },

  examiner_access_link: {
    subjectHe: '🔎 הוזמנת לשמש כבוחן חיצוני',
    subjectEn: '🔎 You Have Been Invited as an External Examiner',
    bodyHe: (d) => `
      <p>שלום ${d.name || ''},</p>
      <p>הוזמנת לשמש כבוחן חיצוני עבור העבודה <strong>"${d.thesisTitle || ''}"</strong>${d.studentName ? ` של ${d.studentName}` : ''}.</p>
      <p><a href="${d.link || ''}">לחץ כאן לצפייה בפרטים ולמענה</a></p>
      <p>הקישור אישי וחד-פעמי — אין צורך בהרשמה, סיסמה או חשבון במערכת. לאחר אישור ההשתתפות, תתבקש/י גם לבחור תאריכים אפשריים להגנה — הכל דרך אותו קישור, אין צורך בקישור נוסף.</p>
    `,
    bodyEn: (d) => `
      <p>Hello ${d.name || ''},</p>
      <p>You have been invited to serve as an external examiner for <strong>"${d.thesisTitle || ''}"</strong>${d.studentName ? ` by ${d.studentName}` : ''}.</p>
      <p><a href="${d.link || ''}">Tap here to view details and respond</a></p>
      <p>This link is personal and one-time — no signup, password, or account is required. After accepting, you'll also be asked to choose your available dates for the defense — all through this same link, no separate one needed.</p>
    `,
  },

  examiner_otp_code: {
    subjectHe: '🔐 קוד אימות לגישת בוחן',
    subjectEn: '🔐 Examiner Access Verification Code',
    bodyHe: (d) => `
      <p>שלום ${d.name || ''},</p>
      <p>קוד האימות שלך לצפייה בפרטי השיפוט הוא:</p>
      <p style="font-size:28px;font-weight:bold;letter-spacing:6px;text-align:center;margin:20px 0">${d.code || ''}</p>
      <p>הקוד תקף ל-10 דקות. אם לא ביקשת קוד זה, ניתן להתעלם מהודעה זו.</p>
    `,
    bodyEn: (d) => `
      <p>Hello ${d.name || ''},</p>
      <p>Your verification code to view the review details is:</p>
      <p style="font-size:28px;font-weight:bold;letter-spacing:6px;text-align:center;margin:20px 0">${d.code || ''}</p>
      <p>This code expires in 10 minutes. If you did not request it, you can safely ignore this email.</p>
    `,
  },

  defense_dates_requested: {
    subjectHe: '📅 נדרשת בחירת תאריכים להגנה',
    subjectEn: '📅 Defense date selection required',
    bodyHe: (d) => `
      <p>שלום ${d.name || ''},</p>
      <p>שובצת כבוחן/ת בהגנה. יש להיכנס לקישור השיפוט שקיבלת ולבחור תאריכים אפשריים להגנה.</p>
    `,
    bodyEn: (d) => `
      <p>Hello ${d.name || ''},</p>
      <p>You have been assigned as a defense examiner. Please open your review link and submit your available defense dates.</p>
    `,
  },

  defense_date_matched: {
    subjectHe: '✅ נקבע מועד הגנה',
    subjectEn: '✅ Defense date set',
    bodyHe: (d) => `
      <p>שלום ${d.name || ''},</p>
      <p>נקבע מועד הגנה בתאריך <strong>${d.date || ''}</strong>.</p>
      <p>השעה, החדר והבניין ייקבעו בהמשך על ידי הרכז.</p>
    `,
    bodyEn: (d) => `
      <p>Hello ${d.name || ''},</p>
      <p>A defense date has been set: <strong>${d.date || ''}</strong>.</p>
      <p>Time, room, and building will follow from the coordinator.</p>
    `,
  },

  defense_day_access_link: {
    subjectHe: '🔑 קישור גישה ליום ההגנה',
    subjectEn: '🔑 Your defense-day access link',
    bodyHe: (d) => `
      <p>שלום ${d.name || ''},</p>
      <p>קישור זה יעניק לך גישה לאפליקציה ביום ההגנה בלבד — <strong>${d.date || ''}</strong>, עד חצות.</p>
      <p><a href="${d.link || ''}">לחץ כאן לגישה ביום ההגנה</a></p>
      <p>לאחר חצות הקישור לא יהיה תקף. אם לא הספקת להתחבר, פנה לרכז הפקולטה.</p>
    `,
    bodyEn: (d) => `
      <p>Hello ${d.name || ''},</p>
      <p>This link grants app access only on the day of the defense — <strong>${d.date || ''}</strong>, until midnight.</p>
      <p><a href="${d.link || ''}">Tap here for defense-day access</a></p>
      <p>After midnight this link stops working. If you missed the window, contact the faculty coordinator.</p>
    `,
  },

  totp_recovery_code: {
    subjectHe: '🔑 קוד שחזור לאימות דו-שלבי',
    subjectEn: '🔑 Two-Factor Recovery Code',
    bodyHe: (d) => `
      <p>שלום ${d.name || ''},</p>
      <p>קיבלנו בקשה לאיפוס האימות הדו-שלבי בחשבונך. קוד האימות שלך הוא:</p>
      <p style="font-size:28px;font-weight:bold;letter-spacing:6px;text-align:center;margin:20px 0">${d.code || ''}</p>
      <p>הקוד תקף ל-10 דקות. אם לא ביקשת זאת, התעלם מהודעה זו — האימות הדו-שלבי בחשבונך לא ישתנה.</p>
    `,
    bodyEn: (d) => `
      <p>Hello ${d.name || ''},</p>
      <p>We received a request to reset two-factor authentication on your account. Your recovery code is:</p>
      <p style="font-size:28px;font-weight:bold;letter-spacing:6px;text-align:center;margin:20px 0">${d.code || ''}</p>
      <p>This code expires in 10 minutes. If you didn't request this, ignore this email — your 2FA setup will not change.</p>
    `,
  },

  login_security_alert: {
    subjectHe: '⚠️ ניסיונות התחברות כושלים בחשבונך',
    subjectEn: '⚠️ Repeated failed login attempts on your account',
    bodyHe: (d) => `
      <p>שלום ${d.name || ''},</p>
      <p>זיהינו 3 ניסיונות התחברות כושלים בחשבונך (<strong>${d.email || ''}</strong>):</p>
      <ul>
        <li>מתי: ${d.dateTime || ''}</li>
        <li>כתובת IP: ${d.ip || ''}</li>
        ${d.location ? `<li>מיקום משוער: ${d.location}</li>` : ''}
      </ul>
      <p>מסיבות אבטחה השבתנו זמנית את האפשרות להתחבר לחשבון. אנא ציין האם זה היה אתה:</p>
      <p><a href="${d.link || ''}">לחץ כאן לענות</a></p>
      <p>אם זה היית אתה, נשלח לך סיסמה זמנית להתחברות. אם לא, נתרה במנהל המערכת ונשאיר את החשבון מושבת.</p>
    `,
    bodyEn: (d) => `
      <p>Hello ${d.name || ''},</p>
      <p>We detected 3 failed login attempts on your account (<strong>${d.email || ''}</strong>):</p>
      <ul>
        <li>When: ${d.dateTime || ''}</li>
        <li>IP address: ${d.ip || ''}</li>
        ${d.location ? `<li>Approximate location: ${d.location}</li>` : ''}
      </ul>
      <p>For security, we've temporarily disabled sign-in on this account. Please tell us whether this was you:</p>
      <p><a href="${d.link || ''}">Tap here to respond</a></p>
      <p>If it was you, we'll send a temporary password to log in with. If not, we'll alert a system administrator and keep the account disabled.</p>
    `,
  },

  temp_password_issued: {
    subjectHe: '🔑 סיסמה זמנית לחשבונך',
    subjectEn: '🔑 Temporary password for your account',
    bodyHe: (d) => `
      <p>שלום ${d.name || ''},</p>
      <p>כפי שביקשת, הפעלנו מחדש את חשבונך עם סיסמה זמנית:</p>
      <p style="font-size:20px;font-weight:bold;letter-spacing:2px;text-align:center;margin:20px 0">${d.tempPassword || ''}</p>
      <p>התחבר עם הסיסמה הזו — תתבקש מיד לבחור סיסמה חדשה, ולא ניתן יהיה להמשיך להשתמש באפליקציה לפני כן.</p>
    `,
    bodyEn: (d) => `
      <p>Hello ${d.name || ''},</p>
      <p>As requested, we've re-enabled your account with a temporary password:</p>
      <p style="font-size:20px;font-weight:bold;letter-spacing:2px;text-align:center;margin:20px 0">${d.tempPassword || ''}</p>
      <p>Log in with this password — you'll be required to choose a new one immediately, and won't be able to use the app until you do.</p>
    `,
  },

  suspicious_login_admin_alert: {
    subjectHe: '🚨 ניסיון התחברות חשוד — נדרשת תשומת לב',
    subjectEn: '🚨 Suspicious login attempt — needs attention',
    bodyHe: (d) => `
      <p>שלום ${d.name || ''},</p>
      <p>בעל חשבון דיווח שניסיון התחברות שזוהה לחשבונו <strong>לא</strong> בוצע על ידו. פרטי הניסיון:</p>
      <ul>
        <li>כתובת אימייל שנוסתה: ${d.attemptedEmail || ''}</li>
        <li>מתי: ${d.dateTime || ''}</li>
        <li>כתובת IP: ${d.ip || ''}</li>
        ${d.location ? `<li>מיקום משוער: ${d.location}</li>` : ''}
      </ul>
      <p>החשבון נותר מושבת עד לבדיקה ידנית. היכנס לפאנל הניהול לפרטים נוספים ולשחזור הגישה במידת הצורך.</p>
    `,
    bodyEn: (d) => `
      <p>Hello ${d.name || ''},</p>
      <p>An account owner reported that a detected login attempt was <strong>not</strong> them. Attempt details:</p>
      <ul>
        <li>Email attempted: ${d.attemptedEmail || ''}</li>
        <li>When: ${d.dateTime || ''}</li>
        <li>IP address: ${d.ip || ''}</li>
        ${d.location ? `<li>Approximate location: ${d.location}</li>` : ''}
      </ul>
      <p>The account remains disabled pending manual review. Open the admin panel for further detail and to restore access if needed.</p>
    `,
  },

  two_factor_enforcement_notice: {
    subjectHe: '🔐 אימות דו-שלבי יהפוך לחובה בעוד 7 ימים',
    subjectEn: '🔐 Two-Factor Authentication Becomes Mandatory in 7 Days',
    bilingual: true,
    bodyHe: (d) => `
      <p>שלום ${d.name || ''},</p>
      <p><strong>החל מתאריך ${d.deadlineDate || ''}, המערכת תחייב אימות דו-שלבי (2FA) עבור כל המשתמשים.</strong></p>
      <p>מומלץ להגדיר זאת כבר עכשיו, לפני שהדבר יהפוך לחובה, כדי להימנע מהפרעה בגישה לחשבונך.</p>
      <p><strong>איך להפעיל אימות דו-שלבי:</strong></p>
      <ol>
        <li>היכנסו למערכת ופתחו את מסך "אימות דו-שלבי" (<a href="${WEBSITE_URL}/setup-2fa">לחצו כאן</a>).</li>
        <li>סרקו את קוד ה-QR המוצג באמצעות אפליקציית Google Authenticator (או כל אפליקציית אימות תואמת אחרת).</li>
        <li>הזינו את הקוד בן 6 הספרות המופיע באפליקציה כדי לאשר.</li>
      </ol>
      <p>זהו — בכניסות הבאות תתבקשו להזין קוד מהאפליקציה לצד הסיסמה.</p>
    `,
    bodyEn: (d) => `
      <p>Hello ${d.name || ''},</p>
      <p><strong>Starting ${d.deadlineDate || ''}, the system will require two-factor authentication (2FA) for every user.</strong></p>
      <p>We recommend setting it up now, before it becomes mandatory, to avoid any interruption accessing your account.</p>
      <p><strong>How to enable two-factor authentication:</strong></p>
      <ol>
        <li>Log in and open the "Two-Factor Authentication" screen (<a href="${WEBSITE_URL}/setup-2fa">click here</a>).</li>
        <li>Scan the QR code shown using the Google Authenticator app (or any compatible authenticator app).</li>
        <li>Enter the 6-digit code shown in the app to confirm.</li>
      </ol>
      <p>That's it — on future logins you'll be asked for a code from the app alongside your password.</p>
    `,
  },

  general: {
    subjectHe: '🔔 עדכון מהמערכת',
    subjectEn: '🔔 System Update',
    bodyHe: (d) => `<p>שלום ${d.name || ''},</p><p>${d.message || ''}</p>`,
    bodyEn: (d) => `<p>Hello ${d.name || ''},</p><p>${d.message || ''}</p>`,
  },
};

export function buildEmailHtml(
  type: NotificationType,
  lang: 'he' | 'en',
  data: Record<string, string>
): { subject: string; html: string } {
  const template = EMAIL_TEMPLATES[type] ?? EMAIL_TEMPLATES.general;
  const isHe     = lang === 'he';
  const dir      = isHe ? 'rtl' : 'ltr';
  const safeData = escapeEmailData(data);

  // Bilingual templates (currently just account_created) send both
  // languages in one email — the recipient hasn't set an in-app language
  // preference yet at account-creation time, so there's no single language
  // to reliably pick. `lang` still picks header/footer/dir for the overall
  // document and which language section reads first.
  const subject = template.bilingual
    ? `${template.subjectHe} / ${template.subjectEn}`
    : (isHe ? template.subjectHe : template.subjectEn);

  const templateBody = template.bilingual
    ? `
      <div dir="rtl" style="text-align:right;">${template.bodyHe(safeData)}</div>
      <hr style="border:none; border-top:1px solid #E3E8F2; margin:24px 0;" />
      <div dir="ltr" style="text-align:left;">${template.bodyEn(safeData)}</div>
    `
    : (isHe ? template.bodyHe(safeData) : template.bodyEn(safeData));

  // A real "go see it" link at the very bottom of the message, for whichever
  // channels notify.ts's resolveNotificationLinks found a destination for
  // (webLink/appLink land in `data` only via notifyUser — a template sent
  // through some other path, e.g. examiner_access_link's own bespoke `d.link`,
  // simply won't have either key set, so no footer is added on top of that
  // template's own action link). Not escaped through escapeEmailData — these
  // are server-generated URLs, never another user's free text.
  const linkFooter = (data.webLink || data.appLink) ? `
    <hr style="border:none; border-top:1px solid #E3E8F2; margin:24px 0;" />
    ${data.webLink ? `<p style="margin:4px 0;">${isHe ? 'לצפייה באתר, ' : 'To view on the website, '}<a href="${data.webLink}">${isHe ? 'לחצו כאן' : 'click here'}</a></p>` : ''}
    ${data.appLink ? `<p style="margin:4px 0;">${isHe ? 'לצפייה באפליקציה, ' : 'To view in the app, '}<a href="${data.appLink}">${isHe ? 'לחצו כאן' : 'click here'}</a></p>` : ''}
  ` : '';
  const body = `${templateBody}${linkFooter}`;

  const html = `
    <!DOCTYPE html>
    <html dir="${dir}" lang="${lang}">
    <head>
      <meta charset="UTF-8"/>
      <style>
        body { font-family: Arial, sans-serif; background:#F0F4FF; margin:0; padding:0; }
        .wrapper { max-width:560px; margin:32px auto; background:#fff;
                   border-radius:16px; overflow:hidden;
                   box-shadow:0 4px 24px rgba(0,0,0,0.07); }
        .header  { background:#2E86FF; padding:24px 32px; text-align:center; }
        .header h1 { color:#fff; margin:0; font-size:20px; }
        .body    { padding:28px 32px; color:#333; line-height:1.7; direction:${dir}; }
        .footer  { background:#F0F4FF; padding:14px 32px;
                   text-align:center; font-size:11px; color:#9BA8C0; }
      </style>
    </head>
    <body>
      <div class="wrapper">
        <div class="header">
          <h1>${template.bilingual ? 'מערכת ניהול פרויקטים / Project Management System' : (isHe ? 'מערכת ניהול פרויקטים' : 'Project Management System')}</h1>
        </div>
        <div class="body">${body}</div>
        <div class="footer">
          ${template.bilingual
            ? 'הודעה זו נשלחה אוטומטית — אין להשיב על מייל זה. / This is an automated message — please do not reply to this email.'
            : (isHe
                ? 'הודעה זו נשלחה אוטומטית — אין להשיב על מייל זה.'
                : 'This is an automated message — please do not reply to this email.')}
        </div>
      </div>
    </body>
    </html>
  `;

  return { subject, html };
}