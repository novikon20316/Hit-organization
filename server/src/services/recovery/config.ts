// src/services/recovery/config.ts — what a recovery file includes/excludes
// and where it is sent. All settings are plain env vars on the api service
// and the recovery-backup Cloud Run Job (see RECOVERY_RUNBOOK_HE.md).

/** Top-level collections NOT backed up: short-lived, telemetry, or rebuilt
 *  on their own. Restoring them would only bring back stale noise. */
export const EXCLUDED_COLLECTIONS = new Set([
  'rateLimits',
  'presence',
  'presenceHistory',
  'milestoneSignals',
  'systemJobRuns',
  'notificationDeliveryStats',
  'errorReports',
  'serverIncidents',
  'infoFileTexts',
  'emailDigestItems',
  'recoveryJournalQueue',
  '_',
]);

/** Individual docs skipped on backup AND never written/wiped on restore:
 *  live change-signal markers and the maintenance switches the restore
 *  itself is flipping. */
export function isExcludedDocPath(path: string): boolean {
  return /^config\/[^/]*ChangeSignal$/.test(path)
    || /^system\/maintenance(_[a-z]+)?$/.test(path)
    || path === 'system/recoveryGrace'
    || path.startsWith('systemMeta/recovery');
}

/** Names (never values) of the env vars the api service needs — written
 *  into every manifest so a from-scratch rebuild knows what to set. */
export const ENV_VAR_NAMES = [
  'WEBSITE_URL', 'EXAMINER_ACCESS_BASE_URL', 'NODE_ENV', 'APP_CHECK_ENFORCEMENT_MODE',
  'CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET',
  'BREVO_API_KEY', 'EMAIL_FROM_NAME', 'EMAIL_FROM_ADDRESS',
  'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM_NUMBER',
  'ANTHROPIC_API_KEY',
  'GOOGLE_CALENDAR_CLIENT_ID', 'GOOGLE_CALENDAR_CLIENT_SECRET', 'GOOGLE_CALENDAR_REDIRECT_URI',
  'ZOOM_ACCOUNT_ID', 'ZOOM_CLIENT_ID', 'ZOOM_CLIENT_SECRET', 'ZOOM_HOST_USER',
  'TWILIO_WHATSAPP_FROM_NUMBER', 'INTEGRATION_API_KEY', 'FIREBASE_WEB_API_KEY',
  'EVALUATION_SIGNATURE_SECRET', 'APP_LINK_URL_IOS', 'APP_LINK_URL_ANDROID',
  'RECOVERY_PUBLIC_KEY', 'RECOVERY_BUCKET', 'RECOVERY_JOB_NAME', 'RECOVERY_JOB_REGION',
  'RECOVERY_DRIVE_CLIENT_ID', 'RECOVERY_DRIVE_CLIENT_SECRET', 'RECOVERY_DRIVE_REFRESH_TOKEN', 'RECOVERY_DRIVE_FOLDER_ID',
];

export const RECOVERY_TZ = 'Asia/Jerusalem';

/** Daily files also carry every file uploaded in this many days, so the
 *  latest weekly + latest daily together always cover every upload. */
export const DAILY_FILES_LOOKBACK_DAYS = 8;

/** Drive copy retention (the bucket's own retention lock is the real guard). */
export const DRIVE_KEEP = { daily: 14, weekly: 8, manual: 5 } as const;

/** Key-age warnings on the admin page / System Health. */
export const KEY_ROTATE_AFTER_DAYS = 365;
export const PASSPHRASE_ROTATE_AFTER_DAYS = 182;

/** A backup older than this is "late" and alerts system admins. */
export const BACKUP_STALE_HOURS = 36;

export function recoveryEnv() {
  return {
    publicKey: process.env.RECOVERY_PUBLIC_KEY?.trim() || null,
    bucket: process.env.RECOVERY_BUCKET?.trim() || null,
    jobName: process.env.RECOVERY_JOB_NAME?.trim() || 'recovery-backup',
    jobRegion: process.env.RECOVERY_JOB_REGION?.trim() || 'us-central1',
    drive: process.env.RECOVERY_DRIVE_REFRESH_TOKEN && process.env.RECOVERY_DRIVE_CLIENT_ID && process.env.RECOVERY_DRIVE_CLIENT_SECRET && process.env.RECOVERY_DRIVE_FOLDER_ID
      ? {
          clientId: process.env.RECOVERY_DRIVE_CLIENT_ID,
          clientSecret: process.env.RECOVERY_DRIVE_CLIENT_SECRET,
          refreshToken: process.env.RECOVERY_DRIVE_REFRESH_TOKEN,
          folderId: process.env.RECOVERY_DRIVE_FOLDER_ID,
        }
      : null,
  };
}
