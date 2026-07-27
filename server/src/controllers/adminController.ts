// src/controllers/adminController.ts

import { Response } from 'express';
import admin from 'firebase-admin';
import crypto from 'crypto';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { enrollStudentInProject } from '../services/projectEnrollment.js';
import { checkDeletionEligibility, purgeAccount } from '../services/accountDeletion.js';
import { VALID_ROLES, generateTempPassword, hashPassword } from '../services/userImportExport.js';
import { logAuditEvent } from '../services/auditLog.js';
import { VALID_MAJORS, majorsForFaculty } from '../config/majors.js';
import { WEBSITE_URL, APP_LINK_URL_IOS, APP_LINK_URL_ANDROID } from '../config/links.js';
import {
  validateScopeRule, validateCoordinatorScope,
  ADMIN_TIER_ROLES, DELEGATE_ADMIN_ROLES, DELEGATE_RESTRICTED_ACTIONS,
  VALID_SCOPE_FACULTY_IDS,
  type ScopeRule, type CoordinatorScope,
} from '../config/permissionScopes.js';
import { hasActionGrant, withinCoordinatorScope } from '../services/scopeAuthorization.js';
import { resolveWorkflowTemplateRefs, DEGREE_TYPE_ORDER, PROJECT_TYPE_ORDER } from '../services/workflowTemplates.js';
import { isValidEmailFormat, domainHasMailServer } from '../services/emailValidation.js';
import { notifyUser } from '../services/notify.js';
import { validateSystemAdminPassword, validateStandardPassword, computeIsEligible } from './userController.js';

const db = admin.firestore();

/**
 * GET /api/admin/dashboard-summary
 * Returns all users, projects, milestones and unread count for system_admin panel.
 * Only accessible by system_admin role.
 */
export const getAdminDashboardSummary = async (req: AuthenticatedRequest, res: Response) => {
  const uid  = req.user?.uid;
  const role = req.user?.role;

  if (role !== 'system_admin') {
    return res.status(403).json({ message: 'Access denied: system_admin only.' });
  }

  try {
    // Fetch everything in parallel
    const [usersSnap, projectsSnap, milestonesSnap, notifSnap] = await Promise.all([
      db.collection('users').get(),
      db.collection('projects').get(),
      db.collection('milestones').get(),
      db.collection('notifications')
        .where('recipientId', '==', uid)
        .where('isRead', '==', false)
        .get(),
    ]);

    const users = usersSnap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));

    const projects = projectsSnap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));

    const milestones = milestonesSnap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));

    return res.status(200).json({
      users,
      projects,
      milestones,
      unreadCount: notifSnap.size,
    });
  } catch (error: any) {
    console.error('getAdminDashboardSummary error:', error);
    return res.status(500).json({ message: 'Failed to load admin dashboard data.' });
  }
};

/**
 * GET /api/admin/milestones
 * Returns milestones filtered by a specific projectId for the system_admin panel.
 */
export const getAdminProjectMilestones = async (req: AuthenticatedRequest, res: Response) => {
  const role = req.user?.role;

  if (role !== 'system_admin') {
    return res.status(403).json({ message: 'Access denied: system_admin only.' });
  }

  try {
    const { projectId } = req.query;

    if (!projectId) {
      return res.status(400).json({ message: 'Missing required projectId query parameter.' });
    }

    console.log(`📡 Admin fetching milestones for project: ${projectId}`);

    // Query Firestore explicitly for documents matching this project
    const milestonesSnap = await db.collection('milestones')
      .where('projectId', '==', projectId)
      .get();

    const milestones = milestonesSnap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));

    return res.status(200).json(milestones);
  } catch (error: any) {
    console.error('getAdminProjectMilestones error:', error);
    return res.status(500).json({ message: 'Failed to load project milestones.' });
  }
};

/**
 * 2. GET /api/admin/supervisors
 * Fetches all users currently registered with the 'supervisor' role.
 */
export const getSupervisorsList = async (req: AuthenticatedRequest, res: Response) => {
  if (req.user?.role !== 'system_admin') {
    return res.status(403).json({ message: 'Access denied: system_admin only.' });
  }
  try {
    const snap = await db.collection('users').where('role', '==', 'supervisor').get();
    const supervisors = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return res.status(200).json(supervisors);
  } catch (error: any) {
    console.error('getSupervisorsList Error:', error);
    return res.status(500).json({ message: 'Failed to fetch supervisors.' });
  }
};

// ==========================================
// POST FUNCTIONS (6)
// ==========================================

const VALID_FACULTY_IDS_NO_ALL = VALID_SCOPE_FACULTY_IDS.filter((id) => id !== 'all');

/**
 * 4. POST /api/admin/projects
 * Force-creates a new project from the admin panel — one sibling doc per
 * selected faculty (a "fan-out"), sharing a postingGroupId when more than one
 * faculty is selected. facultyId/degreeType/projectType stay scalar on every
 * doc (the "primary" value, first in canonical order) so every existing
 * reader of those fields keeps working unchanged; degreeTypes/projectTypes
 * carry the full multi-select set for the new array-aware consumers (student
 * browse query, applyApplication eligibility check).
 */
