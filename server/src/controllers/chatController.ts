// Inside controllers/chatController.ts

import { Request, Response } from "express";
import { db } from "../config/firebase.js";
import admin from 'firebase-admin';
import { AuthenticatedRequest } from "../middleware/auth.js";

// Helper to normalize user data matching the frontend's expected UserRow signature
const parseUserRow = (doc: admin.firestore.DocumentSnapshot) => {
  const data = doc.data() || {};
  return {
    id:        doc.id,
    name:      data.displayName ?? data.fullName ?? 'Unknown',
    email:     data.email ?? '',
    role:      data.role ?? '',
    facultyId: data.facultyId ?? '',
  };
};

// Shared eligibility resolver — same relationship rules getChatCandidates uses
// to DISPLAY contacts also gate who findOrCreateDirectChat will let you actually
// message. Returns 'all' for system_admin, otherwise a concrete set of allowed
// partner uids (empty set for any role with no defined relationship, e.g. a
// role getChatCandidates itself doesn't branch on — deny by default).
async function getEligiblePartnerIds(uid: string): Promise<Set<string> | 'all'> {
  const meSnap = await db.collection('users').doc(uid).get();
  if (!meSnap.exists) return new Set();

  const me = meSnap.data() || {};
  const myRole = me.role ?? '';
  const myFaculty = me.facultyId ?? '';
  const activeProjectId = me.activeProjectId ?? null;

  if (myRole === 'system_admin') return 'all';

  if (myRole === 'faculty_admin') {
    const snap = await db.collection('users').where('facultyId', '==', myFaculty).get();
    return new Set(snap.docs.filter((d) => d.id !== uid).map((d) => d.id));
  }

  if (myRole === 'supervisor') {
    const appsSnap = await db.collection('applications').where('supervisorId', '==', uid).get();
    return new Set(appsSnap.docs.map((d) => d.data().studentId as string));
  }

  if (myRole === 'student') {
    const ids = new Set<string>();
    if (activeProjectId) {
      const projSnap = await db.collection('projects').doc(activeProjectId).get();
      const supId = projSnap.data()?.supervisorId;
      if (supId) ids.add(supId);
    } else {
      const appsSnap = await db.collection('applications').where('studentId', '==', uid).get();
      appsSnap.docs.forEach((d) => ids.add(d.data().supervisorId as string));
    }
    return ids;
  }

  return new Set();
}

// Recognized Cloudinary hosts for chat images — matches the same cloud name
// every other upload flow in this app already uses (Browseprojects.tsx's
// CV/transcript upload, project-info PDFs). Kept narrow rather than "any
// https URL" so a chat message can't be used to make the recipient's client
// fetch/render an arbitrary attacker-controlled URL.
const CHAT_IMAGE_URL_RE = /^https:\/\/res\.cloudinary\.com\/dp7stlfas\/image\/upload\//;
const MAX_TEXT_LENGTH = 4000;
const MAX_CAPTION_LENGTH = 1000;

