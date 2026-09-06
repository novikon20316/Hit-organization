// src/controllers/twoFactorEnforcementController.ts
//
// system_admin-only endpoints backing the "enforce 2FA for everyone" admin
// panel action: activating it announces a grace-period deadline and
// bulk-notifies every user (in-app + email) with bilingual instructions;
// after the deadline, middleware/auth.ts's verifyToken hard-blocks any user
// who still hasn't set it up (see services/twoFactorEnforcement.ts for the
// shared deadline-check logic both that gate and GET /api/users/me use).

import { Response } from 'express';
import dayjs from 'dayjs';
import { db } from '../config/firebase.js';
import { AuthenticatedRequest, hasAnyRole } from '../middleware/auth.js';
import { notifyUser } from '../services/notify.js';
import {
  readTwoFactorEnforcementStatus,
  activateTwoFactorEnforcement,
  deactivateTwoFactorEnforcement,
  setTwoFactorExempt,
} from '../services/twoFactorEnforcement.js';

const DEFAULT_GRACE_DAYS = 7;
const PAGE_SIZE = 500; // same page size as accountDeletion.ts's flagGraduatedStudents

// ─── GET /api/admin/system/2fa-enforcement-status ────────────────────────────
export const getTwoFactorEnforcementStatusAdmin = async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user || !hasAnyRole(req.user, ['system_admin'])) {
    return res.status(403).json({ message: 'Access denied: system_admin only.' });
  }
  try {
    const status = await readTwoFactorEnforcementStatus();
    return res.status(200).json({
      active: status.active,
      announcedAt: status.announcedAt?.toDate?.()?.toISOString() ?? null,
      deadline: status.deadline?.toDate?.()?.toISOString() ?? null,
      createdBy: status.createdBy,
    });
  } catch (error: any) {
    console.error('getTwoFactorEnforcementStatusAdmin error:', error);
    return res.status(500).json({ message: 'Failed to load 2FA enforcement status.' });
  }
};

/** Bilingual instructions — sent identically in both titleHe/titleEn and
 *  bodyHe/bodyEn (each field carries BOTH languages), so the notice reads
 *  the same regardless of which language the client happens to render — a
 *  security deadline everyone must understand, not something that should
 *  ever be missed because of a language setting. */
function buildNoticeContent(deadlineLabel: string): { title: string; body: string } {
  const title = `🔐 אימות דו-שלבי (2FA) יהפוך לחובה בעוד 7 ימים / Two-Factor Authentication (2FA) Becomes Mandatory in 7 Days`;
  const bodyHe =
    `החל מתאריך ${deadlineLabel}, המערכת תחייב אימות דו-שלבי (2FA) לכל המשתמשים. ` +
    `מומלץ להגדיר זאת כבר עכשיו, לפני שהדבר יהפוך לחובה, כדי להימנע מהפרעה בגישה לחשבונך.\n` +
    `איך להפעיל: היכנסו ל"אימות דו-שלבי" בהגדרות ← סרקו את קוד ה-QR המוצג באמצעות אפליקציית Google Authenticator (או כל אפליקציית אימות תואמת) ← הזינו את הקוד בן 6 הספרות שמוצג באפליקציה כדי לאשר. זהו — בכניסות הבאות תתבקשו להזין קוד מהאפליקציה.`;
  const bodyEn =
    `Starting ${deadlineLabel}, the system will require two-factor authentication (2FA) for every user. ` +
    `We recommend setting it up now, before it becomes mandatory, to avoid any interruption accessing your account.\n` +
    `How to enable it: open "Two-Factor Authentication" in Settings → scan the QR code shown using the Google Authenticator app (or any compatible authenticator app) → enter the 6-digit code shown in the app to confirm. That's it — on future logins you'll be asked for a code from the app.`;
  return { title, body: `${bodyHe}\n\n— — —\n\n${bodyEn}` };
}

