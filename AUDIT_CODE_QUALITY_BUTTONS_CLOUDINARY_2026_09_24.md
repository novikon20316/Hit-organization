# Code Quality / Button Reliability / Cloudinary Audit — 2026-09-24

Scope: web, mobile, and server. Focus: buttons/actions prone to silent failure, Cloudinary upload/download/delete integration, and general loose ends. Read-only review — nothing in this doc has been fixed yet.

Cross-checked against prior audits (`AUDIT_WEB_2026_09_06.md`, `AUDIT_MOBILE_2026_09_06.md`, `AUDIT_FULL_2026_09_17.md`, `AUDIT_*_ROUTES_BUGS_COMPAT_PERF_2026_09_22.md`, `AUDIT_SECURITY_PRIVACY_ACCESSIBILITY.md`) — everything below is new, not a re-report.

## Critical

### 1. Chat images and CV/transcript uploads bypass the server via a hardcoded, unsigned Cloudinary preset
- `mobile/app/message/[chatId].tsx:33-41`
- `web/app/student/home/BrowseSupervisors.tsx:53-64`
- `mobile/app/(tabs)/BrowseSupervisors.tsx:62-77`
- `web/app/student/home/BrowseProjects.tsx:33-44`
- `mobile/app/(tabs)/Browseprojects.tsx:173-206`

All five POST directly to `https://api.cloudinary.com/v1_1/dp7stlfas/{image,raw}/upload` with `upload_preset: 'student_uploads'` — no Firebase ID token, no app involvement. The only server-side check is `chatController.ts:141`'s `CHAT_IMAGE_URL_RE`, which regex-matches the *shape* of the resulting URL after the fact — it never confirms the asset was uploaded by the authenticated sender or during this request.

