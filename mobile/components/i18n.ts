// student/i18n.ts  — all UI strings for the student section

export type Lang = 'he' | 'en';

export const t = {
  // ── General ───────────────────────────────────────────────────────────────
  appName:         { he: 'מערכת פרויקטי גמר', en: 'Final Projects System' },
  hitName:         { he: 'המכון הטכנולוגי חולון', en: 'Holon Institute of Technology' },
  logout:          { he: 'יציאה', en: 'Sign Out' },
  loading:         { he: 'טוען...', en: 'Loading...' },
  save:            { he: 'שמור', en: 'Save' },
  cancel:          { he: 'ביטול', en: 'Cancel' },
  submit:          { he: 'הגש', en: 'Submit' },
  back:            { he: 'חזור', en: 'Back' },
  search:          { he: 'חיפוש', en: 'Search' },
  filter:          { he: 'סנן', en: 'Filter' },
  all:             { he: 'הכל', en: 'All' },
  yes:             { he: 'כן', en: 'Yes' },
  no:              { he: 'לא', en: 'No' },

  // ── Navigation ────────────────────────────────────────────────────────────
  navHome:         { he: 'בית', en: 'Home' },
  navProjects:     { he: 'פרויקטים', en: 'Projects' },
  navMyProject:    { he: 'הפרויקט שלי', en: 'My Project' },
  navMilestones:   { he: 'אבני דרך', en: 'Milestones' },
  navNotifications:{ he: 'התראות', en: 'Notifications' },

  // ── Home / Browse state (no project yet) ──────────────────────────────────
  browseTitle:     { he: 'פרויקטים פתוחים להרשמה', en: 'Open Projects' },
  browseSubtitle:  { he: 'בחר/י פרויקט גמר לתואר שלך', en: 'Choose your final project' },
  degreeFilter:    { he: 'תואר', en: 'Degree' },
  bachelors:       { he: 'תואר ראשון', en: "Bachelor's" },
  masters:         { he: 'תואר שני', en: "Master's" },
  typeFilter:      { he: 'סוג', en: 'Type' },
  projectType:     { he: 'פרויקט', en: 'Project' },
  thesisType:      { he: 'תזה', en: 'Thesis' },
  supervisor:      { he: 'מנחה', en: 'Supervisor' },
  skills:          { he: 'טכנולוגיות', en: 'Technologies' },
  applyBtn:        { he: 'הגש מועמדות', en: 'Apply' },
  noProjects:      { he: 'אין פרויקטים זמינים כרגע', en: 'No projects available right now' },
  searchPlaceholder:{ he: 'חפש לפי כותרת, מנחה, טכנולוגיה...', en: 'Search by title, supervisor, technology...' },

  // ── Application form ──────────────────────────────────────────────────────
  applyTitle:      { he: 'הגשת מועמדות', en: 'Submit Application' },
  applyFor:        { he: 'מועמדות לפרויקט:', en: 'Applying for:' },
  coverNote:       { he: 'מכתב מוטיבציה', en: 'Cover Letter' },
  coverPlaceholder:{ he: 'ספר/י על עצמך ולמה אתה/את מתאים/ה לפרויקט זה...', en: 'Tell us about yourself and why you are a good fit...' },
  uploadTranscript:{ he: 'העלה גיליון ציונים (PDF)', en: 'Upload Transcript (PDF)' },
  uploadCV:        { he: 'העלה קורות חיים (PDF)', en: 'Upload CV (PDF)' },
  fileUploaded:    { he: 'הקובץ הועלה ✓', en: 'File uploaded ✓' },
  tapToUpload:     { he: 'לחץ להעלאה', en: 'Tap to upload' },
  submitting:      { he: 'שולח...', en: 'Submitting...' },
  applySuccess:    { he: '✅ המועמדות הוגשה בהצלחה!', en: '✅ Application submitted successfully!' },
  applyError:      { he: 'שגיאה בהגשת המועמדות. נסה שוב.', en: 'Error submitting application. Please try again.' },

  // ── Pending state ─────────────────────────────────────────────────────────
  pendingTitle:    { he: 'המועמדות שלך ממתינה לאישור', en: 'Your Application is Pending' },
  pendingSubtitle: { he: 'המנחה יבדוק את מועמדותך בהקדם', en: 'The supervisor will review your application soon' },
  pendingProject:  { he: 'פרויקט:', en: 'Project:' },
  pendingSince:    { he: 'הוגשה בתאריך:', en: 'Submitted on:' },
  pendingNote:     { he: 'תישלח אליך התראה באפליקציה ובמייל עם קבלת תשובה', en: 'You will be notified in-app and by email when a decision is made' },
  withdrawApp:     { he: 'משוך מועמדות', en: 'Withdraw Application' },

  // ── Dashboard state (has active project) ──────────────────────────────────
  dashTitle:       { he: 'הפרויקט שלי', en: 'My Project' },
  dashWelcome:     { he: 'שלום', en: 'Hello' },
  academicYear:    { he: 'שנת לימודים:', en: 'Academic Year:' },
  projectStatus:   { he: 'סטטוס פרויקט', en: 'Project Status' },
  nextMilestone:   { he: 'אבן דרך הבאה', en: 'Next Milestone' },
  dueDate:         { he: 'תאריך הגשה:', en: 'Due Date:' },
  daysLeft:        { he: 'ימים לסיום', en: 'days left' },
  overdue:         { he: 'באיחור!', en: 'Overdue!' },
  today:           { he: 'היום!', en: 'Today!' },
  submitMilestone: { he: 'הגש אבן דרך', en: 'Submit Milestone' },
  uploadProjectInfo:{ he: 'העלה קובץ מידע על הפרויקט (PDF)', en: 'Upload Project Information File (PDF)' },

  // ── Milestones ────────────────────────────────────────────────────────────
  milestonesTitle: { he: 'אבני הדרך שלי', en: 'My Milestones' },
  milestoneResearch:  { he: 'הצעת מחקר', en: 'Research Proposal' },
  milestoneProgress:  { he: 'דו"ח התקדמות', en: 'Progress Report' },
  milestoneFinal:     { he: 'דו"ח מסכם', en: 'Final Report' },
  milestoneDefense:   { he: 'הגנה', en: 'Defense' },

  // Milestone statuses
  statusPending:      { he: 'ממתין להגשה', en: 'Pending Submission' },
  statusSubmitted:    { he: 'הוגש — ממתין לציון מנחה', en: 'Submitted — Awaiting Supervisor Grade' },
  statusSupervisorGraded: { he: 'מוגן על ידי מנחה — ממתין לאישור רכז', en: 'Graded — Awaiting Coordinator Approval' },
  statusApproved:     { he: 'אושר על ידי הרכז', en: 'Approved by Coordinator' },
  statusCompleted:    { he: 'הושלם ✓', en: 'Completed ✓' },

  // ── Milestone submit form ─────────────────────────────────────────────────
  submitTitle:     { he: 'הגשת', en: 'Submit' },
  uploadFiles:     { he: 'העלה קבצים', en: 'Upload Files' },
  addNote:         { he: 'הוסף הערה (אופציונלי)', en: 'Add a note (optional)' },
  notePlaceholder: { he: 'הערות לגבי ההגשה...', en: 'Notes about this submission...' },
  submitSuccess:   { he: '✅ ההגשה התקבלה!', en: '✅ Submission received!' },
  submitError:     { he: 'שגיאה בהגשה. נסה שוב.', en: 'Error submitting. Please try again.' },

  // ── Grade display ─────────────────────────────────────────────────────────
  grade:           { he: 'ציון', en: 'Grade' },
  finalGrade:      { he: 'ציון סופי', en: 'Final Grade' },
  supervisorGrade: { he: 'ציון מנחה', en: 'Supervisor Grade' },
  gradeWeight:     { he: 'משקל', en: 'Weight' },
  gradeComments:   { he: 'הערות', en: 'Comments' },
  notGradedYet:    { he: 'טרם נוקד', en: 'Not graded yet' },

  // ── Defense ───────────────────────────────────────────────────────────────
  defenseDate:     { he: 'תאריך הגנה:', en: 'Defense Date:' },
  defenseTime:     { he: 'שעה:', en: 'Time:' },
  defenseRoom:     { he: 'חדר:', en: 'Room:' },
  examiners:       { he: 'בוחנים:', en: 'Examiners:' },
  defenseNotScheduled: { he: 'ההגנה טרם תואמה', en: 'Defense not yet scheduled' },

  // ── Notifications ─────────────────────────────────────────────────────────
  notifTitle:      { he: 'התראות', en: 'Notifications' },
  noNotifications: { he: 'אין התראות חדשות', en: 'No new notifications' },
  markAllRead:     { he: 'סמן הכל כנקרא', en: 'Mark all as read' },
};

export function tx(key: keyof typeof t, lang: Lang): string {
  return t[key][lang];
}