// src/services/googleCalendarService.ts
//
// Real Google Calendar sync for supervisor↔student meetings (see
// supervisorController.ts's proposeMeeting / applicationController.ts's
// confirmMeetingSlot). A supervisor grants calendar write access through a
// SEPARATE OAuth consent flow owned entirely by this file — this is NOT the
// same as the Google *sign-in* flow already used for auth (see
// web/lib/firebase.ts's googleProvider), which only ever requests basic
// profile/email scope and never asks for calendar access.
//
// Credentials are deliberately NOT stored on the `users` collection:
// mobile/firestore.rules grants `allow read: if isSignedIn()` on every user
// doc (any signed-in account can read any OTHER user's profile), so a
// refresh token living there would be readable by any authenticated
// client. They live in a dedicated `calendarCredentials` collection instead,
// locked to `allow read, write: if false` (Admin SDK only) — same treatment
// firestore.rules already gives the `applications` collection.
//
// Needs GOOGLE_CALENDAR_CLIENT_ID / GOOGLE_CALENDAR_CLIENT_SECRET /
// GOOGLE_CALENDAR_REDIRECT_URI configured (a Google Cloud OAuth client with
// the Calendar API enabled and this exact redirect URI registered under
// "Authorized redirect URIs"). Until those are set, isCalendarConfigured()
// is false and callers skip calendar sync entirely — the meeting itself
// still gets confirmed and notified over every other channel, calendar sync
// is additive, not load-bearing.

import { google } from 'googleapis';
import { db } from '../config/firebase.js';

const CLIENT_ID = process.env.GOOGLE_CALENDAR_CLIENT_ID || '';
const CLIENT_SECRET = process.env.GOOGLE_CALENDAR_CLIENT_SECRET || '';
const REDIRECT_URI = process.env.GOOGLE_CALENDAR_REDIRECT_URI || '';
// calendar.freebusy (added 2026-11-08): busy/free blocks only — never event
// titles, attendees or details — for "suggest meeting times" (getFreeSlots).
// Connections made before it was added don't have it; they keep working for
// event sync, and the suggest feature asks them to reconnect once.
const FREEBUSY_SCOPE = 'https://www.googleapis.com/auth/calendar.freebusy';
const SCOPES = ['https://www.googleapis.com/auth/calendar.events', FREEBUSY_SCOPE];

export function isCalendarConfigured(): boolean {
  return !!(CLIENT_ID && CLIENT_SECRET && REDIRECT_URI);
}

function newOAuthClient() {
  return new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
}

/**
 * Builds the consent URL a supervisor is redirected to from
 * GET /api/supervisor/calendar/connect. `state` carries their uid AND which
 * client started the flow through the round trip (Google echoes it back
 * unmodified on the callback) — supervisorController.ts's
 * handleCalendarCallback splits it back apart to know whose tokens these
 * are and, since Google's redirect always lands on this server (not
 * wherever the flow started), which app to bounce the browser back to:
 * the web dashboard, or a `mobile://` deep link back into the app.
 */
export function getCalendarAuthUrl(supervisorId: string, platform: 'web' | 'mobile' = 'web'): string {
  if (!isCalendarConfigured()) {
    throw new Error('Google Calendar is not configured on this server (missing GOOGLE_CALENDAR_* env vars).');
  }
  return newOAuthClient().generateAuthUrl({
    access_type: 'offline', // required to get a refresh token back
    prompt: 'consent',      // forces a fresh refresh token even on re-consent
    scope: SCOPES,
    state: `${supervisorId}:${platform}`,
  });
}

export async function handleCalendarOAuthCallback(code: string, supervisorId: string): Promise<void> {
  const client = newOAuthClient();
  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) {
    // Happens when the supervisor had already granted consent before and
    // Google skipped re-issuing one — prompt:'consent' above is meant to
    // prevent this, but a stale existing grant can still occasionally do
    // it. The caller-facing error tells them to revoke access at
    // myaccount.google.com/permissions and reconnect.
    throw new Error('Google did not return a refresh token — please revoke prior access at myaccount.google.com/permissions and reconnect.');
  }
  await db.collection('calendarCredentials').doc(supervisorId).set({
    refreshToken: tokens.refresh_token,
    // What the supervisor actually granted — Google lets them untick scopes.
    scopes: typeof tokens.scope === 'string' ? tokens.scope.split(' ') : [],
    connectedAt: new Date().toISOString(),
  });
}

export async function isCalendarConnected(supervisorId: string): Promise<boolean> {
  const snap = await db.collection('calendarCredentials').doc(supervisorId).get();
  return snap.exists;
}

export async function disconnectCalendar(supervisorId: string): Promise<void> {
  await db.collection('calendarCredentials').doc(supervisorId).delete();
}

async function getAuthorizedClient(supervisorId: string) {
  const snap = await db.collection('calendarCredentials').doc(supervisorId).get();
  const refreshToken = snap.data()?.refreshToken;
  if (!refreshToken) return null;
  const client = newOAuthClient();
  // Setting refresh_token alone is enough — googleapis transparently
  // exchanges it for a fresh access token on the first authenticated call.
  client.setCredentials({ refresh_token: refreshToken });
  return client;
}

export interface CreateMeetingEventParams {
  supervisorId: string;
  studentEmail: string;
  titleHe: string;
  titleEn: string;
  startTime: Date;
  durationMinutes?: number;
}

