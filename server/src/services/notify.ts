import admin from 'firebase-admin';
import { db } from '../config/firebase.js';
import { sendNotificationEmail } from './emailService.js';
import { toE164IL, sendSms } from './smsService.js';
import { sendWhatsapp } from './whatsappService.js';
import type { NotificationType } from './emailTemplates.js';
import { targetScreenFor, type NotificationTaskKind } from './notificationTargets.js';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

type DeliveryStatus = 'sent' | 'failed' | 'skipped' | 'invalid_number' | 'pending';

export interface NotifyChannels {
  inApp?: boolean;
  email?: boolean;
  push?:  boolean;
  sms?:   boolean;
  whatsapp?: boolean;
}

export interface NotifyParams {
  recipientId: string;
  type: NotificationType;
  /** Overrides the `type` field stored on the in-app notification doc, for
   *  flows whose in-app copy doesn't correspond to a real email template
   *  (e.g. 'milestone_coordinator_approved'). Defaults to `type`. */
  inAppType?: string;
  titleHe: string;
  titleEn: string;
  bodyHe:  string;
  bodyEn:  string;
  relatedProjectId?:   string | null;
  relatedMilestoneId?: string | null;
  /** What kind of task this is, so notifyUser can resolve it to a
   *  role-specific dashboard screen (see notificationTargets.ts) using the
   *  recipient's own role — already fetched below regardless. Lets a
   *  notification's "Go to dashboard" link on the client land on the exact
   *  tab where the task lives, instead of always landing on that
   *  dashboard's default tab. Omit for notifications where that's not
   *  applicable (student-directed ones, informational-only ones). */
  taskKind?: NotificationTaskKind;
  /** Direct override for the resolved target screen — for destinations
   *  that don't depend on the recipient's role at all (e.g. a dedicated
   *  page like /committees, reachable the same way by whichever role
   *  happens to be a committee member). Takes precedence over `taskKind`
   *  when both are given; prefer `taskKind` whenever the destination
   *  actually is role-dependent. */
  targetScreen?: string;
  /** Extra placeholders for the email template body, beyond the
   *  auto-injected `name`. A value can be a plain (language-agnostic)
   *  string, or a `{he, en}` pair for content that's already stored
   *  bilingually (e.g. a project's titleHe/titleEn) — notify.ts resolves
   *  the recipient's own language internally (the caller doesn't know it
   *  in advance), so callers can't pre-pick a single string themselves. */
  emailData?: Record<string, string | { he: string; en: string }>;
  channels?: NotifyChannels;
}

/**
 * Single dispatcher for every outbound notification: writes the in-app
 * Firestore doc and attempts email/push/SMS/WhatsApp independently, then persists
 * what actually happened on each channel back onto that doc — so "did this
 * notification actually go out" is a Firestore read, not a guess from a
 * server log. See services/loginSecurity.ts for the precedent this
 * generalizes (persisted emailDelivery/emailDeliveryError).
 */
