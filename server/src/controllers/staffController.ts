import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { db } from '../config/firebase.js';
import { resolveMyPendingSignoffs } from '../services/pendingSignoffs.js';


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
        const hasAccess = userRoles.some(role => ['supervisor', 'coordinator', 'faculty_admin'].includes(role));

        if (!hasAccess) {
            return res.status(403).json({ error: 'Access denied: Not a supervisor, coordinator, or faculty_admin' });
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
        // daysLeft/urgency were never actually computed here — every caller
        // (DeadlinesTab.tsx) reading d.daysLeft off this response got
        // `undefined` and showed "N/A" for every single deadline. Same
        // thresholds/rounding as supervisorController.ts's per-project
        // currentMilestone so a milestone shows the same countdown and
        // color everywhere it appears.
        const now = Date.now();
        const DAY_MS = 24 * 60 * 60 * 1000;
        const deadlines = deadlinesSnapshot.docs.map(doc => {
            const data = doc.data();
            const dueDate = data.dueDate?.toDate?.() ?? null;
            const daysLeft = dueDate ? Math.ceil((dueDate.getTime() - now) / DAY_MS) : null;
            return {
                id: doc.id,
                ...data,
                deadline: data.deadline ? data.deadline.toDate().toISOString() : null,
                dueDate: dueDate ? dueDate.toISOString() : null,
                daysLeft,
            };
        });
        return res.status(200).json({ deadlines });
    } catch (error: any) {
        console.error('Error fetching deadlines:', error);
        return res.status(500).json({ error: error.message });
    }
}

/**
 * GET /api/staff/pending-signoffs
 * Whatever examiner-invitation / final-grade sign-offs the calling user is
 * currently authorized to act on, regardless of role — see
 * services/pendingSignoffs.ts. Always "my own"; no route params.
 */
export const getMyPendingSignoffs = async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized.' });
    try {
        const items = await resolveMyPendingSignoffs(req.user);
        return res.status(200).json({ items });
    } catch (error: any) {
        console.error('getMyPendingSignoffs error:', error);
        return res.status(500).json({ message: error.message || 'Failed to load pending sign-offs.' });
    }
};