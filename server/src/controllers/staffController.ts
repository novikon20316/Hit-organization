import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { db } from '../config/firebase.js';


export const getDeadLines = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const deadlinesSnapshot = await db.collection('milestones').where("status", "==", "pending").get();
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