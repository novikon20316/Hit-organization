# Dead-Ends / Bugs / Compatibility / Efficiency Audit — Mobile Application

Date: 2026-09-22
Scope: `mobile/` (Expo Router / React Native) only — web/server out of scope for this pass (see `AUDIT_MOBILE_2026_09_06.md` for the earlier security/accessibility/integrity audit, which this one deliberately doesn't re-cover: push-token-on-logout, push-body plaintext leakage, missing `expo-image-picker` config plugin, and 2FA screen accessibility are already tracked there and skipped here). Companion to `AUDIT_WEB_ROUTES_BUGS_COMPAT_PERF_2026_09_22.md`, same method, mobile-only.
Method: 4 independent research passes (dead-end routes, bugs/errors, compatibility, efficiency), each with real file:line references from full file reads, not grep guesses. No fixes applied yet — this is the findings pass.

---

## Priority overview

| Severity | Dead-ends | Bugs | Compatibility | Efficiency |
|---|---|---|---|---|
| High | 3 | 0 | 1 | 2 |
| Medium | 2 | 2 | 2 | 3 |
| Low | 0 | 0 | 1 | 2 |

---

## 1. Dead-end routes

### 🔴 High — System_admin and faculty_admin's tab bar registers a screen name that doesn't exist
- **`mobile/app/(tabs)/_layout.tsx:129`** — `ROLE_TABS.system_admin` declares `{ name: 'admin/home', ... }`, but `app/admin/` only contains `overview.tsx`, `panel.tsx`, `projectMilestones.tsx`, `records.tsx`/`records/*` — no `home.tsx`, and `admin/_layout.tsx` is a plain `<Stack>` with no route aliasing `home`.
- **`mobile/app/(tabs)/_layout.tsx:105`** — same bug for `faculty_admin`: tab name is `'faculty_admin/home'`, but the real file is `app/faculty_admin/dashboard.tsx` (no `home.tsx`). Ironically `ROLE_ROUTES` at lines 61/67 correctly point post-login redirects at `/faculty_admin/dashboard` and `/admin/overview` — only the persistent `<Tabs.Screen name=...>` entries are wrong.

**Failure scenario:** these are each role's *only* content tab besides Notifications/Roles. A system_admin or faculty_admin who switches to Notifications and taps back to their primary tab hits a route Expo Router never registered.

### 🔴 High — Three staff dashboards deep-link into a system_admin-only screen that also ignores the params they pass
- **`program_head/program_head_dashboard.tsx:387`**, **`grad_school_head_dashboard.tsx:735,740`**, **`administrative_coordinator_dashboard.tsx:1411`** all do `router.push({ pathname: '/admin/panel', params: { studentId/approvalId/groupId } })` with no role check anywhere in those files.
- `admin/_layout.tsx:57-106` gates the entire `/admin/*` group to `system_admin` only, rendering `NoAccessScreen` otherwise.
- Even if it didn't: `admin/panel.tsx:59` only destructures `{ projectId, tab }` from `useLocalSearchParams` — `studentId`/`approvalId`/`groupId` are read nowhere in the file, so a system_admin who *did* get through would just land on a generic Overview tab, not the specific student/approval.

**Failure scenario:** a program_head/grad_school_head/administrative_coordinator taps "review this student/approval" and gets a hard Access Denied screen instead of the intended action.

### 🔴 High — Maintenance redirect targets a route that doesn't exist (case mismatch)
- **`app/_layout.tsx:365-368`**, **`app/(auth)/login.tsx:143-146,332-336`** all do `router.replace({ pathname: '/maintenance', ... })`.
- The only matching file is **`app/(tabs)/Maintenance.tsx`** (capital M), which Expo Router registers as `/Maintenance`, not `/maintenance`.

**Failure scenario:** when mobile maintenance mode is active, every non-admin login attempt tries to redirect to a route that was never registered, instead of showing the intended countdown screen.

### 🟡 Medium — Two menu-linked screens are inside `(tabs)` but excluded from its route allowlist, so the layout shows a fake 404
- `app/(tabs)/_layout.tsx:286-288` renders a custom `NotFoundScreen` for any pathname failing `isKnownRoute()` (lines 16-43, 70-73), which only allows `HIDDEN_TAB_ROUTES` (`/WorkflowTemplateManager`, `/WorkflowTemplateEditor`, `/Reports`) and role-prefixed paths.
- `/AcademicYearManager` and `/BulkPermissionsManager` are neither — but they're real files under `app/(tabs)/` and are linked from `constants/adminMenu.ts:40-41` (system_admin), `faculty_admin/dashboard.tsx:418`, `grad_school_head_dashboard.tsx:491`, and `administrative_coordinator_dashboard.tsx:972`.

**Failure scenario:** tapping "Academic Year Management" or "Bulk Permissions by Role" from four different roles' menus/dashboards renders the layout's "Page Not Found" screen instead of the real screen, because the whole `<Tabs>` tree is swapped out before the pushed route ever mounts.

### 🟡 Medium — Two built screens have zero navigation entry points
- **`app/(tabs)/Facultytemplatemanager.tsx`** — full CRUD screen for project/thesis proposal templates, but appears nowhere as a `router.push`/`Link` target or component import.
- **`app/(tabs)/Milestonetimeline.tsx`** — a "shared timeline component" per its own header comment, but never imported; all real usages (`administrative_coordinator/students/[studentId].tsx`, `student/milestones.tsx`, `supervisor/dashboard.tsx`) reference the differently-named `components/MilestoneTimeline.tsx` / `components/MilestoneRoadmap.tsx` instead.

**Failure scenario:** both screens are dead code from a navigation standpoint — reachable only by hand-typing the URL.

### Looked fine, no action needed
- `app/records/[projectId].tsx:34` — proper `canGoBack()` → `back()` fallback to `router.replace('/')`, safe dead-end handling.
- The `records.tsx` → `records/[supervisorId].tsx` → `records/[projectId].tsx` drill-down pattern is consistent and correctly wired across all 6 roles that have it.
- `Browseprojects.tsx` / `BrowseSupervisors.tsx` are technically orphaned as *routes* but are intentionally embedded as components inside `student/home.tsx` — not a nav bug.
- `admin/projectMilestones.tsx` is reachable from `admin/panel.tsx:1775`.
- `WorkflowTemplateManager`/`WorkflowTemplateEditor`/`Reports` are correctly listed in `HIDDEN_TAB_ROUTES` so they don't trip the false-404.

### Not deeply verified
Whether Expo Router silently 404s vs. throws when a `<Tabs.Screen name>` has no backing file (reasoned from routing conventions, not run live); `examinor/`, `dean/`, `division_head/` menu completeness wasn't cross-checked screen-by-screen; whether a multi-role account (e.g. both `program_head` and `system_admin`) makes the `/admin/panel` deep-links partially work for a subset of users.

---

## 2. Bugs and errors

### 🟠 Medium-high — Student "Overview" progress metric undercounts completed milestones, disagrees with the Milestones tab's own count
**Files:** `mobile/hooks/useStudentData.ts:386-395`, duplicated in `mobile/app/(tabs)/Activedashboard.tsx:192-197`
```ts
progress:
  milestones.length > 0
    ? Math.round((milestones.filter(m => m.status === 'coordinator_approved').length / milestones.length) * 100)
    : 0,
```
**What's wrong:** `MilestoneStatus` has terminal/late-pipeline states beyond `coordinator_approved` (`examiners_assigned`, `examiner_graded`, `scheduled`, ..., `completed`). A `final_report`/`defense` milestone moves through these after approval and never sits back in `coordinator_approved`, so once it progresses past approval it stops being counted as "done" here. Contrast with `mobile/app/student/milestones.tsx:161,167,199`, which correctly counts `status === 'coordinator_approved' || status === 'completed'` — the two screens disagree on what "completed" means for identical data.
**Failure scenario:** A masters student finishes all 4 milestones; the defense milestone reaches `status: 'completed'`. The Overview tab's progress metric still reads `3/4` (75%), never 100%, while the Milestones tab correctly shows `4/4`.
**Fix:** Count `status === 'coordinator_approved' || status === 'completed'` in both places (ideally via one shared helper instead of three independent copies of this filter).

### 🟡 Medium — Overview tab's "Next Deadline" card and "Submit" button both silently disappear after a milestone is rejected
**Files:** `mobile/hooks/useStudentData.ts:387-390`, `mobile/app/(tabs)/Activedashboard.tsx:145-149,368,412-416`
**What's wrong:** Neither `nextMilestone` nor `actionableNextMilestone` ever matches `status === 'rejected'`. Once a coordinator rejects a milestone and `isUnlocked()` correctly refuses to unlock any later one, both derived values become `null`: the "Next Deadline" card stops rendering, and the "Submit Milestone" quick-action button — the only submit affordance on the Overview tab — disappears too. `student/milestones.tsx:201` already special-cases `isRejected` correctly; Overview doesn't.
**Failure scenario:** Coordinator rejects a student's `research_proposal` with a reason. The student's default landing tab (Overview) shows no deadline card and no submit button — nothing indicating there's a rejection to act on.
**Fix:** Include `status === 'rejected'` in both derivations, and route `openSubmit` for a rejected milestone the same way `student/milestones.tsx` already does.

### Looked fine, no action needed
`mobile/app/_layout.tsx`'s auth-state routing state machine; `coordinator/home.tsx`'s submit-path try/catch/finally coverage and live-milestone overlay merge; `SubmitMilestoneModal.tsx`/`ProgressReportFormModal.tsx`/`ResearchProposalFormModal.tsx` submit handlers; `examinor/home.tsx`'s multi-shape grading branch logic; `useMaintenanceCheck.ts`'s fail-open behavior.

### Not deeply verified
`ActiveRoleContext.tsx:109-127`'s async `SecureStore` reload on a shared-device user switch (plausible brief stale-role window, not reproduced); `supervisor/dashboard.tsx`'s chunked listeners weren't exercised against >30-project accounts.

---

## 3. Compatibility

### 🔴 High — Root layout reintroduces the exact Expo-Go-crashing import pattern its own codebase documents as unsafe
**File:** `mobile/app/_layout.tsx:9-10` — top-level `import * as Notifications from 'expo-notifications'; import * as Device from 'expo-device';`, feeding a second, parallel push-registration function `registerPushToken` (line 61) called unconditionally at line 276.
**Contrast:** `mobile/components/pushNotifications.ts:1-18` explicitly does the opposite: *"NO top-level expo-notifications or expo-device imports — Both packages crash Expo Go on SDK 53 when imported at module load time. We lazy-import them inside each function instead,"* and gates on `Constants.appOwnership === 'expo'`. `_layout.tsx`'s version has neither protection, and the safe `registerForPushNotificationsAsync` is never imported/called anywhere — dead code superseded by the unsafe duplicate.
**Failure scenario:** Root `_layout.tsx` loads on every app boot, so if the documented Expo-Go module-load crash applies, it fires unconditionally for anyone testing in Expo Go, not just when a push-related screen opens.

### 🟡 Medium — Peer-to-peer chat screen has zero RTL handling, unlike every other chat surface in the app
**File:** `mobile/app/message/[chatId].tsx` (entire file), `mobile/constants/styles.ts:3971-3972`
**What's wrong:** No `isRtl` logic anywhere — not on the hardcoded `←` back arrow (line 227, vs. `chatbot.tsx:124`'s `{isRtl ? '→' : '←'}`), not on bubble alignment, not on text alignment. Since the app deliberately disables native RTL mirroring app-wide (`app/_layout.tsx:33-35`, implementing RTL manually via `isRtl && styles.X`), a screen with no `isRtl` logic gets **no RTL treatment at all**. `app/chatbot.tsx` and `components/FeedbackChat.tsx` both implement this thoroughly.
**Failure scenario:** A Hebrew-locale user opens a 1:1 chat with a supervisor/student — "my" message bubbles still align right (LTR convention) and the back arrow still points left, inconsistent with the rest of the app's Hebrew UI.

