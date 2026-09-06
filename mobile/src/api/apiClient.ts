// src/api/apiClient.ts
import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { Alert, Platform } from 'react-native';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { auth } from '../firebase/firebase';

function getBaseUrl(): string {
  // Always hit the deployed server (value baked in via app.json extra) —
  // dev client and production builds alike. Previously this derived
  // http://<LAN-IP>:5000 from Metro's hostUri whenever a dev client was
  // connected, silently ignoring apiUrl and requiring a local `npm run dev`
  // server to be running; that's gone now that Render is the actual backend
  // used for day-to-day testing.
  const configuredApiUrl = Constants.expoConfig?.extra?.apiUrl as string | undefined;
  if (configuredApiUrl) return configuredApiUrl;

  // Last resort emulator fallback (only reachable if apiUrl is ever unset)
  return Platform.OS === 'android'
    ? 'http://10.0.2.2:5000'
    : 'http://127.0.0.1:5000';
}

const SERVER_URL = getBaseUrl();
console.log(`[ApiClient] Using base URL: ${SERVER_URL}`);

export function getApiBaseUrl(): string {
  return SERVER_URL;
}


class ApiClient {
  private api: AxiosInstance;

  constructor() {
    this.api = axios.create({
      baseURL: SERVER_URL,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Accept':       'application/json',
      },
      timeout: 15000,
    });

    // ── Request interceptor: attach fresh Firebase ID token ──────────────────
    this.api.interceptors.request.use(
      async (config: InternalAxiosRequestConfig) => {
        try {
          const currentUser = auth.currentUser;
          if (currentUser) {
            const idToken = await currentUser.getIdToken(true);
            config.headers.Authorization = `Bearer ${idToken}`;
            console.log(`✅ Token attached for: ${config.url}`);
          } else {
            console.warn(`⚠️ No auth user — no token sent for: ${config.url}`);
          }
        } catch (error) {
          console.error('❌ Failed to retrieve Firebase ID token:', error);
        }
        // Lets server/src/middleware/auth.ts enforce mobile's own
        // maintenance flag on every request — separate from web's (see
        // server/src/services/maintenanceStatus.ts).
        config.headers['X-Client-Platform'] = 'mobile';
        return config;
      },
      (error) => Promise.reject(error)
    );

