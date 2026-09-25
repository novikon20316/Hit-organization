// src/services/committeeConflicts.ts
//
// "Replace Committee Member" — administrative_secretary's conflict-of-
// interest detector. A project's supervisor (or secondary supervisor)
// shouldn't ALSO sit on the committee reviewing that same project — this
// finds every project in her scope where that overlap exists AND it's
// currently her turn to act (a chain-of-command checkpoint that already
// puts the project in front of her, reused as the moment to catch and fix
// this rather than a separate standing audit). See committeeController.ts's
// resolveCommitteeForProject/applyCommitteeSubstitutions for how the fix
// itself (a per-project recusal, not a permanent committee edit) is applied
// everywhere the committee's real membership matters.

import { db } from '../config/firebase.js';
import type { ChainStage } from './workflowTemplates.js';
import { resolveCommitteeForProject } from '../controllers/committeeController.js';

export interface CommitteeConflict {
  projectId: string;
  milestoneId: string;
  projectTitleHe: string;
  projectTitleEn: string;
  facultyId: string;
  major: string;
  conflictedUserId: string;
  conflictedUserName: string;
  conflictRole: 'chairman' | 'member';
  supervisorRole: 'supervisor' | 'secondary_supervisor';
}

/** True for a stage that genuinely blocks on administrative_secretary
 *  (action 'approve') — mirrors milestoneRouting.ts's isAutoAdvanceStage
 *  reasoning: a 'notify' stage is never actually "awaiting" her, it's a
 *  passthrough FYI, so it's not a real checkpoint to surface a conflict at. */
function isPendingOnAdministrativeSecretary(stage: ChainStage | undefined): boolean {
  return !!stage && stage.role === 'administrative_secretary' && stage.action === 'approve';
}

/** Every distinct major named across `scopes` (entries with no major set are
 *  skipped — a whole-faculty coordinator isn't narrowed to any single
 *  subject's committee, so this feature has nothing specific to show her). */
function majorsFromScopes(scopes: Array<{ major?: string }>): string[] {
  return [...new Set(scopes.map((s) => s.major).filter((m): m is string => !!m))];
}

export async function findCommitteeConflictsForScopes(
  scopes: Array<{ facultyId: string; major?: string }>
): Promise<CommitteeConflict[]> {
  const majors = majorsFromScopes(scopes);
  if (majors.length === 0) return [];

  // Major slugs are unique institution-wide (see lib/faculties.ts) — a
  // single 'in' query covers every faculty her scopes span, no facultyId
  // grouping needed.
  const projectsSnap = await db.collection('projects').where('major', 'in', majors).get();
  if (projectsSnap.empty) return [];

  const projectIds = projectsSnap.docs.map((d) => d.id);
  const milestonesByProject = new Map<string, FirebaseFirestore.QueryDocumentSnapshot[]>();
  // Firestore 'in' caps at 30 — chunk defensively even though a single
  // department realistically has far fewer active projects than that.
  for (let i = 0; i < projectIds.length; i += 30) {
    const chunk = projectIds.slice(i, i + 30);
    const snap = await db.collection('milestones').where('projectId', 'in', chunk).get();
    snap.docs.forEach((doc) => {
      const pid = doc.data().projectId as string;
      const list = milestonesByProject.get(pid) ?? [];
      list.push(doc);
      milestonesByProject.set(pid, list);
    });
  }

  const conflicts: CommitteeConflict[] = [];
  const userIdsToFetch = new Set<string>();

  for (const projectDoc of projectsSnap.docs) {
    const project = projectDoc.data();
    const pendingMilestone = (milestonesByProject.get(projectDoc.id) ?? []).find((doc) => {
      const m = doc.data();
      const routing: ChainStage[] = m.routing ?? [];
      const stage = routing[m.currentStageIndex ?? 0];
      return isPendingOnAdministrativeSecretary(stage);
    });
    if (!pendingMilestone) continue;

    const committee = await resolveCommitteeForProject(project);
    if (!committee) continue;

    const supervisorEntries: Array<{ id: string | undefined; role: CommitteeConflict['supervisorRole'] }> = [
      { id: project.supervisorId, role: 'supervisor' },
      { id: project.secondarySupervisorId, role: 'secondary_supervisor' },
    ];
    for (const { id, role } of supervisorEntries) {
      if (!id) continue;
      const conflictRole: CommitteeConflict['conflictRole'] | null =
        committee.chairmanId === id ? 'chairman' : committee.memberIds.includes(id) ? 'member' : null;
      if (!conflictRole) continue;
      userIdsToFetch.add(id);
      conflicts.push({
        projectId: projectDoc.id,
        milestoneId: pendingMilestone.id,
        projectTitleHe: project.titleHe ?? '',
        projectTitleEn: project.titleEn ?? '',
        facultyId: project.facultyId ?? '',
        major: project.major ?? '',
        conflictedUserId: id,
        conflictedUserName: '',
        conflictRole,
        supervisorRole: role,
      });
    }
  }

  if (userIdsToFetch.size > 0) {
    const snaps = await db.getAll(...[...userIdsToFetch].map((id) => db.collection('users').doc(id)));
    const namesById = new Map<string, string>();
    snaps.forEach((s) => { if (s.exists) namesById.set(s.id, s.data()?.displayName ?? s.id); });
    conflicts.forEach((c) => { c.conflictedUserName = namesById.get(c.conflictedUserId) ?? c.conflictedUserId; });
  }

  return conflicts;
}
