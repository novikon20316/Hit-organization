// services/notificationService.ts
import {
  collection,
  addDoc,
  serverTimestamp,
  query,
  where,
  getDocs,
  getDoc,
  doc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';

import { db } from '../src/firebase/firebase';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type NotifType =
  | 'project_published'
  | 'application_approved'
  | 'application_rejected'
  | 'meeting_requested'
  | 'milestone_graded'
  | 'milestone_deadline_7d'
  | 'milestone_deadline_1d';

export interface NotifPayload {
  type: NotifType;
  recipientId: string;

  titleHe: string;
  titleEn: string;
  bodyHe: string;
  bodyEn: string;

  relatedProjectId?: string;
  relatedMilestoneId?: string;

  pushToken?: string; // Expo push token
}

// ─────────────────────────────────────────────────────────────────────────────
// PUSH SENDER (single responsibility)
// ─────────────────────────────────────────────────────────────────────────────

async function sendPushNotification(
  token: string,
  title: string,
  body: string,
  data?: Record<string, any>
) {
  try {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: token,
        title,
        body,
        data,
        sound: 'default',
      }),
    });
  } catch (e) {
    console.warn('Push failed:', e);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FIRESTORE CORE
// ─────────────────────────────────────────────────────────────────────────────

async function sendNotification(payload: NotifPayload) {
  await addDoc(collection(db, 'notifications'), {
    recipientId: payload.recipientId,
    type: payload.type,

    titleHe: payload.titleHe,
    titleEn: payload.titleEn,
    bodyHe: payload.bodyHe,
    bodyEn: payload.bodyEn,

    relatedProjectId: payload.relatedProjectId ?? null,
    relatedMilestoneId: payload.relatedMilestoneId ?? null,

    isRead: false,
    createdAt: serverTimestamp(),
  });

  if (payload.pushToken) {
    await sendPushNotification(
      payload.pushToken,
      payload.titleHe,
      payload.bodyHe,
      {
        type: payload.type,
        relatedProjectId: payload.relatedProjectId,
        relatedMilestoneId: payload.relatedMilestoneId,
      }
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SAFE HELPERS
// ─────────────────────────────────────────────────────────────────────────────

async function getPushToken(userId: string): Promise<string | undefined> {
  const snap = await getDoc(doc(db, 'users', userId));
  if (!snap.exists()) return undefined;

  const data = snap.data();
  return data?.expoPushToken ?? undefined;
}

export const DEGREE_LENGTHS: Record<string, number> = {
  computer_science: 3,
  electrical: 4,
  software: 3,
  industrial: 4,
  mechanical: 4,
  learning_technology: 3,
  default: 4,
};

// ─────────────────────────────────────────────────────────────────────────────
// NOTIFICATION API
// ─────────────────────────────────────────────────────────────────────────────

export async function notifyApplicationDecision(params: {
  studentId: string;
  projectId: string;
  titleHe: string;
  titleEn: string;
  supervisorName: string;
  decision: 'approved' | 'rejected' | 'meeting_requested';
}) {
  const typeMap: Record<string, NotifType> = {
    approved: 'application_approved',
    rejected: 'application_rejected',
    meeting_requested: 'meeting_requested',
  };

  const type = typeMap[params.decision];

  const templates = {
    project_published: {
      titleHe: '📢 פרויקט חדש פורסם',
      titleEn: 'New Project Published',
      bodyHe: 'פרויקט חדש פורסם במערכת',
      bodyEn: 'A new project was published',
    },

    application_approved: {
      titleHe: '✅ המועמדות אושרה',
      titleEn: 'Application Approved',
      bodyHe: `התקבלת לפרויקט "${params.titleHe}"`,
      bodyEn: `You were accepted to "${params.titleEn}"`,
    },

    application_rejected: {
      titleHe: '❌ המועמדות נדחתה',
      titleEn: 'Application Rejected',
      bodyHe: `נדחתה מועמדותך לפרויקט "${params.titleHe}"`,
      bodyEn: `Your application was rejected for "${params.titleEn}"`,
    },

    meeting_requested: {
      titleHe: '📅 בקשת פגישה',
      titleEn: 'Meeting Requested',
      bodyHe: `המנחה ביקש פגישה לגבי "${params.titleHe}"`,
      bodyEn: `Supervisor requested a meeting about "${params.titleEn}"`,
    },

    milestone_graded: {
      titleHe: '✏️ ציון חדש',
      titleEn: 'New Grade',
      bodyHe: 'קיבלת ציון חדש',
      bodyEn: 'You received a new grade',
    },

    milestone_deadline_7d: {
      titleHe: '⏰ תזכורת 7 ימים',
      titleEn: '7 Day Reminder',
      bodyHe: 'נותרו 7 ימים להגשה',
      bodyEn: '7 days left to submit',
    },

    milestone_deadline_1d: {
      titleHe: '🚨 מחר הגשה!',
      titleEn: 'Due Tomorrow!',
      bodyHe: 'נותר יום אחד בלבד',
      bodyEn: 'Only 1 day left',
    },
  };

  const pushToken = await getPushToken(params.studentId);

  await sendNotification({
    type,
    recipientId: params.studentId,
    ...templates[type],
    relatedProjectId: params.projectId,
    pushToken,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// MARK READ
// ─────────────────────────────────────────────────────────────────────────────

export async function markNotificationRead(id: string) {
  await updateDoc(doc(db, 'notifications', id), {
    isRead: true,
  });
}

export async function markAllNotificationsRead(userId: string) {
  const q = query(
    collection(db, 'notifications'),
    where('recipientId', '==', userId),
    where('isRead', '==', false)
  );

  const snap = await getDocs(q);
  if (snap.empty) return;

  const batch = writeBatch(db);

  snap.docs.forEach((d) => {
    batch.update(d.ref, { isRead: true });
  });

  await batch.commit();
}