export const createAdminProject = async (req: AuthenticatedRequest, res: Response) => {
  const role  = req.user?.role;
  const roles = req.user?.roles ?? [];
  const isAuthorized =
    ['faculty_admin', 'system_admin', 'grad_school_head', 'administrative_secretary'].includes(role ?? '') ||
    roles.some((r) => ['faculty_admin', 'system_admin', 'grad_school_head', 'administrative_secretary'].includes(r));
  if (!isAuthorized) {
    return res.status(403).json({ message: 'Access denied: faculty_admin, grad_school_head, administrative_secretary, or system_admin only.' });
  }
  try {
    const projectData = req.body;

    // Backward-compatible input shape: accept either the new array fields or
    // the old scalar ones (wrapped into a single-item array).
    const facultyIds: string[] = Array.isArray(projectData.facultyIds)
      ? projectData.facultyIds
      : projectData.facultyId ? [projectData.facultyId] : [];
    const degreeTypesInput: string[] = Array.isArray(projectData.degreeTypes)
      ? projectData.degreeTypes
      : projectData.degreeType ? [projectData.degreeType] : [];
    const projectTypesInput: string[] = Array.isArray(projectData.projectTypes)
      ? projectData.projectTypes
      : projectData.projectType ? [projectData.projectType] : [];

    if (facultyIds.length === 0) {
      return res.status(400).json({ message: 'At least one faculty must be selected.' });
    }
    if (facultyIds.some((id) => !VALID_FACULTY_IDS_NO_ALL.includes(id))) {
      return res.status(400).json({ message: 'One or more selected faculties are invalid.' });
    }
    const degreeTypes = DEGREE_TYPE_ORDER.filter((d) => degreeTypesInput.includes(d));
    const projectTypes = PROJECT_TYPE_ORDER.filter((t) => projectTypesInput.includes(t));
    if (degreeTypes.length === 0) {
      return res.status(400).json({ message: 'At least one degree type must be selected.' });
    }
    if (projectTypes.length === 0) {
      return res.status(400).json({ message: 'At least one project type must be selected.' });
    }

    // Previously unscoped — facultyId came straight from the request body, so
    // a faculty_admin could plant a project in a faculty other than their
    // own. Confine each selected faculty to one this staff member is
    // actually authorized in unless an explicit add_projects grant covers it
    // — reject the whole request if any one selected faculty fails, so a
    // partially-authorized submission never creates a partial fan-out.
    const isSystemAdmin = role === 'system_admin' || roles.includes('system_admin');
    if (!isSystemAdmin) {
      for (const facultyId of facultyIds) {
        const requestedScope = {
          facultyId,
          major: projectData.major,
          degreeLevel: degreeTypes[0]!,
          processType: projectTypes[0]!,
        };
        const withinOwnFaculty = facultyId === req.user?.facultyId;
        if (!withinOwnFaculty && !hasActionGrant(req.user, 'add_projects', requestedScope)) {
          return res.status(403).json({ message: `Cannot create a project in faculty "${facultyId}" — outside your assigned scope.` });
        }
      }
    }

    // A project's major is optional — omitted means open to every major in
    // its faculty (today's implicit behavior, unchanged for existing
    // projects with no major field). If set, it must be a real program of
    // EVERY selected faculty, and — if a supervisor is being assigned —
    // within that supervisor's own assignedMajors restriction, if they have
    // one. Enforced for real by applyApplication + firestore.rules.
    if (projectData.major) {
      for (const facultyId of facultyIds) {
        const validForFaculty = majorsForFaculty(facultyId);
        if (!validForFaculty.includes(projectData.major)) {
          return res.status(400).json({ message: `Invalid major "${projectData.major}" for faculty "${facultyId}".` });
        }
      }
      if (projectData.supervisorId) {
        const supervisorSnap = await db.collection('users').doc(projectData.supervisorId).get();
        const supervisorMajors: string[] = supervisorSnap.data()?.assignedMajors ?? [];
        if (supervisorMajors.length > 0 && !supervisorMajors.includes(projectData.major)) {
          return res.status(400).json({ message: `Major "${projectData.major}" is outside this supervisor's assigned majors.` });
        }
      }
    }

    // Every new project must be explicitly based on the faculty's currently-
    // approved workflow template for each (degreeType, projectType)
    // combination it's open to — resolved per selected faculty (a template
    // is faculty-scoped). Block creation entirely (nothing gets written) if
    // any faculty/combination has no approved template yet, rather than
    // silently falling back to the generic defaults.
    const refsByFaculty = new Map<string, Awaited<ReturnType<typeof resolveWorkflowTemplateRefs>>['refs']>();
    const missingMessages: string[] = [];
    for (const facultyId of facultyIds) {
      const { refs, missing } = await resolveWorkflowTemplateRefs(facultyId, degreeTypes, projectTypes, projectData.major ?? null);
      refsByFaculty.set(facultyId, refs);
      missing.forEach((m) => missingMessages.push(`${facultyId}: no approved workflow template for ${m.degreeType}/${m.projectType} — approve one in Workflow Templates first.`));
    }
    if (missingMessages.length > 0) {
      return res.status(400).json({ message: missingMessages.join(' ') });
    }

    const postingGroupId = facultyIds.length > 1 ? crypto.randomUUID() : null;
    const {
      facultyId: _omitFacultyId, facultyIds: _omitFacultyIds,
      degreeType: _omitDegreeType, degreeTypes: _omitDegreeTypes,
      projectType: _omitProjectType, projectTypes: _omitProjectTypes,
      ...sharedFields
    } = projectData;

    const batch = db.batch();
    const createdIds: string[] = [];
    for (const facultyId of facultyIds) {
      const newProjectRef = db.collection('projects').doc();
      createdIds.push(newProjectRef.id);
      batch.set(newProjectRef, {
        ...sharedFields,
        facultyId,
        degreeType: degreeTypes[0]!,
        degreeTypes,
        projectType: projectTypes[0]!,
        projectTypes,
        workflowTemplateRefs: refsByFaculty.get(facultyId),
        postingGroupId,
        projectId: newProjectRef.id,
        status: projectData.status || 'active',
        createdAt: new Date().toISOString(),
      });
    }
    await batch.commit();

    return res.status(201).json({ success: true, id: createdIds[0], ids: createdIds, message: 'Project created.' });
  } catch (error: any) {
    console.error('createAdminProject Error:', error);
    return res.status(500).json({ message: 'Failed to create project.' });
  }
};

