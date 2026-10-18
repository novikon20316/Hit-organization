// src/services/finalReport.ts
//
// The student's final report — personal details, faculty, project/thesis
// title, supervisor(s), every milestone with its grade, the approved final
// grade, and signature lines for the staff each faculty configures (see
// workflowTemplates.ts's finalReportSignatureRoles).
//
// Delivered as a VIEW-ONLY link: finalReportTokens/{token}, a 256-bit random
// bearer token that resolves to exactly one student's report and nothing
// else. It is never exchanged for a Firebase session or custom token, and
// the public endpoint serving it (routes/finalReport.ts) is read-only — the
// link cannot be used to sign in or reach any other data. The collection has
// no firestore.rules match, so clients can't read or list it directly.
//
// The report is assembled LIVE on every view rather than snapshotted, and
// only while the defense milestone's grade is still approved — if the grade
// is unlocked for correction (revertFinalGradeApproval), the link stops
// working until it's re-approved, so it can never show a superseded grade.

import crypto from 'crypto';
import admin from 'firebase-admin';
import { db } from '../config/firebase.js';
import { notifyUser } from './notify.js';
import { facultyName } from './studentProgress.js';
import { academicYearToHebrew } from './hebrewYear.js';
import { resolveStaffForScope } from './scopeAuthorization.js';
import {
  deriveProcessType,
  resolveFinalGradeSignoffRole,
  resolveFinalReportSignatureRoles,
  resolveMilestoneOrder,
  type ChainRole,
} from './workflowTemplates.js';

const COLLECTION = 'finalReportTokens';
// Short-lived: a link sent to the wrong address stops working within a
// month. The student never loses access — their dashboard card mints a
// fresh link whenever the old one has expired (listFinalReportLinksForStudent).
const LINK_VALIDITY_DAYS = 30;
const AUTO_APPROVED_SIGNER = 'System (auto-approved)';

// The token travels in the URL FRAGMENT (#token=…), which browsers never
// send to any server or put in a Referer — so it can't land in request logs.
// The page reads it and POSTs it in the request body (routes/finalReport.ts).
function reportLink(token: string): string {
  const baseUrl = process.env.EXAMINER_ACCESS_BASE_URL || ''; // same public web origin as examinerAccess.ts
  return `${baseUrl}/final-report#token=${encodeURIComponent(token)}`;
}

/** Only the last 4 digits — enough to identify the document, not enough to
 *  misuse if the link is forwarded. */
function maskIdNumber(id: unknown): string | null {
  if (typeof id !== 'string' || !id.trim()) return null;
  const digits = id.replace(/\D/g, '');
  return digits.length > 4 ? `${'*'.repeat(digits.length - 4)}${digits.slice(-4)}` : '****';
}

/** Only tokens this module minted — 43 base64url chars (32 random bytes). */
export function isWellFormedFinalReportToken(token: unknown): token is string {
  return typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token);
}

async function findOrCreateToken(studentId: string, projectId: string, milestoneId: string): Promise<{ token: string; created: boolean }> {
  const existing = await db.collection(COLLECTION)
    .where('studentId', '==', studentId)
    .where('milestoneId', '==', milestoneId)
    .get();
  const now = Date.now();
  const live = existing.docs.find((d) => {
    const data = d.data();
    return !data.revoked && (data.expiresAt?.toMillis?.() ?? 0) > now;
  });
  if (live) return { token: live.id, created: false };

  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(now + LINK_VALIDITY_DAYS * 24 * 60 * 60 * 1000);
  await db.collection(COLLECTION).doc(token).set({
    studentId,
    projectId,
    milestoneId,
    revoked: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
    viewCount: 0,
  });
  return { token, created: true };
}

/**
 * Called right after a defense milestone's final grade is approved (both
 * approveFinalGrade and decideGradeOverride). Mints (or reuses, on a
 * re-approval after an unlock) one link per student and sends it. Best-
 * effort: a failure here must never undo an already-committed approval.
 */
