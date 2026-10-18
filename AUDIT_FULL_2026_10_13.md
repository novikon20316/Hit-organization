# Full Security Review: Web, Mobile, Server, Rules, Infra

Date: 2026-10-13
Scope: everything since the 2026-10-07 pre-launch audit (`AUDIT_WEB_SERVER_SECURITY_BUGS_2026_10_07.md`, ~45 commits: final-report link, admin-coordinator student messaging, Excel import, CS pilot COI/comment files, chat read receipts, EE specialization, supervisor reassignment, API error localization). Also a fresh full pass over `mobile/firestore.rules` (every writable match block), live Cloud Run config, the Cloud Build pipelines, and `npm audit` in all three packages.
Method: direct file reads + live read-only `gcloud` checks. Findings pass; fixes are tracked inline as they land. H1–H3 are fixed in `mobile/firestore.rules` (dry-run compile clean).

---

## Summary

| Severity | Count |
|---|---|
| High | 3 |
| Medium | 7 |
| Low | 5 |

The new feature code from the last week is in good shape. Every new endpoint checks roles and scope, validates IDs with `isValidDocId`, and doesn't leak internals. **The real problems are in `firestore.rules` write paths that bypass the server entirely.** Two of them are client-SDK-only exploits, need no special role, and have zero legitimate client callers, so the fix is a one-line lockdown each.

---

## High

### H1: [x] FIXED (committed, deploys on push). Any chat participant can rewrite `participants` and message anyone in the system
`mobile/firestore.rules` (the `chats` block, `allow update`). The update rule only blocks `readAt`/`lastMessageSenderId`/`lastMessageAt`. It doesn't lock `participants`. A student opens an allowed chat with their supervisor, then calls `updateDoc(chatRef, { participants: [me, anyUid] })`. Now that chat belongs to them and *any* user. It shows up in the victim's chat list, and the messages subcollection's `isParentParticipant()` lets the student write to it. This fully bypasses `chatCreateAllowed()`: the M5 faculty scoping, the student→staff-only restriction, and the supervisor→own-advisee restriction. It also lets a participant overwrite `lastMessage` to spoof the chat preview.
**Client usage:** none. A repo-wide search found no `updateDoc`/`setDoc`/`addDoc` on `chats` or `messages` in web or mobile. All chat writes go through `chatController.ts` (Admin SDK).
**Fix:** `allow create, update: if false;` on `chats`, and `allow create: if false;` on `messages`. This has no functional impact.

### H2: [x] FIXED (committed, deploys on push). Forged "system" notifications via update (the create lockdown is bypassed)
`mobile/firestore.rules` (the `notifications` block). `allow create: if false` was added specifically to stop students forging notifications. But `allow update: if resource.data.recipientId == request.auth.uid` has no field restriction. A user can take any notification they own, set `recipientId` to a victim, and rewrite `titleHe`/`bodyHe`/`type`/`targetScreen`. The forged notification then appears live in the victim's inbox, looking system-sent ("your account needs verification, click…"). This is a phishing and impersonation vector against staff.
**Client usage:** none. No client `updateDoc`/batch on `notifications` in web or mobile. Mark-read goes through the server.
**Fix:** `allow update: if false;` (or `affectedKeys().hasOnly(['read','readAt'])` if a client write is ever added).

### H3: [x] FIXED (committed, deploys on push). Blocking doesn't stop direct-SDK messages
`blockedUserIds` is enforced only in `chatController.ts`'s `sendDirectMessage`. The `messages` create rule checks only participation, so a blocked user can keep messaging through the Firestore SDK. **This is fixed by H1's fix** (messages create → `false`).

---

## Medium