export async function notifyUser(params: NotifyParams): Promise<void> {
  const {
    recipientId, type, inAppType, titleHe, titleEn, bodyHe, bodyEn,
    relatedProjectId = null, relatedMilestoneId = null, emailData, channels, taskKind,
    targetScreen: targetScreenOverride,
  } = params;

  const wantInApp = channels?.inApp !== false;
  const wantEmail = channels?.email !== false;
  const wantPush  = channels?.push  !== false;
  const wantSms   = channels?.sms   !== false;
  const wantWhatsapp = channels?.whatsapp !== false;

  const userSnap = await db.collection('users').doc(recipientId).get();
  const user = userSnap.data();
  if (!user) {
    console.error(`notifyUser: recipient ${recipientId} has no user doc — nothing sent.`);
    return;
  }

  const lang: 'he' | 'en' = user.language === 'en' ? 'en' : 'he';
  const name = user.displayName ?? user.displayNameHe ?? '';
  const fullEmailData: Record<string, string> = { name };
  for (const [key, value] of Object.entries(emailData ?? {})) {
    fullEmailData[key] = typeof value === 'string' ? value : (lang === 'he' ? value.he : value.en);
  }

  const targetScreen = targetScreenOverride ?? (taskKind ? targetScreenFor(user.role, taskKind) : null);

  let notifRef: FirebaseFirestore.DocumentReference | null = null;
  if (wantInApp) {
    notifRef = db.collection('notifications').doc();
    await notifRef.set({
      recipientId,
      type: inAppType ?? type,
      titleHe, titleEn, bodyHe, bodyEn,
      isRead: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      relatedProjectId,
      relatedMilestoneId,
      ...(targetScreen ? { targetScreen } : {}),
      emailDelivery: 'pending' satisfies DeliveryStatus,
      pushDelivery:  'pending' satisfies DeliveryStatus,
      smsDelivery:   'pending' satisfies DeliveryStatus,
      whatsappDelivery: 'pending' satisfies DeliveryStatus,
    });
  }

  const statuses: Record<string, string> = {};

  // ─── Email ──────────────────────────────────────────────────────────────
  if (!wantEmail || !user.email) {
    statuses.emailDelivery = 'skipped';
  } else {
    try {
      await sendNotificationEmail({ toEmail: user.email, type, lang, data: fullEmailData });
      statuses.emailDelivery = 'sent';
    } catch (err: any) {
      console.error(`notifyUser: email failed for ${recipientId} [${type}]:`, err);
      statuses.emailDelivery = 'failed';
      statuses.emailDeliveryError = String(err?.message ?? err);
    }
  }

  // ─── Push (Expo) ────────────────────────────────────────────────────────
  const pushToken: string | undefined = user.expoPushToken;
  if (!wantPush || !pushToken) {
    statuses.pushDelivery = 'skipped';
  } else {
    try {
      const response = await fetch(EXPO_PUSH_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to:    pushToken,
          title: lang === 'he' ? titleHe : titleEn,
          body:  lang === 'he' ? bodyHe  : bodyEn,
          data:  { type, relatedProjectId, relatedMilestoneId },
        }),
      });
      const json: any = await response.json().catch(() => null);
      if (json?.data?.status === 'error') {
        if (json.data.details?.error === 'DeviceNotRegistered') {
          await db.collection('users').doc(recipientId).update({ expoPushToken: null });
        }
        statuses.pushDelivery = 'failed';
        statuses.pushDeliveryError = String(json.data.message ?? json.data.details?.error ?? 'unknown Expo error');
      } else {
        statuses.pushDelivery = 'sent';
      }
    } catch (err: any) {
      console.error(`notifyUser: push failed for ${recipientId} [${type}]:`, err);
      statuses.pushDelivery = 'failed';
      statuses.pushDeliveryError = String(err?.message ?? err);
    }
  }

  // ─── SMS (Twilio) ───────────────────────────────────────────────────────
  const phoneRaw: string | undefined = user.phoneNumber;
  if (!wantSms || !phoneRaw) {
    statuses.smsDelivery = 'skipped';
  } else {
    const e164 = toE164IL(phoneRaw);
    if (!e164) {
      statuses.smsDelivery = 'invalid_number';
    } else {
      try {
        await sendSms(e164, `${lang === 'he' ? titleHe : titleEn}\n${lang === 'he' ? bodyHe : bodyEn}`);
        statuses.smsDelivery = 'sent';
      } catch (err: any) {
        console.error(`notifyUser: sms failed for ${recipientId} [${type}]:`, err);
        statuses.smsDelivery = 'failed';
        statuses.smsDeliveryError = String(err?.message ?? err);
      }
    }
  }

  // ─── WhatsApp (Twilio) ──────────────────────────────────────────────────
  if (!wantWhatsapp || !phoneRaw) {
    statuses.whatsappDelivery = 'skipped';
  } else {
    const e164 = toE164IL(phoneRaw);
    if (!e164) {
      statuses.whatsappDelivery = 'invalid_number';
    } else {
      try {
        await sendWhatsapp(e164, `${lang === 'he' ? titleHe : titleEn}\n${lang === 'he' ? bodyHe : bodyEn}`);
        statuses.whatsappDelivery = 'sent';
      } catch (err: any) {
        console.error(`notifyUser: whatsapp failed for ${recipientId} [${type}]:`, err);
        statuses.whatsappDelivery = 'failed';
        statuses.whatsappDeliveryError = String(err?.message ?? err);
      }
    }
  }

  if (notifRef) {
    await notifRef.update(statuses).catch((err) => {
      // Best-effort — never let the status write mask the sends above.
      console.error(`notifyUser: failed to persist delivery status for ${recipientId} [${type}]:`, err);
    });
  }
}