/**
 * 5. POST /api/admin/users/create
 * Registers a new user — creates the Firebase Auth account (Firestore doc ID
 * IS the Auth UID, matching every other part of this codebase that looks
 * users up by req.user.uid) with either an admin-supplied temporary password
 * or an auto-generated one, then emails the temp password and forces a
 * change on first login. Mirrors services/userImportExport.ts's
 * createImportedUserAccount — see that function for the reference pattern.
 */
export const createAdminUser = async (req: AuthenticatedRequest, res: Response) => {
  const isSystemAdmin = req.user?.role === 'system_admin';

  try {
    // tempPassword is never persisted to Firestore — split it out of the
    // spread so an admin-supplied plaintext password can't leak into the
    // user doc.
    const { tempPassword: requestedTempPassword, ...userData } = req.body;

    if (!userData.email || typeof userData.email !== 'string') {
      return res.status(400).json({ message: 'Email is required.' });
    }
    if (!isValidEmailFormat(userData.email)) {
      return res.status(400).json({ message: `Invalid email format: "${userData.email}"` });
    }
    // Not restricted to a fixed domain allowlist (unlike student self-signup)
    // since staff/supervisors can have any real institutional or personal
    // address — instead verify the domain can actually receive mail at all,
    // catching typos (e.g. "gnail.com") before they waste a welcome email
    // send and confuse whoever's expecting the new account to work.
    if (!(await domainHasMailServer(userData.email))) {
      return res.status(400).json({ message: `This email's domain doesn't appear to accept mail: "${userData.email}"` });
    }
    if (!userData.displayName || typeof userData.displayName !== 'string') {
      return res.status(400).json({ message: 'Display name is required.' });
    }

    // A student's major must always be one of the canonical program slugs —
    // never free text or a facultyId fallback — since scope-matching (e.g.
    // coordinator assignment by major) depends on it being reliable.
    if (userData.role === 'student' && !VALID_MAJORS.has(userData.major)) {
      return res.status(400).json({ message: `Invalid major: "${userData.major}"` });
    }

    // Supervisors/secondary_supervisors can optionally be restricted to a
    // subset of their faculty's majors — an empty/omitted list means
    // unrestricted (all majors in the faculty), matching today's implicit
    // behavior. Enforced for real at project-creation time (createSupervisorProject/
    // createAdminProject) and at application time (applyApplication).
    if (['supervisor', 'secondary_supervisor'].includes(userData.role)) {
      const assignedMajors = Array.isArray(userData.assignedMajors) ? userData.assignedMajors : [];
      const validForFaculty = majorsForFaculty(userData.facultyId);
      const invalid = assignedMajors.filter((m: unknown) => typeof m !== 'string' || !validForFaculty.includes(m));
      if (invalid.length > 0) {
        return res.status(400).json({ message: `Invalid major(s) for faculty "${userData.facultyId}": ${invalid.join(', ')}` });
      }
      userData.assignedMajors = assignedMajors;
    } else {
      delete userData.assignedMajors;
    }

    // Previously system_admin-only with no delegation path at all. Two ways
    // in for a non-system_admin now: (a) faculty_admin/program_head/
    // grad_school_head acting within their own natural scope — no grant
    // needed, that's the whole point of letting them self-serve — or (b) an
    // explicit add_users grant (see scopeAuthorization.ts) scoped to the new
    // account's facultyId/major, for anyone else it's been delegated to.
    // Neither path may ever create an admin-tier account.
    if (!isSystemAdmin) {
      if (ADMIN_TIER_ROLES.includes(userData.role)) {
        return res.status(403).json({ message: 'Access denied: system_admin only.' });
      }
      const callerRole = req.user?.role ?? '';
      const isDelegateAdmin = DELEGATE_ADMIN_ROLES.includes(callerRole);
      const inOwnFacultyScope = isDelegateAdmin && (callerRole === 'grad_school_head' || userData.facultyId === req.user?.facultyId);
      const requestedScope = { facultyId: userData.facultyId, major: userData.major };
      if (!inOwnFacultyScope && !hasActionGrant(req.user, 'add_users', requestedScope)) {
        return res.status(403).json({ message: 'Access denied: system_admin only.' });
      }
    }

    let tempPassword: string;
    if (requestedTempPassword) {
      if (typeof requestedTempPassword !== 'string') {
        return res.status(400).json({ message: 'Invalid temporary password.' });
      }
      // Same policy userController.ts's changePassword enforces — a custom
      // temp password shouldn't get to skip the bar the account's real
      // password will be held to a moment later anyway.
      const policyError = userData.role === 'system_admin'
        ? validateSystemAdminPassword(requestedTempPassword)
        : validateStandardPassword(requestedTempPassword);
      if (policyError) return res.status(400).json({ message: policyError });
      tempPassword = requestedTempPassword;
    } else {
      tempPassword = generateTempPassword();
    }

    let authUser;
    try {
      authUser = await admin.auth().createUser({
        email: userData.email,
        password: tempPassword,
        displayName: userData.displayName,
        // Admin-provisioned accounts are trusted (created directly by
        // system_admin) — not self-registered, so login.tsx's
        // emailVerified gate (meant for self-signup students) doesn't
        // apply here. Without this every admin-created account would be
        // locked out on first login with "please verify your email."
        emailVerified: true,
      });
    } catch (authError: any) {
      if (authError?.code === 'auth/email-already-exists') {
        return res.status(409).json({ message: 'A user with this email already exists.' });
      }
      throw authError;
    }

    await db.collection('users').doc(authUser.uid).set({
      ...userData,
      uid: authUser.uid,
      totp_enabled: false,       // becomes true after they complete setup2fa
      totp_last_verified: null,
      isActive: true,
      mustChangePassword: true, // enforced in-app on first login — see /api/users/change-password
      tempPasswordHash: hashPassword(tempPassword),
      createdAt: new Date().toISOString()
    });

    try {
      // Also attempts SMS (iff a phoneNumber was given) and push (naturally
      // skipped — no expoPushToken exists yet for a brand-new account).
      // Delivery outcome for every channel is persisted on the created
      // notification doc — see services/notify.ts.
      await notifyUser({
        recipientId: authUser.uid,
        type: 'account_created',
        titleHe: '🎓 ברוך הבא למערכת',
        titleEn: '🎓 Welcome to the System',
        bodyHe: `מנהל המערכת הוסיף אותך למערכת ניהול פרויקטי הגמר. בדוק את תיבת הדוא"ל שלך לפרטי ההתחברות. כניסה למערכת: ${WEBSITE_URL}`,
        bodyEn: `The system administrator added you to the Projects & Thesis Management System. Check your email for login details. Log in at: ${WEBSITE_URL}`,
        emailData: {
          email: userData.email,
          tempPassword,
          appLinkIos:     APP_LINK_URL_IOS,
          appLinkAndroid: APP_LINK_URL_ANDROID,
        },
      });
    } catch (notifyError) {
      console.error(`Welcome notification failed for ${userData.email}:`, notifyError);
    }

    return res.status(201).json({ success: true, id: authUser.uid, tempPassword, message: 'User created.' });
  } catch (error: any) {
    console.error('createAdminUser Error:', error);
    return res.status(500).json({ message: 'Failed to create user.' });
  }
};