### 🟡 Medium — Inconsistent `KeyboardAvoidingView` Android `behavior` across text-input-near-bottom screens
**Files:** `login.tsx:402` and `FeedbackChat.tsx:72` use `behavior: 'height'` on Android; `chatbot.tsx:146`, `message/new.tsx:164`, `message/[chatId].tsx:251` correctly leave it `undefined`.
**What's wrong:** `app.json` already sets `android.softwareKeyboardLayoutMode: "resize"`, so Android itself resizes on keyboard show. Stacking `'height'` behavior on top of that OS-level resize double-adjusts.
**Failure scenario:** On Android, opening the keyboard on the login or feedback-chat screen can shift input fields further than intended, inconsistent with the chat/message screens.

### 🟢 Low — Deprecated `ImagePicker.MediaTypeOptions` enum still in use
**Files:** `message/[chatId].tsx:198`, `ResearchProposalFormModal.tsx:137` — `mediaTypes: ImagePicker.MediaTypeOptions.Images` is marked `@deprecated` by the installed `expo-image-picker@~17.0.11`. Functionally fine today, deprecation warning only.

### Looked fine, no action needed
`app.json` permission strings match actual image-picker call sites; all 51 `SafeAreaView` imports resolve to `react-native-safe-area-context`, not the iOS-only core-RN component; `icon-symbol` is correctly platform-split; `haptic-tab.tsx` deliberately gates haptics to iOS; no `window`/`document`/`localStorage`/`navigator.clipboard` usage anywhere in the app.

