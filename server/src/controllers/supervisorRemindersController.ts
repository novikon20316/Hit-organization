// src/controllers/supervisorRemindersController.ts
//
// Supervisor-scheduled student reminders — see services/supervisorReminders.ts
// for the rules. Every handler re-checks that the caller supervises the
// project (primary or secondary) inside the service.

import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { ReminderError, createProjectReminder, deleteReminder, listProjectReminders } from '../services/supervisorReminders.js';
import { isValidDocId } from '../services/idValidation.js';
import { L } from '../utils/localize.js';

function fail(req: AuthenticatedRequest, res: Response, err: unknown, label: string) {
  if (err instanceof ReminderError) return res.status(err.status).json({ message: L(req, err.en, err.he) });
  console.error(`${label} error:`, err);
  return res.status(500).json({ message: L(req, 'The reminder action failed.', 'פעולת התזכורת נכשלה.') });
}

// GET /api/supervisor/projects/:id/reminders
export const listRemindersHandler = async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ message: L(req, 'Unauthorized', 'לא מורשה') });
  const id = String(req.params.id ?? '');
  if (!isValidDocId(id)) return res.status(400).json({ message: L(req, 'Invalid project.', 'פרויקט לא תקין.') });
  try {
    return res.status(200).json({ reminders: await listProjectReminders(id, req.user.uid) });
  } catch (err) {
    return fail(req, res, err, 'listRemindersHandler');
  }
};

// POST /api/supervisor/projects/:id/reminders  { milestoneId, daysBefore, note? }
export const createReminderHandler = async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ message: L(req, 'Unauthorized', 'לא מורשה') });
  const id = String(req.params.id ?? '');
  if (!isValidDocId(id)) return res.status(400).json({ message: L(req, 'Invalid project.', 'פרויקט לא תקין.') });
  try {
    const reminder = await createProjectReminder(id, req.user.uid, {
      milestoneId: req.body?.milestoneId,
      daysBefore: req.body?.daysBefore,
      note: req.body?.note,
    });
    return res.status(201).json({ reminder });
  } catch (err) {
    return fail(req, res, err, 'createReminderHandler');
  }
};

// DELETE /api/supervisor/reminders/:reminderId
export const deleteReminderHandler = async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ message: L(req, 'Unauthorized', 'לא מורשה') });
  const id = String(req.params.reminderId ?? '');
  if (!isValidDocId(id)) return res.status(400).json({ message: L(req, 'Invalid reminder.', 'תזכורת לא תקינה.') });
  try {
    await deleteReminder(id, req.user.uid);
    return res.status(200).json({ success: true });
  } catch (err) {
    return fail(req, res, err, 'deleteReminderHandler');
  }
};