    // ── Response interceptor: handle { success: false } soft errors ──────────
    //
    // The backend returns HTTP 200 with { success: false, message } for
    // non-critical failures (e.g. a Firestore write that failed after auth passed).
    // This interceptor catches those in one place so no screen needs to check for it.
    //
    // Real HTTP error codes (401, 403, 404, 400) are NOT caught here —
    // they still throw so the app can handle them structurally (e.g. redirect to login).
    this.api.interceptors.response.use(
      (response) => {
        const data = response.data;

        // Only trigger for objects that explicitly set success: false
        if (
          data !== null &&
          typeof data === 'object' &&
          !Array.isArray(data) &&           // don't interfere with feed arrays
          data.success === false &&
          typeof data.message === 'string'
        ) {
          console.warn(`[ApiClient] Soft error from ${response.config.url}: ${data.message}`);

          Alert.alert(
            'שגיאה / Error',
            data.message,
            [{ text: 'OK', style: 'default' }]
          );
        }

        // Always return the response so the calling code still gets its data
        return response;
      },
      (error) => {
        // Maintenance flipped on mid-session (useMaintenanceCheck only
        // checks once, at login/2FA) — bounce to the same /maintenance
        // screen a fresh login would've redirected to, instead of letting
        // a raw 503 surface on whatever screen happened to be mid-request.
        if (error.response?.status === 503 && error.response?.data?.error === 'MAINTENANCE_ACTIVE') {
          const { title, endsAt } = error.response.data;
          try {
            router.replace({
              pathname: '/maintenance',
              params: { title: title ?? '', endsAt: endsAt ?? '' },
            } as any);
          } catch (navError) {
            console.error('Failed to redirect to /maintenance:', navError);
          }
        }

        // 2FA-enforcement deadline passed (server/src/services/
        // twoFactorEnforcement.ts) and this account still hasn't set it up —
        // bounce to the same forced QR-setup screen app/_layout.tsx's own
        // re-check effect uses. /(auth)/setup2fa's own calls (2fa/setup,
        // 2fa/verify) are server-side allowlisted, so this never loops.
        if (error.response?.status === 403 && error.response?.data?.error === 'TWO_FACTOR_REQUIRED') {
          try {
            router.replace('/(auth)/setup2fa' as any);
          } catch (navError) {
            console.error('Failed to redirect to /setup2fa:', navError);
          }
        }
        // Real HTTP errors (4xx / 5xx / network timeout) — let them propagate
        // so the app can handle auth failures, redirects, etc. as before.
        return Promise.reject(error);
      }
    );
  }

  // ─── Base HTTP methods ────────────────────────────────────────────────────

  public async get<T = any>(url: string, config?: any) {
    return this.api.get<T>(url, config);
  }

  public async post<T = any>(url: string, data?: any, config?: any) {
    return this.api.post<T>(url, data, config);
  }

  public async put<T = any>(url: string, data?: any, config?: any) {
    return this.api.put<T>(url, data, config);
  }

  public async patch<T = any>(url: string, data?: any, config?: any) {
    return this.api.patch<T>(url, data, config);
  }

  public async delete<T = any>(url: string, config?: any) {
    return this.api.delete<T>(url, config);
  }

  // ─── 1. USER ENDPOINTS ───────────────────────────────────────────────────

  async syncUserProfile(profileData: {
    newUid:         string;
    email:          string;
    displayNameHe:  string;
    displayNameEn:  string;
    role:           'student' | 'supervisor' | 'examiner' | 'coordinator' | 'faculty_admin' | 'system_admin';
    facultyId:      string;
    degreeType?:    'bachelors' | 'masters' | null;
    yearOfStudy?:   number | null;
    major?:         string | null;
    studentId?:     string | null;
  }) {
    const response = await this.api.post('/api/users/sync', profileData);
    return response.data;
  }

  // ─── 2. MILESTONE ENDPOINTS ───────────────────────────────────────────────

  async submitMilestone(milestoneId: string, formData: FormData) {
    const response = await this.api.post(
      `/api/milestones/${milestoneId}/submit`,
      formData,
      {
        headers:          { 'Content-Type': 'multipart/form-data' },
        transformRequest: (data) => data,
      }
    );
    return response.data;
  }

  async getMilestones(params: {
    projectId?:    string;
    supervisorId?: string;
    studentId?:    string;
    facultyId?:    string;
    statusFilter?: string[];
  }) {
    const response = await this.api.get('/api/milestones', { params });
    return response.data;
  }

  // ─── 3. NOTIFICATION ENDPOINTS ───────────────────────────────────────────

  async triggerNotification(payload: {
    recipientUid: string;
    title:        string;
    body:         string;
    data?:        Record<string, any>;
  }) {
    const response = await this.api.post('/api/notifications/trigger', payload);
    return response.data;
  }

  async markNotificationRead(notificationId: string) {
    const response = await this.api.patch(`/api/notifications/${notificationId}/read`);
    return response.data;
  }

  /** Clears the unread count for one tab's badge — bulk-marks read every
   *  unread notification whose targetScreen is one of `targetScreens`. */
  async markNotificationsRead(targetScreens: string[]) {
    const response = await this.api.post('/api/notifications/mark-read', { targetScreens });
    return response.data;
  }

  // ─── 4. LOGIN SECURITY ENDPOINTS ─────────────────────────────────────────
  // All three are public/unauthenticated server-side (see server/src/routes/
  // loginSecurity.ts) — a failed login has no token to attach.

  /** Called right after catching a client-side wrong-password error. */
  async reportFailedLogin(email: string, password: string): Promise<{ locked: boolean }> {
    const response = await this.api.post('/api/auth/report-failed-login', { email, password });
    return response.data;
  }

  async getLoginSecurityIncident(code: string) {
    const response = await this.api.get(`/api/auth/login-security/${encodeURIComponent(code)}`);
    return response.data;
  }

  async confirmLoginSecurityIncident(code: string, decision: 'owner' | 'attacker') {
    const response = await this.api.post(`/api/auth/login-security/${encodeURIComponent(code)}/confirm`, { decision });
    return response.data;
  }

  // ─── 4b. LOGIN SECURITY — system_admin panel view ────────────────────────
  /** Accounts currently disabled by the 3-strikes failed-login flow, still
   *  awaiting either the owner's own email link or an admin lifting it. */
  async getLockedUsers() {
    const response = await this.api.get('/api/admin/login-security/locked');
    return response.data as { lockouts: Array<{ code: string; uid: string; email: string; displayName: string; ip: string; location: string; createdAt: string }> };
  }

  /** Re-enables the account, issues + emails a fresh temp password, clears
   *  the incident — same effect as the owner's own "yes, this was me" link. */
  async liftLoginLockout(code: string) {
    const response = await this.api.post(`/api/admin/login-security/${encodeURIComponent(code)}/lift`);
    return response.data as { success: boolean; message: string };
  }

  // ─── 5. GRADE HISTORY — read-only over `grades` + `auditLog` ─────────────
  async getProjectGradeHistory(projectId: string) {
    const response = await this.api.get(`/api/grades/history/${projectId}`);
    return response.data;
  }

  // ─── 5b. PROJECT RECORDS — permanent, read-only per-project timeline
  // (milestones + grades + examiners + messages + lifecycle events); see
  // server/src/services/projectRecords.ts ──────────────────────────────────
  async getProjectRecord(projectId: string) {
    const response = await this.api.get(`/api/project-records/${projectId}`);
    return response.data as {
      project: { id: string; titleHe: string; titleEn: string; supervisorId: string | null; status: string | null };
      entries: Array<{
        id: string; type: string; actorId: string; actorRole: string;
        actorDisplayName: string | null; data: Record<string, unknown> | null; timestamp: string | null;
      }>;
    };
  }

  async getMyProjectRecords() {
    const response = await this.api.get('/api/project-records/my-projects');
    return response.data as { projects: Array<{
      id: string; titleHe: string; titleEn: string; status: string | null;
      supervisorId: string | null; enrolledStudentCount: number;
    }> };
  }

  async getScopedSupervisorsForRecords() {
    const response = await this.api.get('/api/project-records/supervisors');
    return response.data as { supervisors: Array<{ id: string; displayName: string; email: string; facultyId: string }> };
  }

  async getSupervisorProjectRecords(supervisorId: string) {
    const response = await this.api.get(`/api/project-records/supervisors/${supervisorId}/projects`);
    return response.data as { projects: Array<{
      id: string; titleHe: string; titleEn: string; status: string | null;
      supervisorId: string | null; enrolledStudentCount: number;
    }> };
  }

  async getFacultyTaxonomyForRecords() {
    const response = await this.api.get('/api/project-records/faculties');
    return response.data as { faculties: Array<{ facultyId: string; majors: string[] }> };
  }

  // ─── 6. PROJECT ERASURE/ARCHIVE PROTOCOL ─────────────────────────────────
  // See server/src/services/projectErasure.ts. Supervisors request; only
  // coordinator/system_admin may decide, erase directly, restore, or view
  // the archive.

  async requestProjectErasure(projectId: string, reason: string) {
    const response = await this.api.post(`/api/projects/${projectId}/request-erasure`, { reason });
    return response.data;
  }

  async listPendingErasureRequests() {
    const response = await this.api.get('/api/projects/erasure-requests/pending');
    return response.data as { requests: Array<{
      id: string; projectId: string; projectTitleHe: string; projectTitleEn: string;
      facultyId: string; requestedBy: string; requestedByRole: string; reason: string;
      status: 'pending' | 'approved' | 'rejected'; createdAt: string | null;
    }> };
  }

  async decideErasureRequest(requestId: string, decision: 'approved' | 'rejected', reason?: string) {
    const response = await this.api.post(`/api/projects/erasure-requests/${requestId}/decide`, { decision, reason });
    return response.data as { success: boolean };
  }

  async listArchivedProjects() {
    const response = await this.api.get('/api/projects/archived');
    return response.data as { projects: Array<{
      id: string; titleHe: string; titleEn: string; facultyId: string;
      supervisorId: string; supervisorName: string; enrolledStudentIds: string[];
      enrolledStudentNames: string[];
      deletedAt: string | null; erasedBy: string | null; milestones: any[];
    }> };
  }

  async restoreProject(projectId: string) {
    const response = await this.api.post(`/api/projects/${projectId}/restore`);
    return response.data as { success: boolean; message: string };
  }
}

export const apiClient = new ApiClient();
