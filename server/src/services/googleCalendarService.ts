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
const SCOPES = ['https://www.googleapis.com/auth/calendar.events'];

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
