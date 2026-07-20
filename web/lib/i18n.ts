// lib/i18n.ts
// Bilingual (Hebrew / English) string table for the entire app.
// Ported verbatim from mobile/components/i18n.ts so mobile and web always
// speak the exact same copy — edit in one place, copy over to the other.
// Usage:  import { t, tx, Lang } from '@/lib/i18n';
//         const label = tx('save', lang);          // string
//         const label = t.save[lang];              // equivalent

export type Lang = 'he' | 'en';

export const t = {

  // ══════════════════════════════════════════════════════════════════════════
  // GENERAL / SHARED
  // ══════════════════════════════════════════════════════════════════════════
  appName:            { he: 'מערכת פרויקטי גמר',                     en: 'Final Projects System' },
  hitName:            { he: 'המכון הטכנולוגי חולון',                  en: 'Holon Institute of Technology' },
  logout:             { he: 'יציאה',                                   en: 'Sign Out' },
  loading:            { he: 'טוען...',                                  en: 'Loading...' },
  save:               { he: 'שמור',                                    en: 'Save' },
  saving:             { he: 'שומר...',                                  en: 'Saving...' },
  cancel:             { he: 'ביטול',                                   en: 'Cancel' },
  confirm:            { he: 'אישור',                                   en: 'Confirm' },
  submit:             { he: 'הגש',                                     en: 'Submit' },
  submitting:         { he: 'שולח...',                                  en: 'Submitting...' },
  back:               { he: 'חזור',                                    en: 'Back' },
  next:               { he: 'הבא',                                     en: 'Next' },
  search:             { he: 'חיפוש',                                   en: 'Search' },
  filter:             { he: 'סנן',                                     en: 'Filter' },
  all:                { he: 'הכל',                                     en: 'All' },
  yes:                { he: 'כן',                                      en: 'Yes' },
  no:                 { he: 'לא',                                      en: 'No' },
  none:               { he: 'אין',                                     en: 'None' },
  edit:               { he: 'עריכה',                                   en: 'Edit' },
  delete:             { he: 'מחק',                                     en: 'Delete' },
  view:               { he: 'צפה',                                     en: 'View' },
  download:           { he: 'הורד',                                    en: 'Download' },
  upload:             { he: 'העלה',                                    en: 'Upload' },
  approve:            { he: 'אשר',                                     en: 'Approve' },
  reject:             { he: 'דחה',                                     en: 'Reject' },
  returnForRevision:  { he: 'החזר לתיקון',                            en: 'Return for Revision' },
  send:               { he: 'שלח',                                     en: 'Send' },
  add:                { he: 'הוסף',                                    en: 'Add' },
  remove:             { he: 'הסר',                                     en: 'Remove' },
  close:              { he: 'סגור',                                    en: 'Close' },
  open:               { he: 'פתח',                                     en: 'Open' },
  actions:            { he: 'פעולות',                                  en: 'Actions' },
  details:            { he: 'פרטים',                                   en: 'Details' },
  history:            { he: 'היסטוריה',                                en: 'History' },
  comments:           { he: 'הערות',                                   en: 'Comments' },
  reason:             { he: 'סיבה',                                    en: 'Reason' },
  optional:           { he: 'אופציונלי',                               en: 'Optional' },
  required:           { he: 'שדה חובה',                               en: 'Required' },
  error:              { he: 'שגיאה',                                   en: 'Error' },
  success:            { he: 'הצלחה',                                   en: 'Success' },
  warning:            { he: 'אזהרה',                                   en: 'Warning' },
  info:               { he: 'מידע',                                    en: 'Info' },
  noData:             { he: 'אין נתונים להצגה',                       en: 'No data to display' },
  tryAgain:           { he: 'נסה שוב',                                 en: 'Try Again' },
  refresh:            { he: 'רענן',                                    en: 'Refresh' },
  exportExcel:        { he: 'ייצא לאקסל',                             en: 'Export to Excel' },
  exportPdf:          { he: 'ייצא ל-PDF',                              en: 'Export to PDF' },
  printView:          { he: 'תצוגת הדפסה',                            en: 'Print View' },
  date:               { he: 'תאריך',                                   en: 'Date' },
  time:               { he: 'שעה',                                     en: 'Time' },
  name:               { he: 'שם',                                      en: 'Name' },
  email:              { he: 'דוא"ל',                                   en: 'Email' },
  phone:              { he: 'טלפון',                                   en: 'Phone' },
  language:           { he: 'שפה',                                     en: 'Language' },
  hebrew:             { he: 'עברית',                                   en: 'Hebrew' },
  english:            { he: 'אנגלית',                                  en: 'English' },
  fileUploaded:       { he: 'הקובץ הועלה ✓',                          en: 'File uploaded ✓' },
  tapToUpload:        { he: 'לחץ להעלאה',                             en: 'Tap to upload' },
  noAttachedFiles:    { he: 'אין קבצים מצורפים',                      en: 'No attached files' },
  attachedFiles:      { he: 'קבצים מצורפים',                          en: 'Attached files' },
  fileDownload:       { he: 'הורד קובץ',                              en: 'Download File' },
  version:            { he: 'גרסה',                                    en: 'Version' },
  createdAt:          { he: 'נוצר בתאריך',                            en: 'Created at' },
  updatedAt:          { he: 'עודכן בתאריך',                           en: 'Updated at' },
  by:                 { he: 'על ידי',                                  en: 'By' },

  // ══════════════════════════════════════════════════════════════════════════
  // AUTH
  // ══════════════════════════════════════════════════════════════════════════
  login:              { he: 'התחבר',                                   en: 'Sign In' },
  loginTitle:         { he: 'ברוך הבא',                               en: 'Welcome Back' },
  loginSubtitle:      { he: 'הזן פרטי התחברות',                       en: 'Enter your credentials' },
  emailLabel:         { he: 'כתובת דוא"ל',                            en: 'Email Address' },
  passwordLabel:      { he: 'סיסמה',                                  en: 'Password' },
  forgotPassword:     { he: 'שכחתי סיסמה',                           en: 'Forgot Password' },
  resetPassword:      { he: 'איפוס סיסמה',                            en: 'Reset Password' },
  resetPasswordSent:  { he: 'נשלח מייל לאיפוס סיסמה',               en: 'Password reset email sent' },
  signup:             { he: 'הרשמה',                                  en: 'Sign Up' },
  signupTitle:        { he: 'יצירת חשבון',                            en: 'Create Account' },
  setup2fa:           { he: 'הגדרת אימות דו-שלבי',                    en: 'Set Up Two-Factor Auth' },
  verify2fa:          { he: 'אימות דו-שלבי',                          en: 'Two-Factor Verification' },
  twoFaCode:          { he: 'קוד אימות',                              en: 'Verification Code' },
  loginError:         { he: 'שגיאה בהתחברות. בדוק פרטים.',           en: 'Login failed. Check your credentials.' },
  noAccess:           { he: 'אין לך הרשאה לגשת לדף זה',              en: 'You do not have access to this page' },

  // External examiner (link-based, no password)
  examinerLinkTitle:        { he: 'כניסת בוחן חיצוני',               en: 'External Examiner Access' },
  examinerLinkSubtitle:     { he: 'גישה מאובטחת לשיפוט עבודה',       en: 'Secure access to review a thesis' },
  examinerLinkExpired:      { he: 'הקישור פג תוקף או אינו תקין',     en: 'This link has expired or is invalid' },
  examinerLinkLoading:      { he: 'מאמת גישה...',                     en: 'Verifying access...' },
  examinerWelcome:          { he: 'שלום, בוחן/ת יקר/ה',              en: 'Welcome, Examiner' },
  examinerThesisTitle:      { he: 'עבודה לשיפוט',                     en: 'Thesis for Review' },
  examinerDeadline:         { he: 'מועד אחרון לחוות דעת',            en: 'Opinion deadline' },
  examinerDaysLeft:         { he: 'ימים נותרו',                       en: 'days remaining' },
  examinerAccept:           { he: 'קבל שיפוט',                        en: 'Accept Assignment' },
  examinerDecline:          { he: 'דחה שיפוט',                        en: 'Decline Assignment' },
  examinerAccepted:         { he: 'קיבלת את השיפוט',                 en: 'You accepted this review' },
  examinerDeclined:         { he: 'דחית את השיפוט',                  en: 'You declined this review' },
  examinerSubmitOpinion:    { he: 'הגש חוות דעת',                     en: 'Submit Opinion' },
  examinerOpinionSent:      { he: '✅ חוות הדעת נשלחה בהצלחה',       en: '✅ Opinion submitted successfully' },
  examinerViewThesis:       { he: 'צפה בעבודה',                       en: 'View Thesis' },
  examinerDownloadThesis:   { he: 'הורד עבודה',                       en: 'Download Thesis' },
  examinerDeclineReason:    { he: 'סיבת הדחייה',                      en: 'Reason for Declining' },
  examinerAccessLog:        { he: 'פעולה זו נרשמת ביומן הגישה',      en: 'This action is recorded in the access log' },
  examinerTokenInvalid:     { he: 'הקישור אינו תקין',                 en: 'Invalid access link' },
  examinerTokenUsed:        { he: 'הקישור כבר שומש',                  en: 'This link has already been used' },
  examinerSendReminder:     { he: 'שלח תזכורת לבוחן',                en: 'Send Reminder to Examiner' },
  examinerReminderSent:     { he: 'התזכורת נשלחה',                   en: 'Reminder sent' },
  examinerResendLink:       { he: 'שלח קישור חדש',                   en: 'Resend Link' },

  // ── External examiner — second-factor OTP gate ───────────────────────────
  examinerOtpRequiredTitle: { he: 'אימות נוסף נדרש',                  en: 'Additional Verification Required' },
  examinerOtpRequiredBody:  { he: 'לפני הצפייה בפרטים, עלינו לוודא שאתה אכן הבוחן שהוזמן. לחץ לשליחת קוד לכתובת המייל שלך.', en: 'Before viewing the details, we need to confirm you are the invited examiner. Tap to send a code to your email.' },
  examinerOtpSendBtn:       { he: 'שלח קוד למייל',                    en: 'Send code to my email' },
  examinerOtpSending:       { he: 'שולח...',                          en: 'Sending...' },
  examinerOtpEnterLabel:    { he: 'הזן את הקוד שנשלח למייל שלך',      en: 'Enter the code sent to your email' },
  examinerOtpVerifyBtn:     { he: 'אמת קוד',                          en: 'Verify Code' },
  examinerOtpResendBtn:     { he: 'שלח קוד חדש',                     en: 'Resend code' },
  examinerOtpSendError:     { he: 'שליחת הקוד נכשלה. נסה שוב.',      en: 'Failed to send the code. Please try again.' },
  examinerOtpInvalidCode:   { he: 'קוד שגוי. נסה שוב.',               en: 'Incorrect code. Please try again.' },

  // ── External examiner — accept/decline & opinion form ────────────────────
  examinerNameLabel:            { he: 'שם הבוחן',                        en: 'Examiner' },
  examinerStudentLabel:         { he: 'שם הסטודנט',                     en: 'Student' },
  examinerDeclineReasonPlaceholder: { he: 'הסבר מדוע אינך יכול לשפט עבודה זו...', en: 'Explain why you cannot review this thesis...' },
  examinerDeclineReasonRequiredBody: { he: 'יש להזין סיבת דחייה',        en: 'Please enter a reason for declining' },
  examinerInvalidBody:          { he: 'הקישור שקיבלת אינו תקין. פנה לרכז הפקולטה לקבלת קישור חדש.', en: 'The link you received is invalid. Please contact the faculty coordinator for a new link.' },
  examinerExpiredBody:          { he: 'מועד השיפוט חלף. פנה לרכז הפקולטה לקבלת הארכה.', en: 'The review deadline has passed. Please contact the faculty coordinator for an extension.' },
  examinerDeclinedBody:         { he: 'דחית את בקשת השיפוט. הרכז יפנה אליך אם יש שאלות.', en: 'You have declined this review assignment. The coordinator will reach out if needed.' },
  examinerSuperseded:           { he: 'המשימה הועברה לבוחן אחר', en: 'This assignment was reassigned' },
  examinerSupersededBody:       { he: 'שיפוט העבודה הועבר לבוחן אחר. אין צורך בפעולה נוספת מצדך.', en: 'This review was reassigned to another examiner. No further action is needed from you.' },
  examinerSubmittedBody:        { he: 'חוות הדעת שלך התקבלה. תודה על שיתוף הפעולה.', en: 'Your opinion has been received. Thank you for your cooperation.' },
  examinerOpinionSubmittedAt:   { he: 'הוגש בתאריך:',                    en: 'Submitted at:' },
  examinerCouldNotOpenFile:     { he: 'לא ניתן לפתוח את הקובץ',          en: 'Could not open the file' },
  examinerTotalLabel:           { he: 'סה"כ',                            en: 'Total' },
  examinerRecommendationLabel:  { he: 'המלצה',                           en: 'Recommendation' },
  examinerScoreErrorTitle:      { he: 'שגיאה בציון',                     en: 'Score error' },
  examinerMissingRecommendationTitle: { he: 'חסרה המלצה',               en: 'Missing recommendation' },
  examinerMissingRecommendationBody:  { he: 'יש לבחור המלצה',            en: 'Please select a recommendation' },
  examinerCommentsRequiredTitle: { he: 'חסרות הערות',                    en: 'Comments required' },
  examinerCommentsRequiredBody:  { he: 'יש להוסיף הערות כלליות',         en: 'Please add overall comments' },
  examinerCommentsPlaceholder:   { he: 'הערות כלליות לעבודה ולסטודנט...', en: 'General comments on the thesis and student...' },

  // ── External examiner — defense date matching ────────────────────────────
  examinerDefenseDateSectionTitle: { he: 'בחירת תאריך הגנה',            en: 'Defense date selection' },
  examinerDefenseDateWithin:       { he: 'בטווח',                        en: 'Within' },
  examinerDefenseDateSunThu:       { he: 'ראשון–חמישי בלבד',            en: 'Sun-Thu only' },
  examinerDefenseDateSubmitBtn:    { he: 'שלח תאריכים',                  en: 'Submit dates' },
  examinerDefenseDateInvalidFormat:{ he: 'יש להזין תאריכים בפורמט YYYY-MM-DD', en: 'Enter dates as YYYY-MM-DD' },
  examinerDefenseDateWaiting:      { he: 'התאריכים נשלחו — ממתין לבוחן/ת השני/ה', en: 'Dates submitted — waiting on the other examiner' },
  examinerDefenseDateMatched:      { he: 'נמצא תאריך משותף:',           en: 'Common date found:' },
  examinerDefenseDateConflict:     { he: 'לא נמצא תאריך משותף — הרכז/ת פותר/ת', en: 'No common date found — coordinator resolving' },

  // ══════════════════════════════════════════════════════════════════════════
  // DEFENSE-DAY ACCESS (public, unauthenticated — see /defense-access)
  // ══════════════════════════════════════════════════════════════════════════
  defenseAccessTitle:        { he: 'גישה ליום ההגנה',                   en: "Today's Defense Access" },
  defenseAccessInvalidTitle: { he: 'קישור לא תקין',                      en: 'Invalid link' },
  defenseAccessInvalidBody:  { he: 'פנה לרכז הפקולטה לקבלת קישור חדש.',  en: 'Contact the faculty coordinator for a new link.' },
  defenseAccessNotYetTitle:  { he: 'עדיין לא זמין',                      en: 'Not yet available' },
  defenseAccessNotYetBody:   { he: 'קישור זה יהיה פעיל רק ביום ההגנה:',  en: 'This link only activates on the day of the defense:' },
  defenseAccessExpiredTitle: { he: 'הקישור פג תוקף',                     en: 'Link expired' },
  defenseAccessExpiredBody:  { he: 'הגישה ליום ההגנה הסתיימה בחצות. אם לא הצלחת להתחבר, פנה למנהל המערכת לקבלת הארכה.', en: 'Defense-day access ended at midnight. If you missed it, contact the system administrator for an extension.' },
  defenseAccessHello:        { he: 'שלום',                               en: 'Hello' },
  defenseAccessNotSetYet:    { he: 'טרם נקבע',                          en: 'Not set yet' },
  defenseAccessFootnote:     { he: 'גישה זו תקפה עד חצות היום.',        en: 'This access is valid until midnight tonight.' },

  // ══════════════════════════════════════════════════════════════════════════
  // LOGIN SECURITY (public, unauthenticated — see /login-security)
  // ══════════════════════════════════════════════════════════════════════════
  loginSecurityInvalidTitle: { he: 'קישור לא תקין',                      en: 'Invalid link' },
  loginSecurityInvalidBody:  { he: 'קישור זה אינו תקין או שפג תוקפו.',   en: 'This link is invalid or no longer works.' },
  loginSecurityNoticedTitle: { he: 'זיהינו ניסיונות התחברות כושלים',    en: 'We noticed failed login attempts' },
  loginSecurityAccountLabel: { he: 'חשבון:',                             en: 'Account:' },
  loginSecurityWhenLabel:    { he: 'מתי:',                               en: 'When:' },
  loginSecurityIpLabel:      { he: 'כתובת IP:',                          en: 'IP address:' },
  loginSecurityLocationLabel:{ he: 'מיקום משוער:',                       en: 'Approximate location:' },
  loginSecurityQuestion:     { he: 'האם זה היית אתה?',                   en: 'Was this you?' },
  loginSecurityYesBtn:       { he: 'כן, זה הייתי אני',                   en: 'Yes, that was me' },
  loginSecurityNoBtn:        { he: 'לא, זה לא הייתי אני',                en: "No, that wasn't me" },
  loginSecurityExpiredTitle: { he: 'הקישור פג תוקף',                     en: 'This link has expired' },
  loginSecurityOwnerTitle:   { he: 'תודה! שלחנו לך סיסמה זמנית',        en: 'Thanks! We sent you a temporary password' },
  loginSecurityOwnerBody:    { he: 'בדוק את תיבת הדואר שלך לקבלת הסיסמה הזמנית והוראות התחברות. תתבקש לבחור סיסמה חדשה מיד לאחר ההתחברות.', en: "Check your email for the temporary password and login instructions. You'll be asked to choose a new password immediately after logging in." },
  loginSecurityAttackerTitle:{ he: 'תודה, החשבון נשאר מושבת',           en: 'Thanks — the account stays disabled' },
  loginSecurityAttackerBody: { he: 'התרנו במנהל המערכת. החשבון יישאר מושבת עד לבדיקה ידנית.', en: "We've alerted a system administrator. The account will remain disabled pending manual review." },
  loginSecurityAnsweredTitle:{ he: 'הקישור כבר נענה',                    en: 'This link has already been answered' },
  loginSecurityNoActionBody: { he: 'אין צורך בפעולה נוספת.',            en: 'No further action is needed.' },

  // ══════════════════════════════════════════════════════════════════════════
  // NAVIGATION
  // ══════════════════════════════════════════════════════════════════════════
  navHome:            { he: 'בית',                                     en: 'Home' },
  navProjects:        { he: 'פרויקטים',                               en: 'Projects' },
  navMyProject:       { he: 'הפרויקט שלי',                            en: 'My Project' },
  navMilestones:      { he: 'אבני דרך',                               en: 'Milestones' },
  navNotifications:   { he: 'התראות',                                  en: 'Notifications' },
  navDashboard:       { he: 'לוח בקרה',                               en: 'Dashboard' },
  navStudents:        { he: 'סטודנטים',                               en: 'Students' },
  navReports:         { he: 'דוחות',                                   en: 'Reports' },
  navSettings:        { he: 'הגדרות',                                  en: 'Settings' },
  navTemplates:       { he: 'תבניות תהליך',                           en: 'Process Templates' },
  navExaminers:       { he: 'בוחנים',                                  en: 'Examiners' },
  navGrades:          { he: 'ציונים',                                  en: 'Grades' },
  navAdmin:           { he: 'ניהול מערכת',                            en: 'System Admin' },
  navChat:            { he: 'הודעות',                                  en: 'Messages' },
  navInfo:            { he: 'מידע ונהלים',                            en: 'Info & Procedures' },

  // ══════════════════════════════════════════════════════════════════════════
  // ROLES
  // ══════════════════════════════════════════════════════════════════════════
  roleStudent:              { he: 'סטודנט',                           en: 'Student' },
  roleSupervisor:           { he: 'מנחה',                             en: 'Supervisor' },
  roleSecondarySupervisor:  { he: 'מנחה משני',                        en: 'Secondary Supervisor' },
  roleCoordinator:          { he: 'רכז פקולטה',                       en: 'Faculty Coordinator' },
  roleFacultyAdmin:         { he: 'ראש מנהל פקולטה',                  en: 'Faculty Admin Head' },
  roleProgramHead:          { he: 'ראש תוכנית תואר שני',              en: "Master's Program Head" },
  roleProjectCoordinator:   { he: 'מרכז פרויקטים',                    en: 'Project Coordinator' },
  roleGradSchoolHead:       { he: 'ראש בית הספר ללימודי מוסמכים',     en: 'Graduate School Head' },
  roleInternalExaminer:     { he: 'בוחן פנימי',                       en: 'Internal Examiner' },
  roleExternalExaminer:     { he: 'בוחן חיצוני',                      en: 'External Examiner' },
  roleSystemAdmin:          { he: 'מנהל מערכת',                       en: 'System Admin' },
  myRole:                   { he: 'התפקיד שלי',                       en: 'My Role' },
  assignRole:               { he: 'הקצה תפקיד',                       en: 'Assign Role' },
  changeRole:               { he: 'שנה תפקיד',                        en: 'Change Role' },

  // ══════════════════════════════════════════════════════════════════════════
  // FACULTY / DEPARTMENT
  // ══════════════════════════════════════════════════════════════════════════
  faculty:                  { he: 'פקולטה',                           en: 'Faculty' },
  department:               { he: 'חוג',                              en: 'Department' },
  program:                  { he: 'תוכנית',                           en: 'Program' },
  facultyComputerScience:   { he: 'מדעי המחשב',                       en: 'Computer Science' },
  facultyElectrical:        { he: 'הנדסת חשמל',                       en: 'Electrical Engineering' },
  facultySoftware:          { he: 'הנדסת תוכנה',                      en: 'Software Engineering' },
  facultyIndustrial:        { he: 'הנדסה תעשייתית',                   en: 'Industrial Engineering' },
  facultyMechanical:        { he: 'הנדסה מכנית',                      en: 'Mechanical Engineering' },
  facultyLearningTechnology:{ he: 'טכנולוגיות למידה',                 en: 'Learning Technology' },
  allFaculties:             { he: 'כל הפקולטות',                      en: 'All Faculties' },

  // ══════════════════════════════════════════════════════════════════════════
  // DEGREE / TRACK TYPES
  // ══════════════════════════════════════════════════════════════════════════
  degreeType:               { he: 'סוג תואר',                         en: 'Degree Type' },
  bachelors:                { he: 'תואר ראשון',                       en: "Bachelor's" },
  masters:                  { he: 'תואר שני',                         en: "Master's" },
  trackType:                { he: 'סוג מסלול',                        en: 'Track Type' },
  trackThesis:              { he: 'תזה',                              en: 'Thesis' },
  trackFinalProject:        { he: 'פרויקט גמר',                       en: 'Final Project' },
  trackBachelorProject:     { he: 'פרויקט לתואר ראשון',               en: "Bachelor's Project" },
  trackMastersProject:      { he: 'פרויקט גמר לתואר שני',             en: "Master's Final Project" },
  selectTrack:              { he: 'בחר מסלול',                        en: 'Select Track' },
  trackChanged:             { he: 'המסלול שונה. התהליך הקודם נסגר.',  en: 'Track changed. Previous process closed.' },
  groupProject:             { he: 'פרויקט קבוצתי',                   en: 'Group Project' },
  individualProject:        { he: 'פרויקט אישי',                      en: 'Individual Project' },

  // ══════════════════════════════════════════════════════════════════════════
  // STUDENT PROCESS FILE (תיק תהליך)
  // ══════════════════════════════════════════════════════════════════════════
  processFile:              { he: 'תיק תהליך',                        en: 'Process File' },
  processFileFor:           { he: 'תיק תהליך עבור',                   en: 'Process File for' },
  openProcessFile:          { he: 'פתח תיק תהליך',                   en: 'Open Process File' },
  closeProcessFile:         { he: 'סגור תיק תהליך',                  en: 'Close Process File' },
  processStartDate:         { he: 'תאריך פתיחת תיק',                 en: 'Process Start Date' },
  processCloseDate:         { he: 'תאריך סגירת תיק',                  en: 'Process Close Date' },
  processHistory:           { he: 'היסטוריית תהליך',                 en: 'Process History' },
  processNotes:             { he: 'הערות תהליך',                      en: 'Process Notes' },
  noActiveProcess:          { he: 'אין תהליך פעיל',                   en: 'No active process' },
  startProcess:             { he: 'פתח תהליך חדש',                   en: 'Start New Process' },

  // ── Primary statuses ──────────────────────────────────────────────────────
  statusPrimaryLabel:           { he: 'סטטוס ראשי',                    en: 'Primary Status' },
  statusNoTrackSelected:        { he: 'טרם בחר מסלול',                 en: 'Track Not Selected' },
  statusWaitingForSupervisor:   { he: 'ממתין לבחירת מנחה',             en: 'Waiting for Supervisor' },
  statusWaitingForProposal:     { he: 'ממתין להגשת הצעה',              en: 'Waiting for Proposal' },
  statusWaitingForApproval:     { he: 'ממתין לאישור הצעה',             en: 'Waiting for Proposal Approval' },
  statusActive:                 { he: 'בתהליך פעיל',                   en: 'Active' },
  statusWaitingForThesisApproval:{ he: 'ממתין לאישור תזה',             en: 'Waiting for Thesis Approval' },
  statusWaitingForDefense:      { he: 'ממתין לבחינת תזה',              en: 'Waiting for Defense' },
  statusWithdrawn:              { he: 'פרש',                            en: 'Withdrawn' },
  statusOnLeave:                { he: 'בחופשה',                         en: 'On Leave' },
  statusFrozen:                 { he: 'מוקפא',                          en: 'Frozen' },
  statusAdminClosed:            { he: 'סגור מנהלית',                   en: 'Administratively Closed' },

  // ── Operational sub-statuses ──────────────────────────────────────────────
  subStatusLabel:               { he: 'סטטוס תפעולי',                  en: 'Operational Status' },
  subStatusWaitingForSupervisor:{ he: 'ממתין למנחה',                   en: 'Waiting for Supervisor' },
  subStatusWaitingForExaminer:  { he: 'ממתין לבוחן',                   en: 'Waiting for Examiner' },
  subStatusInRevision:          { he: 'בתיקונים',                      en: 'In Revision' },
  subStatusWaitingForGrade:     { he: 'ממתין לציון',                   en: 'Waiting for Grade' },
  subStatusWaitingForSignature: { he: 'ממתין לחתימה',                  en: 'Waiting for Signature' },
  subStatusWaitingForCommittee: { he: 'ממתין לוועדה',                  en: 'Waiting for Committee' },
  subStatusWaitingForTransfer:  { he: 'ממתין להעברה לספרייה',          en: 'Waiting for Library Transfer' },

  // ── Special process states ────────────────────────────────────────────────
  pausedDueToLeave:             { he: 'תהליך מושהה — חופשה',          en: 'Process paused — on leave' },
  pausedDueToMilitary:          { he: 'תהליך מושהה — מילואים',        en: 'Process paused — military reserve' },
  pausedDueToMaternity:         { he: 'תהליך מושהה — חופשת לידה',     en: 'Process paused — maternity leave' },
  pausedDueToIllness:           { he: 'תהליך מושהה — מחלה',           en: 'Process paused — illness' },
  clockPaused:                  { he: 'שעון התהליך מושהה',             en: 'Process clock paused' },
  clockResumed:                 { he: 'שעון התהליך חודש',              en: 'Process clock resumed' },
  pauseProcess:                 { he: 'השהה תהליך',                    en: 'Pause Process' },
  resumeProcess:                { he: 'חדש תהליך',                    en: 'Resume Process' },

  // ── Audit trail ───────────────────────────────────────────────────────────
  auditLog:                     { he: 'יומן פעולות',                   en: 'Audit Log' },
  auditUser:                    { he: 'משתמש',                         en: 'User' },
  auditRole:                    { he: 'תפקיד',                         en: 'Role' },
  auditAction:                  { he: 'פעולה',                         en: 'Action' },
  auditPrevValue:               { he: 'ערך קודם',                      en: 'Previous Value' },
  auditNewValue:                { he: 'ערך חדש',                       en: 'New Value' },
  auditTimestamp:               { he: 'זמן',                           en: 'Timestamp' },
  auditReason:                  { he: 'סיבה',                          en: 'Reason' },

  // ══════════════════════════════════════════════════════════════════════════
  // PROJECTS
  // ══════════════════════════════════════════════════════════════════════════
  project:                  { he: 'פרויקט',                           en: 'Project' },
  projectTitle:             { he: 'כותרת פרויקט',                     en: 'Project Title' },
  projectTitleHe:           { he: 'כותרת בעברית',                     en: 'Title (Hebrew)' },
  projectTitleEn:           { he: 'כותרת באנגלית',                    en: 'Title (English)' },
  projectDescription:       { he: 'תיאור',                            en: 'Description' },
  projectField:             { he: 'תחום',                             en: 'Field' },
  projectPrerequisites:     { he: 'דרישות קדם',                       en: 'Prerequisites' },
  projectMaxStudents:       { he: 'מספר סטודנטים מקסימלי',            en: 'Max Students' },
  projectLanguage:          { he: 'שפת עבודה',                        en: 'Work Language' },
  activeProject:            { he: 'פרויקט פעיל',                      en: 'Active Project' },
  noActiveProject:          { he: 'אין פרויקט פעיל',                  en: 'No active project' },
  browseTitle:              { he: 'פרויקטים פתוחים להרשמה',           en: 'Open Projects' },
  browseSubtitle:           { he: 'בחר/י פרויקט גמר לתואר שלך',       en: 'Choose your final project' },
  noProjects:               { he: 'אין פרויקטים זמינים כרגע',         en: 'No projects available right now' },
  searchPlaceholder:        { he: 'חפש לפי כותרת, מנחה, טכנולוגיה...', en: 'Search by title, supervisor, technology...' },
  publishProject:           { he: 'פרסם פרויקט',                      en: 'Publish Project' },
  unpublishProject:         { he: 'הסר פרסום',                        en: 'Unpublish Project' },
  projectPublished:         { he: 'הפרויקט פורסם',                    en: 'Project published' },
  projectGroup:             { he: 'קבוצת פרויקט',                     en: 'Project Group' },
  groupMembers:             { he: 'חברי קבוצה',                       en: 'Group Members' },
  addMember:                { he: 'הוסף חבר',                         en: 'Add Member' },
  removeMember:             { he: 'הסר חבר',                          en: 'Remove Member' },

  // ── Application ───────────────────────────────────────────────────────────
  applyBtn:                 { he: 'שלח בקשת הכשרה',                   en: 'Send Qualification Request' },
  applyTitle:               { he: 'הגשת מועמדות',                     en: 'Submit Application' },
  applyFor:                 { he: 'מועמדות לפרויקט:',                 en: 'Applying for:' },
  coverNote:                { he: 'מכתב מוטיבציה',                    en: 'Cover Letter' },
  coverPlaceholder:         { he: 'ספר/י על עצמך ולמה אתה/את מתאים/ה לפרויקט זה...', en: 'Tell us about yourself and why you are a good fit...' },
  uploadTranscript:         { he: 'העלה גיליון ציונים (PDF)',          en: 'Upload Transcript (PDF)' },
  uploadCV:                 { he: 'העלה קורות חיים (PDF)',             en: 'Upload CV (PDF)' },
  applySuccess:             { he: '✅ המועמדות הוגשה בהצלחה!',        en: '✅ Application submitted successfully!' },
  applyError:               { he: 'שגיאה בהגשת המועמדות. נסה שוב.',  en: 'Error submitting application. Please try again.' },
  pendingTitle:             { he: 'המועמדות שלך ממתינה לאישור',       en: 'Your Application is Pending' },
  pendingSubtitle:          { he: 'המנחה יבדוק את מועמדותך בהקדם',   en: 'The supervisor will review your application soon' },
  pendingProject:           { he: 'פרויקט:',                           en: 'Project:' },
  pendingSince:             { he: 'הוגשה בתאריך:',                     en: 'Submitted on:' },
  pendingNote:              { he: 'תישלח אליך התראה באפליקציה ובמייל עם קבלת תשובה', en: 'You will be notified in-app and by email when a decision is made' },
  withdrawApp:              { he: 'משוך מועמדות',                     en: 'Withdraw Application' },
  applicationApproved:      { he: 'המועמדות אושרה',                   en: 'Application approved' },
  applicationRejected:      { he: 'המועמדות נדחתה',                   en: 'Application rejected' },

  // ══════════════════════════════════════════════════════════════════════════
  // SUPERVISOR / SECONDARY SUPERVISOR
  // ══════════════════════════════════════════════════════════════════════════
  supervisor:               { he: 'מנחה',                             en: 'Supervisor' },
  secondarySupervisor:      { he: 'מנחה משני',                        en: 'Secondary Supervisor' },
  supervisorApproval:       { he: 'אישור מנחה',                       en: 'Supervisor Approval' },
  supervisorApproved:       { he: 'המנחה אישר',                       en: 'Supervisor approved' },
  supervisorRejected:       { he: 'המנחה דחה',                        en: 'Supervisor rejected' },
  supervisorReturnedForRevision: { he: 'המנחה החזיר לתיקון',          en: 'Supervisor returned for revision' },
  selectSupervisor:         { he: 'בחר מנחה',                         en: 'Select Supervisor' },
  assignSupervisor:         { he: 'שיוך מנחה',                        en: 'Assign Supervisor' },
  supervisorLoad:           { he: 'עומס הנחיה',                       en: 'Supervision Load' },
  supervisorActive:         { he: 'מונחים פעילים',                    en: 'Active Advisees' },
  supervisorRequiresApproval:{ he: 'מנחה זה דורש אישור מיוחד',        en: 'This supervisor requires special approval' },
  supervisorNotApproved:    { he: 'מנחה לא מאושר',                    en: 'Supervisor not approved' },
  myStudents:               { he: 'הסטודנטים שלי',                    en: 'My Students' },
  supervisorDashTitle:      { he: 'לוח בקרה — מנחה',                 en: 'Supervisor Dashboard' },
  proposeSupervisor:        { he: 'הצע מנחה',                         en: 'Propose Supervisor' },
  supervisorConfirmGuidance:{ he: 'אני מסכים להנחות סטודנט זה',       en: 'I agree to supervise this student' },

  // ══════════════════════════════════════════════════════════════════════════
  // MILESTONES
  // ══════════════════════════════════════════════════════════════════════════
  milestone:                { he: 'אבן דרך',                          en: 'Milestone' },
  milestones:               { he: 'אבני דרך',                         en: 'Milestones' },
  milestonesTitle:          { he: 'אבני הדרך שלי',                    en: 'My Milestones' },
  currentMilestone:         { he: 'אבן דרך נוכחית',                   en: 'Current Milestone' },
  nextMilestone:            { he: 'אבן דרך הבאה',                     en: 'Next Milestone' },
  milestoneOrder:           { he: 'סדר',                              en: 'Order' },
  milestoneEnterDate:       { he: 'תאריך כניסה לשלב',                 en: 'Stage Entry Date' },
  milestoneCompleteDate:    { he: 'תאריך השלמה',                      en: 'Completion Date' },
  reopenMilestone:          { he: 'פתח שלב מחדש',                     en: 'Reopen Milestone' },
  reopenReason:             { he: 'סיבה לפתיחה מחדש',                 en: 'Reason for reopening' },
  overrideMilestone:        { he: 'חריגה מאושרת',                     en: 'Approved Override' },

  // Milestone names (configurable per faculty/track — these are defaults)
  milestoneTrackSelection:  { he: 'בחירת מסלול',                      en: 'Track Selection' },
  milestoneSupervisorApproval: { he: 'אישור מנחה ונושא',              en: 'Supervisor & Topic Approval' },
  milestoneResearch:        { he: 'הצעת מחקר',                        en: 'Research Proposal' },
  milestoneProgress:        { he: 'דו"ח התקדמות',                     en: 'Progress Report' },
  milestoneSubmitForJudgment:{ he: 'הגשה לשיפוט',                    en: 'Submission for Judgment' },
  milestoneJudgment:        { he: 'שיפוט',                            en: 'Judgment / Review' },
  milestoneRevisions:       { he: 'תיקונים',                          en: 'Revisions' },
  milestoneDefense:         { he: 'הגנה',                             en: 'Defense' },
  milestoneFinalGrade:      { he: 'ציון סופי',                        en: 'Final Grade' },
  milestoneClosure:         { he: 'סגירת תיק',                        en: 'File Closure' },
  milestoneFinal:           { he: 'דו"ח מסכם',                        en: 'Final Report' },
  milestoneSpecification:   { he: 'אפיון',                            en: 'Specification' },
  milestoneDemo:            { he: 'דמו',                              en: 'Demo' },
  milestoneOralExam:        { he: 'בחינה בעל פה',                     en: 'Oral Exam' },
  milestonePresentation:    { he: 'מצגת',                             en: 'Presentation' },

  // Milestone statuses
  statusPending:            { he: 'ממתין להגשה',                      en: 'Pending Submission' },
  statusSubmitted:          { he: 'הוגש — ממתין לציון מנחה',          en: 'Submitted — Awaiting Supervisor Grade' },
  statusSupervisorGraded:   { he: 'מוגן על ידי מנחה — ממתין לאישור רכז', en: 'Graded — Awaiting Coordinator Approval' },
  statusApproved:           { he: 'אושר',                             en: 'Approved' },
  statusCompleted:          { he: 'הושלם ✓',                          en: 'Completed ✓' },
  statusInRevision:         { he: 'בתיקונים',                         en: 'In Revision' },
  statusAwaitingGradSchool: { he: 'ממתין לאישור ביה"ס ללימודי מוסמכים', en: 'Awaiting Grad School Approval' },
  statusRejected:           { he: 'נדחה',                             en: 'Rejected' },
  statusOverdue:            { he: 'באיחור',                            en: 'Overdue' },
  milestoneSubmittedAwaiting:{ he: 'הוגש — ממתין לאישור',            en: 'Submitted — awaiting approval' },
  milestoneApprovedByCoord: { he: 'אושר ע"י הרכז',                   en: 'Approved by coordinator' },
  waitingForApproval:       { he: 'ממתין לאישור',                     en: 'Waiting for approval' },
  awaitingFacultyGrade:     { he: 'ממתין לאישור סגל',                 en: 'Awaiting Faculty Approval' },

  // Milestone submit form
  submitTitle:              { he: 'הגשת',                             en: 'Submit' },
  uploadFiles:              { he: 'העלה קבצים',                       en: 'Upload Files' },
  uploadProjectInfo:        { he: 'העלה קובץ מידע על הפרויקט (PDF)',  en: 'Upload Project Information File (PDF)' },
  addNote:                  { he: 'הוסף הערה (אופציונלי)',             en: 'Add a note (optional)' },
  notePlaceholder:          { he: 'הערות לגבי ההגשה...',              en: 'Notes about this submission...' },
  submitSuccess:            { he: '✅ ההגשה התקבלה!',                 en: '✅ Submission received!' },
  submitError:              { he: 'שגיאה בהגשה. נסה שוב.',            en: 'Error submitting. Please try again.' },

  // ══════════════════════════════════════════════════════════════════════════
  // PROPOSALS & DOCUMENTS
  // ══════════════════════════════════════════════════════════════════════════
  proposal:                 { he: 'הצעת מחקר',                        en: 'Research Proposal' },
  proposalTitle:            { he: 'כותרת הצעה',                       en: 'Proposal Title' },
  proposalFile:             { he: 'קובץ הצעה',                        en: 'Proposal File' },
  proposalVersion:          { he: 'גרסת הצעה',                        en: 'Proposal Version' },
  proposalSubmitted:        { he: 'ההצעה הוגשה',                      en: 'Proposal submitted' },
  proposalApproved:         { he: 'ההצעה אושרה',                      en: 'Proposal approved' },
  proposalReturnedForRevision:{ he: 'ההצעה הוחזרה לתיקון',           en: 'Proposal returned for revision' },
  proposalRejected:         { he: 'ההצעה נדחתה',                      en: 'Proposal rejected' },
  resubmitProposal:         { he: 'הגש הצעה מחדש',                    en: 'Resubmit Proposal' },
  ethicsRequired:           { he: 'נדרש אישור אתיקה',                 en: 'Ethics Approval Required' },
  ethicsApproval:           { he: 'אישור אתיקה',                      en: 'Ethics Approval' },
  ethicsUploaded:           { he: 'אישור אתיקה הועלה',                en: 'Ethics approval uploaded' },
  documentVersion:          { he: 'גרסה',                             en: 'Version' },
  originalSubmission:       { he: 'הגשה מקורית',                      en: 'Original Submission' },
  revisedSubmission:        { he: 'הגשה מתוקנת',                      en: 'Revised Submission' },
  revisionHistory:          { he: 'היסטוריית תיקונים',                en: 'Revision History' },
  revisionRound:            { he: 'סבב תיקון',                        en: 'Revision Round' },
  thesisFinal:              { he: 'תזה סופית',                        en: 'Final Thesis' },
  thesisForJudgment:        { he: 'תזה לשיפוט',                       en: 'Thesis for Judgment' },
  digitalFile:              { he: 'תיק דיגיטלי',                      en: 'Digital File' },
  generatePdfSummary:       { he: 'הפק PDF מרכז',                     en: 'Generate Summary PDF' },

  // ══════════════════════════════════════════════════════════════════════════
  // PROCESS TEMPLATES (תבניות תהליך)
  // ══════════════════════════════════════════════════════════════════════════
  processTemplate:          { he: 'תבנית תהליך',                      en: 'Process Template' },
  processTemplates:         { he: 'תבניות תהליך',                     en: 'Process Templates' },
  templateName:             { he: 'שם תבנית',                         en: 'Template Name' },
  templateType:             { he: 'סוג תבנית',                        en: 'Template Type' },
  templateScope:            { he: 'היקף תבנית',                       en: 'Template Scope' },
  templateInstitutional:    { he: 'מוסדית',                            en: 'Institutional' },
  templateFaculty:          { he: 'פקולטית',                          en: 'Faculty-level' },
  templateDepartment:       { he: 'מחלקתית',                          en: 'Department-level' },
  templateProgram:          { he: 'מסלולית',                          en: 'Program-level' },
  templateVersion:          { he: 'גרסת תבנית',                       en: 'Template Version' },
  templateActive:           { he: 'תבנית פעילה',                      en: 'Active Template' },
  templateDeviating:        { he: 'סטייה מהתבנית הבסיסית',            en: 'Deviation from base template' },
  templateDeviationApproval:{ he: 'סטייה דורשת אישור',               en: 'Deviation requires approval' },
  approveTemplate:          { he: 'אשר תבנית',                        en: 'Approve Template' },
  applyToExisting:          { he: 'החל על סטודנטים קיימים',           en: 'Apply to existing students' },
  applyToExistingWarning:   { he: 'שינוי זה יחול על סטודנטים קיימים. האם לאשר?', en: 'This will affect existing students. Confirm?' },
  templateNotApprovedYet:   { he: 'התבנית ממתינה לאישור ביה"ס',       en: 'Template pending grad school approval' },

  // ══════════════════════════════════════════════════════════════════════════
  // DEADLINES & TIME
  // ══════════════════════════════════════════════════════════════════════════
  deadline:                 { he: 'דדליין',                            en: 'Deadline' },
  dueDate:                  { he: 'תאריך הגשה:',                       en: 'Due Date:' },
  daysLeft:                 { he: 'ימים לסיום',                        en: 'days left' },
  daysLeftText:             { he: 'ימים לסיום ההגשה',                  en: 'days left until due date' },
  daysOverdue:              { he: 'ימי איחור',                         en: 'days overdue' },
  daysOverdueText:          { he: 'ימי איחור בהגשה',                   en: 'days overdue' },
  overdue:                  { he: 'באיחור!',                           en: 'Overdue!' },
  today:                    { he: 'היום!',                             en: 'Today!' },
  submittedOnTime:          { he: '✅ הוגש בזמן',                      en: '✅ Submitted on time' },
  submittedToday:           { he: '✅ הוגש היום',                      en: '✅ Submitted today' },
  overrideDeadline:         { he: 'שינוי דדליין',                      en: 'Override Deadline' },
  deadlineRuleFromStart:    { he: 'מתחילת התואר',                      en: 'From degree start' },
  deadlineRuleFromSupervisor:{ he: 'מאישור מנחה',                     en: 'From supervisor approval' },
  deadlineRuleFromProposal: { he: 'מאישור הצעה',                       en: 'From proposal approval' },
  deadlineRuleFromPrevious: { he: 'מהשלמת השלב הקודם',                en: 'From previous milestone completion' },
  deadlineRuleFixed:        { he: 'תאריך קבוע',                       en: 'Fixed date' },
  standardPeriod:           { he: 'שנות תקן',                         en: 'Standard period (years)' },
  standardPeriodExceeded:   { he: 'חרג משנות התקן',                   en: 'Standard period exceeded' },
  academicYear:             { he: 'שנת לימודים:',                      en: 'Academic Year:' },

  // ══════════════════════════════════════════════════════════════════════════
  // DASHBOARD (student)
  // ══════════════════════════════════════════════════════════════════════════
  dashTitle:                { he: 'הפרויקט שלי',                      en: 'My Project' },
  dashWelcome:              { he: 'שלום',                              en: 'Hello' },
  projectStatus:            { he: 'סטטוס פרויקט',                     en: 'Project Status' },
  submitMilestone:          { he: 'הגש אבן דרך',                      en: 'Submit Milestone' },

  // ══════════════════════════════════════════════════════════════════════════
  // COORDINATOR DASHBOARD
  // ══════════════════════════════════════════════════════════════════════════
  coordDashTitle:           { he: 'לוח בקרה — רכז פקולטה',            en: 'Faculty Coordinator Dashboard' },
  coordAllStudents:         { he: 'כל הסטודנטים',                     en: 'All Students' },
  coordNeedsAttention:      { he: 'דורש טיפול היום',                  en: 'Needs Attention Today' },
  coordFilterByMilestone:   { he: 'סנן לפי אבן דרך',                  en: 'Filter by Milestone' },
  coordFilterByStatus:      { he: 'סנן לפי סטטוס',                    en: 'Filter by Status' },
  coordFilterByDeviation:   { he: 'הצג חריגות בלבד',                  en: 'Show Deviations Only' },
  coordFilterBySupervisor:  { he: 'סנן לפי מנחה',                     en: 'Filter by Supervisor' },
  coordFilterByYear:        { he: 'סנן לפי שנת התחלה',                en: 'Filter by Start Year' },
  coordSpecialAction:       { he: 'פעולה חריגה',                      en: 'Special Action' },
  coordSpecialActionLog:    { he: 'פעולה חריגה תתועד ביומן',          en: 'This special action will be logged' },
  coordRequiresProgramHead: { he: 'פעולה זו דורשת אישור ראש התוכנית', en: 'This action requires program head approval' },

  // ══════════════════════════════════════════════════════════════════════════
  // FACULTY ADMIN / PROGRAM HEAD
  // ══════════════════════════════════════════════════════════════════════════
  facultyAdminDashTitle:    { he: 'לוח בקרה — מנהל פקולטה',           en: 'Faculty Admin Dashboard' },
  programHeadDashTitle:     { he: 'לוח בקרה — ראש תוכנית',            en: 'Program Head Dashboard' },
  facultyOverview:          { he: 'סקירת פקולטה',                     en: 'Faculty Overview' },
  manageProcessTemplates:   { he: 'נהל תבניות תהליך',                 en: 'Manage Process Templates' },
  manageFacultyUsers:       { he: 'נהל משתמשי פקולטה',                en: 'Manage Faculty Users' },
  pendingFacultyApprovals:  { he: 'אישורים ממתינים',                   en: 'Pending Approvals' },

  // ══════════════════════════════════════════════════════════════════════════
  // GRAD SCHOOL HEAD
  // ══════════════════════════════════════════════════════════════════════════
  gradSchoolDashTitle:      { he: "לוח בקרה — ראש ביה\"ס ללימודי מוסמכים", en: 'Graduate School Head Dashboard' },
  gradSchoolPendingApprovals:{ he: 'ממתין לאישורי',                   en: 'Awaiting My Approvals' },
  gradSchoolMastersOverview:{ he: 'סקירת תהליכי תואר שני',            en: "Master's Processes Overview" },
  gradSchoolApproveTemplate:{ he: 'אשר תבנית פקולטית',                en: 'Approve Faculty Template' },
  gradSchoolApproveSupervisor:{ he: 'אשר מנחה',                       en: 'Approve Supervisor' },
  gradSchoolApproveProposal:{ he: 'אשר הצעת מחקר',                    en: 'Approve Research Proposal' },
  gradSchoolApproveThesis:  { he: 'אשר תזה לפני שיפוט',               en: 'Approve Thesis for Judgment' },
  gradSchoolApproveExaminers:{ he: 'אשר בוחנים',                      en: 'Approve Examiners' },
  gradSchoolApproveFinalGrade:{ he: 'אשר ציון סופי',                  en: 'Approve Final Grade' },
  gradSchoolPendingItems:   { he: 'פריטים ממתינים לאישורי',            en: 'Items Pending My Approval' },
  gradSchoolStuckStudents:  { he: 'סטודנטים תקועים',                  en: 'Stuck Students' },
  gradSchoolExaminerLoad:   { he: 'עומס בוחנים',                      en: 'Examiner Load' },
  gradSchoolFilesBeforeClosure:{ he: 'תיקים לפני סגירה',              en: 'Files Before Closure' },

  // ══════════════════════════════════════════════════════════════════════════
  // PROJECT COORDINATOR
  // ══════════════════════════════════════════════════════════════════════════
  projCoordDashTitle:       { he: 'לוח בקרה — מרכז פרויקטים',         en: 'Project Coordinator Dashboard' },
  projCoordManageGroups:    { he: 'נהל קבוצות פרויקט',                en: 'Manage Project Groups' },
  projCoordOpenGroup:       { he: 'פתח קבוצת פרויקט',                 en: 'Open Project Group' },
  projCoordAssignStudents:  { he: 'שייך סטודנטים לקבוצה',             en: 'Assign Students to Group' },
  projCoordScheduleDefense: { he: 'תאם הגנה',                        en: 'Schedule Defense' },

  // ══════════════════════════════════════════════════════════════════════════
  // EXAMINERS & JUDGMENT
  // ══════════════════════════════════════════════════════════════════════════
  examiner:                 { he: 'בוחן',                             en: 'Examiner' },
  examiners:                { he: 'בוחנים',                           en: 'Examiners' },
  internalExaminer:         { he: 'בוחן פנימי',                       en: 'Internal Examiner' },
  externalExaminer:         { he: 'בוחן חיצוני',                      en: 'External Examiner' },
  examinerDatabase:         { he: 'מאגר בוחנים',                      en: 'Examiner Database' },
  examinerInstitution:      { he: 'מוסד',                             en: 'Institution' },
  examinerExpertise:        { he: 'תחום מומחיות',                     en: 'Area of Expertise' },
  examinerPreferredLanguage:{ he: 'שפה מועדפת',                       en: 'Preferred Language' },
  examinerHistory:          { he: 'היסטוריית שיפוטים',                en: 'Judgment History' },
  examinerCurrentLoad:      { he: 'עומס נוכחי',                       en: 'Current Load' },
  examinerNotes:            { he: 'הערות פנימיות',                    en: 'Internal Notes' },
  proposeExaminers:         { he: 'הצע בוחנים',                       en: 'Propose Examiners' },
  examinerList:             { he: 'רשימת בוחנים',                     en: 'Examiner List' },
  examinerApproved:         { he: 'הבוחן אושר',                       en: 'Examiner approved' },
  examinerInviteSent:       { he: 'פנייה נשלחה לבוחן',               en: 'Invitation sent to examiner' },
  examinerAcceptedReview:   { he: 'הבוחן קיבל את השיפוט',            en: 'Examiner accepted review' },
  examinerDeclinedReview:   { he: 'הבוחן דחה את השיפוט',             en: 'Examiner declined review' },
  examinerNoResponse:       { he: 'הבוחן לא הגיב',                   en: 'Examiner has not responded' },
  examinerReviewClock:      { he: 'שעון שיפוט',                       en: 'Review Clock' },
  examinerReviewDays:       { he: 'ימי שיפוט',                        en: 'Review Days' },
  examinerOpinion:          { he: 'חוות דעת',                         en: 'Opinion / Review' },
  examinerOpinionVisible:   { he: 'חוות הדעת גלויה לסטודנט',          en: 'Opinion visible to student' },
  examinerOpinionAnonymous: { he: 'חוות דעת אנונימית',               en: 'Anonymous opinion' },
  examinerOpinionPartial:   { he: 'חשיפה חלקית של חוות דעת',         en: 'Partial opinion disclosure' },
  examinerOpinionHidden:    { he: 'חוות דעת חסויה',                  en: 'Hidden opinion' },
  nextExaminer:             { he: 'פנה לבוחן הבא',                    en: 'Contact Next Examiner' },
  judgmentDecision:         { he: 'החלטת ביניים לאחר שיפוט',          en: 'Post-judgment decision' },
  proceedToDefense:         { he: 'עבור להגנה',                       en: 'Proceed to Defense' },
  requireRevisions:         { he: 'דרוש תיקונים',                     en: 'Require Revisions' },
  additionalReview:         { he: 'שיפוט חוזר',                       en: 'Additional Review' },
  appointAdditionalExaminer:{ he: 'מנה בוחן נוסף',                   en: 'Appoint Additional Examiner' },

  // ══════════════════════════════════════════════════════════════════════════
  // DEFENSE
  // ══════════════════════════════════════════════════════════════════════════
  defense:                  { he: 'הגנה',                             en: 'Defense' },
  scheduleDefense:          { he: 'תאם הגנה',                        en: 'Schedule Defense' },
  defenseDate:              { he: 'תאריך הגנה:',                      en: 'Defense Date:' },
  defenseTime:              { he: 'שעה:',                              en: 'Time:' },
  defenseRoom:              { he: 'חדר:',                              en: 'Room:' },
  defenseBuilding:          { he: 'בניין:',                            en: 'Building:' },
  buildingUnderConstruction:{ he: 'בבנייה',                            en: 'Under construction' },
  defenseOnline:            { he: 'קישור לפגישה מקוונת',              en: 'Online Meeting Link' },
  defenseParticipants:      { he: 'משתתפים',                          en: 'Participants' },
  defenseInvitationSent:    { he: 'זימון נשלח',                       en: 'Invitation sent' },
  defenseNotScheduled:      { he: 'ההגנה טרם תואמה',                 en: 'Defense not yet scheduled' },
  defenseCompleted:         { he: 'ההגנה הושלמה',                    en: 'Defense completed' },
  postDefenseGrade:         { he: 'הזן ציון לאחר הגנה',               en: 'Enter post-defense grade' },

  // ══════════════════════════════════════════════════════════════════════════
  // GRADES & EVALUATION
  // ══════════════════════════════════════════════════════════════════════════
  grade:                    { he: 'ציון',                              en: 'Grade' },
  grades:                   { he: 'ציונים',                            en: 'Grades' },
  finalGrade:               { he: 'ציון סופי',                        en: 'Final Grade' },
  supervisorGrade:          { he: 'ציון מנחה',                        en: 'Supervisor Grade' },
  gradeComponent:           { he: 'רכיב ציון',                        en: 'Grade Component' },
  gradeComponents:          { he: 'רכיבי ציון',                       en: 'Grade Components' },
  gradeWeight:              { he: 'משקל',                              en: 'Weight' },
  gradeRange:               { he: 'טווח ציונים',                      en: 'Grade Range' },
  gradeScale:               { he: 'סקאלת ציונים',                     en: 'Grade Scale' },
  gradeComments:            { he: 'הערות',                             en: 'Comments' },
  notGradedYet:             { he: 'טרם נוקד',                         en: 'Not graded yet' },
  gradingQuality:           { he: 'איכות הכתיבה',                     en: 'Writing Quality' },
  gradingLiterature:        { he: 'סקירת ספרות',                      en: 'Literature Review' },
  gradingInnovation:        { he: 'רמת חדשנות',                       en: 'Innovation Level' },
  gradingPublication:       { he: 'פרסום / הגשה לפרסום',              en: 'Publication / Submitted for Publication' },
  gradingKnowledge:         { he: 'שליטה בחומר',                      en: 'Subject Mastery' },
  gradingMethodology:       { he: 'מתודולוגיה',                       en: 'Methodology' },
  gradingProductQuality:    { he: 'איכות התוצר',                      en: 'Product Quality' },
  gradingIndependence:      { he: 'עצמאות ויוזמה',                   en: 'Independence & Initiative' },
  gradingTimeliness:        { he: 'עמידה בלוחות זמנים',               en: 'Timeliness' },
  gradingPersonalContrib:   { he: 'תרומה אישית (קבוצתי)',              en: 'Personal Contribution (group)' },
  gradeVisibleToStudent:    { he: 'גלוי לסטודנט',                     en: 'Visible to student' },
  gradeApproved:            { he: 'ציון אושר',                        en: 'Grade approved' },
  gradeApprovalRequired:    { he: 'ציון ממתין לאישור ראש ביה"ס',      en: 'Grade pending grad school head approval' },
  gradeTransferredToMaklol: { he: 'ציון הועבר למכלול',               en: 'Grade transferred to Maklol' },
  gradeChangeReason:        { he: 'סיבת שינוי ציון',                  en: 'Reason for grade change' },
  gradeChangeAudit:         { he: 'שינוי ציון דורש הרשאה ותיעוד',    en: 'Grade change requires permission and documentation' },
  gradeNotSubmitted:        { he: '📭 טרם הוגש',                      en: '📭 Not submitted yet' },
  gradeSubmitted:           { he: '📤 הוגש',                          en: '📤 Submitted' },
  gradeAwaitingApproval:    { he: '⏳ ממתין לאישור ציון ע"י הרכז',   en: '⏳ Awaiting grade approval by coordinator' },
  groupGrade:               { he: 'ציון קבוצתי',                      en: 'Group Grade' },
  individualGrade:          { he: 'ציון אישי',                        en: 'Individual Grade' },
  calculatedFinalGrade:     { he: 'ציון סופי מחושב',                  en: 'Calculated Final Grade' },

  // ══════════════════════════════════════════════════════════════════════════
  // NOTIFICATIONS & ALERTS
  // ══════════════════════════════════════════════════════════════════════════
  notifTitle:               { he: 'התראות',                            en: 'Notifications' },
  noNotifications:          { he: 'אין התראות חדשות',                 en: 'No new notifications' },
  markAllRead:              { he: 'סמן הכל כנקרא',                    en: 'Mark all as read' },
  notifNewTask:             { he: 'משימה חדשה',                       en: 'New Task' },
  notifDeadlineApproaching: { he: 'דדליין מתקרב',                     en: 'Deadline Approaching' },
  notifOverdue:             { he: 'איחור בהגשה',                      en: 'Submission Overdue' },
  notifDocumentReturned:    { he: 'מסמך הוחזר לתיקון',               en: 'Document Returned for Revision' },
  notifExaminerNoResponse:  { he: 'הבוחן לא הגיב',                   en: 'Examiner Has Not Responded' },
  notifOpinionNotSubmitted: { he: 'חוות דעת לא הוגשה',               en: 'Opinion Not Submitted' },
  notifNoSupervisor:        { he: 'סטודנט ללא מנחה',                 en: 'Student Without Supervisor' },
  notifPendingApproval:     { he: 'תיק ממתין לאישורך',               en: 'File Pending Your Approval' },
  notifGradeApproved:       { he: 'הציון אושר',                       en: 'Grade Approved' },
  notifDefenseScheduled:    { he: 'הגנה תואמה',                       en: 'Defense Scheduled' },
  notifApplicationReceived: { he: 'מועמדות חדשה התקבלה',              en: 'New Application Received' },
  emailTemplates:           { he: 'תבניות מייל',                      en: 'Email Templates' },
  editEmailTemplate:        { he: 'ערוך תבנית מייל',                  en: 'Edit Email Template' },
  sendReminder:             { he: 'שלח תזכורת',                       en: 'Send Reminder' },
  escalate:                 { he: 'הסלים',                            en: 'Escalate' },

  // ══════════════════════════════════════════════════════════════════════════
  // REPORTS
  // ══════════════════════════════════════════════════════════════════════════
  reports:                  { he: 'דוחות',                            en: 'Reports' },
  reportAllActive:          { he: 'כל הסטודנטים הפעילים',             en: 'All Active Students' },
  reportNoSupervisor:       { he: 'סטודנטים ללא מנחה',               en: 'Students Without Supervisor' },
  reportDelayedProposal:    { he: 'עיכוב בהצעת מחקר',                en: 'Delayed Research Proposal' },
  reportExaminerTracking:   { he: 'מעקב בוחנים',                     en: 'Examiner Tracking' },
  reportMissingForClosure:  { he: 'חוסרים לסגירת תואר',              en: 'Missing Items for Degree Closure' },
  reportStuckStudents:      { he: 'סטודנטים תקועים',                  en: 'Stuck Students' },
  reportStandardPeriod:     { he: 'חריגת שנות תקן',                   en: 'Standard Period Violation' },
  reportSupervisionLoad:    { he: 'עומס הנחיה ובחינה',                en: 'Supervision & Examination Load' },
  reportThesisRepository:   { he: 'מאגר תיזות ופרויקטים',            en: 'Thesis & Project Repository' },
  reportFilters:            { he: 'מסנני דוח',                        en: 'Report Filters' },
  filterStartYear:          { he: 'שנת התחלה',                        en: 'Start Year' },
  filterFaculty:            { he: 'פקולטה',                           en: 'Faculty' },
  filterDepartment:         { he: 'חוג',                              en: 'Department' },
  filterProgram:            { he: 'תוכנית',                           en: 'Program' },
  filterTrackType:          { he: 'סוג מסלול',                        en: 'Track Type' },
  filterStudentStatus:      { he: 'סטטוס סטודנט',                     en: 'Student Status' },
  filterProcessStatus:      { he: 'סטטוס תהליך',                      en: 'Process Status' },
  filterSupervisor:         { he: 'מנחה',                             en: 'Supervisor' },
  filterExaminer:           { he: 'בוחן',                             en: 'Examiner' },
  filterMilestone:          { he: 'אבן דרך',                          en: 'Milestone' },
  filterDeadline:           { he: 'דדליין',                           en: 'Deadline' },
  filterDeviation:          { he: 'חריגה',                            en: 'Deviation' },
  examinerContactDate:      { he: 'תאריך פנייה לבוחן',               en: 'Examiner Contact Date' },
  examinerApprovalDate:     { he: 'תאריך אישור בוחן',                 en: 'Examiner Approval Date' },
  examinerSubmissionDate:   { he: 'תאריך שליחת עבודה',               en: 'Thesis Sent Date' },
  examinerDaysElapsed:      { he: 'ימים שחלפו',                       en: 'Days Elapsed' },
  examinerOpinionStatus:    { he: 'סטטוס חוות דעת',                  en: 'Opinion Status' },
  deviationLevel:           { he: 'רמת חריגה',                        en: 'Deviation Level' },
  expectedCompletion:       { he: 'צפי סיום',                         en: 'Expected Completion' },
  durationInStage:          { he: 'פז"מ בשלב',                        en: 'Time in Stage' },

  // ══════════════════════════════════════════════════════════════════════════
  // ADMIN PANEL
  // ══════════════════════════════════════════════════════════════════════════
  adminTitle:               { he: 'פאנל ניהול',                       en: 'Admin Panel' },
  adminUsers:               { he: 'ניהול משתמשים',                    en: 'User Management' },
  adminNewUser:             { he: 'משתמש חדש',                        en: 'New User' },
  adminEditUser:            { he: 'עריכת משתמש',                      en: 'Edit User' },
  adminTempPasswordLabel:   { he: 'סיסמה זמנית (אופציונלי)',          en: 'Temporary Password (optional)' },
  adminTempPasswordHelp:    { he: 'השאר ריק ליצירה אוטומטית של סיסמה',en: 'Leave blank to auto-generate one' },
  adminGeneratePassword:    { he: 'צור סיסמה',                        en: 'Generate' },
  adminUserCreatedTitle:    { he: 'המשתמש נוצר בהצלחה',               en: 'User created successfully' },
  adminCopyPassword:        { he: 'העתק סיסמה',                       en: 'Copy password' },
  adminCopied:              { he: 'הועתק!',                           en: 'Copied!' },
  adminDone:                { he: 'סיום',                             en: 'Done' },
  adminUserList:            { he: 'רשימת משתמשים',                    en: 'User List' },
  adminMaintenance:         { he: 'מצב תחזוקה',                       en: 'Maintenance Mode' },
  adminMaintenanceOn:       { he: 'מצב תחזוקה פעיל',                  en: 'Maintenance Mode Active' },
  adminMaintenanceOff:      { he: 'מצב תחזוקה כבוי',                  en: 'Maintenance Mode Off' },
  adminProjectMilestones:   { he: 'אבני דרך פרויקטים',               en: 'Project Milestones' },
  adminFacultySetup:        { he: 'הגדרות פקולטה',                    en: 'Faculty Setup' },
  adminIntegrations:        { he: 'אינטגרציות',                       en: 'Integrations' },
  maklolIntegration:        { he: 'אינטגרציה עם מכלול',               en: 'Maklol Integration' },
  maklolSyncStudents:       { he: 'סנכרון נתוני סטודנטים',            en: 'Sync Student Data' },
  maklolTransferGrade:      { he: 'העבר ציון למכלול',                 en: 'Transfer Grade to Maklol' },

  // ══════════════════════════════════════════════════════════════════════════
  // MESSAGES / CHAT
  // ══════════════════════════════════════════════════════════════════════════
  messages:                 { he: 'הודעות',                            en: 'Messages' },
  newMessage:               { he: 'הודעה חדשה',                       en: 'New Message' },
  messagePlaceholder:       { he: 'כתוב הודעה...',                    en: 'Write a message...' },
  noMessages:               { he: 'אין הודעות',                       en: 'No messages' },
  chatWith:                 { he: 'שיחה עם',                          en: 'Chat with' },

  // ══════════════════════════════════════════════════════════════════════════
  // INFO & BOT
  // ══════════════════════════════════════════════════════════════════════════
  infoTitle:                { he: 'מידע ונהלים',                      en: 'Info & Procedures' },
  facultyGuidelines:        { he: 'הנחיות פקולטה',                    en: 'Faculty Guidelines' },
  facultyAnnouncements:     { he: 'הודעות מנהלת',                     en: 'Admin Announcements' },
  botTitle:                 { he: 'בוט שאלות ותשובות',                en: 'Q&A Bot' },
  botPlaceholder:           { he: 'שאל שאלה על נהלי הפרויקט...',      en: 'Ask a question about project procedures...' },
  botPoweredBy:             { he: 'מבוסס על נהלי הפרויקט/תזה',       en: 'Based on project/thesis procedures' },

  // ══════════════════════════════════════════════════════════════════════════
  // MAINTENANCE
  // ══════════════════════════════════════════════════════════════════════════
  maintenanceTitle:         { he: 'המערכת בתחזוקה',                   en: 'System Under Maintenance' },
  maintenanceSubtitle:      { he: 'נחזור בקרוב',                      en: 'We\'ll be back soon' },

  // ══════════════════════════════════════════════════════════════════════════
  // NO ACCESS
  // ══════════════════════════════════════════════════════════════════════════
  noAccessTitle:            { he: 'אין גישה',                         en: 'Access Denied' },
  noAccessSubtitle:         { he: 'אין לך הרשאה לצפות בדף זה',       en: 'You do not have permission to view this page' },

  // ══════════════════════════════════════════════════════════════════════════
  // FEATURE: STUDENT INFO (ineligible students)
  // ══════════════════════════════════════════════════════════════════════════
  studentInfoTitle:         { he: 'מידע על מסלולי לימוד',             en: 'Study Track Information' },
  studentInfoSubtitle:      { he: 'המידע הבא רלוונטי עבורך לפי מסלול לימודיך', en: 'The following info is relevant to your study track' },
  studentNotEligibleTitle:  { he: 'טרם עומד בתנאי הסף לפרויקט',       en: 'Not Yet Eligible for a Project' },
  studentNotEligibleSub:    { he: 'כאשר תעמוד בתנאים, הגישה לפרויקטים תיפתח אוטומטית', en: 'Once eligible, project access will open automatically' },
  bachelorProjectInfo:      { he: 'פרויקט גמר לתואר ראשון',            en: "Bachelor's Final Project" },
  masterThesisInfo:         { he: 'תזה לתואר שני',                     en: "Master's Thesis" },
  masterProjectInfo:        { he: 'פרויקט גמר לתואר שני',              en: "Master's Final Project" },
  viewGuide:                { he: 'צפה במדריך',                        en: 'View Guide' },
  downloadGuide:            { he: 'הורד מדריך',                        en: 'Download Guide' },
  noGuideAvailable:         { he: 'אין מדריך זמין כרגע',               en: 'No guide available at the moment' },

  // ══════════════════════════════════════════════════════════════════════════
  // FEATURE: FILES & REPORTS SECTION
  // ══════════════════════════════════════════════════════════════════════════
  filesTitle:               { he: 'קבצים',                             en: 'Files' },
  filesUpload:              { he: 'העלה קובץ',                         en: 'Upload File' },
  filesFilterByStage:       { he: 'סנן לפי שלב',                       en: 'Filter by Stage' },
  filesFilterByType:        { he: 'סנן לפי סוג',                       en: 'Filter by Type' },
  filesNoFiles:             { he: 'אין קבצים להצגה',                   en: 'No files to display' },
  fileTypeProposal:         { he: 'הצעת מחקר',                         en: 'Research Proposal' },
  fileTypeThesis:           { he: 'תזה',                               en: 'Thesis' },
  fileTypeProgressReport:   { he: 'דוח התקדמות',                       en: 'Progress Report' },
  fileTypeForm:             { he: 'טופס',                              en: 'Form' },
  fileTypeOther:            { he: 'אחר',                               en: 'Other' },
  fileStatusPending:        { he: 'ממתין לבדיקה',                      en: 'Pending Review' },
  fileStatusApproved:       { he: 'אושר',                              en: 'Approved' },
  fileStatusReturned:       { he: 'הוחזר לתיקון',                      en: 'Returned for Revision' },
  fileUploadedAt:           { he: 'הועלה בתאריך',                      en: 'Uploaded on' },
  fileReviewedBy:           { he: 'נבדק על ידי',                       en: 'Reviewed by' },
  reportsTitle:             { he: 'דוחות התקדמות',                     en: 'Progress Reports' },
  reportsSubmit:            { he: 'הגש דוח',                           en: 'Submit Report' },
  reportsNoReports:         { he: 'אין דוחות להצגה',                   en: 'No reports to display' },
  reportStatusPending:      { he: 'ממתין לאישור',                      en: 'Pending Approval' },
  reportStatusApproved:     { he: 'אושר על ידי המנחה',                 en: 'Approved by Supervisor' },
  reportStatusReturned:     { he: 'הוחזר לתיקון',                      en: 'Returned for Revision' },
  reportSubmittedAt:        { he: 'הוגש בתאריך',                       en: 'Submitted on' },
  reportSemester:           { he: 'סמסטר',                             en: 'Semester' },
  reportFilterDegree:       { he: 'סנן לפי תואר',                      en: 'Filter by Degree' },
  reportFilterTrack:        { he: 'סנן לפי מסלול',                     en: 'Filter by Track' },

  // ══════════════════════════════════════════════════════════════════════════
  // FEATURE: EXAMINER RECOMMENDATIONS
  // ══════════════════════════════════════════════════════════════════════════
  recommendExaminers:       { he: 'המלץ על בוחנים לרכז',               en: 'Recommend Examiners to Coordinator' },
  examinerRecommendTitle:   { he: 'המלצת בוחנים',                      en: 'Examiner Recommendation' },
  examinerRecommendSub:     { he: 'הצע בוחנים מתאימים לנושא הפרויקט', en: 'Suggest suitable examiners for this project topic' },
  examinerType:             { he: 'סוג בוחן',                          en: 'Examiner Type' },
  examinerInternal:         { he: 'בוחן פנימי',                        en: 'Internal Examiner' },
  examinerExternal:         { he: 'בוחן חיצוני',                       en: 'External Examiner' },
  examinerPriority:         { he: 'עדיפות',                            en: 'Priority' },
  examinerPriority1:        { he: 'עדיפות ראשונה',                     en: '1st Choice' },
  examinerPriority2:        { he: 'עדיפות שנייה',                      en: '2nd Choice' },
  examinerPriority3:        { he: 'עדיפות שלישית',                     en: '3rd Choice' },
  examinerSearchInternal:   { he: 'חפש בוחן פנימי',                    en: 'Search Internal Examiner' },
  examinerAddExternal:      { he: 'הוסף בוחן חיצוני',                  en: 'Add External Examiner' },
  examinerExternalName:     { he: 'שם מלא',                            en: 'Full Name' },
  examinerExternalEmail:    { he: 'כתובת דוא"ל',                       en: 'Email Address' },
  examinerExternalInstitution: { he: 'מוסד / אוניברסיטה',             en: 'Institution / University' },
  examinerExternalExpertise:{ he: 'תחום מומחיות',                      en: 'Area of Expertise' },
  examinerRecommendNotes:   { he: 'הערות (אופציונלי)',                  en: 'Notes (optional)' },
  examinerRecommendSubmit:  { he: 'שלח המלצה לרכז',                   en: 'Send Recommendation to Coordinator' },
  examinerRecommendSent:    { he: '✅ ההמלצה נשלחה לרכז בהצלחה',      en: '✅ Recommendation sent to coordinator' },
  examinerRecommendPending: { he: 'ממתין לאישור רכז',                  en: 'Pending Coordinator Approval' },
  examinerRecommendApproved:{ he: 'אושר על ידי הרכז',                  en: 'Approved by Coordinator' },
  examinerRecommendRejected:{ he: 'נדחה על ידי הרכז',                  en: 'Rejected by Coordinator' },
  pendingRecommendations:   { he: 'המלצות בוחנים ממתינות',             en: 'Pending Examiner Recommendations' },
  recommendedBy:            { he: 'הומלץ על ידי',                      en: 'Recommended by' },
  noRecommendations:        { he: 'אין המלצות בוחנים ממתינות',         en: 'No pending examiner recommendations' },
  examinerRemoveFromList:   { he: 'הסר מהרשימה',                       en: 'Remove from List' },
  examinerAddToList:        { he: 'הוסף לרשימה',                       en: 'Add to List' },

} as const;

