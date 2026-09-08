// src/services/parallelSignoffs.ts
//
// Runtime engine for WorkflowMilestoneSpec.preGradeSignoffs — independent,
// PARALLEL signoffs that unlock the instant a STUDENT submits a milestone,
// completely decoupled from that same milestone's `routing`/
// `currentStageIndex` chain (contrast with committeeReviewController.ts's
// onEnterCommitteeStage, which only fires once a SEQUENTIAL chain's current
// stage happens to be 'committee'). See workflowTemplates.ts's
// preGradeSignoffs doc comment and parallelSignoffController.ts for the two
// one-shot actions (committee chair decision, examiner #1 signoff) this
// unlocks.

import { db } from '../config/firebase.js';
import { notifyUser } from './notify.js';
import { resolveCommitteeForProject } from '../controllers/committeeController.js';

/** Called right after a milestone with `preGradeSignoffs` configured
 *  transitions to `status: 'submitted'` (see milestoneController.ts's
 *  submitMilestone) — regardless of what `routing[0].role` is (here,
 *  'supervisor', which is exactly why this can't reuse onEnterCommitteeStage).
 *  Snapshots `parallelCommitteeId` (mirrors currentCommitteeId's role for the
 *  sequential chain, but kept as a distinct field so the two mechanisms never
 *  collide on the same milestone) and notifies whoever can act right now.
 *  Never throws — a notification failure must not block the student's own
 *  submission, which has already committed by the time this runs. */
export async function onMilestoneNeedsParallelSignoffs(
  milestoneId: string,
  milestoneData: FirebaseFirestore.DocumentData,
): Promise<void> {
  const preGradeSignoffs = milestoneData.preGradeSignoffs as { committee?: boolean; examinerOne?: boolean } | undefined;
  if (!preGradeSignoffs?.committee && !preGradeSignoffs?.examinerOne) return;

  const projectId = milestoneData.projectId;
  const projectSnap = projectId ? await db.collection('projects').doc(projectId).get() : null;
  const projectData = projectSnap?.exists ? projectSnap.data()! : null;

  const studentNames: string[] = projectData?.enrolledStudentIds?.length
    ? await Promise.all((projectData.enrolledStudentIds as string[]).map(async (sid: string) => {
        const s = await db.collection('users').doc(sid).get();
        return s.data()?.displayName ?? sid;
      }))
    : [];

  if (preGradeSignoffs.committee) {
    const committee = projectData ? await resolveCommitteeForProject(projectData) : null;
    await db.collection('milestones').doc(milestoneId).update({ parallelCommitteeId: committee?.id ?? null });
    if (committee?.chairmanId) {
      try {
        await notifyUser({
          recipientId: committee.chairmanId,
          type: 'general',
          inAppType: 'committee_chair_decision_requested',
          titleHe: 'החלטת המשך ממתינה לחתימתך',
          titleEn: 'A continue/not-continue decision awaits your signature',
          bodyHe: `${studentNames.join(', ') || 'סטודנט'} הגיש/ה את "${milestoneData.nameHe ?? milestoneData.type}" — נדרשת החלטתך כיו"ר הוועדה.`,
          bodyEn: `${studentNames.join(', ') || 'A student'} submitted "${milestoneData.nameEn ?? milestoneData.type}" — your decision as committee chair is needed.`,
          relatedProjectId: projectId ?? null,
          relatedMilestoneId: milestoneId,
          targetScreen: 'committees',
        });
      } catch (err) {
        console.error(`onMilestoneNeedsParallelSignoffs: chairman notify failed for ${committee.chairmanId}:`, err);
      }
    }
    // No committee configured yet — same "don't fail silently" reasoning as
    // onEnterCommitteeStage, but this is a supplementary gate rather than the
    // milestone's only path forward, so it's a console log, not a
    // system_admin-wide alert blast for every faculty missing a committee.
    if (!committee) {
      console.error(`onMilestoneNeedsParallelSignoffs: no committee configured for milestone ${milestoneId}'s project ${projectId} — committee chair decision cannot be recorded until one exists.`);
    }
  }

  if (preGradeSignoffs.examinerOne) {
    const examinerOneId: string | undefined = (milestoneData.examinerIds as string[] | undefined)?.[0];
    if (examinerOneId) {
      try {
        await notifyUser({
          recipientId: examinerOneId,
          type: 'general',
          inAppType: 'examiner_one_signoff_requested',
          titleHe: 'ממתין לחתימתך כבוחן ראשי',
          titleEn: 'Awaiting your signature as chief examiner',
          bodyHe: `${studentNames.join(', ') || 'סטודנט'} הגיש/ה את "${milestoneData.nameHe ?? milestoneData.type}" — נדרש אישורך.`,
          bodyEn: `${studentNames.join(', ') || 'A student'} submitted "${milestoneData.nameEn ?? milestoneData.type}" — your approval is needed.`,
          relatedProjectId: projectId ?? null,
          relatedMilestoneId: milestoneId,
          targetScreen: 'examiner_defenses',
        });
      } catch (err) {
        console.error(`onMilestoneNeedsParallelSignoffs: examiner #1 notify failed for ${examinerOneId}:`, err);
      }
    }
    // examinerIds not populated yet (examiners for this project haven't been
    // assigned) — nothing to notify. Not an error: the pending state renders
    // itself later, from absent data, once assignExaminers eventually runs
    // for this project (see workflowTemplates.ts's preGradeSignoffs doc).
  }
}
