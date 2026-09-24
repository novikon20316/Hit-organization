// app/administrative_coordinator/dashboard/types.ts

export interface MemberMilestoneGrade {
  type: string;
  /** Snapshotted from the workflow template at enrollment — the only real
   *  name a custom milestone type has. See lib/milestoneLabel.ts's
   *  milestoneDisplayName. */
  nameHe?: string | null;
  nameEn?: string | null;
  status: string;
  finalGrade: number | null;
  gradeApproved: boolean;
  fileUrls: string[];
  submissionNote: string;
  examinerIds: string[];
  examinerNames: string[];
}

export interface ProjectGroup {
  id: string;
  projectTitle: string;
  supervisorId: string | null;
  supervisorName: string;
  facultyId: string;
  major: string | null;
  trackType: 'bachelor_project' | 'masters_project';
  members: Array<{ uid: string; name: string; email: string; phoneNumber: string | null; milestones: MemberMilestoneGrade[] }>;
  currentMilestone: string;
  currentMilestoneId: string | null;
  existingExaminerIds: string[];
  primaryStatus: string;
  defenseDate: string | null;
  defenseRoom: string | null;
  submissionsCount: number;
  overdueCount: number;
  isOverdue: boolean;
}

export interface DegreeScope {
  facultyId: string;
  major?: string;
}
