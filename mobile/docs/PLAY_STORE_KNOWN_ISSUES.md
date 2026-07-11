# Known Issues — v1.0.0

Internal tracking doc for the first Play Store submission. Not for publication — for your own reference and support-team briefing.

- **Some approval workflows are partially implemented.** Coordinator/program-head dashboards currently handle 2 of 6 approval types with real logic; the rest use provisional placeholder behavior and haven't been verified against live test accounts.
- **"Stuck"/urgency indicators on program-head dashboards are heuristic**, not yet tuned against real usage data — may over- or under-flag cases.
- **Excel import/export templates are incomplete.** Of the three sub-features (user import/export, project/thesis import/export, Maklol grade export), file templates are still pending for some flows.
- **Some non-critical actions may fail silently in edge cases.** A prior audit fixed the critical/high-severity cases (tab bar, 2FA setup, notification tap, dashboards, auth controller); a medium-severity tier of less-visible error handling gaps is still open.
- **No offline mode.** The app requires network connectivity; actions attempted offline will show a connection error rather than queuing for later.
- **Phone-first layout.** Tablet screens aren't specifically optimized; the app is usable but not visually tuned for larger screens.
