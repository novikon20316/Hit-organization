// src/services/notificationPrefs.ts
//
// Per-user notification settings (web /notifications, mobile notifications
// tab), applied by notify.ts's notifyUser. Rules (agreed with the product
// owner 2026-11-08):
//   - Users choose, per category, whether a notification ALSO goes out by
//     email / push / SMS / WhatsApp, and may get one daily email digest
//     instead of instant emails (see emailDigest.ts).
//   - In-app notifications and pending-task badges are always on — nothing
//     here can hide a task from the dashboard.
//   - Security & account notifications (login alerts, 2FA/recovery codes,
//     temporary passwords, account creation, admin alerts) are always sent
//     on every channel the caller asked for, and never go to the digest.
// Stored server-side only on users/{uid}.notificationPrefs, written through
// PUT /api/users/me/notification-prefs.

import type { NotificationType } from './emailTemplates.js';

export const NOTIFICATION_CATEGORIES = ['messages', 'deadlines', 'workflow', 'announcements'] as const;
export type NotificationCategory = typeof NOTIFICATION_CATEGORIES[number];

export const OPTIONAL_CHANNELS = ['email', 'push', 'sms', 'whatsapp'] as const;
export type OptionalChannel = typeof OPTIONAL_CHANNELS[number];

export interface NotificationPrefs {
  channels: Record<NotificationCategory, Record<OptionalChannel, boolean>>;
  /** Non-security emails are held and sent once a day instead of instantly. */
  emailDigest: boolean;
}

/** Never subject to the user's settings. */
const SECURITY_TYPES = new Set<NotificationType>([
  'account_created',
  'examiner_access_link',
  'examiner_otp_code',
  'defense_day_access_link',
  'totp_recovery_code',
  'biometric_setup_code',
  'login_security_alert',
  'temp_password_issued',
  'suspicious_login_admin_alert',
  'system_error_admin_alert',
  'two_factor_enforcement_notice',
]);

const CATEGORY_BY_TYPE: Partial<Record<NotificationType, NotificationCategory>> = {
  new_message: 'messages',
  coordinator_message: 'messages',
  seminar_contact_request: 'messages',
  milestone_deadline_7d: 'deadlines',
  supervisor_reminder: 'deadlines',
  milestone_deadline_1d: 'deadlines',
  milestone_overdue: 'deadlines',
  milestone_stuck: 'deadlines',
  milestone_stuck_reminder: 'deadlines',
  defense_dates_requested: 'deadlines',
  broadcast: 'announcements',
  general: 'announcements',
  project_published: 'announcements',
};

/** 'security' for the mandatory types; every workflow event (submissions,
 *  grades, approvals, applications, meetings, defense scheduling, final
 *  report) falls into 'workflow'. */
export function categoryFor(type: NotificationType): NotificationCategory | 'security' {
  if (SECURITY_TYPES.has(type)) return 'security';
  return CATEGORY_BY_TYPE[type] ?? 'workflow';
}

/** Everything on, no digest — exactly the behavior before this feature. */
export function defaultPrefs(): NotificationPrefs {
  const channels = {} as NotificationPrefs['channels'];
  for (const category of NOTIFICATION_CATEGORIES) {
    channels[category] = { email: true, push: true, sms: true, whatsapp: true };
  }
  return { channels, emailDigest: false };
}

/** Stored (or client-sent) value → full prefs; anything missing or invalid
 *  falls back to the default for that slot. */
export function readPrefs(raw: unknown): NotificationPrefs {
  const prefs = defaultPrefs();
  if (!raw || typeof raw !== 'object') return prefs;
  const r = raw as { channels?: Record<string, Record<string, unknown>>; emailDigest?: unknown };
  for (const category of NOTIFICATION_CATEGORIES) {
    for (const channel of OPTIONAL_CHANNELS) {
      const v = r.channels?.[category]?.[channel];
      if (typeof v === 'boolean') prefs.channels[category][channel] = v;
    }
  }
  if (typeof r.emailDigest === 'boolean') prefs.emailDigest = r.emailDigest;
  return prefs;
}

export function channelAllowed(prefs: NotificationPrefs, type: NotificationType, channel: OptionalChannel): boolean {
  const category = categoryFor(type);
  if (category === 'security') return true;
  return prefs.channels[category][channel];
}

export function sendsToDigest(prefs: NotificationPrefs, type: NotificationType): boolean {
  return prefs.emailDigest && categoryFor(type) !== 'security';
}
