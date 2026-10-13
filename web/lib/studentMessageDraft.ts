// lib/studentMessageDraft.ts
// Hands the administrative coordinator's Students Report selection over to
// the Notifications page's compose panel. sessionStorage rather than the URL:
// a "select all" can be hundreds of ids (too long for a query string), and
// student names don't belong in a URL anyway. Per-tab and short-lived by
// design — a reload of /notifications?compose=students in the same tab still
// finds it, a fresh tab doesn't.

export interface StudentMessageRecipient {
  id: string;
  name: string;
}

const KEY = 'studentMessageDraft.recipients';

export function saveStudentMessageRecipients(recipients: StudentMessageRecipient[]): boolean {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(recipients));
    return true;
  } catch {
    return false;
  }
}

export function loadStudentMessageRecipients(): StudentMessageRecipient[] {
  try {
    const raw = sessionStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (r): r is StudentMessageRecipient => !!r && typeof r.id === 'string' && typeof r.name === 'string',
    );
  } catch {
    return [];
  }
}

export function clearStudentMessageRecipients(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Nothing to clean up if storage is unavailable.
  }
}
