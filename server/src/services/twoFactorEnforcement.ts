// src/services/twoFactorEnforcement.ts
//
// A system_admin can announce that two-factor authentication is about to
// become mandatory, giving every user a grace period (default 7 days) to set
// it up before being hard-blocked. Same lazy-expiry shape as
// maintenanceStatus.ts (one global doc, compared against Date.now() at read
// time — no scheduler needed): a single system/twoFactorEnforcement doc holds
// `active` + `deadline`, and both the server-side gate
// (middleware/auth.ts's verifyToken) and each client's own nudge screen
// derive "is this user currently required to finish 2FA setup" from the same
// isTwoFactorSetupRequired() below, so there's exactly one place that answers
// that question.

import { db } from '../config/firebase.js';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';

const ENFORCEMENT_DOC = db.collection('system').doc('twoFactorEnforcement');

export interface TwoFactorEnforcementStatus {
  active: boolean;
  announcedAt: Timestamp | null;
  deadline: Timestamp | null;
  createdBy: string | null;
}

const INACTIVE: TwoFactorEnforcementStatus = { active: false, announcedAt: null, deadline: null, createdBy: null };

/** Fails open (reports inactive) on a read error — an unreachable DB should
 *  never turn into every user worldwide getting hard-blocked. */
export async function readTwoFactorEnforcementStatus(): Promise<TwoFactorEnforcementStatus> {
  try {
    const snap = await ENFORCEMENT_DOC.get();
    if (!snap.exists) return INACTIVE;
    const data = snap.data();
    if (!data) return INACTIVE;
    return {
      active: data.active ?? false,
      announcedAt: data.announcedAt ?? null,
      deadline: data.deadline ?? null,
      createdBy: data.createdBy ?? null,
    };
  } catch (err) {
    console.error('readTwoFactorEnforcementStatus error:', err);
    return INACTIVE;
  }
}

export async function activateTwoFactorEnforcement(createdBy: string, graceDays: number): Promise<TwoFactorEnforcementStatus> {
  const announcedAt = Timestamp.now();
  const deadline = Timestamp.fromMillis(Date.now() + graceDays * 24 * 60 * 60 * 1000);
  await ENFORCEMENT_DOC.set({ active: true, announcedAt, deadline, createdBy });
  return { active: true, announcedAt, deadline, createdBy };
}

/** merge:true so cancelling an enforcement that was never activated (doc
 *  doesn't exist yet) doesn't throw NOT_FOUND — same convention as
 *  maintenanceStatus.ts's clearMaintenanceStatus. */
export async function deactivateTwoFactorEnforcement(): Promise<void> {
  await ENFORCEMENT_DOC.set({ active: false }, { merge: true });
}

/**
 * Single source of truth for "is this specific user currently required to
 * finish 2FA setup" — used both by the real server-side gate
 * (middleware/auth.ts) and by GET /api/users/me's computed
 * `twoFactorSetupRequired` field, which each client's own routing gate reads
 * to decide whether to force the setup screen. Deliberately applies to every
 * role, including system_admin — the same forced setup screen (not a
 * lockout, since /api/auth/2fa/* stays reachable) is how a system_admin
 * would catch up too, and exempting the role that manages this feature would
 * quietly contradict "every user" in the policy this implements.
 *
 * `graceUntil` is an optional per-user override (users/{uid}.twoFactorGraceUntil)
 * a system_admin can grant to a specific straggler (see
 * extendUserTwoFactorGrace) — someone who needs more time (lost phone, no
 * smartphone yet, etc.) without having to cancel the policy for everyone
 * else.
 */
export async function isTwoFactorSetupRequired(
  totpEnabled: boolean,
  graceUntil: Timestamp | null | undefined,
): Promise<boolean> {
  if (totpEnabled) return false;
  const status = await readTwoFactorEnforcementStatus();
  if (!status.active || !status.deadline) return false;
  if (Date.now() < status.deadline.toMillis()) return false;
  if (graceUntil && graceUntil.toMillis() > Date.now()) return false;
  return true;
}

/** Grants (or revokes, with days<=0) one user extra time past the global
 *  deadline — the system_admin's way to rescue a straggler without lifting
 *  enforcement for everyone else. */
export async function extendUserGrace(uid: string, days: number): Promise<Timestamp | null> {
  if (days <= 0) {
    await db.collection('users').doc(uid).update({ twoFactorGraceUntil: FieldValue.delete() });
    return null;
  }
  const graceUntil = Timestamp.fromMillis(Date.now() + days * 24 * 60 * 60 * 1000);
  await db.collection('users').doc(uid).update({ twoFactorGraceUntil: graceUntil });
  return graceUntil;
}
