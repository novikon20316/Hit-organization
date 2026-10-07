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

### C1 — [x] FIXED (code) / ⚠️ NOT YET DEPLOYED — `mobile/firestore.rules:103` let any signed-in user read every other user's full profile directly via the Firestore SDK
`allow read: if isVerifiedSignedIn();` on `/users/{userId}` had no ownership/role/scope check — a full `get()`+`list()` grant over the entire collection (phoneNumber, studentId, email, role, facultyId, coordinatorScopes, etc.) to any verified account, including a student. Not previously documented in any prior audit — likely introduced by commit `627aa19`, which replaced a tighter rule with just an email-verification gate.

**Fix applied:** split into `allow get` (unchanged — every legitimate call site reads one already-known user by id) and `allow list` (now restricted to `isStaffRole(userDoc())`, matching the get/list split pattern already used elsewhere in this same rules file). The two student-side call sites that used a `documentId()`-in-`[...]` list() query for supervisor-name lookups (`web/hooks/useStudentData.ts`, `mobile/hooks/useStudentData.ts`) were converted to individual `getDoc()` calls instead, so they keep working under the new rule. `npx tsc --noEmit` clean in `server/`, `web/`, and `mobile/`.

**⚠️ STILL NEEDS: `firebase deploy --only firestore:rules` — run by you, not automated.** This repo has no deploy pipeline for Firestore rules at all (see H8 below), so this fix does nothing for real users until deployed by hand.

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

### H7 — `administrative_secretary` still has unconditional cross-faculty read on `milestones`/`grades` via Firestore rules
Confirmed still open (`mobile/firestore.rules:74`, `isCrossFaculty()`) — flagged in `AUDIT_FULL_2026_09_17.md` Open Item #1, unchanged since. Her real scope lives in `coordinatorScopes`, which the rules language can't easily express without a schema change (a flattened `coordinatorScopeFacultyIds` field, or accepting server-only enforcement for this one role). **Needs a design decision, not a blind patch.**

### H8 — No visible deploy pipeline for `mobile/firestore.rules` — repo can't confirm live rules match what's committed
No CI/script in the repo runs `firebase deploy --only firestore:rules`. The rules file has changed in ~25 commits since 2026-09-06, most recently 3 days ago — meaning rule changes (including the C1 fix, once made) may sit undeployed indefinitely unless deployed by hand. **This is the single most important operational gap given C1 above: fixing the rule in the repo does nothing for real users until it's actually deployed.**

---

## Medium

