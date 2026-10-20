import { Response } from 'express';
import { db } from '../config/firebase.js';
import { AuthenticatedRequest, hasAnyRole } from '../middleware/auth.js';
import { isValidDocId } from '../services/idValidation.js';
import { L } from '../utils/localize.js';
import { logAuditEvent } from '../services/auditLog.js';
import type { ProcessType } from '../services/workflowTemplates.js';
import {
  daysOnLink, listTemplatesWithLimits, remindWaitingParty, sanitizeLimits, saveStuckLimits, type StuckWatch,
} from '../services/stuckMilestones.js';

// See services/stuckMilestones.ts for the whole feature.
const STUCK_VIEW_ROLES = ['administrative_secretary', 'program_head', 'grad_school_head', 'system_admin'];
const MANUAL_REMINDER_COOLDOWN_MS = 60 * 60 * 1000;
const PROCESS_TYPES: ProcessType[] = ['msc_thesis', 'msc_project', 'bsc_project'];

const isSystemAdmin = (req: AuthenticatedRequest) => !!req.user && hasAnyRole(req.user, ['system_admin']);

/**
 * GET /api/stuck-milestones
 * Every milestone currently stuck past its limit that the caller is
 * responsible for (they're among its alert recipients — scoped by the
 * sweep), or every stuck one for system_admin.
 */
export const getStuckMilestones = async (req: AuthenticatedRequest, res: Response) => {
  const uid = req.user?.uid;
  if (!uid) return res.status(401).json({ message: L(req, 'Unauthorized.', 'אין הרשאה.') });
  if (!req.user || !hasAnyRole(req.user, STUCK_VIEW_ROLES)) {
    return res.status(403).json({ message: L(req, 'You do not have permission to view stuck milestones.', 'אין לך הרשאה לצפות באבני דרך תקועות.') });
  }

  try {
    const snap = isSystemAdmin(req)
      ? await db.collection('milestones').where('stuckWatch.isStuck', '==', true).get()
      : await db.collection('milestones').where('stuckWatch.recipientUids', 'array-contains', uid).get();
    const docs = snap.docs.filter((d) => (d.data().stuckWatch as StuckWatch | undefined)?.isStuck);

    const projectIds = [...new Set(docs.map((d) => d.data().projectId).filter(Boolean))] as string[];
    const projectSnaps = await Promise.all(projectIds.map((id) => db.collection('projects').doc(id).get()));
    const projectsById = new Map(projectSnaps.filter((s) => s.exists).map((s) => [s.id, s.data()!]));

    const userIds = new Set<string>();
    docs.forEach((d) => {
      const m = d.data();
      (m.studentIds ?? []).forEach((id: string) => userIds.add(id));
      ((m.stuckWatch as StuckWatch).waitingUids ?? []).forEach((id) => userIds.add(id));
    });
    const userSnaps = await Promise.all([...userIds].map((id) => db.collection('users').doc(id).get()));
    const nameById = new Map(userSnaps.filter((s) => s.exists).map((s) => [s.id, (s.data()?.displayName as string) ?? '']));

    const rows = docs.map((d) => {
      const m = d.data();
      const watch = m.stuckWatch as StuckWatch;
      const project = projectsById.get(m.projectId) ?? {};
      const pauses = [...(project.clockPauseHistory ?? []), ...(project.activeClockPause ? [project.activeClockPause] : [])];
      return {
        milestoneId: d.id,
        projectId: m.projectId ?? null,
        milestoneNameHe: m.nameHe ?? m.type,
        milestoneNameEn: m.nameEn ?? m.type,
        projectTitleHe: project.titleHe || project.titleEn || '',
        projectTitleEn: project.titleEn || project.titleHe || '',
        facultyId: project.facultyId ?? m.facultyId ?? null,
        studentNames: (m.studentIds ?? []).map((id: string) => nameById.get(id) ?? '').filter(Boolean),
        waitingRole: watch.waitingRole,
        waitingNames: (watch.waitingUids ?? []).map((id) => nameById.get(id) ?? '').filter(Boolean),
        daysStuck: daysOnLink(watch.since, pauses),
        limitDays: watch.limitDays,
        since: watch.since?.toDate?.().toISOString() ?? null,
        lastManualReminderAt: watch.lastManualReminderAt?.toDate?.().toISOString() ?? null,
      };
    }).sort((a, b) => (b.daysStuck - (b.limitDays ?? 0)) - (a.daysStuck - (a.limitDays ?? 0)));

    return res.status(200).json({ milestones: rows });
  } catch (error) {
    console.error('getStuckMilestones error:', error);
    return res.status(500).json({ message: L(req, 'Failed to load stuck milestones.', 'טעינת אבני הדרך התקועות נכשלה.') });
  }
};

/**
 * POST /api/stuck-milestones/:milestoneId/remind
 * Nudges whoever the stuck milestone is waiting on. Only an alert recipient
 * of that milestone (or system_admin) may send it; once an hour at most.
 */
