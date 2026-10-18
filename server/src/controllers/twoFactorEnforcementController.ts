// src/controllers/twoFactorEnforcementController.ts
//
// system_admin-only endpoints backing the "enforce 2FA for staff" admin
// panel action: activating it announces a grace-period deadline and
// bulk-notifies every staff (non-student) user (in-app + email) with
// bilingual instructions; after the deadline, middleware/auth.ts's
// verifyToken hard-blocks any staff user who still hasn't set it up.
// Students are never subject to this enforcement (see isStaffMember in
// services/twoFactorEnforcement.ts, the shared source of truth both that
// gate and GET /api/users/me use).

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
  isStaffMember,
  isSubjectToTwoFactorEnforcement,
} from '../services/twoFactorEnforcement.js';
import { L } from '../utils/localize.js';
import { MAJORS_BY_FACULTY } from '../config/majors.js';
import { facultyName } from '../services/studentProgress.js';

const DEFAULT_GRACE_DAYS = 7;
const PAGE_SIZE = 500; // same page size as accountDeletion.ts's flagGraduatedStudents

// ─── GET /api/admin/system/2fa-enforcement-status ────────────────────────────
export const getTwoFactorEnforcementStatusAdmin = async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user || !hasAnyRole(req.user, ['system_admin'])) {
    return res.status(403).json({ message: L(req, 'Access denied: system_admin only.', 'הגישה נדחתה: מנהל מערכת בלבד.') });
  }
  try {
    const status = await readTwoFactorEnforcementStatus();
    return res.status(200).json({
      active: status.active,
      announcedAt: status.announcedAt?.toDate?.()?.toISOString() ?? null,
      deadline: status.deadline?.toDate?.()?.toISOString() ?? null,
      createdBy: status.createdBy,
      facultyIds: status.facultyIds,
    });
  } catch (error: any) {
    console.error('getTwoFactorEnforcementStatusAdmin error:', error);
    return res.status(500).json({ message: L(req, 'Failed to load 2FA enforcement status.', 'טעינת סטטוס אכיפת האימות הדו-שלבי נכשלה.') });
  }
};

/** Bilingual instructions — sent identically in both titleHe/titleEn and
 *  bodyHe/bodyEn (each field carries BOTH languages), so the notice reads
 *  the same regardless of which language the client happens to render — a
 *  security deadline everyone must understand, not something that should
 *  ever be missed because of a language setting. */
function buildNoticeContent(deadlineLabel: string, graceDays: number, facultyIds: string[]): { title: string; body: string } {
  const daysHe = graceDays === 1 ? 'יום אחד' : `${graceDays} ימים`;
  const daysEn = graceDays === 1 ? '1 Day' : `${graceDays} Days`;
  const title = `🔐 אימות דו-שלבי (2FA) יהפוך לחובה בעוד ${daysHe} / Two-Factor Authentication (2FA) Becomes Mandatory in ${daysEn}`;
  const whoHe = facultyIds.length
    ? `לחשבונות הסגל של ${facultyIds.map((f) => facultyName(f).he).join(', ')}`
    : 'לכל חשבונות הסגל';
  const whoEn = facultyIds.length
    ? `staff accounts in ${facultyIds.map((f) => facultyName(f).en).join(', ')}`
    : 'all staff accounts';
  const bodyHe =
    `החל מתאריך ${deadlineLabel}, המערכת תחייב אימות דו-שלבי (2FA) ${whoHe} (לא כולל סטודנטים). ` +
    `מומלץ להגדיר זאת כבר עכשיו, לפני שהדבר יהפוך לחובה, כדי להימנע מהפרעה בגישה לחשבונך.\n` +
    `איך להפעיל: היכנסו ל"אימות דו-שלבי" בהגדרות ← סרקו את קוד ה-QR המוצג באמצעות אפליקציית Google Authenticator (או כל אפליקציית אימות תואמת) ← הזינו את הקוד בן 6 הספרות שמוצג באפליקציה כדי לאשר. זהו — בכניסות הבאות תתבקשו להזין קוד מהאפליקציה.`;
  const bodyEn =
    `Starting ${deadlineLabel}, the system will require two-factor authentication (2FA) for ${whoEn} (students are not affected). ` +
    `We recommend setting it up now, before it becomes mandatory, to avoid any interruption accessing your account.\n` +
    `How to enable it: open "Two-Factor Authentication" in Settings → scan the QR code shown using the Google Authenticator app (or any compatible authenticator app) → enter the 6-digit code shown in the app to confirm. That's it — on future logins you'll be asked for a code from the app.`;
  return { title, body: `${bodyHe}\n\n— — —\n\n${bodyEn}` };
}