- **M1 — `/committees` still unreachable via nav for `school_head`** (only reachable via a notification link, not browsable). `web/app/school_head/navSections.ts`.
- **M2 — Electrical Engineering research-proposal chain (division_head/dean) has no per-division scoping** — confirmed still open (`AUDIT_FULL_2026_09_17.md` Open Item #3). Not exploitable today (one division_head/dean per faculty in seed data), but a real gap the moment that changes.
- **M3 — `examinerBankAccounts`/`examinerTaxDocuments`/`examinerIdentities` Firestore rules check role only, no faculty scope** — confirmed still open (`AUDIT_FULL_2026_09_17.md` Open Item #2). May be intentional (institution-wide examiner-payment administration) — **needs confirmation, not a blind patch.**
- **M4 — `internal_examiner` has full-faculty milestone/grade visibility, not scoped to assigned milestones** — confirmed still open, code comment suggests intentional. **Needs confirmation.**
- **M5 — `chatCreateAllowed()` lets several staff roles (coordinator, administrative_secretary, grad_school_head, system_admin) open a chat with any user system-wide, no faculty check** — new finding, no server-side backstop exists for chat creation (the Firestore rule *is* the only authorization boundary, with nothing else to compare against).
- **M6 — File-upload type validation relies only on client-declared MIME type, not file content** (`milestoneController.ts`, `applicationController.ts`, `chatController.ts` multer configs) — no magic-byte sniffing. Softened by Cloudinary storage as `raw`/`authenticated`, not served inline — defense-in-depth gap, not immediately exploitable.
- **M7 — `handleMarkAllRead` (web notifications) uses `Promise.all` with no per-item catch** — one failed call aborts the whole batch, leaving client/server read-state inconsistent until next poll.
- **M8 — Silent send failures with no error message** — chat message send and feedback send (`web/app/message/[chatId]/page.tsx:121`, `web/app/notifications/FeedbackTab.tsx:44`) only restore the typed text on failure, no visible error.
- **M9 — Orphaned route `GET /api/projects/:projectId/milestones`** (`index.ts:140`) — both clients migrated off it after it was found to silently ignore the project filter; dead but still registered.
- **M10 — Orphaned `POST /api/users/block`/`unblock` routes, and no working "unblock" path exists anywhere** — the live block flow uses a different endpoint (`POST /api/chats/:chatId/block`); nothing implements unblock at all. Real UX gap: a user who blocks someone has no way back.
- **M11 — `system_admin` lacks nav links to 8 role-specific dashboards it's explicitly permitted to view** (faculty_admin, coordinator, grad_school_head, division_head, dean, school_head, internal_examiner dashboards + faculty_admin/templates) — reachable only by typing the URL from memory. `faculty_admin/dashboard` and `coordinator/home` genuinely adapt their content for a system_admin visitor, so this is real lost functionality, not just cosmetic.

---

## Low

1. Unscoped authenticated file-upload endpoints with no role/ownership tie (`supervisorController.ts` `uploadProjectFile`, `applicationController.ts` `uploadApplicationDocument`, `chatController.ts` `uploadChatImage`) — storage/cost-abuse surface, not a data-access risk.
2. `revisionDecisionController.ts`'s `isOwnAdvisee` checks only `supervisorId`, not `secondarySupervisorId` (under-permissive, not a bypass — a legitimate co-supervisor is wrongly denied).
3. Two dead-code, unreachable endpoints with no auth checks if ever wired up: `milestoneController.ts`'s `approveMilestone`, `notificationController.ts`'s `ReadMessage`.
4. `GET /privacy-policy` has zero rate limiting (deliberately public, cheap static response — low impact).
5. Hardcoded Firebase Web API key as a source fallback (`web/lib/firebase.ts:20`, `server/src/services/loginSecurity.ts:80`) — not a live secret by design, but should fail loudly instead of silently falling back if the env var is ever unset.
6. `/relay-tasks` nominally permits 7 roles that can never actually receive a relay task (harmless).
7. Orphaned page `web/app/student/projects/[id]/page.tsx` — unchanged since 2026-09-22, harmless.
8. 7 dead, never-imported nav-link components (`AcademicYearLink.tsx` and 6 siblings) — cleanup candidates.
9. Low-stakes silent fire-and-forget failures (dismiss banner, mark field-guide/tour seen) — worst case the dismissed UI reappears next load.
10. Mobile dependency drift (29 advisories, 11 High, needs `expo@57`) — out of this pass's scope, carried forward from the last full audit, still open.
11. `web/` npm audit: 6 High advisories (`@grpc/grpc-js`, `sharp`, `source-map-js`) — `sharp`/`source-map-js` have a safe fix; `@grpc/grpc-js` needs a breaking `firebase` downgrade to fully clear.
12. `server/` npm audit: 5 vulnerabilities, all clearable via plain `npm audit fix` (no `--force` needed) — **note: one of these (`proxy-addr`, IP-spoofing via IPv4-mapped IPv6) is rated Critical by npm's own advisory**, worth prioritizing even though the fix itself is trivial, especially given this server sets `trust proxy` for Cloud Run.
13. `/2fa/setup` and `/2fa/verify` have no dedicated rate limiter — low risk since both require an already-authenticated session.
14. Three dead Firestore rule blocks reference collections no longer written anywhere (`processFiles`, `processTemplates`, `examiners`) — safe by default-deny, just stale/confusing.

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
