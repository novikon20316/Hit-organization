// lib/milestoneWaiting.ts
// S1/S5 — the student-facing "who is it waiting on, and for how long" line
// for a milestone (decided 2026-11-08: role + days, never names). `waiting`
// comes from the server (milestoneController.ts's getMilestonesByQuery,
// stuckMilestones.ts's waitingRoleOf) — the client never works out who holds
// a milestone itself.

export interface MilestoneWaiting {
  role: string;
  since: string | null;
}

const WAITING_ON: Record<string, { he: string; en: string }> = {
  supervisor: { he: 'ממתין לבדיקת המנחה', en: "Waiting for your supervisor's review" },
  examiner: { he: 'ממתין לבוחנים', en: 'Waiting for the examiners' },
  coordinator: { he: 'ממתין לאישור הרכז/ת', en: "Waiting for the coordinator's approval" },
  administrative_secretary: { he: 'ממתין לרכזת המנהלית', en: 'Waiting for the administrative coordinator' },
  committee: { he: 'ממתין לוועדה', en: 'Waiting for the committee' },
  faculty_admin: { he: 'ממתין למנהל/ת הפקולטה', en: 'Waiting for the faculty admin' },
  program_head: { he: 'ממתין לראש התוכנית', en: 'Waiting for the program head' },
  division_head: { he: 'ממתין לראש המחלקה', en: 'Waiting for the division head' },
  dean: { he: 'ממתין לדיקן', en: 'Waiting for the dean' },
  school_head: { he: 'ממתין לראש בית הספר', en: 'Waiting for the school head' },
  grad_school_head: { he: 'ממתין לראש בית הספר לתארים מתקדמים', en: 'Waiting for the head of the graduate school' },
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function waitingDays(since: string | null): number | null {
  if (!since) return null;
  const t = new Date(since).getTime();
  return isNaN(t) ? null : Math.max(0, Math.floor((Date.now() - t) / DAY_MS));
}

/** "Waiting for your supervisor's review · 4 days", or null when the
 *  milestone is with the student or done. */
export function waitingText(waiting: MilestoneWaiting | null | undefined, lang: 'he' | 'en'): string | null {
  if (!waiting || waiting.role === 'student') return null;
  const who = WAITING_ON[waiting.role] ?? { he: 'בבדיקה', en: 'In review' };
  const days = waitingDays(waiting.since);
  const he = lang === 'he';
  const span = days === null ? '' : days === 0 ? (he ? 'מהיום' : 'since today') : days === 1 ? (he ? 'יום אחד' : '1 day') : (he ? `${days} ימים` : `${days} days`);
  return span ? `${he ? who.he : who.en} · ${span}` : he ? who.he : who.en;
}