### M1: [x] FIXED (committed). `POST /api/users/sync` can be re-run on an existing account
`server/src/controllers/userController.ts` (`syncData`, ~L150–340). It never rejects when `users/{uid}` already exists, and writes with `set(..., { merge: true })`. A re-sync resets `isActive: true` (re-enables an account an admin deactivated, as long as the Firebase Auth user itself isn't disabled). It also resets `additionalRoles: []`, `trackLocked`/`track`, `facultyId`, `major`, `totp_enabled: false`, and `hasActiveProject: false`. The roster gate limits this, because it needs an *unused* roster entry, but see M2 for how easy that is to get.
**Fix:** if the doc exists with `profileComplete: true`, return 409. Re-sync should only complete a half-finished signup.

### M2: [x] PARTIALLY FIXED (committed). Roster identity is "knows a 9-digit ID number", and signup email is taken from the body
- `services/studentRoster.ts` (`checkStudentEligibility`) authorizes on ID + faculty + degree only. Anyone who knows another (not-yet-registered) student's ID number can claim that roster slot and become them. The check and `markRosterEntryUsed` are also separate, non-transactional steps, so two concurrent signups can both pass.
- `syncData` validates the **body** `email`'s domain and stores it, but never compares it to `req.user.email` (the verified token email). A user can register with any verified address and claim any `@gmail.com`/`@my.hit.ac.il` address in their profile. Notifications, including the final-report bearer link, then go to that arbitrary address.
**Fix:** use `req.user.email` (ignore the body field), wrap check+mark in a transaction, and consider matching the roster's name, or a second factor such as the institutional email, if the roster has it.
**Applied:** `syncData` now trusts only the ID token's verified email, and the profile-exists check, roster eligibility, profile create and roster claim run in one Firestore transaction. M1 is fixed in the same change: an existing profile is left untouched and the call returns `{ success: true, alreadyExists: true }`. **Name check added 2026-10-15 (you chose "tolerant"):** `services/studentNameMatch.ts`. Roster names are Hebrew, but 6 of the 8 real registrants typed English names, so names are compared by a Hebrew/Latin consonant "sound skeleton", and at least one name part must match. On live data that's 8/8 real students passing and 1/80 wrong pairings passing. Runs only inside `syncData`, never in the public pre-check (which would make it a guessing oracle). Mismatches are audit-logged (`signup_name_mismatch`), and `/sync` is limited to 10 attempts/hour per account. A roster entry with no name is not checked.

### M3: [x] FIXED (committed). Any verified user can `get` any user's full profile, including national ID and phone
`firestore.rules` `users` → `allow get: if isVerifiedSignedIn()`. The 10-07 fix closed `list`. `get` by a known uid is still open, and uids are everywhere: `supervisorId`, `enrolledStudentIds` on listable active projects, chat participants. A student can read a classmate's or supervisor's `studentId` (Israeli ID number), `phoneNumber`, email, roles, and scopes. Given Privacy Protection Law Amendment 13, this is the most important privacy item before launch.
**Fix:** move PII (`studentId`, `phoneNumber`) into `users/{uid}/private/*` (server-only, like the TOTP secret), or restrict `get` to self, staff, and related parties.
**Applied (rule restriction, no migration):** `users` `get` now requires one of: self; the reader is staff; the target is staff (a student's supervisor-name lookup); or the two share an active project (`sharesActiveProject`, which checks both `activeProjectId` and `activeProjectIds`, because the research-proposal and progress-report forms show teammates' ID/phone). This covers every client `getDoc` on `users` in web and mobile. A student can no longer read an unrelated student's ID number or phone. **Residual:** staff profiles stay readable by any verified user, so staff phone numbers, if set, are visible. Teammates whose project is no longer active can't read each other, so an archived form would show blank teammate details. Dry-run compile is clean.

### M4: [x] FIXED (committed). Staff write rules have no faculty scope (the API is scoped, but the rules let staff bypass it)
- `projects` `allow update`: `coordinator`/`faculty_admin`/`program_head`/`administrative_secretary` can rewrite **any field on any project in any faculty** (`supervisorId`, `enrolledStudentIds`, `status`) directly from the SDK.
- `examinerTokens` `allow get`/`update`: any coordinator-tier role, cross-faculty, can read and rewrite any examiner token, including `opinion`, scores, and `status`.
- `processFiles`/`processTemplates`: create/update for staff with no faculty scope, and a student can update any field on their own processFile. **No client code touches either collection.**
**Fix:** lock `processFiles`/`processTemplates` writes to `false`. For `projects`/`examinerTokens`, check what clients still write directly; anything server-mediated → `false`, otherwise add `sameFaculty()` plus an `affectedKeys` allowlist.
**Applied:** a sweep of web and mobile found no client writes to `projects` (removed from both apps in May 2026), `processFiles` or `processTemplates`. The only `examinerTokens` access is the examiner-access pages, which use the anonymous OTP-gated branch. So: `projects`, `processFiles` and `processTemplates` create/update/delete → `false`, and `examinerTokens` loses its unscoped staff get/update branch (create/delete → `false`). The examiner's OTP branch is unchanged. Reads are untouched. Dry-run compile is clean.

### M5: App Check is still `monitor` in production
Live `api` service: `APP_CHECK_ENFORCEMENT_MODE=monitor`, unchanged since 2026-09-30. The API accepts requests from any client that holds a valid ID token, including scripts. Web is ready to enforce. Mobile needs a store build that sends App Check tokens, and that build is blocked on EAS quota until 2026-11-01.
**Fix:** review the monitor logs for the pass rate, then switch to `enforce` once the mobile build ships.
**Checked 2026-10-15 (BLOCKED, not fixed):** monitor logs since 10-12 show ≥5,000 verified and 1,422 missing-token requests, with 0 invalid. The missing ones are almost all `POST /api/presence/heartbeat` (708) and `GET /api/chats/dashboard` (696), i.e. mobile background polling. The cause is that mobile has `extra.appCheckReady: false` in `mobile/app.json`, so the store app sends **no** App Check token at all. Enforcing today would make every mobile request fail with 401. Per-platform enforcement (web only) gives no real protection, because the platform header is client-controlled. Remaining steps, in order:
1. Finish the native attestation setup: Play Integrity (SHA-256 fingerprint plus Play Console link) and App Attest (Apple Developer). These are console steps you have to do.
2. Set `appCheckReady: true`, ship a store build (EAS quota resets 2026-11-01), and confirm on a real device that the monitor logs show it verified.
3. Wait for old builds to age out, or force an update, then set `APP_CHECK_ENFORCEMENT_MODE=enforce` on the `api` service (you run that change).

### M6: [x] FIXED 2026-10-15 (corrected scope). One production secret was a plain env var
The original finding was wrong in scope. It listed env var names without checking whether they were Secret Manager references. Cloudinary key and secret, Brevo, Anthropic, and the Twilio SID and token are **already** loaded from Secret Manager (`:latest`). The runtime service account has project-level secret-accessor access. **Only `GOOGLE_CALENDAR_CLIENT_SECRET` is a plain value**, readable by anyone who can view the service config. The deploy pipeline merges env vars (`--update-env-vars`), so migrating it is safe across future deploys.
**Fix:** copy the current value into a new Secret Manager secret, then swap the env var for a secret reference in a single service update. No permission change is needed. Writing to Secret Manager is blocked for Claude, so you run this one.
**Applied:** you ran both commands. Revision `api-00144-sxn` is Ready and serving 100%, `GOOGLE_CALENDAR_CLIENT_SECRET` is now a secret reference, and no ERROR logs appeared on the new revision. No credential remains a plain env var. **Optional:** rotate the OAuth client secret, since its old value was readable by anyone with access to view the service config.

### M7: [x] FIXED (committed). Student mass-messaging has no rate limit; each call can send 500 × (SMS + WhatsApp + email + push)
`projectCoordinatorController.ts` `sendStudentsMessage`. Scope checks and HTML escaping are correct. But if an `administrative_secretary` account is compromised, it can burn Twilio/Brevo credit and spam an entire faculty in a loop.
**Fix:** add a dedicated per-user limiter on `/students/message` (for example, 10/hour).
**Applied:** `studentsMessageLimiter` (`middleware/rateLimit.ts`): 10 sends per hour per account, mounted after `verifyToken`, with a localized 429 `message` that both web and mobile composers already display. Checked locally: sends 1–10 → 200, send 11 → 429, other accounts unaffected. The counter is in-memory per Cloud Run instance, so it caps each instance rather than enforcing a strict global limit.

---

## Low

1. **Final-report bearer token is in the API path.** `GET /api/final-report/:token` ends up in Cloud Run request logs. The link is valid for 365 days and shows the student's ID number and phone. There's no staff "revoke" UI (`revoked` exists in the data model only). The design is otherwise good: 256-bit token, `no-referrer`, `noindex`, `no-store`, its own rate limiter, and it goes dead if the grade is unlocked. Consider dropping `idNumber`/`phone` from the report and adding a revoke action.
2. **`xlsx` is pinned to `https://cdn.sheetjs.com/xlsx-latest/xlsx-latest.tgz`** (`server/package.json`). The installed version is the patched 0.20.3, but "latest" makes builds non-reproducible. Pin to the explicit `xlsx-0.20.3` URL.
3. **Catch-all `400`s still echo `error.message`** (`projectErasureController.ts`, `clockPauseController.ts`, `studentTrackController.ts`, `academicCalendarController.ts`, …). An unexpected Firestore exception inside those `try` blocks returns raw library text. The 10-07 H4 fix deliberately covered only 500s. A typed `UserFacingError` class would separate the two cleanly.
4. **Dependencies:** server has 0 vulnerabilities. Web has 4 high (`@grpc/grpc-js` via `firebase`, breaking-only fix). **Mobile has 39 (27 high)**, up from 29/11 on 09-17. They're all transitive through Expo tooling and need the `expo@57` upgrade.
5. **Carry-over (10-07 Low 1):** authenticated upload endpoints with no role/ownership tie. Still open, but the magic-byte check limits the impact.

---

## Verified closed / clean this pass

- **10-07 H8 is closed.** `firestore-rules-deploy-on-push` ran **SUCCESS** at 2026-10-13 08:40, so the IAM grant is in place and rules pushed to master now deploy automatically. **Any rules fix above goes live on push.**
- The mobile prod API URL is now `https://hit-organization.web.app` (`mobile/app.json` `extra.apiUrl`). The long-open "cleartext prod API URL" item is closed.
- New endpoints since 10-07 all check role and scope and validate ids: `setStudentSpecialization`, `sendStudentsMessage` (all-or-nothing scope re-check), `previewStandardSupervisorImport` (read-only, row-capped, scoped), `reassignProjectSupervisorHandler` (system_admin only), `/milestones/:id/pilot-features`, and the CS-pilot reject path.
- Signup still hard-locks `role === 'student'` and `newUid === req.user.uid`, and requires a verified email.
- No new `status(500)` error-message leaks were introduced by the localization commit (`e5313cd`).
- `helmet`, the CORS allowlist, the per-route limiters, and the `isActive` check in `verifyToken` are all still in place.

---

## Pre-launch checklist (suggested order)

1. **H1 + H2 (+H3):** three one-line rule lockdowns with zero client impact. They deploy automatically on push.
2. **M1 + M2:** make `/users/sync` first-time only, use the token email, and make the roster check transactional.
3. **M3:** move `studentId`/`phoneNumber` out of the world-gettable user doc (needs a small migration plus client read updates).
4. **M4:** lock `processFiles`/`processTemplates`, then audit direct client writes to `projects`/`examinerTokens` before scoping.
5. **M7:** rate-limit student messaging.
6. **M6 / M5:** Secret Manager migration (you run it), then App Check `enforce` after the mobile build ships on or after 11-01.
7. Lows, in listed order. Plan the `expo@57` upgrade separately.
