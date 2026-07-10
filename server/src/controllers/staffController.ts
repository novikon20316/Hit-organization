import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { db } from '../config/firebase.js';


export const getDeadLines = async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    if (!id || typeof id !== 'string') {
        return res.status(400).json({ error: 'Invalid staff ID' });
    }
    // Every mobile call site passes the signed-in user's own uid — this endpoint
    // was previously trusting the TARGET doc's stored role instead of the
    // caller's identity, letting any authenticated user view another staff
    // member's (or coordinator's whole-faculty) pending-milestone deadlines.
    if (req.user?.uid !== id) {
        return res.status(403).json({ error: 'Forbidden.' });
    }
    try {
        const staffDoc = await db.collection('users').doc(id).get();
        if (!staffDoc.exists) {
            return res.status(404).json({ error: 'Staff member not found' });
        }
        const staffData = staffDoc.data();
        // Combine the singular `role` field with the `roles` array — not every
        // user doc has `roles` populated (e.g. accounts created before that
        // field existed only ever set `role`), so checking `roles` alone
        // false-negatives for them.
        const userRoles: string[] = [
            ...(staffData?.role ? [staffData.role as string] : []),
            ...(Array.isArray(staffData?.roles) ? staffData.roles : []),
        ];
        console.log('Fetching deadlines for staff member with roles:', userRoles);
        const hasAccess = userRoles.some(role => ['supervisor', 'coordinator'].includes(role));
        
        if (!hasAccess) {
            return res.status(403).json({ error: 'Access denied: Not a supervisor or coordinator' });
        }
        let deadlinesSnapshot;
        const isFacultyAdminOrCoordinator = userRoles.some(role => ['faculty_admin', 'coordinator'].includes(role));
        if (isFacultyAdminOrCoordinator) {
            const facultyId = staffData?.facultyId;
            deadlinesSnapshot = await db.collection('milestones')
                .where("facultyId", "==", facultyId)
                .where("status", "==", "pending")
                .get();
        } else {
            deadlinesSnapshot = await db.collection('milestones')
                .where("supervisorId", "==", id)
                .where("status", "==", "pending")
                .get();
        }
        const deadlines = deadlinesSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            deadline: doc.data().deadline ? doc.data().deadline.toDate().toISOString() : null,
        }));
        return res.status(200).json({ deadlines });
    } catch (error: any) {
        console.error('Error fetching deadlines:', error);
        return res.status(500).json({ error: error.message });
    }
}