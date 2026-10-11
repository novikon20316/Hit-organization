# Pre-Launch Security / Bugs / Dead-Ends Audit — Web & Server

Date: 2026-10-07
Scope: `web/` (Next.js) and `server/` (Express/TS) only — mobile deliberately excluded (see `AUDIT_MOBILE_*.md` for its own, separate audit trail). ~100 commits since the last routes/bugs pass (`AUDIT_WEB_ROUTES_BUGS_COMPAT_PERF_2026_09_22.md`) and ~3 weeks since the last full security pass (`AUDIT_FULL_2026_09_17.md`).
Method: 6 independent research passes (server authorization/IDOR, web dead-end routes/nav, server orphaned routes/route protection, injection/XSS/secrets, correctness/silent-failure bugs, Firestore rules alignment + re-verification of prior audits' open items), each with real file:line references from full file reads. Nothing below is fixed yet — this is the findings pass only; fixes are tracked separately as they land.

---

## Priority overview

| Severity | Count |
|---|---|
| Critical | 2 |
| High | 8 |
| Medium | 11 |
| Low | 14 |

---

## Critical

### C1 — [x] FIXED AND DEPLOYED — `mobile/firestore.rules:103` let any signed-in user read every other user's full profile directly via the Firestore SDK
`allow read: if isVerifiedSignedIn();` on `/users/{userId}` had no ownership/role/scope check — a full `get()`+`list()` grant over the entire collection (phoneNumber, studentId, email, role, facultyId, coordinatorScopes, etc.) to any verified account, including a student. Not previously documented in any prior audit — likely introduced by commit `627aa19`, which replaced a tighter rule with just an email-verification gate.

**Fix applied:** split into `allow get` (unchanged — every legitimate call site reads one already-known user by id) and `allow list` (now restricted to `isStaffRole(userDoc())`, matching the get/list split pattern already used elsewhere in this same rules file). The two student-side call sites that used a `documentId()`-in-`[...]` list() query for supervisor-name lookups (`web/hooks/useStudentData.ts`, `mobile/hooks/useStudentData.ts`) were converted to individual `getDoc()` calls instead, so they keep working under the new rule. `npx tsc --noEmit` clean in `server/`, `web/`, and `mobile/`.

**Deployed 2026-10-11** via `firebase deploy --only firestore:rules` — rules compiled clean (one pre-existing, unrelated unused-function warning) and are now live on `hit-organization`.

### C2 — [x] FIXED — `server/src/services/milestoneVisibility.ts`'s grade redaction was incomplete
`GRADE_BEARING_FIELDS` (the allowlist nulled before a milestone doc reaches the student it belongs to) omitted `supervisorCriteria`, `stageScores`, and `supervisorGradeFileUrls` as flagged — and turned out to also be missing `supervisorComment`, `examiner1Comments`, `examiner2Comments`, `finalGradeByStudent`, and `coordinatorComment`, found by re-deriving the full list of grade-bearing fields directly from every `update.X =`/`updatePayload.X =` write site in `projectController.ts`/`coordinatorController.ts` rather than trusting the original list was complete.

**Fix applied:** `GRADE_BEARING_FIELDS` now lists all 16 confirmed grade-bearing fields, with a strengthened comment on the maintenance burden this denylist approach carries. Verified no client code (web or mobile, student-facing) reads `stageScores` directly, so nulling it for an unreleased milestone has no functional side effect. `npx tsc --noEmit` clean in `server/`.

---

## High

### H1 — [x] FIXED — `coordinatorController.ts`'s approve/reject upload Cloudinary files before any authorization check
`coordinatorApproveMilestone` (~line 1328) and `coordinatorRejectMilestone` (~line 1718): the attachment-upload loop ran before the role check (`hasAnyRole`) or the chain's `authorizeStageActor`. Any authenticated user — any role, any milestone, even a bogus id — could trigger a real, billed Cloudinary upload before the 403/404 fired. **This was the one fix from the prior bug-fix pass that was only applied to `projectController.ts`'s `submitMilestoneGrade` and never actually carried over to its sibling here** — confirmed independently by 3 of the 6 research passes.
**Fix applied:** both `approveChainMilestone` and `rejectChainMilestone` now take a lazy `getAttachmentUrls()` instead of a resolved array, called only after `authorizeStageActor` passes; the legacy (non-chain) path in both parent functions builds the same lazy getter so an unauthorized/invalid request never triggers a real upload.

### H2 — [x] FIXED — `GET /api/examiner/get-list` has zero role check, leaks full raw user documents
`examinerController.ts:222` (`getList`), routed with `verifyToken` only. Returned the entire raw Firestore doc (email, phone, facultyId, `expoPushToken`, etc.) for every internal examiner to any authenticated caller of any role, including a student with no relation to any of them.
**Fix applied:** now requires `isStaffMember` (reused from `twoFactorEnforcement.ts`) and returns only `id`/`displayName`/`displayNameHe`/`displayNameEn`/`email`/`facultyId` — exactly what the `ExaminerUser` client type consumes.

### H3 — [x] FIXED — Unvalidated `uid`/id route params flow straight into Firestore `.doc()` paths — a path-traversal oracle
`GET /api/users/:uid/photo-url` (`userController.ts:748`) only checked `typeof uid === 'string'`, no shape validation. Firestore's `.doc(path)` treats `/` as a separator, so `uid = "<target>/private/totp"` resolved to that user's TOTP-secret subdocument path — an attacker could distinguish 200 vs 404 to learn whether a target has 2FA set up. The same unvalidated-id-into-`.doc()` pattern recurred with no central validation helper across `adminController.ts` (7+ sites), `projectCoordinatorController.ts`, `projectRecordsController.ts`, `studentTrackController.ts`, `studentStatusController.ts`, and more.
**Fix applied:** added `server/src/services/idValidation.ts` (`isValidDocId` — alphanumeric/`-`/`_` only, 1-128 chars) and applied it at all 16 confirmed call sites across the 6 files above, including the TOTP-reset and impersonation endpoints in `adminController.ts`.

### H4 — [x] FIXED — Raw internal error messages leak to the client in production, widely
Dozens of controllers `catch` an exception and returned `error.message` verbatim instead of a generic message — turned out to be 57 `status(500)` sites across 20 files once fully swept (initial estimate of ~25 was conservative). The app's own global error handler (`index.ts:240`) correctly returns only a generic message — these per-route catches bypassed that protection, leaking library internals and aiding reconnaissance (including chaining with H3).
**Fix applied, deliberately scoped to `status(500)` responses only** — not 400/403/404, since those overwhelmingly carry intentional, already-reviewed validation text thrown by the same function's own business logic (e.g. `throw new Error('A reason is required...')`), and blindly genericizing those would have been a real UX regression, not a security fix. Every status-500 site already had `console.error` logging the real error server-side before the leak, so nothing is lost — the response just no longer echoes it to the client.

### H5 — Incomplete grade redaction allows a graded-file download link to leak (see C2) — duplicate cross-reference, listed under Critical. **Fixed alongside C2.**

### H6 — [x] FIXED — Silent failure sending a chat image (web)
`web/app/message/[chatId]/page.tsx:143` (`handleImageSelected`): bare `catch {}`. A failed upload/send just silently stopped the spinner — no error, no retry affordance, no indication anything went wrong. User believed the image sent.
**Fix applied:** both this and the sibling text-message silent failure now set a visible error banner above the input row.

### H7 — [x] FIXED AND DEPLOYED — `administrative_secretary` had unconditional cross-faculty read on `milestones`/`grades` via Firestore rules
Was `mobile/firestore.rules:74`'s `isCrossFaculty()` — flagged in `AUDIT_FULL_2026_09_17.md` Open Item #1, open since. Her real scope lives in `coordinatorScopes`, which the rules language can't iterate directly.

**Fix applied:** added `coordinatorScopeFacultyIds` — a flattened mirror of `coordinatorScopes`' `facultyId` values, written by `adminController.ts`'s `updateUserRoleAdmin` alongside `coordinatorScopes` itself — and extended `sameFaculty()` to check it (also benefits `coordinator`, which shares the same mechanism and had the identical latent gap). Removed her from `isCrossFaculty()` entirely. Ran `backfillCoordinatorScopeFacultyIds.ts --apply` for the 6 existing accounts that already had `coordinatorScopes` set, since this was deployed live and those accounts' Firestore listeners would otherwise have gone empty until their next edit. **Deployed 2026-10-11.**

### H8 — [x] FIXED, pending one manual IAM step — No visible deploy pipeline for `mobile/firestore.rules` — repo can't confirm live rules match what's committed
No CI/script in the repo runs `firebase deploy --only firestore:rules`. The rules file has changed in ~25 commits since 2026-09-06, most recently 3 days ago — meaning rule changes (including the C1 fix, once made) may sit undeployed indefinitely unless deployed by hand. **This is the single most important operational gap given C1 above: fixing the rule in the repo does nothing for real users until it's actually deployed.**

**Fix applied:** new Cloud Build trigger `firestore-rules-deploy-on-push` (us-central1, same GitHub connection and service account as the existing `web-deploy-on-push`/`api-deploy-on-push` triggers), scoped via `includedFiles` to `mobile/firestore.rules`, running the new `cloudbuild-firestore-rules.yaml` (`firebase deploy --only firestore:rules`) on every push to master — mirrors the existing web/api auto-deploy pattern exactly.

**Not yet complete:** the trigger's service account (`432175584982-compute@developer.gserviceaccount.com`) currently has `roles/datastore.user` (read/write data) but not `roles/firebaserules.admin` (deploy rules) — the next rules push will fail in Cloud Build until that role is granted. IAM grants aren't something this session can run directly; the exact command was handed to you separately. Once granted, push a trivial no-op change to `mobile/firestore.rules` (or just wait for the next real one) to confirm the trigger succeeds end-to-end.

---

## Medium

- **M1 — [x] FIXED** — `/committees` added to `school_head`'s nav (`web/app/school_head/navSections.ts`).
- **M2 — [x] CLOSED, confirmed intentional** — Electrical Engineering research-proposal chain (division_head/dean) resolves staff purely by `facultyId` (`scopeAuthorization.ts`'s `resolveStaffForScope`), no `divisionId` concept anywhere in the data model. Confirmed with you: one division_head/dean per faculty is permanent, so the current facultyId-only match is correct as-is. No code change.
- **M3 — [x] FIXED AND DEPLOYED** — was role-only, no faculty scope (`AUDIT_FULL_2026_09_17.md` Open Item #2). Confirmed with you: should be faculty-scoped, not institution-wide. An examiner has no single home faculty (invited per-defense), so `examinerAccess.ts`'s `assignExaminersAndNotify` now accumulates a `facultyIds` array on the examiner's `examinerIdentities` doc on every new token. Added `examinerFacultyMatch()`, wired into all three collections' `allow get` (`examinerTaxDocuments`/`examinerBankAccounts` cross-reference `examinerIdentities` by the same `emailHash`). `system_admin` stays unconditional on identities/tax, stays excluded from bank accounts (pre-existing, unrelated decision, untouched). `backfillExaminerFacultyIds.ts` confirmed a no-op — zero examiner records exist in production yet. **Deployed 2026-10-11.**
- **M4 — [x] FIXED AND DEPLOYED** — `internal_examiner` had full-faculty milestone visibility via the same branch as `grad_school_head`, in both `getMilestonesByQuery` and `firestore.rules`'s `milestones` block. Confirmed with you: should be scoped to actual assignment. Split her into her own branch (server: filters by `examinerIds array-contains` her uid, matching how `getExaminerDashboard` already scoped her real dashboard; rules: removed her from the faculty-wide OR-branch, the `examinerIds`-fast-path already covered her real access). `grad_school_head` untouched (faculty-wide oversight is her role's reason to exist). Files (`fileUrls`) were never stripped for any role, so once a milestone is visible at all its files come with it — no separate fix needed there. Verified zero functional impact: no examiner-facing screen calls the generic endpoint this narrows. **Deployed 2026-10-11.**
  - While investigating this, found a separate, broader gap: `firestore.rules`'s `projects` collection grants ANY staff role unscoped get/list access to every project in the system, not just `internal_examiner`. Out of scope for M4 (affects every staff role, wasn't part of the original audit) — flagged as its own follow-up task rather than fixed as a drive-by.
- **M5 — [x] FIXED AND DEPLOYED** — `chatCreateAllowed()` let several staff roles open a chat with any user system-wide, no faculty check. Confirmed with you: should be faculty-scoped. But the rules-layer function only gates direct client writes — the real chat-creation path is `chatController.ts`'s `findOrCreateDirectChat`, which runs on the Admin SDK and bypasses Firestore rules entirely, authorizing via `getEligiblePartnerIds()`'s `getAllStaffIds()` helper, which had the identical unscoped system-wide staff query. Fixing only the rules file would have been cosmetic — real users go through the server endpoint. Fixed both: added `staffChatFacultyMatch()` (rules) and the equivalent `staffFacultyMatches()` (server), neither reusing the existing `sameFaculty()` helper because `'all'` is meaningful on either side of a person-vs-person check (an institution-wide staff account can legitimately have `facultyId:'all'`), unlike a person-vs-resource check where only the person's side can be `'all'`. An admin coordinator's `coordinatorScopeFacultyIds` also counts as a match. Also updated `getChatCandidates` (the "+" picker's candidate list) with the same scoping, so a candidate shown in the picker is never later rejected when actually messaged. **Deployed 2026-10-11.**
- **M6 — [x] FIXED** — added `server/src/services/fileSignature.ts` (magic-byte check against the mimetype multer accepted) wired as a post-upload middleware on all 9 file-upload routes, plus the profile-photo upload the audit didn't name but is the same risk shape.
- **M7 — [x] FIXED** — `handleMarkAllRead` now uses `Promise.allSettled`, updates state per-id, and only surfaces an error for ids that actually failed.
- **M8 — [x] FIXED** — feedback-tab send failures now show a visible error (chat-message send was already fixed alongside H6).
- **M9 — [x] FIXED** — removed the orphaned route from `index.ts`.
- **M10 — [x] FIXED** — added `POST /api/chats/:chatId/unblock` + `isBlockedByMe` on `getChatMeta`; mobile's safety menu now offers Unblock once blocked. Also removed the confirmed-dead `/api/users/block`/`unblock` pair it superseded.
- **M11 — [x] FIXED** — added nav links for `system_admin` to the 8 role dashboards.

---

## Low

1. Unscoped authenticated file-upload endpoints with no role/ownership tie — left open; the magic-byte check (M6) narrows what can be uploaded, but the missing role/ownership tie itself is a product-scope question, not touched.
2. [x] FIXED — `revisionDecisionController.ts`'s `isOwnAdvisee` now also checks `secondarySupervisorId`.
3. [x] FIXED — removed both dead-code endpoints (`milestoneController.ts`'s `approveMilestone`, `notificationController.ts`'s `ReadMessage`).
4. [x] FIXED — `/privacy-policy` now runs `apiLimiter`.
5. [x] Improved (not fully "fixed") — `web/lib/firebase.ts`'s fallback is explicitly documented as intentional (dev convenience, see file header), so a hard throw would fight the design rather than fix a bug; added a `console.warn` instead so a production misconfiguration is at least visible. `loginSecurity.ts`'s fallback is separately documented as an intentional stable default — left as-is.
6. `/relay-tasks` — no fix needed, confirmed harmless.
7. Orphaned page `web/app/student/projects/[id]/page.tsx` — left alone, harmless (consistent with the 2026-09-22 audit's own call on this exact page).
8. [x] FIXED — deleted all 7 dead nav-link components.
9. Low-stakes silent failures — left alone, consistent with prior audit precedent on this severity tier.
10. Mobile dependency drift — still out of scope (mobile), still needs a deliberate `expo@57` upgrade.
11. [x] PARTIALLY FIXED — `web/` npm audit: `sharp` and `source-map-js` cleared via plain `npm audit fix` (11 high → 9). `@grpc/grpc-js` still needs a breaking `firebase` downgrade; a new `braces`/`eslint-config-next` chain surfaced since the first pass, also breaking-only — neither forced, per the no-blind-breaking-changes rule.
12. [x] FIXED — `server/` npm audit: all 5 vulnerabilities cleared via plain `npm audit fix`, including the Critical `proxy-addr` one.
13. [x] FIXED — `/2fa/setup` and `/2fa/verify` now run `totpLimiter`.
14. Left alone — pure hygiene, zero functional difference either way (confirmed safe-by-default-deny before and after); declined to touch `firestore.rules` a third time this pass for no behavioral gain while C1's deploy is still pending.

---

## Confirmed clean (explicitly checked, no finding)

- No `dangerouslySetInnerHTML`, `eval`, `new Function`, or raw `innerHTML =` anywhere in `web/`; no markdown/HTML-rendering library is even a dependency.
- No `new RegExp(userInput)` (ReDoS) or `child_process`/`exec` usage anywhere in `server/src`.
- CORS is correctly allowlisted to specific origins; `helmet()` + a real CSP are in place.
- `.gitignore` correctly covers `.env*`/service-account files; no real secret was ever committed to git history.
- `NEXT_PUBLIC_*` env vars are limited to things safe to expose by design (Firebase client config, API base URL, reCAPTCHA site key).
- No debug/test/seed endpoint is reachable via Express routes in any environment — all are standalone CLI scripts, never imported into the route tree.
- The one shared-secret/webhook-style route (`/api/integrations/student-progress/:idNumber`) is correctly isolated with a dedicated rate limiter.
- No broken links or silent-403 dead ends found in web navigation; all 4 fixes from the 2026-09-22 routes audit still hold.
- 2FA/biometric endpoints are adequately rate-limited; password login goes through Firebase Identity Toolkit directly, backstopped by the existing 3-strike lockout.
- Notification fan-out loops correctly wrap each `notifyUser()` call in its own `.catch` — the one exception is M7 above.
- No new non-transactional read-modify-write races found in the newest (today's) grading/deadline-override/redaction code.

---

## Suggested order of work

1. **C1 + H8 together** — tighten the `/users/{userId}` rule, then actually deploy it (needs your go-ahead on the deploy step specifically).
2. **C2** — complete `GRADE_BEARING_FIELDS` (or better: switch to an explicit allowlist of fields a student MAY see, rather than a denylist of fields to strip, so a future grade-bearing field added to the milestone doc is safe by default instead of leaking by default).
3. **H1, H2, H3, H4, H6** — all pure code fixes, no product decision needed.
4. **H7, M2, M3, M4** — each needs a short decision from you (is the current scope intentional?) before a fix can be written without guessing.
5. Everything else, roughly in listed severity order.