// ─── POST /api/admin/system/enforce-2fa ──────────────────────────────────────
// Body: { graceDays?: number } — defaults to 7. Activates the deadline, then
// bulk-notifies every existing user (paginated the same way
// accountDeletion.ts's flagGraduatedStudents walks the whole users
// collection) — in-app + email only; SMS/WhatsApp are skipped for a
// broadcast this size, same reasoning as any other system-wide notice.
export const activateTwoFactorEnforcementHandler = async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user || !hasAnyRole(req.user, ['system_admin'])) {
    return res.status(403).json({ message: 'Access denied: system_admin only.' });
  }

  const graceDaysRaw = req.body?.graceDays;
  const graceDays = Number.isFinite(graceDaysRaw) && graceDaysRaw > 0 ? Math.floor(graceDaysRaw) : DEFAULT_GRACE_DAYS;

  try {
    const status = await activateTwoFactorEnforcement(req.user.uid, graceDays);
    const deadlineLabel = dayjs(status.deadline!.toDate()).format('DD/MM/YYYY');
    const { title, body } = buildNoticeContent(deadlineLabel);

    let notified = 0;
    let failed = 0;
    let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;
    while (true) {
      let pageQuery = db.collection('users').limit(PAGE_SIZE) as FirebaseFirestore.Query;
      if (cursor) pageQuery = pageQuery.startAfter(cursor);
      const snap = await pageQuery.get();
      if (snap.empty) break;

      for (const doc of snap.docs) {
        try {
          await notifyUser({
            recipientId: doc.id,
            type: 'two_factor_enforcement_notice',
            titleHe: title,
            titleEn: title,
            bodyHe: body,
            bodyEn: body,
            emailData: { deadlineDate: deadlineLabel },
            channels: { inApp: true, email: true, push: true, sms: false, whatsapp: false },
          });
          notified++;
        } catch (err) {
          failed++;
          console.error(`activateTwoFactorEnforcementHandler: failed to notify ${doc.id}:`, err);
        }
      }

      cursor = snap.docs[snap.docs.length - 1];
      if (snap.docs.length < PAGE_SIZE) break;
    }

    return res.status(200).json({
      success: true,
      deadline: status.deadline!.toDate().toISOString(),
      notified,
      failed,
    });
  } catch (error: any) {
    console.error('activateTwoFactorEnforcementHandler error:', error);
    return res.status(500).json({ message: 'Failed to activate 2FA enforcement.' });
  }
};

// ─── DELETE /api/admin/system/enforce-2fa ────────────────────────────────────
// Cancels the policy outright — nobody gets hard-blocked, regardless of
// where their individual deadline stood. Does not undo the earlier notice.
export const deactivateTwoFactorEnforcementHandler = async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user || !hasAnyRole(req.user, ['system_admin'])) {
    return res.status(403).json({ message: 'Access denied: system_admin only.' });
  }
  try {
    await deactivateTwoFactorEnforcement();
    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('deactivateTwoFactorEnforcementHandler error:', error);
    return res.status(500).json({ message: 'Failed to cancel 2FA enforcement.' });
  }
};

// ─── POST /api/admin/users/:id/2fa-exempt ────────────────────────────────────
// Body: { exempt: boolean } — the ONLY way a specific user can be spared from
// an active enforcement policy. Persists until a system_admin explicitly
// flips it back (no automatic expiry) — see EditUserModal (web/mobile) for
// where this is set, and UserRow/panel.tsx for the quick "re-enforce" action
// shown only on users currently exempted.
export const setTwoFactorExemptHandler = async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user || !hasAnyRole(req.user, ['system_admin'])) {
    return res.status(403).json({ message: 'Access denied: system_admin only.' });
  }
  const { id } = req.params;
  if (!id || typeof id !== 'string') return res.status(400).json({ message: 'Missing userId.' });

  const exempt = req.body?.exempt === true;

  try {
    const userSnap = await db.collection('users').doc(id).get();
    if (!userSnap.exists) return res.status(404).json({ message: 'User not found.' });

    await setTwoFactorExempt(id, exempt);
    return res.status(200).json({ success: true, exempt });
  } catch (error: any) {
    console.error('setTwoFactorExemptHandler error:', error);
    return res.status(500).json({ message: 'Failed to update 2FA exemption.' });
  }
};