**Impact:** anyone who extracts `student_uploads` from the client bundle (trivial — it's a plaintext literal) can upload unlimited files to this Cloudinary account for free, with no account, no rate limit, and no audit trail — a real storage/bandwidth cost and abuse vector. It also means an `imageUrl` in a chat message isn't provably something the sender just uploaded — it could point at any other public asset in the account.

## High

### 2. Cloudinary fetches never check `res.ok` — a 404/error response is treated as success
Systemic pattern across web and mobile:
- `web/lib/fileClickPreview.ts:16-31` (`downloadFile`) — fetches the file URL, calls `.blob()` unconditionally, and saves it to disk under the original filename even on a 404. Used by `web/components/MilestoneFilePanel.tsx:157`, the live download path for every milestone-file download across supervisor/coordinator dashboards. A coordinator can "successfully" download a corrupt/HTML error blob believing it's the real submitted file.
- `web/components/MilestoneFilePanel.tsx:77-97` (`FilePreviewFrame`) — same issue; a 404'd asset renders as a blank/broken iframe instead of the built-in "could not load preview" error state.
- `web/app/student/home/BrowseSupervisors.tsx:53-64` / `BrowseProjects.tsx:33-44` (`uploadToCloudinary`) — no `res.ok` check before reading `data.secure_url`; a rejected upload (oversized file, bad preset) collapses to a generic `'Upload failed'` → then a generic `"Failed to submit application"`, discarding Cloudinary's actual error reason (e.g. file-size-too-large) that would tell the student what to fix.
- `mobile/app/(tabs)/BrowseSupervisors.tsx:62-77` / `Browseprojects.tsx:173-206` (`uploadFile`) — same missing check, but worse: on a rejected upload, `secure_url` is `undefined`, that `undefined` is submitted as `transcriptUrl`/`cvUrl` to `/api/applications/apply`, and the UI still shows the green "✅ applied successfully" message. **The student believes their transcript/CV was attached when it wasn't.** Sibling implementations got this right — `mobile/app/supervisor/dashboard.tsx:909-913` and `mobile/components/CreateOwnProjectButton.tsx:71-75` both check `res.ok` before reading `secure_url` — so this is a regression against the codebase's own established pattern, not a missing feature.

### 3. No Cloudinary cleanup path anywhere — deleted/replaced files leak forever
- `server/src/controllers/infoFilesController.ts:384-408` (`deleteInfoFile`) deletes only the Firestore doc; the Cloudinary asset stays.
- `server/src/controllers/infoFilesController.ts:239-247` (`updateInfoFile`) uploads a replacement but never removes the old asset.
- Confirmed via full-repo grep: `cloudinary.uploader.destroy`/`rename` is called **nowhere** in `server/src`. The only place that replaces in-place correctly is `studentPhoto.ts` (`overwrite: true, public_id: uid`).

**Impact:** milestone submissions, staff records, evaluation records, and info-files all accumulate orphaned Cloudinary storage indefinitely, with no admin-visible way to find or reclaim it.

### 4. Research-proposal sign-off button has no loading guard and no error handling at all
`mobile/components/ProjectWorkflowSection.tsx:379-390` — the "Confirm & sign" button `await`s `apiClient.post(...)` with no `disabled` guard and no try/catch. Contrast with the near-identical sign-off buttons in `mobile/app/supervisor/dashboard.tsx:1662-1682` and `mobile/app/coordinator/home.tsx:1665-1678`, which both gate on a busy state and wrap in try/catch + `Alert`. A double-tap fires duplicate POSTs; a failed request becomes an unhandled promise rejection with the sign-off form just sitting there, no error shown.

### 5. Coordinator examiner-recommendation approve/reject buttons have no busy-state guard
`mobile/app/coordinator/home.tsx:2199-2232` — no `disabled` prop, no busy state, so nothing prevents a double-tap from firing duplicate approve/reject POSTs. Inconsistent with the newer `mobile/components/PendingSignoffsWidget.tsx:198-238`, which correctly gates on `busyId === item.id` for the equivalent action.

### 6. Chat image send failure is completely silent to the user (web)
`web/app/message/[chatId]/page.tsx:141-155` (`handleImageSelected`) — catch block only does `console.error`. The upload spinner runs, reverts to idle, and the user has no indication their photo wasn't sent (network blip, Cloudinary rejecting file type/size). Mobile has the same gap: `mobile/app/message/[chatId].tsx:219-220`'s `pickAndSendImage` catch is `console.error`-only with no Alert.

### 7. Stray debug `console.log` in a hot render path (currently uncommitted)
`web/app/student/home/BrowseSupervisors.tsx:67` — `console.log('YYY render, faculty=', ...)` fires on every render (every keystroke, every Firestore snapshot). Confirmed via `git diff` this was just added in the in-progress, uncommitted change to this file — worth stripping before that work is committed.

## Medium

### 8. TOCTOU race on "write-once" examiner bank/tax records
`server/src/services/examinerFinancial.ts` — `createExaminerBankAccount` (L89-98) and `createExaminerTaxDocument` (L158-168) do a plain `ref.get()` existence check followed by a separate `ref.set()`, not a transaction, despite the code comment explicitly documenting write-once semantics. Two concurrent requests (double-submit, client retry) can both pass the check before either writes; the second silently overwrites the first with no 409. The tax-document path also uploads to Cloudinary first, so the losing request's file becomes another orphaned asset (see #3).

### 9. Cleaned-up-error pattern from `submitMilestone` never propagated to sibling upload endpoints
`server/src/controllers/milestoneController.ts:251-264` deliberately catches raw Cloudinary/SDK errors (e.g. `"Must supply api_key"`) into a clean bilingual 502 instead of leaking them to the client — but the same treatment was never applied to:
- `userController.ts:718-721`, `:744-747` (photo upload/read), `:682-685`/`:696-699` (account deletion)
- `infoFilesController.ts:207-210`/`:259-262`
- `projectController.ts:850-855`/`:962-967` (evaluation submission) and `supervisorController.ts:1135`/`:1266` (staff records) — these wrap the Cloudinary call in one broad catch-all that returns a generic "Failed to submit..." for any failure, Cloudinary included, with no distinction and no 502.

A transient Cloudinary hiccup during a defense-grading submission looks identical to a real input error to the supervisor/examiner.

### 10. `BrowseSupervisors` (web) can get stuck on a permanent loading spinner
`web/app/student/home/BrowseSupervisors.tsx:116-134` — `loading` starts `true` and is only ever cleared inside the `onSnapshot` callback, which is gated behind `if (!studentFaculty || !studentDegree) return`. If a student's profile is ever missing `facultyId`, the effect bails silently and the screen spins forever with no error — a regression from the previous unconditional fetch-on-mount.

### 11. Password-reset emails silently bypass the app's own reset page
`mobile/app/(auth)/resetPass.tsx:42` — `WEB_APP_BASE_URL = ''`, with a TODO acknowledging it's unset. Every reset email falls back to Firebase's default hosted reset page instead of the app's page that's meant to enforce this app's password-complexity rules.

### 12. Silent-catch upload/send handlers with no user feedback
- `mobile/components/CreateOwnProjectButton.tsx:79-83` (`pickFile`) — `console.error` only, no `Alert`, unlike the near-identical `pickFile` in `mobile/app/supervisor/dashboard.tsx:923-928` which does alert on the same catch.
- `web/app/message/[chatId]/page.tsx:123-137` (text send failure) — restores the typed text but shows no error banner/toast, just `console.error`.

### 13. No `onError` fallback on chat images
`mobile/app/message/[chatId].tsx:396` and `:468` — neither the thumbnail bubble nor the full-screen viewer `<Image>` has an `onError` handler; a deleted/expired asset renders as a blank image with no "unavailable" fallback or retry.

## Low

### 14. Student-identifying data logged in plaintext on every dashboard load
`server/src/controllers/milestoneController.ts:808,810,814` (`getMilestonesByQuery`, hit on essentially every dashboard load) and `:99` (`submitMilestone`) log full query params and per-milestone `studentIds`/`projectId`/`status`/`type` on every call — emoji-prefixed debug instrumentation, not intentional structured logging. Lower-volume versions in `userController.ts` and `index.ts`.

### 15. Fragile string-matching for a control-flow-significant error
`server/src/controllers/examinerOnboardingController.ts:149` distinguishes a 409 write-once case from a generic 500 via `error.message?.includes('already been submitted')` rather than a typed error — one wording edit in `examinerFinancial.ts` away from silently regressing to a 500.

### 16. Duplicated Cloudinary config, no shared helper
The cloud name (`dp7stlfas`) and preset (`student_uploads`) are hardcoded independently in at least three places (`apiClient.ts:369`, `BrowseSupervisors.tsx`, `BrowseProjects.tsx`) instead of a single shared constant/helper — not a functional bug today, but the `res.ok` omission in #2 is exactly the kind of divergence copy-pasting this logic invites.

### 17. Outstanding TODO — examiner IDs not wired to staff-record form
`mobile/components/ProjectWorkflowSection.tsx:478-480` — acknowledged as pending ("wire this once it's decided which milestone's examiner panel...").

---

## What's already solid (no action needed)
- Cloudinary upload always happens **before** the Firestore write across every reviewed flow (milestone submit, evaluations, staff records, info-files) — correct ordering, avoids DB records pointing at nonexistent files.
- File size/type limits are consistently enforced server-side via `multer` at every controller-owned upload path.
- No signed-upload-param abuse vector in server-mediated paths — folder/`resource_type` are always hardcoded server-side, never client-supplied.
- No hardcoded Cloudinary **API secret** found anywhere client-side; only the expected unsigned preset name is exposed (the preset itself being unauthenticated is the bug in #1, not the exposure of its name).
- The disabled-while-saving + try/catch + visible error text pattern is the norm across most of the app (admin panel actions, `ClockPauseControl`, `ExceptionalActionQueue`, `SubmitMilestoneModal`, `PendingSignoffsWidget`, student-detail forms) — the findings above are outliers against an otherwise-consistent standard, which is what made them identifiable.

## Suggested priority order
1. Lock down or replace the unsigned Cloudinary preset (#1) — real cost/abuse exposure.
2. Add `res.ok` checks to the four Cloudinary fetch/upload/download call sites (#2) — silent data loss and a false "success" message shown to students.
3. Add a Cloudinary `destroy` call to `deleteInfoFile`/`updateInfoFile`, and decide a retention policy for the already-orphaned assets (#3).
4. Add loading/error guards to the two unguarded mobile buttons (#4, #5).
5. Everything else is incremental hardening, not urgent.
