import admin from 'firebase-admin'
import { AuthenticatedRequest } from '../middleware/auth.js'
import { Response } from 'express'

const db = admin.firestore();

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
    const { projectId, transcriptUrl, cvUrl, notes } = req.body;
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
        projectTitleHe: projectData.titleHe     ?? '',
        projectTitleEn: projectData.titleEn     ?? '',

        status:         'applied',
        submittedAt:    new Date().toISOString(),
        reviewedAt:     null,
        supervisorNote: null,
        meetingDate:    null,
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