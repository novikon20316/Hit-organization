// app/administrative_secretary/dashboard/types.ts

export interface ProjectGroup {
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
}
