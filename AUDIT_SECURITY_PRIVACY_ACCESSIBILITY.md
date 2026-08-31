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
| High | 0 | 2 | 3 |
| Medium | 0 | 1 | 6 |
| Low | 0 | 1 | 4 |

Security's Medium/Low findings (S2, S4, S5, S6) are all fixed as of 2026-09-01 — see the Security section for details.

**If you only fix a few things first:** accessibility A1 (mobile app is nearly unusable with a screen reader) is the standout — everything else remaining is medium/low severity.

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

### High

- [ ] **P5 — Audit log is a 100-entry ring buffer, pruned hourly.** `server/src/services/auditLog.ts:130-149`. Every sensitive event type (role changes, grade changes, lockout lifts, password resets) shares one small ring buffer, so on an active day a record can be gone within hours.
- [ ] **P6 — "Erase user" dialog overstates what actually happens.** `web/app/admin/panel/UserRow.tsx:315-321` tells the admin the action "will permanently delete ... and all their data. This cannot be undone" — but `server/src/services/accountDeletion.ts:158-164` deliberately leaves chat messages, milestone/project references, and audit `oldValue`/`newValue` with that person's data intact. That's a defensible design choice, but the copy shown to the admin (and by extension what the org may represent to the deleted person) is inaccurate.

### Medium

- [ ] **P8 — Email vendor named generically ("our SMTP email provider") in the privacy policy** rather than by name, unlike every other processor listed. Should say "Brevo" for consistency with how the rest of the policy names its vendors.

### Low

- [ ] **P9 — "Erase project" only archives (soft-deletes, restorable).** `server/src/controllers/projectErasureController.ts:103`. Reasonable behavior, but the "Erase" naming implies destructive deletion — same category of issue as P6, smaller stakes.

### Looked fine, no action needed
Account deletion pipeline (`accountDeletion.ts`) is genuinely well-designed — 14-day grace period, 7-year post-graduation retention hold, eligibility re-checks, real `auth.deleteUser` + Firestore purge. No analytics/tracking scripts in `web/app` (no cookie-consent gap). Student-list endpoints spot-checked in `projectController.ts` return minimal fields, not full user documents.

---

## 3. Accessibility

### High

- [ ] **A1 — Mobile app: ~1,322 tappable controls (`TouchableOpacity`/`Pressable`) across 101 files, only 3 have `accessibilityLabel`, 0 have `accessibilityRole`.** This is the largest single finding in the whole audit. Concretely: `mobile/app/(auth)/login.tsx` has 5 unlabeled controls including a password show/hide toggle that's just an emoji (`🙈`/`👁️`); `mobile/app/coordinator/home.tsx` has 95 unlabeled `Pressable`s. VoiceOver/TalkBack users are blocked across nearly every mobile screen, not just isolated spots.
  - Fix: this needs a systematic sweep, not a spot fix. Start with auth screens and primary navigation, then work outward by frequency of use.
- [ ] **A2 — Web chat has no live region for new messages.** `web/app/message/[chatId]/page.tsx:186-224`. A screen reader gets no notification when a message arrives while the chat is open.
  - Fix: `role="log" aria-live="polite" aria-relevant="additions"` on the message list container.
- [ ] **A3 — Signup form errors aren't linked to their inputs.** `web/app/(auth)/signup/page.tsx:318-343`. Errors are plain unlinked `<p>` text; the login page does this correctly (`aria-invalid`/`aria-describedby`) but signup doesn't match it.

### Medium

- [ ] **A4 — `SessionExpiredModal` has no focus trap**, unlike every sibling modal in the app. `web/components/SessionExpiredModal.tsx:20-49`. All other modals route through the shared `useModalA11y` hook; this one doesn't, so a keyboard user can tab into hidden background content while it's showing.
- [ ] **A5 — Icon-only "✕" close buttons with no accessible name** in 5+ modals (`BulkImportModal.tsx`, `DeleteAccountModal.tsx`, `StudentContactModal.tsx`, `EditCommitteeModal.tsx`, `CommitteeReviewModal.tsx`, plus supervisor-dashboard modals).
- [ ] **A6 — Approval-chain expand/collapse toggle has no `aria-expanded`.** `web/components/MilestoneTimeline.tsx:416-418`.
- [ ] **A7 — Defense building picker has no group label or selected-state announcement** (`aria-pressed`). `web/components/DefenseBuildingPicker.tsx:20-41`. Same pattern for the Thesis/Track toggle in signup (`signup/page.tsx:434-446`).
- [ ] **A8 — Loading states are silent to assistive tech in most places** (bare "…" text, no `role="status"`/`aria-live`), even though the correct pattern already exists and is used in ~13 other files (e.g. `BulkDueDateModal.tsx`). Sampled and confirmed missing on student home and chat loading states.
- [ ] **A9 — Chat image attachments have `alt=""`** (marked decorative), so a screen reader skips them entirely and the user doesn't know an image was sent. `web/app/message/[chatId]/page.tsx:213,270`. Contrast with the 2FA QR code, which has a correct descriptive alt.

### Low

- [ ] **A10 — Signup's password show/hide toggle has no `aria-label`**, unlike the equivalent control on login. `signup/page.tsx:355-365` vs `login/page.tsx:427`.
- [ ] **A11 — Chat header back button has no `aria-label`** (bare arrow glyph), unlike `DashboardShell.tsx`'s back button. `message/[chatId]/page.tsx:170-172`.
- [ ] **A12 — Mobile `NotificationBell` is icon-only with no accessibility label**, unlike its web counterpart and unlike mobile's own `HeaderMenu.tsx` (which does set one).
- [ ] **A13 — Mobile `NotificationBell` tap target is under the ~44×44pt guidance** — no explicit width/height beyond the 22px glyph plus small margins.

### Looked fine, no action needed
Login page's form accessibility (`aria-invalid`/`aria-describedby`/`role="alert"`, real focus-trapped dialogs). The shared `useModalA11y` hook is a solid, correctly-implemented pattern (focus trap, Escape-to-close, focus restore) — most modals already use it. Status/faculty/role color coding consistently pairs color with an icon and text label, not color alone, on both web and mobile. `web/app/layout.tsx` sets `lang="he" dir="rtl"` by default (the runtime toggle-flip wasn't independently traced — worth a quick manual check by switching language in the browser and inspecting `<html dir>`). Mobile has no `allowFontScaling={false}` anywhere, so system text-size scaling isn't blocked.

### Not deeply verified (worth a follow-up pass, not urgent)
Exhaustive mobile touch-target sizing beyond the two sampled components; whether placeholder-as-label in mobile `TextInput`s (used instead of real labels throughout `login.tsx`) is reliably announced by TalkBack/VoiceOver — a known weak pattern since the label disappears once text is entered.

---

## Suggested order of work

1. **A1** (mobile accessibility labels) — largest gap in the whole audit, blocks a whole user population on a whole platform.
2. **P5, P6, P9** (audit log retention, erase-copy accuracy) — cheap, no code risk, closes a "we said X but do Y" gap before an employer or user notices it themselves.
3. Everything else, roughly in the severity order listed above.

All Security Medium/Low findings (S2, S4, S5, S6) are fixed — see the Security section.

Note: findings related to the admin "impersonate user" feature were removed from this audit (2026-09-01) — that feature is a temporary debugging aid and won't ship in the final product. If it ever does become a permanent feature, it should get its own dedicated security/privacy review before shipping, since impersonation-style features carry accountability and disclosure risks that don't show up anywhere else in this app.