export async function issueFinalReportLinks(milestoneId: string): Promise<void> {
  try {
    const milestoneSnap = await db.collection('milestones').doc(milestoneId).get();
    const milestone = milestoneSnap.data();
    if (!milestone || milestone.type !== 'defense' || !milestone.gradeApproved) return;

    const projectId: string = milestone.projectId ?? '';
    const projectSnap = projectId ? await db.collection('projects').doc(projectId).get() : null;
    const project = projectSnap?.data() ?? {};
    const studentIds: string[] = milestone.studentIds ?? [];

    await Promise.all(studentIds.map(async (studentId) => {
      try {
        const { token, created } = await findOrCreateToken(studentId, projectId, milestoneId);
        // A re-approval after an unlock reuses the same link — the student
        // already has it, and the report itself is rendered live.
        if (!created) return;
        await sendReportLink(studentId, projectId, milestoneId, token, project, false);
      } catch (err) {
        console.error(`issueFinalReportLinks: failed for student ${studentId}, milestone ${milestoneId}:`, err);
      }
    }));
  } catch (err) {
    console.error(`issueFinalReportLinks: failed for milestone ${milestoneId}:`, err);
  }
}

async function sendReportLink(
  studentId: string,
  projectId: string,
  milestoneId: string,
  token: string,
  project: FirebaseFirestore.DocumentData,
  reissued: boolean,
): Promise<void> {
  await notifyUser({
    recipientId: studentId,
    type: 'final_report_ready',
    titleHe: reissued ? '🎓 קישור חדש לדוח המסכם שלך' : '🎓 הדוח המסכם שלך מוכן',
    titleEn: reissued ? '🎓 A new link to your final report' : '🎓 Your final report is ready',
    bodyHe: reissued
      ? 'הקישור הקודם לדוח המסכם שלך בוטל. הקישור החדש נשלח אליך במייל וזמין גם בלוח הבקרה שלך.'
      : 'הדוח המסכם שלך זמין לצפייה ולהדפסה. הקישור נשלח אליך במייל וזמין גם בלוח הבקרה שלך.',
    bodyEn: reissued
      ? 'Your previous final report link was revoked. The new link was emailed to you and is also on your dashboard.'
      : 'Your final report is available to view and print. The link was emailed to you and is also on your dashboard.',
    relatedProjectId: projectId || null,
    relatedMilestoneId: milestoneId,
    targetScreen: 'student_grades',
    emailData: {
      link: reportLink(token),
      projectTitle: { he: project.titleHe ?? project.titleEn ?? '', en: project.titleEn ?? project.titleHe ?? '' },
    },
    // The link is a bearer credential for this report — kept to email
    // (the student's own inbox) and the authenticated dashboard, not
    // SMS/WhatsApp/push text that can surface on a lock screen.
    channels: { inApp: true, email: true, push: true, sms: false, whatsapp: false },
  });
}

/**
 * Staff "revoke report link": kills every live link of this student at once
 * (e.g. one emailed to a wrong address), then — for each report whose grade
 * is still approved — mints a fresh link and sends it to the student.
 */
export async function revokeAndReissueFinalReportLinks(studentId: string, revokedBy: string): Promise<{ revoked: number; reissued: number }> {
  const snap = await db.collection(COLLECTION).where('studentId', '==', studentId).get();
  const now = Date.now();
  const live = snap.docs.filter((d) => !d.data().revoked && (d.data().expiresAt?.toMillis?.() ?? 0) > now);
  await Promise.all(live.map((d) => d.ref.update({
    revoked: true,
    revokedBy,
    revokedAt: admin.firestore.FieldValue.serverTimestamp(),
  })));

  // One fresh link per report (milestone) the student has, whether its old
  // link was live or had already expired.
  const milestones = new Map<string, string>();
  snap.docs.forEach((d) => milestones.set(d.data().milestoneId, d.data().projectId));
  let reissued = 0;
  for (const [milestoneId, projectId] of milestones) {
    const mSnap = await db.collection('milestones').doc(milestoneId).get();
    if (!mSnap.data()?.gradeApproved) continue;
    const { token } = await findOrCreateToken(studentId, projectId, milestoneId);
    const project = (await db.collection('projects').doc(projectId).get()).data() ?? {};
    await sendReportLink(studentId, projectId, milestoneId, token, project, true);
    reissued++;
  }
  return { revoked: live.length, reissued };
}

/** Whether this student has ever been issued a final report link — decides
 *  whether staff see the revoke action at all. */
export async function hasFinalReportLinks(studentId: string): Promise<boolean> {
  const snap = await db.collection(COLLECTION).where('studentId', '==', studentId).limit(1).get();
  return !snap.empty;
}

