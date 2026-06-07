import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { db } from '../config/firebase.js';


export const getDeadLines = async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    if (!id || typeof id !== 'string') {
        return res.status(400).json({ error: 'Invalid staff ID' });
    }
    try {
        const staffDoc = await db.collection('users').doc(id).get();
        if (!staffDoc.exists) {
            return res.status(404).json({ error: 'Staff member not found' });
        }
        if (!['supervisor', 'coordinator'].includes(staffDoc.data()?.roles)) {
            return res.status(403).json({ error: 'Access denied: Not a supervisor or coordinator' });
        }
        let deadlinesSnapshot;
        if(['faculty_admin', 'coordinator'].includes(staffDoc.data()?.roles)){
            const facultyId = staffDoc.data()?.facultyId;
            deadlinesSnapshot = await db.collection('milestones').where("facultyId", "==", facultyId).where("status", "==", "pending").get();
        }else{
            const major = staffDoc.data()?.major;
            deadlinesSnapshot = await db.collection('milestones').where("major", "==", major).where("status", "==", "pending").get();
        }
        const deadlines = deadlinesSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            // Parse Firestore Timestamp to ISO string if needed by JSON client
            deadline: doc.data().deadline ? doc.data().deadline.toDate().toISOString() : null,
        }));
        return res.status(200).json({ deadlines });
    } catch (error: any) {
        console.error('Error fetching deadlines:', error);
        return res.status(500).json({ error: error.message });
    }
}