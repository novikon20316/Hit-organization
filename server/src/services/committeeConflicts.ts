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
// everywhere the committee's real membership matters. CS pilot: also lists
// every milestone held at its committee stage for exactly this reason (see
// committeeReviewController.ts's onEnterCommitteeStage), with the swap made
// per milestone.

import { db } from '../config/firebase.js';
import type { ChainStage } from './workflowTemplates.js';
import { resolveCommitteeForMilestone, findSupervisorConflicts } from '../controllers/committeeController.js';

export interface CommitteeConflict {
  projectId: string;
  milestoneId: string;
  milestoneNameHe: string;
  milestoneNameEn: string;
  projectTitleHe: string;
  projectTitleEn: string;
  facultyId: string;
  major: string;
  conflictedUserId: string;
  conflictedUserName: string;
  conflictRole: 'chairman' | 'member';
  supervisorRole: 'supervisor' | 'secondary_supervisor';
  /** True when the milestone is actually blocked from reaching the committee
   *  (CS pilot — see onEnterCommitteeStage's committeeConflictHold), not just
   *  flagged at an administrative_secretary approve checkpoint. */
  blocking: boolean;
  /** The stand-in last used for this same person elsewhere in this project
   *  (another milestone, or the project-level recusal) — pre-selected in the
   *  picker; she can still choose someone else for this milestone. */
  suggestedReplacementId: string | null;
  /** The effective committee's current members (chairman included) — the
   *  picker leaves them out, since someone already on it can't stand in. */
  committeeMemberIds: string[];
}

/** True for a stage that genuinely blocks on administrative_secretary
 *  (action 'approve') — mirrors milestoneRouting.ts's isAutoAdvanceStage
 *  reasoning: a 'notify' stage is never actually "awaiting" her, it's a
 *  passthrough FYI, so it's not a real checkpoint to surface a conflict at.
 *  (A CS-pilot chain's 'notify' stage is covered by committeeConflictHold
 *  instead — see findCommitteeConflictsForScopes.) */
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
  const projectsSnap = await db.collection('projects').where('major', 'in', majors.slice(0, 30)).get();
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
    const projectMilestones = milestonesByProject.get(projectDoc.id) ?? [];
    // One row per milestone that's either held (CS pilot) or sitting at an
    // administrative_secretary approve checkpoint — each milestone gets its
    // own replacement choice.
    const pendingMilestones = projectMilestones.filter((doc) => {
      const m = doc.data();
      if (m.committeeConflictHold) return true;
      const routing: ChainStage[] = m.routing ?? [];
      return isPendingOnAdministrativeSecretary(routing[m.currentStageIndex ?? 0]);
    });

    for (const milestoneDoc of pendingMilestones) {
      const m = milestoneDoc.data();
      const committee = await resolveCommitteeForMilestone(m, project);
      if (!committee) continue;
      for (const conflict of findSupervisorConflicts(committee, project)) {
        userIdsToFetch.add(conflict.userId);
        // Most recent stand-in for this person on another milestone of the
        // same project, else the project-level one.
        const previous = projectMilestones
          .filter((d) => d.id !== milestoneDoc.id && d.data().committeeMemberSubstitutions?.[conflict.userId])
          .map((d) => d.data().committeeMemberSubstitutions[conflict.userId] as string);
        const suggested = previous[previous.length - 1] ?? project.committeeMemberSubstitutions?.[conflict.userId] ?? null;
        conflicts.push({
          projectId: projectDoc.id,
          milestoneId: milestoneDoc.id,
          milestoneNameHe: m.nameHe ?? m.type ?? '',
          milestoneNameEn: m.nameEn ?? m.type ?? '',
          projectTitleHe: project.titleHe ?? '',
          projectTitleEn: project.titleEn ?? '',
          facultyId: project.facultyId ?? '',
          major: project.major ?? '',
          conflictedUserId: conflict.userId,
          conflictedUserName: '',
          conflictRole: conflict.conflictRole,
          supervisorRole: conflict.supervisorRole,
          blocking: !!m.committeeConflictHold,
          suggestedReplacementId: suggested,
          committeeMemberIds: committee.memberIds,
        });
      }
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