/**
 * 6. POST /api/admin/projects/:id/enroll-student
 * Manually forces a student enrollment into a specific project.
 */
export const enrollStudentAdmin = async (req: AuthenticatedRequest, res: Response) => {
  if (req.user?.role !== 'system_admin') {
    return res.status(403).json({ message: 'Access denied: system_admin only.' });
  }

  const { id: projectId } = req.params;
  // track: optional explicit choice of which track (degreeType/projectType)
  // to enroll this student under, for a project open to more than one —
  // defaults to the project's own primary values when omitted.
  const { studentId, track } = req.body;

  if (!studentId) return res.status(400).json({ message: 'Missing studentId in request body.' });
  if(!projectId || typeof projectId !== 'string'){
    return res.status(500).json({
        success:false,
        message:"projectId is not good"
    })
  }
  try {
    const projectRef = db.collection('projects').doc(projectId);
    const [projectSnap, studentSnap] = await Promise.all([
      projectRef.get(),
      db.collection('users').doc(studentId).get(),
    ]);

    if (!projectSnap.exists) return res.status(404).json({ message: 'Project not found.' });
    if (!studentSnap.exists || studentSnap.data()?.hasActiveProject) {
      return res.status(400).json({ message: 'Student not found or already assigned to a project.' });
    }

    const projectData = projectSnap.data()!;
    await enrollStudentInProject(projectId, studentId, projectData.supervisorId, projectData.facultyId, track);

    return res.status(200).json({ success: true, message: 'Student officially enrolled.' });
  } catch (error: any) {
    console.error('enrollStudentAdmin Error:', error);
    return res.status(500).json({ message: 'Failed to enroll student.' });
  }
};

/**
 * 7. POST /api/admin/users/:id/role-update
 * Changes a user's operational privileges (e.g., 'student' -> 'supervisor').
 */
