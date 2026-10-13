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

### M1: `POST /api/users/sync` can be re-run on an existing account
`server/src/controllers/userController.ts` (`syncData`, ~L150–340). It never rejects when `users/{uid}` already exists, and writes with `set(..., { merge: true })`. A re-sync resets `isActive: true` (re-enables an account an admin deactivated, as long as the Firebase Auth user itself isn't disabled). It also resets `additionalRoles: []`, `trackLocked`/`track`, `facultyId`, `major`, `totp_enabled: false`, and `hasActiveProject: false`. The roster gate limits this, because it needs an *unused* roster entry, but see M2 for how easy that is to get.
**Fix:** if the doc exists with `profileComplete: true`, return 409. Re-sync should only complete a half-finished signup.

### M2: Roster identity is "knows a 9-digit ID number", and signup email is taken from the body
- `services/studentRoster.ts` (`checkStudentEligibility`) authorizes on ID + faculty + degree only. Anyone who knows another (not-yet-registered) student's ID number can claim that roster slot and become them. The check and `markRosterEntryUsed` are also separate, non-transactional steps, so two concurrent signups can both pass.
- `syncData` validates the **body** `email`'s domain and stores it, but never compares it to `req.user.email` (the verified token email). A user can register with any verified address and claim any `@gmail.com`/`@my.hit.ac.il` address in their profile. Notifications, including the final-report bearer link, then go to that arbitrary address.
**Fix:** use `req.user.email` (ignore the body field), wrap check+mark in a transaction, and consider matching the roster's name, or a second factor such as the institutional email, if the roster has it.

### M3: Any verified user can `get` any user's full profile, including national ID and phone
`firestore.rules` `users` → `allow get: if isVerifiedSignedIn()`. The 10-07 fix closed `list`. `get` by a known uid is still open, and uids are everywhere: `supervisorId`, `enrolledStudentIds` on listable active projects, chat participants. A student can read a classmate's or supervisor's `studentId` (Israeli ID number), `phoneNumber`, email, roles, and scopes. Given Privacy Protection Law Amendment 13, this is the most important privacy item before launch.
**Fix:** move PII (`studentId`, `phoneNumber`) into `users/{uid}/private/*` (server-only, like the TOTP secret), or restrict `get` to self, staff, and related parties.

### M4: Staff write rules have no faculty scope (the API is scoped, but the rules let staff bypass it)
- `projects` `allow update`: `coordinator`/`faculty_admin`/`program_head`/`administrative_secretary` can rewrite **any field on any project in any faculty** (`supervisorId`, `enrolledStudentIds`, `status`) directly from the SDK.
- `examinerTokens` `allow get`/`update`: any coordinator-tier role, cross-faculty, can read and rewrite any examiner token, including `opinion`, scores, and `status`.
- `processFiles`/`processTemplates`: create/update for staff with no faculty scope, and a student can update any field on their own processFile. **No client code touches either collection.**
**Fix:** lock `processFiles`/`processTemplates` writes to `false`. For `projects`/`examinerTokens`, check what clients still write directly; anything server-mediated → `false`, otherwise add `sameFaculty()` plus an `affectedKeys` allowlist.

### M5: App Check is still `monitor` in production
Live `api` service: `APP_CHECK_ENFORCEMENT_MODE=monitor`, unchanged since 2026-09-30. The API accepts requests from any client that holds a valid ID token, including scripts. Web is ready to enforce. Mobile needs a store build that sends App Check tokens, and that build is blocked on EAS quota until 2026-11-01.
**Fix:** review the monitor logs for the pass rate, then switch to `enforce` once the mobile build ships.

### M6: Production secrets are plain Cloud Run env vars, not Secret Manager
Live `api` service env: `CLOUDINARY_API_SECRET`, `BREVO_API_KEY`, `TWILIO_AUTH_TOKEN`, `ANTHROPIC_API_KEY`, `GOOGLE_CALENDAR_CLIENT_SECRET`. These are readable by anyone with `run.services.get` (any project Viewer), and they're exposed to the same env-var-wipe risk that caused the 2026-09-30 outage.
**Fix:** move them to Secret Manager and mount them as secret env vars. This is an infra change, so you run it (same rule as IAM).

### M7: Student mass-messaging has no rate limit; each call can send 500 × (SMS + WhatsApp + email + push)
`projectCoordinatorController.ts` `sendStudentsMessage`. Scope checks and HTML escaping are correct. But if an `administrative_secretary` account is compromised, it can burn Twilio/Brevo credit and spam an entire faculty in a loop.
**Fix:** add a dedicated per-user limiter on `/students/message` (for example, 10/hour).

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
