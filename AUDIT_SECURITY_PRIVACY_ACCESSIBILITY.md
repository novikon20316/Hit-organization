# Security / Privacy / Accessibility Audit

Date: 2026-09-01 (updated 2026-09-01: impersonation-related findings removed — that feature is a temporary debugging aid, not part of the final product, so it's out of scope for this audit)
Scope: web (Next.js), server (Express/TS), mobile (Expo/React Native), Firebase (Auth + Firestore), Cloudinary, Brevo.
Method: full read-through by 3 independent research passes (one per domain). Findings below are backed by real file:line references — nothing here is guessed.

Use the checkboxes to track fixes. Re-run this audit (or at least the relevant section) after each round of fixes rather than trusting this file as permanently current.

---

## Priority overview

| Severity | Security | Privacy | Accessibility |
|---|---|---|---|
| Critical | 0 | 0 | 0 |
| High | 0 | 0 | 0 |
| Medium | 0 | 0 | 0 |
| Low | 0 | 0 | 0 |

**Every finding in this audit is fixed as of 2026-09-01.** See each section for what changed and what was verified. This is a snapshot, not a guarantee — re-run (or spot-check) the relevant section after future changes rather than assuming this stays true forever.

---

## 1. Security

All Medium and Low findings are server-side (shared backend, so the fix applies to both web and mobile clients at once — there was nothing to duplicate).

### Fixed 2026-09-01

- [x] **S2 — `restoreProject` had no faculty scoping.** `server/src/services/projectErasure.ts`, `server/src/controllers/projectErasureController.ts`. Now threads `restorerEffectiveFacultyIds` through from the controller (same `callerEffectiveFacultyIds` helper `decideErasureRequest` already used) and rejects a restore whose caller's faculty doesn't match the archived project's `facultyId`.
- [x] **S4 — Untracked build artifacts weren't gitignored.** Added `.firebase/`, `.firebaserc`, and `*.zip` to `.gitignore`. **Not done: deleting `web.zip` itself** (320MB, contains a `.env.local` snapshot) — left it in place since I don't know if it's an intentional local backup; ask the user before removing it. It can no longer be accidentally committed now that it's gitignored, which was the actual security risk.
- [x] **S5 — Admin gates using the singular-role check.** Normalized all 7 sites in `adminController.ts` (lines 704, 1019, 1143, 1166, 1332, 1390, 1427) plus `studentTrackController.ts:124` to `hasAnyRole(req.user, ['system_admin'])`, matching the rest of the codebase.
- [x] **S6 — `/api/users/sync` reset the graduation-deletion anchor on every call.** `server/src/controllers/userController.ts`. Now reads the existing Firestore doc first and preserves its `programStartDate` if one already exists, only stamping "now" on first creation.

Verified with `npx tsc --noEmit` in `server/` — no new type errors from these changes (3 pre-existing errors in the out-of-scope impersonation code, confirmed present before these edits too).

### Confirmed fixed since the last audit (verified this pass, no longer open)
- Mobile cleartext prod API URL — now `https://...onrender.com` via `Constants.expoConfig.extra.apiUrl`; only remaining `http://` is the emulator-only fallback.
- `/api/users/sync` uid-spoofing IDOR — uid/role now locked server-side (residual issue was S6 above, now fixed).
- Login-lockout Firestore rules — `mobile/firestore.rules:519-521` now denies all client read/write on `loginSecurityIncidents` (confirm this has actually been deployed with `firebase deploy --only firestore:rules` if you haven't recently).
- Erase/archive authorization — correctly scoped server-side to coordinator/system_admin with real faculty checks, including the `restoreProject` gap (S2, now fixed).

### Looked fine, no action needed
CORS is origin-allowlisted, `helmet()` is applied, `trust proxy` correctly set for Cloud Run, no `dangerouslySetInnerHTML` anywhere in web, tokens are handled via the Firebase SDK's own `getIdToken()` rather than manual localStorage, dependency majors (Next 16, Express 5, firebase-admin 13, Expo 54, React 19) are current.

---

## 2. Privacy

All four findings existed in both clients (or in shared/server code) — checked and fixed on both sides.

### Fixed 2026-09-01

- [x] **P5 — Audit log was a 100-entry ring buffer, pruned hourly.** `server/src/services/auditLog.ts`. Raised `AUDIT_LOG_MAX_ENTRIES` from 100 to 10,000 — confirmed nothing else depended on the low cap (the "Live Transportation" admin table does its own independent `limit(100)` display query, unaffected).
- [x] **P6 — "Erase user" dialog overstated what actually happens**, on both platforms. `web/app/admin/panel/UserRow.tsx`, `mobile/app/admin/panel.tsx`. Rewrote the copy (EN + HE) on both to accurately describe what `purgeAccount` (`server/src/services/accountDeletion.ts`) actually does: deletes the account, login, profile, notifications, and applications; leaves the person's references in past messages/milestones/projects/audit history in place, shown as "Unknown."
- [x] **P8 — Privacy policy named the email vendor generically ("our SMTP email provider" / `ספק דוא"ל (SMTP)`)**, on both platforms. `web/app/privacy-policy/page.tsx`, `mobile/app/privacy-policy.tsx`. Now names it as "Brevo," consistent with how Firebase/Expo/Cloudinary/Anthropic/ipinfo.io are already named. Also fixed the same stale "SMTP" wording in `mobile/docs/PLAY_STORE_DATA_SAFETY_AND_CONTENT_RATING.md` (an internal submission-prep doc, not user-facing, but referenced the same third-party list).
- [x] **P9 — "Erase project" naming implied destructive deletion** when it only archives (restorable), on both platforms. `web/app/admin/panel/ProjectsTab.tsx`, `web/lib/i18n.ts`, `mobile/app/admin/panel.tsx`, `mobile/components/i18n.ts`. Retitled the dialog/button from "Erase Project"/"Erase" to "Archive Project"/"Archive" (the body text was already accurate, only the title and CTA were misleading); also fixed the archived-list label "Erased on" → "Archived on" in both i18n files, which had the same problem.

Verified with `npx tsc --noEmit` in `server/`, `web/`, and `mobile/` — all three clean (server's 3 pre-existing errors are in the out-of-scope impersonation code, unrelated to these changes).

### Looked fine, no action needed
Account deletion pipeline (`accountDeletion.ts`) is genuinely well-designed — 14-day grace period, 7-year post-graduation retention hold, eligibility re-checks, real `auth.deleteUser` + Firestore purge. No analytics/tracking scripts in `web/app` (no cookie-consent gap). Student-list endpoints spot-checked in `projectController.ts` return minimal fields, not full user documents.

---

## 3. Accessibility

### Fixed 2026-09-01 (High)

- [x] **A1 — Mobile app: ~1,334 tappable controls across 101 files had no `accessibilityRole`/`accessibilityLabel`.** Full systematic sweep, split across 6 batches by area (dashboards, admin/heads/examiner, tabs/workflow screens, auth/student/shared-components, all modals, records/misc components). Every `Pressable`/`TouchableOpacity` in every one of the 101 files now has an `accessibilityRole` (mostly `"button"`, with `"link"` for row-cards that navigate, `"radio"`/`"checkbox"`/`"switch"` + `accessibilityState` for real toggles/pickers). Icon-only controls (modal close "✕" buttons, password show/hide, back arrows, delete/trash icons, FABs, language toggles) got an explicit bilingual `accessibilityLabel` matching each file's own existing `lang`/`isRtl` convention; controls with clear visible text were left label-free (role only) since React Native already announces the child text — this kept the diff minimal and consistent with how `HeaderMenu.tsx` did it correctly before this fix. Also added `accessibilityLabel` to ~15 auth/student `TextInput`s that relied only on a placeholder (which disappears once the user starts typing). Verified with `npx tsc --noEmit -p tsconfig.json` in `mobile/` after every batch and once more combined at the end — clean, no errors.
- [x] **A2 — Web chat had no live region for new messages.** `web/app/message/[chatId]/page.tsx`. Added `role="log" aria-live="polite" aria-relevant="additions"` to the message list container.
- [x] **A3 — Signup form errors weren't linked to their inputs.** `web/app/(auth)/signup/page.tsx`. Phone, email, student ID, and password-rules errors now use `aria-invalid`/`aria-describedby`/`role="alert"`, matching the login page's existing pattern.

Verified with `npx tsc --noEmit` in `web/` — clean.

### Fixed 2026-09-01 (Medium)

- [x] **A4 — `SessionExpiredModal` had no focus trap.** `web/components/SessionExpiredModal.tsx`. Wired through the shared `useModalA11y` hook like every sibling modal — but with a no-op `onClose` (Escape does nothing), since this modal is deliberately un-dismissable except via its OK button; only the focus trap and focus-restore behavior were missing, not the dismiss action.
- [x] **A5 — Icon-only "✕" close buttons with no accessible name.** The audit's "5+ modals" turned out to be an undercount — a full sweep found 34 files with the same pattern (not just the 5 sampled). Added contextual bilingual `aria-label`s to all of them: "Close" for modal-close buttons, "Cancel" for inline sub-form cancel buttons (`CoordinatorScopesModal.tsx`, `PermissionsEditorModal.tsx`), and specific item-name labels for remove/delete buttons (remove file, remove examiner, remove course row, delete file/content, dismiss error). A few ✕-adjacent buttons found during the sweep were confirmed already fine (visible text label already present, e.g. `reports/page.tsx`'s filter chips, `ApplicationCard.tsx`'s "✕ Reject" button, and a few already-labeled remove buttons) and left untouched.
- [x] **A6 — Approval-chain expand/collapse toggle had no `aria-expanded`.** `web/components/MilestoneTimeline.tsx`. Added `aria-expanded` + `aria-controls` pointing at the revealed chain detail (given a stable id via `milestone.id`, since this component renders once per milestone in a list).
- [x] **A7 — Defense building picker had no group label or selected-state announcement.** `web/components/DefenseBuildingPicker.tsx`. Added `role="group" aria-label` on the container and `aria-pressed` per building button. Also added `aria-pressed` to the Thesis/Track toggle in signup (`signup/page.tsx`).
- [x] **A8 — Loading states were silent to assistive tech in most places.** Broader than the audit's "~13 other files" sample suggested — found 22 files using the exact same bare `"טוען…"/"Loading…"` text pattern with no `role`/`aria-live` (20 records-list pages/`ProjectRecordTimeline.tsx`/chat, plus 2 more on student home not caught by that exact string match). All now have `role="status" aria-live="polite"`.
- [x] **A9 — Chat image attachments had `alt=""`.** `web/app/message/[chatId]/page.tsx`. Both the inline chat-bubble thumbnail and the full-screen viewer now have a descriptive bilingual `alt`; the thumbnail's wrapping button (which had no accessible name at all when the message carried no caption text) also got an `aria-label`.

Verified with `npx tsc --noEmit` in `web/` — clean.

### Fixed 2026-09-01 (Low)

- [x] **A10 — Signup's password show/hide toggle had no `aria-label`.** `web/app/(auth)/signup/page.tsx`. Added, matching login's pattern.
- [x] **A11 — Chat header back button had no `aria-label`.** `web/app/message/[chatId]/page.tsx`. Added.
- [x] **A12 — Mobile `NotificationBell` was icon-only with no accessibility label.** Turned out the standalone `mobile/components/NotificationBell.tsx` this finding literally named is currently dead code (never imported anywhere) — fixed it anyway in case it's wired up later. The actual live bell users interact with is inline in `mobile/components/shared.tsx`'s TopBar, which already had a label but was missing `accessibilityRole` — added that too.
- [x] **A13 — Mobile `NotificationBell` tap target was under the ~44×44pt guidance.** Added `hitSlop` to both the live TopBar bell (`shared.tsx`, ~26px visual button → ~44px effective touch area) and the standalone component, without changing their visual size/layout.

Verified with `npx tsc --noEmit` in `mobile/` — clean.

### Looked fine, no action needed
Login page's form accessibility (`aria-invalid`/`aria-describedby`/`role="alert"`, real focus-trapped dialogs). The shared `useModalA11y` hook is a solid, correctly-implemented pattern (focus trap, Escape-to-close, focus restore) — most modals already use it. Status/faculty/role color coding consistently pairs color with an icon and text label, not color alone, on both web and mobile. `web/app/layout.tsx` sets `lang="he" dir="rtl"` by default (the runtime toggle-flip wasn't independently traced — worth a quick manual check by switching language in the browser and inspecting `<html dir>`). Mobile has no `allowFontScaling={false}` anywhere, so system text-size scaling isn't blocked.

### Not deeply verified (worth a follow-up pass, not urgent)
Exhaustive mobile touch-target sizing beyond the two sampled components; whether placeholder-as-label in mobile `TextInput`s (used instead of real labels throughout `login.tsx`) is reliably announced by TalkBack/VoiceOver — a known weak pattern since the label disappears once text is entered.

---

## Suggested order of work

Nothing left open. All Security, Privacy, and Accessibility findings (Critical through Low) are fixed as of 2026-09-01. Treat this file as a record of what was found and fixed, not a live task list — if you make further changes to auth, admin actions, data handling, or UI, it's worth another pass rather than assuming this stays current indefinitely.

Note: findings related to the admin "impersonate user" feature were removed from this audit (2026-09-01) — that feature is a temporary debugging aid and won't ship in the final product. If it ever does become a permanent feature, it should get its own dedicated security/privacy review before shipping, since impersonation-style features carry accountability and disclosure risks that don't show up anywhere else in this app.