### Not deeply verified
Whether the SDK-53 Expo Go crash referenced in `pushNotifications.ts`'s comment still reproduces on the installed `expo@~54.0.36` (based on the code's own documented rationale, not a live repro); `react-native-webview` iOS-vs-Android rendering differences in `pdfViewer.tsx`; font-scaling/dark-mode screen-by-screen.

---

## 4. Efficiency

### 🔴 High — Unbounded, unfiltered listener on the entire `milestones` collection
**File:** `app/coordinator/home.tsx:319-323`
**What's wrong:** When a coordinator's `coordinatorScopes` includes the `'all'` faculty sentinel, the live milestone listener drops all `where()` filters: `isAllFaculties ? query(collection(db, 'milestones')) : query(..., where('facultyId','in', ...))`. This subscribes to every milestone document system-wide.
**Impact:** For any cross-faculty coordinator/admin-coordinator, this listener re-fires the full merge logic (lines 344-420) on every milestone write from any student in any faculty — a large continuous read stream and re-render on every unrelated write.

### 🔴 High — N+1 `getDoc` reads re-run inside every milestones snapshot callback
**File:** `app/supervisor/dashboard.tsx:547-582`
**What's wrong:** Inside the grading `onSnapshot` handler, for every `submitted` milestone it does `Promise.all(studentIds.map(sid => getDoc(doc(db,'users',sid))))` to resolve student names.
**Impact:** Re-runs on *every* change to any milestone in the project chunk (grade edit, status flip, examiner change — not just new submissions). 10 pending milestones × 3 students = 30 extra reads per unrelated snapshot event, instead of one batched `in` query per actual student-set change.