/** The signed-in student's own links (for their dashboard card), one per
 *  report whose grade is still approved. Links are short-lived
 *  (LINK_VALIDITY_DAYS), so an expired one is replaced with a fresh link
 *  here, silently — the student is already signed in, so nothing is emailed. */
export async function listFinalReportLinksForStudent(studentId: string): Promise<Array<{
  link: string; projectId: string; projectTitleHe: string; projectTitleEn: string; expiresAt: string | null;
}>> {
  const snap = await db.collection(COLLECTION).where('studentId', '==', studentId).get();
  const milestones = new Map<string, string>();
  snap.docs.forEach((d) => milestones.set(d.data().milestoneId, d.data().projectId));

  const results = await Promise.all([...milestones].map(async ([milestoneId, projectId]) => {
    const [mSnap, pSnap] = await Promise.all([
      db.collection('milestones').doc(milestoneId).get(),
      db.collection('projects').doc(projectId).get(),
    ]);
    if (!mSnap.data()?.gradeApproved) return null;
    const { token } = await findOrCreateToken(studentId, projectId, milestoneId);
    const tokenSnap = await db.collection(COLLECTION).doc(token).get();
    const project = pSnap.data() ?? {};
    return {
      link: reportLink(token),
      projectId,
      projectTitleHe: project.titleHe ?? '',
      projectTitleEn: project.titleEn ?? '',
      expiresAt: tokenSnap.data()?.expiresAt?.toDate?.().toISOString?.() ?? null,
    };
  }));
  return results.filter((r): r is NonNullable<typeof r> => r !== null);
}

export interface FinalReportSignature {
  role: ChainRole;
  name: string | null;
  /** Set only when the system has a recorded sign-off by this person —
   *  the client renders a stylized digital signature for those, and an
   *  empty signature line otherwise. */
  signedAt: string | null;
}

export interface FinalReport {
  student: {
    name: string;
    /** Masked — last 4 digits only (maskIdNumber). No phone: the link is a
     *  bearer credential that may be forwarded. */
    idNumber: string | null;
    email: string | null;
    facultyId: string;
    major: string | null;
    degreeType: string | null;
    specialization: string | null;
  };
  faculty: { he: string; en: string };
  project: {
    titleHe: string;
    titleEn: string;
    projectType: string | null;
    academicYear: string | null;
    academicYearHebrew: string | null;
    recordNumber: string | null;
  };
  supervisors: string[];
  milestones: Array<{ type: string; nameHe: string | null; nameEn: string | null; grade: number | null; completedAt: string | null }>;
  finalGrade: number | null;
  finalGradeApprovedAt: string | null;
  signatures: FinalReportSignature[];
  generatedAt: string;
}

const iso = (ts: any): string | null => ts?.toDate?.().toISOString?.() ?? null;

async function userName(uid: string | null | undefined): Promise<string | null> {
  if (!uid) return null;
  const snap = await db.collection('users').doc(uid).get();
  const u = snap.data();
  return u?.displayName ?? u?.displayNameHe ?? u?.displayNameEn ?? null;
}

export type FinalReportLookup =
  | { ok: true; report: FinalReport }
  | { ok: false; reason: 'not_found' | 'expired' | 'not_approved' };

