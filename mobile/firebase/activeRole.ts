// firebase/activeRole.ts
// Persists which of a multi-role user's roles they're currently viewing the
// app as (see components/shared.tsx's TopBar role switcher, and
// contexts/ActiveRoleContext.tsx which owns the in-memory state this backs).
// Keyed per-uid so switching accounts never leaks the previous user's choice.

import { AppRole } from '@/components/i18n';
import { secureStorage } from '../src/firebase/secureStorage';
import { getUserRoles } from './roles';

function storageKey(uid: string): string {
  return `activeRole_${uid}`;
}

export async function getStoredActiveRole(uid: string): Promise<AppRole | null> {
  const value = await secureStorage.getItem(storageKey(uid));
  return (value as AppRole | null) ?? null;
}

export async function setStoredActiveRole(uid: string, role: AppRole): Promise<void> {
  await secureStorage.setItem(storageKey(uid), role);
}

/**
 * Which role a multi-role user is currently viewing the app as: their
 * previously stored choice if it's still one of their roles, else their
 * primary `role`.
 */
export async function resolveActiveRole(
  uid: string,
  userData: { role?: AppRole; roles?: AppRole[] } | null | undefined
): Promise<AppRole | undefined> {
  if (!userData) return undefined;
  const roles = getUserRoles(userData);
  const stored = await getStoredActiveRole(uid);
  if (stored && roles.includes(stored)) return stored;
  return userData.role;
}
