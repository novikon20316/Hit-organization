import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { auth } from '../firebase/firebase'; // Adjust this import path to point to your client-side Firebase config

// Define the baseline configuration options for your Node.js backend server
const SERVER_URL = 'http://YOUR_LOCAL_IP_ADDRESS:5000'; // Replace with your actual machine IP (e.g., 192.168.1.X), do not use 'localhost' on physical mobile devices!

class ApiClient {
  private api: AxiosInstance;

  constructor() {
    this.api = axios.create({
      baseURL: SERVER_URL,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Accept': 'application/json',
      },
      timeout: 15000, // 15 seconds timeout
    });

    // Request Interceptor: Automatically attaches the fresh Firebase ID Token
    this.api.interceptors.request.use(
      async (config: InternalAxiosRequestConfig) => {
        try {
          const currentUser = auth.currentUser;
          if (currentUser) {
            // Get the fresh JWT token from Firebase Client Auth
            const idToken = await currentUser.getIdToken(true);
            config.headers.Authorization = `Bearer ${idToken}`;
          }
        } catch (error) {
          console.error('❌ Failed to retrieve Firebase ID token for request:', error);
        }
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );
  }

  // ─── 1. USER ENDPOINTS ───────────────────────────────────────────────────
  
  /**
   * Syncs the authenticated user profile with the backend Firestore schema.
   * Handles Hebrew strings perfectly.
   */
  async syncUserProfile(profileData: {
    newUid: string;
    email: string;
    displayNameHe: string;
    displayNameEn: string;
    role: 'student' | 'supervisor' | 'examiner' | 'coordinator' | 'faculty_admin' | 'system_admin';
    facultyId: string;
    degreeType?: 'bachelors' | 'masters' | null;
    yearOfStudy?: number | null;
    major?: string | null;
    studentId?: string | null;
  }) {
    const response = await this.api.post('/api/users/sync', profileData);
    return response.data;
  }

  // ─── 2. MILESTONE WORKFLOW ENDPOINTS ──────────────────────────────────────

  /**
   * Submits a project milestone (Proposal, Progress Report, Final Thesis)
   */
  async submitMilestone(payload: {
    projectId: string;
    milestoneType: 'proposal' | 'progress_report' | 'final_thesis';
    fileUrl: string; // The Cloudinary secure resource link
    comments?: string;
  }) {
    const response = await this.api.post('/api/milestones/submit', payload);
    return response.data;
  }

  /**
   * Logs a supervisor or coordinator's assessment grade form
   */
  async gradeMilestone(payload: {
    projectId: string;
    milestoneType: 'proposal' | 'progress_report' | 'final_thesis';
    scores: Record<string, number>; // Object holding standard evaluation rows
    feedback: string;               // Bilingual feedback string
    approved: boolean;
  }) {
    const response = await this.api.post('/api/milestones/grade', payload);
    return response.data;
  }

  // ─── 3. NOTIFICATION ENDPOINTS ───────────────────────────────────────────

  /**
   * Dispatches direct notification logs and triggers Expo push alerts
   */
  async triggerNotification(payload: {
    recipientUid: string;
    title: string; // Supports Hebrew e.g., "הגשת אבן דרך עודכנה"
    body: string;
    data?: Record<string, any>;
  }) {
    const response = await this.api.post('/api/notifications/trigger', payload);
    return response.data;
  }
}

// Export a single singleton instance to use across your entire application components/screens
export const apiClient = new ApiClient();