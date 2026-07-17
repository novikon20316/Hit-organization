// app/admin/panel/types.ts
import type { AppRole, FacultyId } from '@/lib/roles';

/** Shape of each entry in dashboard-summary's `users` array — a raw
 *  Firestore doc spread (`{ id, ...doc.data() }`), so treat optional
 *  fields as genuinely optional rather than assuming full UserDoc shape. */
export interface AdminUserRecord {
  id: string;
  displayName: string;
  displayNameHe?: string;
  displayNameEn?: string;
  email: string;
  role: AppRole;
  roles?: AppRole[];
  facultyId: FacultyId;
  isActive: boolean;
  totp_enabled?: boolean;
  mustChangePassword?: boolean;
}

export interface GradingCriterion {
  key: string;
  label: string;
  maxScore: number;
}

export interface AdminProjectRecord {
  id: string;
  titleHe?: string;
  titleEn?: string;
  descriptionHe?: string;
  descriptionEn?: string;
  facultyId: FacultyId;
  status: string;
  supervisorId?: string;
  supervisorName?: string;
  degreeType?: 'bachelors' | 'masters';
  projectType?: 'project' | 'thesis';
  maxStudents?: number;
  requiredSkills?: string[];
  prerequisites?: string[];
  gradingCriteria?: GradingCriterion[];
  enrolledStudentIds?: string[];
  academicYear?: string;
  createdAt?: string;
}

export interface AdminMilestoneRecord {
  id: string;
  projectId: string;
  type?: string;
  status: string;
  projectTitleHe?: string;
  projectTitleEn?: string;
  facultyId?: FacultyId;
  dueDate?: string | null;
  submittedAt?: string | null;
  studentNames?: string[];
  fileUrls?: string[];
  submissionNote?: string;
}

/** Shape returned by listDefenseAccessGrants — external examiners who missed
 *  their defense-day access window (see adminController.listDefenseAccessGrants). */
export interface DefenseAccessGrant {
  code: string;
  examinerName: string;
  examinerEmail: string;
  defenseDateISO: string;
  computedStatus: 'not_yet_active' | 'active' | 'expired';
  projectId?: string;
}

/** Shape returned by getAdminFeedback — real (non-noise) feedback messages,
 *  one-way (see feedbackController.ts — never replied to in-thread). */
export interface AdminFeedbackMessage {
  id: string;
  userId: string;
  userName: string;
  role: string;
  text: string;
  aiReasoning?: string | null;
  status: 'open' | 'resolved';
  createdAt: string | null;
}