export const updateUserRoleAdmin = async (req: AuthenticatedRequest, res: Response) => {
  const isSystemAdmin = req.user?.role === 'system_admin';

  const { id: userId } = req.params;
  const { role, roles, facultyId, assignedMajors, permissionRules, coordinatorScopes } = req.body;

  if (!role) return res.status(400).json({ message: 'Missing role parameter.' });
  if (!VALID_ROLES.includes(role)) {
    return res.status(400).json({ message: `Invalid role: ${role}` });
  }
  if (roles !== undefined) {
    if (!Array.isArray(roles) || !roles.every((r: string) => VALID_ROLES.includes(r))) {
      return res.status(400).json({ message: 'Invalid roles array.' });
    }
  }
  if(!userId || typeof userId !== 'string'){
    return res.status(500).json({
        success:false,
        message:"projectId is not good"
    })
  }

  const callerRole = req.user?.role ?? '';
  const isDelegateAdmin = DELEGATE_ADMIN_ROLES.includes(callerRole);
  const isGradSchoolHead = callerRole === 'grad_school_head';
  // A delegate's own faculty — grad_school_head is cross-faculty, so any
  // facultyId is "their own" for scope-matching purposes below.
  const scopeAllowedForCaller = (facultyIdToCheck: unknown) =>
    isGradSchoolHead || facultyIdToCheck === req.user?.facultyId;

  // Previously system_admin-only with no delegation path at all for the
  // granular grant fields. Now: faculty_admin/program_head/grad_school_head
  // may set permissionRules/coordinatorScopes too, but only within their own
  // scope, and never the two most sensitive actions (delete_users,
  // all_actions) — those stay system_admin-exclusive even for delegates.
  // Anyone else non-system_admin still can't touch these fields at all.
  if (!isSystemAdmin) {
    if (ADMIN_TIER_ROLES.includes(role)) {
      return res.status(403).json({ message: 'Cannot grant an admin-tier role.' });
    }
    if (permissionRules !== undefined || coordinatorScopes !== undefined) {
      if (!isDelegateAdmin) {
        return res.status(403).json({ message: 'Only system_admin may modify granular permissions.' });
      }
      for (const rule of Array.isArray(permissionRules) ? permissionRules : []) {
        if (Array.isArray(rule?.actions) && rule.actions.some((a: string) => DELEGATE_RESTRICTED_ACTIONS.includes(a as any))) {
          return res.status(403).json({ message: 'Only system_admin may grant delete_users or all_actions.' });
        }
        if (!scopeAllowedForCaller(rule?.facultyId)) {
          return res.status(403).json({ message: 'Cannot grant a permission scoped outside your own faculty.' });
        }
      }
      for (const scope of Array.isArray(coordinatorScopes) ? coordinatorScopes : []) {
        if (!scopeAllowedForCaller(scope?.facultyId)) {
          return res.status(403).json({ message: 'Cannot grant a coordinator scope outside your own faculty.' });
        }
      }
    }
  }

  // Granular per-user permission grants and a coordinator's own operational
  // scope — see lib/permissions.ts (web) / constants/permissions.ts (mobile)
  // and server/src/services/scopeAuthorization.ts for how these get enforced.
  let resolvedPermissionRules: ScopeRule[] | undefined;
  if (permissionRules !== undefined) {
    if (!Array.isArray(permissionRules)) {
      return res.status(400).json({ message: 'Invalid permissionRules: expected an array.' });
    }
    for (const rule of permissionRules) {
      const error = validateScopeRule(rule);
      if (error) return res.status(400).json({ message: `Invalid permission rule: ${error}` });
    }
    resolvedPermissionRules = permissionRules as ScopeRule[];
  }

  let resolvedCoordinatorScopes: CoordinatorScope[] | undefined;
  if (coordinatorScopes !== undefined) {
    if (!Array.isArray(coordinatorScopes)) {
      return res.status(400).json({ message: 'Invalid coordinatorScopes: expected an array.' });
    }
    for (const scope of coordinatorScopes) {
      const error = validateCoordinatorScope(scope);
      if (error) return res.status(400).json({ message: `Invalid coordinator scope: ${error}` });
    }
    resolvedCoordinatorScopes = coordinatorScopes as CoordinatorScope[];
  }

  // Supervisors/secondary_supervisors can optionally be restricted to a
  // subset of their (possibly just-changed) faculty's majors — same
  // validation/semantics as createAdminUser. Only meaningful alongside a
  // facultyId, so validate against whatever facultyId this request is
  // actually setting.
  let resolvedAssignedMajors: string[] | undefined;
  if (['supervisor', 'secondary_supervisor'].includes(role)) {
    resolvedAssignedMajors = Array.isArray(assignedMajors) ? assignedMajors : [];
    const validForFaculty = majorsForFaculty(facultyId);
    const invalid = resolvedAssignedMajors.filter((m: unknown) => typeof m !== 'string' || !validForFaculty.includes(m));
    if (invalid.length > 0) {
      return res.status(400).json({ message: `Invalid major(s) for faculty "${facultyId}": ${invalid.join(', ')}` });
    }
  }

  try {
    const beforeSnap = await db.collection('users').doc(userId).get();
    const before = beforeSnap.data();

    if (!isSystemAdmin) {
      if (!before) return res.status(404).json({ message: 'User not found.' });
      if (ADMIN_TIER_ROLES.includes(before.role)) {
        return res.status(403).json({ message: 'Cannot modify an admin-tier account.' });
      }
      const currentScope = { facultyId: before.facultyId, major: before.major };
      const newFacultyId = typeof facultyId === 'string' && facultyId ? facultyId : before.facultyId;
      const newScope = { facultyId: newFacultyId, major: before.major };
      // A delegate acting within their own faculty (any faculty, for
      // grad_school_head) needs no pre-existing grant — that's the point of
      // letting them self-serve. Anyone else (e.g. a coordinator holding an
      // explicit edit_users grant) still goes through the grant check.
      const inOwnFacultyScope = isDelegateAdmin && scopeAllowedForCaller(currentScope.facultyId) && scopeAllowedForCaller(newScope.facultyId);
      if (!inOwnFacultyScope && (!hasActionGrant(req.user, 'edit_users', currentScope) || !hasActionGrant(req.user, 'edit_users', newScope))) {
        return res.status(403).json({ message: 'Cannot modify a user outside your assigned scope.' });
      }
    }

    await db.collection('users').doc(userId).update({
      role: role,
      // Additional roles (e.g. secondary_supervisor on top of supervisor) —
      // previously collected by the Edit User modal but silently dropped here.
      roles: Array.isArray(roles) ? roles : admin.firestore.FieldValue.delete(),
      // facultyId was collected by the Edit User modal but never actually
      // persisted here until now — needed so a supervisor's assignedMajors
      // (below) always corresponds to their real, saved faculty.
      ...(typeof facultyId === 'string' && facultyId ? { facultyId } : {}),
      assignedMajors: resolvedAssignedMajors ?? admin.firestore.FieldValue.delete(),
      permissionRules: resolvedPermissionRules?.length ? resolvedPermissionRules : admin.firestore.FieldValue.delete(),
      coordinatorScopes: resolvedCoordinatorScopes?.length ? resolvedCoordinatorScopes : admin.firestore.FieldValue.delete(),
      updatedAt: new Date().toISOString()
    });

    // Privilege changes are exactly the kind of action this app's prior
    // security audits have flagged as needing a trail — log after the write
    // commits so a logging failure can never block the role change itself.
    await logAuditEvent({
      userId: req.user!.uid,
      userRole: req.user!.role,
      action: 'role_changed',
      entityType: 'user',
      entityId: userId,
      oldValue: {
        role: before?.role ?? null,
        roles: before?.roles ?? [],
        permissionRuleCount: (before?.permissionRules ?? []).length,
        coordinatorScopeCount: (before?.coordinatorScopes ?? []).length,
      },
      newValue: {
        role,
        roles: Array.isArray(roles) ? roles : [],
        permissionRuleCount: resolvedPermissionRules?.length ?? 0,
        coordinatorScopeCount: resolvedCoordinatorScopes?.length ?? 0,
      },
    });

    return res.status(200).json({ success: true, message: `User role updated to ${role}.` });
  } catch (error: any) {
    console.error('updateUserRoleAdmin Error:', error);
    return res.status(500).json({ message: 'Failed to update user role.' });
  }
};

