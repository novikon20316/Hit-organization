// constants/onboardingTours.ts
// Step content for the one-time, first-login onboarding tour
// (contexts/OnboardingTourContext.tsx / components/onboarding/
// OnboardingTourOverlay.tsx), per role. Each step's `key` must match the
// `tourKey` a <TourTarget> wraps on that role's dashboard screen — see the
// individual dashboard files for where each key's button actually lives.
// system_admin is intentionally absent (never shown the tour).
import type { AppRole } from '../components/i18n';

export interface OnboardingTourStep {
  key: string;
  title: { he: string; en: string };
  body: { he: string; en: string };
}

export const ONBOARDING_TOURS: Partial<Record<AppRole, OnboardingTourStep[]>> = {
  // No in-page tab switcher exists on student/home.tsx today — these two
  // steps fall back to the overlay's centered (non-spotlighted) card, since
  // neither key is ever registered by a <TourTarget>. Still useful as a
  // plain "here's what each screen is for" walkthrough.
  student: [
    {
      key: 'home',
      title: { he: 'בית', en: 'Home' },
      body: {
        he: 'סקירת הפרויקט שלך — הסטטוס הנוכחי, שם המנחה, והמשימה הבאה שממתינה לך.',
        en: "Your project overview — current status, your supervisor, and what's due next.",
      },
    },
    {
      key: 'milestones',
      title: { he: 'אבני דרך', en: 'Milestones' },
      body: {
        he: 'כל אבני הדרך בתהליך הפרויקט שלך, מועדי ההגשה וההיסטוריה של ההגשות שלך.',
        en: "Every milestone in your project's workflow, its due date, and your submission history.",
      },
    },
  ],

  // mobile/app/supervisor/dashboard.tsx — tabs: applications, grading,
  // recommend, signoffs, projects
  supervisor: [
    {
      key: 'applications',
      title: { he: 'מועמדויות', en: 'Applications' },
      body: {
        he: 'מועמדויות של סטודנטים לפרויקטים הפתוחים שלך — סקור ואשר או דחה אותן.',
        en: 'Student applications to your open projects — review, approve, or decline them.',
      },
    },
    {
      key: 'grading',
      title: { he: 'מתן ציונים', en: 'Grading' },
      body: {
        he: 'אבני דרך הממתינות למתן ציון על ידך.',
        en: 'Milestones waiting for you to grade.',
      },
    },
    {
      key: 'recommend',
      title: { he: 'המלצת בוחנים', en: 'Recommend Examiners' },
      body: {
        he: 'המלץ על בוחנים להגנות הקרובות של הסטודנטים שלך.',
        en: "Recommend examiners for your students' upcoming defenses.",
      },
    },
    {
      key: 'signoffs',
      title: { he: 'ממתין לאישור ציונים ובוחנים', en: 'Awaiting Grade/Examiner Approval' },
      body: {
        he: 'ציונים ומינויי בוחנים שהגשת, שעדיין ממתינים לאישור הרכז או בית הספר ללימודי מוסמך.',
        en: "Grades and examiner assignments you've submitted that are still waiting on coordinator or grad-school approval.",
      },
    },
    {
      key: 'projects',
      title: { he: 'פרויקטים', en: 'Projects' },
      body: {
        he: 'כל הפרויקטים שאתה מנחה — הסטודנטים הרשומים, ההתקדמות באבני הדרך ומתן הציונים.',
        en: 'Every project you supervise — enrolled students, milestone progress, and grading.',
      },
    },
  ],
  secondary_supervisor: [], // filled in below — identical to supervisor's

  // mobile/app/examinor/home.tsx — tabs: projects, schedule
  internal_examiner: [
    {
      key: 'projects',
      title: { he: 'הגנות לבחינה', en: 'Defenses' },
      body: {
        he: 'הגנות שהוקצו לך לבחינה — כאן תדרג/י את העבודה הכתובה ואת ההגנה עצמה.',
        en: "Defenses you've been assigned to examine — grade the written work and the defense itself here.",
      },
    },
    {
      key: 'schedule',
      title: { he: 'לוח זמנים', en: 'Schedule' },
      body: {
        he: 'מועדי ההגנות הקרובים שלך, והמקום להגיש בו את התאריכים שבהם את/ה פנוי/ה.',
        en: "Your upcoming defense dates, and where to submit the dates you're available for.",
      },
    },
  ],

  // mobile/app/coordinator/home.tsx — tabs: overview, inProgress, pending,
  // defense, milestones, recommendations, signoffs, deadlines, archived
  coordinator: [
    {
      key: 'overview',
      title: { he: 'סקירה', en: 'Overview' },
      body: {
        he: 'לוח הבקרה של הפקולטה שלך — תמונת מצב של כל מה שדורש את תשומת ליבך כרגע.',
        en: "Your faculty's dashboard — a snapshot of everything that needs your attention right now.",
      },
    },
    {
      key: 'inProgress',
      title: { he: 'פרויקטים פעילים', en: 'In Progress' },
      body: {
        he: 'כל הפרויקטים הפעילים בפקולטה שלך, עם התקדמות אבני הדרך של כל סטודנט רשום.',
        en: "Every active project in your faculty, with each enrolled student's milestone progress.",
      },
    },
    {
      key: 'pending',
      title: { he: 'ממתין לאישור', en: 'Pending Approval' },
      body: {
        he: 'הגשות (הצעות, דוחות ועוד) הממתינות לבדיקה ואישור שלך.',
        en: 'Submissions (proposals, reports, and more) waiting for your review and approval.',
      },
    },
    {
      key: 'defense',
      title: { he: 'הגנות', en: 'Defenses' },
      body: {
        he: 'פרויקטים שהגיעו לשלב ההגנה — הקצה בוחנים ואשר את הרכב הוועדה.',
        en: 'Projects that have reached their defense stage — assign examiners and confirm the panel.',
      },
    },
    {
      key: 'milestones',
      title: { he: 'אבני דרך', en: 'Milestones' },
      body: {
        he: 'תצוגה מאוחדת של כל אבני הדרך בפרויקטים הפעילים בפקולטה שלך.',
        en: "A combined view of every milestone across your faculty's active projects.",
      },
    },
    {
      key: 'recommendations',
      title: { he: 'המלצות בוחנים', en: 'Examiner Recs' },
      body: {
        he: 'המלצות בוחנים מהמנחים, הממתינות לאישור או להחלפה שלך.',
        en: 'Examiner suggestions from supervisors, waiting for you to confirm or replace.',
      },
    },
    {
      key: 'signoffs',
      title: { he: 'ממתין לאישור ציונים ובוחנים', en: 'Awaiting Grade/Examiner Approval' },
      body: {
        he: 'ציונים ומינויי בוחנים שכבר דורגו וממתינים לאישור סופי שלך.',
        en: 'Grades and examiner assignments already graded that still need your final approval.',
      },
    },
    {
      key: 'deadlines',
      title: { he: 'מועדי הגשה', en: 'DeadLines' },
      body: {
        he: 'מועדי הגשה קרובים ומועדים שחלפו, בכל הפקולטה.',
        en: 'Upcoming and overdue milestone deadlines across your faculty.',
      },
    },
    {
      key: 'archived',
      title: { he: 'ארכיון', en: 'Archived' },
      body: {
        he: 'פרויקטים שנמחקו או הועברו לארכיון — שחזר פרויקט אם הוסר בטעות.',
        en: 'Projects that were erased or archived — restore one if it was removed by mistake.',
      },
    },
  ],

  // mobile/app/faculty_admin/dashboard.tsx — tabs: overview, deadlines,
  // staff, signoffs, students
  faculty_admin: [
    {
      key: 'overview',
      title: { he: 'סקירה', en: 'Overview' },
      body: {
        he: 'לוח הבקרה של הפקולטה שלך — תמונת מצב של כל מה שדורש את תשומת ליבך כרגע.',
        en: "Your faculty's dashboard — a snapshot of everything that needs your attention right now.",
      },
    },
    {
      key: 'deadlines',
      title: { he: 'מועדי הגשה', en: 'DeadLines' },
      body: {
        he: 'מועדי הגשה קרובים ומועדים שחלפו, בכל הפקולטה.',
        en: 'Upcoming and overdue milestone deadlines across your faculty.',
      },
    },
    {
      key: 'staff',
      title: { he: 'סגל', en: 'Staff' },
      body: {
        he: 'כל חשבונות הסגל בפקולטה שלך — צור, ערוך או השבת מנחים, רכזים ובוחנים.',
        en: 'Every staff account in your faculty — create, edit, or deactivate supervisors, coordinators, and examiners.',
      },
    },
    {
      key: 'signoffs',
      title: { he: 'ממתין לאישור ציונים ובוחנים', en: 'Awaiting Grade/Examiner Approval' },
      body: {
        he: 'ציונים ומינויי בוחנים הממתינים לאישור סופי שלך.',
        en: 'Grades and examiner assignments waiting for your final approval.',
      },
    },
    {
      key: 'students',
      title: { he: 'רשימת סטודנטים', en: 'Students List' },
      body: {
        he: 'רשימה מלאה של הסטודנטים הרשומים לתוכניות של הפקולטה שלך.',
        en: "The full list of students enrolled in your faculty's programs.",
      },
    },
  ],

  // mobile/app/program_head/program_head_dashboard.tsx — tabs: students,
  // approvals, supervisors, staff, myProjects (conditional)
  program_head: [
    {
      key: 'students',
      title: { he: 'סטודנטים', en: 'Students' },
      body: {
        he: 'כל הסטודנטים בתוכנית שלך, כולל המסלול וההתקדמות שלהם.',
        en: 'Every student in your program, with their track and progress.',
      },
    },
    {
      key: 'approvals',
      title: { he: 'ממתין לאישור', en: 'Approvals' },
      body: {
        he: 'החלטות הממתינות לך — אישורי פרויקט, מנחה או ציון.',
        en: 'Decisions waiting on you — project, supervisor, or grade approvals.',
      },
    },
    {
      key: 'supervisors',
      title: { he: 'מנחים', en: 'Supervisors' },
      body: {
        he: 'כל מנחה בתוכנית שלך והפרויקטים שהוא מנהל.',
        en: 'Every supervisor in your program and the projects they run.',
      },
    },
    {
      key: 'staff',
      title: { he: 'סגל', en: 'Staff' },
      body: {
        he: 'חשבונות הסגל בתוכנית שלך.',
        en: 'Staff accounts within your program.',
      },
    },
    {
      key: 'myProjects',
      title: { he: 'הפרויקטים שלי', en: 'My Projects' },
      body: {
        he: 'פרויקטים שאתה מנחה באופן אישי, מכיוון שיש לך גם תפקיד מנחה.',
        en: 'Projects you personally supervise, since you also hold a supervisor role.',
      },
    },
  ],

  // mobile/app/administrative_coordinator/administrative_coordinator_dashboard.tsx
  // — tabs: groups, students, overrides
  administrative_secretary: [
    {
      key: 'groups',
      title: { he: 'קבוצות פרויקט', en: 'Project Groups' },
      body: {
        he: 'קבוצות פרויקט בתחום האחריות שלך — סטודנטים מקובצים לפי מנחה או תוכנית.',
        en: 'Project groups within your scope — students grouped by supervisor or program.',
      },
    },
    {
      key: 'students',
      title: { he: 'דוח סטודנטים', en: 'Students Report' },
      body: {
        he: 'דוח על כל סטודנט והסטטוס וההתקדמות הנוכחיים שלו.',
        en: 'A report of every student and their current status and progress.',
      },
    },
    {
      key: 'overrides',
      title: { he: 'אישור ציונים סופיים', en: 'Final Grade Approvals' },
      body: {
        he: 'ציונים סופיים הממתינים לאישורך לפני העברתם למכלול.',
        en: 'Final grades waiting for your approval before they get transferred to Maklol.',
      },
    },
  ],

  // mobile/app/grad_school_head/grad_school_head_dashboard.tsx — tabs:
  // overview, approvals, stuck, examiners, grades, staff, students
  grad_school_head: [
    {
      key: 'overview',
      title: { he: 'סקירה כללית', en: 'Overview' },
      body: {
        he: 'תמונת מצב חוצת-פקולטות של כל מה שדורש את תשומת ליבך כרגע.',
        en: 'A cross-faculty snapshot of everything that needs your attention right now.',
      },
    },
    {
      key: 'approvals',
      title: { he: 'ממתין לאישורי', en: 'Pending' },
      body: {
        he: 'החלטות הממתינות לך ברמת בית הספר ללימודי מוסמך — מנחים, בוחנים, הצעות וציונים.',
        en: 'Decisions waiting on you at the grad-school level — supervisors, examiners, proposals, and grades.',
      },
    },
    {
      key: 'stuck',
      title: { he: 'תקועים', en: 'Stuck' },
      body: {
        he: 'פרויקטים שנתקעו ללא התקדמות לאחרונה, בכל הפקולטות.',
        en: 'Projects that have stalled with no recent progress, across every faculty.',
      },
    },
    {
      key: 'examiners',
      title: { he: 'עומס בוחנים', en: 'Examiners' },
      body: {
        he: 'עומס העבודה הנוכחי של כל בוחן, כדי לעזור לאזן הקצאות חדשות.',
        en: "Each examiner's current workload, to help balance new assignments.",
      },
    },
    {
      key: 'grades',
      title: { he: 'ציונים מאושרים', en: 'Approved Grades' },
      body: {
        he: 'ציונים סופיים שהשלימו את תהליך האישור ברמת בית הספר ללימודי מוסמך.',
        en: 'Final grades that have completed grad-school approval.',
      },
    },
    {
      key: 'staff',
      title: { he: 'סגל', en: 'Staff' },
      body: {
        he: 'חשבונות סגל בכל הפקולטות.',
        en: 'Staff accounts across every faculty.',
      },
    },
    {
      key: 'students',
      title: { he: 'רשימת סטודנטים', en: 'Students List' },
      body: {
        he: 'רשימה מלאה של הסטודנטים בכל הפקולטות.',
        en: 'The full list of students across every faculty.',
      },
    },
  ],
};

// secondary_supervisor shares supervisor's dashboard screen/tabs exactly.
ONBOARDING_TOURS.secondary_supervisor = ONBOARDING_TOURS.supervisor;