// ─── POST /api/admin/system/enforce-2fa ──────────────────────────────────────
// Body: { graceDays?: number } — defaults to 7. Activates the deadline, then
// bulk-notifies every existing staff (non-student) user (paginated the same
// way accountDeletion.ts's flagGraduatedStudents walks the whole users
// collection, skipping student-only accounts) — in-app + email only;
// SMS/WhatsApp are skipped for a broadcast this size, same reasoning as any
// other system-wide notice.
export const activateTwoFactorEnforcementHandler = async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user || !hasAnyRole(req.user, ['system_admin'])) {
    return res.status(403).json({ message: L(req, 'Access denied: system_admin only.', 'הגישה נדחתה: מנהל מערכת בלבד.') });
  }

  const graceDaysRaw = req.body?.graceDays;
  const graceDays = Number.isFinite(graceDaysRaw) && graceDaysRaw > 0 ? Math.floor(graceDaysRaw) : DEFAULT_GRACE_DAYS;

  // Optional faculty scope — e.g. ['data_science'] while only that faculty
  // has real users. Empty/missing = every staff member (original behavior,
  // and what an older client that doesn't send it gets).
  const facultyIdsRaw: unknown = req.body?.facultyIds;
  const facultyIds = Array.isArray(facultyIdsRaw) ? [...new Set(facultyIdsRaw)] : [];
  if (!facultyIds.every((f) => typeof f === 'string' && f in MAJORS_BY_FACULTY)) {
    return res.status(400).json({ message: L(req, 'Unknown faculty in the list.', 'ברשימה יש פקולטה לא מוכרת.') });
  }

  try {
    const status = await activateTwoFactorEnforcement(req.user.uid, graceDays, facultyIds as string[]);
    const deadlineLabel = dayjs(status.deadline!.toDate()).format('DD/MM/YYYY');
    const { title, body } = buildNoticeContent(deadlineLabel, graceDays, status.facultyIds);

    let notified = 0;
    let failed = 0;
    let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;
    while (true) {
      let pageQuery = db.collection('users').limit(PAGE_SIZE) as FirebaseFirestore.Query;
      if (cursor) pageQuery = pageQuery.startAfter(cursor);
      const snap = await pageQuery.get();
      if (snap.empty) break;

      for (const doc of snap.docs) {
        const userData = doc.data();
        // Only staff the policy actually covers — never students, and only
        // the chosen faculties' staff when it's limited to some.
        if (!isSubjectToTwoFactorEnforcement(userData ?? {}, status)) continue;
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
      facultyIds: status.facultyIds,
      notified,
      failed,
    });
  } catch (error: any) {
    console.error('activateTwoFactorEnforcementHandler error:', error);
    return res.status(500).json({ message: L(req, 'Failed to activate 2FA enforcement.', 'הפעלת אכיפת האימות הדו-שלבי נכשלה.') });
  }
};

// ─── DELETE /api/admin/system/enforce-2fa ────────────────────────────────────
// Cancels the policy outright — nobody gets hard-blocked, regardless of
// where their individual deadline stood. Does not undo the earlier notice.
export const deactivateTwoFactorEnforcementHandler = async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user || !hasAnyRole(req.user, ['system_admin'])) {
    return res.status(403).json({ message: L(req, 'Access denied: system_admin only.', 'הגישה נדחתה: מנהל מערכת בלבד.') });
  }
  try {
    await deactivateTwoFactorEnforcement();
    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('deactivateTwoFactorEnforcementHandler error:', error);
    return res.status(500).json({ message: L(req, 'Failed to cancel 2FA enforcement.', 'ביטול אכיפת האימות הדו-שלבי נכשל.') });
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
    return res.status(403).json({ message: L(req, 'Access denied: system_admin only.', 'הגישה נדחתה: מנהל מערכת בלבד.') });
  }
  const { id } = req.params;
  if (!id || typeof id !== 'string') return res.status(400).json({ message: L(req, 'Missing userId.', 'חסר מזהה משתמש.') });

  const exempt = req.body?.exempt === true;

  try {
    const userSnap = await db.collection('users').doc(id).get();
    if (!userSnap.exists) return res.status(404).json({ message: L(req, 'User not found.', 'המשתמש לא נמצא.') });

    await setTwoFactorExempt(id, exempt);
    return res.status(200).json({ success: true, exempt });
  } catch (error: any) {
    console.error('setTwoFactorExemptHandler error:', error);
    return res.status(500).json({ message: L(req, 'Failed to update 2FA exemption.', 'עדכון פטור האימות הדו-שלבי נכשל.') });
  }
};