export async function getFinalReportByToken(token: string): Promise<FinalReportLookup> {
  const tokenRef = db.collection(COLLECTION).doc(token);
  const tokenSnap = await tokenRef.get();
  const tokenDoc = tokenSnap.data();
  if (!tokenDoc || tokenDoc.revoked) return { ok: false, reason: 'not_found' };
  if ((tokenDoc.expiresAt?.toMillis?.() ?? 0) <= Date.now()) return { ok: false, reason: 'expired' };

  const studentId: string = tokenDoc.studentId;
  const [defenseSnap, projectSnap, studentSnap] = await Promise.all([
    db.collection('milestones').doc(tokenDoc.milestoneId).get(),
    db.collection('projects').doc(tokenDoc.projectId).get(),
    db.collection('users').doc(studentId).get(),
  ]);
  const defense = defenseSnap.data();
  if (!defense || !defense.gradeApproved) return { ok: false, reason: 'not_approved' };
  const project = projectSnap.data() ?? {};
  if (project.isArchived) return { ok: false, reason: 'not_found' };
  const student = studentSnap.data() ?? {};

  const milestonesSnap = await db.collection('milestones')
    .where('projectId', '==', tokenDoc.projectId)
    .where('studentIds', 'array-contains', studentId)
    .get();
  const milestoneDocs = milestonesSnap.docs
    .map((d) => d.data())
    .sort((a, b) => resolveMilestoneOrder(a) - resolveMilestoneOrder(b));

  const gradeFor = (m: FirebaseFirestore.DocumentData): number | null =>
    m.finalGradeByStudent?.[studentId] ?? m.finalGrade ?? null;

  const facultyId: string = project.facultyId ?? student.facultyId ?? defense.facultyId ?? '';
  const supervisorIds = [project.supervisorId, project.secondarySupervisorId].filter(Boolean) as string[];
  const supervisorNames = (await Promise.all(supervisorIds.map(userName))).filter((n): n is string => !!n);

  // ── Signatures ───────────────────────────────────────────────────────────
  const processType = deriveProcessType(project.degreeType, project.projectType);
  const major: string | null = project.major ?? null;
  const [signatureRoles, finalGradeSignoffRole] = await Promise.all([
    resolveFinalReportSignatureRoles(facultyId, processType, major),
    resolveFinalGradeSignoffRole(facultyId, processType, major),
  ]);
  const approverName = await userName(defense.gradeApprovedBy);
  const newestFirst = [...milestoneDocs].reverse();

  const signatures: FinalReportSignature[] = await Promise.all(signatureRoles.map(async (role) => {
    // 1. Whoever actually approved the final grade, for the role configured
    //    to approve it (the administrative coordinator, by default).
    if (role === finalGradeSignoffRole && approverName) {
      return { role, name: approverName, signedAt: iso(defense.gradeApprovedAt) };
    }
    // 2. The most recent recorded chain sign-off by this role on any of the
    //    student's milestones (see coordinatorController.ts's
    //    `${stage.role}SignedAt` / `${stage.role}SignedByName` stamps).
    for (const m of newestFirst) {
      const name = m[`${role}SignedByName`];
      if (typeof name === 'string' && name && name !== AUTO_APPROVED_SIGNER && m[`${role}SignedAt`]) {
        return { role, name, signedAt: iso(m[`${role}SignedAt`]) };
      }
    }
    // 3. No recorded sign-off — still name the responsible person when
    //    there's exactly one, leaving the signature line itself blank.
    if (role === 'supervisor') return { role, name: supervisorNames[0] ?? null, signedAt: null };
    try {
      const scope = {
        facultyId,
        ...(major ? { major } : {}),
        ...(project.degreeType ? { degreeLevel: project.degreeType } : {}),
        ...(project.projectType ? { processType: project.projectType } : {}),
      };
      const uids = await resolveStaffForScope(role, scope, supervisorIds, [], false);
      return { role, name: uids.length === 1 ? await userName(uids[0]) : null, signedAt: null };
    } catch {
      return { role, name: null, signedAt: null };
    }
  }));

  // Best-effort access trail — never blocks the view.
  tokenRef.update({
    viewCount: admin.firestore.FieldValue.increment(1),
    lastViewedAt: admin.firestore.FieldValue.serverTimestamp(),
  }).catch(() => {});

  return {
    ok: true,
    report: {
      student: {
        name: student.displayName ?? student.displayNameHe ?? student.displayNameEn ?? '',
        idNumber: maskIdNumber(student.studentId),
        email: student.email ?? null,
        facultyId,
        major: student.major ?? project.major ?? null,
        degreeType: project.degreeType ?? student.degreeType ?? null,
        specialization: student.specialization ?? null,
      },
      faculty: facultyName(facultyId),
      project: {
        titleHe: project.titleHe ?? '',
        titleEn: project.titleEn ?? '',
        projectType: project.projectType ?? null,
        academicYear: project.academicYear ?? null,
        academicYearHebrew: academicYearToHebrew(project.academicYear ?? null),
        recordNumber: project.recordNumber != null ? String(project.recordNumber) : null,
      },
      supervisors: supervisorNames,
      milestones: milestoneDocs.map((m) => ({
        type: m.type ?? '',
        nameHe: m.nameHe ?? null,
        nameEn: m.nameEn ?? null,
        grade: gradeFor(m),
        completedAt: iso(m.coordinatorApprovedAt) ?? iso(m.gradeApprovedAt) ?? iso(m.gradedAt),
      })),
      finalGrade: gradeFor(defense),
      finalGradeApprovedAt: iso(defense.gradeApprovedAt),
      signatures,
      generatedAt: new Date().toISOString(),
    },
  };
}
