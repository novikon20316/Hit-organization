import admin from 'firebase-admin'
import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { db } from '../config/firebase.js';

export const getStudentProject = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    if (typeof id !== 'string' || !id) {
        return res.status(400).json({ message: 'Invalid or missing projectId' });
    }
    const projectDoc = await db.collection('projects').doc(id).get();

    if (!projectDoc.exists) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const data = projectDoc.data();
    return res.status(200).json({
      id: projectDoc.id,
      ...data,
      // Parse Firestore Timestamp to ISO string if needed by JSON client
      semesterStart: data?.semesterStart ? data.semesterStart.toDate().toISOString() : null,
    });
  } catch (error: any) {
    console.error('Error fetching student project:', error);
    return res.status(500).json({ error: error.message });
  }
};

export const submitMilestone = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id, milestoneId } = req.params;
    const { text } = req.body; // text payload sent by frontend 
    if (typeof milestoneId !== 'string' || !milestoneId) {
        return res.status(400).json({ message: 'Invalid or missing projectId' });
    }
    const milestoneRef = db.collection('milestones').doc(milestoneId);
    
    await milestoneRef.update({
      status: 'submitted',
      submittedAt: new Date(),
      submissionText: text || '',
    });

    return res.status(200).json({ success: true, message: 'Milestone submitted successfully' });
  } catch (error: any) {
    console.error('Error submitting milestone:', error);
    return res.status(500).json({ error: error.message });
  }
};
