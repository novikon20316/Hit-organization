// src/services/studentStatuses.ts
//
// A single config doc holding the admin-manageable list of Primary and
// Secondary student statuses (see the user's own Hebrew spec — English
// labels below are translations, not yet confirmed by the institution).
// Primary Status is the student's overall stage in the thesis/project
// process; Secondary Status is a more granular sub-state, independent of
// which Primary Status is currently set. Both lists start with these fixed
// defaults but system_admin can add/edit/remove/reorder entries via the
// settings UI (studentStatusController.ts) — matches the same
// get-or-seed-defaults pattern as services/academicCalendar.ts.

import { db } from '../config/firebase.js';
import { FieldValue } from 'firebase-admin/firestore';
import crypto from 'crypto';

const CONFIG_DOC_PATH = ['config', 'studentStatuses'] as const;

export interface StatusOption {
  key: string;
  labelHe: string;
  labelEn: string;
}

export interface StudentStatusConfig {
  primary: StatusOption[];
  secondary: StatusOption[];
}

const DEFAULT_PRIMARY_STATUSES: StatusOption[] = [
  { key: 'not_chosen_track',            labelHe: 'טרם בחר מסלול תיזה/לא תיזה',       labelEn: 'Has not yet chosen thesis/non-thesis track' },
  { key: 'awaiting_project_supervisor', labelHe: 'ממתין לבחירת פרויקט/מנחה',         labelEn: 'Waiting to choose a project/supervisor' },
  { key: 'awaiting_proposal_submission', labelHe: 'ממתין להגשת הצעת מחקר או פרויקט', labelEn: 'Waiting to submit research/project proposal' },
  { key: 'awaiting_proposal_approval',  labelHe: 'ממתין לאישור הצעה',                labelEn: 'Waiting for proposal approval' },
  { key: 'in_progress',                 labelHe: 'בתהליך',                          labelEn: 'In progress' },
  { key: 'awaiting_thesis_approval',    labelHe: 'ממתין לאישור תזה',                 labelEn: 'Waiting for thesis approval' },
  { key: 'awaiting_thesis_defense',     labelHe: 'ממתין לבחינת תזה',                 labelEn: 'Waiting for thesis defense' },
  { key: 'completed',                   labelHe: 'סיים',                            labelEn: 'Completed' },
  { key: 'withdrawn',                   labelHe: 'פרש',                             labelEn: 'Withdrawn' },
  { key: 'on_leave',                    labelHe: 'בחופשה',                          labelEn: 'On leave' },
];

const DEFAULT_SECONDARY_STATUSES: StatusOption[] = [
  { key: 'awaiting_supervisor', labelHe: 'ממתין למנחה', labelEn: 'Waiting for supervisor' },
  { key: 'awaiting_examiner',   labelHe: 'ממתין לבוחן',  labelEn: 'Waiting for examiner' },
  { key: 'in_revisions',        labelHe: 'בתיקונים',    labelEn: 'In revisions' },
  { key: 'awaiting_grade',      labelHe: 'ממתין לציון', labelEn: 'Waiting for grade' },
];

export async function getStudentStatusConfig(): Promise<StudentStatusConfig> {
  const snap = await db.collection(CONFIG_DOC_PATH[0]).doc(CONFIG_DOC_PATH[1]).get();
  if (!snap.exists) return { primary: DEFAULT_PRIMARY_STATUSES, secondary: DEFAULT_SECONDARY_STATUSES };
  const data = snap.data()!;
  return {
    primary:   Array.isArray(data.primary)   && data.primary.length   > 0 ? data.primary   : DEFAULT_PRIMARY_STATUSES,
    secondary: Array.isArray(data.secondary) && data.secondary.length > 0 ? data.secondary : DEFAULT_SECONDARY_STATUSES,
  };
}

function validateOptionList(list: unknown, label: string): StatusOption[] {
  if (!Array.isArray(list)) throw new Error(`${label} must be an array.`);
  return list.map((raw, i): StatusOption => {
    if (!raw || typeof raw !== 'object') throw new Error(`${label}[${i}] must be an object.`);
    const labelHe = typeof raw.labelHe === 'string' ? raw.labelHe.trim() : '';
    const labelEn = typeof raw.labelEn === 'string' ? raw.labelEn.trim() : '';
    if (!labelHe && !labelEn) throw new Error(`${label}[${i}] needs a label in Hebrew or English.`);
    // Preserve an existing key (editing an option shouldn't orphan students
    // already set to it) — only mint a fresh one for genuinely new entries.
    const key = typeof raw.key === 'string' && raw.key.trim() ? raw.key.trim() : crypto.randomUUID().slice(0, 8);
    return { key, labelHe, labelEn };
  });
}

export async function updateStudentStatusConfig(updates: {
  primary?: unknown;
  secondary?: unknown;
}, updatedBy: string): Promise<StudentStatusConfig> {
  const current = await getStudentStatusConfig();
  const next: StudentStatusConfig = {
    primary:   updates.primary   !== undefined ? validateOptionList(updates.primary, 'primary')     : current.primary,
    secondary: updates.secondary !== undefined ? validateOptionList(updates.secondary, 'secondary')  : current.secondary,
  };

  await db.collection(CONFIG_DOC_PATH[0]).doc(CONFIG_DOC_PATH[1]).set({
    ...next,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy,
  }, { merge: true });

  return next;
}