/**
 * 8. POST /api/admin/users/:id/toggle-status
 * Suspends or activates a user account.
 */
export const toggleUserStatusAdmin = async (req: AuthenticatedRequest, res: Response) => {
  if (req.user?.role !== 'system_admin') {
    return res.status(403).json({ message: 'Access denied: system_admin only.' });
  }

  const { id: userId } = req.params;
  const { isActive } = req.body;

  if (typeof isActive !== 'boolean') {
    return res.status(400).json({ message: 'isActive must be a boolean value.' });
  }
  if(!userId || typeof userId !== 'string'){
    return res.status(500).json({
        success:false,
        message:"projectId is not good"
    })
  }
  try {
    await db.collection('users').doc(userId).update({
      isActive: isActive,
      updatedAt: new Date().toISOString()
    });

    // Reactivating also clears the Auth-level `disabled` flag — the only
    // recovery path for an account the login-security flow locked (an
    // unresolved 3-failed-attempts incident) and the owner never responded
    // to. Without this an admin could flip isActive back on here and the
    // account would still be unable to sign in at all.
    if (isActive) {
      await admin.auth().updateUser(userId, { disabled: false }).catch((err) => {
        console.error(`Failed to clear Auth-level disabled flag for ${userId}:`, err);
      });
    }

    return res.status(200).json({ success: true, message: `User status updated to ${isActive ? 'Active' : 'Suspended'}.` });
  } catch (error: any) {
    console.error('toggleUserStatusAdmin Error:', error);
    return res.status(500).json({ message: 'Failed to toggle user status.' });
  }
};

// ==========================================
// DELETE FUNCTIONS (1)
// ==========================================

/**
 * 10. DELETE /api/admin/projects/:id
 * Permanently removes a project from the system.
 */
export const deleteAdminProject = async (req: AuthenticatedRequest, res: Response) => {
  const isSystemAdmin = req.user?.role === 'system_admin';

  const { id: projectId } = req.params;
  if(!projectId || typeof projectId !== 'string'){
        return res.status(500).json({
            success:false,
            message:"projectId is not good"
        })
    }
  try {
    const projectRef = db.collection('projects').doc(projectId);
    const snap = await projectRef.get();

    if (!snap.exists) return res.status(404).json({ message: 'Project not found.' });

    if (!isSystemAdmin) {
      const project = snap.data()!;
      const scope = { facultyId: project.facultyId, major: project.major, degreeLevel: project.degreeType, processType: project.projectType };
      if (!hasActionGrant(req.user, 'delete_projects', scope)) {
        return res.status(403).json({ message: 'Access denied: system_admin only.' });
      }
    }

    await projectRef.delete();

    return res.status(200).json({ success: true, message: 'Project permanently deleted.' });
  } catch (error: any) {
    console.error('deleteAdminProject Error:', error);
    return res.status(500).json({ message: 'Failed to delete project.' });
  }
};

/**
 * POST /api/admin/users/:id/disable-2fa
 * Disables 2FA for a specific user. Accessible by system_admin and faculty_admin.
 */
export const disableUser2FA = async (req: AuthenticatedRequest, res: Response) => {
  const role = req.user?.role;
  const roles = req.user?.roles ?? [];

  const isAuthorized = role === 'system_admin' ||  roles.includes('system_admin') ;
  if (!isAuthorized) {
    return res.status(403).json({ message: 'Access denied: admin only.' });
  }

  const { id: userId } = req.params;
  if (!userId || typeof userId !== 'string') return res.status(400).json({ message: 'Missing userId.' });

  try {
    await Promise.all([
      db.collection('users').doc(userId).update({
        totp_enabled:      false,
        totp_last_verified: null,
        updatedAt:         new Date().toISOString(),
      }),
      // Actual secret lives in the private subcollection now — must be cleared
      // there too, or the old secret keeps working even though totp_enabled is false.
      db.collection('users').doc(userId).collection('private').doc('totp').delete(),
    ]);

    return res.status(200).json({ success: true, message: '2FA disabled for user.' });
  } catch (error: any) {
    console.error('disableUser2FA error:', error);
    return res.status(500).json({ message: 'Failed to disable 2FA.' });
  }
};

/**
 * POST /api/admin/users/:id/erase
 * Permanently deletes a user's Firebase Auth account + Firestore data —
 * system_admin only. Immediate, no grace period (matches existing admin-
 * action conventions like deleteAdminProject/toggleUserStatusAdmin). Runs
 * the same eligibility check as self-service deletion — an admin can't
 * bypass it either, to avoid orphaning a supervisor's active students, a
 * student's own active project, or an unfinished defense-grading assignment.
 */
