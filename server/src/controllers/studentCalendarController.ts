// src/controllers/studentCalendarController.ts
//
// S3 — GET /api/student/calendar.ics: the signed-in student's own milestone
// due dates and their confirmed defense date as a one-time .ics download.
// Deliberately a download behind verifyToken, not a subscription URL — a
// subscription link works for anyone who has it, which would expose the
// student's schedule. Only the caller's own milestones (studentIds contains
// their uid); only what the student already sees on the dashboard.

import { Response } from 'express';
import { db } from '../config/firebase.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { isDefenseDateConfirmed } from '../services/workflowTemplates.js';
import { L } from '../utils/localize.js';

const DONE = new Set(['coordinator_approved', 'completed']);

// RFC 5545 text escaping + 75-octet line folding.
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
// Splits by code point so Hebrew/emoji are never cut mid-character.
function fold(line: string): string {
  const out: string[] = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const b = Buffer.byteLength(ch);
    if (bytes + b > 75) {
      out.push(cur);
      cur = ' ';
      bytes = 1;
    }
    cur += ch;
    bytes += b;
  }
  out.push(cur);
  return out.join('\r\n');
}

// The date as Israel sees it — due dates are stored as instants.
function ymdInIsrael(d: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  return parts.replace(/-/g, '');
}
const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const nextDay = (ymd: string) => {
  const d = new Date(Date.UTC(+ymd.slice(0, 4), +ymd.slice(4, 6) - 1, +ymd.slice(6, 8) + 1));
  return d.toISOString().slice(0, 10).replace(/-/g, '');
};

export const getStudentCalendar = async (req: AuthenticatedRequest, res: Response) => {
  const uid = req.user?.uid;
  if (!uid) return res.status(401).json({ message: L(req, 'Unauthorized.', 'אין הרשאה.') });
  // A plain file download can't set X-Lang, so the client may pass ?lang=.
  const he = (req.query.lang === 'en' || req.query.lang === 'he' ? req.query.lang : req.lang) !== 'en';
  try {
    const snap = await db.collection('milestones').where('studentIds', 'array-contains', uid).get();
    const now = new Date();
    const events: string[] = [];

    for (const doc of snap.docs) {
      const m = doc.data();
      if (DONE.has(m.status)) continue;
      const name: string = (he ? m.nameHe || m.nameEn : m.nameEn || m.nameHe) || m.type || '';
      const project: string = (he ? m.projectTitleHe || m.projectTitleEn : m.projectTitleEn || m.projectTitleHe) || '';
      const due: Date | null = m.dueDate?.toDate?.() ?? null;
      if (!due) continue;

      if (m.type === 'defense') {
        // Only a confirmed date — before that dueDate is just a target.
        if (!isDefenseDateConfirmed(m.status)) continue;
        const ymd = ymdInIsrael(due);
        const time = typeof m.defenseTime === 'string' && /^\d{2}:\d{2}$/.test(m.defenseTime) ? m.defenseTime : null;
        const where = [m.defenseBuilding && `${he ? 'בניין' : 'Building'} ${m.defenseBuilding}`, m.defenseRoom].filter(Boolean).join(' ');
        events.push([
          'BEGIN:VEVENT',
          `UID:defense-${doc.id}@hit-organization`,
          `DTSTAMP:${stamp(now)}`,
          time ? `DTSTART;TZID=Asia/Jerusalem:${ymd}T${time.replace(':', '')}00` : `DTSTART;VALUE=DATE:${ymd}`,
          time ? 'DURATION:PT1H' : `DTEND;VALUE=DATE:${nextDay(ymd)}`,
          `SUMMARY:${esc(`🎓 ${he ? 'הגנה' : 'Defense'}: ${project}`)}`,
          ...(where ? [`LOCATION:${esc(where)}`] : []),
          ...(m.onlineDefenseLink ? [`URL:${esc(String(m.onlineDefenseLink))}`] : []),
          'END:VEVENT',
        ].join('\r\n'));
        continue;
      }

      const ymd = ymdInIsrael(due);
      events.push([
        'BEGIN:VEVENT',
        `UID:due-${doc.id}@hit-organization`,
        `DTSTAMP:${stamp(now)}`,
        `DTSTART;VALUE=DATE:${ymd}`,
        `DTEND;VALUE=DATE:${nextDay(ymd)}`,
        `SUMMARY:${esc(`📌 ${he ? 'מועד הגשה' : 'Due'}: ${name}`)}`,
        ...(project ? [`DESCRIPTION:${esc(project)}`] : []),
        'END:VEVENT',
      ].join('\r\n'));
    }

    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//HIT Organization//Student milestones//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      ...events,
      'END:VCALENDAR',
      '',
    ].join('\r\n').split('\r\n').map(fold).join('\r\n');

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="milestones.ics"');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(ics);
  } catch (err) {
    console.error('getStudentCalendar error:', err);
    return res.status(500).json({ message: L(req, 'Failed to build the calendar file.', 'יצירת קובץ היומן נכשלה.') });
  }
};
