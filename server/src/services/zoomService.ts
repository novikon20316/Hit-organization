// services/zoomService.ts
// Thin Zoom REST client for defense-exam meetings, using a Server-to-Server
// OAuth app (Zoom Marketplace → "Server-to-Server OAuth"). Required env:
//   ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET — the app's credentials
//   ZOOM_HOST_USER — email (or Zoom user id) of the licensed account that hosts
//                    every defense meeting; defaults to 'me' (the app owner)
// When any credential is missing, isZoomConfigured() is false and callers fall
// back to a staff-pasted meeting link instead of failing the save.

const ZOOM_API = 'https://api.zoom.us/v2';
const TZ = 'Asia/Jerusalem';

let cachedToken: { value: string; expiresAt: number } | null = null;

export function isZoomConfigured(): boolean {
  return !!(process.env.ZOOM_ACCOUNT_ID && process.env.ZOOM_CLIENT_ID && process.env.ZOOM_CLIENT_SECRET);
}

async function getAccessToken(): Promise<string> {
  // Refresh a minute before the (1h) expiry so an in-flight request never
  // carries a token that dies mid-call.
  if (cachedToken && cachedToken.expiresAt - 60_000 > Date.now()) return cachedToken.value;

  const basic = Buffer.from(`${process.env.ZOOM_CLIENT_ID}:${process.env.ZOOM_CLIENT_SECRET}`).toString('base64');
  const url = `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(process.env.ZOOM_ACCOUNT_ID ?? '')}`;
  const res = await fetch(url, { method: 'POST', headers: { Authorization: `Basic ${basic}` } });
  if (!res.ok) throw new Error(`Zoom OAuth failed (${res.status}): ${await res.text()}`);
  const body = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
  return body.access_token;
}

async function zoomRequest(method: string, path: string, payload?: unknown): Promise<Response> {
  const token = await getAccessToken();
  return fetch(`${ZOOM_API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(payload !== undefined ? { body: JSON.stringify(payload) } : {}),
  });
}

export interface ZoomMeetingInput {
  topic: string;
  /** Local Asia/Jerusalem wall-clock time, 'YYYY-MM-DDTHH:mm:ss' (no offset). */
  startLocal: string;
  durationMin: number;
}

export interface ZoomMeetingResult {
  meetingId: string;
  joinUrl: string;
  passcode: string | null;
  startUrl: string;
}

export async function createZoomMeeting(input: ZoomMeetingInput): Promise<ZoomMeetingResult> {
  const host = encodeURIComponent(process.env.ZOOM_HOST_USER || 'me');
  const res = await zoomRequest('POST', `/users/${host}/meetings`, {
    topic: input.topic.slice(0, 200),
    type: 2, // scheduled meeting
    start_time: input.startLocal,
    timezone: TZ,
    duration: input.durationMin,
    settings: {
      waiting_room: true,
      join_before_host: false,
      mute_upon_entry: true,
    },
  });
  if (!res.ok) throw new Error(`Zoom create meeting failed (${res.status}): ${await res.text()}`);
  const body = (await res.json()) as { id: number; join_url: string; password?: string; start_url: string };
  return { meetingId: String(body.id), joinUrl: body.join_url, passcode: body.password ?? null, startUrl: body.start_url };
}

export async function updateZoomMeeting(meetingId: string, input: ZoomMeetingInput): Promise<void> {
  const res = await zoomRequest('PATCH', `/meetings/${encodeURIComponent(meetingId)}`, {
    topic: input.topic.slice(0, 200),
    start_time: input.startLocal,
    timezone: TZ,
    duration: input.durationMin,
  });
  if (!res.ok) throw new Error(`Zoom update meeting failed (${res.status}): ${await res.text()}`);
}

export async function deleteZoomMeeting(meetingId: string): Promise<void> {
  const res = await zoomRequest('DELETE', `/meetings/${encodeURIComponent(meetingId)}`);
  // Already gone (deleted by hand in Zoom) is the outcome we wanted anyway.
  if (!res.ok && res.status !== 404) throw new Error(`Zoom delete meeting failed (${res.status}): ${await res.text()}`);
}

/** Fresh host link — Zoom's start_url embeds a short-lived token, so the
 *  stored one goes stale; fetch it on demand when staff click "Open as host". */
export async function getZoomStartUrl(meetingId: string): Promise<string> {
  const res = await zoomRequest('GET', `/meetings/${encodeURIComponent(meetingId)}`);
  if (!res.ok) throw new Error(`Zoom get meeting failed (${res.status}): ${await res.text()}`);
  const body = (await res.json()) as { start_url: string };
  return body.start_url;
}