export const eraseUserBySystemAdmin = async (req: AuthenticatedRequest, res: Response) => {
  const role = req.user?.role;
  const roles = req.user?.roles ?? [];
  const isSystemAdmin = role === 'system_admin' || roles.includes('system_admin');

  const { id: userId } = req.params;
  if (!userId || typeof userId !== 'string') return res.status(400).json({ message: 'Missing userId.' });

  try {
    if (!isSystemAdmin) {
      const targetSnap = await db.collection('users').doc(userId).get();
      if (!targetSnap.exists) return res.status(404).json({ message: 'User not found.' });
      const target = targetSnap.data()!;
      if (ADMIN_TIER_ROLES.includes(target.role)) {
        return res.status(403).json({ message: 'Access denied: system_admin only.' });
      }
      const scope = { facultyId: target.facultyId, major: target.major };
      if (!hasActionGrant(req.user, 'delete_users', scope)) {
        return res.status(403).json({ message: 'Access denied: system_admin only.' });
      }
    }

    const result = await checkDeletionEligibility(userId);
    if (!result.eligible) {
      return res.status(409).json({ message: result.reason });
    }

    await purgeAccount(userId);
    return res.status(200).json({ success: true, message: 'User erased.' });
  } catch (error: any) {
    console.error('eraseUserBySystemAdmin error:', error);
    return res.status(500).json({ message: error.message || 'Failed to erase user.' });
  }
};

/**
 * GET /api/admin/defense-access-grants?status=expired
 * Lists defense-day access grants, optionally filtered by their CURRENT
 * (computed) status — the stored `status` field can be stale since nothing
 * flips it at midnight, so we recompute before filtering.
 */
export const listDefenseAccessGrants = async (req: AuthenticatedRequest, res: Response) => {
  if (req.user?.role !== 'system_admin') {
    return res.status(403).json({ message: 'Access denied: system_admin only.' });
  }

  try {
    const { status: statusFilter } = req.query;
    const snap = await db.collection('defenseAccessGrants').get();
    const now = new Date();

    const grants = snap.docs
      .map((d) => {
        const g = d.data();
        const activatesAt = new Date(g.activatesAt);
        const effectiveExpiresAt = g.status === 'admin_extended' && g.adminExtension?.newExpiresAt
          ? new Date(g.adminExtension.newExpiresAt)
          : new Date(g.expiresAt);
        const computedStatus = now < activatesAt ? 'not_yet_active' : now > effectiveExpiresAt ? 'expired' : 'active';
        return { id: d.id, ...g, computedStatus };
      })
      .filter((g) => !statusFilter || g.computedStatus === statusFilter);

    return res.status(200).json({ grants });
  } catch (error: any) {
    console.error('listDefenseAccessGrants error:', error);
    return res.status(500).json({ message: 'Failed to load defense access grants.' });
  }
};

/**
 * POST /api/admin/defense-access-grants/:grantCode/extend
 * The "they missed the defense-day window" recovery path — only usable once
 * a grant has actually expired, per the requirement that this is a recovery
 * action, not a way to pre-extend an active window.
 * Body: { newExpiresAtISO: string, reason?: string }
 */
export const extendDefenseAccessGrant = async (req: AuthenticatedRequest, res: Response) => {
  if (req.user?.role !== 'system_admin') {
    return res.status(403).json({ message: 'Access denied: system_admin only.' });
  }

  const { grantCode } = req.params;
  const { newExpiresAtISO, reason } = req.body;
  const adminUid = req.user!.uid;

  if (!grantCode || typeof grantCode !== 'string') {
    return res.status(400).json({ message: 'Missing grantCode.' });
  }
  if (!newExpiresAtISO || isNaN(new Date(newExpiresAtISO).getTime())) {
    return res.status(400).json({ message: 'newExpiresAtISO must be a valid ISO date string.' });
  }

  try {
    const grantRef = db.collection('defenseAccessGrants').doc(grantCode);
    const grantSnap = await grantRef.get();
    if (!grantSnap.exists) return res.status(404).json({ message: 'Access grant not found.' });
    const grant = grantSnap.data()!;

    const now = new Date();
    const currentExpiresAt = grant.status === 'admin_extended' && grant.adminExtension?.newExpiresAt
      ? new Date(grant.adminExtension.newExpiresAt)
      : new Date(grant.expiresAt);
    if (now <= currentExpiresAt) {
      return res.status(400).json({ message: 'This grant has not expired yet — extension is only for missed windows.' });
    }

    await grantRef.update({
      status: 'admin_extended',
      adminExtension: {
        extendedBy: adminUid,
        extendedAt: now.toISOString(),
        newExpiresAt: newExpiresAtISO,
        reason: reason ?? '',
      },
      accessLog: [...(grant.accessLog ?? []), { action: 'admin_extended', timestamp: now.toISOString() }],
    });

    return res.status(200).json({ success: true, message: 'Access grant extended.' });
  } catch (error: any) {
    console.error('extendDefenseAccessGrant error:', error);
    return res.status(500).json({ message: 'Failed to extend access grant.' });
  }
};

/**
 * PUT /api/admin/users/:id/academic-year
 * Body: { yearOfStudy?: number, heldBack?: boolean, reason?: string }
 *
 * Previously there was NO way at all to correct/advance a student's
 * yearOfStudy after account creation (see userController.ts's
 * computeIsEligible fix — a student stuck as "ineligible" had no path out
 * even once they reached their real final year). `heldBack` additionally
 * lets staff explicitly record "keep this student in the same academic
 * year" (a genuine hold-back), distinct from simply correcting a wrong
 * number — visible elsewhere as an academicYearHeld badge/audit trail.
 */
const ACADEMIC_YEAR_ROLES = ['system_admin', 'administrative_secretary'];

