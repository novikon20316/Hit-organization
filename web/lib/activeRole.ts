// lib/activeRole.ts
// Persists which of a multi-role user's roles they're currently viewing the
// app as (see components/dashboard/DashboardShell.tsx's role switcher, and
// contexts/AuthContext.tsx which owns the in-memory state this backs). Keyed
// per-uid so switching accounts never leaks the previous user's choice.

import type { AppRole } from './i18n';
import { getUserRoles, type UserDoc } from './roles';

function storageKey(uid: string): string {
  return `activeRole_${uid}`;
}

export function getStoredActiveRole(uid: string): AppRole | null {
  if (typeof window === 'undefined') return null;
  return (localStorage.getItem(storageKey(uid)) as AppRole | null) ?? null;
}

export function setStoredActiveRole(uid: string, role: AppRole): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(storageKey(uid), role);
}

/**
 * Which role a multi-role user is currently viewing the app as: their
 * previously stored choice if it's still one of their roles, else their
 * primary `role`.
 */
export function resolveActiveRole(userData: Pick<UserDoc, 'uid' | 'role' | 'roles'> | null | undefined): AppRole | undefined {
  if (!userData) return undefined;
  const roles = getUserRoles(userData);
  const stored = getStoredActiveRole(userData.uid);
  if (stored && roles.includes(stored)) return stored;
  return userData.role;
}
