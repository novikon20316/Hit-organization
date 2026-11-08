// src/services/emailDigest.ts
//
// The daily email digest a user can choose instead of instant emails (see
// notificationPrefs.ts). notifyUser queues each non-security email here
// (emailDigestItems — server-only, no Firestore rule) instead of sending it;
// sendEmailDigests, run hourly from index.ts, sends each recipient one
// bundled email once a day from DIGEST_HOUR (Israel time) and deletes what
// it sent. The in-app notification itself is created as usual at the time.

import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { db } from '../config/firebase.js';
import { sendNotificationEmail } from './emailService.js';
import type { NotificationType } from './emailTemplates.js';

dayjs.extend(utc);
dayjs.extend(timezone);
const TZ = 'Asia/Jerusalem';
const DIGEST_HOUR = 8;
const ITEMS = 'emailDigestItems';
/** Claims "today's digest has been sent" so several Cloud Run instances
 *  running the same hourly sweep can't each send it. */
const META_DOC = db.collection('systemMeta').doc('emailDigest');
// Keeps one email readable; anything beyond this is summarized as a count.
const MAX_ITEMS_PER_EMAIL = 40;

export async function queueDigestItem(item: {
  recipientId: string;
  type: NotificationType;
  title: string;
  body: string;
}): Promise<void> {
  await db.collection(ITEMS).add({
    recipientId: item.recipientId,
    type: item.type,
    title: item.title.slice(0, 200),
    body: item.body.slice(0, 500),
    createdAt: FieldValue.serverTimestamp(),
  });
}

export async function sendEmailDigests(): Promise<void> {
  const now = dayjs().tz(TZ);
  if (now.hour() < DIGEST_HOUR) return;
  const today = now.format('YYYY-MM-DD');

  const claimed = await db.runTransaction(async (tx) => {
    const meta = await tx.get(META_DOC);
    if (meta.data()?.lastSentDay === today) return false;
    tx.set(META_DOC, { lastSentDay: today, startedAt: Timestamp.now() }, { merge: true });
    return true;
  });
  if (!claimed) return;

  const snap = await db.collection(ITEMS).get();
  const byRecipient = new Map<string, FirebaseFirestore.QueryDocumentSnapshot[]>();
  snap.docs.forEach((d) => {
    const uid = d.data().recipientId as string;
    (byRecipient.get(uid) ?? byRecipient.set(uid, []).get(uid)!).push(d);
  });

  let sent = 0;
  let failed = 0;
  for (const [uid, docs] of byRecipient) {
    const user = (await db.collection('users').doc(uid).get()).data();
    if (!user?.email) {
      // No address anymore — nothing deliverable; don't let it pile up.
      await deleteDocs(docs);
      continue;
    }
    const lang: 'he' | 'en' = user.language === 'en' ? 'en' : 'he';
    const sorted = docs.sort((a, b) => (a.data().createdAt?.toMillis?.() ?? 0) - (b.data().createdAt?.toMillis?.() ?? 0));
    const shown = sorted.slice(0, MAX_ITEMS_PER_EMAIL);
    const lines = shown.map((d) => {
      const { title, body } = d.data();
      return `${String(title).replace(/\n/g, ' ')} — ${String(body).replace(/\n/g, ' ')}`;
    });
    const extra = sorted.length - shown.length;
    if (extra > 0) lines.push(lang === 'he' ? `ועוד ${extra} עדכונים — ראו בעמוד ההתראות.` : `And ${extra} more — see the Notifications page.`);
    try {
      await sendNotificationEmail({
        toEmail: user.email,
        type: 'email_digest',
        lang,
        data: { name: user.displayName ?? user.displayNameHe ?? '', count: String(sorted.length), items: lines.join('\n') },
      });
      await deleteDocs(sorted);
      sent++;
    } catch (err) {
      // Left queued — tomorrow's digest picks it up.
      console.error(`sendEmailDigests: failed for ${uid}:`, err);
      failed++;
    }
  }
  await META_DOC.set({ finishedAt: Timestamp.now(), sent, failed }, { merge: true });
  if (failed > 0) throw new Error(`${failed} of ${sent + failed} digest emails failed`);
}

async function deleteDocs(docs: FirebaseFirestore.QueryDocumentSnapshot[]): Promise<void> {
  for (let i = 0; i < docs.length; i += 400) {
    const batch = db.batch();
    docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
}