### 🟡 Medium — Duplicate/redundant live listeners on `notifications`
**Files:** `src/context/NotificationsContext.tsx:99-124`, `app/(tabs)/notifications.tsx:405-432`, `app/supervisor/dashboard.tsx:392-407`
**What's wrong:** Three independent `onSnapshot` listeners can run simultaneously for the same user against the same collection. The dashboard's own listener also queries the wrong field (`where('read','==',false)` vs. the schema's actual `isRead` used everywhere else), and its result (`unreadCount`) is set but never rendered anywhere in the file.
**Impact:** A supervisor on the notifications tab runs 3 concurrent listeners on overlapping data instead of 1 shared one; the dashboard's listener is a pure wasted read stream that likely always returns 0.

### 🟡 Medium — N+1 `getDoc` for supervisor names on every proposals snapshot
**File:** `hooks/useStudentData.ts:239-256`
**What's wrong:** The projects-browse listener does `Promise.all(supervisorIds.map(uid => getDoc(doc(db,'users',uid))))` inside the snapshot callback to backfill missing `supervisorName`.
**Impact:** Every open-projects list change (any add/edit/delete in the student's faculty+degree) re-fetches one user doc per distinct supervisor lacking a denormalized name, instead of caching resolved names or batching with an `in` query.

### 🟡 Medium — Large rosters rendered in `ScrollView` + `.map()`, no virtualization
**Files:** `components/StudentsListSection.tsx:123-124`, `components/ManagedStaffSection.tsx:201-202`
**What's wrong:** Faculty-admin/grad-school-head student and staff rosters render as `<ScrollView>{filtered.map(...)}</ScrollView>` instead of `FlatList`.
**Impact:** For a faculty_admin (whole-faculty scope), this can mount hundreds of student cards up front with no windowing.

### 🟢 Low — Context provider values are new object literals every render
**Files:** `contexts/ActiveRoleContext.tsx:137-144`, `src/context/NotificationsContext.tsx:139`
**Impact:** Both providers wrap the entire app; any unrelated state tick forces every consumer to re-render, since `value={{ ... }}` isn't memoized.

### 🟢 Low — Notification rows and milestone cards never memoized
**Files:** `app/(tabs)/notifications.tsx:228-275` (`NotifRow`), `app/(tabs)/Milestonetimeline.tsx:105-113`
**What's wrong:** Zero uses of `React.memo` found anywhere in `mobile/`. `NotifRow` additionally mounts an `Animated.Value` + `useEffect` fade/slide per row.
**Impact:** On the notifications screen (up to 100 items in a plain `ScrollView`), any parent state change re-renders and re-mounts every row's animation.

### Looked fine, no action needed
`useStudentData.ts` listener cleanup is solid across all 3 listeners; `supervisor/dashboard.tsx` correctly chunks `myProjectIds` at Firestore's 30-item `in` cap; the chat list in `notifications.tsx` correctly uses `FlatList`; `Milestonetimeline.tsx`'s own milestone list doesn't need virtualization (counts are single digits).

### Not deeply verified
Whether other dashboards (`admin/panel.tsx`, `faculty_admin/dashboard.tsx`, `grad_school_head_dashboard.tsx`, `dean_dashboard.tsx`, `division_head_dashboard.tsx`) repeat the same unbounded-`'all'`-scope listener pattern; `Reports.tsx`/`ProjectRecordTimeline.tsx` for N+1 patterns; actual production collection sizes to size real read-volume impact.
