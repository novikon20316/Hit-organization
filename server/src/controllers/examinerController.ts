// backend/controllers/examinerController.ts
import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.js';
import admin from 'firebase-admin';
import { submitCandidateDatesAndResolve, examinerKeyOf } from '../services/defenseScheduling.js';
import { logAuditEvent } from '../services/auditLog.js';
import { academicYearToHebrew } from '../services/hebrewYear.js';

const db = admin.firestore();

/**
 * GET /api/examiner/dashboard
 * FIX: was reading examinerId from req.params — frontend sends no param,
 * it relies on the auth token. Now reads uid from req.user instead.
 */
export const getExaminerDashboard = async (req: AuthenticatedRequest, res: Response) => {
  const examinerId = req.user?.uid; // <-- FIXED: was const { examinerId } = req.params

  if (!examinerId) {
    return res.status(401).json({ message: 'Unauthorized: missing examiner identity.' });
  }

  try {
    const milestonesSnap = await db.collection('milestones')
      .where('examinerIds', 'array-contains', examinerId)
      .get();

    if (milestonesSnap.empty) {
      return res.status(200).json({ milestones: [] });
    }

    const assignedMilestones = await Promise.all(
      milestonesSnap.docs.map(async (milestoneDoc) => {
        const milestoneData = milestoneDoc.data();

        let projectTitleHe = 'Unknown';
        let projectTitleEn = 'Unknown';
        // Data-Science-only paper-form fields (see ExaminerEvaluationModal.tsx's
        // isDataScience header block) — harmless to compute for every faculty,
        // the client decides whether to render them.
        let academicYear: string | null = null;
        let academicYearHebrew: string | null = null;
        let projectStartDate: string | null = null;
        let major: string | null = null;

        if (milestoneData.projectId) {
          const projectSnap = await db.collection('projects').doc(milestoneData.projectId).get();
          if (projectSnap.exists) {
            const projectData = projectSnap.data();
            projectTitleHe = projectData?.titleHe || 'Unknown';
            projectTitleEn = projectData?.titleEn || 'Unknown';
            academicYear = projectData?.academicYear ?? null;
            academicYearHebrew = academicYearToHebrew(academicYear);
            projectStartDate = projectData?.projectStartDate?.toDate?.().toISOString?.() ?? null;
            major = projectData?.major ?? null;
          }
        }

        // Cross-milestone summary ("grades & files by milestone") for this
        // examiner's expanded card — mobile/app/examinor/home.tsx has always
        // read this off milestoneHistory, but nothing ever wrote it, so it
        // was always empty. Computed here from the sibling milestones of the
        // same project rather than stored, since it's just a projection of
        // data that already lives on those other milestone docs.
        let milestoneHistory: Array<{ type: string; supervisorScore: number | null; supervisorComment: string; fileUrls: string[]; status: string }> = [];
        if (milestoneData.projectId) {
          const siblingsSnap = await db.collection('milestones')
            .where('projectId', '==', milestoneData.projectId)
            .get();
          milestoneHistory = siblingsSnap.docs
            .filter((d) => d.id !== milestoneDoc.id)
            .map((d) => {
              const sib = d.data();
              return {
                type: sib.type,
                supervisorScore: sib.supervisorScore ?? null,
                supervisorComment: sib.supervisorComment ?? '',
                fileUrls: sib.fileUrls ?? [],
                status: sib.status,
              };
            });
        }

        return {
          id: milestoneDoc.id,
          projectId: milestoneData.projectId,
          projectTitleHe,
          projectTitleEn,
          academicYear,
          academicYearHebrew,
          projectStartDate,
          major,
          facultyId: milestoneData.facultyId || '',
          type: milestoneData.type,
          status: milestoneData.status,
          studentNames: milestoneData.studentNames || [],
          studentIds: milestoneData.studentIds || [],
          supervisorId: milestoneData.supervisorId,
          supervisorScore: milestoneData.supervisorScore || null,
          supervisorName: milestoneData.supervisorName || 'Unknown',
          examinerIds: milestoneData.examinerIds || [],
          // Per-milestone configured grading rubric (see workflowTemplates.ts's
          // GradingComponentSpec) — empty means GradeExaminerModal falls back
          // to its hardcoded default rubric.
          gradingComponents: milestoneData.gradingComponents || [],
          // Identity-keyed defense milestones (post-generalization) carry
          // examinerScores instead — echoed alongside the legacy fields
          // (which stay null/absent for a new-model milestone) so the client
          // can branch on whichever is present.
          examinerScores: milestoneData.examinerScores ?? null,
          examiner1Score: milestoneData.examiner1Score || null,
          examiner2Score: milestoneData.examiner2Score || null,
          examiner1GradeId: milestoneData.examiner1GradeId || null,
          examiner2GradeId: milestoneData.examiner2GradeId || null,
          gradeWeights: milestoneData.gradeWeights || null,
          // Three-rubric final-grade workflow (see workflowTemplates.ts's
          // finalGradeComponents) — empty/absent means this milestone still
          // uses the single shared gradingComponents rubric above.
          finalGradeComponents: milestoneData.finalGradeComponents ?? null,
          // Generic chain-routing milestones (see milestoneRouting.ts's
          // isChainDriven — e.g. the examiner-only 'poster' milestone type)
          // carry neither examinerScores nor finalGradeComponents, so the
          // client needs these to tell "already graded" apart from "not yet"
          // — see AssignmentCard.tsx's `graded` computation.
          stageScores: milestoneData.stageScores ?? null,
          routing: milestoneData.routing ?? null,
          // No-supervisor-stage milestones (see workflowTemplates.ts's
          // examinerOnlyGrading) plus their non-scored yes/no Q&A form, if
          // configured — see ExaminerFormFieldsModal.tsx.
          examinerOnlyGrading: milestoneData.examinerOnlyGrading ?? false,
          examinerFormFields: milestoneData.examinerFormFields ?? [],
          // Only this examiner's own answers, same "no peeking at a
          // co-examiner's submission" reasoning as examinerEvaluations below.
          examinerFormAnswers: milestoneData.examinerFormAnswers?.[examinerId]
            ? { [examinerId]: milestoneData.examinerFormAnswers[examinerId] }
            : {},
          // Only this examiner's own entry — a co-examiner's rubric
          // scores/comments are examiner-only content too, not just
          // off-limits to the student/supervisor.
          examinerEvaluations: milestoneData.examinerEvaluations?.[examinerId]
            ? { [examinerId]: milestoneData.examinerEvaluations[examinerId] }
            : {},
          milestoneHistory,
          revisionHistory: milestoneData.revisionHistory ?? [],
          defenseDate: milestoneData.dueDate?.toDate?.().toISOString?.() ?? null,
          defenseRoom: milestoneData.defenseRoom ?? null,
          defenseBuilding: milestoneData.defenseBuilding ?? null,
          defenseTime: milestoneData.defenseTime ?? null,
          onlineDefenseLink: milestoneData.onlineDefenseLink ?? null,
          defensePanel: milestoneData.defensePanel ?? [],
          dateMatching: milestoneData.dateMatching ?? null,
        };
      })
    );

    res.status(200).json({ milestones: assignedMilestones });

  } catch (error) {
    console.error('Failed to fetch examiner dashboard:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * POST /api/examiner/milestones/:milestoneId/defense-dates
 * Internal examiner submits their candidate defense dates. Delegates to the
 * shared defenseScheduling service so internal and external examiners are
 * resolved through the exact same matching logic.
 * Body: { candidateDates: string[] }  (ISO 'YYYY-MM-DD', Sun-Thu only)
 */
export const submitDefenseDates = async (req: AuthenticatedRequest, res: Response) => {
  const { milestoneId } = req.params;
  const { candidateDates } = req.body;
  const examinerUid = req.user?.uid;

  if (!milestoneId || typeof milestoneId !== 'string') {
    return res.status(400).json({ message: 'Missing required milestoneId parameter.' });
  }
  if (!examinerUid) {
    return res.status(401).json({ message: 'Unauthorized: Unable to verify examiner credentials.' });
  }

  try {
    const examinerKey = examinerKeyOf({ type: 'internal', ref: examinerUid });
    const result = await submitCandidateDatesAndResolve(milestoneId, examinerKey, candidateDates);
    await logAuditEvent({
      userId: examinerUid,
      userRole: req.user?.role ?? 'internal_examiner',
      action: 'examiner_dates_submitted',
      entityType: 'milestone',
      entityId: milestoneId,
      newValue: { candidateDates },
    });
    return res.status(200).json({ success: true, ...result });
  } catch (error: any) {
    console.error('submitDefenseDates error:', error);
    return res.status(400).json({ message: error.message || 'Failed to submit candidate dates.' });
  }
};

export const getList = async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Internal examiners are app users whose `roles` array includes
    // 'internal_examiner' (see VALID_ROLES) — not a literal role of 'examiner'.
    const examinersSnap = await db.collection('users')
      .where('roles', 'array-contains', 'internal_examiner')
      .get();
    const examiners = examinersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    // Both call sites (coordinator/home.tsx, supervisor/dashboard.tsx) expect
    // res.data to be the array itself, not wrapped in { examiners }.
    res.status(200).json(examiners);
  } catch (error) {
    console.error('Failed to fetch examiners:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}