// ─── Helper ───────────────────────────────────────────────────────────────────
export function tx(key: keyof typeof t, lang: Lang): string {
  return t[key][lang];
}

// ─── Role display map ─────────────────────────────────────────────────────────
export type AppRole =
  | 'student'
  | 'supervisor'
  | 'secondary_supervisor'
  | 'coordinator'
  | 'faculty_admin'
  | 'program_head'
  | 'administrative_secretary'
  | 'grad_school_head'
  | 'internal_examiner'
  | 'system_admin';

export const ROLE_LABELS: Record<AppRole, { he: string; en: string }> = {
  student:               { he: 'סטודנט',                            en: 'Student' },
  supervisor:            { he: 'מנחה',                              en: 'Supervisor' },
  secondary_supervisor:  { he: 'מנחה משני',                         en: 'Secondary Supervisor' },
  coordinator:           { he: 'רכז פקולטה',                        en: 'Faculty Coordinator' },
  faculty_admin:         { he: 'ראש מנהל פקולטה',                   en: 'Faculty Admin Head' },
  program_head:          { he: 'ראש תוכנית תואר שני',               en: "Master's Program Head" },
  administrative_secretary:   { he: 'מזכירה אדמיניסטרטיבית',                     en: 'Administrative Secretary' },
  grad_school_head:      { he: 'ראש בית הספר ללימודי מוסמכים',      en: 'Graduate School Head' },
  internal_examiner:     { he: 'בוחן פנימי',                        en: 'Internal Examiner' },
  system_admin:          { he: 'מנהל מערכת',                        en: 'System Admin' },
};

