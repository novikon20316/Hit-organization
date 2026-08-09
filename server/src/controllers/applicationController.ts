import admin from 'firebase-admin'
import { AuthenticatedRequest } from '../middleware/auth.js'
import { Response } from 'express'
import { screenApplication } from '../services/cvScreeningService.js'
import { reviewApplication } from '../services/applicationReviewService.js'
import { extractCompletedCourses } from '../services/transcriptExtractionService.js'
import { normalizePrerequisites, normalizeCompletedCourses } from '../services/prerequisites.js'
import { notifyUser } from '../services/notify.js'

const db = admin.firestore();

// Auto-populates a student's completedCourses from whatever courses/grades
// transcriptExtractionService actually read off their uploaded transcript —
// the first real signal this system ever has for a student's grades,
// instead of relying solely on a system_admin's manual entry
// (adminController.ts; students can no longer self-report this themselves).
// Upserts by subject: a freshly-read grade overwrites whatever was there
// before (from an earlier, possibly less complete, transcript).
async function mergeExtractedGradesIntoCompletedCourses(
  studentId: string,
  extractedGrades: { subject: string; grade: number }[]
) {
  if (extractedGrades.length === 0) return;
  const studentRef = db.collection('users').doc(studentId);

  // A plain get()-then-update() here raced against a system_admin's manual
  // edit landing in between: whichever write committed last silently
  // replaced the whole array, discarding the other's grade for any subject
  // it didn't itself touch. A transaction closes that window — Firestore
  // detects if the document changed since this read and automatically
  // retries with a fresh one, so this merge always builds on the latest
  // data no matter what else wrote to the doc in the meantime.
  await db.runTransaction(async (tx) => {
    const studentSnap = await tx.get(studentRef);
    if (!studentSnap.exists) return;

    const existing = normalizeCompletedCourses(studentSnap.data()?.completedCourses);
    const merged = new Map(existing.map((c) => [c.subject, c]));
    for (const g of extractedGrades) merged.set(g.subject, { subject: g.subject, grade: g.grade });

    tx.update(studentRef, { completedCourses: [...merged.values()] });
  });
}