export const updateStudentAcademicYear = async (req: AuthenticatedRequest, res: Response) => {
  const callerUid = req.user?.uid;
  if (!callerUid) return res.status(401).json({ message: 'Unauthorized.' });
  if (!req.user?.role || !ACADEMIC_YEAR_ROLES.includes(req.user.role)) {
    return res.status(403).json({ message: "Only system_admin or administrative_secretary may change a student's academic year." });
  }

  const { id: studentId } = req.params;
  const { yearOfStudy, heldBack, reason } = req.body;
  if (!studentId || typeof studentId !== 'string') {
    return res.status(400).json({ message: 'Invalid studentId.' });
  }
  if (yearOfStudy !== undefined && (typeof yearOfStudy !== 'number' || !Number.isInteger(yearOfStudy) || yearOfStudy < 1 || yearOfStudy > 10)) {
    return res.status(400).json({ message: 'yearOfStudy must be an integer between 1 and 10.' });
  }
  if (heldBack === true && (!reason || typeof reason !== 'string' || !reason.trim())) {
    return res.status(400).json({ message: 'A reason is required to hold a student back in the same academic year.' });
  }

  try {
    const studentRef = db.collection('users').doc(studentId);
    const studentSnap = await studentRef.get();
    if (!studentSnap.exists) return res.status(404).json({ message: 'Student not found.' });
    const student = studentSnap.data()!;
    if (student.role !== 'student') {
      return res.status(400).json({ message: 'This action only applies to student accounts.' });
    }
    // HIGH FIX: administrative_secretary's facultyId is always the literal
    // string 'all' (see CROSS_FACULTY_ROLES in userController.ts) — her real
    // scope lives in coordinatorScopes. This endpoint had no scope check at
    // all, so a secretary assigned only to e.g. "sciences" could change the
    // academic year (and thus thesis eligibility) of a student in any other
    // faculty. Every other administrative_secretary-facing endpoint in this
    // codebase already enforces this the same way.
    if (req.user.role === 'administrative_secretary' &&
        !withinCoordinatorScope(req.user, { facultyId: student.facultyId ?? '', major: student.major || undefined })) {
      return res.status(403).json({ message: 'This student is outside your assigned scope.' });
    }

    const newYearOfStudy = yearOfStudy !== undefined ? yearOfStudy : (student.yearOfStudy ?? null);
    const isEligibleForProcess = computeIsEligible(student.degreeType ?? null, student.major ?? null, newYearOfStudy);

    const update: Record<string, any> = {
      isEligibleForProcess,
      updatedAt: new Date().toISOString(),
    };
    if (yearOfStudy !== undefined) update.yearOfStudy = yearOfStudy;

    if (heldBack === true) {
      update.academicYearHeld = true;
      update.academicYearHeldReason = reason.trim();
      update.academicYearHeldBy = callerUid;
      update.academicYearHeldAt = admin.firestore.FieldValue.serverTimestamp();
    } else if (heldBack === false) {
      update.academicYearHeld = false;
      update.academicYearHeldReason = admin.firestore.FieldValue.delete();
      update.academicYearHeldBy = admin.firestore.FieldValue.delete();
      update.academicYearHeldAt = admin.firestore.FieldValue.delete();
    }

    await studentRef.update(update);

    await logAuditEvent({
      userId: callerUid,
      userRole: req.user.role,
      action: 'academic_year_updated',
      entityType: 'user',
      entityId: studentId,
      oldValue: { yearOfStudy: student.yearOfStudy ?? null, academicYearHeld: student.academicYearHeld ?? false },
      newValue: { yearOfStudy: newYearOfStudy, academicYearHeld: heldBack ?? student.academicYearHeld ?? false },
      explanation: typeof reason === 'string' ? reason : undefined,
    });

    return res.status(200).json({ success: true, message: 'Academic year updated.' });
  } catch (error: any) {
    console.error('updateStudentAcademicYear error:', error);
    return res.status(500).json({ message: error.message || 'Failed to update academic year.' });
  }
};

/**
 * GET /api/admin/students/search?q=...
 * Backs the academic-year management screen — Firestore has no full-text
 * search, so this fetches every student and filters in-memory by
 * displayName/email/studentId substring match. Fine at this system's scale
 * (a university department's student roster, not millions of rows).
 */
export const searchStudents = async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user?.role || !ACADEMIC_YEAR_ROLES.includes(req.user.role)) {
    return res.status(403).json({ message: 'Access denied.' });
  }

  const q = (req.query.q as string | undefined)?.trim().toLowerCase();
  if (!q || q.length < 2) {
    return res.status(400).json({ message: 'Provide at least 2 characters to search.' });
  }

  try {
    const snap = await db.collection('users').where('role', '==', 'student').get();
    const students = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((u: any) =>
        (u.displayName ?? '').toLowerCase().includes(q) ||
        (u.email ?? '').toLowerCase().includes(q) ||
        (u.studentId ?? '').toLowerCase().includes(q)
      )
      // HIGH FIX: same administrative_secretary scoping gap as
      // updateStudentAcademicYear above — without this, her search returned
      // every student in the institution, not just her assigned degree(s).
      .filter((u: any) =>
        req.user!.role !== 'administrative_secretary' ||
        withinCoordinatorScope(req.user, { facultyId: u.facultyId ?? '', major: u.major || undefined })
      )
      .slice(0, 25)
      .map((u: any) => ({
        id: u.id,
        displayName: u.displayName ?? '',
        email: u.email ?? '',
        studentId: u.studentId ?? '',
        facultyId: u.facultyId ?? '',
        degreeType: u.degreeType ?? null,
        major: u.major ?? null,
        yearOfStudy: u.yearOfStudy ?? null,
        isEligibleForProcess: !!u.isEligibleForProcess,
        academicYearHeld: !!u.academicYearHeld,
        academicYearHeldReason: u.academicYearHeldReason ?? null,
      }));

    return res.status(200).json({ students });
  } catch (error: any) {
    console.error('searchStudents error:', error);
    return res.status(500).json({ message: 'Failed to search students.' });
  }
};