export const remindStuckMilestone = async (req: AuthenticatedRequest, res: Response) => {
  const uid = req.user?.uid;
  if (!uid) return res.status(401).json({ message: L(req, 'Unauthorized.', 'אין הרשאה.') });
  if (!req.user || !hasAnyRole(req.user, STUCK_VIEW_ROLES)) {
    return res.status(403).json({ message: L(req, 'You do not have permission to do this.', 'אין לך הרשאה לבצע פעולה זו.') });
  }
  const milestoneId = req.params.milestoneId;
  if (typeof milestoneId !== 'string' || !isValidDocId(milestoneId)) {
    return res.status(400).json({ message: L(req, 'Invalid milestone.', 'אבן דרך לא תקינה.') });
  }

  try {
    const snap = await db.collection('milestones').doc(milestoneId).get();
    const watch = snap.data()?.stuckWatch as StuckWatch | undefined;
    if (!snap.exists || !watch?.isStuck) {
      return res.status(404).json({ message: L(req, 'This milestone is no longer stuck.', 'אבן הדרך כבר אינה תקועה.') });
    }
    if (!isSystemAdmin(req) && !(watch.recipientUids ?? []).includes(uid)) {
      return res.status(403).json({ message: L(req, 'This milestone is outside your scope.', 'אבן הדרך אינה בתחום האחריות שלך.') });
    }
    const lastMs = watch.lastManualReminderAt?.toMillis?.() ?? 0;
    if (Date.now() - lastMs < MANUAL_REMINDER_COOLDOWN_MS) {
      return res.status(429).json({ message: L(req, 'A reminder was already sent in the last hour.', 'כבר נשלחה תזכורת בשעה האחרונה.') });
    }
    if ((watch.waitingUids ?? []).length === 0) {
      return res.status(409).json({ message: L(req, 'Nobody is assigned to this step yet, so there is no one to remind.', 'אף אחד עדיין לא משובץ לשלב הזה, ולכן אין למי לשלוח תזכורת.') });
    }

    const me = await db.collection('users').doc(uid).get();
    const senderName: string = me.data()?.displayName ?? '';
    const reminded = await remindWaitingParty(milestoneId, senderName);
    await logAuditEvent({
      userId: uid,
      userRole: req.user.role,
      userDisplayName: senderName,
      action: 'stuck_milestone_reminder_sent',
      entityType: 'milestone',
      entityId: milestoneId,
      newValue: { waitingRole: watch.waitingRole, reminded },
    });
    return res.status(200).json({ success: true, reminded });
  } catch (error) {
    console.error('remindStuckMilestone error:', error);
    return res.status(500).json({ message: L(req, 'Failed to send the reminder.', 'שליחת התזכורת נכשלה.') });
  }
};

/** GET /api/stuck-milestones/limits — system_admin only. */
export const getStuckLimits = async (req: AuthenticatedRequest, res: Response) => {
  if (!isSystemAdmin(req)) {
    return res.status(403).json({ message: L(req, 'Only a system admin can manage these limits.', 'רק מנהל/ת מערכת יכול/ה לנהל את המגבלות האלה.') });
  }
  try {
    return res.status(200).json({ templates: await listTemplatesWithLimits() });
  } catch (error) {
    console.error('getStuckLimits error:', error);
    return res.status(500).json({ message: L(req, 'Failed to load limits.', 'טעינת המגבלות נכשלה.') });
  }
};

/** PUT /api/stuck-milestones/limits  { facultyId, processType, major, limits } — system_admin only. */
export const setStuckLimits = async (req: AuthenticatedRequest, res: Response) => {
  const uid = req.user?.uid;
  if (!uid || !isSystemAdmin(req)) {
    return res.status(403).json({ message: L(req, 'Only a system admin can manage these limits.', 'רק מנהל/ת מערכת יכול/ה לנהל את המגבלות האלה.') });
  }
  const { facultyId, processType, major, limits } = req.body ?? {};
  const cleanLimits = sanitizeLimits(limits);
  if (
    typeof facultyId !== 'string' || !/^[\w-]{1,60}$/.test(facultyId)
    || !PROCESS_TYPES.includes(processType)
    || !(major === null || major === undefined || (typeof major === 'string' && /^[\w-]{1,80}$/.test(major)))
    || !cleanLimits
  ) {
    return res.status(400).json({ message: L(req, 'Each limit must be a whole number of days between 1 and 365.', 'כל מגבלה חייבת להיות מספר ימים שלם בין 1 ל-365.') });
  }

  try {
    const before = await saveStuckLimits({ facultyId, processType, major: major ?? null, limits: cleanLimits }, uid);
    await logAuditEvent({
      userId: uid,
      userRole: req.user!.role,
      action: 'stuck_limits_updated',
      entityType: 'stuckMilestoneLimits',
      entityId: `${facultyId}__${processType}__${major ?? '_any'}`,
      oldValue: before,
      newValue: cleanLimits,
    });
    return res.status(200).json({ success: true, limits: cleanLimits });
  } catch (error) {
    console.error('setStuckLimits error:', error);
    return res.status(500).json({ message: L(req, 'Failed to save limits.', 'שמירת המגבלות נכשלה.') });
  }
};
