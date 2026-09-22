# Dead-Ends / Bugs / Compatibility / Efficiency Audit — Web Application

Date: 2026-09-22
Scope: `web/` (Next.js) only — server/mobile out of scope for this pass (see `AUDIT_WEB_2026_09_06.md` and `AUDIT_FULL_2026_09_17.md` for the earlier security/a11y/integrity audits, which this one deliberately doesn't re-cover).
Method: 4 independent research passes (dead-end routes, bugs/errors, compatibility, efficiency), each with real file:line references from full file reads, not grep guesses.

## Fixed in follow-up commits (same day)
- **Dead-ends:** all 4 role→nav gaps (`/committees` added to 10 roles, `/reports`+`/workflow-templates` added to `program_head`, `/info-files` added to `supervisor`). The orphaned `student/projects/[id]` page was left alone (harmless, not asked for).
- **Bugs:** both — the student dashboard's wrong-milestone-name bug, and the sign-off button's silent failure (plus a double-submit guard). The thesis-template download's silent failure was fixed too.
- **Compatibility:** all 5 — clipboard guard, both RTL regressions, all 4 locale-formatting gaps. The low-severity `ActiveDashboard.tsx:618` item was left alone per its own "not worth a standalone fix" note.
- **Efficiency:** 3 of 4 — the duplicate `getSupervisorDashboard()` fetch (request coalescing in `apiClient.ts`, not a data-shape change — every caller still gets the response exactly as fast as a single fetch), the coordinator dashboard's 3 sequential awaits (now `Promise.allSettled`), and `useStudentData.ts`'s waterfall + N individual supervisor-name reads (now parallelized / batched). The Reports page's keystroke-refetch was fixed via request cancellation (`AbortController`) rather than a debounce, per an explicit instruction that no fix should add delay to when data arrives — every keystroke still fires immediately; only a superseded, now-irrelevant response gets discarded.
- **Left unchanged, deliberately:** the unscoped `onSnapshot` on `milestones` for `'all'`-scoped coordinator-tier accounts. Restricting what it subscribes to would change what data those accounts actually see — a product/security decision, not a pure efficiency fix — so it wasn't touched without that decision being made explicitly.

---

## Priority overview

| Severity | Dead-ends | Bugs | Compatibility | Efficiency |
|---|---|---|---|---|
| High | 0 | 0 | 0 | 1 |
| Medium | 4 | 2 | 5 | 4 |
| Low | 1 | 1 | 2 | 0 |

---

## 1. Dead-end routes

### 🟡 Medium — Four routes are permitted for a role but that role has no menu entry to reach them
- **`/committees`** — permitted for 11 roles (`web/lib/roles.ts:37-49`), but only `admin/navConfig.ts:172` (system_admin) actually links to it. Three layout files (`program_head/layout.tsx:8`, `coordinator/layout.tsx:8`, `administrative_coordinator/layout.tsx:8`) have comments claiming "Committees" was migrated into their sidebar — it wasn't. `web/components/CommitteesLink.tsx` exists as ready-made wiring for this but is never imported anywhere.
- **`/workflow-templates`** (+ `/workflow-templates/new`) — permitted for `program_head` (`web/app/workflow-templates/page.tsx:34`), but `program_head/navSections.ts` has no entry for it (every other permitted role does).
- **`/reports`** — same gap: permitted for `program_head`, missing from `program_head/navSections.ts`.
- **`/info-files`** — permitted for `supervisor` (`web/app/info-files/page.tsx:20`), missing from `supervisor/navSections.ts`.

**Failure scenario:** A program_head can never discover Reports or Workflow Templates exist, and a supervisor can never discover Info Files exists — both pass the role guard if they somehow land on the URL directly, but have no in-app way to find it.

### 🟢 Low — Orphaned page: student project detail
**File:** `web/app/student/projects/[id]/page.tsx` — no incoming reference anywhere in `web/`. Its own header comment frames it as a fresh replacement for dead mobile code, but nothing links to it; the student dashboard shows project detail inline instead (`student/home/ActiveDashboard.tsx`). Not harmful (it's wrapped in `DashboardShell`, so landing on it directly still has a way out), just dead code.

### Looked fine, no action needed
- No broken links found — every dynamic-segment link (records drill-down trees, notification target table, workflow-template propose/edit links) resolves to a real page.
- No true dead-ends (a page with zero way out) found. `choose-track` is intentionally exitless (documented in its own comment). Public token-landing pages (`login-security`, `defense-access`, `examiner-access`) have no nav because they're reached only via emailed one-time links, not orphaned.

### Not deeply verified
6 other unused standalone `*Link.tsx` components (`AcademicYearLink`, `ReportsLink`, `InfoFilesLink`, `BulkPermissionsLink`, `LiveTransportationLink`, `WorkflowTemplatesLink`) suggest an earlier per-page nav-link pattern superseded by `navSections.ts`/`navConfig.ts` — worth a cleanup pass, not individually chased further.

---

## 2. Bugs and errors

### 🟠 Medium-high — Student dashboard's "next milestone" card can show the wrong milestone's name
**File:** `web/app/student/home/ActiveDashboard.tsx:219-223`
```js
const nextPending = milestones.find((m) => m.status === 'pending' || m.status === 'rejected');
const displayType = nextPending?.type ?? overviewDisplayMilestone.type;
```
**What's wrong:** Re-derives "the next milestone" from scratch instead of reusing the already-correct, unlock-aware `actionableNextMilestone` computed at line 124-125. Every milestone is created with status `'pending'` upfront at enrollment (per `ProjectWorkflowSection.tsx`'s own documented behavior), so a milestone several steps ahead can read `'pending'` even while locked behind an earlier one still in review.
**Failure scenario:** A student submits `research_proposal` (now `submitted`) while the template's next milestone, `progress_report`, still sits at its default `'pending'`. The status badge correctly says "⏳ Awaiting approval" (driven by `overviewDisplayMilestone`), but the milestone *name* next to it comes from `nextPending`, which skips the submitted proposal and returns `progress_report` instead — the card reads "Progress Report … Awaiting approval," naming the wrong milestone. Reproduces for essentially any student whose most-recently-submitted milestone isn't the template's last one.
**Fix:** use `actionableNextMilestone?.type ?? overviewDisplayMilestone.type` instead of the separate `nextPending` derivation.

### 🟡 Medium — Unhandled rejection leaves the research-proposal sign-off button appearing to do nothing
**File:** `web/app/supervisor/dashboard/ProjectWorkflowSection.tsx:598-603`
```js
onClick={async () => {
  await apiClient.coordinatorApproveMilestone(m.id!, undefined, undefined, stageFormValues);
  setSigningId(null);
  setStageFormValues({});
  fetchDetail();
}}
```
**What's wrong:** The only `onClick={async () => …}` handler in this file with no try/catch — every sibling modal (`GradeMilestoneModal`, `UpdateGradeModal`, `FinalGradeDecisionModal`) wraps its call and surfaces failure via `setError`.
**Failure scenario:** A supervisor signs off with a required form field left blank, or hits a transient network error — the click appears to do nothing (form stays open, no error shown, `setSigningId(null)` never runs), leaving them unable to tell whether it worked.

### 🟢 Low — Thesis-template download failure is silent
**File:** `web/app/student/home/ActiveDashboard.tsx:107-115` — no `catch` around `apiClient.getThesisTemplate()`; `finally` resets the loading spinner but nothing tells the student the download failed vs. never attempted.

### Looked fine, no action needed
`contexts/AuthContext.tsx`, `contexts/NotificationsContext.tsx`, `hooks/useStudentData.ts`, `DefenseTab.tsx`, `PendingSignoffsWidget.tsx`, and most coordinator/supervisor modals — consistent with this codebase's established error-handling and listener-cleanup conventions. `AssignExaminersModal.tsx`'s weight field not auto-recomputing on slot changes is a UX rough edge, not data corruption (submit-time validation catches any mismatch).

---

## 3. Compatibility

### 🟡 Medium — Clipboard copy on the crash-fallback screen has no guard
**File:** `web/components/ErrorFallback.tsx:34` — bare `navigator.clipboard.writeText(...)`, no existence check. On a non-secure context or Safari <13.1, `navigator.clipboard` is `undefined` and this throws *synchronously before* the trailing `.catch()` can run — on the app's own crash-report screen, of all places. Three other clipboard call sites in this codebase correctly wrap it in try/catch; this one doesn't.

### 🟡 Medium — Two RTL regressions (inconsistent with this codebase's own convention)
- **`web/app/message/[chatId]/page.tsx:230`** — an image-attachment caption is forced `text-left` unconditionally, while the plain-text bubble two lines below correctly inherits RTL alignment. A Hebrew caption renders left-aligned, inconsistent with every other Hebrew bubble in the same thread.
- **`web/app/supervisor/dashboard/ProjectCard.tsx:97`** — the collapse/expand button wrapper is `text-left`, forcing left alignment on the Hebrew/English title and content regardless of language. The sibling `faculty_admin/dashboard/ProjectCard.tsx` (same pattern) has no such override — this looks like a one-off regression, not the app's convention.

### 🟡 Medium — Several date/time displays ignore the user's chosen in-app language
Pattern: 60+ call sites correctly do `toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US', ...)`; these four drop the locale argument, defaulting to the browser's own locale instead:
- `web/app/admin/live-transportation/page.tsx:429-430,790-791`
- `web/app/admin/panel/page.tsx:400`
- `web/app/examinor/home/AssignmentCard.tsx:257-258`
- `web/app/message/[chatId]/page.tsx:25`

**Failure scenario:** any user whose OS/browser locale doesn't match their chosen in-app language (plausible on a shared/lab computer) sees these specific dates/times in the wrong language while the rest of the same screen is correctly localized.

### 🟢 Low — Minor hardcoded `text-right`
`web/app/student/home/ActiveDashboard.tsx:618` — cosmetically minor since it's the last flex child in a `justify-between` row; not worth a standalone fix.

### Looked fine, no action needed
No unguarded `window`/`document`/`navigator` access elsewhere — `apiClient.ts`, `LanguageContext.tsx`, `InfoTooltip.tsx`, `useIdleTimer.ts` all gate correctly. No responsive/mobile-web layout gaps — modals consistently use viewport-safe patterns, floating widgets (`ChatbotFab.tsx`, `InfoTooltip.tsx`) do real clamp math. `globals.css` uses nothing Safari-risky (no `:has()`, container queries, `backdrop-filter`). Meeting-scheduling/defense-date timezone handling is correct (local wall-clock in, UTC/ISO stored, documented).

---

## 4. Efficiency

### 🔴 High — Coordinator-tier dashboards fetch the same supervisor payload twice, and one variant streams the entire `milestones` collection unfiltered
**Files:** `web/components/MyApplicationsWidget.tsx:68-70` + `web/components/MyProjectsWidget.tsx:44-48`, co-mounted on 4 different dashboards (`coordinator/home/page.tsx:505,508`, `faculty_admin/dashboard/page.tsx:168,171`, `administrative_coordinator/dashboard/page.tsx:425,428`, `grad_school_head/dashboard/page.tsx:455,458`).
**What's wrong:** Each widget independently calls `apiClient.getSupervisorDashboard()` on mount — for any dual-role staff member (coordinator/faculty_admin/grad_school_head/admin-coordinator who also holds `supervisor`), that's the same non-trivial server aggregation (project queries, chunked `in`-queries, a `getDoc` per enrolled student — `server/src/controllers/supervisorController.ts:95-160`) run **twice** per page load just to split one payload into "applications" vs "myProjects".
Separately, `coordinator/home/page.tsx:171-175`: for any coordinator/administrative_secretary/system_admin whose scope includes `'all'`, the live `onSnapshot` on `milestones` has **no `where` clause at all** — every milestone write anywhere in the system, by anyone, re-runs this listener's handler client-side.

### 🟡 Medium — Reports page refetches the full project list on every keystroke
**File:** `web/app/reports/ProjectFirstReportsFlow.tsx:79-117` — `filters` (includes free-text `startYear`/`advisorId` inputs, no debounce) is a dependency of an effect that re-fetches `apiClient.getReportProjects(filters)` on every change. Typing a 4-digit year fires 4 full server round trips instead of 1.

### 🟡 Medium — Coordinator dashboard: 3 independent fetches awaited in series
**File:** `web/app/coordinator/home/page.tsx:116-140` — `getCoordinatorExaminerRecommendations()`, `getActiveProjects()`, `getStaffDeadlines()` are awaited one after another despite being mutually independent; `Promise.allSettled` would cut ~3 sequential round trips off every load.

### 🟡 Medium — Student dashboard: sequential fetches + N individual Firestore reads instead of one batched query
**File:** `web/hooks/useStudentData.ts:125-134,228-239` — `getStudentProject` then `getMilestones` awaited in series though independent (2 round trips instead of 1 parallel pair). Separately, the live "browse projects" listener issues one `getDoc` per distinct supervisor lacking a cached name via `Promise.all` on every snapshot fire — N individual reads instead of one batched `in` query.

### Looked fine, no action needed
No bundle-size red flags (no heavy libraries eagerly imported into shared layout/components). `admin/panel/page.tsx`'s per-doc locked-account reads are explicitly bounded to a handful of concurrently-locked accounts — not a real problem.

---

## Suggested order of work

1. **Efficiency #1** (duplicate dashboard fetch + unscoped `milestones` listener) — the only High-severity item, and it compounds: every dual-role staff dashboard load doubles a non-trivial query, and the unscoped listener re-fires on unrelated writes system-wide.
2. **Bug #1** (wrong milestone name on student dashboard) — small fix (reuse `actionableNextMilestone`), directly misleads students about their own submission status.
3. The two RTL regressions and the locale-formatting gaps (Compatibility) — small, mechanical fixes, same shape as issues the 2026-09-06 audit already found and fixed elsewhere in this codebase.
4. The four role→nav gaps (Dead-ends) — each is a one-line addition to a `navSections.ts` file.
5. Everything else (silent-failure gaps, orphaned page, minor RTL) is low urgency and can wait for a batch cleanup pass.
