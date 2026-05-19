import express, { Request, Response } from 'express';
import cors from 'cors';
import { db } from './config/firebase.js';

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS so your Expo mobile app can communicate with it
app.use(cors());

// Parse JSON requests (fully supports UTF-8 encoded bilingual/Hebrew strings)
app.use(express.json({ limit: '10mb' })); 

// Basic health check route
app.get('/', (req: Request, res: Response) => {
  res.status(200).json({ status: 'Server running smoothly' });
});

/**
 * Example Endpoint: Sync or Create User Profile (Bilingual Safe)
 * Handlers use the specific document UID generated during client-side registration
 */
app.post('/api/users/sync', async (req: Request, res: Response) => {
  try {
    const { newUid, email, fullName, role, faculty } = req.body;

    if (!newUid || !email) {
      return res.status(400).json({ error: 'Missing critical user identifiers.' });
    }

    // Save directly to Firestore using the explicitly passed newUid
    const userRef = db.collection('users').doc(newUid);
    
    await userRef.set({
      email,
      fullName, // This safely handles Hebrew strings like "דור נוביק" without data loss
      role,     // 'student', 'supervisor', 'coordinator'
      faculty,
      createdAt: new Date().toISOString()
    }, { merge: true });

    return res.status(200).json({ success: true, message: 'Profile synchronized successfully.' });
  } catch (error: any) {
    console.error('Error syncing user profile:', error);
    return res.status(500).json({ error: error.message });
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});