export const sendDirectMessage = async (req: AuthenticatedRequest, res: Response) => {
  const uid = req.user?.uid; // 🔒 Securely verified Sender ID from your middleware token
  const { chatId } = req.params;
  const { text, imageUrl } = req.body;
  const type: 'text' | 'image' = imageUrl != null ? 'image' : 'text';

  if(!chatId || typeof chatId !== 'string'){
    return res.status(401).json({
        message: "Error... Wrong ChatId"
    })
  }
  if (!uid) return res.status(401).json({ message: 'Unauthorized.' });

  // CRITICAL FIX: neither field was validated at all before this — a
  // non-string `text` (or any other malformed body) was written to
  // Firestore verbatim, and every subsequent render of that message —
  // for both participants, in the recipient's notifications feed, in the
  // chat-dashboard preview — threw "Objects are not valid as a React
  // child," permanently breaking the thread until someone manually deleted
  // the bad document. Every shape is now checked before anything is
  // persisted, and this doubles as the new image-message validation.
  let previewText: string;
  if (type === 'image') {
    if (typeof imageUrl !== 'string' || !CHAT_IMAGE_URL_RE.test(imageUrl)) {
      return res.status(400).json({ message: 'A valid image URL is required.' });
    }
    if (text !== undefined && text !== null && (typeof text !== 'string' || text.length > MAX_CAPTION_LENGTH)) {
      return res.status(400).json({ message: `Caption must be a string under ${MAX_CAPTION_LENGTH} characters.` });
    }
    previewText = '📷 Photo';
  } else {
    if (typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({ message: 'Message text is required.' });
    }
    if (text.length > MAX_TEXT_LENGTH) {
      return res.status(400).json({ message: `Message is too long (max ${MAX_TEXT_LENGTH} characters).` });
    }
    previewText = text;
  }

  try {
    // Look up the conversation FIRST and confirm the sender is actually a
    // participant — otherwise any authenticated user could post into (and get
    // notified about) any other two users' private chat by guessing chatId.
    const chatRef  = db.collection('chats').doc(chatId);
    const chatSnap = await chatRef.get();
    if (!chatSnap.exists) return res.status(404).json({ message: 'Chat not found.' });

    const participants: string[] = chatSnap.data()?.participants || [];
    if (!participants.includes(uid)) {
      return res.status(403).json({ message: 'Forbidden.' });
    }

    const batch = db.batch(); // Process operations atomically

    // 1. Create and stage the new message document
    const msgRef = db.collection('chats').doc(chatId).collection('messages').doc();
    batch.set(msgRef, {
      type,
      text: type === 'image' ? (text ?? '') : text,
      ...(type === 'image' ? { imageUrl } : {}),
      senderId: uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // 2. Update parent chat window thread overview timestamps
    batch.update(chatRef, {
      lastMessage: previewText,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // 3. Target the other participant as the recipient
    const recipientId = participants.find(id => id !== uid);

    if (recipientId) {
      // Safely fetch sender name on the server to prevent client-side spoofing
      const senderSnap = await db.collection('users').doc(uid).get();
      const senderName = senderSnap.data()?.displayName || 'Someone';
      const cropped = previewText.length > 60 ? previewText.slice(0, 60) + '…' : previewText;

      // 4. Create notification with ALL your original explicit document parameters!
      const notifRef = db.collection('notifications').doc();
      batch.set(notifRef, {
        recipientId,
        type:               'new_message',
        titleHe:            `הודעה חדשה מ-${senderName}`,
        titleEn:            `New message from ${senderName}`,
        bodyHe:             cropped,
        bodyEn:             cropped,
        isRead:             false,
        createdAt:          admin.firestore.FieldValue.serverTimestamp(),
        relatedProjectId:   null, // Restored matching your original format
        relatedMilestoneId: null, // Restored matching your original format
        chatId:             chatId,
        senderId:           uid,
      });
    }

    // Commit all three collection writes at the exact same moment
    await batch.commit();
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Failed to process message notification cascade:', error);
    return res.status(500).json({ message: 'Failed to safely commit text dispatch sequence' });
  }
};

export const markChatNotificationsAsRead = async (req: Request, res: Response) => {
  const uid = (req as any).user?.uid; // The authenticated recipient clearing their notifications
  const { chatId } = req.params;

  try {
    // Locate all unread message alerts sent to this user originating from this chat room
    const snapshot = await db.collection('notifications')
      .where('recipientId', '==', uid)
      .where('chatId', '==', chatId)
      .where('isRead', '==', false)
      .get();

    if (snapshot.empty) {
      return res.status(200).json({ success: true, updatedCount: 0 });
    }

    const batch = db.batch();
    snapshot.forEach((doc) => {
      batch.update(doc.ref, { isRead: true });
    });

    await batch.commit();
    return res.status(200).json({ success: true, updatedCount: snapshot.size });
  } catch (error) {
    console.error('Error clearing unread chat notifications:', error);
    return res.status(500).json({ message: 'Failed to update notification states' });
  }
};

/**
 * 3. POST /api/chats/broadcast
 * Offloads batch notification execution directly inside cloud transactions
 */
export const sendBroadcastNotification = async (req: Request, res: Response) => {
  const uid = (req as any).user?.uid;
  const { title, message } = req.body;
  const db = admin.firestore();

  if (!title?.trim() || !message?.trim()) {
    return res.status(400).json({ message: 'Missing title or message validation block' });
  }

  try {
    const meSnap = await db.collection('users').doc(uid).get();
    const myRole = meSnap.data()?.role;
    const myFaculty = meSnap.data()?.facultyId;

    if (myRole !== 'system_admin' && myRole !== 'faculty_admin') {
      return res.status(403).json({ message: 'Action restricted to authorized administrative users only' });
    }

    let recipientIds: string[] = [];

    if (myRole === 'system_admin') {
      const snap = await db.collection('users').get();
      recipientIds = snap.docs.map((d) => d.id).filter((id) => id !== uid);
    } else if (myRole === 'faculty_admin') {
      const snap = await db.collection('users').where('facultyId', '==', myFaculty).get();
      recipientIds = snap.docs.map((d) => d.id).filter((id) => id !== uid);
    }

    if (recipientIds.length === 0) {
      return res.status(200).json({ success: true, count: 0 });
    }

    // Process notification operations atomically via system batch collections
    // Note: Firestore blocks batches exceeding 500 records. For enterprise scale setups, loop arrays into split sub-chunks.
    const batch = db.batch();

    recipientIds.forEach((recipientId) => {
      const notifRef = db.collection('notifications').doc();
      batch.set(notifRef, {
        recipientId,
        type:               'broadcast',
        titleHe:            title.trim(),
        titleEn:            title.trim(),
        bodyHe:             message.trim(),
        bodyEn:             message.trim(),
        isRead:             false,
        createdAt:          admin.firestore.FieldValue.serverTimestamp(),
        relatedProjectId:   null,
        relatedMilestoneId: null,
        senderId:           uid,
      });
    });

    await batch.commit();
    return res.status(200).json({ success: true, count: recipientIds.length });
  } catch (error) {
    console.error('Failure compiling system data broadcast pipeline:', error);
    return res.status(500).json({ message: 'Failed to safely commit global broad message cascade' });
  }
};

/**
 * 2. POST /api/chats
 * Resolves or spins up a targeted 1-to-1 conversation wrapper token
 */
export const findOrCreateDirectChat = async (req: Request, res: Response) => {
  const uid = (req as any).user?.uid;
  const { recipientId } = req.body;

  if (!uid) return res.status(401).json({ message: 'Unauthorized.' });
  if (!recipientId) {
    return res.status(400).json({ message: 'Missing target participant allocation key' });
  }

  try {
    // Same relationship rules getChatCandidates uses to decide who's shown as a
    // contact — without this, any authenticated user could message any other
    // user by uid regardless of role/faculty/application relationship.
    const eligible = await getEligiblePartnerIds(uid);
    if (eligible !== 'all' && !eligible.has(recipientId)) {
      return res.status(403).json({ message: 'Forbidden.' });
    }

    // Audit check: Check if an active direct channel footprint already links these two users
    const existingSnap = await db.collection('chats')
      .where('participants', 'array-contains', uid)
      .get();

    const currentActiveChat = existingSnap.docs.find((doc) => {
      const participants: string[] = doc.data().participants ?? [];
      return participants.includes(recipientId) && participants.length === 2;
    });

    if (currentActiveChat) {
      return res.status(200).json({ chatId: currentActiveChat.id });
    }

    // Provision new communication matrix document wrapper
    const newChatRef = await db.collection('chats').add({
      participants: [uid, recipientId],
      type:         'direct',
      createdAt:    admin.firestore.FieldValue.serverTimestamp(),
      updatedAt:    admin.firestore.FieldValue.serverTimestamp(),
      lastMessage:  '',
    });

    return res.status(201).json({ chatId: newChatRef.id });
  } catch (error) {
    console.error('Error creating direct chat link channel:', error);
    return res.status(500).json({ message: 'Could not resolve chat initialization schema' });
  }
};


/**
 * 1. GET /api/chats/candidates
 * Resolves application relationship maps to return eligible context contacts
 */
export const getChatCandidates = async (req: Request, res: Response) => {
  const uid = (req as any).user?.uid; // Assumes your authentication token middleware populates this
  const db = admin.firestore();

  try {
    const meSnap = await db.collection('users').doc(uid).get();
    if (!meSnap.exists) {
      return res.status(404).json({ message: 'Current user profiling missing' });
    }

    const me = meSnap.data() || {};
    const myRole = me.role ?? '';
    const myFaculty = me.facultyId ?? '';
    const activeProjectId = me.activeProjectId ?? null;

    let candidates: any[] = [];

    // --- System Admins see everyone ---
    if (myRole === 'system_admin') {
      const snap = await db.collection('users').get();
      snap.forEach((d) => { if (d.id !== uid) candidates.push(parseUserRow(d)); });
    } 
    // --- Faculty Admins see everyone in their school unit ---
    else if (myRole === 'faculty_admin') {
      const snap = await db.collection('users').where('facultyId', '==', myFaculty).get();
      snap.forEach((d) => { if (d.id !== uid) candidates.push(parseUserRow(d)); });
    } 
    // --- Supervisors see students linked via applications ---
    else if (myRole === 'supervisor') {
      const appsSnap = await db.collection('applications').where('supervisorId', '==', uid).get();
      const studentIds = [...new Set(appsSnap.docs.map((d) => d.data().studentId as string))];
      
      if (studentIds.length > 0) {
        // Firestore 'in' queries are capped at groups of 30, chunks handles safeguards
        const studentSnaps = await db.collection('users').where(admin.firestore.FieldPath.documentId(), 'in', studentIds.slice(0, 30)).get();
        studentSnaps.forEach((d) => candidates.push(parseUserRow(d)));
      }
    } 
    // --- Students find assigned or target supervisors ---
    else if (myRole === 'student') {
      if (activeProjectId) {
        const projSnap = await db.collection('projects').doc(activeProjectId).get();
        const supId = projSnap.data()?.supervisorId;
        if (supId) {
          const supSnap = await db.collection('users').doc(supId).get();
          if (supSnap.exists) candidates.push(parseUserRow(supSnap));
        }
      } else {
        const appsSnap = await db.collection('applications').where('studentId', '==', uid).get();
        const supervisorIds = [...new Set(appsSnap.docs.map((d) => d.data().supervisorId as string))];
        
        if (supervisorIds.length > 0) {
          const supSnaps = await db.collection('users').where(admin.firestore.FieldPath.documentId(), 'in', supervisorIds.slice(0, 30)).get();
          supSnaps.forEach((d) => candidates.push(parseUserRow(d)));
        }
      }
    }

    return res.status(200).json({ myRole, candidates });
  } catch (error) {
    console.error('Error fetching chat candidates:', error);
    return res.status(500).json({ message: 'Internal server lookup failure' });
  }
};

/**
 * 1. GET /api/chats/:chatId/meta
 * Returns participant profiles + basic chat info for the chat window header.
 * Called by app/message/[chatId].tsx on mount.
 */
export const getChatMeta = async (req: AuthenticatedRequest, res: Response) => {
  const uid    = req.user?.uid;
  const { chatId } = req.params;

  if (!chatId || typeof chatId !== 'string') {
    return res.status(400).json({ message: 'Invalid chatId.' });
  }
  else if (!uid || typeof uid !== 'string') {
    return res.status(400).json({ message: 'Invalid uid.' });
  }

  try {
    const chatSnap = await db.collection('chats').doc(chatId).get();

    if (!chatSnap.exists) {
      return res.status(404).json({ message: 'Chat not found.' });
    }

    const chatData   = chatSnap.data() || {};
    const participants: string[] = chatData.participants ?? [];

    // Confirm the requesting user is actually a participant
    if (!participants.includes(uid)) {
      return res.status(403).json({ message: 'Access denied: not a participant.' });
    }

    // Fetch profiles for every participant in parallel
    const profileSnaps = await Promise.all(
      participants.map((id) => db.collection('users').doc(id).get())
    );

    const profiles = profileSnaps
      .filter((s) => s.exists)
      .map((s) => parseUserRow(s));

    return res.status(200).json({
      chatId,
      type:        chatData.type        ?? 'direct',
      lastMessage: chatData.lastMessage ?? '',
      updatedAt:   chatData.updatedAt   ?? null,
      participants: profiles,
    });
  } catch (error) {
    console.error('getChatMeta error:', error);
    return res.status(500).json({ message: 'Failed to load chat metadata.' });
  }
};

/**
 * 3. DELETE /api/chats/:chatId
 * Deletes a chat thread and all its messages, then cleans up related notifications.
 * Called from app/tabs/notifications.tsx.
 */
export const deleteChat = async (req: Request, res: Response) => {
  const uid        = (req as any).user?.uid;
  const { chatId } = req.params;

  if (!chatId || typeof chatId !== 'string') {
    return res.status(400).json({ message: 'Invalid chatId.' });
  }

  try {
    const chatRef  = db.collection('chats').doc(chatId);
    const chatSnap = await chatRef.get();

    if (!chatSnap.exists) {
      return res.status(404).json({ message: 'Chat not found.' });
    }

    const participants: string[] = chatSnap.data()?.participants ?? [];
    if (!participants.includes(uid)) {
      return res.status(403).json({ message: 'Access denied: not a participant.' });
    }

    // 1. Delete all sub-collection messages
    const messagesSnap = await chatRef.collection('messages').get();
    const batch        = db.batch();
    messagesSnap.docs.forEach((doc) => batch.delete(doc.ref));

    // 2. Delete related chat notifications for this user
    const notifSnap = await db.collection('notifications')
      .where('chatId', '==', chatId)
      .where('recipientId', '==', uid)
      .get();
    notifSnap.docs.forEach((doc) => batch.delete(doc.ref));

    // 3. Delete the chat document itself
    batch.delete(chatRef);

    await batch.commit();
    return res.status(200).json({ success: true, message: 'Chat deleted.' });
  } catch (error) {
    console.error('deleteChat error:', error);
    return res.status(500).json({ message: 'Failed to delete chat.' });
  }
};

/**
 * 4. GET /api/chats/dashboard
 * Returns all chat threads the current user participates in, with participant
 * profiles and unread message counts.
 * Called by app/tabs/notifications.tsx.
 */
export const getChatDashboard = async (req: AuthenticatedRequest, res: Response) => {
  const uid = req.user?.uid;

  if (!uid) {
    return res.status(401).json({ message: 'Unauthorized.' });
  }

  try {
    // Fetch all chats this user participates in, ordered by most recent
    const chatsSnap = await db.collection('chats')
      .where('participants', 'array-contains', uid)
      .orderBy('updatedAt', 'desc')
      .get();

    if (chatsSnap.empty) {
      return res.status(200).json({ chats: [], unreadTotal: 0 });
    }

    // For each chat, count unread notifications from that chat targeting this user
    const chatList = await Promise.all(
      chatsSnap.docs.map(async (doc) => {
        const data: any        = doc.data();
        const participants: string[] = data.participants ?? [];
        const otherIds         = participants.filter((id) => id !== uid);

        // Fetch other participants' profiles in parallel
        const profileSnaps = await Promise.all(
          otherIds.map((id) => db.collection('users').doc(id).get())
        );
        const otherParticipants = profileSnaps
          .filter((s) => s.exists)
          .map((s) => parseUserRow(s));

        // Unread count for this specific chat
        const unreadSnap = await db.collection('notifications')
          .where('recipientId', '==', uid)
          .where('chatId', '==', doc.id)
          .where('isRead', '==', false)
          .get();

        // This is a direct (1:1) chat model — both the web and mobile
        // notifications screens render a single avatar/name/role per row
        // (chat.otherUid/otherName/otherRole), not the otherParticipants
        // array. Without these, chat.otherRole.replace(...) (mobile) and
        // initials(chat.otherName) (web) throw on undefined — otherParticipants
        // is kept alongside for any future group-chat support, but nothing
        // reads it today.
        const primaryOther = otherParticipants[0];

        return {
          chatId:            doc.id,
          type:              data.type        ?? 'direct',
          lastMessage:       data.lastMessage ?? '',
          updatedAt:         data.updatedAt   ?? null,
          unreadCount:       unreadSnap.size,
          otherUid:          primaryOther?.id   ?? '',
          otherName:         primaryOther?.name ?? '',
          otherRole:         primaryOther?.role ?? '',
          otherParticipants,
        };
      })
    );

    const unreadTotal = chatList.reduce((sum, c) => sum + c.unreadCount, 0);

    return res.status(200).json({ chats: chatList, unreadTotal });
  } catch (error) {
    console.error('getChatDashboard error:', error);
    return res.status(500).json({ message: 'Failed to load chat dashboard.' });
  }
};

/**
 * GET /api/chats/:chatId/messages
 * Returns all messages for a chat thread, ordered oldest → newest.
 * createdAt is serialized as an ISO string so the frontend can parse it simply.
 */
// MEDIUM FIX: previously fetched with no limit at all — every open chat
// screen polls this every 3s, so a long-running thread (realistic over a
// multi-year thesis) re-transferred and re-parsed its ENTIRE history 20
// times a minute for as long as the tab/screen was open. Two changes:
//   - MESSAGE_PAGE_SIZE hard-caps the initial/no-cursor load.
//   - An optional ?since=<ISO timestamp> cursor lets a caller ask for only
//     messages newer than the last one it already has, so a steady-state
//     poll (nothing new) returns an empty array instead of the full window
//     every time. Callers that don't pass it still get bounded results,
//     just not the bandwidth win — see web's/mobile's chat screens for the
//     client-side half of this (tracking the last-seen timestamp, merging
//     rather than replacing).
const MESSAGE_PAGE_SIZE = 200;

export const getChatMessages = async (req: AuthenticatedRequest, res: Response) => {
  const uid        = req.user?.uid;
  const { chatId } = req.params;
  const since      = req.query.since;

  if (!chatId || typeof chatId !== 'string') {
    return res.status(400).json({ message: 'Invalid chatId.' });
  }

  try {
    // Verify the requesting user is a participant before returning messages
    const chatSnap = await db.collection('chats').doc(chatId).get();

    if (!chatSnap.exists) {
      return res.status(404).json({ message: 'Chat not found.' });
    }

    const participants: string[] = chatSnap.data()?.participants ?? [];
    if (!participants.includes(uid!)) {
      return res.status(403).json({ message: 'Access denied: not a participant.' });
    }

    let messagesQuery: FirebaseFirestore.Query = db
      .collection('chats')
      .doc(chatId)
      .collection('messages');

    if (typeof since === 'string' && since) {
      const sinceDate = new Date(since);
      if (!isNaN(sinceDate.getTime())) {
        // Incremental poll — only what's arrived since the caller's last
        // known message. No page-size cap needed here: bounded by how much
        // can realistically arrive in one ~3s poll interval.
        messagesQuery = messagesQuery.where('createdAt', '>', sinceDate).orderBy('createdAt', 'asc');
      } else {
        messagesQuery = messagesQuery.orderBy('createdAt', 'desc').limit(MESSAGE_PAGE_SIZE);
      }
    } else {
      // Initial load — most recent page only, re-sorted to ascending below.
      messagesQuery = messagesQuery.orderBy('createdAt', 'desc').limit(MESSAGE_PAGE_SIZE);
    }

    const messagesSnap = await messagesQuery.get();

    const messages = messagesSnap.docs.map((doc) => {
      const data = doc.data();

      // Firestore Timestamp → ISO string so the frontend gets a consistent format
      const createdAt = data.createdAt?.toDate?.()?.toISOString() ?? null;

      return {
        id:        doc.id,
        type:      data.type      ?? 'text',
        text:      data.text      ?? '',
        imageUrl:  data.imageUrl  ?? null,
        senderId:  data.senderId  ?? '',
        createdAt,
      };
    });

    // The 'desc'+limit branches above come back newest-first — flip to
    // chronological order for display (the 'since' + orderBy('asc') branch
    // is already in the right order).
    if (!(typeof since === 'string' && since && !isNaN(new Date(since).getTime()))) {
      messages.reverse();
    }

    return res.status(200).json(messages);
  } catch (error) {
    console.error('getChatMessages error:', error);
    return res.status(500).json({ message: 'Failed to load messages.' });
  }
};