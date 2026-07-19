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

  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
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

  /** PUT /api/milestones/:id — coordinator/faculty_admin/administrative_secretary/
   *  system_admin adjusts a single milestone's due date (matches
   *  UPDATE_MILESTONE_ROLES + updateMilestoneByCoordinator in
   *  milestoneController.ts exactly). Distinct from bulkUpdateMilestoneDueDates
   *  below, which shifts the same date across many projects at once. */
  async updateMilestoneDueDate(id: string, payload: { dueDate: string; reason?: string }) {
    return request<{ success: boolean; message: string }>(`/api/milestones/${id}`, { method: 'PUT', body: payload });
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

  async getChatMessages(chatId: string) {
    return request<Array<{ id: string; text: string; senderId: string; createdAt: string | null }>>(`/api/chats/${chatId}/messages`, {
      method: 'GET',
    });
  },

  async sendChatMessage(chatId: string, text: string, senderId: string) {
    return request<{ success: boolean }>(`/api/chats/${chatId}/messages`, { method: 'POST', body: { text, senderId } });
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
    }>(`/api/examiner-access/defense/${encodeURIComponent(grantCode)}`, { method: 'GET' });
  },

  // ─── 5. ADMIN (system_admin only) ──────────────────────────────────────────
  async getAdminDashboardSummary() {
    return request<{
      users: Array<Record<string, unknown> & { id: string }>;
      projects: Array<Record<string, unknown> & { id: string }>;
      milestones: Array<Record<string, unknown> & { id: string }>;
      unreadCount: number;
    }>('/api/admin/dashboard-summary', { method: 'GET' });
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
    payload: { role: string; roles?: string[]; facultyId?: string; assignedMajors?: string[] }
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

  /** POST /api/admin/projects — system_admin (also faculty_admin, but that
   *  path is exercised from the faculty_admin dashboard, not this panel). */
  async createAdminProject(payload: {
    supervisorId: string;
    facultyId: string;
    titleHe: string;
    titleEn: string;
    descriptionHe: string;
    descriptionEn: string;
    degreeType: 'bachelors' | 'masters';
    projectType: 'project' | 'thesis';
    maxStudents: number;
    requiredSkills: string[];
    prerequisites: string[];
    gradingCriteria?: Array<{ key: string; label: string; maxScore: number }>;
    /** Optional single major within facultyId — see adminController.ts's
     *  createAdminProject. Omitted = open to every major in the faculty. */
    major?: string;
  }) {
    return request<{ success: boolean; id: string; message: string }>('/api/admin/projects', { method: 'POST', body: payload });
  },

  async deleteAdminProject(projectId: string) {
    return request<{ success: boolean; message: string }>(`/api/admin/projects/${projectId}`, { method: 'DELETE' });
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

  /** GET /api/admin/supervisors — the server ignores any facultyId filter
   *  today (returns every user with role 'supervisor' regardless), so this
   *  always returns the full list; kept param-shaped in case that changes. */
  async getAdminSupervisors(facultyId?: string) {
    return request<Array<Record<string, unknown> & { id: string; displayName: string }>>('/api/admin/supervisors', {
      method: 'GET',
      params: { facultyId },
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

  /** POST /api/admin/system/maintenance — see maintenanceController.ts for
   *  the exact body shape (shutdownAt/maintenanceDurMs are both ms values,
   *  computed client-side from the warn/duration pickers). */
  async updateMaintenanceStatus(payload: { title: string; shutdownAt: number; maintenanceDurMs: number; broadcastEnabled: boolean }) {
    return request<{ ok: boolean }>('/api/admin/system/maintenance', { method: 'POST', body: payload });
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

  // ─── 6. COORDINATOR (coordinator / administrative_secretary / system_admin) ─
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

  async coordinatorApproveMilestone(milestoneId: string) {
    return request<{ success: boolean; message: string }>(`/api/coordinator/${milestoneId}/approve`, { method: 'POST' });
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
   *  route exactly). Server-side role check today only allows coordinator /
   *  faculty_admin / admin — administrative_secretary and system_admin can
   *  get a 403 here even though they're allowed onto this page; callers
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

  // ─── 7. STUDENT ─────────────────────────────────────────────────────────────
  async getMyProfile() {
    return request<Record<string, unknown>>('/api/users/profile', { method: 'GET' });
  },

  async logout() {
    return request<{ success?: boolean }>('/api/users/logout', { method: 'POST' });
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

  async applyToProject(payload: { projectId: string; transcriptUrl: string; cvUrl: string; notes: string }) {
    return request<{ success?: boolean; message?: string }>('/api/applications/apply', { method: 'POST', body: payload });
  },

  async withdrawApplication(applicationId: string) {
    return request<{ success?: boolean }>(`/api/applications/${applicationId}/withdraw`, { method: 'POST' });
  },

  async getInfoFiles() {
    return request<{ files: Array<{ id: string; titleHe: string; titleEn: string; fileUrl: string; fileName: string }> }>(
      '/api/info-files',
      { method: 'GET' }
    );
  },

  /** system_admin or coordinator only (checked server-side regardless of
   *  which base path it's called through — /api/admin/info-files and
   *  /api/coordinator/info-files both route to the same handler). */
  async uploadInfoFile(formData: FormData) {
    return request<{ success: boolean; id: string; fileUrl: string }>('/api/admin/info-files', { method: 'POST', body: formData, raw: true });
  },

  async deleteInfoFile(id: string) {
    return request<{ success: boolean; message: string }>(`/api/admin/info-files/${id}`, { method: 'DELETE' });
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
    }
  ) {
    return request<{ success?: boolean; message?: string }>(`/api/supervisor/projects/${projectId}`, { method: 'PUT', body: payload });
  },

  async deleteSupervisorProject(projectId: string) {
    return request<{ success?: boolean; message?: string }>(`/api/supervisor/projects/${projectId}`, { method: 'DELETE' });
  },

  async submitMilestoneGrade(
    milestoneId: string,
    payload: {
      givenScore: number;
      comments: string;
      projectId: string;
      /** Optional — an examiner grading via their own rubric sends only
       *  givenScore, with no criteria breakdown (matches the server's own
       *  handling in submitMilestoneGrade, which computes `grade` from
       *  criteria only when criteria is present). */
      criteria?: { clarity: number; methodology: number; feasibility: number; innovation: number; writing: number };
    }
  ) {
    return request<{ success?: boolean; message?: string }>(`/api/projects/milestones/${milestoneId}/grade`, { method: 'POST', body: payload });
  },

  async getSupervisorExaminerRecommendations() {
    return request<{ recommendations: Array<Record<string, unknown> & { id: string }> }>('/api/supervisor/examiner-recommendations', {
      method: 'GET',
    });
  },

  /** POST /api/supervisor/projects — creation-only fields (maxStudents,
   *  prerequisites, gradingCriteria) on top of the same title/description/
   *  degree/type/skills set shared with updateSupervisorProject above. Note
   *  the server field is `NumberOfStudents`, not `maxStudents` (matches
   *  createSupervisorProject in supervisorController.ts exactly). */
  async createSupervisorProject(payload: {
    titleHe: string;
    titleEn: string;
    descriptionHe: string;
    descriptionEn: string;
    degreeType: string;
    projectType: string;
    requiredSkills: string[];
    prerequisites: string[];
    NumberOfStudents: number;
    facultyId: string;
    gradingCriteria?: Array<{ key: string; label: string; maxScore: number }>;
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
  async getWorkflowTemplates(facultyId?: string) {
    return request<{
      facultyId: string;
      templates: Array<{
        id: string;
        facultyId: string;
        processType: 'msc_thesis' | 'msc_project' | 'bsc_project';
        version: number;
        status: 'pending_approval' | 'approved' | 'rejected' | 'superseded';
        milestones: Array<{ type: string; nameHe: string; nameEn: string; order: number; dueDaysFromStart: number; requiresExaminers: boolean }>;
        createdBy: string;
        createdAt: string;
        proposedNote: string | null;
        approvedBy?: string;
        approvedAt?: string;
        rejectedBy?: string;
        rejectedAt?: string;
        rejectionReason?: string;
      }>;
    }>('/api/workflow-templates', { method: 'GET', params: { facultyId } });
  },

  async createWorkflowTemplateProposal(payload: {
    processType: 'msc_thesis' | 'msc_project' | 'bsc_project';
    milestones: Array<{ type: string; nameHe: string; nameEn: string; order: number; dueDaysFromStart: number; requiresExaminers: boolean }>;
    note?: string;
    /** system_admin only — proposes on behalf of another faculty. */
    facultyId?: string;
  }) {
    return request<{ success: boolean; id: string; status: string }>('/api/workflow-templates', { method: 'POST', body: payload });
  },

  async approveWorkflowTemplate(id: string) {
    return request<{ success: boolean; message: string }>(`/api/workflow-templates/${id}/approve`, { method: 'POST' });
  },

  async rejectWorkflowTemplate(id: string, reason: string) {
    return request<{ success: boolean; message: string }>(`/api/workflow-templates/${id}/reject`, { method: 'POST', body: { reason } });
  },

  // ─── 10. PROGRAM HEAD (read-only dashboard — no mutation endpoints exist) ──
  async getProgramHeadDashboard(uid: string) {
    return request<{
      headName: string;
      facultyId: string;
      students: Array<{
        uid: string;
        studentName: string;
        trackType: 'thesis' | 'masters_project';
        supervisorName: string;
        currentMilestone: string;
        primaryStatus: string;
        subStatus: string;
        daysInStage: number;
        deadline: string | null;
        isOverdue: boolean;
        facultyId: string;
      }>;
      pendingApprovals: Array<{ id: string; type: string; studentName: string; description: string; submittedAt: string }>;
      supervisorLoads: Array<{ supervisorName: string; supervisorEmail: string; activeStudents: number }>;
      stats: { totalStudents: number; activeStudents: number; overdueCount: number; pendingCount: number };
    }>(`/api/program-head/${uid}/dashboard`, { method: 'GET' });
  },

  // ─── 11. ADMINISTRATIVE SECRETARY (project-coordinator dashboard) ──────────
  async getProjectCoordinatorDashboard(uid: string) {
    return request<{
      coordinatorName: string;
      facultyId: string;
      groups: Array<{
        id: string;
        projectTitle: string;
        supervisorName: string;
        facultyId: string;
        trackType: 'bachelor_project' | 'masters_project';
        members: Array<{ uid: string; name: string }>;
        currentMilestone: string;
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

  /** Shared by coordinator, administrative_secretary, and system_admin — all
   *  three route to the same assignDefense controller (coordinatorController.ts),
   *  just mounted under different base paths ('admin' for the admin panel). */
  async assignDefenseLogistics(basePath: 'admin' | 'coordinator' | 'project-coordinator', projectId: string, payload: { time: string; room: string; building: string }) {
    return request<{ success: boolean; message: string }>(`/api/${basePath}/projects/${projectId}/assign-defense`, {
      method: 'POST',
      body: payload,
    });
  },

  /** Shared by coordinator / administrative_secretary / system_admin. */
  async bulkUpdateMilestoneDueDates(payload: { projectIds: string[]; milestoneType?: string; dueDate: string; reason: string }) {
    return request<{ success?: boolean; updatedCount?: number; message?: string }>('/api/milestones/bulk-due-date', {
      method: 'PUT',
      body: payload,
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
      stats: { totalMasters: number; pendingCount: number; stuckCount: number; completedThisYear: number };
    }>(`/api/grad-school-head/${uid}/dashboard`, { method: 'GET' });
  },

  async approveFinalGrade(milestoneId: string) {
    return request<{ success: boolean; message: string }>(`/api/grad-school-head/milestones/${milestoneId}/approve-grade`, { method: 'POST' });
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
      status: 'not_open' | 'awaiting_your_dates' | 'awaiting_other_examiner' | 'matched';
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
      waitingOnOtherExaminer?: boolean;
    }>(`/api/examiner-access/${encodeURIComponent(token)}/defense-dates`, { method: 'POST', body: { candidateDates } });
  },
};
