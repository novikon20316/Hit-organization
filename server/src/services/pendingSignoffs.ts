// src/services/pendingSignoffs.ts
//
// Cross-role "what's waiting on me to sign off" resolver — the two
// configurable sign-off tiers added alongside the milestone-routing chain
// (examinerSignoffRole/finalGradeSignoffRole, see workflowTemplates.ts) are
// only ever listed today in gradSchoolHeadController.ts's own dashboard,
// unfiltered by uid (correct there only because grad_school_head is a
// cross-faculty catch-all). This is the generic version: given any
// authenticated user, which examinerRecommendations/defense milestones are
// they specifically authorized to act on right now, reusing the exact same
// resolveStaffForScope(role, resource, ids).includes(uid) idiom every
// sign-off endpoint already uses for its own authorization check.

import { db } from '../config/firebase.js';
import { resolveStaffForScope, type AuthUser, type ResourceScope } from './scopeAuthorization.js';
import { deriveProcessType, resolveFinalGradeSignoffRole, type ChainRole } from './workflowTemplates.js';
import { urgencyFromAge } from './studentProgress.js';

export interface PendingSignoffItem {
  id: string;
  type: 'examiners' | 'final_grade';
  studentName: string;
  facultyId: string;
  title: string;
  submittedAt: string;
  urgency: 'low' | 'medium' | 'high';
}

function resourceScopeOf(project: FirebaseFirestore.DocumentData, fallbackFacultyId: string): ResourceScope {
  return {
    facultyId: project.facultyId ?? fallbackFacultyId,
    major: project.major,
    degreeLevel: project.degreeType,
    processType: project.projectType,
  };
}

export async function resolveMyPendingSignoffs(user: AuthUser): Promise<PendingSignoffItem[]> {
  const [examinerRecsSnap, defenseMilestonesSnap] = await Promise.all([
    db.collection('examinerRecommendations').where('status', '==', 'coordinator_approved').get(),
    db.collection('milestones').where('type', '==', 'defense').where('status', '==', 'graded').get(),
  ]);

  // Every cache below is scoped to this one call — avoids re-fetching the
  // same project doc, re-resolving the same role+resource combination, or
  // re-resolving the same template's finalGradeSignoffRole more than once
  // when many candidates share a faculty.
  const projectCache = new Map<string, FirebaseFirestore.DocumentData | null>();
  const getProject = async (projectId: string) => {
    if (projectCache.has(projectId)) return projectCache.get(projectId)!;
    const snap = await db.collection('projects').doc(projectId).get();
    const data = snap.exists ? snap.data()! : null;
    projectCache.set(projectId, data);
    return data;
  };

  const uidsCache = new Map<string, string[]>();
  const getResolvedUids = async (role: ChainRole, resource: ResourceScope, supervisorIds: string[]) => {
    // 'supervisor' resolves directly to the project's own supervisorId(s) —
    // no Firestore query, and caching it by resource alone (without
    // supervisorIds) would wrongly share one project's supervisor with
    // another's, so it's never cached.
    if (role === 'supervisor') return resolveStaffForScope(role, resource, supervisorIds);
    const key = `${role}|${resource.facultyId}|${resource.major ?? ''}|${resource.degreeLevel ?? ''}|${resource.processType ?? ''}`;
    if (uidsCache.has(key)) return uidsCache.get(key)!;
    const uids = await resolveStaffForScope(role, resource, supervisorIds);
    uidsCache.set(key, uids);
    return uids;
  };

  const signoffRoleCache = new Map<string, ChainRole>();
  const getFinalGradeSignoffRole = async (facultyId: string, processType: ReturnType<typeof deriveProcessType>, major: string | null) => {
    const key = `${facultyId}|${processType}|${major ?? ''}`;
    if (signoffRoleCache.has(key)) return signoffRoleCache.get(key)!;
    const role = await resolveFinalGradeSignoffRole(facultyId, processType, major);
    signoffRoleCache.set(key, role);
    return role;
  };

  const userNameCache = new Map<string, string>();
  const getUserName = async (uid: string) => {
    if (userNameCache.has(uid)) return userNameCache.get(uid)!;
    const snap = await db.collection('users').doc(uid).get();
    const name = snap.exists ? ((snap.data()?.displayName as string) ?? 'Unknown') : 'Unknown';
    userNameCache.set(uid, name);
    return name;
  };
  const studentNameFor = async (project: FirebaseFirestore.DocumentData | null) => {
    const ids: string[] = project?.enrolledStudentIds ?? [];
    if (ids.length === 0) return 'Unknown';
    const names = await Promise.all(ids.map(getUserName));
    return names.join(', ') || 'Unknown';
  };

  const items: PendingSignoffItem[] = [];

  for (const doc of examinerRecsSnap.docs) {
    const data = doc.data();
    const project = await getProject(data.projectId);
    if (!project) continue;
    const resource = resourceScopeOf(project, data.facultyId ?? '');
    const role: ChainRole = data.signoffRole ?? 'grad_school_head';
    const supervisorIds = [project.supervisorId].filter(Boolean);
    const uids = await getResolvedUids(role, resource, supervisorIds);
    if (!uids.includes(user.uid)) continue;

    items.push({
      id: doc.id,
      type: 'examiners',
      studentName: await studentNameFor(project),
      facultyId: resource.facultyId,
      title: data.projectTitleHe || data.projectTitleEn || project.titleHe || project.titleEn || '',
      submittedAt: data.createdAt?.toDate?.()?.toISOString?.() ?? '',
      urgency: urgencyFromAge(data.createdAt),
    });
  }

  for (const doc of defenseMilestonesSnap.docs) {
    const data = doc.data();
    if (data.finalGrade == null || data.gradeApproved) continue;
    const project = await getProject(data.projectId);
    if (!project) continue;
    const resource = resourceScopeOf(project, data.facultyId ?? '');
    const processType = deriveProcessType(project.degreeType, project.projectType);
    const role = await getFinalGradeSignoffRole(resource.facultyId, processType, project.major ?? null);
    const supervisorIds = [project.supervisorId].filter(Boolean);
    const uids = await getResolvedUids(role, resource, supervisorIds);
    if (!uids.includes(user.uid)) continue;

    items.push({
      id: doc.id,
      type: 'final_grade',
      studentName: await studentNameFor(project),
      facultyId: resource.facultyId,
      title: `${project.titleHe || project.titleEn || ''} — ${data.finalGrade}`,
      submittedAt: data.gradedAt?.toDate?.()?.toISOString?.() ?? '',
      urgency: urgencyFromAge(data.gradedAt),
    });
  }

  return items;
}
