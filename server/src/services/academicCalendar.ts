// src/services/academicCalendar.ts
//
// A single config doc holding the two admin-editable semester start dates
// (fall/spring — summer is fixed at July 1st / ends September 1st per the
// user's own description, not configurable). Shared between
// academicCalendarController.ts (system_admin get/edit UI) and
// accountDeletion.ts (the graduation-based auto-deletion sweep, which uses
// the fall start date as its once-a-year safe cutoff — see that file).

import { db } from '../config/firebase.js';
import { FieldValue } from 'firebase-admin/firestore';

const CONFIG_DOC_PATH = ['config', 'academicCalendar'] as const;

export interface AcademicCalendar {
  fallSemesterStartMonth:   number; // 1-12
  fallSemesterStartDay:     number; // 1-31
  springSemesterStartMonth: number;
  springSemesterStartDay:   number;
}

// Provisional defaults matching the user's own description — not a confirmed
// institutional policy, system_admin should confirm/adjust via the settings UI.
const DEFAULT_CALENDAR: AcademicCalendar = {
  fallSemesterStartMonth:   11, // November
  fallSemesterStartDay:     1,
  springSemesterStartMonth: 3,  // March
  springSemesterStartDay:   1,
};

export async function getAcademicCalendar(): Promise<AcademicCalendar> {
  const snap = await db.collection(CONFIG_DOC_PATH[0]).doc(CONFIG_DOC_PATH[1]).get();
  if (!snap.exists) return DEFAULT_CALENDAR;
  const data = snap.data()!;
  return {
    fallSemesterStartMonth:   data.fallSemesterStartMonth   ?? DEFAULT_CALENDAR.fallSemesterStartMonth,
    fallSemesterStartDay:     data.fallSemesterStartDay     ?? DEFAULT_CALENDAR.fallSemesterStartDay,
    springSemesterStartMonth: data.springSemesterStartMonth ?? DEFAULT_CALENDAR.springSemesterStartMonth,
    springSemesterStartDay:   data.springSemesterStartDay   ?? DEFAULT_CALENDAR.springSemesterStartDay,
  };
}

export async function updateAcademicCalendar(
  updates: Partial<AcademicCalendar>,
  updatedBy: string,
): Promise<AcademicCalendar> {
  const current = await getAcademicCalendar();
  const next = { ...current, ...updates };

  for (const [monthKey, dayKey] of [
    ['fallSemesterStartMonth', 'fallSemesterStartDay'],
    ['springSemesterStartMonth', 'springSemesterStartDay'],
  ] as const) {
    const month = next[monthKey];
    const day = next[dayKey];
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      throw new Error(`${monthKey} must be an integer from 1 to 12.`);
    }
    if (!Number.isInteger(day) || day < 1 || day > 31) {
      throw new Error(`${dayKey} must be an integer from 1 to 31.`);
    }
  }

  await db.collection(CONFIG_DOC_PATH[0]).doc(CONFIG_DOC_PATH[1]).set({
    ...next,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy,
  }, { merge: true });

  return next;
}
