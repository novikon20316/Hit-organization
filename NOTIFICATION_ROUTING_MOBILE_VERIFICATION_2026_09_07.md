# Notification "Go to" Routing Fix — Mobile Verification Status

Date: 2026-09-07
Scope: `mobile/app/notification/[id].tsx`'s `targetRoute` fallback fix and the inline "Go to relevant screen" link, both part of the same-day work also applied to `web/app/notification/[id]/page.tsx` (see commits `10354a0`, `afec199`, `e4ef0f4`).

## What was verified

- **Web (live)**: reproduced the exact bug in the dev server — when the detail screen's own paging fetch (`getNotificationFeed`) fails or hasn't returned this notification yet, `targetRoute` was silently recomputed to a generic role-home route instead of falling back to the already-correct route passed in from the list. Confirmed the fix: after the change, clicking the link/button lands on `/coordinator/home?tab=pending` (rendering the Pending sub-view specifically), not the generic overview.
- **Mobile (code review only)**: `mobile/app/notification/[id].tsx` carries the identical one-line fix as web — `targetRoute` is now gated on `current` (the notification actually found in the freshly fetched list) rather than on `listReady` alone. Same file structure, same variable names, same bug shape. `npx tsc --noEmit` passes clean for both the routing fix and the inline-link addition.

## What was NOT verified

- No live click-through on the actual mobile screen. Attempted via the `mobile-web` Expo preview (`.claude/launch.json`), but `mobile/app/_layout.tsx`'s root-level auth guard redirects every route to `/(auth)/login` when unauthenticated, and no test-account credentials were available in this session (memory: passwords for test accounts aren't stored — ask the user before assuming).

## Suggested manual check

Log into the app (device or simulator) as any staff role, open a notification whose detail screen loads under a slow/offline paging fetch (or just any notification shortly after it's created), and confirm the "Go to relevant screen" link/button and the row's own "Go to dashboard" button both land on the specific tab — not a generic dashboard home.
