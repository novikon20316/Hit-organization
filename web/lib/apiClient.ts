// lib/apiClient.ts
// Web counterpart to mobile/src/api/apiClient.ts. Same server, same
// Bearer-token-per-request pattern (server/src/middleware/auth.ts expects
// exactly this) — ported from axios to fetch so the web app needs no extra
// dependency. Add methods here as we port each mobile screen; this file is
// meant to grow the same way the mobile one did.

import { auth } from './firebase';

function getBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL || 'https://hit-organization.onrender.com';
}

export function getApiBaseUrl(): string {
  return getBaseUrl();
}

/** The three categories the administrative coordinator pays supervisors
 *  against — same split as the server's ProcessType (workflowTemplates.ts). */
export type PaymentCategory = 'msc_thesis' | 'msc_project' | 'bsc_project';
export type PaymentCategoryCounts = Record<PaymentCategory, number>;
export type SupervisorPaymentRates = Record<string, Record<PaymentCategory, number | null>>;

/** Generic authenticated file download — fetches a binary response (e.g. an
 *  .xlsx export) with the same Bearer token apiClient attaches automatically
 *  elsewhere, then triggers a browser download. Used for any export/download
 *  endpoint that returns a file rather than JSON. */
export async function downloadAuthenticatedFile(path: string, filename: string, params?: Record<string, string | number | boolean | undefined>): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('Not signed in.');
  const token = await currentUser.getIdToken();

  const url = new URL(path, getBaseUrl());
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
    });
  }

  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}`, 'X-Client-Platform': 'web' } });
  if (!res.ok) throw new Error(`Download failed — HTTP ${res.status}`);

  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

/** Real HTTP-level failure (4xx/5xx/network) — callers can catch this and
 *  branch on `status`, e.g. redirect to /login on 401/403. */
export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

/** The backend's "soft error" convention: HTTP 200 with { success:false,
 *  message }, for non-critical failures (see server/src/middleware/auth.ts
 *  `softError`). Thrown separately from ApiError so callers can tell the two
 *  apart if they need to, but most call sites can catch both the same way. */
export class SoftError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SoftError';
  }
}

// See server/src/services/exceptionalActions.ts.
export interface ExceptionalActionRequest {
  id: string;
  type: 'deadline_override' | 'bulk_deadline_override';
  payload: Record<string, unknown>;
  reason: string;
  facultyId: string;
  requestedBy: string;
  requestedByRole: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionReason: string | null;
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  params?: Record<string, string | number | boolean | undefined | null | string[]>;
  body?: unknown;
  /** Set true when body is already a FormData/Blob/etc — skips JSON headers/stringify. */
  raw?: boolean;
}

function buildUrl(path: string, params?: RequestOptions['params']): string {
  const url = new URL(path, getBaseUrl());
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null) continue;
      if (Array.isArray(value)) {
        value.forEach((v) => url.searchParams.append(key, v));
      } else {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

async function request<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
  const { params, body, raw, headers, ...rest } = options;

  const finalHeaders = new Headers(headers);
  finalHeaders.set('Accept', 'application/json');
  // Lets server/src/middleware/auth.ts enforce the right platform's
  // maintenance flag (web and mobile are toggled independently — see
  // services/maintenanceStatus.ts) for every authenticated request, not
  // just the one-time login-time check in useMaintenanceCheck.ts.
  finalHeaders.set('X-Client-Platform', 'web');
  if (!raw && body !== undefined) {
    finalHeaders.set('Content-Type', 'application/json; charset=utf-8');
  }

  const currentUser = auth.currentUser;
  if (currentUser) {
    try {
      const idToken = await currentUser.getIdToken();
      finalHeaders.set('Authorization', `Bearer ${idToken}`);
    } catch (err) {
      console.error('Failed to retrieve Firebase ID token:', err);
    }
  }

  const res = await fetch(buildUrl(path, params), {
    ...rest,
    headers: finalHeaders,
    body: body === undefined ? undefined : raw ? (body as BodyInit) : JSON.stringify(body),
  });

  const contentType = res.headers.get('content-type') ?? '';
  const data = contentType.includes('application/json') ? await res.json().catch(() => null) : await res.text();

  // Maintenance flipped on mid-session (useMaintenanceCheck only checks
  // once, at login) — bounce to the same /maintenance screen a fresh login
  // would've redirected to, instead of surfacing a raw 503 to whatever
  // screen happened to be mid-fetch. window.location (not next/navigation's
  // router) because this is a plain module, not a component.
  if (res.status === 503 && data && typeof data === 'object' && (data as { error?: string }).error === 'MAINTENANCE_ACTIVE' && typeof window !== 'undefined') {
    const { title, endsAt } = data as { title?: string; endsAt?: string | null };
    const params = new URLSearchParams({ title: title ?? '', endsAt: endsAt ?? '' });
    window.location.href = `/maintenance?${params.toString()}`;
  }

  if (!res.ok) {
    const message =
      (data && typeof data === 'object' && ('error' in data || 'message' in data) &&
        ((data as { error?: string; message?: string }).error ?? (data as { message?: string }).message)) ||
      `Request failed (${res.status})`;
    throw new ApiError(message, res.status, data);
  }

  if (data !== null && typeof data === 'object' && !Array.isArray(data) && (data as { success?: unknown }).success === false) {
    const message = (data as { message?: string }).message ?? 'Request failed';
    throw new SoftError(message);
  }

  return data as T;
}

export const apiClient = {
  get:    <T = unknown>(path: string, options?: RequestOptions) => request<T>(path, { ...options, method: 'GET' }),
  post:   <T = unknown>(path: string, body?: unknown, options?: RequestOptions) => request<T>(path, { ...options, method: 'POST', body }),
  put:    <T = unknown>(path: string, body?: unknown, options?: RequestOptions) => request<T>(path, { ...options, method: 'PUT', body }),
  patch:  <T = unknown>(path: string, body?: unknown, options?: RequestOptions) => request<T>(path, { ...options, method: 'PATCH', body }),
  delete: <T = unknown>(path: string, options?: RequestOptions) => request<T>(path, { ...options, method: 'DELETE' }),

  // ─── 1. USER ───────────────────────────────────────────────────────────────
  /** POST /api/users/sync — student self-registration only; the server
   *  hard-rejects any other role here (see server/src/controllers/userController.ts
   *  syncData). Called once the signed-up account's email is verified. */
  async syncUserProfile(profileData: {
    newUid: string;
    email: string;
    displayName: string;
    role: 'student';
    facultyId: string;
    degreeType: 'bachelors' | 'masters';
    yearOfStudy: number;
    major: string;
    studentId: string;
    phoneNumber: string;
    /** Required only for a 'signup_choice' major (see lib/studentTrack.ts) —
     *  rejected by the server for any other program. */
    chosenTrack?: 'thesis' | 'project';
  }) {
    return request<{ success: boolean; message?: string }>('/api/users/sync', { method: 'POST', body: profileData });
  },

  /** PUBLIC — no auth token exists yet at this point in signup. Fail-fast UX
   *  check only; POST /api/users/sync re-checks authoritatively before an
   *  account is actually created. */
  async verifyStudentEligibility(params: { studentId: string; facultyId: string; degreeType: string; major?: string | null }) {
    return request<{ eligible: boolean; message?: string }>('/api/users/verify-eligibility', { method: 'POST', body: params });
  },

  // ─── 2. MILESTONES ─────────────────────────────────────────────────────────
  async submitMilestone(milestoneId: string, formData: FormData) {
    return request(`/api/milestones/${milestoneId}/submit`, { method: 'POST', body: formData, raw: true });
  },

  async getMilestones(params: {
    projectId?: string;
    supervisorId?: string;
    studentId?: string;
    facultyId?: string;
    statusFilter?: string[];
  }) {
    return request<{ milestones: Array<Record<string, unknown> & { id: string }> }>('/api/milestones', { method: 'GET', params });
  },

  /** PUT /api/milestones/:id — coordinator/faculty_admin/administrative coordinator/
   *  system_admin adjusts a single milestone's due date (matches
   *  UPDATE_MILESTONE_ROLES + updateMilestoneByCoordinator in
   *  milestoneController.ts exactly). Distinct from bulkUpdateMilestoneDueDates
   *  below, which shifts the same date across many projects at once. */
  async updateMilestoneDueDate(id: string, payload: { dueDate: string; reason?: string }) {
    // coordinator/administrative coordinator now get a 202 + pendingApproval
    // instead of an immediate write — see P1 #12 / services/exceptionalActions.ts.
    // faculty_admin/system_admin still get an immediate 200.
    return request<{ success: boolean; message: string; pendingApproval?: boolean; request?: ExceptionalActionRequest }>(
      `/api/milestones/${id}`, { method: 'PUT', body: payload },
    );
  },

  // ─── 3. NOTIFICATIONS ───────────────────────────────────────────────────────
  async triggerNotification(payload: { recipientUid: string; title: string; body: string; data?: Record<string, unknown> }) {
    return request('/api/notifications/trigger', { method: 'POST', body: payload });
  },

  async markNotificationRead(notificationId: string) {
    return request(`/api/notifications/${notificationId}/read`, { method: 'PATCH' });
  },

  async getNotificationFeed() {
    return request<Array<Record<string, unknown> & { id: string; isRead: boolean }>>('/api/notifications/feed', { method: 'GET' });
  },

  async markAllNotificationsRead() {
    return request<{ success: boolean; updatedCount: number }>('/api/notifications/mark-all-read', { method: 'POST' });
  },

  // ─── 3b. CHAT ───────────────────────────────────────────────────────────────
  async getChatDashboard() {
    return request<{ chats: Array<Record<string, unknown> & { chatId: string }>; unreadTotal: number }>('/api/chats/dashboard', {
      method: 'GET',
    });
  },

  async getChatCandidates() {
    return request<{ myRole: string; candidates: Array<{ id: string; name: string; email: string; role: string; facultyId: string }> }>(
      '/api/chats/candidates',
      { method: 'GET' }
    );
  },

  async findOrCreateDirectChat(recipientId: string) {
    return request<{ chatId: string }>('/api/chats', { method: 'POST', body: { recipientId } });
  },

  async sendChatBroadcast(payload: { title: string; message: string }) {
    return request<{ success: boolean; count: number }>('/api/chats/broadcast', { method: 'POST', body: payload });
  },

  /** since — ISO timestamp of the last message already held locally. When
   *  passed, only messages newer than it come back (a steady-state poll
   *  with nothing new returns an empty array instead of re-transferring
   *  the whole thread). Omit for the initial load (most recent page). */
  async getChatMessages(chatId: string, since?: string) {
    return request<Array<{ id: string; type: 'text' | 'image'; text: string; imageUrl: string | null; senderId: string; createdAt: string | null }>>(`/api/chats/${chatId}/messages`, {
      method: 'GET',
      params: since ? { since } : undefined,
    });
  },

  async sendChatMessage(chatId: string, text: string, senderId: string) {
    return request<{ success: boolean }>(`/api/chats/${chatId}/messages`, { method: 'POST', body: { text, senderId } });
  },

  /** Image message — text is an optional caption. imageUrl must already be a
   *  Cloudinary URL from uploadChatImage below; the server independently
   *  re-validates the host, it doesn't trust this by itself. */
  async sendChatImageMessage(chatId: string, imageUrl: string, caption?: string) {
    return request<{ success: boolean }>(`/api/chats/${chatId}/messages`, { method: 'POST', body: { imageUrl, text: caption ?? '' } });
  },

  /** Uploads a chat image directly to Cloudinary (same unsigned preset/cloud
   *  already used elsewhere in this app for CV/transcript/project-file
   *  uploads) and returns the hosted URL to pass to sendChatImageMessage. */
  async uploadChatImage(file: File): Promise<string> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', 'student_uploads');
    const res = await fetch('https://api.cloudinary.com/v1_1/dp7stlfas/image/upload', {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) throw new Error(`Image upload failed — HTTP ${res.status}`);
    const data = await res.json();
    return data.secure_url;
  },

  async getChatMeta(chatId: string) {
    return request<{
      chatId: string;
      type: string;
      lastMessage: string;
      updatedAt: string | null;
      participants: Array<{ id: string; name: string; email: string; role: string; facultyId: string }>;
    }>(`/api/chats/${chatId}/meta`, { method: 'GET' });
  },

  async markChatRead(chatId: string) {
    return request<{ success: boolean }>(`/api/chats/${chatId}/read`, { method: 'POST' });
  },

  async deleteChat(chatId: string) {
    return request<{ success: boolean; message: string }>(`/api/chats/${chatId}`, { method: 'DELETE' });
  },

  // ─── 3c. FEEDBACK ───────────────────────────────────────────────────────────
  async getMyFeedback() {
    return request<{ messages: Array<{ id: string; text: string; classification: 'pending' | 'real' | 'noise'; status: 'open' | 'resolved' | null; createdAt: string | null }> }>(
      '/api/feedback',
      { method: 'GET' }
    );
  },

  async submitFeedback(text: string) {
    return request<{ success: boolean }>('/api/feedback', { method: 'POST', body: { text } });
  },

  // ─── 14. REPORTS ────────────────────────────────────────────────────────────
  /** GET /api/reports/:reportType — export (xlsx download) is a separate blob
   *  fetch, see app/reports/downloadExport.ts, since it isn't JSON. */
  async getReport(reportType: string, filters: Record<string, string | number | boolean | undefined>) {
    return request<{ reportType: string; filters: Record<string, unknown>; data: unknown }>(`/api/reports/${reportType}`, {
      method: 'GET',
      params: filters,
    });
  },

  // ─── 4. LOGIN SECURITY — public/unauthenticated, matches loginSecurity.ts ──
  async reportFailedLogin(email: string, password: string): Promise<{ locked: boolean }> {
    return request('/api/auth/report-failed-login', { method: 'POST', body: { email, password } });
  },

  async getLoginSecurityIncident(code: string) {
    return request(`/api/auth/login-security/${encodeURIComponent(code)}`, { method: 'GET' });
  },

  async confirmLoginSecurityIncident(code: string, decision: 'owner' | 'attacker') {
    return request(`/api/auth/login-security/${encodeURIComponent(code)}/confirm`, { method: 'POST', body: { decision } });
  },

  // ─── 4b. DEFENSE-DAY ACCESS — public/unauthenticated, matches
  // examinerAccessController.ts's getDefenseAccessStatus. Status is always
  // recomputed server-side; this is never trusted/cached client-side. ───────
  async getDefenseAccessStatus(grantCode: string) {
    return request<{
      status: 'not_yet_active' | 'active' | 'expired';
      examinerName?: string;
      defenseDateISO?: string;
      activatesAt?: string;
      expiresAt?: string;
      projectTitleHe?: string;
      projectTitleEn?: string;
      room?: string | null;
      building?: string | null;
      time?: string | null;
      onlineDefenseLink?: string | null;
    }>(`/api/examiner-access/defense/${encodeURIComponent(grantCode)}`, { method: 'GET' });
  },

  // ─── 5. ADMIN (system_admin only) ──────────────────────────────────────────
  async getAdminDashboardSummary() {
    return request<{
      users: Array<Record<string, unknown> & { id: string }>;
      projects: Array<Record<string, unknown> & { id: string }>;
      milestones: Array<Record<string, unknown> & { id: string }>;
      unreadCount: number;
      impersonationEnabled?: boolean;
    }>('/api/admin/dashboard-summary', { method: 'GET' });
  },

  /** system_admin only, temporary debug tool — mints a Firebase custom token
   *  to sign in as `uid`, plus a return token for the admin's own uid so the
   *  client can switch back later. See adminController.ts's impersonateUser. */
  async impersonateUser(uid: string) {
    return request<{ targetToken: string; adminReturnToken: string; targetDisplayName: string; targetEmail: string }>(
      `/api/admin/users/${encodeURIComponent(uid)}/impersonate`,
      { method: 'POST' }
    );
  },

  /** GET /api/admin/staff — faculty_admin/program_head (own faculty) or
   *  grad_school_head (cross-faculty) listing the staff they can manage;
   *  excludes admin-tier accounts and students. See
   *  facultyAdminController.listManagedStaff. */
  async listManagedStaff() {
    return request<{ success: boolean; staff: Array<Record<string, unknown> & { id: string }> }>('/api/admin/staff', { method: 'GET' });
  },

  /** GET /api/admin/students-list — read-only student roster for
   *  faculty_admin (own faculty, any major/degree) and grad_school_head
   *  (masters only, narrowed to their coordinatorScopes majors if any are
   *  set, otherwise the whole faculty). See
   *  studentsListController.listStudentsForScope. */
  async getStudentsList() {
    return request<{
      success: boolean;
      students: Array<{
        id: string; displayName: string; email: string; studentId: string; facultyId: string;
        degreeType: string | null; major: string | null; yearOfStudy: number | null;
        isEligibleForProcess: boolean;
        track: 'thesis' | 'project' | null;
        trackPolicy: 'coordinator_gated' | 'signup_choice' | 'project_only' | null;
        trackLocked: boolean;
        thesisEligibility: { eligible: boolean; average?: number | null; method?: 'manual' | 'average'; threshold?: number | null } | null;
        hasActiveProject: boolean;
        supervisorId: string | null;
        isActive: boolean;
      }>;
    }>('/api/admin/students-list', { method: 'GET' });
  },

  /** system_admin only — accounts currently disabled by the 3-strikes
   *  failed-login flow (server/src/services/loginSecurity.ts), still
   *  awaiting either the owner's own email link or an admin lifting it. */
  async getLockedUsers() {
    return request<{ lockouts: Array<{ code: string; uid: string; email: string; displayName: string; ip: string; location: string; createdAt: string }> }>(
      '/api/admin/login-security/locked', { method: 'GET' }
    );
  },

  /** Re-enables the account, issues + emails a fresh temp password, clears
   *  the incident — same effect as the owner's own "yes, this was me" link. */
  async liftLoginLockout(code: string) {
    return request<{ success: boolean; message: string }>(`/api/admin/login-security/${encodeURIComponent(code)}/lift`, { method: 'POST' });
  },

  async createAdminUser(payload: {
    displayName: string;
    email: string;
    phoneNumber?: string | null;
    role: string;
    facultyId: string;
    degreeType?: 'bachelors' | 'masters' | null;
    yearOfStudy?: number | null;
    major?: string | null;
    studentId?: string | null;
    /** Left blank to let the server auto-generate one via generateTempPassword(). */
    tempPassword?: string;
    /** Only meaningful when role is supervisor/secondary_supervisor — see
     *  adminController.ts's createAdminUser. Omitted/empty = unrestricted. */
    assignedMajors?: string[];
  }) {
    return request<{ success: boolean; id: string; tempPassword: string; message: string }>('/api/admin/users/create', {
      method: 'POST',
      body: payload,
    });
  },

  async updateUserRoleAdmin(
    userId: string,
    payload: {
      role: string;
      roles?: string[];
      facultyId?: string;
      assignedMajors?: string[];
      /** Narrows a CROSS-FACULTY account's (facultyId 'all' — e.g.
       *  system_admin) supervisor-like role down to specific faculties. By
       *  default such an account is a supervisor option in EVERY faculty;
       *  this only ever restricts that, never grants beyond it. Empty/unset
       *  means "available everywhere" — the common case. Not meaningful for
       *  a plain single-faculty supervisor. See adminController.ts's
       *  getSupervisorsList. */
      supervisorFacultyIds?: string[];
      /** Same idea, independently, for the `secondary_supervisor` role — see
       *  server/src/controllers/adminController.ts's getSupervisorsList. */
      secondarySupervisorFacultyIds?: string[];
      /** Same additive/restrictive idea, one field per role — see
       *  lib/roles.ts's UserDoc for the full explanation. */
      facultyAdminFacultyIds?: string[];
      programHeadFacultyIds?: string[];
      gradSchoolHeadFacultyIds?: string[];
      internalExaminerFacultyIds?: string[];
      /** system_admin, or a delegate (faculty_admin/program_head/
       *  grad_school_head) granting within their own scope — see
       *  server/src/config/permissionScopes.ts's DELEGATE_RESTRICTED_ACTIONS
       *  for what a delegate still can't grant. */
      permissionRules?: import('./permissions').ScopeRule[];
      coordinatorScopes?: import('./permissions').CoordinatorScope[];
    }
  ) {
    return request<{ success: boolean; message: string }>(`/api/admin/users/${userId}/role-update`, {
      method: 'POST',
      body: payload,
    });
  },

  async toggleUserStatusAdmin(userId: string, isActive: boolean) {
    return request<{ success: boolean; message: string }>(`/api/admin/users/${userId}/toggle-status`, {
      method: 'POST',
      body: { isActive },
    });
  },

  async disableUser2FA(userId: string) {
    return request<{ success: boolean; message: string }>(`/api/admin/users/${userId}/disable-2fa`, { method: 'POST' });
  },

  async eraseUserBySystemAdmin(userId: string) {
    return request<{ success: boolean; message: string }>(`/api/admin/users/${userId}/erase`, { method: 'POST' });
  },

  /** POST /api/admin/users/:id/reset-password — system_admin only. Generates
   *  a new temp password (returned once) and forces a change on next login —
   *  see adminController.ts's resetUserPasswordAdmin. */
  async resetUserPasswordAdmin(userId: string) {
    return request<{ success: boolean; tempPassword: string; message: string }>(`/api/admin/users/${userId}/reset-password`, { method: 'POST' });
  },

  /** POST /api/admin/audit-log/delete — pass either `{ ids }` for a
   *  selected-rows delete or `{ all: true }` to wipe the entire audit log. */
  async deleteAuditLogEntries(payload: { ids?: string[]; all?: boolean }) {
    return request<{ success: boolean; deleted: number }>('/api/admin/audit-log/delete', { method: 'POST', body: payload });
  },

  /** POST /api/admin/projects — system_admin, faculty_admin, grad_school_head,
   *  administrative coordinator. One or more faculties fan out into one project
   *  doc each (see adminController.ts's createAdminProject) — `ids` has one
   *  entry per faculty selected; `id` is just `ids[0]`, kept for callers that
   *  only ever create a single-faculty project. */
  async createAdminProject(payload: {
    /** One or more supervisors (e.g. a primary + secondary) — server writes
     *  supervisorIds[0]/[1] to the back-compat supervisorId/
     *  secondarySupervisorId fields, plus the full array. */
    supervisorIds: string[];
    facultyIds: string[];
    titleHe: string;
    titleEn: string;
    descriptionHe: string;
    descriptionEn: string;
    degreeTypes: ('bachelors' | 'masters')[];
    projectTypes: ('project' | 'thesis')[];
    maxStudents: number;
    requiredSkills: string[];
    /** minGrade is optional per subject — omitted means "must have taken the
     *  course," no grade threshold. See PrerequisitesEditor. */
    prerequisites: Array<{ subject: string; minGrade?: number }>;
    /** Optional single major shared across every selected faculty — see
     *  adminController.ts's createAdminProject. Omitted = open to every
     *  major in each faculty. */
    major?: string;
  }) {
    return request<{ success: boolean; id: string; ids: string[]; message: string }>('/api/admin/projects', { method: 'POST', body: payload });
  },

  /** GET /api/permissions/my-grants?action=X — faculties the calling user may
   *  exercise `action` in (see scopeAuthorization.ts's grantedFacultyIdsFor).
   *  Used to populate the faculty checkbox options in the Add Project flow. */
  async getMyGrants(action: string) {
    return request<{ facultyIds: string[] }>(`/api/permissions/my-grants?action=${encodeURIComponent(action)}`, { method: 'GET' });
  },

  /** Archives the project (see server's services/projectErasure.ts) — never
   *  a permanent delete, always restorable from the Archived tab. */
  async deleteAdminProject(projectId: string) {
    return request<{ success: boolean; message: string }>(`/api/admin/projects/${projectId}`, { method: 'DELETE' });
  },

  // ─── Project erasure/archive protocol (coordinator + system_admin only,
  // except requestProjectErasure above which is supervisor-only) ────────────
  async listPendingErasureRequests() {
    return request<{ requests: Array<{
      id: string; projectId: string; projectTitleHe: string; projectTitleEn: string;
      facultyId: string; requestedBy: string; requestedByRole: string; reason: string;
      status: 'pending' | 'approved' | 'rejected'; createdAt: string | null;
    }> }>(`/api/projects/erasure-requests/pending`, { method: 'GET' });
  },

  async decideErasureRequest(requestId: string, decision: 'approved' | 'rejected', reason?: string) {
    return request<{ success: boolean }>(`/api/projects/erasure-requests/${requestId}/decide`, {
      method: 'POST',
      body: { decision, reason },
    });
  },

  async listArchivedProjects() {
    return request<{ projects: Array<{
      id: string; titleHe: string; titleEn: string; facultyId: string;
      supervisorId: string; supervisorName: string; enrolledStudentIds: string[];
      enrolledStudentNames: string[];
      deletedAt: string | null; erasedBy: string | null; milestones: any[];
    }> }>(`/api/projects/archived`, { method: 'GET' });
  },

  async restoreProject(projectId: string) {
    return request<{ success: boolean; message: string }>(`/api/projects/${projectId}/restore`, { method: 'POST' });
  },

  /** POST /api/admin/projects/:id/enroll-student — distinct from
   *  enrollStudentToProject below (that one is faculty_admin's /enroll path). */
  async enrollStudentAdmin(projectId: string, studentId: string) {
    return request<{ success: boolean; message: string }>(`/api/admin/projects/${projectId}/enroll-student`, {
      method: 'POST',
      body: { studentId },
    });
  },

  /** GET /api/admin/milestones?projectId= — note the controller returns the
   *  bare array, not wrapped in an object. */
  async getAdminProjectMilestones(projectId: string) {
    return request<Array<Record<string, unknown> & { id: string; projectId: string }>>('/api/admin/milestones', {
      method: 'GET',
      params: { projectId },
    });
  },

  /** GET /api/admin/supervisors?facultyIds=a&facultyIds=b — staff holding the
   *  'supervisor' role (primary or among additionalRoles/roles) in any of the
   *  given faculties. Returns [] without a request when facultyIds is empty —
   *  a supervisor list is only meaningful once at least one faculty is
   *  selected. */
  async getAdminSupervisors(facultyIds: string[]) {
    if (facultyIds.length === 0) return [];
    return request<Array<Record<string, unknown> & { id: string; displayName: string }>>('/api/admin/supervisors', {
      method: 'GET',
      params: { facultyIds },
    });
  },

  /** GET /api/admin/defense-access-grants?status= — external examiners who
   *  missed their defense-day window; status is the recomputed
   *  computedStatus, not necessarily the stored one. */
  async listDefenseAccessGrants(status?: 'not_yet_active' | 'active' | 'expired') {
    return request<{
      grants: Array<{
        code: string;
        examinerName: string;
        examinerEmail: string;
        defenseDateISO: string;
        computedStatus: 'not_yet_active' | 'active' | 'expired';
        projectId?: string;
      }>;
    }>('/api/admin/defense-access-grants', { method: 'GET', params: { status } });
  },

  async extendDefenseAccessGrant(grantCode: string, payload: { newExpiresAtISO: string; reason?: string }) {
    return request<{ success: boolean; message: string }>(`/api/admin/defense-access-grants/${encodeURIComponent(grantCode)}/extend`, {
      method: 'POST',
      body: payload,
    });
  },

  /** GET /api/feedback/admin?status=open|resolved — system_admin only. */
  async getAdminFeedback(status: 'open' | 'resolved') {
    return request<{
      messages: Array<{
        id: string;
        userId: string;
        userName: string;
        role: string;
        text: string;
        aiReasoning: string | null;
        status: 'open' | 'resolved';
        createdAt: string | null;
      }>;
    }>('/api/feedback/admin', { method: 'GET', params: { status } });
  },

  async resolveFeedback(id: string) {
    return request<{ success: boolean }>(`/api/feedback/admin/${id}/resolve`, { method: 'PATCH' });
  },

  /** GET /api/system/maintenance-status?platform= — current on/off state for
   *  one platform, used by the admin panel to show what's live before/after
   *  toggling (not the same call useMaintenanceCheck makes at login). */
  async getMaintenanceStatusForPlatform(platform: 'web' | 'mobile') {
    return request<{ isActive: boolean; title: string; endsAt: string | null }>('/api/system/maintenance-status', {
      method: 'GET',
      params: { platform },
    });
  },

  /** POST /api/admin/system/maintenance — see maintenanceController.ts for
   *  the exact body shape (shutdownAt/maintenanceDurMs are both ms values,
   *  computed client-side from the warn/duration pickers). platform is
   *  which app this activates maintenance for — web and mobile are
   *  independent (see services/maintenanceStatus.ts). */
  async updateMaintenanceStatus(payload: { platform: 'web' | 'mobile'; title: string; shutdownAt: number; maintenanceDurMs: number; broadcastEnabled: boolean }) {
    return request<{ ok: boolean; platform: string }>('/api/admin/system/maintenance', { method: 'POST', body: payload });
  },

  /** DELETE /api/admin/system/maintenance — ends maintenance for one
   *  platform immediately, without waiting for its scheduled endsAt. */
  async deactivateMaintenanceStatus(platform: 'web' | 'mobile') {
    return request<{ ok: boolean; platform: string }>('/api/admin/system/maintenance', { method: 'DELETE', body: { platform } });
  },

  async getAcademicCalendar() {
    return request<{
      fallSemesterStartMonth: number;
      fallSemesterStartDay: number;
      springSemesterStartMonth: number;
      springSemesterStartDay: number;
    }>('/api/admin/academic-calendar', { method: 'GET' });
  },

  async updateAcademicCalendar(payload: {
    fallSemesterStartMonth: number;
    fallSemesterStartDay: number;
    springSemesterStartMonth: number;
    springSemesterStartDay: number;
  }) {
    return request<{
      fallSemesterStartMonth: number;
      fallSemesterStartDay: number;
      springSemesterStartMonth: number;
      springSemesterStartDay: number;
    }>('/api/admin/academic-calendar', { method: 'PUT', body: payload });
  },

  /** Any authenticated user — labels are shown wherever a student's status
   *  appears, not just to whoever can edit the option lists. */
  async getStudentStatusOptions() {
    return request<{
      primary: Array<{ key: string; labelHe: string; labelEn: string }>;
      secondary: Array<{ key: string; labelHe: string; labelEn: string }>;
    }>('/api/student-statuses', { method: 'GET' });
  },

  /** system_admin only — whole-list replace per axis (either key omitted
   *  leaves that axis unchanged). */
  async updateStudentStatusOptions(payload: {
    primary?: Array<{ key?: string; labelHe: string; labelEn: string }>;
    secondary?: Array<{ key?: string; labelHe: string; labelEn: string }>;
  }) {
    return request<{
      primary: Array<{ key: string; labelHe: string; labelEn: string }>;
      secondary: Array<{ key: string; labelHe: string; labelEn: string }>;
    }>('/api/admin/student-statuses', { method: 'PUT', body: payload });
  },

  /** system_admin (any student) or faculty_admin (own faculty only — server
   *  enforces this, a 403 comes back otherwise). Either field omitted leaves
   *  that one unchanged; pass null to clear it. */
  async setStudentStatus(studentId: string, payload: { primaryStatus?: string | null; secondaryStatus?: string | null }) {
    return request<{ success: boolean; message: string }>(`/api/admin/users/${studentId}/status`, {
      method: 'POST',
      body: payload,
    });
  },

  // ─── 6. COORDINATOR (coordinator / administrative coordinator / system_admin) ─
  async getCoordinatorDashboard() {
    return request<{
      facultyId: string;
      projects: Array<Record<string, unknown> & { id: string }>;
      pendingMilestones: Array<Record<string, unknown> & { id: string }>;
      unreadCount: number;
      stats: { totalProjects: number; activeProjects: number; pendingReviewCount: number };
    }>('/api/coordinator/dashboard', { method: 'GET' });
  },

  async getInternalExaminerList() {
    return request<Array<Record<string, unknown> & { id: string }>>('/api/examiner/get-list', { method: 'GET' });
  },

  async getCoordinatorExaminerRecommendations() {
    return request<{ recommendations: Array<Record<string, unknown> & { id: string }> }>(
      '/api/coordinator/examiner-recommendations',
      { method: 'GET' }
    );
  },

  async coordinatorApproveMilestone(milestoneId: string, comment?: string) {
    return request<{ success: boolean; message: string }>(`/api/coordinator/${milestoneId}/approve`, {
      method: 'POST',
      body: comment ? { comment } : undefined,
    });
  },

  async coordinatorRejectMilestone(milestoneId: string, reason: string) {
    return request<{ success: boolean; message: string }>(`/api/coordinator/${milestoneId}/reject`, {
      method: 'POST',
      body: { reason },
    });
  },

  async assignExaminers(
    projectId: string,
    payload: {
      examiners: Array<
        | { type: 'internal'; uid: string }
        | { type: 'external'; name: string; email: string; institution: string }
      >;
      milestoneId?: string;
      studentIds?: string[];
      /** Language for the external-examiner access-link email. Defaults to 'he' server-side. */
      lang?: 'he' | 'en';
      /** Fractions (0-1) — supervisorWeight + examiners.length *
       *  examinerWeight must sum to 1. Written onto the milestone's own
       *  gradeWeights field (see gradeEngine.ts) so the final grade is
       *  actually computed with them instead of the default split. Every
       *  examiner slot shares the same weight (see IdentityGradeWeights) —
       *  there's no per-slot asymmetric weighting. Requires milestoneId. */
      weights?: { supervisorWeight: number; examinerWeight: number };
    }
  ) {
    return request<{ message: string; internalAssigned: string[]; externalNotified: unknown[]; externalFailed: unknown[] }>(
      `/api/coordinator/projects/${projectId}/assign-examiners`,
      { method: 'POST', body: payload }
    );
  },

  async approveExaminerRecommendation(id: string) {
    return request<{ success: boolean; message: string }>(`/api/coordinator/examiner-recommendations/${id}/approve`, {
      method: 'POST',
    });
  },

  async rejectExaminerRecommendation(id: string) {
    return request<{ success: boolean; message: string }>(`/api/coordinator/examiner-recommendations/${id}/reject`, {
      method: 'POST',
    });
  },

  /** GET /api/projects/ActiveProjects (unusual casing — matches the server
   *  route exactly). Server-side role check allows coordinator / faculty_admin /
   *  admin / system_admin — administrative coordinator can still get a 403
   *  here even though she's allowed onto some pages that call this; callers
   *  should treat that as a soft failure (empty state), not a crash. */
  async getActiveProjects() {
    return request<{ InProgress: Array<Record<string, unknown> & { id: string }> }>('/api/projects/ActiveProjects', {
      method: 'GET',
    });
  },

  /** POST /api/coordinator/milestones/:milestoneId/resolve-date-conflict —
   *  either auto-pick a date keeping the same two examiners, or replace one
   *  examiner (by its `${type}:${ref}` panel key) and restart date matching
   *  for just them. See coordinatorController.ts resolveDefenseDateConflict. */
  async resolveDefenseDateConflict(
    milestoneId: string,
    payload:
      | { action: 'keep_examiners' }
      | {
          action: 'replace_examiner';
          replacedExaminerKey: string;
          newExaminer: { type: 'internal'; uid: string } | { type: 'external'; name: string; email: string; institution: string };
        }
  ) {
    return request<{ success: boolean; message: string; date?: string }>(
      `/api/coordinator/milestones/${milestoneId}/resolve-date-conflict`,
      { method: 'POST', body: payload }
    );
  },

  /** GET /api/staff/:uid/deadlines — role-check server-side now includes
   *  supervisor/coordinator/faculty_admin (see staffController.ts
   *  getDeadLines); caller must pass their OWN uid, the server 403s
   *  otherwise. Always returns `{ deadlines }` — never `.rows` (that was a
   *  mobile-only bug, already fixed there; don't replicate it here). Each
   *  deadline is a raw milestone doc spread onto `{ id, deadline }`, so the
   *  exact fields present vary — treat everything but `id` as optional. */
  async getStaffDeadlines(uid: string) {
    return request<{ deadlines: Array<Record<string, unknown> & { id: string }> }>(`/api/staff/${uid}/deadlines`, {
      method: 'GET',
    });
  },

  /** Whatever examiner-invitation / final-grade sign-offs the calling user is
   *  currently authorized to act on, regardless of role — see
   *  services/pendingSignoffs.ts. Always "my own" (derived from the auth
   *  token), no uid param. */
  async getMyPendingSignoffs() {
    return request<{
      items: Array<{
        id: string;
        type: 'examiners' | 'final_grade';
        studentName: string;
        facultyId: string;
        title: string;
        submittedAt: string;
        urgency: 'low' | 'medium' | 'high';
      }>;
    }>('/api/staff/pending-signoffs', { method: 'GET' });
  },

  // ─── 7. STUDENT ─────────────────────────────────────────────────────────────
  async getMyProfile() {
    return request<Record<string, unknown>>('/api/users/profile', { method: 'GET' });
  },

  async logout() {
    return request<{ success?: boolean }>('/api/users/logout', { method: 'POST' });
  },

  /** POST /api/users/complete-onboarding-tour — permanently hides the
   *  first-login onboarding tour (see components/onboarding/OnboardingTour.tsx). */
  async completeOnboardingTour() {
    return request<{ success?: boolean }>('/api/users/complete-onboarding-tour', { method: 'POST' });
  },

  /** POST /api/users/delete-account/request — starts the 14-day grace
   *  period (server/src/services/accountDeletion.ts). Server rejects this
   *  with 401 unless the ID token's auth_time is under 5 minutes old, so
   *  callers must reauthenticate (see components/DeleteAccountModal.tsx)
   *  and call `getIdToken(true)` right before this. A 409 means an active
   *  dependency blocks deletion (active project/advisees/last admin, etc) —
   *  the response body's `error` has the human-readable reason. */
  async requestAccountDeletion() {
    return request<{ success?: boolean }>('/api/users/delete-account/request', { method: 'POST' });
  },

  /** POST /api/users/delete-account/cancel — always allowed, no reauth
   *  required, regardless of deletionReason (self-requested or graduation
   *  sweep). */
  async cancelAccountDeletion() {
    return request<{ success?: boolean }>('/api/users/delete-account/cancel', { method: 'POST' });
  },

  async getStudentProject(projectId: string) {
    return request<Record<string, unknown> & { id: string }>(`/api/student/projects/${projectId}`, { method: 'GET' });
  },

  async getThesisTemplate() {
    return request<{ url: string; fileName: string }>('/api/student/thesis-template', { method: 'GET' });
  },

  async getPendingApplications() {
    return request<{ applications: Array<Record<string, unknown> & { id: string }> }>('/api/applications/pending', {
      method: 'GET',
    });
  },

  /** The transcript/CV URLs from the student's most recent application
   *  (any status) — lets the apply modal offer "reuse last file" instead of
   *  forcing a fresh upload every time. Empty strings if there's no prior
   *  application. */
  async getLastUploadedFiles() {
    return request<{ transcriptUrl: string; cvUrl: string }>('/api/applications/last-uploaded-files', { method: 'GET' });
  },

  async applyToProject(payload: { projectId: string; transcriptUrl: string; cvUrl: string; notes: string; selectedProjectType?: 'project' | 'thesis' }) {
    return request<{ success?: boolean; message?: string }>('/api/applications/apply', { method: 'POST', body: payload });
  },

  async withdrawApplication(applicationId: string) {
    return request<{ success?: boolean }>(`/api/applications/${applicationId}/withdraw`, { method: 'POST' });
  },

  /** What a student with no active project should see first — browse/apply
   *  to individually-posted projects, or browse/choose a supervisor instead
   *  — resolved from the approved workflow-template for the student's own
   *  faculty+degree. See workflowTemplates.ts's resolveFirstStepMode. */
  async getFirstStepMode() {
    return request<{ firstStepMode: 'browse_projects' | 'choose_supervisor'; supervisorSelectionRequiresApproval: boolean }>(
      '/api/student/first-step-mode', { method: 'GET' }
    );
  },

  /** Supervisor-grouped view of the student's eligible open projects —
   *  used by BrowseSupervisors.tsx when getFirstStepMode() resolves to
   *  'choose_supervisor'. */
  async getBrowseSupervisors() {
    return request<{
      supervisors: Array<{
        supervisorId: string; supervisorName: string;
        projects: Array<{
          id: string; titleHe: string; titleEn: string; descriptionHe: string; descriptionEn: string;
          projectTypes: string[]; major: string | null; remainingCapacity: number;
        }>;
      }>;
    }>('/api/student/browse-supervisors', { method: 'GET' });
  },

  /** Self-service, no-application, no-approval enrollment — only usable when
   *  getFirstStepMode() resolved supervisorSelectionRequiresApproval: false.
   *  Re-checked server-side regardless of what the client believes. */
  async joinProjectDirect(projectId: string) {
    return request<{ success?: boolean; message?: string }>('/api/student/join-project-direct', { method: 'POST', body: { projectId } });
  },

  /** A supervisor's approval only puts an application into
   *  'awaiting_student_confirmation' — this is the student's actual decision
   *  to start (or not) that project. 'yes' enrolls them and auto-closes
   *  every other pending/approved application they have; 'no' just declines
   *  this one and notifies the supervisor, leaving everything else as-is. */
  async confirmApplicationStart(applicationId: string, decision: 'yes' | 'no') {
    return request<{ success?: boolean; message?: string }>(`/api/applications/${applicationId}/confirm-start`, {
      method: 'POST',
      body: { decision },
    });
  },

  async getInfoFiles() {
    return request<{
      files: Array<{
        id: string; titleHe: string; titleEn: string; fileUrl: string; fileName: string;
        facultyIds: string[]; majors: string[]; degreeTypes: string[];
        /** Non-empty means this file targets specific project(s) instead of
         *  (mutually exclusive with) the faculty/major/degree axes above. */
        projectIds: string[];
        /** Only meaningful when projectIds is non-empty — the milestone type
         *  this file becomes visible from onward; null means visible as soon
         *  as the student is enrolled in one of projectIds. */
        milestoneType: string | null;
        /** Manual staff on/off switch, independent of the milestone gate —
         *  both must pass for a student to see the file. */
        isVisible: boolean;
      }>;
    }>('/api/info-files', { method: 'GET' });
  },

  /** system_admin, coordinator, or supervisor (checked server-side) — a
   *  coordinator-mounted /api/coordinator/info-files duplicate of this same
   *  handler used to exist too, but nothing ever called it; removed rather
   *  than left as an unreachable second URL for the same feature. A
   *  supervisor must include projectIds (their own projects only, verified
   *  server-side) — they have no faculty-wide scope. */
  async uploadInfoFile(formData: FormData) {
    return request<{ success: boolean; id: string; fileUrl: string }>('/api/admin/info-files', { method: 'POST', body: formData, raw: true });
  },

  /** PATCH /api/admin/info-files/:id — replace the file's content and/or
   *  toggle its visibility in place (title/scope aren't editable here; that
   *  means delete + re-upload). formData may include a `file` and/or
   *  `isVisible` ('true'/'false'). Same role/ownership rules as delete. */
  async updateInfoFile(id: string, formData: FormData) {
    return request<{ success: boolean; message: string }>(`/api/admin/info-files/${id}`, { method: 'PATCH', body: formData, raw: true });
  },

  async deleteInfoFile(id: string) {
    return request<{ success: boolean; message: string }>(`/api/admin/info-files/${id}`, { method: 'DELETE' });
  },

  /** Free-text faculty procedures/announcements — companion to info-files'
   *  file attachments (requirements doc section 15). */
  async getFacultyContent() {
    return request<{
      items: Array<{
        id: string; type: 'procedure' | 'announcement'; titleHe: string; titleEn: string;
        bodyHe: string; bodyEn: string; facultyIds: string[]; majors: string[]; degreeTypes: string[];
        createdAt: string | null;
      }>;
    }>('/api/faculty-content', { method: 'GET' });
  },

  async createFacultyContent(payload: {
    type: 'procedure' | 'announcement';
    titleHe: string; titleEn: string; bodyHe: string; bodyEn: string;
    facultyIds: string[]; majors: string[]; degreeTypes: string[];
  }) {
    return request<{ success: boolean; id: string }>('/api/admin/faculty-content', { method: 'POST', body: payload });
  },

  async deleteFacultyContent(id: string) {
    return request<{ success: boolean; message: string }>(`/api/admin/faculty-content/${id}`, { method: 'DELETE' });
  },

  /** system_admin or administrative coordinator only (checked server-side). */
  async searchStudents(q: string) {
    return request<{
      students: Array<{
        id: string; displayName: string; email: string; studentId: string; facultyId: string;
        degreeType: string | null; major: string | null; yearOfStudy: number | null;
        isEligibleForProcess: boolean; academicYearHeld: boolean; academicYearHeldReason: string | null;
        completedCourses: { subject: string; grade?: number }[];
        trackPolicy: 'coordinator_gated' | 'signup_choice' | 'project_only';
        track: 'thesis' | 'project' | null;
        trackLocked: boolean;
        thesisEligibility: { eligible: boolean } | null;
      }>;
    }>('/api/admin/students/search', { method: 'GET', params: { q } });
  },

  async updateStudentAcademicYear(studentId: string, payload: { yearOfStudy?: number; heldBack?: boolean; reason?: string }) {
    return request<{ success: boolean; message: string }>(`/api/admin/users/${studentId}/academic-year`, { method: 'PUT', body: payload });
  },

  /** system_admin-only escape hatch — free-form override of a student's
   *  thesis/project track/lock/eligibility, bypassing the normal business
   *  rules (see server/src/services/studentTrack.ts's adminOverrideStudentTrack). */
  async overrideStudentTrack(
    studentId: string,
    payload: { track?: 'thesis' | 'project' | null; trackLocked?: boolean; thesisEligible?: boolean | null }
  ) {
    return request<{ success: boolean }>(`/api/admin/users/${studentId}/track-override`, { method: 'PUT', body: payload });
  },

  /** PUT /api/admin/users/:id/completed-courses — system_admin only. Manual
   *  stopgap for editing a student's completed courses + grades directly;
   *  the normal path is automatic extraction from transcripts during
   *  application review (see server/src/controllers/applicationController.ts). */
  async updateStudentCompletedCoursesAsAdmin(studentId: string, completedCourses: { subject: string; grade: number }[]) {
    return request<{ success: boolean; completedCourses: { subject: string; grade: number }[] }>(
      `/api/admin/users/${studentId}/completed-courses`,
      { method: 'PUT', body: { completedCourses } }
    );
  },

  // ─── Bulk role-based permissions — apply a scope+view+actions grant to
  // EVERY user of a role at once, instead of the per-user checkbox editor
  // (PermissionsEditorModal.tsx). system_admin: unscoped. faculty_admin:
  // locked server-side to their own faculty. grad_school_head: cross-faculty
  // by design. ─────────────────────────────────────────────────────────────
  async getUsersByRole(role: string) {
    return request<{ users: Array<{ id: string; displayName: string; facultyId: string | null }> }>(
      '/api/admin/permissions/users-by-role', { method: 'GET', params: { role } }
    );
  },

  async applyPermissionsToRole(payload: {
    targetRole: string;
    facultyId?: string;
    major?: string;
    degreeLevel?: 'bachelors' | 'masters';
    processType?: 'thesis' | 'project';
    view: string[];
    actions: string[];
  }) {
    return request<{ success: boolean; affectedCount: number; message?: string }>(
      '/api/admin/permissions/apply-to-role', { method: 'POST', body: payload }
    );
  },

  // ─── 15. BULK IMPORT/EXPORT (admin/coordinator) ────────────────────────────
  async importStaffExcel(scope: 'admin' | 'coordinator', formData: FormData) {
    const path = scope === 'admin' ? '/api/admin/staff/import' : '/api/coordinator/staff/import';
    return request<{
      summary: { totalRows: number; created: number; skipped: number; failed: number; details: Array<{ row: number; email: string; status: string; reason?: string }> };
    }>(path, { method: 'POST', body: formData, raw: true });
  },

  async importStudentRosterExcel(scope: 'admin' | 'coordinator', formData: FormData) {
    const path = scope === 'admin' ? '/api/admin/student-roster/import' : '/api/coordinator/student-roster/import';
    return request<{
      summary: { totalRows: number; imported: number; skipped: number; failed: number; details: Array<{ row: number; studentId: string; status: string; reason?: string }> };
    }>(path, { method: 'POST', body: formData, raw: true });
  },

  /** GET /api/admin/student-roster — the pre-registration allowlist
   *  coordinators/system_admin upload before students can self-register
   *  (see server/src/services/studentRoster.ts); system_admin only. */
  async listStudentRoster(filter?: { facultyId?: string; degreeType?: 'bachelors' | 'masters'; used?: boolean; q?: string }) {
    return request<{
      success: boolean;
      entries: Array<{
        id: string;
        studentId: string;
        facultyId: string;
        degreeType: 'bachelors' | 'masters';
        major: string | null;
        fullName: string;
        used: boolean;
        usedByUid: string | null;
        usedAt: string | null;
        uploadedBy: string;
        uploadedAt: string;
      }>;
    }>('/api/admin/student-roster', { method: 'GET', params: { facultyId: filter?.facultyId, degreeType: filter?.degreeType, used: filter?.used, q: filter?.q } });
  },

  /** PATCH /api/admin/student-roster/:docId — edit a roster entry, or set
   *  `used: false` to re-open an ID for registration (e.g. after deleting a
   *  mistakenly-created account). */
  async updateStudentRosterEntry(
    docId: string,
    updates: Partial<{ fullName: string; major: string | null; used: boolean; facultyId: string; degreeType: 'bachelors' | 'masters'; studentId: string }>
  ) {
    return request<{ success: boolean }>(`/api/admin/student-roster/${encodeURIComponent(docId)}`, { method: 'PATCH', body: updates });
  },

  async deleteStudentRosterEntry(docId: string) {
    return request<{ success: boolean }>(`/api/admin/student-roster/${encodeURIComponent(docId)}`, { method: 'DELETE' });
  },

  // ─── 8. SUPERVISOR ──────────────────────────────────────────────────────────
  async getSupervisorDashboard() {
    return request<{
      success: boolean;
      supervisorId: string;
      supervisorName: string;
      facultyId: string;
      myProjects: Array<Record<string, unknown> & { id: string }>;
      applications: Array<Record<string, unknown> & { id: string }>;
      pendingGrades: Array<Record<string, unknown> & { id: string }>;
    }>('/api/supervisor/dashboard', { method: 'GET' });
  },

  async handleApplicationDecision(payload: {
    applicationId: string;
    decision: 'approved' | 'rejected' | 'meeting_requested';
    notes?: string;
  }) {
    return request<{ success: boolean; message: string }>('/api/supervisor/applications/decision', { method: 'POST', body: payload });
  },

  async updateSupervisorProject(
    projectId: string,
    payload: {
      titleHe: string;
      titleEn: string;
      descriptionHe: string;
      descriptionEn: string;
      degreeType: string;
      projectType: string;
      requiredSkills: string[];
      /** Kept in sync with the legacy `NumberOfStudents` field server-side —
       *  see updateSupervisorProject's own comment. Also callable by a
       *  coordinator/faculty_admin/administrative_secretary/system_admin
       *  whose scope covers this project's faculty, not just its own
       *  supervisor — see withinCoordinatorScope in the same handler. */
      maxStudents?: number;
    }
  ) {
    return request<{ success?: boolean; message?: string }>(`/api/supervisor/projects/${projectId}`, { method: 'PUT', body: payload });
  },

  async requestProjectErasure(projectId: string, reason: string) {
    return request<{ success: boolean; request: unknown }>(`/api/projects/${projectId}/request-erasure`, { method: 'POST', body: { reason } });
  },

  async getSupervisorProjectDetail(projectId: string) {
    return request<{
      templateMilestones: Array<{
        type: string; nameHe: string; nameEn: string; order: number;
        dateMode?: 'offset' | 'fixed'; dueDaysFromStart: number; fixedDate?: string;
        requiresExaminers: boolean;
        percentOfFinalGrade?: number;
        staffRecordMode?: 'none' | 'upload_or_form';
        staffFormFields?: Array<{ key: string; labelHe: string; labelEn: string; type: 'text' | 'textarea' | 'date' | 'number' | 'table'; required: boolean }>;
        finalGradeComponents?: {
          supervisorEvaluation: { components: Array<{ key: string; labelHe: string; labelEn: string; maxScore: number; weight: number }>; weight: number };
          examinerProjectEvaluation: { components: Array<{ key: string; labelHe: string; labelEn: string; maxScore: number; weight: number }>; weight: number };
          examinerDefenseEvaluation: { components: Array<{ key: string; labelHe: string; labelEn: string; maxScore: number; weight: number }>; weight: number };
        };
      }>;
      students: Array<{
        studentId: string;
        studentName: string;
        /** Weighted across every milestone by the template's own
         *  percentOfFinalGrade per type — see gradeEngine.ts's
         *  computeProjectFinalGrade. null until every nonzero-weighted
         *  milestone is graded. */
        overallFinalGrade: number | null;
        milestones: Array<{
          id: string | null;
          type: string;
          status: string;
          dueDate: string | null;
          submittedAt: string | null;
          defenseDate: string | null;
          fileUrls: string[];
          submissionNote: string;
          staffRecordMode: 'none' | 'upload_or_form' | null;
          staffRecordSubmitted: boolean;
          hasFinalGradeComponents: boolean;
          supervisorEvaluationSubmitted: boolean;
          autoCalculatedFinalGrade: number | null;
          finalGrade: number | null;
          /** The supervisor's own last-submitted score — distinct from
           *  finalGrade (which may blend in examiner scores). */
          supervisorScore: number | null;
          gradeApproved: boolean;
          gradeOverrideStatus: 'pending' | 'approved' | 'rejected' | null;
        }>;
      }>;
      createdAt: string | null;
    }>(`/api/supervisor/projects/${projectId}/detail`, { method: 'GET' });
  },

  async submitMilestoneGrade(
    milestoneId: string,
    payload: {
      givenScore: number;
      comments?: string;
      projectId: string;
      /** Optional — keyed by GradingComponentSpec.key when the milestone has
       *  a configured rubric (server recomputes givenScore from this rather
       *  than trusting it — see projectController.ts's submitMilestoneGrade);
       *  omitted entirely for a milestone with no configured rubric, which
       *  falls back to trusting the plain givenScore number. */
      criteria?: Record<string, number>;
      /** Required by the server when a supervisor overwrites a score they
       *  already submitted (see UpdateGradeModal.tsx) — omit on first-time
       *  grading. */
      reason?: string;
    }
  ) {
    return request<{ success?: boolean; message?: string }>(`/api/projects/milestones/${milestoneId}/grade`, { method: 'POST', body: payload });
  },

  /** POST /api/projects/milestones/:id/individual-grade — group projects
   *  only: layers one student's personal component on top of the shared
   *  group score submitMilestoneGrade just recorded, so members of the
   *  same group can end up with different final grades (see
   *  submitIndividualGrade/computeFinalGradeByStudent server-side). */
  async submitIndividualGrade(milestoneId: string, payload: { studentId: string; score: number; comments?: string }) {
    return request<{ success: boolean }>(`/api/projects/milestones/${milestoneId}/individual-grade`, { method: 'POST', body: payload });
  },

  // ─── Three-rubric final-grade workflow (defense milestones with a
  // template-configured finalGradeComponents — see workflowTemplates.ts) ────
  /** `files` is optional — the rubric alone drives the computed grade, an
   *  attached file (e.g. the completed paper form) is just for the record.
   *  Switches to multipart only when at least one file is given; otherwise
   *  behaves exactly as before (plain JSON body). */
  async submitSupervisorEvaluation(milestoneId: string, payload: { scores: Record<string, number>; comment?: string }, files?: File[]) {
    if (files && files.length > 0) {
      const formData = new FormData();
      formData.append('scores', JSON.stringify(payload.scores));
      if (payload.comment) formData.append('comment', payload.comment);
      files.forEach((f) => formData.append('files', f));
      return request<{ success: boolean; total: number }>(`/api/projects/milestones/${milestoneId}/supervisor-evaluation`, { method: 'POST', body: formData, raw: true });
    }
    return request<{ success: boolean; total: number }>(`/api/projects/milestones/${milestoneId}/supervisor-evaluation`, { method: 'POST', body: payload });
  },

  async submitExaminerEvaluation(milestoneId: string, payload: { kind: 'project' | 'defense'; scores: Record<string, number>; comment?: string }, files?: File[]) {
    if (files && files.length > 0) {
      const formData = new FormData();
      formData.append('kind', payload.kind);
      formData.append('scores', JSON.stringify(payload.scores));
      if (payload.comment) formData.append('comment', payload.comment);
      files.forEach((f) => formData.append('files', f));
      return request<{ success: boolean; total: number }>(`/api/projects/milestones/${milestoneId}/examiner-evaluation`, { method: 'POST', body: formData, raw: true });
    }
    return request<{ success: boolean; total: number }>(`/api/projects/milestones/${milestoneId}/examiner-evaluation`, { method: 'POST', body: payload });
  },

  /** decision: 'approve' finalizes autoCalculatedFinalGrade directly; 'override'
   *  requires grade+reason and routes to the coordinator's grade-override
   *  queue instead (see decideGradeOverride below). `files` is optional —
   *  same "attach for the record, never required" treatment as the evaluations
   *  above. */
  async decideFinalGrade(milestoneId: string, payload: { decision: 'approve' } | { decision: 'override'; grade: number; reason: string }, files?: File[]) {
    if (files && files.length > 0) {
      const formData = new FormData();
      formData.append('decision', payload.decision);
      if (payload.decision === 'override') {
        formData.append('grade', String(payload.grade));
        formData.append('reason', payload.reason);
      }
      files.forEach((f) => formData.append('files', f));
      return request<{ success: boolean; finalGrade?: number; status?: string }>(`/api/supervisor/milestones/${milestoneId}/final-grade-decision`, { method: 'POST', body: formData, raw: true });
    }
    return request<{ success: boolean; finalGrade?: number; status?: string }>(`/api/supervisor/milestones/${milestoneId}/final-grade-decision`, { method: 'POST', body: payload });
  },

  /** decision: 'approve_override' applies the supervisor's proposed grade;
   *  'keep_auto' reverts to the automatically-computed one. Either way the
   *  grade is finalized (gradeApproved: true). */
  async decideGradeOverride(milestoneId: string, decision: 'approve_override' | 'keep_auto') {
    return request<{ success: boolean; finalGrade: number }>(`/api/grad-school-head/milestones/${milestoneId}/grade-override-decision`, { method: 'POST', body: { decision } });
  },

  /** Either a file (FormData, field name 'files') or a JSON formData object —
   *  never both. Only meaningful on a research_proposal/progress_report
   *  milestone whose template set staffRecordMode: 'upload_or_form'. */
  async submitStaffRecordFile(milestoneId: string, formData: FormData) {
    return request<{ success: boolean }>(`/api/supervisor/milestones/${milestoneId}/staff-record`, { method: 'POST', body: formData, raw: true });
  },
  async submitStaffRecordForm(milestoneId: string, formData: Record<string, unknown>) {
    return request<{ success: boolean }>(`/api/supervisor/milestones/${milestoneId}/staff-record`, { method: 'POST', body: { formData } });
  },

  async getSupervisorExaminerRecommendations() {
    return request<{ recommendations: Array<Record<string, unknown> & { id: string }> }>('/api/supervisor/examiner-recommendations', {
      method: 'GET',
    });
  },

  /** POST /api/supervisor/projects — creation-only fields (maxStudents,
   *  prerequisites) on top of the same title/description/degree/type/skills
   *  set shared with updateSupervisorProject above. Note the server field is
   *  `NumberOfStudents`, not `maxStudents` (matches createSupervisorProject
   *  in supervisorController.ts exactly). */
  async createSupervisorProject(payload: {
    titleHe: string;
    titleEn: string;
    descriptionHe: string;
    descriptionEn: string;
    degreeTypes: ('bachelors' | 'masters')[];
    projectTypes: ('project' | 'thesis')[];
    requiredSkills: string[];
    /** minGrade is optional per subject — omitted means "must have taken the
     *  course," no grade threshold. See PrerequisitesEditor. */
    prerequisites: Array<{ subject: string; minGrade?: number }>;
    NumberOfStudents: number;
    facultyId: string;
    /** Optional single major within facultyId, validated server-side against
     *  the calling supervisor's own assignedMajors restriction (if any) — see
     *  supervisorController.ts's createSupervisorProject. Omitted = open to
     *  every major in the faculty. */
    major?: string;
  }) {
    return request<{ success: boolean; projectId: string; message?: string }>('/api/supervisor/projects', {
      method: 'POST',
      body: payload,
    });
  },

  async createExaminerRecommendation(payload: {
    projectId: string;
    projectTitleHe?: string;
    projectTitleEn?: string;
    recommendedExaminers: Array<{
      type: 'internal' | 'external';
      internalUserId?: string;
      name: string;
      email?: string;
      institution?: string;
      expertise?: string;
      priority: number;
    }>;
  }) {
    return request<{ success: boolean; id: string }>('/api/supervisor/examiner-recommendations', { method: 'POST', body: payload });
  },

  // ─── 9. FACULTY ADMIN ───────────────────────────────────────────────────────
  async getFacultyAdminDashboard() {
    return request<{
      facultyId: string;
      unreadCount: number;
      users: Array<Record<string, unknown> & { id: string }>;
      projects: Array<Record<string, unknown> & { id: string }>;
      supervisors: Array<Record<string, unknown> & { id: string }>;
      availableStudents: Array<Record<string, unknown> & { id: string }>;
    }>('/api/admin/dashboard', { method: 'GET' });
  },

  /** Simpler than system_admin's role-update — only role + facultyId, no
   *  additional-roles array (matches updateUserPermissions exactly). */
  async updateUserPermissionsFacultyAdmin(userId: string, payload: { role: string; facultyId: string }) {
    return request<{ success: boolean }>(`/api/admin/users/${userId}`, { method: 'PATCH', body: payload });
  },

  async toggleUserActiveFacultyAdmin(userId: string, isActive: boolean) {
    return request<{ success: boolean; message: string }>(`/api/admin/users/${userId}/toggle-active`, {
      method: 'POST',
      body: { isActive },
    });
  },

  async enrollStudentToProject(projectId: string, studentId: string) {
    return request<{ success: boolean }>(`/api/admin/projects/${projectId}/enroll`, { method: 'POST', body: { studentId } });
  },

  // ─── 9b. FACULTY PROJECT TEMPLATES — a project/thesis-proposal catalog
  // supervisors submit to faculty admins for approval (distinct from the
  // workflow/milestone templates in section 9c below). See
  // server/src/controllers/facultyTemplateController.ts. ─────────────────────
  async getFacultyTemplateDashboard(facultyId: string) {
    return request<{
      facultyId: string;
      templates: Array<Record<string, unknown> & { id: string; status: string }>;
      proposals: Array<Record<string, unknown> & { id: string; status: string }>;
      counts: { total: number; approved: number; pending: number; rejected: number };
    }>('/api/faculty-templates/dashboard', { method: 'GET', params: { facultyId } });
  },

  async createFacultyTemplate(payload: {
    titleHe: string;
    titleEn: string;
    descriptionHe?: string;
    descriptionEn?: string;
    skills?: string;
    degree: 'bachelors' | 'masters';
    type: 'project' | 'thesis';
    supervisorId?: string;
  }) {
    return request<{ success: boolean; id: string; status: string; message: string }>('/api/faculty-templates', {
      method: 'POST',
      body: payload,
    });
  },

  /** Only a subset of fields need to be sent — updateFacultyTemplate applies
   *  whatever keys are present and leaves the rest untouched. */
  async updateFacultyTemplate(
    templateId: string,
    payload: Partial<{
      titleHe: string;
      titleEn: string;
      descriptionHe: string;
      descriptionEn: string;
      skills: string;
      degree: 'bachelors' | 'masters';
      type: 'project' | 'thesis';
    }>
  ) {
    return request<{ success: boolean; message: string }>(`/api/faculty-templates/${templateId}`, { method: 'PUT', body: payload });
  },

  async deleteFacultyTemplate(templateId: string) {
    return request<{ success: boolean; message: string }>(`/api/faculty-templates/${templateId}`, { method: 'DELETE' });
  },

  async approveTemplateProposal(templateId: string, note?: string) {
    return request<{ success: boolean; message: string }>(`/api/faculty-templates/proposals/${templateId}/approve`, {
      method: 'POST',
      body: { note },
    });
  },

  async rejectTemplateProposal(templateId: string, reason: string) {
    return request<{ success: boolean; message: string }>(`/api/faculty-templates/proposals/${templateId}/reject`, {
      method: 'POST',
      body: { reason },
    });
  },

  // ─── 9c. WORKFLOW TEMPLATES — faculty-configurable milestone lists per
  // process type (msc_thesis / msc_project / bsc_project). Proposals need
  // approval: grad_school_head/system_admin for master's processes,
  // faculty_admin/coordinator/system_admin for bachelor's — see
  // server/src/controllers/workflowTemplateController.ts's canApprove(). ─────
  async getWorkflowTemplates(facultyId?: string, major?: string | null) {
    return request<{
      facultyId: string | null;
      major: string | null;
      templates: Array<{
        id: string;
        facultyId: string;
        processType: 'msc_thesis' | 'msc_project' | 'bsc_project';
        major: string | null;
        version: number;
        status: 'pending_approval' | 'approved' | 'rejected' | 'superseded';
        milestones: Array<{
          type: string; nameHe: string; nameEn: string; order: number; dueDaysFromStart: number; requiresExaminers: boolean;
          gradingComponents?: Array<{ key: string; labelHe: string; labelEn: string; maxScore: number; weight: number; hasComment: boolean; visibleToStudent: boolean }>;
          routing?: Array<{ id: string; role: string; action: 'grade' | 'approve'; rejectTo: string }>;
        }>;
        createdBy: string;
        createdByMajor?: string | null;
        createdAt: string;
        proposedNote: string | null;
        applyMode: 'now' | 'from_now_on';
        defaultRouting?: Array<{ id: string; role: string; action: 'grade' | 'approve'; rejectTo: string }>;
        examinerSignoffRole?: string;
        finalGradeSignoffRole?: string;
        approvedBy?: string;
        approvedAt?: string;
        retroactiveAppliedAt?: string;
        retroactiveAffectedCount?: number;
        rejectedBy?: string;
        rejectedAt?: string;
        rejectionReason?: string;
      }>;
    }>('/api/workflow-templates', { method: 'GET', params: { facultyId, major: major === null ? 'all' : major } });
  },

  async createWorkflowTemplateProposal(payload: {
    processType: 'msc_thesis' | 'msc_project' | 'bsc_project';
    milestones: Array<{
      type: string; nameHe: string; nameEn: string; order: number; dueDaysFromStart: number; requiresExaminers: boolean;
      dateMode?: 'offset' | 'fixed'; fixedDate?: string;
      gradingComponents?: Array<{ key: string; labelHe: string; labelEn: string; maxScore: number; weight: number; hasComment: boolean; visibleToStudent: boolean }>;
      routing?: Array<{ id: string; role: string; action: 'grade' | 'approve'; rejectTo: string }>;
      /** research_proposal/progress_report only — see workflowTemplates.ts's staffRecordMode. */
      staffRecordMode?: 'none' | 'upload_or_form';
      staffFormFields?: Array<{ key: string; labelHe: string; labelEn: string; type: 'text' | 'textarea' | 'date' | 'number' | 'table'; required: boolean; tableColumns?: Array<{ key: string; labelHe: string; labelEn: string; type: 'text' | 'number' | 'date' }> }>;
      /** 'defense' only — see workflowTemplates.ts's finalGradeComponents. */
      finalGradeComponents?: {
        supervisorEvaluation: { components: Array<{ key: string; labelHe: string; labelEn: string; maxScore: number; weight: number; hasComment: boolean; visibleToStudent: boolean }>; weight: number };
        examinerProjectEvaluation: { components: Array<{ key: string; labelHe: string; labelEn: string; maxScore: number; weight: number; hasComment: boolean; visibleToStudent: boolean }>; weight: number };
        examinerDefenseEvaluation: { components: Array<{ key: string; labelHe: string; labelEn: string; maxScore: number; weight: number; hasComment: boolean; visibleToStudent: boolean }>; weight: number };
      };
    }>;
    note?: string;
    /** system_admin only — proposes on behalf of another faculty. Ignored
     *  (and derived server-side from her own assigned subject) for
     *  administrative coordinator. */
    facultyId?: string;
    /** A major slug, or `null`/omitted for "all majors in this faculty." */
    major?: string | null;
    applyMode: 'now' | 'from_now_on';
    defaultRouting?: Array<{ id: string; role: string; action: 'grade' | 'approve'; rejectTo: string }>;
    /** Who must sign off on examiner invitations before they go out — a
     *  ChainRole, or 'none' to skip the second tier. Valid for any process
     *  type. Omitted uses the server's legacy default. */
    examinerSignoffRole?: string;
    /** Who signs off on a defense milestone's already-computed final grade —
     *  a ChainRole (no 'none' option, this step is always required). Omitted
     *  uses the server's legacy default (grad_school_head). */
    finalGradeSignoffRole?: string;
    /** What a student with no active project sees first for this subject —
     *  omitted uses the server's default ('browse_projects', today's only
     *  behavior). See workflowTemplates.ts's resolveFirstStepMode. */
    firstStepMode?: 'browse_projects' | 'choose_supervisor';
    /** Only meaningful when firstStepMode === 'choose_supervisor'. Omitted
     *  uses the server's default (true — requires approval). */
    supervisorSelectionRequiresApproval?: boolean;
  }) {
    return request<{ success: boolean; id: string; status: string }>('/api/workflow-templates', {
      method: 'POST',
      body: { ...payload, major: payload.major === null ? 'all' : payload.major },
    });
  },

  /** Edits a still-pending proposal IN PLACE (same doc, same version, stays
   *  'pending_approval') — unlike createWorkflowTemplateProposal, which
   *  always creates a new version. Only valid while the target template's
   *  status is still 'pending_approval'; the server rejects it otherwise. */
  async updateWorkflowTemplateProposal(id: string, payload: {
    milestones: Array<{
      type: string; nameHe: string; nameEn: string; order: number; dueDaysFromStart: number; requiresExaminers: boolean;
      dateMode?: 'offset' | 'fixed'; fixedDate?: string;
      gradingComponents?: Array<{ key: string; labelHe: string; labelEn: string; maxScore: number; weight: number; hasComment: boolean; visibleToStudent: boolean }>;
      routing?: Array<{ id: string; role: string; action: 'grade' | 'approve'; rejectTo: string }>;
      staffRecordMode?: 'none' | 'upload_or_form';
      staffFormFields?: Array<{ key: string; labelHe: string; labelEn: string; type: 'text' | 'textarea' | 'date' | 'number' | 'table'; required: boolean; tableColumns?: Array<{ key: string; labelHe: string; labelEn: string; type: 'text' | 'number' | 'date' }> }>;
      finalGradeComponents?: {
        supervisorEvaluation: { components: Array<{ key: string; labelHe: string; labelEn: string; maxScore: number; weight: number; hasComment: boolean; visibleToStudent: boolean }>; weight: number };
        examinerProjectEvaluation: { components: Array<{ key: string; labelHe: string; labelEn: string; maxScore: number; weight: number; hasComment: boolean; visibleToStudent: boolean }>; weight: number };
        examinerDefenseEvaluation: { components: Array<{ key: string; labelHe: string; labelEn: string; maxScore: number; weight: number; hasComment: boolean; visibleToStudent: boolean }>; weight: number };
      };
    }>;
    note?: string;
    applyMode: 'now' | 'from_now_on';
    defaultRouting?: Array<{ id: string; role: string; action: 'grade' | 'approve'; rejectTo: string }>;
    examinerSignoffRole?: string;
    finalGradeSignoffRole?: string;
    firstStepMode?: 'browse_projects' | 'choose_supervisor';
    supervisorSelectionRequiresApproval?: boolean;
  }) {
    return request<{ success: boolean; message: string }>(`/api/workflow-templates/${id}`, {
      method: 'PUT',
      body: payload,
    });
  },

  async approveWorkflowTemplate(id: string) {
    return request<{ success: boolean; message: string; retroactiveAffectedCount?: number }>(`/api/workflow-templates/${id}/approve`, { method: 'POST' });
  },

  async rejectWorkflowTemplate(id: string, reason: string) {
    return request<{ success: boolean; message: string }>(`/api/workflow-templates/${id}/reject`, { method: 'POST', body: { reason } });
  },

  async deleteWorkflowTemplate(id: string) {
    return request<{ success: boolean; message: string }>(`/api/workflow-templates/${id}`, { method: 'DELETE' });
  },

  /** Pulls in ANOTHER faculty's currently-approved template (resolved by
   *  facultyId+processType+major, not a doc id — the caller may have no
   *  view access to that faculty at all) as a fresh pending_approval
   *  proposal for the caller's own target subject. See
   *  server/src/controllers/workflowTemplateController.ts's
   *  duplicateWorkflowTemplateController — for coordinator/faculty_admin/
   *  program_head, targetFacultyId/targetMajor are ignored server-side and
   *  forced to their own faculty regardless of what's passed here; only
   *  grad_school_head/system_admin (and administrative_secretary, within
   *  her own scope) can actually choose the target. `sourceMajor`/
   *  `targetMajor` null means "all majors in that faculty". */
  async duplicateWorkflowTemplate(params: {
    sourceFacultyId: string;
    sourceMajor: string | null;
    processType: 'msc_thesis' | 'msc_project' | 'bsc_project';
    targetFacultyId?: string;
    targetMajor?: string | null;
  }) {
    return request<{ success: boolean; id: string; status: string; facultyId: string; major: string | null }>(
      '/api/workflow-templates/duplicate',
      { method: 'POST', body: params }
    );
  },

  /** Read-only — how many in-progress projects/theses a "now" (retroactive)
   *  template choice would touch, shown before the proposer/approver
   *  confirms. See workflowTemplateRetroactiveApply.ts. */
  async getWorkflowTemplateRetroactivePreview(params: { facultyId?: string; major?: string | null; processType: 'msc_thesis' | 'msc_project' | 'bsc_project' }) {
    return request<{ count: number; projects: Array<{ id: string; studentNames: string[] }> }>('/api/workflow-templates/retroactive-preview', {
      method: 'GET',
      params: { facultyId: params.facultyId, major: params.major === null ? 'all' : params.major, processType: params.processType },
    });
  },

  // ─── 10. PROGRAM HEAD (read-only dashboard — no mutation endpoints exist) ──
  async getProgramHeadDashboard(uid: string) {
    return request<{
      headName: string;
      facultyId: string;
      students: Array<{
        uid: string;
        projectId: string;
        studentName: string;
        trackType: 'thesis' | 'masters_project';
        supervisorName: string;
        currentMilestone: string;
        primaryStatus: string;
        subStatus: string;
        daysInStage: number;
        deadline: string | null;
        isOverdue: boolean;
        isActivelyPaused: boolean;
        facultyId: string;
      }>;
      pendingApprovals: Array<{ id: string; type: string; studentName: string; description: string; submittedAt: string }>;
      supervisorLoads: Array<{ supervisorName: string; supervisorEmail: string; activeStudents: number }>;
      stats: { totalStudents: number; activeStudents: number; overdueCount: number; pendingCount: number };
    }>(`/api/program-head/${uid}/dashboard`, { method: 'GET' });
  },

  // ─── 11. Administrative Coordinator (project-coordinator dashboard) ──────────
  async getProjectCoordinatorDashboard(uid: string) {
    return request<{
      coordinatorName: string;
      facultyId: string | null;
      /** The administrative coordinator's own assigned degree(s) — {facultyId, major?} tuples
       *  from her coordinatorScopes. Empty for system_admin (unfiltered view). */
      scopes?: Array<{ facultyId: string; major?: string }>;
      /** True when an administrative coordinator has no coordinatorScopes
       *  assigned yet — groups will be empty; surface this distinctly from
       *  "no groups in your degree" so it's clear an admin needs to assign
       *  her a scope, not that her degree genuinely has nothing in it. */
      noScopeAssigned?: boolean;
      groups: Array<{
        id: string;
        projectTitle: string;
        supervisorId: string | null;
        supervisorName: string;
        facultyId: string;
        major: string | null;
        trackType: 'bachelor_project' | 'masters_project';
        members: Array<{
          uid: string;
          name: string;
          milestones: Array<{ type: string; status: string; finalGrade: number | null; gradeApproved: boolean; fileUrls: string[]; submissionNote: string }>;
        }>;
        currentMilestone: string;
        currentMilestoneId: string | null;
        existingExaminerIds: string[];
        primaryStatus: string;
        defenseDate: string | null;
        defenseRoom: string | null;
        submissionsCount: number;
        overdueCount: number;
        isOverdue: boolean;
      }>;
      stats: { totalGroups: number; activeGroups: number; scheduledDefenses: number; overdueGroups: number };
    }>(`/api/project-coordinator/${uid}/dashboard`, { method: 'GET' });
  },

  /** Full roster of every student in the administrative coordinator's
   *  assigned degree(s) — unlike getProjectCoordinatorDashboard above, this
   *  includes students who haven't enrolled in a project yet (null project/
   *  supervisor/milestone, a "searching for a project" day count instead).
   *  See server/src/controllers/projectCoordinatorController.ts's
   *  getStudentsReport. */
  async getStudentsReport() {
    return request<{
      noScopeAssigned?: boolean;
      students: Array<{
        id: string;
        name: string;
        facultyId: string | null;
        major: string | null;
        degreeType: 'bachelors' | 'masters' | null;
        status: 'not_in_project' | 'applied' | 'in_project' | 'awaiting_defense' | 'finished';
        /** Only populated when status === 'applied'. */
        appliedProjects: Array<{ titleHe: string; titleEn: string }>;
        projectTitleHe: string | null;
        projectTitleEn: string | null;
        supervisorName: string | null;
        milestoneNameHe: string | null;
        milestoneNameEn: string | null;
        /** Days until the current milestone's due date (in_project/awaiting_defense),
         *  days since signup while still searching (not_in_project/applied), or
         *  null (finished — nothing left to submit). */
        days: number | null;
      }>;
    }>('/api/project-coordinator/students-report', { method: 'GET' });
  },

  /** Single-student drill-down for a Students Report row — the student's
   *  profile, active project (if any), current milestone, and the full list
   *  of already-submitted milestones with their grades. See
   *  projectCoordinatorController.ts's getStudentDetail. */
  async getStudentDetail(studentId: string) {
    return request<{
      student: {
        id: string;
        name: string;
        facultyId: string | null;
        major: string | null;
        degreeType: 'bachelors' | 'masters' | null;
        email: string;
        phoneNumber: string | null;
        yearOfStudy: number | null;
        trackPolicy: 'coordinator_gated' | 'signup_choice' | 'project_only';
        track: 'thesis' | 'project' | null;
        trackLocked: boolean;
        thesisEligibility: {
          eligible: boolean;
          reason?: string | null;
          decidedAt?: string | null;
          /** 'manual' = a coordinator/program_head/administrative
           *  coordinator directly flipped it; 'average' = derived from the
           *  grade average below against THESIS_ELIGIBILITY_THRESHOLD. */
          method?: 'manual' | 'average';
          /** Only meaningful when method === 'average'. */
          average?: number | null;
          threshold?: number | null;
          computedScore?: number | null;
        } | null;
      };
      project: { id: string; titleHe: string; titleEn: string; supervisorName: string | null; academicYear: string | null } | null;
      currentMilestone: { id: string; type: string; nameHe: string; nameEn: string; status: string; dueDate: string | null } | null;
      milestones: Array<{
        id: string;
        type: string;
        nameHe: string;
        nameEn: string;
        status: string;
        dueDate: string | null;
        submittedAt: string | null;
        finalGrade: number | null;
        gradeApproved: boolean;
      }>;
      /** Every milestone on the track (pending ones included), shaped for
       *  components/MilestoneTimeline's MilestoneData prop. */
      milestoneRoadmap: Array<{
        id: string;
        type: string;
        order?: number;
        status: string;
        dueDate: string | null;
        submittedAt: string | null;
        fileUrls: string[];
        submissionNote: string;
        finalGrade: number | null;
        supervisorScore: number | null;
        defenseDate: string | null;
        defenseRoom: string | null;
        defenseBuilding: string | null;
        defenseTime: string | null;
        onlineDefenseLink: string | null;
        examinerNames: string[];
        examinerIds: string[];
      }>;
    }>(`/api/project-coordinator/students/${studentId}/detail`, { method: 'GET' });
  },

  /** Grants/denies a coordinator_gated student (e.g. M.Sc Computer Science)
   *  the ability to choose their own thesis/project track — see
   *  server/src/services/studentTrack.ts's setThesisEligibility. */
  async setStudentThesisEligibility(studentId: string, eligible: boolean, reason?: string) {
    return request<{ success: boolean }>(`/api/project-coordinator/students/${studentId}/thesis-eligibility`, {
      method: 'POST',
      body: { eligible, reason },
    });
  },

  /** Sets thesis eligibility FROM a grade average (currently entered
   *  manually; see config/studentTrack.ts's doc comment for the planned
   *  future Michlol auto-import) instead of a direct manual boolean — see
   *  server/src/services/studentTrack.ts's setThesisEligibilityFromAverage.
   *  A subsequent setStudentThesisEligibility call can still override the
   *  result. */
  async setStudentThesisAverage(studentId: string, average: number) {
    return request<{ success: boolean }>(`/api/project-coordinator/students/${studentId}/thesis-average`, {
      method: 'POST',
      body: { average },
    });
  },

  /** Every defense milestone with a pending grade override (see
   *  supervisorController.ts's decideFinalGrade) in the coordinator's
   *  assigned degree(s) — see projectCoordinatorController.ts's
   *  getPendingGradeOverrides. */
  async getPendingGradeOverrides() {
    return request<{
      overrides: Array<{
        milestoneId: string;
        projectId: string | null;
        projectTitleHe: string;
        projectTitleEn: string;
        studentNames: string[];
        kind: 'auto_confirmed' | 'override';
        autoCalculatedFinalGrade: number | null;
        proposedGrade: number | null;
        reason: string;
        proposedAt: string | null;
        supervisorEvaluationTotal: number | null;
        examinerProjectAvg: number | null;
        examinerDefenseAvg: number | null;
        supervisorEvaluationFileUrls: string[];
        examinerProjectFileUrls: string[];
        examinerDefenseFileUrls: string[];
        gradeOverrideFileUrls: string[];
      }>;
    }>('/api/project-coordinator/grade-overrides', { method: 'GET' });
  },

  /** The six statistics an administrative coordinator asked for (milestone
   *  distribution/completion, final grades, applications-by-faculty,
   *  on-time completion, year-of-study distribution) — omit `facultyId` for
   *  the aggregate view across every faculty in scope, or pass one to narrow
   *  to it. See projectCoordinatorController.ts's getCoordinatorStatistics.
   *  The matching /export endpoint (a multi-sheet .xlsx) is downloaded via
   *  downloadAuthenticatedFile directly, not through this method. */
  async getCoordinatorStatistics(facultyId?: string) {
    return request<{
      noScopeAssigned?: boolean;
      allowedFacultyIds: string[];
      milestoneDistribution: Array<{
        type: string; nameHe: string; nameEn: string; count: number; percent: number;
        students: Array<{
          studentId: string; studentName: string; facultyId: string;
          projectTitleHe: string; projectTitleEn: string;
          status: 'overdue' | 'stuck' | 'on_track'; daysInStage: number;
        }>;
      }>;
      milestoneCompletion: Array<{ type: string; nameHe: string; nameEn: string; totalReached: number; completed: number; percent: number }>;
      finalGrades: {
        byMilestoneType: Array<{
          type: string; nameHe: string; nameEn: string; gradedCount: number;
          averageFinalGrade: number | null;
          averageSupervisorEvaluation: number | null;
          averageExaminerProjectEvaluation: number | null;
          averageExaminerDefenseEvaluation: number | null;
        }>;
        byStudent: Array<{
          studentId: string; studentName: string; facultyId: string;
          projectId: string; projectTitleHe: string; projectTitleEn: string;
          finalGrade: number | null; unconfigured: boolean;
        }>;
        averageProjectFinalGrade: number | null;
      };
      applicationsByFaculty: Array<{ facultyId: string; count: number; percent: number }>;
      onTimeCompletion: Array<{ facultyId: string; onTime: number; late: number; total: number; percentOnTime: number }>;
      yearOfStudyDistribution: Array<{ yearOfStudy: number | 'unknown'; count: number; averageProgressPercent: number }>;
      supervisorPaymentRates: SupervisorPaymentRates;
      supervisorCreditPoints: Array<{
        facultyId: string; supervisorId: string; supervisorName: string;
        counts: PaymentCategoryCounts; totalProjects: number;
        points: Record<PaymentCategory, number | null>;
        totalPoints: number; incompleteRates: boolean;
      }>;
    }>('/api/project-coordinator/statistics', { method: 'GET', params: { facultyId } });
  },

  /** Saves the per-faculty×category credit-point rate an administrative
   *  coordinator uses to turn a supervisor's project counts into a payment
   *  total (see getCoordinatorStatistics's supervisorCreditPoints above) —
   *  only the faculties included in `rates` are touched, everything else in
   *  the stored table is left as-is. Returns the full merged table so the
   *  caller can refresh its local state without a second round-trip. */
  async updateSupervisorPaymentRates(rates: SupervisorPaymentRates) {
    return request<{ rates: SupervisorPaymentRates }>('/api/project-coordinator/supervisor-payment-rates', { method: 'PUT', body: { rates } });
  },

  /** Shared by coordinator, administrative coordinator, and system_admin — all
   *  three route to the same assignDefense controller (coordinatorController.ts),
   *  just mounted under different base paths ('admin' for the admin panel). */
  async assignDefenseLogistics(basePath: 'admin' | 'coordinator' | 'project-coordinator', projectId: string, payload: { time: string; room: string; building: string; onlineDefenseLink?: string }) {
    return request<{ success: boolean; message: string }>(`/api/${basePath}/projects/${projectId}/assign-defense`, {
      method: 'POST',
      body: payload,
    });
  },

  /** Shared by coordinator / administrative coordinator / system_admin. Same
   *  pending-approval gate as updateMilestoneDueDate above for coordinator/
   *  administrative coordinator callers. */
  async bulkUpdateMilestoneDueDates(payload: { projectIds: string[]; milestoneType?: string; dueDate: string; reason: string }) {
    return request<{ success?: boolean; updatedCount?: number; message?: string; pendingApproval?: boolean; request?: ExceptionalActionRequest }>('/api/milestones/bulk-due-date', {
      method: 'PUT',
      body: payload,
    });
  },

  // ─── 18. EXCEPTIONAL ACTIONS — program_head/faculty_admin/grad_school_head/
  // system_admin review coordinator/administrative coordinator's deadline
  // overrides before they take effect (P1 #12). ──────────────────────────────
  async getPendingExceptionalActions() {
    return request<{ requests: ExceptionalActionRequest[] }>('/api/exceptional-actions/pending', { method: 'GET' });
  },

  async decideExceptionalAction(id: string, decision: 'approved' | 'rejected', reason?: string) {
    return request<{ success: boolean; request: ExceptionalActionRequest }>(`/api/exceptional-actions/${id}/decide`, {
      method: 'POST',
      body: { decision, reason },
    });
  },

  // ─── 12. GRAD SCHOOL HEAD ───────────────────────────────────────────────────
  async getGradSchoolHeadDashboard(uid: string) {
    return request<{
      headName: string;
      pendingApprovals: Array<{
        id: string;
        type: 'supervisor' | 'proposal' | 'thesis' | 'examiners' | 'final_grade' | 'template';
        studentName: string;
        facultyId: string;
        title: string;
        submittedAt: string;
        urgency: 'low' | 'medium' | 'high';
      }>;
      processSummaries: Array<{
        facultyId: string;
        facultyNameHe: string;
        facultyNameEn: string;
        total: number;
        active: number;
        stuck: number;
        completed: number;
        overdue: number;
      }>;
      stuckStudents: Array<{ studentName: string; supervisorName: string; facultyId: string; currentMilestone: string; daysInStage: number; trackType: string }>;
      examinerLoad: Array<{ examinerName: string; institution: string; activeReviews: number; pending: number; overdue: number }>;
      approvedFinalGrades: Array<{
        id: string;
        studentName: string;
        facultyId: string;
        title: string;
        finalGrade: number;
        approvedAt: string;
        michlolTransferStatus: string | null;
      }>;
      stats: { totalMasters: number; pendingCount: number; stuckCount: number; completedThisYear: number };
    }>(`/api/grad-school-head/${uid}/dashboard`, { method: 'GET' });
  },

  async approveFinalGrade(milestoneId: string) {
    return request<{ success: boolean; message: string }>(`/api/grad-school-head/milestones/${milestoneId}/approve-grade`, { method: 'POST' });
  },

  /** Reopens an already-approved final grade for correction — requires a reason. */
  async unlockFinalGrade(milestoneId: string, reason: string) {
    return request<{ success: boolean; message: string }>(`/api/grad-school-head/milestones/${milestoneId}/unlock-grade`, {
      method: 'POST',
      body: { reason },
    });
  },

  /** Rejects a computed (not yet approved) final grade, sending it back for
   *  re-grading — requires a reason. See gradSchoolHeadController.ts's rejectFinalGrade. */
  async rejectFinalGrade(milestoneId: string, reason: string) {
    return request<{ success: boolean; message: string }>(`/api/grad-school-head/milestones/${milestoneId}/reject-grade`, {
      method: 'POST',
      body: { reason },
    });
  },

  /** Second, cross-faculty sign-off for msc_thesis examiner lists a coordinator
   *  already approved — see gradSchoolHeadController.ts's approveExaminerRecommendationFinal (P1 #5). */
  async approveExaminerRecommendationFinal(recommendationId: string) {
    return request<{ success: boolean; message: string }>(`/api/grad-school-head/examiner-recommendations/${recommendationId}/approve`, { method: 'POST' });
  },

  async rejectExaminerRecommendationFinal(recommendationId: string, reason: string) {
    return request<{ success: boolean; message: string }>(`/api/grad-school-head/examiner-recommendations/${recommendationId}/reject`, {
      method: 'POST',
      body: { reason },
    });
  },

  // ─── 13. INTERNAL EXAMINER ──────────────────────────────────────────────────
  async getExaminerDashboard() {
    return request<{ milestones: Array<Record<string, unknown> & { id: string }> }>('/api/examiner/dashboard', { method: 'GET' });
  },

  async submitExaminerDefenseDates(milestoneId: string, candidateDates: string[]) {
    return request<{ success: boolean; matched?: boolean; matchedDate?: string; conflict?: boolean }>(
      `/api/examiner/milestones/${milestoneId}/defense-dates`,
      { method: 'POST', body: { candidateDates } }
    );
  },

  // ─── 16. EXTERNAL EXAMINER ACCESS (public, token-based) — matches
  // server/src/routes/examinerAccess.ts. Named distinctly from section 13's
  // internal-examiner methods above (getInternalExaminerList,
  // submitExaminerDefenseDates) since these hit a different, unauthenticated
  // set of endpoints keyed by the token itself, not a signed-in uid. ────────

  /** POST /api/examiner-access/:token/request-otp — sends (or resends) the
   *  one-time email code required before the examinerTokens/{token} document
   *  becomes readable (see firestore.rules + web/lib/examinerTokens.ts). */
  async requestExaminerOtp(token: string) {
    return request<{ success: boolean }>(`/api/examiner-access/${encodeURIComponent(token)}/request-otp`, { method: 'POST' });
  },

  /** POST /api/examiner-access/:token/verify-otp */
  async verifyExaminerOtp(token: string, code: string) {
    return request<{ success: boolean }>(`/api/examiner-access/${encodeURIComponent(token)}/verify-otp`, {
      method: 'POST',
      body: { code },
    });
  },

  /** GET /api/examiner-access/:token/defense-dates — status + window info for
   *  the external examiner's defense-date submission (separate concern from
   *  the opinion/review flow above). */
  async getExaminerAccessDefenseDateStatus(token: string) {
    return request<{
      status: 'not_open' | 'awaiting_your_dates' | 'awaiting_other_examiners' | 'matched';
      windowStart?: string;
      windowEnd?: string;
      matchedDate?: string | null;
    }>(`/api/examiner-access/${encodeURIComponent(token)}/defense-dates`, { method: 'GET' });
  },

  /** POST /api/examiner-access/:token/defense-dates */
  async submitExaminerAccessDefenseDates(token: string, candidateDates: string[]) {
    return request<{
      success: boolean;
      matched?: boolean;
      matchedDate?: string;
      conflict?: boolean;
      /** Examiner keys still to submit — see defenseScheduling.ts's
       *  SubmitDatesResult.waitingOn. */
      waitingOn?: string[];
    }>(`/api/examiner-access/${encodeURIComponent(token)}/defense-dates`, { method: 'POST', body: { candidateDates } });
  },

  /** POST /api/examiner-access/:token/examiner-evaluation — the data_science-
   *  only digitized paper form (Project_examiner.docx), external-examiner
   *  equivalent of submitExaminerEvaluation above. 400s for any token whose
   *  milestone doesn't use the three-rubric finalGradeComponents workflow. */
  async submitExaminerAccessEvaluation(token: string, data: { kind: 'project' | 'defense'; scores: Record<string, number>; comment?: string }) {
    return request<{ success: boolean; total: number }>(
      `/api/examiner-access/${encodeURIComponent(token)}/examiner-evaluation`,
      { method: 'POST', body: data }
    );
  },

  // ─── 17. GRADE HISTORY — read-only over `grades` + `auditLog`; access
  // matches getStudentProject (own project as student/supervisor, or any
  // staff role) ────────────────────────────────────────────────────────────
  async getProjectGradeHistory(projectId: string) {
    return request<{
      milestones: Array<{
        milestoneId: string;
        type: string | null;
        status: string | null;
        finalGrade: number | null;
        finalGradeByStudent: Record<string, number> | null;
        gradeApproved: boolean;
        gradeApprovedBy: string | null;
        gradeApprovedAt: string | null;
        grades: Array<{
          id: string;
          graderId: string;
          graderRole: string;
          comments: string;
          isFinalized: boolean;
          submittedAt: string | null;
          grading: Record<string, number> | null;
        }>;
        auditTrail: Array<{
          id: string;
          action: string;
          userId: string;
          userRole: string;
          oldValue: unknown;
          newValue: unknown;
          explanation: string | null;
          timestamp: string | null;
        }>;
      }>;
    }>(`/api/grades/history/${projectId}`, { method: 'GET' });
  },

  // ─── 17b. PROJECT RECORDS — permanent, read-only per-project timeline
  // (milestones + grades + examiners + messages + lifecycle events); see
  // server/src/services/projectRecords.ts. Access matches getStudentProject
  // (own project as student/supervisor) plus a faculty-scoped staff tier —
  // see projectRecordsController.ts's callerFacultyScope ────────────────────
  async getProjectRecord(projectId: string) {
    return request<{
      project: { id: string; titleHe: string; titleEn: string; supervisorId: string | null; status: string | null };
      entries: Array<{
        id: string;
        type: string;
        actorId: string;
        actorRole: string;
        actorDisplayName: string | null;
        data: Record<string, unknown> | null;
        timestamp: string | null;
      }>;
    }>(`/api/project-records/${projectId}`, { method: 'GET' });
  },

  async getMyProjectRecords() {
    return request<{
      projects: Array<{
        id: string; titleHe: string; titleEn: string; status: string | null;
        supervisorId: string | null; enrolledStudentCount: number;
      }>;
    }>('/api/project-records/my-projects', { method: 'GET' });
  },

  async getScopedSupervisorsForRecords() {
    return request<{
      supervisors: Array<{ id: string; displayName: string; email: string; facultyId: string }>;
    }>('/api/project-records/supervisors', { method: 'GET' });
  },

  async getSupervisorProjectRecords(supervisorId: string) {
    return request<{
      projects: Array<{
        id: string; titleHe: string; titleEn: string; status: string | null;
        supervisorId: string | null; enrolledStudentCount: number;
      }>;
    }>(`/api/project-records/supervisors/${supervisorId}/projects`, { method: 'GET' });
  },

  async getFacultyTaxonomyForRecords() {
    return request<{ faculties: Array<{ facultyId: string; majors: string[] }> }>(
      '/api/project-records/faculties', { method: 'GET' }
    );
  },

  // ─── 18. DEADLINE-CLOCK PAUSE — leave / reserve duty / maternity / illness;
  // coordinator, faculty_admin, program_head, administrative coordinator,
  // system_admin (matches CLOCK_PAUSE_ROLES in clockPauseController.ts) ──────
  async getClockPauseState(projectId: string) {
    return request<{
      activeClockPause: ClockPause | null;
      clockPauseHistory: ClockPause[];
    }>(`/api/projects/${projectId}/clock-pause`, { method: 'GET' });
  },

  async pauseProjectClock(projectId: string, reason: ClockPauseReason, note?: string) {
    return request<{ success: boolean; pause: ClockPause }>(`/api/projects/${projectId}/clock-pause`, {
      method: 'POST',
      body: { reason, note },
    });
  },

  async resumeProjectClock(projectId: string) {
    return request<{ success: boolean; pause: ClockPause }>(`/api/projects/${projectId}/clock-resume`, { method: 'POST' });
  },

  // ─── 19. TRACK CHANGE (thesis ↔ project) — coordinator, faculty_admin,
  // program_head, administrative coordinator, system_admin (matches
  // TRACK_CHANGE_ROLES in trackChangeController.ts) ──────────────────────────
  async changeProjectTrack(projectId: string, newTrack: 'thesis' | 'project', reason?: string) {
    return request<{ success: boolean; oldProjectId: string; newProjectId: string }>(
      `/api/projects/${projectId}/track-change`,
      { method: 'POST', body: { newTrack, reason } },
    );
  },

  // ─── 20. EXAMINER ESCALATION — coordinator/faculty_admin/administrative coordinator/
  // grad_school_head/system_admin manually chase or reassign a declined/overdue
  // external examiner (P1 #6; the scheduled sweep also does this automatically —
  // see server/src/services/examinerEscalation.ts). ──────────────────────────
  async getExaminerEscalations() {
    return request<{ escalations: ExaminerEscalation[] }>('/api/coordinator/examiner-escalations', { method: 'GET' });
  },

  async remindExaminer(tokenId: string) {
    return request<{ success: boolean; message: string }>(`/api/coordinator/examiner-escalations/${tokenId}/remind`, { method: 'POST' });
  },

  async promoteNextExaminer(tokenId: string) {
    return request<{ success: boolean; message: string; promoted: { uid: string; displayName: string; activeLoad: number } | null }>(
      `/api/coordinator/examiner-escalations/${tokenId}/promote-next`,
      { method: 'POST' },
    );
  },

  // ─── 21. REVISION DECISION — advisor/coordinator decides what happens after
  // examiner opinions are in (P1 #13). ────────────────────────────────────────
  async getExaminerOpinions(milestoneId: string) {
    return request<{ opinions: ExaminerOpinion[]; allSubmitted: boolean; revisionDecisions: RevisionDecisionEntry[] }>(
      `/api/milestones/${milestoneId}/examiner-opinions`,
      { method: 'GET' },
    );
  },

  async submitRevisionDecision(milestoneId: string, decision: RevisionDecisionType, note?: string) {
    return request<{ success: boolean; status: string }>(`/api/milestones/${milestoneId}/revision-decision`, {
      method: 'POST',
      body: { decision, note },
    });
  },

  // ─── 22. COMMITTEES — thesis/final_project review panels per (facultyId,
  // major, type). See server/src/controllers/committeeController.ts and
  // committeeReviewController.ts. ─────────────────────────────────────────────
  async listCommittees(facultyId?: string) {
    return request<{ committees: CommitteeRecord[] }>('/api/committees', { method: 'GET', params: { facultyId } });
  },

  async getMyCommittees() {
    return request<{ committees: CommitteeRecord[] }>('/api/committees/mine', { method: 'GET' });
  },

  async listEligibleCommitteeMembers(facultyId?: string) {
    return request<{ members: Array<{ id: string; displayName: string; email: string; role: string; facultyId: string }> }>(
      '/api/committees/eligible-members',
      { method: 'GET', params: { facultyId } },
    );
  },

  async createCommittee(payload: { facultyId: string; major: string; type: 'thesis' | 'final_project'; chairmanId?: string; memberIds: string[] }) {
    return request<{ success: boolean; id: string }>('/api/committees', { method: 'POST', body: payload });
  },

  async updateCommittee(id: string, payload: { memberIds?: string[]; chairmanId?: string | null }) {
    return request<{ success: boolean }>(`/api/committees/${id}`, { method: 'PUT', body: payload });
  },

  async getMyPendingCommitteeReviews() {
    return request<{ reviews: CommitteePendingReview[] }>('/api/committees/mine/pending-reviews', { method: 'GET' });
  },

  async getCommitteeReview(milestoneId: string) {
    return request<CommitteeReviewDetail>(`/api/milestones/${milestoneId}/committee-review`, { method: 'GET' });
  },

  async submitCommitteeVote(milestoneId: string, vote: 'approve' | 'reject', comment: string) {
    return request<{ success: boolean }>(`/api/milestones/${milestoneId}/committee-vote`, { method: 'POST', body: { vote, comment } });
  },

  async submitCommitteeDecision(milestoneId: string, decision: 'approve' | 'reject', comment: string) {
    return request<{ success: boolean; message: string }>(`/api/milestones/${milestoneId}/committee-decision`, { method: 'POST', body: { decision, comment } });
  },
};

export interface CommitteeRecord {
  id: string;
  facultyId: string;
  major: string;
  type: 'thesis' | 'final_project';
  chairmanId: string | null;
  memberIds: string[];
}

export interface CommitteePendingReview {
  milestoneId: string;
  type: string;
  projectId: string | null;
  projectTitleHe: string;
  projectTitleEn: string;
  committeeId: string;
  isChairman: boolean;
  alreadyVoted: boolean;
  voteCount: number;
  memberCount: number;
}

export interface CommitteeVoteRecord {
  memberId: string;
  vote: 'approve' | 'reject';
  comment: string;
  votedAt: string;
}

export interface CommitteeReviewDetail {
  milestoneId: string;
  type: string;
  submissionNote: string;
  fileUrls: string[];
  committee: { id: string; chairmanId: string | null; memberIds: string[]; memberNames: Record<string, string> };
  isChairman: boolean;
  votes: CommitteeVoteRecord[];
}

// See server/src/services/revisionDecisions.ts (P1 #13).
export type RevisionDecisionType = 'proceed_to_defense' | 'require_corrections' | 're_judge' | 'add_examiner';

export interface ExaminerOpinion {
  tokenId: string;
  examinerName: string;
  status: 'pending' | 'accepted' | 'declined' | 'submitted' | 'superseded';
  opinion: { criteria?: Record<string, number>; total?: number; recommendation?: string; comments?: string } | null;
  submittedAt: string | null;
}

export interface RevisionDecisionEntry {
  decision: RevisionDecisionType;
  note: string | null;
  decidedBy: string;
  decidedByRole: string;
  decidedAt: string;
}

export interface ExaminerEscalation {
  tokenId: string;
  examinerName: string;
  studentName: string;
  thesisTitle: string;
  status: 'pending' | 'accepted' | 'declined';
  isOverdue: boolean;
  projectId: string | null;
  facultyId: string;
}

export type ClockPauseReason = 'reserve_duty' | 'illness' | 'maternity_paternity' | 'other';

export interface ClockPause {
  id: string;
  reason: ClockPauseReason;
  note: string | null;
  pausedBy: string;
  pausedAt: string;
  resumedBy: string | null;
  resumedAt: string | null;
}