// ─── GET /api/applications/last-uploaded-files ───────────────────────────────
// The transcript/CV URLs from the student's most recent application (any
// status, not just pending) — lets the apply modal default to "reuse last
// file" so a repeat applicant can just click submit instead of re-uploading
// the same PDFs every time. A plain equality-only query (no orderBy) so it
// doesn't need a composite Firestore index; a student's application count is
// small enough to sort in memory.
export const getLastUploadedFiles = async (req: AuthenticatedRequest, res: Response) => {
  const studentId = req.user?.uid;
  if (!studentId) return res.status(401).json({ message: 'Unauthorized' });
  try {
    const snap = await db.collection('applications').where('studentId', '==', studentId).get();
    if (snap.empty) return res.status(200).json({ transcriptUrl: '', cvUrl: '' });

    const latest = snap.docs
      .map((d) => d.data())
      .sort((a, b) => new Date(b.submittedAt ?? 0).getTime() - new Date(a.submittedAt ?? 0).getTime())[0];

    return res.status(200).json({ transcriptUrl: latest?.transcriptUrl ?? '', cvUrl: latest?.cvUrl ?? '' });
  } catch (error) {
    console.error('getLastUploadedFiles error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

export const pendingApplication = async(req:AuthenticatedRequest,res:Response) =>{
    const studentId = req.user?.uid;
    if(!studentId){
        return res.status(500).json({
            message: "didnt figure who the uid is for"
        })
    }
    try{
        const studentDoc = await db.collection('users').doc(studentId).get();
        
        // 2. Correctly check if the document exists in Firestore
        if (!studentDoc.exists) {
            return res.status(404).json({ message: "User document not found." });
        }
        
        // 3. Extract the data and the degree field
        const studentData = studentDoc.data();
        
        // Using 'degreeType' based on what your frontend expects, with a safe fallback
        const degree = studentData?.degreeType || 'bachelors'; 

        // 4. Query your applications collection for this student's pending applications
        const applicationsSnapshot = await db.collection('applications')
            .where('studentId', '==', studentId)
            .where('status', 'in', ['applied', 'meeting_requested'])
            .get();

        // 5. Format the documents into a clean array
        const pendingApps = applicationsSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        // 6. Return exactly what the frontend is looking for: { applications: [...] }
        return res.status(200).json({ 
            applications: pendingApps,
            degree: degree // Included just in case you need it for debugging!
        });
    
    }catch(error){
        console.error('Failed to return the data for pendingApplication:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
}

export const applyApplication = async(req:AuthenticatedRequest,res:Response) =>{
    const { projectId, transcriptUrl, cvUrl, notes, selectedProjectType } = req.body;
    const studentId = req.user?.uid;

    if (!studentId) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    if (!projectId || typeof projectId !== 'string') {
        return res.status(400).json({ success: false, message: 'projectId is required' });
    }
    try {
        // ✅ Fetch student + project in parallel (was only fetching project before)
        const [projectSnap, studentSnap] = await Promise.all([
        db.collection('projects').doc(projectId).get(),
        db.collection('users').doc(studentId).get(),
        ]);

        if (!projectSnap.exists) {
        return res.status(404).json({ success: false, message: 'Project not found.' });
        }

        const projectData = projectSnap.data() ?? {};
        const studentData = studentSnap.data() ?? {};

        // A project restricted to a specific major (set by a supervisor whose
        // own assignedMajors narrows them to it — see supervisorController.ts's
        // createSupervisorProject) rejects applicants from other majors. This
        // is the real access-control boundary for the feature — the browse
        // query/UI filter is just a convenience; a student could otherwise
        // reach this endpoint directly with any projectId. No major on the
        // project means open to every major, unchanged from today.
        if (projectData.major && studentData.major !== projectData.major) {
        return res.status(403).json({ success: false, message: 'This project is not open to your major.' });
        }

        // The query/UI filter a student browses through already narrows by
        // status/degree/type, but — same reasoning as the major check above
        // — this endpoint is the real access-control boundary, reachable
        // directly with any projectId. `?? [scalar]` keeps this correct
        // against pre-migration projects that only ever had the single
        // scalar degreeType/projectType field, no arrays yet.
        if (projectData.status && projectData.status !== 'active') {
        return res.status(400).json({ success: false, message: 'This project is no longer accepting applications.' });
        }

        const capacity = projectData.maxStudents ?? projectData.NumberOfStudents ?? 1;
        const enrolledCount = (projectData.enrolledStudentIds ?? []).length;
        if (enrolledCount >= capacity) {
        return res.status(400).json({ success: false, message: 'This project has already reached its student capacity.' });
        }

        const projectDegreeTypes: string[] = projectData.degreeTypes ?? (projectData.degreeType ? [projectData.degreeType] : []);
        const projectProjectTypes: string[] = projectData.projectTypes ?? (projectData.projectType ? [projectData.projectType] : []);

        if (projectDegreeTypes.length > 0 && !projectDegreeTypes.includes(studentData.degreeType)) {
        return res.status(403).json({ success: false, message: 'This project is not open to your degree type.' });
        }

        // Only a project open to more than one track actually requires the
        // student to pick — otherwise there's nothing ambiguous to choose.
        if (projectProjectTypes.length > 1) {
        if (!selectedProjectType) {
            return res.status(400).json({ success: false, message: 'This project offers more than one track — please choose one when applying.' });
        }
        if (!projectProjectTypes.includes(selectedProjectType)) {
            return res.status(400).json({ success: false, message: 'Invalid track selection for this project.' });
        }
        }

        // ✅ Duplicate application check
        const existing = await db.collection('applications')
        .where('studentId', '==', studentId)
        .where('projectId', '==', projectId)
        .get();

        if (!existing.empty) {
        return res.status(409).json({ success: false, message: 'You already applied to this project.' });
        }

        const newApplicationRef = db.collection('applications').doc();
        await newApplicationRef.set({
        coverNote:      notes          ?? '',
        cvUrl:          cvUrl          ?? '',
        transcriptUrl:  transcriptUrl  ?? '',
        projectId,
        studentId,
        supervisorId:   projectData.supervisorId ?? null,
        facultyId:      projectData.facultyId    ?? null,

        // ✅ Denormalized fields — these are what was missing
        studentName:    studentData.displayName ?? studentData.displayNameHe ?? '',
        studentEmail:   studentData.email       ?? '',
        degreeType:     studentData.degreeType  ?? '',
        // The track this application was submitted under — the student's
        // explicit choice when the project offered more than one, else the
        // project's own single/primary projectType so the field is always
        // populated for enrollStudentInProject to resolve milestones from.
        selectedProjectType: selectedProjectType ?? projectData.projectType ?? null,
        projectTitleHe: projectData.titleHe     ?? '',
        projectTitleEn: projectData.titleEn     ?? '',

        status:         'applied',
        submittedAt:    new Date().toISOString(),
        reviewedAt:     null,
        supervisorNote: null,
        meetingDate:    null,
        });

        // Best-effort — a notification failure must never block or fail the
        // student's application submission.
        if (projectData.supervisorId) {
            try {
                const studentName = studentData.displayName ?? studentData.displayNameHe ?? '';
                await notifyUser({
                    recipientId: projectData.supervisorId,
                    type: 'application_received',
                    titleHe: '📥 התקבלה בקשה חדשה',
                    titleEn: '📥 New Application Received',
                    bodyHe: `${studentName} הגיש/ה בקשה להצטרף לפרויקט "${projectData.titleHe ?? ''}".`,
                    bodyEn: `${studentName} applied to join your project "${projectData.titleEn ?? ''}".`,
                    relatedProjectId: projectId,
                    emailData: {
                        studentName,
                        projectTitle: { he: projectData.titleHe ?? '', en: projectData.titleEn ?? '' },
                    },
                });
            } catch (notifyError) {
                console.error(`application_received notification failed for supervisor ${projectData.supervisorId}:`, notifyError);
            }
        }

        // MEDIUM FIX: this used to `await screenApplication(...)` before
        // responding — the application doc was already saved by this point,
        // so a slow AI provider held the student's HTTP response open for
        // no reason (the data-loss risk this was guarding against doesn't
        // exist; the write already succeeded). Respond first, screen in the
        // background — a screening failure still can't affect the
        // already-submitted application, same as before, it just no longer
        // makes the student's request hang while it happens.
        screenApplication({
            cvUrl: cvUrl ?? '',
            // normalizePrerequisites also accepts the legacy plain string[]
            // shape, for any project created before minGrade shipped.
            prerequisites: normalizePrerequisites(projectData.prerequisites),
            requiredSkills: projectData.requiredSkills ?? [],
        })
            .then((aiScreening) => newApplicationRef.update({ aiScreening }))
            .catch((screeningError) => {
                console.error(`CV screening failed for application ${newApplicationRef.id}:`, screeningError);
            });

        // A separate, independent AI pass — a set of pass/fail checks (today:
        // grades vs. prerequisites, read off the transcript; more coming
        // later) rolled up into an approve/meeting/reject recommendation.
        // Best-effort, same as the CV screening above — never blocks or
        // affects the already-submitted application.
        reviewApplication({
            transcriptUrl: transcriptUrl ?? '',
            prerequisites: normalizePrerequisites(projectData.prerequisites),
        })
            .then((aiReview) => newApplicationRef.update({ aiReview }))
            .catch((reviewError) => {
                console.error(`AI application review failed for application ${newApplicationRef.id}:`, reviewError);
            });

        // Separate, best-effort pass over the SAME transcript — reads every
        // course + grade on it (not just this project's prerequisites, unlike
        // reviewApplication above) to populate the student's own
        // completedCourses. Runs on every submission, not just a literal
        // "first ever" upload — upserting is safe and keeps the record
        // current if a later transcript is more complete or corrected.
        extractCompletedCourses({ transcriptUrl: transcriptUrl ?? '' })
            .then((courses) => mergeExtractedGradesIntoCompletedCourses(studentId, courses))
            .catch((extractError) => {
                console.error(`Transcript course extraction failed for application ${newApplicationRef.id}:`, extractError);
            });

        return res.status(201).json({ success: true, message: 'Application submitted successfully.' });
    } catch (error) {
        console.error('applyApplication error:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

export const withdrawApplication = async(req:AuthenticatedRequest,res:Response) =>{
    const {id} = req.params
    const student = req.user?.uid;
    if(!student){
        return res.status(404).json({
            success:false,
            message: "User is not aauthorized to do that"
        })
    }
    if(!id || typeof id !== 'string'){
        return res.status(500).json({
            success:false,
            message:"Id is not good"
        })
    }
    try{
        const applyRef = db.collection('applications').doc(id);
        const applySnap = await applyRef.get();

        if (!applySnap.exists) {
            return res.status(404).json({ message: 'Target application record not found.' });
        }

        const applicationData = applySnap.data();

        // 🔒 Security Check: Ensure the student attempting the deletion is the one who created it!
        if (applicationData?.studentId !== student) {
            return res.status(403).json({
                success: false,
                message: "Forbidden: You are not authorized to withdraw another student's application."
            });
        }
        await applyRef.delete();

        return res.status(200).json({ 
            success: true, 
            message: 'withdrawel is done successfully.' 
        });
    }catch(error){
        console.error('Failed to withdraw student from application:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
}