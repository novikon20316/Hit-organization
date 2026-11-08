// src/controllers/searchController.ts
//
// GET /api/search?q= — the web Ctrl+K search (components/CommandPalette.tsx).
// Screens are searched client-side from the user's own menu; this returns
// only data the caller can already open elsewhere (rules agreed 2026-11-08):
//   - projects: staff record roles see exactly what Project Records lets
//     them open (callerRecordScope/projectWithinScope); a supervisor sees
//     their own (primary or secondary) projects; nobody else gets any.
//   - students: only roles that already have a students list
//     (isStudentWithinStaffScope — admin, faculty admin, grad school head,
//     administrative coordinator, school head), name match only, returning
//     name + major — no email, phone or ID number.
// Results are capped, and the per-instance cache only holds what the same
// server already reads; every result is still filtered per caller.

import { Response } from 'express';
import { db } from '../config/firebase.js';
import { AuthenticatedRequest, hasAnyRole } from '../middleware/auth.js';
import { isStudentWithinStaffScope } from '../services/scopeAuthorization.js';
import { STAFF_RECORD_ROLES, callerRecordScope, projectWithinScope } from './projectRecordsController.js';
import { L } from '../utils/localize.js';

const MAX_RESULTS = 8;
const CACHE_MS = 60_000;
const STUDENT_SEARCH_ROLES = ['system_admin', 'faculty_admin', 'grad_school_head', 'administrative_secretary', 'school_head'];

interface ProjectRow { id: string; titleHe: string; titleEn: string; supervisorId: string | null; secondarySupervisorId: string | null; facultyId: string; major: string | null; degreeType: string | null; status: string }
interface StudentRow { id: string; displayName: string; major: string | null; facultyId: string; degreeType: string | null }

let projectCache: { at: number; rows: ProjectRow[] } | null = null;
let studentCache: { at: number; rows: StudentRow[] } | null = null;

async function allProjects(): Promise<ProjectRow[]> {
  if (projectCache && Date.now() - projectCache.at < CACHE_MS) return projectCache.rows;
  const snap = await db.collection('projects').get();
  const rows = snap.docs.map((d) => {
    const p = d.data();
    return {
      id: d.id,
      titleHe: String(p.titleHe ?? ''),
      titleEn: String(p.titleEn ?? ''),
      supervisorId: p.supervisorId ?? null,
      secondarySupervisorId: p.secondarySupervisorId ?? null,
      facultyId: p.facultyId ?? '',
      major: p.major ?? null,
      degreeType: p.degreeType ?? null,
      status: p.status ?? '',
    };
  });
  projectCache = { at: Date.now(), rows };
  return rows;
}

async function allStudents(): Promise<StudentRow[]> {
  if (studentCache && Date.now() - studentCache.at < CACHE_MS) return studentCache.rows;
  const snap = await db.collection('users').where('role', '==', 'student').get();
  const rows = snap.docs.map((d) => {
    const u = d.data();
    return { id: d.id, displayName: String(u.displayName ?? ''), major: u.major ?? null, facultyId: u.facultyId ?? '', degreeType: u.degreeType ?? null };
  });
  studentCache = { at: Date.now(), rows };
  return rows;
}

const norm = (s: string) => s.toLocaleLowerCase('he').normalize('NFKC');

export const search = async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user;
  if (!user) return res.status(401).json({ message: L(req, 'Unauthorized.', 'אין הרשאה.') });
  const raw = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (raw.length < 2 || raw.length > 60) return res.status(200).json({ projects: [], students: [] });
  const q = norm(raw);

  try {
    let projects: ProjectRow[] = [];
    if (hasAnyRole(user, STAFF_RECORD_ROLES)) {
      const scope = callerRecordScope(user);
      projects = (await allProjects()).filter((p) => projectWithinScope(scope, p));
    } else if (hasAnyRole(user, ['supervisor', 'secondary_supervisor'])) {
      projects = (await allProjects()).filter((p) => p.supervisorId === user.uid || p.secondarySupervisorId === user.uid);
    }
    const projectHits = projects
      .filter((p) => norm(p.titleHe).includes(q) || norm(p.titleEn).includes(q))
      .slice(0, MAX_RESULTS)
      .map((p) => ({ id: p.id, titleHe: p.titleHe, titleEn: p.titleEn, supervisorId: p.supervisorId, facultyId: p.facultyId, major: p.major, status: p.status }));

    let studentHits: Array<{ id: string; displayName: string; major: string | null }> = [];
    if (hasAnyRole(user, STUDENT_SEARCH_ROLES)) {
      studentHits = (await allStudents())
        .filter((s) => norm(s.displayName).includes(q) && isStudentWithinStaffScope(user, s))
        .slice(0, MAX_RESULTS)
        .map((s) => ({ id: s.id, displayName: s.displayName, major: s.major }));
    }

    return res.status(200).json({ projects: projectHits, students: studentHits });
  } catch (error) {
    console.error('search error:', error);
    return res.status(500).json({ message: L(req, 'Search failed.', 'החיפוש נכשל.') });
  }
};
