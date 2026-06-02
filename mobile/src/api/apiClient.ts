// src/api/apiClient.ts
import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { Alert, Platform } from 'react-native';
import Constants from 'expo-constants';
import { auth } from '../firebase/firebase';

const configuredApiUrl = Constants.expoConfig?.extra?.apiUrl as string | undefined;
const DEFAULT_LOCAL_API_URL = Platform.OS === 'android'
  ? 'http://10.0.2.2:5000'
  : 'http://127.0.0.1:5000';
const SERVER_URL = configuredApiUrl ?? DEFAULT_LOCAL_API_URL;

console.log(`[ApiClient] Using base URL: ${SERVER_URL}`);


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

  async gradeMilestone(payload: {
    projectId:     string;
    milestoneType: 'proposal' | 'progress_report' | 'final_thesis';
    scores:        Record<string, number>;
    feedback:      string;
    approved:      boolean;
  }) {
    const response = await this.api.post('/api/milestones/grade', payload);
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
}

export const apiClient = new ApiClient();