export interface CreateMeetingEventResult {
  eventId: string;
  htmlLink: string | null;
}

/**
 * Creates the event on the supervisor's own primary Google Calendar with the
 * student as an attendee — sendUpdates:'all' makes Google email the student
 * a real calendar invite (.ics) itself, so no separate student-side OAuth is
 * needed for them to get it on their own calendar.
 *
 * Throws on any failure (not connected, revoked, API error) — this is
 * deliberately NOT best-effort internally; callers (confirmMeetingSlot) wrap
 * this call themselves and must treat calendar sync as optional, same
 * throw-don't-swallow contract as smsService.ts/emailService.ts.
 */
export async function createMeetingEvent(params: CreateMeetingEventParams): Promise<CreateMeetingEventResult> {
  const { supervisorId, studentEmail, titleHe, titleEn, startTime, durationMinutes = 30 } = params;
  const client = await getAuthorizedClient(supervisorId);
  if (!client) throw new Error('Supervisor has not connected their Google Calendar.');

  const calendar = google.calendar({ version: 'v3', auth: client });
  const endTime = new Date(startTime.getTime() + durationMinutes * 60 * 1000);

  const response = await calendar.events.insert({
    calendarId: 'primary',
    sendUpdates: 'all',
    requestBody: {
      summary: `${titleHe} / ${titleEn}`,
      start: { dateTime: startTime.toISOString() },
      end: { dateTime: endTime.toISOString() },
      attendees: [{ email: studentEmail }],
    },
  });

  return { eventId: response.data.id ?? '', htmlLink: response.data.htmlLink ?? null };
}

// ─── Free-slot suggestions (Propose Meeting) ────────────────────────────────

export class FreeSlotsUnavailableError extends Error {
  constructor(public reason: 'not_connected' | 'needs_reconnect') {
    super(reason);
  }
}

const SLOT_TZ = 'Asia/Jerusalem';
const WORK_START_HOUR = 9;
const WORK_END_HOUR = 17;
const SLOT_MINUTES = 60;
const LOOKAHEAD_DAYS = 14;
const MAX_SLOTS_PER_DAY = 2;

/** Israel-time wall clock → UTC Date (handles DST via the zone's offset on that day). */
function israelTime(date: string, hour: number): Date {
  const guess = new Date(`${date}T${String(hour).padStart(2, '0')}:00:00Z`);
  const local = new Date(guess.toLocaleString('en-US', { timeZone: SLOT_TZ }));
  const offsetMs = local.getTime() - new Date(guess.toLocaleString('en-US', { timeZone: 'UTC' })).getTime();
  return new Date(guess.getTime() - offsetMs);
}

/**
 * Free 1-hour windows on the supervisor's primary calendar, Sunday–Thursday
 * 09:00–17:00 Israel time, from tomorrow over the next two weeks — at most
 * MAX_SLOTS_PER_DAY per day so the suggestions spread out. Uses only the
 * free/busy query (no event contents).
 */
export async function getFreeSlots(supervisorId: string, count: number): Promise<Array<{ date: string; time: string }>> {
  const snap = await db.collection('calendarCredentials').doc(supervisorId).get();
  const data = snap.data();
  if (!data?.refreshToken) throw new FreeSlotsUnavailableError('not_connected');
  if (!Array.isArray(data.scopes) || !data.scopes.includes(FREEBUSY_SCOPE)) throw new FreeSlotsUnavailableError('needs_reconnect');

  const client = newOAuthClient();
  client.setCredentials({ refresh_token: data.refreshToken });
  const calendar = google.calendar({ version: 'v3', auth: client });

  const days: string[] = [];
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: SLOT_TZ, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' });
  for (let i = 1; i <= LOOKAHEAD_DAYS; i++) {
    const parts = Object.fromEntries(fmt.formatToParts(new Date(Date.now() + i * 86_400_000)).map((p) => [p.type, p.value]));
    if (parts.weekday === 'Fri' || parts.weekday === 'Sat') continue;
    days.push(`${parts.year}-${parts.month}-${parts.day}`);
  }
  if (days.length === 0) return [];

  const response = await calendar.freebusy.query({
    requestBody: {
      timeMin: israelTime(days[0]!, 0).toISOString(),
      timeMax: israelTime(days[days.length - 1]!, 23).toISOString(),
      timeZone: SLOT_TZ,
      items: [{ id: 'primary' }],
    },
  });
  const busy = (response.data.calendars?.primary?.busy ?? [])
    .map((b) => ({ start: new Date(b.start ?? 0).getTime(), end: new Date(b.end ?? 0).getTime() }));

  const slots: Array<{ date: string; time: string }> = [];
  for (const day of days) {
    let perDay = 0;
    for (let hour = WORK_START_HOUR; hour + SLOT_MINUTES / 60 <= WORK_END_HOUR && perDay < MAX_SLOTS_PER_DAY; hour++) {
      const start = israelTime(day, hour).getTime();
      const end = start + SLOT_MINUTES * 60_000;
      if (busy.some((b) => b.start < end && b.end > start)) continue;
      slots.push({ date: day, time: `${String(hour).padStart(2, '0')}:00` });
      perDay++;
      hour++; // leave a gap so the two suggestions on one day aren't back to back
      if (slots.length >= count) return slots;
    }
  }
  return slots;
}
