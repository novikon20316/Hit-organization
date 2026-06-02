export type NotificationType =
  | 'project_published'
  | 'application_approved'
  | 'application_rejected'
  | 'meeting_requested'
  | 'milestone_graded'
  | 'milestone_deadline_7d'
  | 'milestone_deadline_1d'
  | 'broadcast'
  | 'new_message'
  | 'general';

interface EmailTemplate {
  subjectHe: string;
  subjectEn: string;
  bodyHe:    (data: Record<string, string>) => string;
  bodyEn:    (data: Record<string, string>) => string;
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

  application_approved: {
    subjectHe: '✅ בקשתך אושרה!',
    subjectEn: '✅ Your Application Was Approved!',
    bodyHe: (d) => `
      <p>שלום ${d.name || ''},</p>
      <p>בקשתך לפרויקט <strong>${d.projectTitle || ''}</strong> אושרה!</p>
      <p>כעת תוכל להתחיל לעבוד על הפרויקט. בהצלחה!</p>
    `,
    bodyEn: (d) => `
      <p>Hello ${d.name || ''},</p>
      <p>Your application for project <strong>${d.projectTitle || ''}</strong> has been approved!</p>
      <p>You can now start working on the project. Good luck!</p>
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
    subjectHe: '📅 נקבעה פגישה',
    subjectEn: '📅 Meeting Scheduled',
    bodyHe: (d) => `
      <p>שלום ${d.name || ''},</p>
      <p>נקבעה פגישה בתאריך <strong>${d.meetingDate || ''}</strong>.</p>
      <p>אנא אשר את השתתפותך במערכת.</p>
    `,
    bodyEn: (d) => `
      <p>Hello ${d.name || ''},</p>
      <p>A meeting has been scheduled for <strong>${d.meetingDate || ''}</strong>.</p>
      <p>Please confirm your attendance in the system.</p>
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
  const subject  = isHe ? template.subjectHe : template.subjectEn;
  const body     = isHe ? template.bodyHe(data) : template.bodyEn(data);
  const dir      = isHe ? 'rtl' : 'ltr';

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
          <h1>${isHe ? 'מערכת ניהול פרויקטים' : 'Project Management System'}</h1>
        </div>
        <div class="body">${body}</div>
        <div class="footer">
          ${isHe
            ? 'הודעה זו נשלחה אוטומטית — אין להשיב על מייל זה.'
            : 'This is an automated message — please do not reply to this email.'}
        </div>
      </div>
    </body>
    </html>
  `;

  return { subject, html };
}