export function roleLabel(role: AppRole, lang: Lang): string {
  return ROLE_LABELS[role]?.[lang] ?? role;
}

// ─── Faculty display map ──────────────────────────────────────────────────────
// Canonical faculty IDs — must match FACULTY_COLORS (components/shared.tsx) and
// HIT_FACULTIES (components/modals/NewProjectModal.tsx). This list is expected
// to grow as more of the college's faculties are added.
export type FacultyId =
  | 'sciences'
  | 'electrical'
  | 'industrial'
  | 'learning_tech'
  | 'medical_tech'
  | 'design'
  | 'data_science'
  | 'all';

export const FACULTY_LABELS: Record<FacultyId, { he: string; en: string }> = {
  sciences:      { he: 'הפקולטה למדעים',                          en: 'Faculty of Sciences' },
  electrical:    { he: 'הפקולטה להנדסת חשמל ואלקטרוניקה',          en: 'Electronics Engineering' },
  industrial:    { he: 'הפקולטה להנדסת תעשייה וניהול טכנולוגיה',   en: 'Industrial Engineering' },
  learning_tech: { he: 'הפקולטה לטכנולוגיות למידה',                en: 'Instructional Technologies' },
  medical_tech:  { he: 'הפקולטה לטכנולוגיות רפואיות',              en: 'Medical Technologies' },
  design:        { he: 'הפקולטה לעיצוב',                           en: 'Design' },
  data_science:  { he: 'המחלקה למדעי הנתונים',                     en: 'Department of Data Science' },
  all:           { he: 'כל הפקולטות',                              en: 'All Faculties' },
};

