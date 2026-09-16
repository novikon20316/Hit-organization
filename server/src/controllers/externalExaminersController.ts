// src/controllers/externalExaminersController.ts
//
// Read-only "External Examiners Info" table for administrative_secretary +
// system_admin — one row per examinerTokens doc (i.e. per defense
// assignment), enriched with the examiner's reusable identity (role/title/
// institution — see examinerFinancial.ts) and their one-time tax/bank
// submissions. Bank account details are administrative_secretary-only:
// stripped from the response entirely for a system_admin caller, not just
// hidden client-side — the API itself never sends them to that role.
import { Response } from 'express';
import { AuthenticatedRequest, hasAnyRole } from '../middleware/auth.js';
import { db } from '../config/firebase.js';
import { withinCoordinatorScope } from '../services/scopeAuthorization.js';
import { getExaminerIdentity, getExaminerBankAccount, getExaminerTaxDocument, resolveExaminerDocumentUrl } from '../services/examinerFinancial.js';

/**
 * GET /api/admin/external-examiners
 */
export const getExternalExaminers = async (req: AuthenticatedRequest, res: Response) => {
  const isSystemAdmin = hasAnyRole(req.user, ['system_admin']);
  const isAdminCoordinator = hasAnyRole(req.user, ['administrative_secretary']);
  if (!isSystemAdmin && !isAdminCoordinator) {
    return res.status(403).json({ message: 'Access denied.' });
  }

  try {
    const tokensSnap = await db.collection('examinerTokens').get();
    const tokens = tokensSnap.docs.map((doc) => ({ token: doc.id, ...doc.data() }) as Record<string, any>);

    // A token's own facultyId/major are only ever set for the data_science
    // finalGradeComponents path (see examinerAccess.ts's
    // createExternalExaminerAccess) — resolve the rest from the linked
    // project, batched by unique projectId.
    const projectIds = [...new Set(tokens.map((t) => t.projectId).filter(Boolean))];
    const projectSnaps = await Promise.all(projectIds.map((id) => db.collection('projects').doc(id).get()));
    const projectsById = new Map<string, FirebaseFirestore.DocumentData>();
    projectSnaps.forEach((snap) => { if (snap.exists) projectsById.set(snap.id, snap.data()!); });

    const scopedTokens = isSystemAdmin
      ? tokens
      : tokens.filter((t) => {
          const project = projectsById.get(t.projectId);
          const facultyId = t.facultyId ?? project?.facultyId ?? '';
          const major = t.major ?? project?.major ?? undefined;
          return withinCoordinatorScope(req.user, { facultyId, major });
        });

    const uniqueEmails = [...new Set(scopedTokens.map((t) => t.examinerEmail).filter(Boolean))];
    const [identities, taxDocuments, bankAccounts] = await Promise.all([
      Promise.all(uniqueEmails.map((email) => getExaminerIdentity(email))),
      Promise.all(uniqueEmails.map((email) => getExaminerTaxDocument(email))),
      // Never fetched at all for system_admin — not just filtered out below,
      // so a bug in the filtering step can't leak it.
      isAdminCoordinator ? Promise.all(uniqueEmails.map((email) => getExaminerBankAccount(email))) : Promise.resolve([]),
    ]);
    const identityByEmail = new Map(uniqueEmails.map((email, i) => [email, identities[i]]));
    const taxDocByEmail = new Map(uniqueEmails.map((email, i) => [email, taxDocuments[i]]));
    const bankByEmail = new Map(uniqueEmails.map((email, i) => [email, bankAccounts[i]]));

    const rows = scopedTokens.map((t) => {
      const identity = identityByEmail.get(t.examinerEmail);
      const taxDoc = taxDocByEmail.get(t.examinerEmail);
      const bank = isAdminCoordinator ? bankByEmail.get(t.examinerEmail) : undefined;

      const evaluation = t.opinion
        ? { kind: 'online' as const }
        : t.evaluationDocumentRef
          ? { kind: 'document' as const, url: resolveExaminerDocumentUrl(t.evaluationDocumentRef, t.evaluationDocumentFormat), fileName: t.evaluationDocumentFileName ?? null }
          : { kind: 'pending' as const };

      return {
        token: t.token,
        examinerName: t.examinerName ?? identity?.displayName ?? '',
        role: identity?.role ?? null,
        title: identity?.title ?? null,
        institution: identity?.institution ?? t.examinerInstitution ?? '',
        projectTitle: t.thesisTitle ?? '',
        evaluation,
        taxDocument: taxDoc ? { url: resolveExaminerDocumentUrl(taxDoc.publicId, taxDoc.format), fileName: taxDoc.originalFileName } : null,
        // Present (possibly null if not yet submitted) only for
        // administrative_secretary — the key itself is omitted for
        // system_admin so the client can't mistake "absent" for "empty".
        ...(isAdminCoordinator ? { bankAccount: bank ?? null } : {}),
      };
    });

    return res.status(200).json({ examiners: rows });
  } catch (error: any) {
    console.error('getExternalExaminers error:', error);
    return res.status(500).json({ message: 'Failed to load external examiners.' });
  }
};
