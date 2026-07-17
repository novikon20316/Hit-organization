// app/faculty_admin/dashboard/types.ts
import type { AppRole, FacultyId } from '@/lib/roles';

export interface FacultyAdminUserRecord {
  id: string;
  displayName: string;
  email: string;
  role: AppRole;
  roles?: AppRole[];
  facultyId: FacultyId;
  isActive: boolean;
  hasActiveProject?: boolean;
}

export interface FacultyAdminProjectRecord {
  id: string;
  titleHe: string;
  titleEn: string;
  facultyId: FacultyId;
  status: string;
  degreeType: string;
  projectType: string;
  supervisorId?: string;
  supervisorName: string;
  enrolledStudentIds: string[];
  NumberOfStudents?: number;
  maxStudents?: number;
}