export function facultyLabel(id: FacultyId, lang: Lang): string {
  return FACULTY_LABELS[id]?.[lang] ?? id;
}

// ─── Primary status display map ───────────────────────────────────────────────
export type PrimaryStatus =
  | 'no_track_selected'
  | 'waiting_for_supervisor'
  | 'waiting_for_proposal'
  | 'waiting_for_approval'
  | 'active'
  | 'waiting_for_thesis_approval'
  | 'waiting_for_defense'
  | 'completed'
  | 'withdrawn'
  | 'on_leave'
  | 'frozen'
  | 'admin_closed';

export const PRIMARY_STATUS_LABELS: Record<PrimaryStatus, { he: string; en: string }> = {
  no_track_selected:          { he: 'טרם בחר מסלול',                en: 'Track Not Selected' },
  waiting_for_supervisor:     { he: 'ממתין לבחירת מנחה',            en: 'Waiting for Supervisor' },
  waiting_for_proposal:       { he: 'ממתין להגשת הצעה',             en: 'Waiting for Proposal' },
  waiting_for_approval:       { he: 'ממתין לאישור הצעה',            en: 'Waiting for Proposal Approval' },
  active:                     { he: 'בתהליך פעיל',                  en: 'Active' },
  waiting_for_thesis_approval:{ he: 'ממתין לאישור תזה',             en: 'Waiting for Thesis Approval' },
  waiting_for_defense:        { he: 'ממתין לבחינת תזה',             en: 'Waiting for Defense' },
  completed:                  { he: 'סיים',                          en: 'Completed' },
  withdrawn:                  { he: 'פרש',                           en: 'Withdrawn' },
  on_leave:                   { he: 'בחופשה',                        en: 'On Leave' },
  frozen:                     { he: 'מוקפא',                         en: 'Frozen' },
  admin_closed:               { he: 'סגור מנהלית',                  en: 'Administratively Closed' },
};

export function primaryStatusLabel(status: PrimaryStatus, lang: Lang): string {
  return PRIMARY_STATUS_LABELS[status]?.[lang] ?? status;
}

// ─── Track type display map ───────────────────────────────────────────────────
export type TrackType = 'thesis' | 'masters_project' | 'bachelor_project';

export const TRACK_LABELS: Record<TrackType, { he: string; en: string }> = {
  thesis:           { he: 'תזה',                        en: 'Thesis' },
  masters_project:  { he: 'פרויקט גמר לתואר שני',       en: "Master's Final Project" },
  bachelor_project: { he: 'פרויקט לתואר ראשון',         en: "Bachelor's Project" },
};

export function trackLabel(track: TrackType, lang: Lang): string {
  return TRACK_LABELS[track]?.[lang] ?? track;
}