// src/services/maintenanceStatus.ts
//
// Web and mobile are separate clients with separate release cycles — a web
// deploy shouldn't force mobile users offline, and vice versa. Each platform
// gets its own Firestore doc (system/maintenance_web, system/maintenance_mobile)
// instead of the one shared system/maintenance doc this used to be, so an
// admin can take one platform down without touching the other.
//
// Extracted out of controllers/maintenanceController.ts so
// middleware/auth.ts's verifyToken can enforce this server-side (previously
// maintenance was ONLY checked client-side at login time — an already-open
// session, or anyone calling the API directly, kept working for the entire
// maintenance window regardless).

import { db } from '../config/firebase.js';

export const PLATFORMS = ['web', 'mobile'] as const;
export type Platform = typeof PLATFORMS[number];

// Mobile shipped this feature first and its clients (this session's own
// apiClient changes aside) may take time to roll out the platform header on
// every install — defaulting anything not explicitly 'web' to 'mobile'
// preserves that original single-doc behavior for callers that haven't
// updated yet, rather than silently going unenforced for them.
export function resolvePlatform(raw: unknown): Platform {
  return raw === 'web' ? 'web' : 'mobile';
}

function maintenanceDocRef(platform: Platform) {
  return db.collection('system').doc(`maintenance_${platform}`);
}

export interface MaintenanceStatus {
  isActive: boolean;
  title: string;
  endsAt: string | null;
}

const INACTIVE: MaintenanceStatus = { isActive: false, title: '', endsAt: null };

/** Reads a platform's maintenance doc, auto-expiring it (flipping isActive
 *  to false) if its endsAt has already passed. Fails open — an unreachable
 *  DB returns "not active" rather than blocking everyone. */
export async function readMaintenanceStatus(platform: Platform): Promise<MaintenanceStatus> {
  try {
    const snap = await maintenanceDocRef(platform).get();
    if (!snap.exists) return INACTIVE;

    const data = snap.data();
    if (!data) return INACTIVE;

    if (data.isActive && data.endsAt) {
      const endsAtMs = data.endsAt.toDate?.()?.getTime?.() ?? new Date(data.endsAt).getTime();
      if (Date.now() > endsAtMs) {
        await maintenanceDocRef(platform).update({ isActive: false });
        return INACTIVE;
      }
    }

    return {
      isActive: data.isActive ?? false,
      title: data.title ?? '',
      endsAt: data.endsAt?.toDate?.()?.toISOString?.() ?? null,
    };
  } catch (err) {
    console.error(`readMaintenanceStatus(${platform}) error:`, err);
    return INACTIVE;
  }
}

export interface SetMaintenanceInput {
  title: string;
  shutdownAt: Date;
  endsAt: Date;
  broadcastEnabled: boolean;
  createdBy: string;
}

export async function setMaintenanceStatus(platform: Platform, input: SetMaintenanceInput): Promise<void> {
  await maintenanceDocRef(platform).set({
    isActive: true,
    title: input.title,
    shutdownAt: input.shutdownAt,
    endsAt: input.endsAt,
    // broadcastAt = shutdownAt — fire the broadcast exactly at shutdown (see
    // maintenanceController.ts's original comment; unchanged behavior).
    broadcastAt: input.shutdownAt,
    broadcastEnabled: input.broadcastEnabled,
    broadcastSent: false,
    createdBy: input.createdBy,
    createdAt: new Date(),
  });
}

export async function clearMaintenanceStatus(platform: Platform): Promise<void> {
  // merge:true — set (not update), so deactivating a platform that was
  // never activated (doc doesn't exist yet) doesn't throw NOT_FOUND.
  await maintenanceDocRef(platform).set({ isActive: false }, { merge: true });
}
